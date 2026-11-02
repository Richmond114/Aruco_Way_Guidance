/* Square homography pose, pinhole camera; input corners must be cyclic. */
(function(root) {
  'use strict';
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), norm=a=>Math.hypot(...a);
  const scale=(a,s)=>a.map(v=>v*s);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function solve(a) {
    for(let i=0;i<8;i++) {
      let pivot=i;
      for(let j=i+1;j<8;j++) if(Math.abs(a[j][i])>Math.abs(a[pivot][i])) pivot=j;
      [a[i],a[pivot]]=[a[pivot],a[i]];
      if(Math.abs(a[i][i])<1e-10) return null;
      const d=a[i][i]; a[i]=a[i].map(v=>v/d);
      for(let j=0;j<8;j++) if(j!==i) {
        const f=a[j][i]; a[j]=a[j].map((v,k)=>v-f*a[i][k]);
      }
    }
    return a.map(row=>row[8]);
  }
  function estimate(corners,sizeM,k,{minEdgePx=12,maxRmsPx=3}={}) {
    if(!k || ![sizeM,k.fx,k.fy].every(v=>Number.isFinite(v)&&v>0) ||
       ![k.cx,k.cy].every(Number.isFinite) || corners?.length!==4 ||
       !corners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))) return null;
    if(corners.some((p,i)=>Math.hypot(p.x-corners[(i+1)%4].x,p.y-corners[(i+1)%4].y)<minEdgePx)) return null;
    const turns=corners.map((p,i)=>{
      const q=corners[(i+1)%4],r=corners[(i+2)%4];
      return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);
    });
    if(!turns.every(v=>v>0)&&!turns.every(v=>v<0)) return null;
    const square=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],a=[];
    square.forEach(([x,y],i)=>{
      const u=(corners[i].x-k.cx)/k.fx,v=(corners[i].y-k.cy)/k.fy;
      a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);
    });
    const h=solve(a); if(!h) return null;
    const c1=[h[0],h[3],h[6]],c2=[h[1],h[4],h[7]],n1=norm(c1),n2=norm(c2);
    if(Math.abs(n1-n2)/(n1+n2)>.2 || Math.abs(dot(c1,c2)/(n1*n2))>.25) return null;
    const r1=scale(c1,1/n1),orth=c2.map((v,i)=>v-dot(c2,r1)*r1[i]);
    const r2=scale(orth,1/norm(orth)),normal=cross(r1,r2);
    const t=scale([h[2],h[5],1],2*sizeM/(n1+n2));
    let error=0;
    for(let i=0;i<4;i++) {
      const [x,y]=square[i],p=t.map((v,j)=>v+sizeM*(x*r1[j]+y*r2[j]));
      if(p[2]<=0) return null;
      error+=(k.fx*p[0]/p[2]+k.cx-corners[i].x)**2+(k.fy*p[1]/p[2]+k.cy-corners[i].y)**2;
    }
    const rms=Math.sqrt(error/4),tiltDeg=Math.acos(Math.min(1,Math.abs(normal[2])))*180/Math.PI;
    if(!Number.isFinite(rms)||rms>maxRmsPx||tiltDeg>85) return null;
    return {distanceM:norm(t),planeDistanceM:Math.abs(dot(t,normal)),tiltDeg,
      axisPlaneDeg:90-tiltDeg,reprojectionPx:rms,translation:t};
  }
  if(typeof module!=='undefined'&&module.exports) module.exports={estimate};
  else root.MarkerPose={estimate};
})(typeof window!=='undefined'?window:globalThis);
