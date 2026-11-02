const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../lab-pose.js');
const calibration={schemaVersion:1,id:'synthetic',width:1280,height:720,cameraMatrix:[[900,0,640],[0,910,360],[0,0,1]],distCoeffs:[.06,-.02,.001,-.002,0],rmsPx:0,board:{innerCols:9,innerRows:6,squareMm:20}};
test('calibration validation rejects missing fields and mismatched resolution',()=>{
 assert.throws(()=>L.validate({},1280,720));assert.throws(()=>L.validate(calibration,640,360));assert.equal(L.validate(calibration,1280,720).id,'synthetic');
});
test('actual OpenCV.js: distorted synthetic corners, millimetres, order and resize',async()=>{
 const cv=require('../../.cache/opencv-lab.js'); await new Promise(resolve=>cv.then(()=>resolve()));
 for(const mm of [30,80])for(const z of [.5,1,1.5,2]){
  const mats=[];const mat=(r,c,t,data)=>{const m=cv.matFromArray(r,c,t,data);mats.push(m);return m;};
  try{
   const obj=mat(4,1,cv.CV_64FC3,L.objectPoints(mm)),K=mat(3,3,cv.CV_64F,calibration.cameraMatrix.flat()),D=mat(5,1,cv.CV_64F,calibration.distCoeffs);
   const rv=mat(3,1,cv.CV_64F,[2.8,.15,.1]),tv=mat(3,1,cv.CV_64F,[.08,.03,z]),out=new cv.Mat();mats.push(out);cv.projectPoints(obj,rv,tv,K,D,out);
   const corners=Array.from({length:4},(_,i)=>({x:out.data64F[2*i],y:out.data64F[2*i+1]}));
   const resized=corners.map(p=>({x:p.x/2,y:p.y/2}));
   const restored=L.pointsToVideo(resized,1280,720,640,360);
   const p=L.solve(cv,restored,mm,calibration);
   assert.ok(Math.abs(p.distanceM-Math.hypot(.08,.03,z))<1e-5);
   assert.ok(p.rmsPx<1e-5);
   const rotated=[...restored.slice(1),restored[0]],q=L.solve(cv,rotated,mm,calibration);
   assert.ok(Math.abs(q.distanceM-p.distanceM)<1e-5);
  }finally{mats.forEach(m=>m.delete());}
 }
});

test('lab lifecycle clears lost measurements and releases camera on hide',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),elements=new Map(),handlers={};let stopped=0;
 const pen={clearRect(){},drawImage(){},getImageData(){return {};}};
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,options:[],getContext:()=>pen,readyState:2,videoWidth:1280,videoHeight:720});return elements.get(id);};
 const ctx={document:{getElementById:element,createElement:()=>element('canvas'),addEventListener:(name,fn)=>handlers[name]=fn,hidden:false},LabPose:L,performance:{now:()=>1000},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setInterval(){},setTimeout(){},console,Date,window:{addEventListener(){}}};
 vm.createContext(ctx);vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../lab.js'),'utf8'),ctx);
 ctx.track={stop(){stopped++;}};
 vm.runInContext('stream={getTracks:()=>[track]}; detector={detect:()=>[]}; current={distanceM:1}; scan(200)',ctx);
 assert.equal(vm.runInContext('current',ctx),null);assert.equal(element('pose').textContent,'当前无有效测距');
 ctx.document.hidden=true;handlers.visibilitychange();assert.equal(stopped,1);assert.equal(element('video').srcObject,null);
});
