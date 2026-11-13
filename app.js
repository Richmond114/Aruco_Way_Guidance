(()=>{
'use strict';
const ui={page:'home',last:null,demo:false,torch:false,transition:0,scanTimer:0};
const el=id=>document.getElementById(id),pages=el('pages');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(action,text,cls='primary')=>`<button class="${cls}" data-go="${action}">${text}</button>`;
const talk=text=>void promptLocation({message:text},true);
const store=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const load=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}};
function navigate(page){
 clearTimeout(ui.transition);clearTimeout(ui.scanTimer);
 if(!['scan','navigation','tools'].includes(page)){stop();ui.torch=false;el('torch').textContent='开启手电筒';}
 el('header').querySelector('.back').innerHTML=page==='map'?'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 3 16l13 13M3 16h27"/></svg><span>返回</span>':'← 返回';
 ui.page=page;pages.hidden=['scan','tools'].includes(page);el('scanner').hidden=page!=='scan';el('tools').hidden=page!=='tools';el('header').hidden=page==='home';pages.innerHTML='';
 if(page==='home')pages.innerHTML=`<section class="home"><h1 class="sr-only">寻径 · 室内导盲</h1><img class="hero" src="assets/home-illustration.png" alt="同伴搀扶手持白手杖的参观者"><div class="home-actions">${btn('map','首次参观')}${btn('continue','继续参观','primary yellow')}${btn('help','现场协助','primary red')}</div></section>`;
 if(page==='map')pages.innerHTML=`<section class="map-page"><h1 class="sr-only">参观地图</h1><img class="map-image" src="assets/floor-map-clean-v3.png" alt="设计学院参观路线示意图，蓝线表示路线"><p class="map-copy">今天我们参观设计<br>学院。。。</p>${btn('intro','开始参观')}</section>`;
 if(page==='intro')pages.innerHTML=`<section class="intro"><h1>导言</h1><p>欢迎来到设计学院。请用手机扫描沿途的信息码，获取当前位置和语音提示。</p><p class="muted">当前地点配置沿用原仓库。请在安全环境中体验。</p>${btn('scan','开始寻找信息码')}</section>`;
 if(page==='scan'){
  ui.demo=false;el('scan-title').textContent='正在识别信息码……';el('scan-title').className='';el('scan-sub').textContent='识别成功后将语音播报';
  if(!stream)status('请点击“开始识别”，允许使用摄像头。');
  ui.scanTimer=setTimeout(()=>{if(ui.page==='scan'&&stream){el('scan-title').textContent='暂未识别到信息码';el('scan-sub').textContent='请缓慢移动手机，或点击重新扫描';}},15000);
 }
 if(page==='navigation')renderNavigation();
 if(page==='continue'){
  const saved=load('xunjing-last');
  pages.innerHTML=`<section class="help-page"><h1>继续参观</h1>${saved&&LOCATIONS[saved.id]?`<p>上次识别位置：<br>${esc(LOCATIONS[saved.id].name)}</p><p class="muted">${new Date(saved.time).toLocaleString('zh-CN')} 的参观记录。请重新扫码确认当前位置。</p>`:'<p>还没有参观记录。<br>扫描信息码开始吧。</p>'}${btn('scan','扫描当前位置')}</section>`;
 }
 if(page==='help')pages.innerHTML=`<section class="help-page"><h1>现场协助</h1><p>需要帮助时，请向附近的工作人员出示此页面，或播放求助语音。</p>${btn('sos','播放求助语音','primary red')}<p id="help-status" class="muted" role="status">点击后将在当前设备播放求助语音。</p>${btn('mute','停止播报','link')}</section>`;
 if(page==='demo')pages.innerHTML=`<section class="demo-page"><h1>体验演示</h1><p class="demo-badge">演示模式 · 不调用摄像头，不代表当前位置或测量</p><p class="muted">选择一个标记，试听原仓库的地点与转向提示。</p>${Object.entries(LOCATIONS).map(([id,item])=>btn('demo:'+id,'ID '+id+' · '+item.name,'small-button')).join('')}${btn('sample','体验 UI 中的路线','small-button')}${btn('arrival','体验展品讲解','small-button')}${btn('workshop','体验工坊参观','small-button')}${btn('failure','查看识别失败状态','link')}</section>`;
 if(page==='arrival')pages.innerHTML=`<section class="arrive"><p class="demo-badge">界面演示 · 非实地识别</p><div class="round-icon" aria-hidden="true">✓</div><h1>到达1号展品</h1><button class="speaker" data-go="explain" aria-label="播放展品讲解">♬</button>${btn('explain','点击开始讲解')}${btn('scan','返回寻路','primary yellow')}<p id="explain-status" class="muted" role="status"></p></section>`;
 if(page==='workshop')pages.innerHTML=`<section class="arrive"><p class="demo-badge">界面演示 · 工坊内容为体验示例</p><div class="round-icon" aria-hidden="true">✓</div><h1>欢迎来到油泥工坊</h1><p class="muted">用双手感知形态，在探索中发现设计。</p>${btn('game:0','点击开始体验')}${btn('game:1','丝网印刷工坊','link')}${btn('game:2','设计学院中庭','link')}</section>`;
 if(page.startsWith('game:')){const i=Number(page.split(':')[1]);const names=['油泥工坊','丝网印刷工坊','设计学院中庭'];pages.innerHTML=`<section class="game"><p class="demo-badge">互动演示 · 按钮与语音体验</p><div class="round-icon" aria-hidden="true">${['♧','▧','⌂'][i]}</div><h1>${names[i]}</h1><p>${['选择一种形态，感受造型的变化。','选择一种纹理，体验印刷的节奏。','聆听周围，选择你想探索的方向。'][i]}</p><div id="choices">${['第一种','第二种','第三种'].map((x,n)=>btn('choose:'+n,x,'small-button')).join('')}</div><p id="game-feedback" class="muted" aria-live="polite">请选择一个选项。</p>${btn('reward:'+i,'完成体验')}</section>`;}
 if(page.startsWith('reward:')){const i=Number(page.split(':')[1]);const rewards=load('xunjing-rewards')||[];if(!rewards.includes(i))rewards.push(i);store('xunjing-rewards',rewards);pages.innerHTML=`<section class="intro"><h1>恭喜您获得了碎片${i+1}</h1><p class="muted">已收集 ${rewards.length} / 3 枚参观碎片</p>${btn('workshop','继续体验')}${btn('scan','返回寻路','link')}</section>`;talk(`恭喜您获得了碎片${i+1}。`);}
 window.scrollTo(0,0);const heading=(page==='scan'?el('scanner'):page==='tools'?el('tools'):pages).querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
}
function renderNavigation(){
 const last=ui.last;if(!last){navigate('scan');return;}
 const item=last.item,arrow=item.direction==='left'?'↰':item.direction==='right'?'↱':'↑';
 pages.innerHTML=`<section class="route-card">${ui.demo?'<p class="demo-badge">演示模式 · 非实时定位</p>':''}${last.sample?'<p class="route-line"><span class="route-arrow">↑</span>直行50米</p><p class="route-line">50米后右拐</p><p class="route-line">到达卫生间</p>':`<p class="route-line"><span class="route-arrow" aria-hidden="true">${arrow}</span>${esc(item.name)}</p><p class="route-line">${item.direction==='left'?'请左转':item.direction==='right'?'请右转':'已到达此位置'}</p><p class="muted">${esc(item.message)}</p><p class="distance" id="nav-distance">${ui.demo?'演示模式不提供测距':'正在读取测量结果……'}</p>`}${btn('replay','重听播报')}${btn('scan','继续扫描','link')}${btn('mute','停止提示','link')}<p class="muted">${last.sample?'UI 路线示例 · 距离为示例文案':'转向按预设路线解释，请结合现场确认。'}</p></section>`;
}
window.addEventListener('guide-recognized',e=>{
 if(!['scan','navigation','tools'].includes(ui.page))return;
 ui.last=e.detail;ui.demo=false;store('xunjing-last',{id:e.detail.id,time:Date.now()});
 if(ui.page==='scan'){el('scan-title').textContent='识别成功！';el('scan-title').className='success';el('scan-sub').textContent='正在跳转……';clearTimeout(ui.scanTimer);ui.transition=setTimeout(()=>navigate('navigation'),700);}
 else if(ui.page==='navigation')renderNavigation();
});
setInterval(()=>{const target=el('nav-distance');if(!target||ui.demo)return;const v=normalDisplay.read();target.textContent=v.summary?`${v.historical?'上次测量 · ':''}大概距离 ${v.summary.distanceM.toFixed(2)} 米\n${v.summary.representative.method==='image-scale'?'图像尺度粗估 · 角度暂不可用':'位姿估计'} · ${new Date(v.summary.windowEndTime).toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}`:'等待有效测量，请保持标记在摄像头画面内';},250);
el('torch').addEventListener('click',async()=>{
 const track=stream?.getVideoTracks()[0];if(!track){status('请先开启摄像头。');return;}if(!track.getCapabilities?.().torch){status('当前设备或浏览器不支持手电筒。');return;}
 try{await track.applyConstraints({advanced:[{torch:!ui.torch}]});ui.torch=!ui.torch;el('torch').textContent=ui.torch?'关闭手电筒':'开启手电筒';}catch{status('手电筒控制失败，请检查设备支持。');}
});
document.addEventListener('click',e=>{
 const action=e.target.closest('[data-go]')?.dataset.go;if(!action)return;
 if(action.startsWith('demo:')){stop();const id=Number(action.split(':')[1]);ui.last={id,item:LOCATIONS[id]};ui.demo=true;navigate('navigation');void promptLocation(LOCATIONS[id],true);return;}
 if(action==='sample'){stop();ui.demo=true;ui.last={sample:true,item:{name:'路线示例',message:'直行五十米，五十米后右拐，到达卫生间。'}};navigate('navigation');talk(ui.last.item.message);return;}
 if(action==='replay'){if(ui.last)void promptLocation(ui.last.item,true);return;}
 if(action==='mute'){cancelPrompt();return;}
 if(action==='sos'){talk('您好，我是一位视障参观者，现在需要现场协助。请附近的工作人员帮助我，谢谢。');el('help-status').textContent='已请求播放求助语音。';return;}
 if(action==='explain'){talk('欢迎来到一号展品。这里是寻径的语音讲解演示。您可以重听讲解，或返回寻路继续参观。');el('explain-status').textContent='正在播放示例讲解';return;}
 if(action.startsWith('choose:')){document.querySelectorAll('#choices button').forEach(x=>x.classList.toggle('selected',x===e.target));el('game-feedback').textContent=`已选择${Number(action.split(':')[1])+1}号选项，点击完成体验收集碎片。`;talk(el('game-feedback').textContent);return;}
 if(action==='failure'){navigate('scan');stop();el('scan-title').textContent='识别失败';el('scan-title').className='error';el('scan-sub').textContent='点击“开始识别”重新扫描';return;}
 navigate(action);
 if(action==='scan'){currentId=null;announcedAt=0;candidateId=null;candidateCount=0;clearPose('等待新测量');void start();}
 if(action==='intro')talk('欢迎来到设计学院。请扫描沿途的信息码，获取当前位置和语音提示。');
});
window.addEventListener('pagehide',()=>{clearTimeout(ui.transition);clearTimeout(ui.scanTimer)});
new MutationObserver(()=>{if(ui.page==='scan'&&el('status').textContent.startsWith('启动失败')){el('scan-title').textContent='识别未能启动';el('scan-title').className='error';el('scan-sub').textContent='请检查摄像头权限后重试';}}).observe(el('status'),{childList:true,subtree:true});
navigate('home');
})();

