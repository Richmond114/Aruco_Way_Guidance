const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../measurement-display.js');
function setup(intervalMs=1000){
 let t=0;const d=create({intervalMs,now:()=>t,freshMs:600});
 return {d,at:value=>{t=value;},push:(value,id='A')=>d.push(id,{distanceM:value,time:`T${t}`,tiltDeg:value*10})};
}
test('first result is immediate, raw remains realtime, median suppresses a single spike',()=>{
 const a=setup();assert.equal(a.push(1).summary.distanceM,1);
 a.at(200);a.push(1.1);a.at(400);a.push(99);a.at(600);a.push(1.2);
 assert.equal(a.d.read().summary.distanceM,1);assert.equal(a.d.read().raw.distanceM,1.2);
 a.at(1000);const v=a.push(1.3);
 assert.equal(v.summary.distanceM,1.2);assert.equal(v.summary.sampleCount,5);
 assert.equal(v.summary.representative.tiltDeg,12);
 assert.equal(v.summary.method,'median');
});
test('2-second mode updates at two seconds, not one; realtime bypasses aggregation',()=>{
 const a=setup(2000);a.push(1);
 for(const t of [400,800,1200,1600]){a.at(t);a.push(2);assert.equal(a.d.read().summary.distanceM,1);}
 a.at(2000);assert.equal(a.push(2).summary.distanceM,2);
 a.d.setInterval(0);a.at(2100);assert.equal(a.push(3).summary.distanceM,3);
 a.at(2110);const v=a.push(4);assert.equal(v.summary.distanceM,4);assert.equal(v.summary.sampleCount,1);assert.equal(v.summary.method,'raw');
});
test('even sample median has a real representative pose; ties prefer newest',()=>{
 const a=setup();a.push(1);a.at(500);a.push(3);a.at(1000);
 const v=a.d.read();assert.equal(v.summary.distanceM,2);assert.equal(v.summary.representative.distanceM,3);
});
test('one valid sample is enough for a window, and old samples are trimmed',()=>{
 const a=setup();a.push(8);a.at(1200);a.push(2);
 assert.equal(a.d.read().summary.sampleCount,1);assert.equal(a.d.read().summary.distanceM,2);
});
test('failure invalidates raw immediately, delays status 800 ms, expires at three seconds',()=>{
 const a=setup();a.push(1);a.at(100);let v=a.d.fail();
 assert.equal(v.raw,null);assert.equal(v.historical,false);assert.equal(v.summary.distanceM,1);
 a.at(799);assert.equal(a.d.fail().historical,false);
 a.at(800);assert.equal(a.d.fail().historical,true);
 a.at(2999);assert.ok(a.d.fail().summary);
 a.at(3000);assert.equal(a.d.fail().summary,null);
 a.at(3100);assert.equal(a.push(2).summary.distanceM,2);
});
test('recent successful samples extend availability without changing displayed timestamps',()=>{
 const a=setup();a.push(1);a.at(500);a.push(2);a.at(600);a.d.fail();
 a.at(3000);assert.ok(a.d.read().summary);
 assert.equal(a.d.read().summary.windowEndTime,'T0');
 a.at(3500);assert.equal(a.d.read().summary,null);
});
test('silent frame stalls expire raw validity and history independently',()=>{
 const a=setup();a.push(1);a.at(601);assert.equal(a.d.read().raw,null);
 assert.equal(a.d.read().historical,false);a.at(800);assert.equal(a.d.read().historical,true);
 a.at(3000);assert.equal(a.d.read().summary,null);
});
test('alternating failure frames do not flicker status or drop the distance',()=>{
 const a=setup();a.push(1);
 for(let t=150;t<9000;t+=150){a.at(t);const v=t%300===0?a.push(1.1):a.d.fail();assert.ok(v.summary);assert.equal(v.historical,false);}
});
test('a failed frame at the boundary still publishes valid window samples and counts methods',()=>{
 const a=setup();a.push(1);a.at(400);a.d.push('A',{distanceM:2,time:'T400',method:'image-scale',tiltDeg:null});
 a.at(1000);const v=a.d.fail();assert.equal(v.raw,null);assert.equal(v.summary.distanceM,1.5);
 assert.equal(v.summary.methodCounts.pose,1);assert.equal(v.summary.methodCounts['image-scale'],1);
 assert.equal(v.summary.representative.tiltDeg,null);assert.equal(v.historical,false);
});
test('historical status is latched until the next publication when recovery occurs',()=>{
 const a=setup(2000);a.push(1);a.at(900);assert.equal(a.d.fail().historical,true);
 a.at(1000);assert.equal(a.push(2).historical,true);
 a.at(1900);a.push(2);a.at(2000);assert.equal(a.d.read().historical,false);
});
test('target/configuration/interval resets do not mix samples or retain history',()=>{
 const a=setup();a.push(90,'old');a.at(200);assert.equal(a.push(1,'new').summary.distanceM,1);
 assert.equal(a.d.context('different-settings'),true);assert.equal(a.d.read().summary,null);
 a.push(2,'different-settings');a.d.setInterval(2000);assert.equal(a.d.read().raw,null);assert.equal(a.d.read().summary,null);
 a.push(3);a.d.reset();assert.equal(a.d.read().summary,null);
});
