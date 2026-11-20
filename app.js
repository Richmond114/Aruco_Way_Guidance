(()=>{
'use strict';
const plan=window.GUIDE_PLAN,el=id=>document.getElementById(id),pages=el('pages');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(action,text,cls='primary')=>'<button class="'+cls+'" data-go="'+action+'">'+text+'</button>';
const talk=text=>void promptLocation({message:text},true);
const load=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}};
const store=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};
const saveKey='xunjing-tour-v1',contentKey='xunjing-content:'+plan.planId;
const ui={page:'home',engine:null,demo:false,last:null,torch:false,aligned:false,scanTimer:0};
const marker=id=>plan.markers.find(m=>m.id===id);
const route=()=>plan.routes.full;
const segment=(from,to)=>plan.segments.find(s=>s.from===from&&s.to===to);
const state=()=>ui.engine?.snapshot();
const time=t=>t?new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚未确认';
function makeEngine(saved){return TourEngine.create({planId:plan.planId,routeId:'full',order:route().order,markers:plan.markers},saved)}
function savedTour(){const saved=load(saveKey);return saved&&makeEngine(saved).snapshot().awaitingReconfirmation?saved:null}
const spokenName=m=>m.name.replace(/／.*$/,'').replace(/停靠$/,'');
const spokenDistance=m=>Number(m.toFixed(1))+' 米';
function walkingInstruction(leg){
 const turn=leg.turn==='left'?'请左转，':leg.turn==='right'?'请右转，':'请';
 const bends=leg.interiorTurns||[];
 let text=turn+'沿盲道前行约 '+spokenDistance(bends[0]?.afterM??leg.lengthM);
 bends.forEach((bend,i)=>{
  const remaining=(bends[i+1]?.afterM??leg.lengthM)-bend.afterM;
  text+='，随盲道向'+(bend.turn==='left'?'左':'右')+'转，再前行约 '+spokenDistance(remaining);
 });
 return text;
}
function resetScan(){currentId=null;candidateId=null;candidateCount=0;announcedAt=0;clearPose('等待新测量')}
function save(){if(!ui.demo&&ui.engine)store(saveKey,ui.engine.snapshot())}
function mapMarkup(){
 const order=route().order,s=state(),last=s?.currentId,next=s?.expectedId;
 const lines=order.slice(1).map((id,i)=>segment(order[i],id)).filter(Boolean);
 return '<figure class="floor-map"><svg viewBox="200 8 550 450" role="img" aria-labelledby="map-title map-desc"><title id="map-title">设计学院一楼预设参观路线</title><desc id="map-desc">沿南侧、西侧、北侧和东侧外围通道参观。数字是标记 ID，蓝线是图纸路径，黄色标出最近确认的码点，不表示连续位置。</desc><image href="spatial/floorplan.jpg" width="945" height="515"/>'+
 lines.map(p=>'<polyline points="'+p.path.map(q=>q.x+','+q.y).join(' ')+'" fill="none" stroke="#2049df" stroke-width="4" stroke-linejoin="round"/>').join('')+
 plan.markers.filter(m=>order.includes(m.id)).map(m=>'<g><circle cx="'+m.x+'" cy="'+m.y+'" r="'+(m.id===last?13:10)+'" fill="'+(m.id===last?'#ffe16d':'white')+'" stroke="'+(m.id===next?'#b85b00':'#2049df')+'" stroke-width="3"/><text x="'+m.x+'" y="'+(m.y+4)+'" text-anchor="middle" font-size="12" font-weight="bold" fill="#102c8a">'+m.id+'</text></g>').join('')+
 '</svg><figcaption>蓝线：图纸路线 · 黄点：最近确认的标记<br>未现场核验；不会随行走自动移动</figcaption></figure>';
}
function stationList(s){return '<ol class="station-list">'+route().order.map((id,i)=>'<li class="'+(s&&i<=s.cursor?'visited':'')+'" '+(s&&i===s.cursor+1?'aria-current="step"':'')+'><span class="station-id">'+id+'</span><span>'+esc(marker(id).name)+(i===route().order.length-1&&id===0?'（返回）':'')+'</span></li>').join('')+'</ol>'}
function startTour(demo,saved){
 stop();ui.demo=demo;ui.aligned=demo||!!el('aligned')?.checked;ui.last=null;
 ui.engine=makeEngine(saved);resetScan();if(!demo)save();navigate(demo?'navigation':'scan');
 if(demo)talk('请从'+spokenName(marker(state().expectedId))+'开始参观。');else void start();
}
function instruction(id,result){
 const m=marker(id),s=state(),item={name:m?.name||'未登记标记 '+id,message:'',result,markerId:id};
 if(s.completed){item.message=(m?'您现在位于'+spokenName(m)+'。':'')+'本轮参观已完成。';return item}
 if(result.status==='unknown'){item.message='该标记未登记，请重新扫描路线标记。';return item}
 if(result.status==='unexpected'){item.message='您现在位于'+spokenName(m)+'。请停下确认路线，'+(s.awaitingReconfirmation?'请重新扫描':'下一站应为')+spokenName(marker(s.expectedId))+'。';return item}
 if(s.awaitingReconfirmation){item.message='请重新扫描'+spokenName(marker(s.expectedId))+'，确认当前位置。';return item}
 const next=marker(s.expectedId),leg=segment(id,s.expectedId);item.leg=leg;
 const direction=leg?.turn;
 item.travel=direction==='left'?'到此处后左转':direction==='right'?'到此处后右转':id===0?'起步沿南侧通道向图左侧':'沿当前盲道继续';
 // 相对转向以使用者已确认的路线来向为前提，不从相机画面或 IMU 猜测人体朝向。
 if(ui.aligned&&['left','right'].includes(direction))item.direction=direction;
 item.directionInMessage=true;
 item.message='您现在位于'+spokenName(m)+'。'+(leg?walkingInstruction(leg)+'，到达'+spokenName(next)+'。':'请沿盲道前往'+spokenName(next)+'。');
 return item;
}
window.resolveGuideLocation=id=>{
 if(!ui.engine||ui.demo)return null;
 const result=ui.engine.observe(id);
 // 同一码不能打断讲解、设置编辑，或把等待下一码的取景页推回去。
 if(result.status==='repeat'&&['exhibit','tools','scan'].includes(ui.page))return null;
 const item=instruction(id,result);save();return item;
};
function receive(id,item){ui.last={id,item,at:Date.now()};navigate('navigation')}
window.addEventListener('guide-recognized',e=>{if(['scan','navigation','tools','exhibit'].includes(ui.page))receive(e.detail.id,e.detail.item)});
window.addEventListener('guide-unknown',e=>{
 if(!ui.engine||ui.demo||!['scan','navigation','tools','exhibit'].includes(ui.page))return;
 const item=instruction(e.detail.id,ui.engine.observe(e.detail.id));receive(e.detail.id,item);void promptLocation(item);
});
function simulate(id){const item=instruction(id,ui.engine.observe(id));receive(id,item);void promptLocation(item,true)}
function readContent(id){const content=load(contentKey)||{};return typeof content[id]==='string'?content[id]:''}
function renderNavigation(){
 const s=state();if(!s){navigate('map');return}
 const item=ui.last?.item,warning=['unknown','unexpected'].includes(item?.result.status),last=marker(s.currentId),next=marker(s.expectedId),done=s.completed,leg=item?.leg;
 pages.innerHTML='<section class="tour-page"><p class="mode-label">'+(ui.demo?'路线演示 · 不代表现场位置':'现场扫码 · 受控实验')+' / '+esc(route().name)+'</p><div class="progress-label"><span>'+(done?'路线完成':'已确认 '+Math.max(0,s.cursor+1)+' / '+route().order.length+' 个路线节点')+'</span><span>'+(ui.demo?'模拟扫码':'ArUco')+'</span></div><progress max="'+route().order.length+'" value="'+Math.max(0,s.cursor+1)+'" aria-label="参观路线进度"></progress>'+
 '<h1>'+(warning?'请停下确认路线':done?'本轮参观完成':last?esc(last.name):s.awaitingReconfirmation?'重新确认停靠点':'从起点开始')+'</h1>'+
 '<p class="visit-caption">'+(last?'最近'+(ui.demo?'模拟':'扫码')+'确认：ID '+last.id+' · '+time(s.lastConfirmedAt):'还未确认现场位置')+'</p>'+
 (warning?'<p class="route-warning" role="alert">'+esc(item.message)+'</p>':'')+
 (!done?'<div class="next-stop"><span>'+(s.awaitingReconfirmation?'请重新扫描':'下一站')+'</span><strong>ID '+s.expectedId+' · '+esc(next?.name)+'</strong>'+(!warning&&leg?'<p>'+esc(item.travel)+(leg.interiorTurns.length?' · 途中有转折':'')+'</p><p class="muted">图纸路线约 '+leg.lengthM.toFixed(1)+' 米 · 非实时剩余距离</p>':'')+'</div>':'<p>已按顺序回到南侧起点。</p>')+
 (!warning&&leg?'<p class="route-condition">方向以沿预设路线到达的朝向为前提。中途转折需结合盲道；仅扫码时确认节点。</p>':'')+
 '<div class="tour-actions">'+(ui.last?btn('replay','重听路线提示'):'')+(ui.demo&&!done?btn('simulate-next','模拟识别 ID '+s.expectedId,'primary yellow'):'')+(!ui.demo&&!done?btn('scan',stream?'继续扫描下一站':'开启摄像头继续','primary yellow'):'')+(last&&!warning?btn('exhibit','听本站介绍','secondary'):'')+btn('mute','停止播报','secondary')+(!ui.demo&&stream?btn('pause','暂停相机','link'):'')+(done?btn('map','开始新一轮参观','secondary'):'')+'</div>'+
 '<p id="route-speech-status" class="muted" role="status">'+esc(speechStatus||'点击“重听路线提示”可再次播放中文。')+'</p>'+
 (!ui.demo?'<details class="measurement-detail"><summary>查看相机测距</summary><p id="nav-distance" class="muted">等待有效测量</p><p class="muted">相机到码的斜距，不是沿盲道的剩余距离。</p></details>':'')+
 '<details class="route-overview"><summary>查看地图与站点</summary>'+mapMarkup()+stationList(s)+'</details>'+
 (ui.demo?'<details class="demo-controls"><summary>测试重复扫码或其他站点</summary><label>模拟标记<select id="demo-id">'+plan.markers.map(m=>'<option value="'+m.id+'">'+m.id+' · '+esc(m.name)+'</option>').join('')+'<option value="99">99 · 未登记标记</option></select></label>'+btn('simulate-selected','模拟所选标记','secondary')+'</details>':'')+'</section>';
}
function navigate(page){
 clearTimeout(ui.scanTimer);
 if(!['scan','navigation','tools','exhibit'].includes(page)){stop();ui.torch=false;el('torch').textContent='开启手电筒'}
 ui.page=page;pages.hidden=['scan','tools'].includes(page);el('scanner').hidden=page!=='scan';el('tools').hidden=page!=='tools';el('header').hidden=page==='home';pages.innerHTML='';
 if(page==='home')pages.innerHTML='<section class="home"><h1 class="sr-only">寻径 · 设计学院一楼导览</h1><img class="hero" src="assets/home-illustration.png" alt="同伴陪同手持白手杖的参观者"><div class="home-actions">'+btn('map','首次参观')+btn('continue','继续参观','primary yellow')+btn('help','现场协助','primary red')+'</div><p class="home-note">设计学院一楼 · 沿盲道，逐站聆听</p></section>';
 if(page==='map'){
  ui.engine=null;ui.last=null;
  pages.innerHTML='<section class="tour-page"><p class="eyebrow">设计学院 · 一楼</p><h1>这一程，从这里开始。</h1>'+mapMarkup()+
  '<p class="route-condition">沿用空间导览的建筑原图与 12 个关键码。入口、码位和盲道路线仍需现场核对。</p><div class="tour-actions">'+btn('intro','准备现场参观')+btn('begin-demo','先体验路线','primary yellow')+'</div><details><summary>按顺序查看站点</summary>'+stationList()+'</details></section>';
 }
 if(page==='intro')pages.innerHTML='<section class="tour-page"><p class="eyebrow">参观前 · '+esc(route().name)+'</p><h1>沿着盲道，听见下一站。</h1><ol class="preparation"><li>由陪同人员确认南侧 ID 0 起点，并朝向图左侧的 ID 1。</li><li>举起手机扫描盲道旁的 ArUco 标记。识别后播报本站与下一站。</li><li>到工坊停靠点可听介绍；继续举着手机识别下一个码。</li></ol><p class="route-condition">当前为布点实验。尚未现场核实的路线，请与陪同人员一起测试。</p><label class="check-label"><input id="aligned" type="checkbox">已由陪同人员确认起点、盲道与行进方向</label><div class="tour-actions">'+btn('begin-live','开始现场扫码')+btn('begin-demo','先体验路线','secondary')+'</div><p id="start-note" role="status"></p></section>';
 if(page==='scan'){
  el('scan-title').textContent='寻找 ID '+(state()?.expectedId??0);el('scan-sub').textContent=marker(state()?.expectedId??0)?.name||'请扫描已登记的标记';
  if(!stream)status('请点击开始识别，允许使用摄像头。');
  ui.scanTimer=setTimeout(()=>{if(ui.page==='scan'&&stream){el('scan-title').textContent='暂未识别到标记';el('scan-sub').textContent='请先停下，缓慢调整手机方向；必要时请求现场协助。'}},15000);
 }
 if(page==='navigation')renderNavigation();
 if(page==='continue'){
  const saved=savedTour();
  pages.innerHTML='<section class="tour-page"><h1>继续参观</h1>'+(saved?'<p>上次停靠：'+esc(marker(saved.order[saved.cursor])?.name||'未知站点')+'</p><p class="muted">'+time(saved.lastConfirmedAt)+' 的历史记录。必须重新扫码确认，才会继续下一段。</p><label class="check-label"><input id="aligned" type="checkbox">陪同人员已确认当前位置与预设行进方向</label>'+btn('resume','扫描上次停靠点')+'<p id="start-note" role="status"></p>':'<p>没有可恢复的一楼参观记录。</p>')+btn('map','重新开始参观','secondary')+'</section>';
 }
 if(page==='help')pages.innerHTML='<section class="tour-page"><h1>现场协助</h1><p>向附近工作人员播放求助语音。</p><div class="tour-actions">'+btn('sos','播放求助语音','primary red')+btn('mute','停止播报','secondary')+'</div><p id="help-status" role="status">声音仅在本机播放。</p></section>';
 if(page==='exhibit'){
  const id=state()?.currentId,m=marker(id),text=readContent(id);
  pages.innerHTML='<section class="tour-page"><p class="eyebrow">'+(ui.demo?'演示 · ':'')+'本站介绍 / ID '+id+'</p><h1>'+esc(m?.name)+'</h1>'+(text?'<p class="exhibit-copy">'+esc(text)+'</p>':'<p>本站尚未录入展品讲解。</p><p class="muted">可在工具与设置中录入小组确认后的介绍文案。</p>')+'<details><summary>查看布点说明</summary><p>'+esc(m?.reason)+'</p></details><div class="tour-actions">'+(text?btn('read-exhibit','重听本站介绍'):'')+btn('navigation','返回路线','primary yellow')+btn('mute','停止播报','secondary')+'</div></section>';
 }
 if(page==='tools')renderEditor();
 window.scrollTo(0,0);const heading=(page==='scan'?el('scanner'):page==='tools'?el('tools'):pages).querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}
}
function renderEditor(){
 el('content-editor').innerHTML='<label>讲解站点<select id="content-id">'+plan.markers.map(m=>'<option value="'+m.id+'">'+m.id+' · '+esc(m.name)+'</option>').join('')+'</select></label><label>已确认的讲解文案<textarea id="content-text" rows="5" maxlength="5000" placeholder="填写展品名称、内容与可体验方式"></textarea></label><button class="secondary" data-go="save-content">保存本站讲解</button><p id="content-status" role="status">讲解仅保存在此浏览器，不会同步到其他设备。</p>';el('content-text').value=readContent(0);
}
document.addEventListener('change',e=>{
 if(e.target.id==='content-id')el('content-text').value=readContent(Number(e.target.value));
});
document.addEventListener('click',e=>{
 const action=e.target.closest('[data-go]')?.dataset.go;if(!action)return;
 if(action==='begin-demo'){startTour(true);return}
 if(action==='begin-live'||action==='resume'){
  if(!el('aligned')?.checked){el('start-note').textContent='请先由陪同人员确认起点、路线与行进方向，或选择路线演示。';el('aligned')?.focus();return}
  const saved=action==='resume'?savedTour():undefined;if(action==='resume'&&!saved){navigate('map');return}startTour(false,saved);return;
 }
 if(action==='scan'){if(!ui.engine||ui.demo){navigate('intro');return}navigate('scan');if(!stream){resetScan();void start()}return}
 if(action==='demo'){navigate('map');return}
 if(action==='simulate-next'){if(state()?.expectedId!==null)simulate(state().expectedId);return}
 if(action==='simulate-selected'){simulate(Number(el('demo-id').value));return}
 if(action==='replay'){if(ui.last)replayLocationSpeech(ui.last.item);return}
 if(action==='mute'){cancelPrompt();return}
 if(action==='pause'){stop();navigate('navigation');return}
 if(action==='sos'){talk('您好，我是一位视障参观者，现在需要现场协助。请附近的工作人员帮助我，谢谢。');el('help-status').textContent='已请求播放求助语音。';return}
 if(action==='save-content'){const id=Number(el('content-id').value),savedContent=load(contentKey),data=savedContent&&typeof savedContent==='object'?savedContent:{};data[id]=el('content-text').value.trim();const ok=store(contentKey,data);el('content-status').textContent=ok?'已保存到此浏览器。':'保存失败，请先复制文案，并检查浏览器是否允许本地存储。';return}
 if(action==='exhibit'||action==='read-exhibit'){cancelPrompt();navigate('exhibit');talk(readContent(state()?.currentId)||'本站尚未录入展品讲解。');return}
 if(action==='navigation')cancelPrompt();navigate(action);
});
el('torch').addEventListener('click',async()=>{
 const track=stream?.getVideoTracks()[0];if(!track){status('请先开启摄像头。');return}if(!track.getCapabilities?.().torch){status('当前设备或浏览器不支持手电筒。');return}
 try{await track.applyConstraints({advanced:[{torch:!ui.torch}]});ui.torch=!ui.torch;el('torch').textContent=ui.torch?'关闭手电筒':'开启手电筒'}catch{status('手电筒控制失败，请检查设备支持。')}
});
setInterval(()=>{
 const target=el('nav-distance');if(!target||ui.demo)return;const v=normalDisplay.read();
 target.textContent=v.summary?(v.historical?'上次测量 · ':'')+'相机到标记 ID '+v.summary.representative.id+' 大概 '+v.summary.distanceM.toFixed(2)+' 米 · '+(v.summary.representative.method==='image-scale'?'尺度粗估，角度不可用':'位姿估计'):'没有有效测距；不影响标记识别。';
},250);
window.addEventListener('pagehide',()=>clearTimeout(ui.scanTimer));
new MutationObserver(()=>{if(ui.page==='scan'&&el('status').textContent.startsWith('启动失败')){el('scan-title').textContent='摄像头未能启动';el('scan-sub').textContent='请检查摄像头权限；手机需使用 HTTPS 页面。'}}).observe(el('status'),{childList:true,subtree:true});
navigate('home');
})();

