// Boot, renderer, input (mouse + keyboard, touch on phones) and the main loop.
import * as THREE from 'three';
import { loadManifest, preload } from './gfx.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { initAudio, play } from './audio.js';
import { Intro } from './intro.js';
import { preloadSkins } from './models.js';

const view = document.getElementById('view'), veil = document.getElementById('veil'), status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;
const hud = new HUD(document.getElementById('hud'));
const game = new Game(renderer, hud);
window.FLESHVOW = { game, THREE };

// chunky pixels: render at ~540 lines and scale up with nearest filtering (F toggles)
let chunky = true;
function resize() {
  const w = innerWidth, h = innerHeight;
  const target = chunky ? Math.min(1, 540 / h) : Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(target);
  renderer.setSize(w, h, false);
  view.classList.toggle('smooth', !chunky);
  game.renderH = h * target;
  for (const c of [game.camera, game.vm.camera]) { c.aspect = w / h; c.updateProjectionMatrix(); }
  hud.resize(w, h);
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ input
const input = { fwd: 0, side: 0, jump: false, fire: false, walk: false };
const keys = new Set();
const touch = matchMedia('(pointer: coarse)').matches;
if (touch) document.body.classList.add('touch');
let locked = false, paused = false;
const lock = () => { try { const p = view.requestPointerLock?.(); p?.catch?.(() => {}); } catch (e) {} };
const sens = 0.0022;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code >= 'Digit1' && e.code <= 'Digit8') input.weapon = +e.code.slice(5) - 1;
  if (e.code === 'KeyF') { chunky = !chunky; resize(); }
  if (e.code === 'KeyC') game.showCross = !game.showCross;
  if (e.code === 'KeyQ') input.cycle = -1;
  if ((e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') && intro?.running) intro.skip();
  if (e.code === 'Space' && (game.state === 'intermission' || game.state === 'finale')) advance();
  if (e.code === 'Space' && game.state === 'play' && game.player.dead && game.time - game.deathT > 1.5) game.restartLevel();
});
addEventListener('keyup', (e) => keys.delete(e.code));
function readKeys() {
  input.fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + touchMove.f;
  input.side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touchMove.s;
  input.jump = keys.has('Space') || touchJump;
  input.walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (keys.has('ArrowLeft')) game.player.yaw += 2.4 / 60;
  if (keys.has('ArrowRight')) game.player.yaw -= 2.4 / 60;
}
view.addEventListener('mousedown', (e) => {
  if (!locked && !touch && game.state !== 'title') { lock(); }
  if (e.button === 0) input.fire = true;
  if (game.state === 'intermission' && game.time - game.interT > 1.5) advance();
  if (game.state === 'finale') advance();
  if (intro?.running && e.button === 0) intro.skip();
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
addEventListener('wheel', (e) => { if (game.state === 'play') input.cycle = e.deltaY > 0 ? 1 : -1; });
addEventListener('mousemove', (e) => {
  if (!locked || game.state !== 'play' || !game.player || game.player.dead) return;
  game.player.yaw -= e.movementX * sens;
  game.player.pitch = Math.max(-1.5, Math.min(1.5, game.player.pitch - e.movementY * sens));
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === view;
  paused = !locked && game.state === 'play' && !touch && !window.FLESHVOW.test;
  if (paused) { input.fire = false; keys.clear(); game.center('PAUSED\n\nClick to resume', 1e9); }
  else if (game.centerEl.textContent.startsWith('PAUSED')) game.center('', .01);
});

// touch: left stick moves, right side drags to look, buttons fire / jump / next weapon
const touchMove = { f: 0, s: 0 }; let touchJump = false;
if (touch) {
  const stick = document.getElementById('stick'), knob = stick.firstElementChild;
  let sid = null, lid = null, lx = 0, ly = 0;
  const sr = () => stick.getBoundingClientRect();
  addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (el && (el.id === 'tfire')) { input.fire = true; continue; }
      if (el && el.id === 'tjump') { touchJump = true; continue; }
      if (el && el.id === 'tnext') { input.cycle = 1; continue; }
      if (el && (el === stick || el === knob)) { sid = t.identifier; continue; }
      if (t.clientX > innerWidth * .4) { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
    if (intro?.running) intro.skip();
    if (game.state === 'intermission' || game.state === 'finale') advance();
    if (game.player?.dead && game.time - game.deathT > 1.5) game.restartLevel();
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sid) {
        const r = sr(), dx = (t.clientX - r.left - r.width / 2) / (r.width / 2), dy = (t.clientY - r.top - r.height / 2) / (r.height / 2);
        const l = Math.min(1, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
        touchMove.s = Math.cos(a) * l; touchMove.f = -Math.sin(a) * l;
        knob.style.transform = `translate(${Math.cos(a) * l * 40}px, ${Math.sin(a) * l * 40}px)`;
      } else if (t.identifier === lid && game.player) {
        game.player.yaw -= (t.clientX - lx) * .006; game.player.pitch = Math.max(-1.4, Math.min(1.4, game.player.pitch - (t.clientY - ly) * .005));
        lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });
  addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (t.identifier === sid) { sid = null; touchMove.f = touchMove.s = 0; knob.style.transform = ''; }
      if (t.identifier === lid) lid = null;
      if (el && el.id === 'tfire') input.fire = false;
      if (el && el.id === 'tjump') touchJump = false;
    }
    if (!e.touches.length) { input.fire = false; touchJump = false; }
  }, { passive: true });
}

async function advance() {
  if (game.state === 'finale') { await game.nextLevel(); return; }
  if (game.state !== 'intermission') return;
  game.center('', .01);
  await game.nextLevel();
}

// ------------------------------------------------------------------ boot
let intro = null;
async function boot() {
  status.textContent = 'Loading textures…';
  await loadManifest();
  await preload(preloadSkins());
  status.textContent = 'Building the crypt…';
  await game.loadLevel(+(new URLSearchParams(location.search).get('level') || 1) - 1);
  resize();
  game.state = 'title';
  intro = new Intro(game);
  intro.titleCam();
  status.textContent = touch ? 'Tap to enter' : 'Click to enter';
  veil.addEventListener('click', start);
  veil.addEventListener('touchend', start);
  // ?test: start at once, never pause, no damage; FLESHVOW.go(cellX, cellZ, yawDeg, pitchDeg) jumps around
  if (new URLSearchParams(location.search).has('test')) {
    start(); paused = false; game.godMode = true; window.FLESHVOW.test = true;
    window.FLESHVOW.go = (x, z, yaw = 0, pitch = 0, y) => { const P = game.player, c = game.level.cell(Math.floor(x), Math.floor(z)); P.pos.set(x * 2, y ?? c.f, z * 2); P.vel.set(0, 0, 0); P.yaw = yaw * Math.PI / 180; P.pitch = pitch * Math.PI / 180; };
  }
}
let started = false;
function start(e) {
  e?.preventDefault?.();
  if (started) return; started = true;
  initAudio();
  veil.classList.add('hidden');
  if (!touch) lock();
  const skip = new URLSearchParams(location.search).has('nointro');
  if (skip || game.levelIndex > 0) beginPlay(); else intro.play(beginPlay);
}
function beginPlay() {
  game.state = 'play'; hud.visible = true;
  if (!touch && !locked) lock();
  const def = game.level.def;
  game.center(`${def.id.toUpperCase()}: ${def.title}`, 3);
}
window.FLESHVOW.beginPlay = beginPlay;

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt, true);
}
function step(dt, render) {
  if (!game.ready) return;
  if (game.state === 'play' && game.player) readKeys();
  const p = paused && game.state === 'play';
  if (!p) {
    if (intro?.running) intro.update(dt);
    game.update(dt, game.state === 'play' ? input : { fwd: 0, side: 0 });
    if (game.state === 'play' || game.state === 'intermission' && !game.level.def.intermission) game.player.camera(game.camera, game.time);
    if (game.state === 'intermission' || game.state === 'finale') intro?.interCam(dt);
    if (game.state === 'title') intro?.titleUpdate(dt);
  }
  if (!render) return;
  renderer.clear();
  renderer.render(game.scene, game.camera);
  if (game.state === 'play' && !game.player.dead) { renderer.clearDepth(); renderer.render(game.vm.scene, game.vm.camera); }
  hud.draw(game, game.time);
}
window.FLESHVOW.frame = step;
window.FLESHVOW.unpause = () => { paused = false; game.center('', .01); };
window.FLESHVOW.input = input;
requestAnimationFrame(frame);
boot().catch(e => { status.textContent = 'Error: ' + e.message; console.error(e); });
