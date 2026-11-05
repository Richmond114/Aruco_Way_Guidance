const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../scale-distance.js');
const k={fx:900,fy:910,cx:640,cy:360};
function corners(sizeM,z,x=0,y=0){return [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([a,b])=>({x:k.fx*(x+a*sizeM)/z+k.cx,y:k.fy*(y+b*sizeM)/z+k.cy}));}
test('scale approximation recovers front-facing slant distance and has no invented pose',()=>{
 for(const size of [.03,.08])for(const z of [.5,1,1.5,2]){
  const p=S.estimate(corners(size,z,.1,.05),size,k);
  assert.ok(Math.abs(p.distanceM-Math.hypot(z,.1,.05))<1e-10);
  for(const key of ['tvec','rvec','translation','tiltDeg','axisPlaneDeg','planeDistanceM','rmsPx'])assert.equal(p[key],null);
  assert.equal(p.method,'image-scale');
 }
});
test('corner cycling, pixel resizing, and physical units are consistent',()=>{
 const c=corners(.05,1.7),p=S.estimate(c,.05,k);
 assert.equal(S.estimate([...c.slice(1),c[0]],.05,k).distanceM,p.distanceM);
 const half=c.map(p=>({x:p.x/2,y:p.y/2})),kh=Object.fromEntries(Object.entries(k).map(([key,v])=>[key,v/2]));
 assert.equal(S.estimate(half,.05,kh).distanceM,p.distanceM);
 assert.ok(Math.abs(S.estimate(c,.1,k).distanceM-2*p.distanceM)<1e-10);
});
test('unusable corners, invalid intrinsics, and excessive distance do not produce results',()=>{
 assert.equal(S.estimate(Array(4).fill({x:0,y:0}),.05,k),null);
 const c=corners(.05,1);[c[1],c[2]]=[c[2],c[1]];assert.equal(S.estimate(c,.05,k),null);
 assert.equal(S.estimate(corners(.05,1),.05,{...k,fx:0}),null);
 assert.equal(S.estimate(corners(.05,1),.05,k,()=>[null,null,null,null]),null);
 assert.equal(S.estimate(corners(.05,200),.05,k),null);
});
test('actual OpenCV inverse projection corrects all supported coefficient lengths',async()=>{
 const cv=require('../../.cache/opencv-lab.js');await new Promise(resolve=>cv.then(()=>resolve()));
 for(const n of [4,5,8,12,14]){
  const dist=[.14,-.04,.003,-.002,.01,.002,-.001,.001,.0001,-.0001,.0001,-.0001,.02,-.01].slice(0,n);
  const c={cameraMatrix:[[900,0,640],[0,910,360],[0,0,1]],distCoeffs:dist};
  const obj=cv.matFromArray(4,1,cv.CV_64FC3,[-.04,-.04,0,.04,-.04,0,.04,.04,0,-.04,.04,0]);
  const zero=cv.matFromArray(3,1,cv.CV_64F,[0,0,0]),t=cv.matFromArray(3,1,cv.CV_64F,[.2,.1,.7]);
  const K=cv.matFromArray(3,3,cv.CV_64F,c.cameraMatrix.flat()),D=cv.matFromArray(n,1,cv.CV_64F,dist),out=new cv.Mat();
  try{
   cv.projectPoints(obj,zero,t,K,D,out);
   const pixels=Array.from({length:4},(_,i)=>({x:out.data64F[2*i],y:out.data64F[2*i+1]}));
   const normalized=S.normalizedCorners(cv,pixels,c);
   normalized.forEach((p,i)=>{assert.ok(p);assert.ok(Math.abs(p.x-(obj.data64F[3*i]+.2)/.7)<.1/900);});
   const p=S.estimate(pixels,.08,k,()=>normalized);
   assert.ok(Math.abs(p.distanceM-Math.hypot(.2,.1,.7))<.002);
   const broken=Object.create(cv);
   broken.projectPoints=(_a,_b,_c,_d,_e,target)=>{target.create(3,1,cv.CV_64FC2);target.data64F.fill(100);};
   assert.equal(S.estimate(pixels,.08,k,points=>S.normalizedCorners(broken,points,c)),null);
  }finally{[obj,zero,t,K,D,out].forEach(m=>m.delete());}
 }
});
