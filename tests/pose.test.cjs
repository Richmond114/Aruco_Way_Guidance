const {test}=require('node:test');
const assert=require('node:assert/strict');
const {estimate}=require('../pose.js');
const k={fx:600,fy:610,cx:320,cy:240};
function project(size,angle,t,intrinsics=k) {
  const a=angle*Math.PI/180;
  return [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,y])=>{
    const X=t[0]+size*x*Math.cos(a),Y=t[1]+size*y,Z=t[2]-size*x*Math.sin(a);
    return {x:intrinsics.fx*X/Z+intrinsics.cx,y:intrinsics.fy*Y/Z+intrinsics.cy};
  });
}
for(const angle of [0,15,35,60,-45]) test(`synthetic ${angle} degree pose recovers metric distance and angle`,()=>{
  const p=estimate(project(.08,angle,[.1,-.05,.65]),.08,k);
  assert.ok(p);
  assert.ok(Math.abs(p.distanceM-Math.hypot(.1,.05,.65))<1e-8);
  assert.ok(Math.abs(p.tiltDeg-Math.abs(angle))<1e-5);
  assert.ok(Math.abs(p.axisPlaneDeg-(90-Math.abs(angle)))<1e-5);
  assert.ok(p.reprojectionPx<1e-7);
});
test('size scales distances, not orientation; cyclic corner rotation preserves measurements',()=>{
  const c=project(.05,30,[0,0,.6]),p=estimate(c,.05,k),q=estimate(c,.1,k);
  assert.ok(Math.abs(q.distanceM-2*p.distanceM)<1e-8);
  const rotated=estimate([...c.slice(1),c[0]],.05,k);
  assert.ok(Math.abs(rotated.tiltDeg-p.tiltDeg)<1e-8);
});
test('resized image and resized intrinsics yield identical metric pose',()=>{
  const c=project(.08,25,[.1,0,.7]),small=c.map(p=>({x:p.x/2,y:p.y/2}));
  const scaled=Object.fromEntries(Object.entries(k).map(([key,v])=>[key,v/2]));
  assert.ok(Math.abs(estimate(c,.08,k).distanceM-estimate(small,.08,scaled).distanceM)<1e-9);
});
test('degenerate, tiny, invalid, and non-convex detections are rejected',()=>{
  assert.equal(estimate(Array(4).fill({x:20,y:20}),.05,k),null);
  assert.equal(estimate(project(.005,0,[0,0,1]),.005,k),null);
  assert.equal(estimate(project(.05,0,[0,0,.5]),NaN,k),null);
  const c=project(.05,0,[0,0,.5]);[c[1],c[2]]=[c[2],c[1]];
  assert.equal(estimate(c,.05,k),null);
});
