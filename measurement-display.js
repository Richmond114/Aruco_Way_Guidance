/* Shared display aggregation; never modifies the raw pose or solver cadence. */
(function(root){
 'use strict';
 function create({intervalMs=1000,freshMs=600,historyMs=2000,now=()=>performance.now()}={}){
  let key=null,raw=null,samples=[],summary=null,due=0;
  function reset(){key=null;raw=null;samples=[];summary=null;due=0;}
  function trim(t){samples=samples.filter(s=>t-s.at<=intervalMs);}
  function publish(t){
   trim(t);if(!raw||!samples.length)return;
   const sorted=samples.map(s=>s.value.distanceM).sort((a,b)=>a-b),n=sorted.length;
   const distanceM=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
   // Pick a real pose for angles, not a component-wise average of rotations.
   let representative=samples[0];
   for(const s of samples)if(Math.abs(s.value.distanceM-distanceM)<=Math.abs(representative.value.distanceM-distanceM))representative=s;
   summary={distanceM,representative:representative.value,representativeTime:representative.value.time,
    intervalMs,method:intervalMs?'median':'raw',sampleCount:n,
    windowStartTime:samples[0].value.time,windowEndTime:samples.at(-1).value.time,
    lastSampleMono:samples.at(-1).at,publishedMono:t};
   due=t+intervalMs;
  }
  function read(){
   const t=now();trim(t);
   if(raw&&t-raw.at>freshMs)raw=null;
   if(raw&&summary&&t>=due)publish(t);
   const historical=!raw;
   if(summary&&historical&&t-summary.lastSampleMono>=historyMs)summary=null;
   return {raw:raw?.value||null,summary,historical,ageMs:summary?t-summary.lastSampleMono:null};
  }
  return {
   reset,read,
   context(nextKey){if(key!==nextKey){reset();key=nextKey;return true;}return false;},
   setInterval(ms){if(![0,1000,2000].includes(ms))throw Error('Unsupported display interval');intervalMs=ms;reset();},
   push(nextKey,value){
    if(!Number.isFinite(value.distanceM)||value.distanceM<=0)throw Error('Invalid distance');
    if(key!==nextKey){reset();key=nextKey;}
    const t=now();raw={at:t,value};
    if(!intervalMs)samples=[];
    samples.push(raw);trim(t);
    if(!summary||t>=due||!intervalMs)publish(t);
    return read();
   },
   fail(){raw=null;return read();}
  };
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MeasurementDisplay=api;
})(typeof window==='undefined'?globalThis:window);
