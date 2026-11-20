import {imuReceiver} from './receiver.js';
import './orientation-panel.js';

const $ = id => document.getElementById('imu-' + id);
const client = imuReceiver;
const stats = client.stats;
let latest = null, latestHex = '', lastState = '', connectionError = '', lastInvalidLog = -Infinity, connectedAt = null;
const groups = {quaternion: ['w', 'x', 'y', 'z'], euler: ['Roll', 'Pitch', 'Yaw'], accel: ['x', 'y', 'z'], gyro: ['x', 'y', 'z']};
for (const [id, labels] of Object.entries(groups)) {
  for (const label of labels) {
    const item = document.createElement('div');
    const title = document.createElement('span'); title.className = 'value-label'; title.textContent = label;
    const value = document.createElement('span'); value.className = 'value-number'; value.textContent = '—';
    item.append(title, value); $(id).append(item);
  }
}
function values(id, numbers) {
  $(id).querySelectorAll('.value-number').forEach((el, i) => {
    const number = numbers?.[i];
    el.textContent = number === undefined ? '—' : Math.abs(number) > 9999 ? number.toExponential(3) : (Math.abs(number) < 0.00005 ? 0 : number).toFixed(4);
  });
}
function log(message) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString('zh-CN', {hour12: false})}  ${message}`;
  $('logs').prepend(li);
  while ($('logs').children.length > 50) $('logs').lastElementChild.remove();
}
function clearReadings() {
  latest = null; latestHex = '';
  for (const id of Object.keys(groups)) values(id, null);
  $('norm').textContent = '—'; $('format').textContent = '—'; $('sequence').textContent = '采样序号 —';
  $('raw').textContent = '尚未收到数据'; $('copy').disabled = true;
  $('euler-note').textContent = '等待完整数据包';
  $('accel-note').textContent = '传感器原始坐标系 · 未去除重力';
  $('gyro-note').textContent = '传感器原始坐标系';
}
function renderReadings() {
  if (!latest) return;
  values('quaternion', latest.quaternion);
  const degrees = $('angle-unit').value === 'deg';
  values('euler', latest.euler?.map(value => degrees ? value * 180 / Math.PI : value));
  values('accel', latest.accel); values('gyro', latest.gyro);
  $('norm').textContent = latest.norm.toFixed(5);
  $('format').textContent = latest.type === 2 ? '完整包 · 56 B' : '四元数 · 20 B';
  $('sequence').textContent = `采样序号 ${latest.sequence}`;
  $('euler-note').textContent = latest.euler ? 'Roll / Pitch / Yaw · 原始数据为弧度' : '当前四元数包未提供欧拉角';
  $('accel-note').textContent = latest.accel ? '传感器原始坐标系 · 未去除重力' : '当前四元数包未提供加速度';
  $('gyro-note').textContent = latest.gyro ? '传感器原始坐标系' : '当前四元数包未提供角速度';
  $('raw').textContent = latestHex; $('copy').disabled = false;
}
const stateLabels = {disconnected: '未连接', selecting: '选择设备中', connecting: '正在连接', connected: '已连接 · 已订阅', disconnecting: '正在断开', error: '连接失败'};
const supported = window.isSecureContext && !!navigator.bluetooth && (document.permissionsPolicy?.allowsFeature('bluetooth') ?? true);
if (!supported) {
  $('environment').hidden = false;
  $('environment').textContent = !window.isSecureContext
    ? '当前地址不是安全上下文。手机请使用受信任的 HTTPS 地址；电脑可通过 localhost 预览。'
    : '当前环境未提供 Web Bluetooth。请在 Android Chrome 中直接打开此页面，避免应用内浏览器或受限的嵌入预览。';
}
client.addEventListener('state', ({detail}) => {
  $('status').textContent = stateLabels[detail.state]; $('status').className = `badge ${detail.state}`;
  $('device-name').textContent = detail.name;
  $('connect').disabled = !supported || detail.busy || detail.state === 'connected';
  $('reconnect').disabled = !supported || detail.busy || !detail.known || detail.state === 'connected';
  $('disconnect').disabled = !['connected', 'connecting'].includes(detail.state);
  if (['selecting', 'connecting'].includes(detail.state) && !['selecting', 'connecting'].includes(lastState)) {
    clearReadings(); connectionError = '';
  }
  if (['disconnected', 'error'].includes(detail.state)) clearReadings();
  if (detail.state === 'connected' && lastState !== 'connected') connectedAt = performance.now();
  if (detail.state !== lastState) log(stateLabels[detail.state]);
  lastState = detail.state;
  updateStatus();
});
client.addEventListener('packet', ({detail}) => {
  latest = detail.packet; latestHex = detail.hex;
  connectionError = '';
  renderReadings(); updateStatus();
});
client.addEventListener('invalid', ({detail}) => {
  if (performance.now() - lastInvalidLog >= 1000) { log(`已丢弃无效包：${detail.message}`); lastInvalidLog = performance.now(); }
  updateStatus();
});
client.addEventListener('error', ({detail}) => { connectionError = detail; log(detail); updateStatus(); });
client.addEventListener('message', ({detail}) => log(detail));
function updateStatus() {
  client.checkFreshness();
  const now = performance.now(), connected = client.state === 'connected';
  const stale = connected && stats.stale(now);
  $('rate').textContent = (connected ? stats.rate(now) : 0).toFixed(1);
  $('count').textContent = stats.valid.toLocaleString(); $('invalid').textContent = stats.invalid;
  $('duplicates').textContent = stats.duplicates;
  $('readings').classList.toggle('stale', stale);
  const age = stats.lastReceived === null ? null : Math.max(0, now - stats.lastReceived);
  $('freshness').textContent = !connected ? '等待连接' : age === null ? '已订阅 · 等待数据' : stale ? `已 ${(age / 1000).toFixed(1)} 秒未更新` : `最近更新 ${Math.round(age)} ms 前`;
  let notice = connectionError;
  if (!notice && connected && age === null && now - connectedAt > 3000) notice = '已订阅，但尚未收到有效数据。请检查 ESP32 串口日志、IMU 接线和固件版本。';
  if (!notice && stale) notice = '数据已超过 500 ms 未更新，当前显示最后有效值。请检查 ESP32 串口与 IMU 接线。';
  if (!notice && latest && Math.abs(latest.norm - 1) > 0.1) notice = '四元数模长偏离 1 超过 0.1，请核对传感器数据。页面保留原始值。';
  if (!notice && latest?.type === 1) notice = '当前连接收到 20 字节四元数包。其余测量未包含在包内；浏览器与系统协商较大 MTU 后，固件会自动发送完整包。';
  $('alert').hidden = !notice; $('alert').textContent = notice;
  $('connection-hint').textContent = connected
    ? '通知已自动开启。缓慢转动 IMU，观察原始测量值与有效接收频率。'
    : client.busy ? '请等待浏览器连接完成；连接中可点击“断开”取消。'
      : '先断开 nRF Connect，再点击连接，选择 ArUco-IMU-C3。';
}
$('connect').disabled = !supported;
$('connect').addEventListener('click', () => { connectionError = ''; void client.connect(true); });
$('reconnect').addEventListener('click', () => { connectionError = ''; void client.connect(false); });
$('disconnect').addEventListener('click', () => client.disconnect());
$('angle-unit').addEventListener('change', renderReadings);
$('clear-log').addEventListener('click', () => $('logs').replaceChildren());
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(latestHex); log('已复制最新有效包 HEX'); }
  catch { log('无法访问剪贴板，请从原始数据区域手动复制'); }
});
window.addEventListener('pagehide', () => client.disconnect());
setInterval(updateStatus, 250);
updateStatus();
