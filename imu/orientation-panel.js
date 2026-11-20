import {imuReceiver} from './receiver.js';
import {OrientationTracker} from './orientation.js';

export const orientationTracker = new OrientationTracker();
const panel = document.createElement('section');
panel.className = 'card';
panel.setAttribute('aria-labelledby', 'orientation-title');
panel.innerHTML = `<h3 id="orientation-title">相对朝向 · 阶段 3 测试</h3>
  <p class="hint">固定胸前模块，身体直立。记录起始朝向后，身体缓慢向右转约 90°，再确认右转。此操作学习安装方向；不可只转动手机或模块。更换佩戴方式后须重新校准。</p>
  <div class="buttons"><button id="orientation-begin">记录起始朝向</button><button id="orientation-finish">已向右转约 90°</button><button id="orientation-zero">以当前方向归零</button><button id="orientation-reset">清除校准</button></div>
  <label>目标方向（相对于起始/归零朝向，右正左负）<input id="orientation-target" type="number" min="-180" max="180" step="1" value="90"></label>
  <div class="buttons"><button id="orientation-left">左转 90°</button><button id="orientation-right">右转 90°</button><button id="orientation-set">设置目标</button></div>
  <p id="orientation-status" role="status"></p>
  <p id="orientation-values"></p><p id="orientation-source"></p>
  <p class="hint">仅显示水平转向，不播放音频、不推进路线。右转校准结束后，当前相对转角应约 +90°；可回正后设置目标，或先归零。BLE 超时/断线后需要重新完成校准。</p>`;
document.getElementById('imu-panel').append(panel);
const el = id => document.getElementById('orientation-' + id);
const labels = {uncalibrated: '未校准', calibrating: '已记录起点，等待向右转', ready: '朝向有效',
  invalid: '姿态无效或倾斜过大，请恢复直立并检查数据', stale: '数据超时，请重新校准', disconnected: '已断开，请连接并重新校准'};
let message = '';
function render() {
  const s = orientationTracker.snapshot(), fresh = imuReceiver.snapshot().usable;
  const status = message || labels[s.state];
  if (el('status').textContent !== status) el('status').textContent = status;
  el('begin').disabled = !fresh;
  el('finish').disabled = !fresh || s.state !== 'calibrating';
  for (const id of ['zero', 'left', 'right', 'set']) el(id).disabled = !s.usable;
  el('values').textContent = s.usable
    ? `身体相对转角 ${s.headingDeg.toFixed(1)}°；目标 ${s.targetDeg === null ? '未设置' : s.targetDeg.toFixed(1) + '°'}；相对目标 ${s.relativeTargetDeg === null ? '—' : s.relativeTargetDeg.toFixed(1) + '°'}`
    : '身体相对转角 —；相对目标 —';
  const a = s.relativeTargetDeg;
  const direction = a === null ? '' : Math.abs(a) <= 8 ? '正前方范围' : Math.abs(a) >= 172 ? '正后方'
    : `${a > 0 ? '右' : '左'}${Math.abs(a) < 82 ? '前方' : Math.abs(a) <= 98 ? '侧' : '后方'}`;
  el('source').textContent = s.source
    ? `声源应位于${direction}；坐标 x=${s.source.x.toFixed(3)}, y=0, z=${s.source.z.toFixed(3)}` : '声源方向 —';
}
function action(id, run) {
  el(id).addEventListener('click', () => {
    try { run(); message = ''; console.info('[IMU orientation]', id, orientationTracker.snapshot()); }
    catch (error) { message = error.message; console.warn('[IMU orientation]', message); }
    render();
  });
}
action('begin', () => orientationTracker.beginCalibration());
action('finish', () => orientationTracker.finishRightTurn());
action('zero', () => orientationTracker.zero());
action('reset', () => orientationTracker.reset());
action('left', () => { el('target').value = '-90'; orientationTracker.setTarget(-90); });
action('right', () => { el('target').value = '90'; orientationTracker.setTarget(90); });
action('set', () => {
  if (!el('target').value.trim()) throw new Error('请填写目标角度。');
  orientationTracker.setTarget(Number(el('target').value));
});
imuReceiver.addEventListener('packet', ({detail}) => {
  orientationTracker.update(detail.packet, detail.time); render();
});
imuReceiver.addEventListener('freshness', ({detail}) => {
  if (['stale', 'disconnected'].includes(detail.freshness)) {
    orientationTracker.reset(detail.freshness); message = '';
    console.info('[IMU orientation]', detail.freshness);
  }
  render();
});
imuReceiver.addEventListener('invalid', () => {
  orientationTracker.reset('invalid'); message = ''; render();
});
setInterval(render, 250);
render();
