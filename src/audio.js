// Synthesised sounds (WebAudio, no samples). Positional where it matters. Starts on the first click.
let ctx = null, master, noiseBuf;
const v3 = [0, 0, 0];

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function listen(cam, fwd) {
  if (!ctx) return;
  const l = ctx.listener, p = cam.position;
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
}

function out(pos, gain = 1) {
  const g = ctx.createGain();
  g.gain.value = gain;
  if (!pos || !Number.isFinite(pos.x + pos.y + pos.z)) { g.connect(master); return g; }
  const p = ctx.createPanner();
  Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2.5, rolloffFactor: 1.1, maxDistance: 80 });
  p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
  g.connect(p).connect(master);
  return g;
}

function noise(t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  s.start(t, Math.random()); s.stop(t + dur);
  return s;
}

function filt(type, f, q = 1) {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  return b;
}

function envGain(t, a, peak, d) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  return g;
}

function tone(t, type, f, dur, peak, dst, f1) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(envGain(t, 0.005, peak, dur)).connect(dst);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  whoosh(power = 0.5, dur = 0.25) {
    if (!ctx) return;
    const t = ctx.currentTime, b = filt('bandpass', 300, 1.6);
    b.frequency.setValueAtTime(300, t);
    b.frequency.exponentialRampToValueAtTime(900 + power * 900, t + dur * 0.45);
    b.frequency.exponentialRampToValueAtTime(350, t + dur);
    noise(t, dur + 0.05).connect(b).connect(envGain(t, dur * 0.4, 0.25 + power * 0.35, dur * 0.6)).connect(out());
  },
  flesh(power, pos) {
    if (!ctx) return;
    const t = ctx.currentTime, o = out(pos, 0.9 + power * 0.6);
    noise(t, 0.25).connect(filt('lowpass', 900, 0.8)).connect(envGain(t, 0.004, 0.9, 0.16)).connect(o);
    const sq = filt('bandpass', 1400, 4);
    sq.frequency.setValueAtTime(1600, t); sq.frequency.exponentialRampToValueAtTime(260, t + 0.22);
    noise(t, 0.3).connect(sq).connect(envGain(t + 0.02, 0.01, 0.6, 0.22)).connect(o);
    tone(t, 'sine', 95, 0.18, 0.7, o, 45);
  },
  sever(pos) {
    if (!ctx) return;
    const t = ctx.currentTime, o = out(pos, 1.4);
    this.flesh(1, pos);
    for (let i = 0; i < 3; i++) noise(t + i * 0.018, 0.04).connect(filt('bandpass', 2400 + i * 700, 6)).connect(envGain(t + i * 0.018, 0.002, 0.9, 0.04)).connect(o);
    const wet = filt('bandpass', 700, 3);
    wet.frequency.setValueAtTime(900, t + 0.05); wet.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    noise(t + 0.05, 0.8).connect(wet).connect(envGain(t + 0.05, 0.05, 0.5, 0.65)).connect(o);
  },
  clang(pos) {
    if (!ctx) return;
    const t = ctx.currentTime, o = out(pos, 1);
    for (const [f, a, d] of [[420, 0.5, 0.5], [1070, 0.3, 0.45], [1790, 0.25, 0.3], [2930, 0.15, 0.2], [233, 0.4, 0.35]]) tone(t, 'sine', f * (0.98 + Math.random() * 0.04), d, a, o);
    noise(t, 0.06).connect(filt('highpass', 2500)).connect(envGain(t, 0.002, 0.7, 0.05)).connect(o);
  },
  thud(pos) {
    if (!ctx) return;
    const t = ctx.currentTime, o = out(pos, 0.8);
    tone(t, 'sine', 80, 0.25, 0.8, o, 38);
    noise(t, 0.15).connect(filt('lowpass', 400)).connect(envGain(t, 0.004, 0.5, 0.12)).connect(o);
  },
  moan(pos, pitch = 1) {
    if (!ctx) return;
    const t = ctx.currentTime, dur = 1.5 + Math.random() * 1.6, f0 = (68 + Math.random() * 40) * pitch, o = out(pos, 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.35);
    g.gain.linearRampToValueAtTime(0.32, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(o);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 1.15, t);
    osc.frequency.linearRampToValueAtTime(f0, t + dur * 0.3);
    osc.frequency.linearRampToValueAtTime(f0 * 0.78, t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 4 + Math.random() * 3; lg.gain.value = f0 * 0.05;
    lfo.connect(lg).connect(osc.frequency);
    const f1 = filt('bandpass', 380, 5), f2 = filt('bandpass', 980, 7);
    f1.frequency.setValueAtTime(360, t); f1.frequency.linearRampToValueAtTime(640, t + dur * 0.5); f1.frequency.linearRampToValueAtTime(320, t + dur);
    osc.connect(f1).connect(g);
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    osc.connect(f2).connect(g2).connect(g);
    const br = ctx.createGain(); br.gain.value = 0.12;
    noise(t, dur).connect(filt('bandpass', 650, 1.5)).connect(br).connect(g);
    osc.start(t); osc.stop(t + dur); lfo.start(t); lfo.stop(t + dur);
  },
  growl(pos) {
    if (!ctx) return;
    const t = ctx.currentTime, o = out(pos, 1), osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(130, t); osc.frequency.exponentialRampToValueAtTime(70, t + 0.5);
    const am = ctx.createOscillator(), ag = ctx.createGain();
    am.frequency.value = 28; ag.gain.value = 0.5;
    const g = envGain(t, 0.05, 0.6, 0.5);
    am.connect(ag).connect(g.gain);
    osc.connect(filt('bandpass', 500, 3)).connect(g).connect(o);
    osc.start(t); osc.stop(t + 0.6); am.start(t); am.stop(t + 0.6);
  },
  hurt() {
    if (!ctx) return;
    const t = ctx.currentTime, o = out(null, 0.8);
    tone(t, 'triangle', 190, 0.25, 0.5, o, 110);
    noise(t, 0.2).connect(filt('bandpass', 500, 2)).connect(envGain(t, 0.01, 0.5, 0.18)).connect(o);
  },
  pickup() {
    if (!ctx) return;
    const t = ctx.currentTime, o = out(null, 0.5);
    tone(t, 'triangle', 220, 0.3, 0.4, o); tone(t + 0.06, 'triangle', 330, 0.4, 0.3, o);
    noise(t, 0.1).connect(filt('highpass', 3000)).connect(envGain(t, 0.003, 0.3, 0.08)).connect(o);
  },
  drip(pos) {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(t, 'sine', 900 + Math.random() * 500, 0.06, 0.08, out(pos), 300);
  },
};
