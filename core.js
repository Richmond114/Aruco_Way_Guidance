
'use strict';
// 与 Python 脚本使用的 DICT_ARUCO_ORIGINAL 对应。
const LOCATIONS = window.GUIDE_LOCATIONS || {
  0: {name: '一楼入口', message: '您已到达教学楼一楼入口。'},
  // 演示方向，实际使用前必须按现场路线配置；不代表摄像头测得的朝向。
  1: {name: '一楼电梯', message: '您目前位于一楼电梯附近。', direction: 'right'},
  2: {name: '一楼楼梯口', message: '您已到达一楼楼梯口，请注意台阶。'},
  3: {name: '二楼主走廊', message: '您目前位于二楼主走廊。', direction: 'left'},
  4: {name: '二楼教室', message: '您已到达二楼教室门口。'}
};
const $ = id => document.getElementById(id);
const video = $('video'), overlay = $('overlay');
const ctx = overlay.getContext('2d', {willReadFrequently: true});
const frame = document.createElement('canvas');
const frameCtx = frame.getContext('2d', {willReadFrequently: true});
let stream = null, detector = null, raf = null;
let lastScan = 0, currentId = null, candidateId = null, candidateCount = 0;
let announcedAt = 0;
let announcedItem = null;
let unknownCandidateId = null, unknownCandidateCount = 0;
const unknownAnnouncedAt = new Map();
let session = 0, starting = false;
let audioContext = null, toneBuffer = null, activeTone = null, playback = 0;
let spatialStatus = '空间音频尚未启用', speechStatus = '';
// 保留正在播放的 utterance，直到结束；避免移动浏览器提前回收对象。
let activeSpeech = null;
const DIRECTIONS = {left: '请左转。', right: '请右转。'};
let latestPose=null;
let normalQuality=window.LabPose?.MODES.relaxed,normalTracker=window.LabPose?.createTracker(normalQuality);
const normalDisplay=MeasurementDisplay.create({freshMs:1000,now:()=>performance.now()});
let poseWaitingText='等待测量';
function clearPose(message='等待测量',retain=false) {
  normalTracker?.reset();latestPose=null;
  poseWaitingText=retain?'等待测量':message;
  if(retain)normalDisplay.fail();else normalDisplay.reset();
  renderNormalPose();
}
function poseText() {
  const view=normalDisplay.read(),s=view.summary;
  if(!s)return '当前没有有效距离和角度，请对准标记重新测量。';
  const p=s.representative;
  const label=s.intervalMs?`${s.intervalMs/1000} 秒汇总，中位距离`:'实时原始距离';
  const prefix=view.historical?`上次测量，时间 ${s.windowEndTime}。`:'';
  const angles=p.method==='image-scale'?'角度暂不可用。':`对应样本距标记平面约 ${p.planeDistanceM.toFixed(2)} 米。倾斜角约 ${Math.round(p.tiltDeg)} 度，光轴与标记平面夹角约 ${Math.round(p.axisPlaneDeg)} 度。`;
  return `${prefix}标记 ID ${p.id}，${p.mode}。大概距离约 ${s.distanceM.toFixed(2)} 米（${label}）。时间 ${s.windowEndTime}。${angles}`;
}
function renderNormalPose(){
  const view=normalDisplay.read();
  if(!view.raw)latestPose=null;
  const text=view.summary?poseText():poseWaitingText;
  if($('pose-result').textContent!==text)$('pose-result').textContent=text;
  const p=view.raw;
  $('normal-raw').textContent=p?`${p.method==='image-scale'?'图像尺度粗估':'位姿求解'}；ID ${p.id}；原始斜距 ${p.distanceM.toFixed(4)} m；重投影 RMS ${p.reprojectionPx==null?'不适用':p.reprojectionPx.toFixed(3)+' px'}；时间 ${p.time}`:'当前无有效原始测量';
}
function updatePose(marker,w,h) {
  if(!window.MarkerPose || !normalTracker) {clearPose('姿态模块加载失败，请检查 pose.js 和 lab-pose.js');return;}
  if(!marker) {clearPose('等待测量',true);return;}
  try {
    // 可在 LOCATIONS 中为不同安装标记设置 sizeMm，否则使用页面的测试尺寸。
    const mm=LOCATIONS[marker.id].sizeMm ?? Number($('marker-mm').value);
    if(!Number.isFinite(mm)||mm<10||mm>2000) throw Error('请填写 10–2000 mm 的实际边长');
    let k,mode;
    const raw=$('camera-intrinsics').value.trim();
    if(raw) {
      const c=JSON.parse(raw);
      if(!['width','height','fx','fy','cx','cy'].every(key=>Number.isFinite(c[key])) ||
         c.width<=0||c.height<=0||c.fx<=0||c.fy<=0||c.cx<0||c.cx>c.width||c.cy<0||c.cy>c.height)
        throw Error('内参需包含有效 width、height、fx、fy、cx、cy');
      if(Math.abs((c.width/c.height)/(w/h)-1)>.02) throw Error('内参画幅与当前视频不同，请重新标定');
      k={fx:c.fx*w/c.width,fy:c.fy*h/c.height,cx:c.cx*w/c.width,cy:c.cy*h/c.height};
      mode='已输入内参的估计（未校正畸变）';
    } else {
      const fov=Number($('camera-fov').value);
      if(!Number.isFinite(fov)||fov<20||fov>120) throw Error('视场角需为 20–120 度');
      const f=w/(2*Math.tan(fov*Math.PI/360));
      k={fx:f,fy:f,cx:w/2,cy:h/2};mode='未标定粗估';
    }
    // Restore corners and intrinsics to actual video pixels before applying thresholds.
    const vw=video.videoWidth||w,vh=video.videoHeight||h;
    const rawCorners=LabPose.pointsToVideo(marker.corners,vw,vh,w,h);
    k={fx:k.fx*vw/w,fy:k.fy*vh/h,cx:k.cx*vw/w,cy:k.cy*vh/h};
    const edge=LabPose.minEdge(rawCorners);
    const camera=stream?.getVideoTracks?.()?.[0]?.getSettings?.();
    const contextKey=JSON.stringify([marker.id,mm,k,normalQuality,session,vw,vh,w,h,camera?.deviceId,camera?.zoom]);
    if(normalDisplay.context(contextKey))normalTracker.reset();
    let pose=MarkerPose.estimate(rawCorners,mm/1000,k,{...normalQuality,minEdgePx:normalQuality.holdPx});
    if(!pose && normalQuality===LabPose.MODES.relaxed && window.ScaleDistance)
      pose=ScaleDistance.estimate(rawCorners,mm/1000,k);
    const quality=normalTracker.step({edge,valid:!!pose});
    if(!quality.ready) {
      latestPose=null;
      poseWaitingText='等待测量';normalDisplay.fail();renderNormalPose();
      return;
    }
    latestPose={...pose,id:marker.id,mode:normalQuality.label+'，'+mode,time:new Date().toISOString()};
    normalDisplay.push(contextKey,latestPose);poseWaitingText='等待测量';renderNormalPose();
  } catch(e) {clearPose('测量设置无效：'+e.message);}
}
function status(s) { $('status').textContent=s; }
function audioStatus(spatial, speech = speechStatus) {
  spatialStatus=spatial; speechStatus=speech;
  $('audio-status').textContent=[spatialStatus,speechStatus].filter(Boolean).join('；');
  const routeStatus=$('route-speech-status');
  if(routeStatus)routeStatus.textContent=speechStatus||'点击“重听路线提示”可再次播放中文。';
}
function cancelPrompt() {
  playback++;
  if (activeTone) activeTone.cancel();
  const synth=window.speechSynthesis,job=activeSpeech;
  activeSpeech=null;
  if(job){clearTimeout(job.watchdog);clearTimeout(job.retry);}
  // 不对空队列反复 cancel；部分手机的原生 TTS 会把紧接着的新播报也取消。
  if(job||synth?.speaking||synth?.pending){
    try{synth?.cancel();}catch(e){/* 保留文字提示 */}
    audioStatus(spatialStatus,'播报已停止');
  }
}
function within(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {timer=setTimeout(()=>reject(new Error('音频启动超时')),milliseconds);})
  ]).finally(()=>clearTimeout(timer));
}
// 必须在点击事件中调用，以便移动端允许音频播放。失败不阻断摄像头。
async function prepareAudio(token) {
  try {
    const AudioContextClass=window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('不支持 Web Audio');
    if (!audioContext || audioContext.state==='closed') {
      audioContext=new AudioContextClass();
      toneBuffer=null;
    }
    // 在用户手势期间同时恢复上下文并播放一个静音样本。
    const resumed=audioContext.state==='running' ? Promise.resolve() : audioContext.resume();
    const unlock=audioContext.createBufferSource();
    unlock.buffer=audioContext.createBuffer(1,1,audioContext.sampleRate);
    unlock.connect(audioContext.destination);
    unlock.onended=()=>unlock.disconnect();
    unlock.start();
    await within(resumed,1500);
    if (audioContext.state!=='running') throw new Error('播放受限');
    if (token===playback) audioStatus('空间音频已就绪，请使用双声道耳机');
    return true;
  } catch(e) {
    if (token===playback) audioStatus('空间音频不可用，将使用语音和文字提示');
    return false;
  }
}
function makeToneBuffer() {
  const rate=audioContext.sampleRate;
  const buffer=audioContext.createBuffer(1,Math.ceil(rate*0.6),rate);
  const samples=buffer.getChannelData(0);
  for (let i=0;i<samples.length;i++) {
    const t=i/rate;
    const pulse=t<0.24 ? t : t-0.34;
    if (pulse>=0 && pulse<0.24) {
      const envelope=Math.min(pulse/0.02,1,(0.24-pulse)/0.04);
      samples[i]=Math.sin(2*Math.PI*660*pulse)*envelope*0.22;
    }
  }
  return buffer;
}
// 独立的方向播放接口；未来可由 IMU/路线判断层提供 direction。
function playDirection(direction, token) {
  if (direction!=='left' && direction!=='right') return Promise.resolve(false);
  if (token!==playback) return Promise.resolve(false);
  return new Promise(resolve => {
    let source, panner, watchdog, finished=false;
    const finish=(completed) => {
      if (finished) return;
      finished=true; clearTimeout(watchdog);
      if (source) {
        source.onended=null;
        try {source.stop();} catch(e) { /* 已停止 */ }
        source.disconnect();
      }
      panner?.disconnect();
      if (activeTone?.cancel===cancel) activeTone=null;
      resolve(completed);
    };
    const cancel=()=>finish(false);
    try {
      if (!audioContext || audioContext.state!=='running') throw new Error('音频未就绪');
      panner=audioContext.createPanner();
      panner.panningModel='HRTF';
      panner.distanceModel='inverse';
      // 默认听者位于原点、面向 -Z；X 正方向为听者右侧。
      const x=direction==='right' ? 1 : -1;
      if (panner.positionX) {
        panner.positionX.value=x; panner.positionY.value=0; panner.positionZ.value=0;
      } else {panner.setPosition(x,0,0);}
      source=audioContext.createBufferSource();
      source.buffer=toneBuffer || (toneBuffer=makeToneBuffer());
      source.connect(panner); panner.connect(audioContext.destination);
      activeTone={cancel};
      source.onended=()=>finish(true);
      // 系统中断或挂起时也应释放提示并恢复语音降级。
      watchdog=setTimeout(()=>{
        if (token===playback) audioStatus('方向音播放中断，将使用语音和文字提示');
        finish(false);
      },1800);
      source.start();
    } catch(e) {
      if (token===playback) audioStatus('空间音频不可用，将使用语音和文字提示');
      finish(false);
    }
  });
}
function speak(message, token) {
  if (token!==playback) return;
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    audioStatus(spatialStatus,'浏览器不支持语音合成，请查看文字提示'); return;
  }
  const synth=window.speechSynthesis;
  const job={utterance:null,watchdog:null,retry:null,attempt:0};
  activeSpeech=job;
  const current=()=>token===playback&&activeSpeech===job;
  const release=()=>{clearTimeout(job.watchdog);clearTimeout(job.retry);if(activeSpeech===job)activeSpeech=null;};
  const failure=code=>{
    const reasons={
      'not-allowed':'浏览器阻止了语音，请点击“重听路线提示”',
      'language-unavailable':'手机没有可用的中文语音，请检查系统文字转语音设置',
      'voice-unavailable':'所选中文语音不可用，请检查系统文字转语音设置',
      'synthesis-unavailable':'系统语音引擎不可用',
      'audio-busy':'音频正在被其他应用占用',
      'network':'语音服务网络连接失败'
    };
    audioStatus(spatialStatus,(reasons[code]||'语音播放失败，请点击“重听路线提示”')+(code?'（'+code+'）':''));
  };
  const attempt=()=>{
    if(!current())return;
    let started=false;
    try {
      const utterance=new SpeechSynthesisUtterance(message);
      job.utterance=utterance;
      utterance.lang='zh-CN';utterance.rate=0.92;utterance.volume=1;
      const voices=synth.getVoices?.()||[];
      const voice=voices.find(v=>/^zh[-_]CN$/i.test(v.lang))||voices.find(v=>/^zh\b/i.test(v.lang));
      if(voice){utterance.voice=voice;utterance.lang=voice.lang;}
      const valid=()=>current()&&job.utterance===utterance;
      utterance.onstart=()=>{if(valid()){started=true;clearTimeout(job.watchdog);audioStatus(spatialStatus,'正在播报中文');}};
      utterance.onend=()=>{if(valid()){release();audioStatus(spatialStatus,'本次语音播放结束');}};
      utterance.onerror=event=>{
        if(!valid())return;
        clearTimeout(job.watchdog);
        const code=event?.error||'';
        // 仅对尚未开始的原生引擎取消/失败重试一次；停止和新站会使旧 token 失效。
        if(!started&&job.attempt===0&&['canceled','interrupted','synthesis-failed'].includes(code)){
          job.attempt++;job.utterance=null;
          audioStatus(spatialStatus,'正在重新启动语音');
          job.retry=setTimeout(attempt,200);return;
        }
        release();failure(code);
      };
      audioStatus(spatialStatus,'正在请求中文语音');
      job.watchdog=setTimeout(()=>{
        if(!valid()||started)return;
        release();try{synth.cancel();}catch(e){}
        audioStatus(spatialStatus,'未收到语音启动确认，请点击“重听路线提示”；仍无声时请尝试 Chrome');
      },6000);
      if(synth.paused)synth.resume?.();
      synth.speak(utterance);
    } catch(e) {if(current()){release();failure('');}}
  };
  attempt();
}
function locationMessage(item) {
  return item.message+(item.directionInMessage ? '' : (DIRECTIONS[item.direction] || ''));
}
async function promptLocation(item, unlock=false) {
  cancelPrompt();
  const token=playback;
  // 自动识别不重试解锁；重播按钮允许通过用户手势恢复音频。
  // 无方向音时，在点击回调中直接启动语音，不等待 Web Audio 的异步恢复。
  if (unlock&&!DIRECTIONS[item.direction]){speak(locationMessage(item),token);return;}
  if (unlock) await prepareAudio(token);
  if (token!==playback) return;
  if (DIRECTIONS[item.direction]) await playDirection(item.direction,token);
  speak(locationMessage(item),token);
}
function replayLocationSpeech(item) {
  cancelPrompt();
  // 手动恢复优先保证中文播报，跳过方向音及其异步等待。
  speak(locationMessage(item),playback);
}
async function testDirection(direction) {
  cancelPrompt();
  const token=playback;
  const ready=await prepareAudio(token);
  if (token!==playback) return;
  if (ready) await playDirection(direction,token);
  speak((direction==='left' ? '左侧试听。' : '右侧试听。')+DIRECTIONS[direction],token);
}
function announce(id) {
  // 路线层先解析当前节点，避免旧地点语音先于路线提示播放。
  // 返回 null 可暂缓确认；此时不更新节流时间，待路线准备好后重试。
  let item;
  try {
    item=typeof window.resolveGuideLocation==='function' ? window.resolveGuideLocation(id) : LOCATIONS[id];
  } catch(e) {
    status('导览信息暂不可用，请重新确认路线。');
    return false;
  }
  if(!item)return false;
  currentId=id; announcedAt=Date.now(); announcedItem=item;
  $('place').textContent=item.name;
  $('detail').textContent=locationMessage(item);
  status(`已识别标记 ID ${id}`);
  void promptLocation(item);
  if(typeof CustomEvent!=='undefined') window.dispatchEvent(new CustomEvent('guide-recognized',{detail:{id,item}}));
  return true;
}
function scan(t) {
  if (!stream) return;
  raf=requestAnimationFrame(scan);
  if (video.readyState < 2) {clearPose('等待摄像头画面',true);return;}
  if (t-lastScan < 180) return;
  lastScan=t;
  const w=480, h=Math.max(1,Math.round(w*(video.videoHeight/video.videoWidth)));
  if (frame.width!==w || frame.height!==h) {frame.width=overlay.width=w; frame.height=overlay.height=h;}
  frameCtx.drawImage(video,0,0,w,h);
  let markers=[];
  try { markers=detector.detect(frameCtx.getImageData(0,0,w,h)); }
  catch(e) {clearPose('等待测量',true);status('识别出现错误：'+e.message); return;}
  ctx.clearRect(0,0,w,h);
  markers.forEach(m => {
    ctx.beginPath(); m.corners.forEach((c,i)=>i?ctx.lineTo(c.x,c.y):ctx.moveTo(c.x,c.y));ctx.closePath();
    ctx.lineWidth=3;ctx.strokeStyle='#8afbc2';ctx.stroke();
    ctx.font='bold 22px sans-serif';ctx.fillStyle='#fff';
    ctx.fillText('ID '+m.id,m.corners[0].x,m.corners[0].y-8);
  });
  // 防误触：至少连续两次检测到同一个已登记 ID。
  const match=markers.find(m=>Object.prototype.hasOwnProperty.call(LOCATIONS,m.id));
  if (!match) {
    clearPose('等待测量',true);candidateId=null;candidateCount=0;
    const unknown=markers[0];
    if(!unknown){unknownCandidateId=null;unknownCandidateCount=0;return;}
    if(unknownCandidateId===unknown.id)unknownCandidateCount++;
    else {unknownCandidateId=unknown.id;unknownCandidateCount=1;}
    const now=Date.now(),previous=unknownAnnouncedAt.get(unknown.id);
    if(unknownCandidateCount>=2 && (previous===undefined || now-previous>30000)) {
      unknownAnnouncedAt.set(unknown.id,now);
      // 未登记码不成为当前位置、不播报旧路线；由界面决定如何提示。
      if(typeof CustomEvent!=='undefined')window.dispatchEvent(new CustomEvent('guide-unknown',{detail:{id:unknown.id}}));
    }
    return;
  }
  unknownCandidateId=null;unknownCandidateCount=0;
  if (candidateId===match.id) candidateCount++;else {candidateId=match.id;candidateCount=1;}
  if(candidateCount>=2 || normalQuality?.confirmFrames===1) updatePose(match,w,h); else clearPose('正在确认标记');
  if (candidateCount>=2 && (currentId!==match.id || Date.now()-announcedAt > 30000)) {
     announce(match.id);
  }
}
async function start() {
  if(stream || starting) return;
  if(typeof AR==='undefined' || typeof CV==='undefined') {status('识别库加载失败，请检查网络连接');return;}
  if (!navigator.mediaDevices?.getUserMedia) {status('需要 HTTPS 或 localhost 才能启用摄像头');return;}
  starting=true;
  const ticket=++session;
  $('start').disabled=true; $('stop').disabled=false;
  cancelPrompt();
  const audioReady=prepareAudio(playback);
  try {
    detector=new AR.Detector({dictionaryName:'ARUCO'});
    const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
    if (ticket!==session) {acquired.getTracks().forEach(t=>t.stop());return;}
    stream=acquired;
    video.srcObject=stream;await video.play();
    await audioReady;
    if (ticket!==session) return;
    $('view').classList.add('active');$('start').disabled=true;$('stop').disabled=false;
    currentId=null;announcedItem=null;candidateId=null;candidateCount=0;lastScan=0;
    unknownCandidateId=null;unknownCandidateCount=0;unknownAnnouncedAt.clear();
    status('摄像头已启动，正在寻找标记…');
    void promptLocation({message:'位置识别已开启，请缓慢移动手机，对准附近的标记。'});
    raf=requestAnimationFrame(scan);
  } catch(e) {
    if (ticket!==session) return;
    stop(); status('启动失败：'+e.message);
  } finally {if (ticket===session) starting=false;}
}
function stop() {
  clearPose('识别已停止，测量已清除');
  session++; starting=false;
  cancelPrompt();
  if(raf!==null)cancelAnimationFrame(raf); raf=null;
  if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
  video.srcObject=null;ctx.clearRect(0,0,overlay.width,overlay.height);
  $('view').classList.remove('active');$('start').disabled=false;$('stop').disabled=true;
  status('识别已停止');
}
$('start').addEventListener('click',start);
$('stop').addEventListener('click',stop);
$('normal-interval').addEventListener('change',()=>{normalDisplay.setInterval(Number($('normal-interval').value));clearPose('更新间隔已切换，等待测量');});
setInterval(renderNormalPose,100);
$('read-pose').addEventListener('click',()=>void promptLocation({message:poseText()}));
['marker-mm','camera-fov','camera-intrinsics'].forEach(id=>$(id).addEventListener('input',()=>clearPose('设置已更新，等待重新测量')));
$('normal-quality').addEventListener('change',()=>{
  if(!window.LabPose)return;
  normalQuality=LabPose.MODES[$('normal-quality').value]||LabPose.MODES.relaxed;
  normalTracker=LabPose.createTracker(normalQuality);clearPose('模式已切换，正在测距');
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
$('repeat').addEventListener('click',()=>void promptLocation(
  currentId===null ? {message:'尚未识别到位置。'} : (announcedItem || LOCATIONS[currentId]),true));
$('test-left').addEventListener('click',()=>void testDirection('left'));
$('test-right').addEventListener('click',()=>void testDirection('right'));
$('cancel-audio').addEventListener('click',()=>{
  cancelPrompt(); audioStatus('提示已停止；识别期间遇到新标记仍会播放提示','');
});
window.addEventListener('pagehide',stop);
