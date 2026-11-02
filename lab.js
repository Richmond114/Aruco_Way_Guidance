'use strict';
const $=id=>document.getElementById(id),video=$('video'),overlay=$('overlay'),pen=overlay.getContext('2d');
const detection=document.createElement('canvas'),dc=detection.getContext('2d',{willReadFrequently:true});
let stream=null,session=0,raf=0,detector=null,cal=null,current=null,last=0,rateStart=0,frames=0,sequence=0;
const photos=[],records=[];
let mode=LabPose.MODES.coarse,tracker=LabPose.createTracker(mode);
const say=s=>$('status').textContent=s;
function invalid(s='当前无有效测距'){current=null;tracker.reset();$('pose').textContent=s;$('size-quality').textContent='像素尺寸：尚未检测目标';}
function pending(state){current=null;$('pose').textContent={idle:'当前无有效测距',acquiring:'正在确认测距质量，当前无有效测距',recovering:'测距质量暂时下降，重新确认中；当前无有效测距',tooSmall:'目标像素尺寸不足，请靠近或减小倾斜；当前无有效测距',unstable:'测距质量不稳定，请保持画面清晰；当前无有效测距'}[state];}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
const json=(data,name)=>download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),name);
function stop(){session++;cancelAnimationFrame(raf);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;pen.clearRect(0,0,overlay.width,overlay.height);invalid();$('corners').textContent='未识别';$('stats').textContent='视频 —；检测 —；更新率 —';$('start').disabled=false;say('摄像头已释放');}
async function start(){
 if(stream)return;
 if(!window.isSecureContext)return say('非安全连接：请使用 HTTPS 或 localhost');
 if(!navigator.mediaDevices?.getUserMedia)return say('浏览器不支持摄像头接口');
 if(!window.AR||!window.CV)return say('识别库加载失败，请检查网络后刷新');
 const ticket=++session;$('start').disabled=true;
 try{detector=new AR.Detector({dictionaryName:'ARUCO'});
 const s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
 if(ticket!==session){s.getTracks().forEach(t=>t.stop());return;}stream=s;video.srcObject=s;await video.play();if(ticket!==session)return;
 last=0;rateStart=performance.now();frames=0;say('摄像头已启动，等待标记');raf=requestAnimationFrame(scan);
 }catch(e){if(ticket===session){stop();say(e.name==='NotAllowedError'?'摄像头权限被拒绝':`启动失败：${e.message}`);}}
}
function scan(t){
 if(!stream)return;raf=requestAnimationFrame(scan);
 if(video.readyState<2){invalid();return;}if(t-last<150)return;last=t;
 const vw=video.videoWidth,vh=video.videoHeight,w=Math.min(Number($('detect-width').value)||960,vw),h=Math.round(w*vh/vw);
 detection.width=w;detection.height=h;overlay.width=w;overlay.height=h;
 dc.drawImage(video,0,0,w,h);
 let markers;try{markers=detector.detect(dc.getImageData(0,0,w,h));}catch(e){invalid();say('检测失败：'+e.message);return;}
 frames++;if(t-rateStart>=1000){$('stats').textContent=`视频 ${vw}×${vh}；检测 ${w}×${h}；更新率 ${(frames*1000/(t-rateStart)).toFixed(1)} Hz`;rateStart=t;frames=0;}
 const coords=[];
 markers.forEach(m=>{pen.beginPath();m.corners.forEach((p,i)=>{i?pen.lineTo(p.x,p.y):pen.moveTo(p.x,p.y);pen.fillStyle='#ffff00';pen.font='16px sans-serif';pen.fillText(`${m.id}:${i}`,p.x,p.y);});pen.closePath();pen.strokeStyle='#00ff88';pen.stroke();
 const raw=LabPose.pointsToVideo(m.corners,vw,vh,w,h);coords.push(`ID ${m.id}\n`+raw.map((p,i)=>`${i}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) px（原视频）`).join('\n'));
 if(![...$('target').options].some(o=>o.value===String(m.id))){const o=document.createElement('option');o.value=m.id;o.textContent='ID '+m.id;$('target').append(o);}
 });
 $('corners').textContent=coords.join('\n\n')||'未识别';say(markers.length?`识别到 ${markers.length} 个标记`:'未识别标记');
 const m=markers.find(m=>String(m.id)===$('target').value);if(!m){invalid();return;}
 const corners=LabPose.pointsToVideo(m.corners,vw,vh,w,h),edge=LabPose.minEdge(corners);
 const sizeInfo=`${mode.label}；目标 ID ${m.id}：最短边 ${edge.toFixed(1)} 原视频 px / ${LabPose.minEdge(m.corners).toFixed(1)} 检测 px（进入 ≥${mode.enterPx}，保持 ≥${mode.holdPx} 原视频 px；误差上限 ${mode.maxRmsPx} px）`;
 try{if(!cal)throw Error('没有有效标定');LabPose.validate(cal,vw,vh);
 if(!window.cv?.solvePnP)throw Error('OpenCV.js 未就绪或不支持 solvePnP');
 const sizeMm=Number($('size').value);
 // Configuration failures reset immediately; quality failures use temporal confirmation.
 if(!Number.isFinite(sizeMm)||sizeMm<10||sizeMm>2000)throw Error('码体边长需为 10–2000 mm');
 let result;
 try{result=LabPose.solve(cv,corners,sizeMm,cal,{minEdgePx:mode.holdPx,maxRmsPx:mode.maxRmsPx});}catch(e){pending(tracker.step({edge,valid:false}).state);$('size-quality').textContent=sizeInfo+'；本帧原因：'+e.message;return;}
 const quality=tracker.step({edge,valid:true});$('size-quality').textContent=sizeInfo;
 if(!quality.ready){pending(quality.state);return;}
 current={...result,id:m.id,sizeMm,calibrationId:cal.id,width:vw,height:vh,detectionWidth:w,detectionHeight:h,time:new Date().toISOString(),monotonic:performance.now(),sequence:++sequence,corners,minEdgeVideoPx:edge,qualityState:quality.state,qualityMode:mode.label,qualityThresholds:{...mode}};
 $('pose').textContent=`${mode.label}：原始斜距约 ${result.distanceM.toFixed(mode===LabPose.MODES.coarse?2:3)} m\nt = [${result.tvec.map(v=>v.toFixed(4)).join(', ')}] m\n重投影 RMS ${result.rmsPx.toFixed(3)} px；标定 RMS ${cal.rmsPx.toFixed(3)} px\n${result.ambiguity}；未平滑`;
 }catch(e){invalid('当前无有效测距：'+e.message);}
}
$('start').onclick=start;$('stop').onclick=stop;document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('pagehide',stop);
$('target').onchange=()=>invalid();$('size').oninput=()=>invalid();
$('detect-width').onchange=()=>invalid();
$('quality-mode').onchange=()=>{mode=LabPose.MODES[$('quality-mode').value]||LabPose.MODES.coarse;tracker=LabPose.createTracker(mode);invalid('测距模式已切换，等待连续 3 次合格检测');};
$('calibration').onchange=async e=>{cal=null;invalid();try{const file=e.target.files[0];if(!file)return;const c=JSON.parse(await file.text());LabPose.validate(c,video.videoWidth||c.width,video.videoHeight||c.height);cal=c;$('cal-status').textContent=`已导入 ${c.id}；${c.width}×${c.height}；RMS ${c.rmsPx.toFixed(3)} px。必须使用同一镜头/变焦/画幅。`;}catch(e){$('cal-status').textContent='标定无效：'+e.message;}};
function renderPhotos(){const list=$('photos');list.replaceChildren();$('count').textContent=`已采集 ${photos.length} 张`;
 photos.forEach(p=>{const row=document.createElement('div'),img=document.createElement('img');img.src=p.url;img.alt=p.meta.filename;const save=document.createElement('button');save.textContent='下载 '+p.meta.filename;save.onclick=()=>download(p.blob,p.meta.filename);const del=document.createElement('button');del.textContent='删除此张';del.onclick=()=>{URL.revokeObjectURL(p.url);photos.splice(photos.indexOf(p),1);renderPhotos();};row.append(img,save,del);list.append(row);});}
$('capture').onclick=async()=>{if(!stream||video.readyState<2)return say('请先启动摄像头');if(photos.length>=50)return say('已达 50 张上限，请下载后删除以释放内存');
 const raw=document.createElement('canvas');raw.width=video.videoWidth;raw.height=video.videoHeight;raw.getContext('2d').drawImage(video,0,0);
 const meta={filename:`capture_${Date.now()}_${photos.length}.png`,time:new Date().toISOString(),width:raw.width,height:raw.height,settings:stream.getVideoTracks()[0].getSettings()};
 const blob=await new Promise(r=>raw.toBlob(r,'image/png'));if(!blob)return say('照片编码失败');photos.push({blob,meta,url:URL.createObjectURL(blob)});renderPhotos();};
$('metadata').onclick=()=>json({schemaVersion:1,images:photos.map(p=>p.meta)},'captures.json');
$('record').onclick=()=>{const referenceM=Number($('reference').value);if(!current||performance.now()-current.monotonic>600)return say('当前无有效测距，不能记录');if(!Number.isFinite(referenceM)||referenceM<=0)return say('请填写正数参考斜距（米）');if(records.length&&performance.now()-records.at(-1).recordedMonotonic<2000)return say('请重新布置手机后记录独立实验');records.push({...current,referenceM,recordedAt:new Date().toISOString(),recordedMonotonic:performance.now()});$('record-status').textContent=`已记录 ${records.length} 次；请移动手机重新布置下一次实验。`;};
$('export').onclick=()=>json({schemaVersion:1,records},'experiments.json');
setInterval(()=>{if(current&&performance.now()-current.monotonic>600)invalid();},300);
