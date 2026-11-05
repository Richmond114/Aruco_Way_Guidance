const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(track){
 const elements=new Map(),observers=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',setAttribute(k,v){this[k]=v;},addEventListener(k,f){this[k]=f;}});return elements.get(id);};
 const c={stream:track?{getVideoTracks:()=>[track]}:null,currentId:null,document:{getElementById:el},MutationObserver:class{constructor(f){observers.push(f);}observe(){}}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../guide-ui.js'),'utf8'),c);
 return {el,c,refresh:()=>observers.forEach(f=>f())};
}
test('torch requires a supported camera; replay is hidden until a location exists',()=>{
 const a=setup();assert.equal(a.el('torch').disabled,true);assert.equal(a.el('repeat').hidden,true);
 a.c.currentId=1;a.refresh();assert.equal(a.el('repeat').hidden,false);
 const b=setup({getCapabilities:()=>({})});assert.equal(b.el('torch').disabled,true);
});
test('torch toggles camera constraints and resets on camera stop',async()=>{
 const requests=[];const a=setup({getCapabilities:()=>({torch:true}),applyConstraints:async c=>requests.push(c.advanced[0].torch)});
 assert.equal(a.el('torch').disabled,false);await a.el('torch').click();
 assert.equal(requests[0],true);assert.equal(a.el('torch')['aria-pressed'],'true');
 await a.el('torch').click();assert.equal(requests[1],false);
 a.c.stream=null;a.refresh();assert.equal(a.el('torch').disabled,true);
});
