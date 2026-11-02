const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function setup({audio=true,speech=true,resumeFails=false,camera}={}) {
  const spoken=[],sources=[],panners=[],timers=new Map(),elements=new Map();
  let clock=1000,timerId=0,detected=[],stoppedTracks=0;
  const drawing={clearRect(){},drawImage(){},getImageData(){return {};},beginPath(){},
    lineTo(){},moveTo(){},closePath(){},stroke(){},fillText(){}};
  function element(id) {
    if (!elements.has(id)) elements.set(id,{
      textContent:'',value:'',disabled:false,readyState:2,videoWidth:640,videoHeight:480,
      classList:{add(){},remove(){}},getContext:()=>drawing,
      addEventListener(name,callback){this[name]=callback;},play:async()=>{}
    });
    return elements.get(id);
  }
  class AudioContext {
    constructor(){this.state='suspended';this.sampleRate=48000;this.destination={};}
    resume(){if(resumeFails)return Promise.reject(Error('blocked'));this.state='running';return Promise.resolve();}
    createBuffer(channels,length){return {length,getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){
      const source={connect(){},disconnect(){this.disconnected=true;},
        start(){this.started=true;},stop(){this.stopped=true;}};
      sources.push(source);return source;
    }
    createPanner(){const panner={positionX:{},positionY:{},positionZ:{},connect(){},disconnect(){}};
      panners.push(panner);return panner;}
  }
  const tracks=[{stop(){stoppedTracks++;}}];
  const context={document:{getElementById:element,createElement:()=>element('frame'),addEventListener(){}},
    navigator:{mediaDevices:{getUserMedia:camera || (async()=>({getTracks:()=>tracks}))}},
    AR:{Detector:class {detect(){return detected;}}},CV:{},
    Date:{now:()=>clock},Math,Promise,Float32Array,
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},
    clearTimeout(id){timers.delete(id);},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    addEventListener(){}};
  if(audio)context.AudioContext=AudioContext;
  if(speech){context.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    context.speechSynthesis={cancel(){},speak(utterance){spoken.push(utterance);}};}
  context.window=context;
  context.MarkerPose=require('../pose.js');
  context.LabPose=require('../lab-pose.js');
  element('marker-mm').value='50';element('camera-fov').value='60';
  vm.createContext(context);vm.runInContext(script,context);
  return {run:code=>vm.runInContext(code,context),element,spoken,sources,panners,timers,
    get stoppedTracks(){return stoppedTracks;},
    detect(id){detected=id===null?[]:[{id,corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}];},
    advance(ms){clock+=ms;},endTone(){sources.findLast(s=>s.buffer.length>1 && !s.stopped)?.onended?.();}};
}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}

test('right/left HRTF tone finishes before the corresponding Chinese instruction',async()=>{
  const app=setup();
  await app.run('prepareAudio(playback)');
  for(const [id,x,phrase] of [[1,1,'请右转。'],[3,-1,'请左转。']]){
    const count=app.spoken.length;
    const pending=app.run(`promptLocation(LOCATIONS[${id}])`);
    assert.equal(app.panners.at(-1).positionX.value,x);
    assert.equal(app.panners.at(-1).panningModel,'HRTF');
    assert.equal(app.sources.at(-1).buffer.length,28800);
    assert.equal(app.spoken.length,count);
    app.endTone();await pending;
    assert.ok(app.spoken.at(-1).text.endsWith(phrase));
  }
});

test('locations without direction speak immediately without a directional tone',async()=>{
  const app=setup();
  await app.run('promptLocation(LOCATIONS[2])');
  assert.equal(app.panners.length,0);
  assert.equal(app.spoken[0].text,'您已到达一楼楼梯口，请注意台阶。');
});

test('a newer marker cancels the old tone and prevents its delayed instruction',async()=>{
  const app=setup();await app.run('prepareAudio(playback)');
  const old=app.run('promptLocation(LOCATIONS[1])');
  const oldSource=app.sources.at(-1);
  const next=app.run('promptLocation(LOCATIONS[3])');
  assert.equal(oldSource.stopped,true);
  assert.equal(oldSource.disconnected,true);
  app.endTone();await Promise.all([old,next]);
  assert.deepEqual(app.spoken.map(s=>s.text),['您目前位于二楼主走廊。请左转。']);
});

test('stop and pagehide cancel pending tones and speech continuations',async()=>{
  const app=setup();await app.run('prepareAudio(playback)');
  const pending=app.run('promptLocation(LOCATIONS[1])');
  app.run('stop()');await pending;
  assert.equal(app.spoken.length,0);
  assert.equal(app.timers.size,0);
  assert.equal(app.element('status').textContent,'识别已停止');
  assert.match(script,/addEventListener\('pagehide',stop\)/);
});

test('manual replay includes both the last direction and its full message',async()=>{
  const app=setup();await app.run('prepareAudio(playback)');
  app.run('announce(1)');app.endTone();await flush();
  app.spoken.length=0;
  app.element('repeat').click();await flush();
  assert.equal(app.spoken.length,0);
  app.endTone();await flush();
  assert.equal(app.spoken[0].text,'您目前位于一楼电梯附近。请右转。');
});

test('rapid audition clicks only speak the newest direction, without a camera',async()=>{
  const app=setup();
  const left=app.run("testDirection('left')");
  const right=app.run("testDirection('right')");
  await flush();app.endTone();await Promise.all([left,right]);
  assert.equal(app.panners.length,1);
  assert.equal(app.panners[0].positionX.value,1);
  assert.deepEqual(app.spoken.map(s=>s.text),['右侧试听。请右转。']);
});

test('unsupported Web Audio and rejected resume retain spoken directions',async()=>{
  for(const options of [{audio:false},{resumeFails:true}]){
    const app=setup(options);
    await app.run('promptLocation(LOCATIONS[1],true)');
    assert.ok(app.spoken[0].text.endsWith('请右转。'));
    assert.match(app.element('audio-status').textContent,/空间音频不可用/);
  }
});

test('missing or failed speech keeps the visible instruction and directional sound',async()=>{
  const app=setup({speech:false});await app.run('prepareAudio(playback)');
  app.run('announce(3)');app.endTone();await flush();
  assert.equal(app.panners.length,1);
  assert.match(app.element('detail').textContent,/请左转/);
  assert.match(app.element('audio-status').textContent,/不支持语音合成/);
  const errorApp=setup();await errorApp.run('promptLocation(LOCATIONS[0])');
  errorApp.spoken[0].onerror();
  assert.match(errorApp.element('audio-status').textContent,/语音播放失败/);
});

test('an interrupted tone times out and falls back to speech',async()=>{
  const app=setup();await app.run('prepareAudio(playback)');
  const pending=app.run('promptLocation(LOCATIONS[1])');
  [...app.timers.values()].find(t=>t.delay===1800).fn();await pending;
  assert.match(app.element('audio-status').textContent,/播放中断/);
  assert.ok(app.spoken[0].text.endsWith('请右转。'));
});

test('scanning requires two detections and preserves the 30-second throttle',async()=>{
  const app=setup({audio:false});await app.run('start()');app.spoken.length=0;
  app.detect(1);app.run('scan(200)');assert.equal(app.spoken.length,0);
  app.run('scan(400)');await flush();assert.equal(app.spoken.length,1);
  app.run('scan(600)');await flush();assert.equal(app.spoken.length,1);
  app.advance(30001);app.run('scan(800)');await flush();assert.equal(app.spoken.length,2);
  app.detect(90);app.run('scan(1000)');await flush();assert.equal(app.spoken.length,2);
  app.run('stop()');assert.equal(app.stoppedTracks,1);
});

test('camera rejection leaves audition usable, and stop cancels pending camera startup',async()=>{
  const denied=setup({camera:async()=>{throw Error('permission denied');}});
  await denied.run('start()');
  assert.match(denied.element('status').textContent,/启动失败/);
  assert.equal(denied.element('start').disabled,false);
  const audition=denied.run("testDirection('right')");await flush();denied.endTone();await audition;
  assert.ok(denied.spoken.at(-1).text.endsWith('请右转。'));
  let acquire,stops=0;
  const app=setup({camera:()=>new Promise(resolve=>{acquire=resolve;})});
  const pending=app.run('start()');app.run('stop()');
  acquire({getTracks:()=>[{stop(){stops++;}}]});await pending;
  assert.equal(stops,1);assert.equal(app.spoken.length,0);
  assert.equal(app.element('video').srcObject,null);
});

test('pose display uses the configured physical size and rejects stale or lost readings',()=>{
  const app=setup();
  app.element('camera-intrinsics').value=JSON.stringify({width:480,height:360,fx:500,fy:500,cx:240,cy:180});
  const marker={id:1,corners:[{x:215,y:155},{x:265,y:155},{x:265,y:205},{x:215,y:205}]};
  app.run(`for(let i=0;i<3;i++)updatePose(${JSON.stringify(marker)},480,360)`);
  assert.match(app.element('pose-result').textContent,/0.50 米/);
  assert.match(app.element('pose-result').textContent,/倾斜角约 0 度/);
  app.advance(1001);
  assert.match(app.run('poseText()'),/没有有效距离/);
  app.run('updatePose(null,480,360)');
  assert.equal(app.run('latestPose'),null);
});

test('invalid intrinsics and size changes clear measurements without stopping navigation',()=>{
  const app=setup();
  app.element('camera-intrinsics').value='invalid json';
  app.run('updatePose({id:1,corners:[]},480,360)');
  assert.match(app.element('pose-result').textContent,/测量设置无效/);
  app.element('marker-mm').input();
  assert.match(app.element('pose-result').textContent,/设置已更新/);
  app.run('stop()');
  assert.match(app.element('pose-result').textContent,/测量已清除/);
});
test('normal-page loose mode confirms a small marker, switching mode clears its reading',()=>{
  const app=setup();
  app.element('camera-intrinsics').value=JSON.stringify({width:480,height:360,fx:500,fy:500,cx:240,cy:180});
  const marker={id:1,corners:[{x:236.625,y:176.625},{x:243.375,y:176.625},{x:243.375,y:183.375},{x:236.625,y:183.375}]};
  const update=`updatePose(${JSON.stringify(marker)},480,360)`;
  app.run(update);assert.equal(app.run('latestPose'),null);
  app.run(update);assert.equal(app.run('latestPose'),null);
  app.run(update);assert.match(app.element('pose-result').textContent,/粗略测距/);
  assert.ok(app.run('latestPose.distanceM')>0);
  app.element('normal-quality').value='strict';app.element('normal-quality').change();
  assert.equal(app.run('latestPose'),null);
  for(let i=0;i<3;i++)app.run(update);
  assert.equal(app.run('latestPose'),null);
  assert.match(app.element('pose-result').textContent,/像素尺寸不足/);
});
