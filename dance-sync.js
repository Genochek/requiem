/* One beat clock for the two credit dances. Music will join this clock later. */
(()=>{
 'use strict';
 let bpm=100,epoch=0,pauseAt=0,frame=0,generation=0,active=false,paused=false,dancers=[];
 const plans=[
  {selector:'.credits-cat video',start:.25,end:9.85,beats:16},
  {selector:'.credits-mini-a video',start:0,end:58/24,beats:4}
 ];
 function elapsed(now){const audioTime=window.GameAudio?.musicClock('ost-ending');if(typeof audioTime==='number')return audioTime;return Math.max(0,((paused?pauseAt:now)-epoch)/1000);}
 function align(now,force=false){
  const seconds=elapsed(now),beat=seconds*bpm/60;
  for(const d of dancers){const cycle=beat/d.beats,phase=cycle-Math.floor(cycle),target=d.start+phase*(d.end-d.start);
   d.video.playbackRate=(d.end-d.start)*bpm/(60*d.beats);
   // Seek at loop boundaries or after a stall, never on every frame.
   if(force||Math.abs(d.video.currentTime-target)>.12)d.video.currentTime=target;
   if(!paused&&d.video.paused)d.video.play().catch(()=>{});
   d.video.dataset.danceBeat=String(beat);
  }
 }
 function tick(now){if(!active)return;if(!paused)align(now);frame=requestAnimationFrame(tick);}
 function stop(){generation++;active=false;cancelAnimationFrame(frame);for(const d of dancers)d.video.pause();dancers=[];}
 async function start(){
  stop();const id=generation;
  const selected=plans.map(p=>({...p,video:document.querySelector(p.selector)})).filter(p=>p.video);
  await Promise.all(selected.map(d=>d.video.readyState>=1?Promise.resolve():new Promise(resolve=>{
   d.video.addEventListener('loadedmetadata',resolve,{once:true});d.video.addEventListener('error',resolve,{once:true});
  })));
  if(id!==generation)return;
  dancers=selected.filter(d=>Number.isFinite(d.video.duration));for(const d of dancers){d.end=Math.min(d.end,d.video.duration);d.video.loop=false;d.video.muted=true;}
  paused=document.hidden||!!document.querySelector('dialog[open]');epoch=performance.now();pauseAt=epoch;active=true;align(epoch,true);
  if(!paused)await Promise.all(dancers.map(d=>d.video.play().catch(()=>{})));
  if(id===generation)frame=requestAnimationFrame(tick);
 }
 function setPaused(value){if(!active||value===paused)return;const now=performance.now();if(value){pauseAt=now;paused=true;dancers.forEach(d=>d.video.pause());}else{epoch+=now-pauseAt;paused=false;align(now,true);dancers.forEach(d=>d.video.play().catch(()=>{}));}}
 function setBpm(value){if(!Number.isFinite(value)||value<50||value>200)return;const now=performance.now(),beats=elapsed(now)*bpm/60;bpm=value;epoch=(paused?pauseAt:now)-beats*60000/bpm;if(active)align(now,true);}
 window.CreditsDance={start,stop,setPaused,setBpm,getState:()=>({bpm,active,paused,beat:elapsed(performance.now())*bpm/60,dancers:dancers.map(d=>({beats:d.beats,time:d.video.currentTime,rate:d.video.playbackRate,start:d.start,end:d.end}))})};
})();
