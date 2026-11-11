/* Ambient motion and optional original WebAudio placeholders. No external requests. */
(() => {
  'use strict';
  const themes = {
    pink:  { rgb: [230, 133, 177], glow: [255, 239, 206], mode: 'petal' },
    lilac: { rgb: [172, 145, 222], glow: [255, 222, 242], mode: 'petal' },
    aero:  { rgb: [103, 184, 227], glow: [222, 249, 255], mode: 'bubble' },
    blue:  { rgb: [120, 159, 238], glow: [233, 230, 255], mode: 'bubble' },
    night: { rgb: [225, 171, 100], glow: [255, 229, 180], mode: 'mote' }
  };
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let canvas, ctx, width = 0, height = 0, particles = [];
  let frame = 0, previous = 0, time = 0, motion = true, disposed = true;
  let theme = 'pink', current = [230, 133, 177], accent = [255, 239, 206];
  let sound = false, volume = .55, unlocked = false, audio, master;
  let tickAt = -Infinity, tickCount = 0;
  const voices = new Set();
  const timers = new Set();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rgb = (color, alpha) => `rgba(${color.map(Math.round).join(',')},${alpha})`;
  const allowed = () => !disposed && motion && !preference.matches && !document.hidden && ctx;

  function particle(initial) {
    return { x: initial ? Math.random() * width : -30,
      y: Math.random() * (height + 90) - 45,
      size: 2.4 + Math.random() * 5.5, speed: 17 + Math.random() * 26,
      phase: Math.random() * Math.PI * 2, turn: Math.random() * 6.28,
      alpha: .22 + Math.random() * .32 };
  }
  function resize() {
    if (!canvas || !ctx || disposed) return;
    width = Math.max(1, canvas.clientWidth || window.innerWidth);
    height = Math.max(1, canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = theme === 'night' ? (width < 700 ? 12 : 22) : (width < 700 ? 18 : 40);
    particles = Array.from({ length: count }, () => particle(true));
    paint(0);
  }
  function paint(dt) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!motion || preference.matches) return;
    const target = themes[theme];
    const mix = dt ? 1 - Math.exp(-dt * 1.8) : 1;
    current = current.map((v, i) => v + (target.rgb[i] - v) * mix);
    accent = accent.map((v, i) => v + (target.glow[i] - v) * mix);
    const night = target.mode === 'mote';
    // Broad, moving curl lines are visible at presentation scale without obscuring copy.
    if (!night) {
      ctx.lineWidth = 1.2;
      for (let line = 0; line < 3; line++) {
        const y = height * (.24 + line * .28) + Math.sin(time * .16 + line) * 20;
        const x = ((time * 27 + line * width * .36) % (width + 380)) - 260;
        ctx.strokeStyle = rgb(current, .12);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 90, y - 32, x + 110, y + 38, x + 215, y + 3);
        ctx.bezierCurveTo(x + 269, y - 24, x + 223, y - 49, x + 204, y - 22);
        ctx.stroke();
      }
    }
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.speed * dt * (night ? .3 : 1);
      p.y += Math.sin(time * .8 + p.phase) * dt * 8 + (night ? -3 : 5) * dt;
      p.turn += dt * .65;
      if (p.x > width + 35 || p.y > height + 45 || p.y < -55) particles[i] = particle(false);
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(time * .7 + p.phase) * 14);
      ctx.rotate(p.turn);
      if (target.mode === 'bubble') {
        ctx.strokeStyle = rgb(current, p.alpha * .8);
        ctx.fillStyle = rgb(accent, .12);
        ctx.lineWidth = 1;
        ctx.beginPath();ctx.arc(0, 0, p.size * 1.3, 0, Math.PI * 2);ctx.fill();ctx.stroke();
        ctx.fillStyle = rgb(accent, .65);
        ctx.beginPath();ctx.arc(-p.size * .35, -p.size * .4, Math.max(.8, p.size * .2), 0, Math.PI * 2);ctx.fill();
      } else if (night || i % 6 === 0) {
        const r = night ? p.size * .38 : p.size * .7;
        ctx.fillStyle = rgb(accent, p.alpha * (night ? .55 : .9));
        ctx.beginPath();ctx.moveTo(0, -r);ctx.quadraticCurveTo(r * .13, -r * .13, r, 0);
        ctx.quadraticCurveTo(r * .13, r * .13, 0, r);ctx.quadraticCurveTo(-r * .13, r * .13, -r, 0);
        ctx.quadraticCurveTo(-r * .13, -r * .13, 0, -r);ctx.fill();
      } else {
        ctx.scale(1, .48 + Math.abs(Math.sin(p.turn)) * .52);
        ctx.fillStyle = rgb(current, p.alpha);
        ctx.beginPath();ctx.moveTo(-p.size, 0);
        ctx.bezierCurveTo(-p.size * .3, -p.size, p.size * .9, -p.size * .7, p.size, 0);
        ctx.bezierCurveTo(p.size * .1, p.size * .7, -p.size * .55, p.size * .75, -p.size, 0);ctx.fill();
      }
      ctx.restore();
    }
  }
  function loop(now) {
    frame = 0;
    if (!allowed()) return;
    if (!previous || now - previous >= 1000 / 30) {
      const dt = previous ? Math.min(.07, (now - previous) / 1000) : 0;
      previous = now;time += dt;paint(dt);
    }
    frame = requestAnimationFrame(loop);
  }
  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;previous = 0;
    if (allowed()) frame = requestAnimationFrame(loop);
    else if (ctx && !document.hidden) paint(0);
  }
  function ensureAudio() {
    if (!unlocked || !sound || disposed) return false;
    if (!audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      try { audio = new Context();master = audio.createGain();master.connect(audio.destination); }
      catch { audio = null;return false; }
    }
    master.gain.setTargetAtTime(volume * .16, audio.currentTime, .02);
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio.state !== 'closed';
  }
  function stopVoices() {
    voices.forEach(voice => { try { voice.stop(); } catch {} });
    voices.clear();timers.forEach(clearTimeout);timers.clear();
  }
  function tone(freq, endFreq, duration, type = 'sine', delay = 0, amplitude = .5) {
    if (!audio || !master || voices.size >= 10) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    const at = audio.currentTime + delay;
    oscillator.type = type;oscillator.frequency.setValueAtTime(freq, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, endFreq), at + duration);
    gain.gain.setValueAtTime(.0001, at);gain.gain.exponentialRampToValueAtTime(amplitude, at + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain);gain.connect(master);voices.add(oscillator);
    oscillator.start(at);oscillator.stop(at + duration + .015);
    oscillator.onended = () => { voices.delete(oscillator);oscillator.disconnect();gain.disconnect(); };
  }
  const api = {
    init(options = {}) {
      api.destroy();disposed = false;
      canvas = typeof options.canvas === 'string' ? document.querySelector(options.canvas) : options.canvas;
      canvas ||= document.querySelector('#fx-canvas');
      try { ctx = canvas?.getContext('2d', { alpha: true }) || null; } catch { ctx = null; }
      motion = options.motion !== false;theme = themes[options.theme] ? options.theme : 'pink';
      sound = false;unlocked = false;time = 0;
      window.addEventListener('resize', resize);document.addEventListener('visibilitychange', onVisibility);
      preference.addEventListener('change', sync);resize();sync();return api;
    },
    setTheme(value) { if (!themes[value]) return;const changed = theme !== value;theme = value;if (changed) resize(); },
    setScene(scene = {}) { api.setTheme(scene.theme || (scene.kind === 'night' ? 'night' : theme)); },
    setMotion(value) { motion = Boolean(value);sync();return motion; },
    setVolume(value) { volume = clamp(Number(value) || 0, 0, 1);if (audio && master) master.gain.setTargetAtTime(sound ? volume * .16 : 0, audio.currentTime, .02);return volume; },
    setSound(value) { sound = Boolean(value);if (sound) ensureAudio();else { if (master && audio) master.gain.setTargetAtTime(0, audio.currentTime, .01);stopVoices(); }return sound; },
    async unlock() { unlocked = true;if (!sound) return true;if (!ensureAudio()) return false;try { await audio.resume();return true; } catch { return false; } },
    play(cue) {
      if (!sound || !unlocked || document.hidden || !ensureAudio()) return false;
      if (cue === 'dialog-tick') {
        const now = performance.now();if (now - tickAt < 45 || voices.size > 4) return false;
        tickAt = now;tone(540 + (tickCount++ % 3) * 35, 470, .022, 'square', 0, .12);return true;
      }
      switch (cue) {
        case 'ui-open': tone(520, 830, .10, 'triangle');break;
        case 'ui-close': tone(700, 360, .085, 'triangle', 0, .38);break;
        case 'error': tone(330, 315, .13, 'triangle', 0, .42);tone(247, 235, .16, 'triangle', .11, .38);break;
        case 'bell': tone(1046, 1046, .65, 'sine', 0, .45);tone(1318, 1318, .48, 'sine', .13, .23);break;
        case 'match': tone(85, 430, .07, 'sawtooth', 0, .08);break;
        case 'lamp-on': tone(90, 120, .13, 'triangle', 0, .16);tone(440, 660, .12, 'sine', .08, .22);break;
        case 'lamp-off': tone(180, 45, .14, 'triangle', 0, .25);break;
        case 'transition': tone(660, 440, .24, 'sine', 0, .2);break;
        default: return false;
      }
      return true;
    },
    destroy() {
      disposed = true;if (frame) cancelAnimationFrame(frame);frame = 0;previous = 0;
      window.removeEventListener('resize', resize);document.removeEventListener('visibilitychange', onVisibility);
      preference.removeEventListener('change', sync);stopVoices();
      if (audio) audio.close().catch(() => {});audio = null;master = null;unlocked = false;
      if (ctx) ctx.clearRect(0, 0, width, height);canvas = null;ctx = null;particles = [];
    }
  };
  function onVisibility() { if (document.hidden) stopVoices();sync(); }
  api.play=()=>false;api.unlock=async()=>false;api.setSound=()=>false;window.GameFX=api;
})();
