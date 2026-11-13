const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../core.js'),'utf8');

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
    Date:class extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}},performance:{now:()=>clock},Math,Promise,Float32Array,setInterval(){},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},
    clearTimeout(id){timers.delete(id);},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    addEventListener(){}};
  if(audio)context.AudioContext=AudioContext;
  if(speech){context.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    context.speechSynthesis={cancel(){},speak(utterance){spoken.push(utterance);}};}
  context.window=context;
  context.MeasurementDisplay=require('../measurement-display.js');
  context.MarkerPose=require('../pose.js');
  context.ScaleDistance=require('../scale-distance.js');
  context.LabPose=require('../lab-pose.js');
  element('marker-mm').value='50';element('camera-fov').value='60';
  vm.createContext(context);vm.runInContext(script,context);
  return {run:code=>vm.runInContext(code,context),element,spoken,sources,panners,timers,
    get stoppedTracks(){return stoppedTracks;},
    detect(id){detected=id===null?[]:[{id,corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}];},
    advance(ms){clock+=ms;},endTone(){sources.findLast(s=>s.buffer.length>1 && !s.stopped)?.onended?.();}};
}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}

test('P1–P5 map to IDs 0–4 and speak the requested route without spatial audio',async()=>{
 const app=setup();
 const expected=[/门槛.*门外走廊/,/门外走廊.*左转九十度/,/直行.*两到三米/,/电梯间门口.*右转/,/电梯前.*乘坐电梯/];
 for(let id=0;id<5;id++){
  await app.run(`promptLocation(LOCATIONS[${id}],true)`);
  assert.match(app.spoken.at(-1).text,expected[id]);
  assert.ok(app.run(`LOCATIONS[${id}].name`).startsWith(`P${id+1}`));
 }
 assert.equal(app.sources.length,0);assert.equal(app.panners.length,0);
});
test('first decoded frame speaks immediately, continuous visibility never restarts it',async()=>{
 const app=setup();await app.run('start()');app.spoken.length=0;
 app.detect(1);app.run('scan(200)');assert.equal(app.spoken.length,1);
 assert.match(app.spoken[0].text,/左转九十度/);
 for(let i=1;i<220;i++){app.advance(180);app.run(`scan(${200+i*180})`);}
 assert.equal(app.spoken.length,1);
 app.detect(2);app.run('scan(40000)');assert.equal(app.spoken.length,2);
 assert.match(app.spoken[1].text,/两到三米/);
 assert.equal(app.sources.length,0);assert.equal(app.panners.length,0);
});
test('brief dropout is silent, two-second absence rearms same marker; unknown IDs are ignored',async()=>{
 const app=setup();await app.run('start()');app.spoken.length=0;
 app.detect(0);app.run('scan(200)');
 app.detect(null);app.advance(500);app.run('scan(400)');
 app.detect(0);app.run('scan(600)');assert.equal(app.spoken.length,1);
 app.detect(null);app.advance(2000);app.run('scan(800)');
 app.detect(0);app.run('scan(1000)');assert.equal(app.spoken.length,2);
 app.detect(99);app.run('scan(1200)');assert.equal(app.spoken.length,2);
});
test('manual replay speaks complete route immediately and stop cancels speech',async()=>{
 const app=setup();app.run('announce(3)');app.spoken.length=0;
 app.element('repeat').click();assert.equal(app.spoken.length,1);
 assert.match(app.spoken[0].text,/电梯间门口.*右转/);
 app.run('stop()');assert.equal(app.element('status').textContent,'识别已停止');
 assert.equal(app.sources.length,0);assert.equal(app.panners.length,0);
});
test('prototype speech works without Web Audio and spatial test buttons only speak',async()=>{
 const app=setup({audio:false});await app.run('promptLocation(LOCATIONS[1],true)');
 assert.match(app.spoken[0].text,/左转九十度/);
 await app.run("testDirection('right')");assert.match(app.spoken.at(-1).text,/停用空间音频/);
 assert.equal(app.sources.length,0);assert.equal(app.panners.length,0);
});
test('speech failure keeps route text and does not require successful distance estimation',()=>{
 const app=setup({speech:false});
 app.run('announce(4)');assert.match(app.element('detail').textContent,/电梯前/);
 assert.match(app.element('audio-status').textContent,/不支持语音合成/);
 assert.equal(app.sources.length,0);
});

test('camera rejection leaves audition usable, and stop cancels pending camera startup',async()=>{
  const denied=setup({camera:async()=>{throw Error('permission denied');}});
  await denied.run('start()');
  assert.match(denied.element('status').textContent,/启动失败/);
  assert.equal(denied.element('start').disabled,false);
  const audition=denied.run("testDirection('right')");await flush();denied.endTone();await audition;
  assert.match(denied.spoken.at(-1).text,/停用空间音频/);
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
  assert.match(app.run('poseText()'),/上次测量/);
  app.advance(2000);assert.match(app.run('poseText()'),/没有有效距离/);
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
  app.element('normal-quality').value='coarse';app.element('normal-quality').change();
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
  assert.match(app.element('pose-result').textContent,/等待测量/);
});
test('normal-page default relaxed mode displays a tiny solvable marker immediately',()=>{
  const app=setup();
  app.element('camera-intrinsics').value=JSON.stringify({width:480,height:360,fx:500,fy:500,cx:240,cy:180});
  const marker={id:1,corners:[{x:238.3,y:178.3},{x:241.7,y:178.3},{x:241.7,y:181.7},{x:238.3,y:181.7}]};
  app.run(`updatePose(${JSON.stringify(marker)},480,360)`);
  assert.ok(app.run('latestPose.distanceM')>0);
  assert.match(app.element('pose-result').textContent,/超宽松粗估/);
  app.run('updatePose(null,480,360)');assert.equal(app.run('latestPose'),null);
});
test('normal summary voice labels historical readings and clears them after three seconds',()=>{
 const app=setup();
 app.run("latestPose={id:1,mode:'粗估',distanceM:1,planeDistanceM:.9,tiltDeg:20,axisPlaneDeg:70,reprojectionPx:.1,time:new Date().toISOString()};normalDisplay.push('test',latestPose);renderNormalPose()");
 assert.match(app.run('poseText()'),/大概距离约 1.00/);
 app.run("clearPose('等待测量',true)");
 assert.equal(app.run('latestPose'),null);assert.doesNotMatch(app.element('pose-result').textContent,/上次测量，时间/);
 app.advance(800);app.run('renderNormalPose()');assert.match(app.element('pose-result').textContent,/上次测量，时间/);
 app.element('read-pose').click();assert.match(app.spoken.at(-1).text,/上次测量，时间/);
 app.advance(2200);app.run('renderNormalPose()');assert.equal(app.element('pose-result').textContent,'等待测量');
 app.element('normal-interval').value='0';app.element('normal-interval').change();
 assert.equal(app.run('normalDisplay.read().summary'),null);
});
test('normal relaxed mode falls back to distance only, strict mode does not',()=>{
 const app=setup();
 app.run('MarkerPose={estimate:()=>null}');
 const marker={id:1,corners:[{x:200,y:140},{x:280,y:140},{x:280,y:220},{x:200,y:220}]};
 app.run(`updatePose(${JSON.stringify(marker)},480,360)`);
 assert.equal(app.run('latestPose.method'),'image-scale');
 assert.match(app.element('pose-result').textContent,/角度暂不可用/);
 assert.doesNotMatch(app.element('pose-result').textContent,/0 度/);
 app.element('read-pose').click();assert.match(app.spoken.at(-1).text,/角度暂不可用/);
 app.element('normal-quality').value='strict';app.element('normal-quality').change();
 for(let i=0;i<4;i++)app.run(`updatePose(${JSON.stringify(marker)},480,360)`);
 assert.equal(app.run('latestPose'),null);
});
