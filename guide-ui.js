/* Optional camera torch control; recognition and audio remain owned by index.html. */
(function(){
 const button=document.getElementById('torch'),status=document.getElementById('torch-status');
 let activeTrack=null,on=false,busy=false;
 const track=()=>typeof stream!=='undefined'?stream?.getVideoTracks?.()?.[0]:null;
 function refresh(){
  const current=track();
  if(current!==activeTrack){activeTrack=current;on=false;busy=false;}
  let supported=false;
  try{supported=!!current?.getCapabilities?.().torch;}catch(e){/* capability unavailable */}
  button.disabled=!supported||busy;
  button.setAttribute('aria-pressed',String(on));
  button.textContent=on?'关闭手电筒':'开启手电筒';
  status.textContent=!current?'开始识别后可使用支持的摄像头补光灯':supported?'可使用手电筒辅助照明':'当前摄像头不支持网页补光灯';
  document.getElementById('repeat').hidden=typeof currentId==='undefined'||currentId===null;
 }
 button.addEventListener('click',async()=>{
  const current=track();if(!current||busy)return;
  const next=!on;busy=true;button.disabled=true;
  try{
   await current.applyConstraints({advanced:[{torch:next}]});
   if(track()!==current)return;
   on=next;busy=false;refresh();
  }catch(e){if(track()===current){busy=false;refresh();status.textContent='补光灯开启失败，请尝试调整照明';}}
 });
 new MutationObserver(refresh).observe(document.getElementById('stop'),{attributes:true,attributeFilter:['disabled']});
 new MutationObserver(refresh).observe(document.getElementById('place'),{childList:true});
 refresh();
})();
