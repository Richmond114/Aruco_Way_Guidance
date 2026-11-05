const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 let t=0;const elements=new Map(),events={};
 const pen={clearRect(){},drawImage(){},getImageData(){return {};},beginPath(){},lineTo(){},moveTo(){},fillText(){},closePath(){},stroke(){}};
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',options:[],append(o){this.options.push(o);},getContext:()=>pen});return elements.get(id);};
 const c={MeasurementDisplay:require('../measurement-display.js'),ScaleDistance:require('../scale-distance.js'),LabPose:require('../lab-pose.js'),performance:{now:()=>t},document:{getElementById:el,createElement:()=>el('canvas'),addEventListener:(n,f)=>events[n]=f},window:{addEventListener(){}},setInterval(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},Date};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../lab.js'),'utf8'),c);
 const run=code=>vm.runInContext(code,c);
 return {el,run,at:v=>{t=v;},forcePoseFailure(){c.LabPose={...c.LabPose,solve(){throw Error('位姿无解');}};c.cv={solvePnP(){}};c.window.cv=c.cv;},sample(distance){run(`cal={rmsPx:.2};current={id:1,distanceM:${distance},time:'T${t}',monotonic:${t},rmsPx:.1,tvec:[0,0,${distance}],qualityMode:'超宽松粗估',calibrationId:'test',sizeMm:50};display.push('same',current);renderPose();`);}};
}
test('experiment record retains raw value and adds median display metadata',()=>{
 const a=setup();a.sample(1);a.at(200);a.sample(9);a.at(400);a.sample(1.2);a.at(1000);a.sample(1.3);
 assert.match(a.el('pose').textContent,/大概距离约 1.25/);
 assert.match(a.el('raw-pose').textContent,/1.3000/);
 a.el('reference').value='1.25';a.el('record').onclick();
 const record=a.run('records[0]');assert.equal(record.distanceM,1.3);assert.equal(record.displaySummary.distanceM,1.25);
 assert.equal(record.displaySummary.method,'median');assert.equal(record.displaySummary.sampleCount,4);
 assert.equal(record.displaySummary.intervalMs,1000);
 a.at(1200);a.run('pending()');assert.doesNotMatch(a.el('pose').textContent,/上次测量/);
 a.at(1800);a.run('renderPose()');assert.match(a.el('pose').textContent,/上次测量/);
 a.at(4000);a.el('record').onclick();assert.equal(a.run('records.length'),1);
 a.run('renderPose()');assert.equal(a.el('pose').textContent,'等待测量');
});
test('experiment page falls back on pose failure, renders nulls, and exports the method',()=>{
 const a=setup();a.forcePoseFailure();
 Object.assign(a.el('video'),{readyState:2,videoWidth:640,videoHeight:480});
 a.el('target').value='1';a.el('size').value='50';
 a.run("cal={schemaVersion:1,id:'cal',width:640,height:480,cameraMatrix:[[500,0,320],[0,500,240],[0,0,1]],distCoeffs:[0,0,0,0,0],rmsPx:.2,board:{innerCols:9,innerRows:6,squareMm:20}};stream={getTracks:()=>[]};detector={detect:()=>[{id:1,corners:[{x:280,y:200},{x:360,y:200},{x:360,y:280},{x:280,y:280}]}]};scan(200)");
 assert.equal(a.run('current.method'),'image-scale');assert.match(a.el('raw-pose').textContent,/角度暂不可用/);
 a.el('reference').value='.31';a.el('record').onclick();
 const r=a.run('records[0]');assert.equal(r.tvec,null);assert.equal(r.rvec,null);assert.equal(r.displaySummary.methodCounts['image-scale'],1);
 a.el('quality-mode').value='strict';a.el('quality-mode').onchange();a.run('scan(400)');
 assert.equal(a.run('current'),null);assert.equal(a.run('display.read().summary'),null);
});
test('switching interval and target clears both displayed and raw values',()=>{
 const a=setup();a.sample(1);a.el('display-interval').value='2000';a.el('display-interval').onchange();
 assert.equal(a.run('current'),null);assert.equal(a.run('display.read().summary'),null);
 a.sample(2);assert.match(a.el('pose').textContent,/2 秒汇总/);
 a.el('target').onchange();assert.equal(a.run('display.read().summary'),null);
 a.sample(3);a.run('stop()');assert.equal(a.run('display.read().summary'),null);
});
