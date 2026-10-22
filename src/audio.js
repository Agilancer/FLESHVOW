// Every sound is synthesised: noise bursts, filtered sweeps and detuned oscillators, positioned with equal-power panning.
// The ambient bed is a slow industrial drone (Quake's soundtrack was dark ambient noise).
let ctx = null, master, sfx, music, noiseBuf, listener = { x: 0, y: 0, z: 0, yaw: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(master);
  sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(comp);
  music = ctx.createGain(); music.gain.value = 0.32; music.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setListener(x, y, z, yaw) { listener.x = x; listener.y = y; listener.z = z; listener.yaw = yaw; }

// output node for a sound at a position (null = in the head)
function out(pos, vol = 1, range = 40) {
  const g = ctx.createGain();
  if (!pos) { g.gain.value = vol; g.connect(sfx); return g; }
  const dx = pos.x - listener.x, dy = (pos.y ?? listener.y) - listener.y, dz = pos.z - listener.z;
  const d = Math.hypot(dx, dy, dz);
  const att = Math.max(0, 1 - d / range); if (att <= 0.01) return null;
  g.gain.value = vol * att * att;
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) {
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
    p.pan.value = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
    g.connect(p); p.connect(sfx);
  } else g.connect(sfx);
  return g;
}

function noise(dest, t, dur, { type = 'lowpass', f0 = 2000, f1 = 200, q = 0.7, vol = 1, attack = 0.002 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(dest);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

function tone(dest, t, dur, { type = 'sine', f0 = 200, f1 = f0, vol = 0.5, attack = 0.005, detune = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

// a growl: sawtooth through a formant-ish band filter with vibrato
function growl(dest, t, dur, f, vol = .5, bright = 900) {
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.7, t + dur);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 18 + Math.random() * 10; const lg = ctx.createGain(); lg.gain.value = f * .12;
  lfo.connect(lg); lg.connect(o.frequency);
  const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = bright; fl.Q.value = 2.5;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(dest); o.start(t); lfo.start(t); o.stop(t + dur + .05); lfo.stop(t + dur + .05);
  noise(dest, t, dur * .8, { type: 'bandpass', f0: bright * 1.5, f1: bright * .8, q: 1.5, vol: vol * .4 });
}

const VOICE = {   // monster voices: base pitch and formant
  dog: [260, 1400], grunt: [120, 700], enforcer: [100, 600], knight: [140, 800], hellknight: [80, 500], ogre: [70, 420],
  scrag: [300, 1800], zombie: [90, 500], fiend: [110, 900], shambler: [55, 320], player: [150, 900],
};

const S = {
  shotgun(d, t) { noise(d, t, .32, { f0: 5000, f1: 300, vol: 1 }); tone(d, t, .14, { f0: 160, f1: 50, vol: .9 }); noise(d, t + .25, .06, { type: 'highpass', f0: 3000, f1: 2500, vol: .25 }); noise(d, t + .34, .05, { type: 'highpass', f0: 2500, f1: 2000, vol: .25 }); },
  ssg(d, t) { noise(d, t, .45, { f0: 4000, f1: 150, vol: 1.2 }); tone(d, t, .2, { f0: 130, f1: 40, vol: 1.1 }); },
  nail(d, t) { tone(d, t, .05, { type: 'square', f0: 1800, f1: 900, vol: .18 }); noise(d, t, .05, { type: 'highpass', f0: 4000, f1: 3000, vol: .3 }); },
  snail(d, t) { tone(d, t, .06, { type: 'square', f0: 1200, f1: 600, vol: .22 }); noise(d, t, .06, { type: 'bandpass', f0: 3000, f1: 1500, vol: .4 }); },
  ric(d, t) { tone(d, t, .12, { type: 'triangle', f0: 3200 + Math.random() * 1500, f1: 2000, vol: .12 }); },
  grenade(d, t) { noise(d, t, .25, { f0: 1500, f1: 200, vol: .8 }); tone(d, t, .12, { f0: 220, f1: 90, vol: .6 }); },
  bounce(d, t) { tone(d, t, .1, { f0: 300, f1: 180, vol: .35, type: 'triangle' }); },
  rocket(d, t) { noise(d, t, .6, { type: 'bandpass', f0: 600, f1: 2400, q: 1.2, vol: .9, attack: .02 }); tone(d, t, .25, { f0: 90, f1: 45, vol: .8 }); },
  explode(d, t) { noise(d, t, 1.4, { f0: 2400, f1: 60, vol: 1.4, attack: .004 }); tone(d, t, .7, { f0: 70, f1: 25, vol: 1.2 }); noise(d, t + .05, .9, { type: 'bandpass', f0: 400, f1: 80, q: .8, vol: .8 }); },
  lightning(d, t) { tone(d, t, .13, { type: 'sawtooth', f0: 60 + Math.random() * 20, f1: 55, vol: .35 }); noise(d, t, .13, { type: 'highpass', f0: 2500, f1: 4000, vol: .3 }); },
  axe(d, t) { noise(d, t, .18, { type: 'bandpass', f0: 600, f1: 2500, q: 1.5, vol: .5, attack: .03 }); },
  axehit(d, t) { tone(d, t, .1, { f0: 140, f1: 60, vol: .7 }); noise(d, t, .12, { f0: 1500, f1: 300, vol: .6 }); },
  thud(d, t) { tone(d, t, .12, { f0: 90, f1: 40, vol: .6 }); noise(d, t, .1, { f0: 600, f1: 100, vol: .3 }); },
  gib(d, t) { for (let i = 0; i < 4; i++) noise(d, t + i * .05, .2, { f0: 800, f1: 120, vol: .7, q: 2 }); tone(d, t, .3, { f0: 90, f1: 30, vol: .6 }); },
  splat(d, t) { noise(d, t, .15, { f0: 1200, f1: 150, vol: .45, q: 3 }); },
  pickup(d, t) { tone(d, t, .12, { type: 'square', f0: 660, vol: .14 }); tone(d, t + .07, .14, { type: 'square', f0: 990, vol: .12 }); },
  health(d, t) { tone(d, t, .25, { type: 'triangle', f0: 440, f1: 880, vol: .25 }); },
  armor(d, t) { noise(d, t, .3, { type: 'bandpass', f0: 2500, f1: 1200, q: 4, vol: .5 }); tone(d, t, .3, { type: 'triangle', f0: 520, f1: 500, vol: .2 }); },
  weapon(d, t) { noise(d, t, .05, { type: 'highpass', f0: 2500, f1: 2000, vol: .5 }); noise(d, t + .14, .06, { type: 'highpass', f0: 2000, f1: 1500, vol: .6 }); tone(d, t + .14, .08, { f0: 300, f1: 200, vol: .3 }); },
  key(d, t) { for (let i = 0; i < 3; i++) tone(d, t + i * .09, .4, { type: 'triangle', f0: 880 * [1, 1.26, 1.5][i], vol: .2 }); },
  quad(d, t) { tone(d, t, 1.2, { type: 'sawtooth', f0: 55, f1: 110, vol: .4 }); tone(d, t, 1.2, { type: 'sawtooth', f0: 82, f1: 165, vol: .3, detune: 8 }); },
  quadfire(d, t) { tone(d, t, .3, { type: 'square', f0: 90, f1: 60, vol: .3 }); },
  secret(d, t) { tone(d, t, .5, { type: 'triangle', f0: 523, vol: .2 }); tone(d, t + .15, .6, { type: 'triangle', f0: 784, vol: .2 }); },
  door(d, t) { noise(d, t, 1.1, { f0: 300, f1: 120, q: 3, vol: .5, attack: .1 }); tone(d, t, 1.0, { type: 'sawtooth', f0: 45, f1: 40, vol: .12, attack: .1 }); },
  plat(d, t) { tone(d, t, 1.4, { type: 'sawtooth', f0: 60, f1: 62, vol: .14, attack: .1 }); noise(d, t, 1.4, { type: 'bandpass', f0: 200, f1: 220, q: 4, vol: .25, attack: .1 }); },
  button(d, t) { tone(d, t, .08, { type: 'square', f0: 200, f1: 150, vol: .3 }); noise(d, t, .2, { f0: 800, f1: 200, vol: .3 }); },
  locked(d, t) { tone(d, t, .3, { type: 'square', f0: 110, f1: 100, vol: .2 }); },
  teleport(d, t) { noise(d, t, 1.0, { type: 'bandpass', f0: 300, f1: 4000, q: 3, vol: .7, attack: .05 }); tone(d, t, .9, { type: 'sine', f0: 200, f1: 1600, vol: .3 }); },
  jump(d, t) { growl(d, t, .14, 170, .18, 1100); },
  land(d, t) { tone(d, t, .1, { f0: 120, f1: 60, vol: .3 }); },
  splash(d, t) { noise(d, t, .5, { f0: 3000, f1: 400, q: 1, vol: .6 }); },
  burn(d, t) { noise(d, t, .3, { type: 'highpass', f0: 1200, f1: 3000, vol: .3 }); },
  pain(d, t, v = 'player') { const [f, b] = VOICE[v] || VOICE.player; growl(d, t, .3, f * 1.1, .55, b * 1.2); },
  death(d, t, v = 'player') { const [f, b] = VOICE[v] || VOICE.player; growl(d, t, .9, f, .6, b); },
  sight(d, t, v) { const [f, b] = VOICE[v] || VOICE.grunt; if (v === 'dog') { for (let i = 0; i < 2; i++) { growl(d, t + i * .18, .12, f, .5, b); } } else growl(d, t, .55, f * 1.2, .5, b * 1.1); },
  idle(d, t, v) { const [f, b] = VOICE[v] || VOICE.grunt; growl(d, t, .8, f * .8, .25, b * .8); },
  melee(d, t) { noise(d, t, .2, { type: 'bandpass', f0: 800, f1: 2000, q: 2, vol: .5, attack: .03 }); },
  claw(d, t) { noise(d, t, .14, { f0: 2000, f1: 400, vol: .6, q: 2 }); tone(d, t, .08, { f0: 140, f1: 70, vol: .4 }); },
  saw(d, t) { tone(d, t, .5, { type: 'sawtooth', f0: 95, f1: 110, vol: .35 }); noise(d, t, .5, { type: 'bandpass', f0: 1800, f1: 1800, q: 3, vol: .3 }); },
  laser(d, t) { tone(d, t, .2, { type: 'square', f0: 1400, f1: 300, vol: .25 }); },
  spit(d, t) { noise(d, t, .25, { type: 'bandpass', f0: 1500, f1: 600, q: 4, vol: .5 }); },
  fireball(d, t) { noise(d, t, .4, { type: 'bandpass', f0: 400, f1: 1200, q: 2, vol: .6 }); },
  zap(d, t) { tone(d, t, .5, { type: 'sawtooth', f0: 80, f1: 120, vol: .4 }); noise(d, t, .5, { type: 'highpass', f0: 2000, f1: 5000, vol: .35 }); },
  meatthrow(d, t) { noise(d, t, .2, { f0: 1000, f1: 300, vol: .4, q: 2 }); },
  gate(d, t) { noise(d, t, 2, { type: 'bandpass', f0: 200, f1: 900, q: 6, vol: .5, attack: .3 }); },
  talk(d, t) { tone(d, t, .08, { type: 'square', f0: 330, vol: .08 }); },
};

export function play(name, pos, opts = {}) {
  if (!ctx || !S[name]) return;
  const o = out(pos, opts.vol ?? 1, opts.range ?? 40);
  if (!o) return;
  S[name](o, ctx.currentTime + (opts.delay || 0), opts.voice);
}

// ------------------------------------------------------------ ambient drone per level
let amb = null;
export function ambient(kind) {
  if (!ctx) return;
  if (amb) { amb.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 2); const old = amb; setTimeout(() => old.stop(), 2500); amb = null; }
  if (!kind) return;
  const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(music);
  g.gain.linearRampToValueAtTime(1, ctx.currentTime + 4);
  const nodes = [];
  const base = { crypt: 41.2, cathedral: 36.7, keep: 32.7, title: 43.65 }[kind] || 41.2;
  for (const [mul, det, type, vol] of [[1, 0, 'sawtooth', .16], [1.5, 7, 'sawtooth', .07], [2, -5, 'triangle', .1], [.5, 3, 'sine', .25]]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = base * mul; o.detune.value = det;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 4;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.03 + Math.random() * 0.05; const lg = ctx.createGain(); lg.gain.value = 160;
    lfo.connect(lg); lg.connect(f.frequency);
    const og = ctx.createGain(); og.gain.value = vol;
    o.connect(f); f.connect(og); og.connect(g); o.start(); lfo.start(); nodes.push(o, lfo);
  }
  // wind / machinery hiss
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = kind === 'keep' ? 500 : 260; nf.Q.value = 0.8;
  const nl = ctx.createOscillator(); nl.frequency.value = 0.07; const nlg = ctx.createGain(); nlg.gain.value = 140; nl.connect(nlg); nlg.connect(nf.frequency);
  const ng = ctx.createGain(); ng.gain.value = kind === 'keep' ? .18 : .1;
  n.connect(nf); nf.connect(ng); ng.connect(g); n.start(); nl.start(); nodes.push(n, nl);
  // occasional distant metallic scrapes and knocks
  const iv = setInterval(() => {
    if (!ctx || Math.random() < .5) return;
    const t = ctx.currentTime;
    if (Math.random() < .5) noise(g, t, 2.5, { type: 'bandpass', f0: 900 + Math.random() * 1500, f1: 300, q: 18, vol: .25, attack: .6 });
    else for (let i = 0; i < 3; i++) tone(g, t + i * .5, .4, { f0: 60, f1: 40, vol: .2 });
  }, 4000);
  amb = { g, stop() { clearInterval(iv); nodes.forEach(o => { try { o.stop(); } catch (e) {} }); g.disconnect(); } };
}

export function musicSting() {
  if (!ctx) return;
  const t = ctx.currentTime, d = music;
  for (const [f, dt] of [[65.4, 0], [98, .02], [130.8, .04], [77.8, .06]]) tone(d, t + dt, 4, { type: 'sawtooth', f0: f, f1: f * .98, vol: .25, attack: .6 });
  noise(d, t, 4, { type: 'bandpass', f0: 200, f1: 2000, q: 2, vol: .3, attack: 1.5 });
}
