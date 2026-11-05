/* Distance-only pinhole approximation. Does not claim a recovered pose. */
(function(root){
 'use strict';
 function validCorners(c){
  if(c?.length!==4||!c.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return false;
  const turns=c.map((p,i)=>{const q=c[(i+1)%4],r=c[(i+2)%4];return(q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});
  return turns.every(v=>v>1e-12)||turns.every(v=>v< -1e-12);
 }
 function estimate(corners,sizeM,k,normalize){
  if(!validCorners(corners)||!Number.isFinite(sizeM)||sizeM<=0||
    ![k?.fx,k?.fy].every(v=>Number.isFinite(v)&&v>0)||![k?.cx,k?.cy].every(Number.isFinite))return null;
  if(corners.some((p,i)=>Math.hypot(p.x-corners[(i+1)%4].x,p.y-corners[(i+1)%4].y)<1))return null;
  const q=normalize?normalize(corners):corners.map(p=>({x:(p.x-k.cx)/k.fx,y:(p.y-k.cy)/k.fy}));
  if(!validCorners(q))return null;
  const lengths=q.map((p,i)=>Math.hypot(p.x-q[(i+1)%4].x,p.y-q[(i+1)%4].y));
  const span=Math.max((lengths[0]+lengths[2])/2,(lengths[1]+lengths[3])/2);
  const x=q.reduce((s,p)=>s+p.x,0)/4,y=q.reduce((s,p)=>s+p.y,0)/4;
  const distanceM=sizeM/span*Math.hypot(1,x,y);
  if(!Number.isFinite(distanceM)||distanceM<=0||distanceM>100)return null;
  return {distanceM,method:'image-scale',solver:'IMAGE_SCALE',rvec:null,tvec:null,translation:null,
   planeDistanceM:null,tiltDeg:null,axisPlaneDeg:null,rmsPx:null,reprojectionPx:null,
   ambiguity:'图像尺度距离粗估；未恢复旋转或平移',smoothed:false};
 }
 // Invert the exact distortion model supported by this OpenCV build.
 function normalizedCorners(cv,corners,c){
  const K=c.cameraMatrix,k={fx:K[0][0],fy:K[1][1],cx:K[0][2],cy:K[1][2]};
  if(!c.distCoeffs.some(v=>v!==0))return corners.map(p=>({x:(p.x-k.cx)/k.fx,y:(p.y-k.cy)/k.fy}));
  const mats=[];
  const mat=(r,col,type,data)=>{const m=cv.matFromArray(r,col,type,data);mats.push(m);return m;};
  try{
   const km=mat(3,3,cv.CV_64F,K.flat()),d=mat(c.distCoeffs.length,1,cv.CV_64F,c.distCoeffs);
   const zero=mat(3,1,cv.CV_64F,[0,0,0]),points=mat(3,1,cv.CV_64FC3,[0,0,1,0,0,1,0,0,1]);
   const projected=new cv.Mat();mats.push(projected);
   const epsilon=1e-5;
   return corners.map(p=>{
    let x=(p.x-k.cx)/k.fx,y=(p.y-k.cy)/k.fy;
    for(let i=0;i<=15;i++){
     points.data64F.set([x,y,1,x+epsilon,y,1,x,y+epsilon,1]);
     cv.projectPoints(points,zero,zero,km,d,projected);
     const a=projected.data64F,rx=a[0]-p.x,ry=a[1]-p.y;
     if(![...a].every(Number.isFinite))return null;
     if(Math.hypot(rx,ry)<=.1)return {x,y};
     if(i===15)return null;
     const j00=(a[2]-a[0])/epsilon,j10=(a[3]-a[1])/epsilon;
     const j01=(a[4]-a[0])/epsilon,j11=(a[5]-a[1])/epsilon,det=j00*j11-j01*j10;
     if(!Number.isFinite(det)||Math.abs(det)<1e-10)return null;
     const dx=(j11*rx-j01*ry)/det,dy=(-j10*rx+j00*ry)/det;
     if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)>1)return null;
     x-=dx;y-=dy;
    }
    return null;
   });
  }finally{mats.forEach(m=>m.delete());}
 }
 const api={estimate,normalizedCorners};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScaleDistance=api;
})(typeof window==='undefined'?globalThis:window);
