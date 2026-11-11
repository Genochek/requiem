/* User-authored recordings; independent music, ambience, effects and voice buses. */
(()=>{
 'use strict';if(window.REQUIEM_SILENT)return;
 const files=window.GAME_SOUNDS||{},meta=window.GAME_AUDIO_META||{},buffers=new Map(),loading=new Map(),counters=new Map(),effects=new Set(),tracks=new Set(),events=[],failures=[];
 const aliases={bell:'school-bell',match:'match-light','system-notice':'sistemnoe-yvedomlemie','ui-open':'window-expand','ui-close':'window-close'};
 let ac,master,musicBus,ambienceBus,fxBus,voiceBus,limiter,meter,reverb,wet,timer;
 let enabled=false,unlocked=false,paused=false,volume=.85,musicVolume=.53,fxVolume=.55,voiceVolume=.45,ambienceVolume=.5;
 let location='menu',sceneId=0,overlay=false,dramatic=false,held=false,current=null,pending=null,generation=0,lastVoice=-1,lastHover=-1,duckUntil=0,maxPeak=0,tape=null,tapeHeld=false,alive=true,preparation=null;
 const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
 const log=(type,data={})=>{events.push({type,time:ac?.currentTime||0,...data});if(events.length>500)events.shift();};
 let visualLocation='menu',pointerPan=0;
 document.addEventListener('pointerdown',e=>{pointerPan=clamp((e.clientX/innerWidth-.5)*.8,-.4,.4);},{passive:true});
 const indoors=()=>['classroom','library','bedroom','bedroom-natsuki'].includes(visualLocation);
 function windowPan(){return visualLocation==='library'?-.28:visualLocation==='classroom'||visualLocation==='bedroom-natsuki'?.3:.15;}
 function ambiencePan(key){return key==='amb-birds'?windowPan():key==='amb-wind'?windowPan()*.6:key==='amb-classroom'?.1:0;}
 function ambienceLevel(key){return key==='amb-birds'?(indoors()?.25:1):key==='amb-wind'?.5:1;}
 function spatialEffect(key,options){
  // Speaker-safe depth: equal-power panning only; no HRTF, delay or polarity inversion.
  if(!ac.createStereoPanner)return null;const node=ac.createStereoPanner();let pan=0;
  if(/ui-click|ui-hover|window-close/.test(key)){const cursor=document.getElementById('scripted-cursor');pan=cursor&&getComputedStyle(cursor).display!=='none'?clamp((cursor.getBoundingClientRect().left/innerWidth-.5)*.8,-.4,.4):pointerPan;}
  else if(/window-expand|^error$|sistemnoe/.test(key)){const win=document.querySelector('.system-layer .lesson-window');if(win){const r=win.getBoundingClientRect();pan=clamp(((r.left+r.width/2)/innerWidth-.5)*.7,-.35,.35);}}
  else if(/book-|page-turn|writing|paper-rustle/.test(key))pan=-.12;
  else if(/steps-|door-|chair-move/.test(key))pan=-.18;
  pan=clamp(pan,-.3,.3);node.pan.value=pan;return{node,rear:false,pan};
 }
 function family(name){const key=aliases[name]||name;return files[key]?[key]:Object.keys(files).filter(k=>k.startsWith(key+'-')).sort();}
 function timing(name,rotate=false){const keys=family(name);if(!keys.length)return null;const i=counters.get(name)||0,key=keys[i%keys.length];if(rotate)counters.set(name,i+1);return{key,duration:meta[key]?.duration||.4,focus:meta[key]?.focus||0,onsetTrim:meta[key]?.onsetTrim||0};}
 function graph(){if(ac)return true;const C=window.AudioContext||window.webkitAudioContext;if(!C)return false;ac=new C();
  master=ac.createGain();musicBus=ac.createGain();ambienceBus=ac.createGain();fxBus=ac.createGain();voiceBus=ac.createGain();limiter=ac.createDynamicsCompressor();meter=ac.createAnalyser();
  limiter.threshold.value=-3;limiter.knee.value=1;limiter.ratio.value=20;limiter.attack.value=.002;limiter.release.value=.1;
  const guard=ac.createWaveShaper(),curve=new Float32Array(65537);for(let i=0;i<curve.length;i++)curve[i]=clamp(i/(curve.length-1)*2-1,-.891,.891);guard.curve=curve;guard.oversample='4x';
  musicBus.connect(master);ambienceBus.connect(master);fxBus.connect(master);voiceBus.connect(master);master.connect(limiter);limiter.connect(guard);guard.connect(meter);meter.connect(ac.destination);meter.fftSize=2048;
  master.gain.value=enabled?volume:0;musicBus.gain.value=musicVolume;ambienceBus.gain.value=ambienceVolume;fxBus.gain.value=fxVolume;voiceBus.gain.value=voiceVolume;
  reverb=ac.createConvolver();wet=ac.createGain();wet.gain.value=.035;const ir=ac.createBuffer(1,Math.round(ac.sampleRate*.45),ac.sampleRate);let seed=71;for(let c=0;c<1;c++){const data=ir.getChannelData(c);for(let i=0;i<data.length;i++){seed=seed*16807%2147483647;data[i]=(seed/1073741823.5-1)*Math.pow(1-i/data.length,4)*.17;}}reverb.buffer=ir;reverb.connect(wet);wet.connect(fxBus);
  timer=setInterval(tick,40);return true;
 }
 function decode(key){if(buffers.has(key))return Promise.resolve(buffers.get(key));if(loading.has(key))return loading.get(key);if(!files[key]||!graph())return Promise.resolve(null);const promise=fetch(files[key]).then(r=>{if(!r.ok)throw Error(r.status);return r.arrayBuffer();}).then(b=>ac.decodeAudioData(b)).then(b=>{if(key==='book-close'&&b.numberOfChannels>1){/* Preserve the stronger direct channel instead of cancelling the original stereo transient in mono. */let best=0,power=-1;for(let c=0;c<b.numberOfChannels;c++){let e=0;for(const v of b.getChannelData(c))e+=v*v;if(e>power){power=e;best=c}}const mono=ac.createBuffer(1,b.length,b.sampleRate);mono.copyToChannel(b.getChannelData(best),0);b=mono;}buffers.set(key,b);return b;}).catch(e=>{failures.push({key,error:String(e)});return null;});loading.set(key,promise);return promise;}

 let mediaPrimeStarted=false;
 function primeMedia(){if(mediaPrimeStarted)return;mediaPrimeStarted=true;const keys=Object.keys(files).filter(k=>(k.startsWith('ost-')||k.startsWith('amb-'))&&files[k].startsWith('data:'));let i=0;const worker=async()=>{while(i<keys.length&&alive){const key=keys[i++];try{const blob=await fetch(files[key]).then(r=>r.blob());files[key]=URL.createObjectURL(blob);}catch{}await new Promise(r=>setTimeout(r,10));}};setTimeout(()=>Promise.all([worker(),worker()]),0);}
 function prepare(){primeMedia();if(preparation)return preparation;if(!Object.keys(files).length||!graph())return Promise.resolve();const keys=Object.keys(files).filter(k=>!k.startsWith('ost-')&&!k.startsWith('amb-')),fast=keys.filter(k=>(meta[k]?.duration||0)<2.3),deferred=keys.filter(k=>!fast.includes(k));preparation=Promise.all(fast.map(decode));preparation.then(()=>{let i=0;Promise.all(Array.from({length:2},async()=>{while(i<deferred.length&&alive)await decode(deferred[i++]);}));});return preparation;}
 function desired(){if(held||tapeHeld)return null;if(overlay)return files['ost-error']?'ost-error':null;if(dramatic&&files['ost-night'])return'ost-night';const map={menu:'ost-menu',ending:'ost-ending',classroom:sceneId>=12&&files['ost-presentation']?'ost-presentation':'ost-classroom',school:'ost-outside',home:'ost-outside',hallway:'ost-school',stairs:'ost-school',bedroom:'ost-home','bedroom-natsuki':'ost-home',library:'ost-library'};return files[map[location]]?map[location]:null;}
 function dispose(t){if(!tracks.has(t))return;tracks.delete(t);t.el.pause();t.el.removeAttribute('src');t.el.load();for(const node of t.nodes)node.disconnect();if(current===t)current=null;}
 function fade(t,seconds=1.2){if(!t||!tracks.has(t))return;const now=ac.currentTime;t.gain.gain.cancelScheduledValues(now);t.gain.gain.setValueAtTime(t.gain.gain.value,now);t.gain.gain.linearRampToValueAtTime(0,now+seconds);t.disposeAt=now+seconds+.05;}
 async function stream(key,{ambient=false,fadeIn=1.5}={}){
  if(!enabled||!unlocked||paused||document.hidden||!files[key])return null;
  const el=new Audio();el.preload='auto';el.playsInline=true;el.src=files[key];const source=ac.createMediaElementSource(el),gain=ac.createGain();gain.gain.value=0;const nodes=[source,gain];let ambientPan=null,ambientLow=null;
  source.connect(gain);
  if(ambient){const high=ac.createBiquadFilter(),low=ac.createBiquadFilter();high.type='highpass';high.frequency.value=key==='amb-wind'?75:100;low.type='lowpass';ambientLow=low;low.frequency.value=/classroom|corridor/.test(key)?3200:7500;gain.connect(high);high.connect(low);if(ac.createStereoPanner){const pan=ac.createStereoPanner();pan.pan.value=ambiencePan(key);ambientPan=pan;low.connect(pan);pan.connect(ambienceBus);nodes.push(pan);}else low.connect(ambienceBus);nodes.push(high,low);}else gain.connect(musicBus);
  const t={key,ambient,el,source,gain,nodes,ambientPan,ambientLow,disposeAt:Infinity};tracks.add(t);
  try{await el.play();if(!enabled||!alive){dispose(t);return null;}gain.gain.setValueAtTime(0,ac.currentTime);gain.gain.linearRampToValueAtTime(ambient?ambienceLevel(key):1,ac.currentTime+fadeIn);if(paused||document.hidden){el.pause();t.resume=true;}log(ambient?'ambience-start':'music-start',{key});return t;}catch(e){dispose(t);if(e.name!=='AbortError')failures.push({key,error:String(e)});return null;}
 }
 async function syncMusic(){if(!ac||!enabled||!unlocked||paused||document.hidden)return;const key=desired();if(current?.key===key||pending===key)return;const id=++generation;pending=key;
  if(!key){if(current)fade(current,1.4);current=null;pending=null;return;}
  const t=await stream(key);if(!t){if(id===generation)pending=null;return;}if(id!==generation||key!==desired()){fade(t,.3);return;}const old=current;current=t;pending=null;if(old&&old!==t)fade(old,1.5);
 }
 function wantedAmbience(){if(location==='menu'||location==='ending')return[];if(['school','home'].includes(location))return['amb-wind','amb-birds'];if(['hallway','stairs'].includes(location))return['amb-corridor'];if(location==='classroom')return['amb-classroom','amb-birds'];if(location==='library')return['amb-library','amb-birds'];return['amb-home'];}
 const pendingAmbience=new Set();let ambienceGeneration=0;
 async function syncAmbience(){if(!ac||!enabled||!unlocked||paused||document.hidden)return;const wanted=wantedAmbience(),id=ambienceGeneration;for(const t of tracks)if(t.ambient&&!wanted.includes(t.key))fade(t,1.3);
  for(const key of wanted)if(files[key]&&!pendingAmbience.has(key)&&![...tracks].some(t=>t.ambient&&t.key===key&&t.disposeAt===Infinity)){pendingAmbience.add(key);const t=await stream(key,{ambient:true,fadeIn:2});pendingAmbience.delete(key);if(t&&(id!==ambienceGeneration||!wantedAmbience().includes(key)))fade(t,.4);}
 }
 function duck(seconds=.5,amount=.65){if(!ac)return;duckUntil=Math.max(duckUntil,ac.currentTime+seconds);musicBus.gain.setTargetAtTime(musicVolume*amount,ac.currentTime,.045);}
 function tick(){if(!ac||ac.state!=='running'||paused||document.hidden)return;const now=ac.currentTime;
  for(const t of [...tracks]){if(now>=t.disposeAt){dispose(t);continue;}if(Number.isFinite(t.el.duration)&&t.disposeAt===Infinity&&!t.replacing&&t.el.duration-t.el.currentTime<1.7&&t.el.duration-t.el.currentTime>0){if(t.key==='ost-ending'){t.replacing=true;fade(t,Math.max(.1,t.el.duration-t.el.currentTime));}else if(t.ambient||current===t){t.replacing=true;const key=t.key;stream(key,{ambient:t.ambient,fadeIn:1.4}).then(next=>{if(!next)return;if(t.ambient){if(!wantedAmbience().includes(key)){fade(next,.2);return;}}else if(current===t&&desired()===key)current=next;else{fade(next,.2);return;}fade(t,1.4);});}}}
  if(tape){const f=clamp((now-tape.start)/tape.duration);if(tracks.has(tape.track)){tape.track.el.preservesPitch=false;tape.track.el.webkitPreservesPitch=false;tape.track.el.playbackRate=Math.max(.0625,Math.pow(1-f,1.65));}if(f>=1){dispose(tape.track);tape=null;}}
  if(now>=duckUntil)musicBus.gain.setTargetAtTime(musicVolume,now,.25);
  const wave=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(wave);for(const v of wave)maxPeak=Math.max(maxPeak,Math.abs(v));
 }
 function play(name,options={}){const info=timing(name,true);if(!info)return null;if(!enabled||!unlocked||!ac||ac.state!=='running'||paused||document.hidden)return info;const isVoice=info.key.startsWith('voice-'),now=ac.currentTime;
  if(isVoice&&now-lastVoice<.049)return info;if(name==='ui-hover'&&now-lastHover<.12)return info;if(isVoice)lastVoice=now;if(name==='ui-hover')lastHover=now;
  const requested=performance.now();const start=buffer=>{if(!buffer||!enabled||paused||document.hidden||performance.now()-requested>(isVoice?120:350))return;const src=ac.createBufferSource(),gain=ac.createGain();src.buffer=buffer;src.playbackRate.value=isVoice?(options.pitch||1):1;gain.gain.value=options.gain??1;src.connect(gain);const spatial=isVoice?null:spatialEffect(info.key,options);if(spatial){gain.connect(spatial.node);spatial.node.connect(fxBus);}else gain.connect(isVoice?voiceBus:fxBus);if(/school-bell|applause|door-|steps-/.test(info.key))gain.connect(reverb);
   if(name==='ui-hover')gain.gain.value*=.45;
   const entry={key:info.key,source:src,gain,spatial,start:ac.currentTime,duration:buffer.duration};effects.add(entry);src.onended=()=>{effects.delete(entry);src.disconnect();gain.disconnect();spatial?.node.disconnect();log('effect-ended',{key:info.key,elapsed:ac.currentTime-entry.start,expected:buffer.duration/src.playbackRate.value});};src.start();log(isVoice?'voice':'effect',{key:info.key,rate:src.playbackRate.value});if(isVoice)duck(.2,.82);else if(/school-bell|applause|answer-correct|^error$/.test(info.key))duck(Math.min(info.duration,4),.58);};
  if(buffers.has(info.key))start(buffers.get(info.key));else decode(info.key).then(start);return info;
 }
 const api={prepare,timing:name=>timing(name),play,
  async unlock(){unlocked=true;if(!graph())return false;if(paused)return true;const resumed=ac.resume();prepare();if(enabled){syncMusic();syncAmbience();}await resumed;return true;},
  setSound(v){enabled=!!v;if(!ac)return;master.gain.setTargetAtTime(enabled?volume:0,ac.currentTime,.06);if(enabled&&unlocked&&!paused){ac.resume();for(const t of tracks)if(t.el.paused)t.el.play().catch(()=>{});syncMusic();syncAmbience();}else if(!enabled)for(const t of tracks){setTimeout(()=>{if(!enabled)t.el.pause();},200);}log('enabled',{enabled});},
  setVolume(v){volume=clamp(+v||0);if(ac)master.gain.setTargetAtTime(enabled?volume:0,ac.currentTime,.04);},
  setMusicVolume(v){musicVolume=clamp(+v||0);if(ac)musicBus.gain.setTargetAtTime(musicVolume,ac.currentTime,.08);},
  setEffectsVolume(v){fxVolume=clamp(+v||0);if(ac)fxBus.gain.setTargetAtTime(fxVolume,ac.currentTime,.04);},
  setVoiceVolume(v){voiceVolume=clamp(+v||0,0,1.5);if(ac)voiceBus.gain.setTargetAtTime(voiceVolume,ac.currentTime,.04);},
  setScene(s={}){const changed=sceneId!==s.id;if(changed){tapeHeld=false;dramatic=false;if(tape){fade(tape.track,.4);if(current===tape.track)current=null;tape=null;}}sceneId=s.id||0;location=s.location||'menu';visualLocation=s.visualLocation||location;if(ac)for(const t of tracks)if(t.ambient&&t.disposeAt===Infinity){t.ambientPan?.pan.setTargetAtTime(ambiencePan(t.key),ac.currentTime,.4);t.gain.gain.cancelScheduledValues(ac.currentTime);t.gain.gain.setTargetAtTime(ambienceLevel(t.key),ac.currentTime,.5);if(t.key==='amb-birds')t.ambientLow?.frequency.setTargetAtTime(indoors()?4300:7500,ac.currentTime,.4);}overlay=false;held=!!s.hold;ambienceGeneration++;syncMusic();syncAmbience();},
  setOverlay(v){overlay=!!v;if(overlay)tapeHeld=false;syncMusic();if(ac)ambienceBus.gain.setTargetAtTime(ambienceVolume*(overlay?.4:1),ac.currentTime,.3);},
  setDramatic(v){dramatic=!!v;tapeHeld=false;syncMusic();},
  holdMusic(v){held=!!v;syncMusic();},
  tapeStop(seconds=3.1){if(!current||!ac)return;const track=current;tapeHeld=true;tape={track,start:ac.currentTime,duration:seconds};track.gain.gain.cancelScheduledValues(ac.currentTime);track.gain.gain.setValueAtTime(track.gain.gain.value,ac.currentTime);track.gain.gain.linearRampToValueAtTime(0,ac.currentTime+seconds);log('tape-stop',{key:track.key,seconds});},
  setPaused(v){if(paused===!!v)return;paused=!!v;if(!ac)return;if(paused){for(const t of tracks){t.resume=!t.el.paused;t.el.pause();}ac.suspend();}else if(enabled&&unlocked&&!document.hidden){ac.resume();for(const t of tracks)if(t.resume){t.el.play().catch(()=>{});t.resume=false;}syncMusic();syncAmbience();}},
  setSequenceRate(){/* FX and voice samples retain their original duration. */},
  fadeMusic(seconds=3){held=true;generation++;pending=null;if(current){fade(current,seconds);current=null;}},
  musicDuration:key=>meta[key]?.duration||0,
  musicClock(key){return enabled&&current?.key===key?current.el.currentTime:null;},
  status(){return{spatial:{speakerSafe:true,visualLocation,windowPan:windowPan(),ambience:[...tracks].filter(t=>t.ambient&&t.disposeAt===Infinity).map(t=>({key:t.key,pan:t.ambientPan?.pan.value||0,level:ambienceLevel(t.key)})),effects:[...effects].filter(e=>e.spatial).map(e=>({key:e.key,rear:false,pan:e.spatial.pan}))},enabled,unlocked,paused,context:ac?.state||'none',track:current?.key||null,musicTime:current?.el.currentTime||0,musicRate:current?.el.playbackRate||0,ambience:[...tracks].filter(t=>t.ambient&&t.disposeAt===Infinity).map(t=>t.key),loaded:[...buffers.keys()],effects:[...effects].map(e=>e.key),failures:[...failures],events:[...events],maxPeakDb:maxPeak?20*Math.log10(maxPeak):null,streamingTracks:tracks.size,buses:{music:musicVolume,voice:voiceVolume,effects:fxVolume,ambience:ambienceVolume}};},
  async destroy(){alive=false;clearInterval(timer);generation++;for(const t of [...tracks])dispose(t);for(const e of effects)try{e.source.stop();}catch{}effects.clear();await ac?.close();ac=null;}
 };window.GameAudio=api;
})();
