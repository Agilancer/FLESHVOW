// FLESHVOW: renderer, moonlit night, bloom, the village, the walker, the blade, the shield, and the dead.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setAnisotropy, nightEnv } from './textures.js';
import { buildVillage, BOUND, MOON, FOG } from './village.js';
import { Player } from './player.js';
import { ViewModel } from './viewmodel.js';
import { placePickups, RARITY } from './items.js';
import { Inventory } from './inventory.js';
import { Gore } from './gore.js';
import { Horde } from './zombie.js';
import { Hud } from './hud.js';
import { initAudio, listen, sfx } from './audio.js';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = FOG;
scene.fog = new THREE.FogExp2(FOG, 0.03);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 1000);

scene.add(new THREE.HemisphereLight(0x5b6782, 0x2a2018, 0.7));
const moon = new THREE.DirectionalLight(0x9fb0d6, 0.9);
moon.position.copy(MOON).multiplyScalar(60);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);

const env = nightEnv(renderer);
const { lights, colliders, updaters } = buildVillage(scene);
const player = new Player(camera, document.body, colliders, BOUND);
const vm = new ViewModel(env);
const gore = new Gore(scene, colliders);
const horde = new Horde(scene, gore, colliders);
const hud = new Hud();
const pickups = placePickups(scene, env);
const inv = new Inventory(renderer, env, () => {
  vm.setItems(inv.equip.right, inv.equip.left);
  const max = 100 + Object.values(inv.equip).reduce((a, it) => a + (it.life || 0), 0);
  player.life = Math.min(max, player.life * max / player.maxLife);
  player.maxLife = max;
});
Object.assign(player, { life: 100, maxLife: 100, mana: 50, maxMana: 50, dead: false, speedMul: 1, dynamic: [] });
const lanternPos = lights.map(l => { l.light.parent.updateMatrixWorld(true); return l.light.getWorldPosition(new THREE.Vector3()); });

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const vmPass = new RenderPass(vm.scene, camera);
vmPass.clear = false; vmPass.clearDepth = true;
composer.addPass(vmPass);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.82));
composer.addPass(new OutputPass());
const resize = () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  gore.resize(innerHeight * renderer.getPixelRatio(), camera.fov);
};
addEventListener('resize', resize);
resize();

// ---- flow: veil, inventory, death
const veil = document.getElementById('veil'), status = document.getElementById('status');
let started = false;
THREE.DefaultLoadingManager.onLoad = () => { status.textContent = 'Click to enter the village'; };
veil.addEventListener('click', () => { initAudio(); player.controls.lock(); });
player.controls.addEventListener('lock', () => {
  veil.classList.add('hidden');
  if (!started) { started = true; hud.toast('Something stirs beyond the lanterns...', 4000); }
});
player.controls.addEventListener('unlock', () => {
  vm.held = false; vm.setBlock(false);
  if (inv.isOpen || player.dead) return;
  status.textContent = 'Click to return'; veil.classList.remove('hidden');
});
function toggleInv() {
  if (player.dead) return;
  if (!inv.isOpen) { inv.toggle(true); player.controls.unlock(); }
  else {
    inv.toggle(false); player.controls.lock();
    setTimeout(() => { if (!player.controls.isLocked && !inv.isOpen) { status.textContent = 'Click to return'; veil.classList.remove('hidden'); } }, 400);
  }
}
inv.closeBtn.addEventListener('click', toggleInv);
document.getElementById('dead').addEventListener('click', () => {
  horde.clear(); gore.clear(); director.reset();
  Object.assign(player, { life: player.maxLife, mana: player.maxMana, dead: false });
  player.pos.set(0, 0, 9); player.vel.set(0, 0, 0);
  hud.dead(false); player.controls.lock();
});

// ---- input
addEventListener('mousedown', e => {
  if (!player.controls.isLocked || player.dead) return;
  if (e.button === 0) vm.press();
  if (e.button === 2) vm.setBlock(true);
});
addEventListener('mouseup', e => {
  if (e.button === 0) {
    if (vm.state === 'charge' && vm.charge > 0.95 && player.mana >= 10) player.mana -= 10;
    vm.release();
  }
  if (e.button === 2) vm.setBlock(false);
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.code === 'KeyE' && player.controls.isLocked) take();
  if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); toggleInv(); }
});

// ---- pickups
let near = null;
function take() {
  if (!near) return;
  if (!inv.add(near.item)) { hud.toast('Your pack is full.'); return; }
  near.taken = true;
  scene.remove(near.obj);
  near.light.intensity = 0;
  sfx.pickup();
  hud.toast(`<span style="color:${RARITY[near.item.rarity]}">${near.item.name}</span> taken. Press <b>I</b> to equip it.`);
  near = null;
}
const _f = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
function findPickup() {
  camera.getWorldDirection(_f);
  near = null;
  let best = 0;
  for (const p of pickups) {
    if (p.taken) continue;
    const d = _v.subVectors(p.pos, camera.position), dist = d.length(), look = _f.dot(d.normalize());
    const score = look + (dist < 1.5 ? 0.5 : 0);
    if (dist < 2.8 && score > 0.8 && score > best) { best = score; near = p; }
  }
  hud.prompt(near ? `<b>E</b>Take <span style="color:${RARITY[near.item.rarity]}">${near.item.name}</span>` : null);
}

// ---- the dead come in waves
const director = {
  reset() { Object.assign(this, { n: 0, wave: 0, size: 1, left: 3 + (Math.random() * 3 | 0), timer: 6, interval: 26 }); },
  update(dt) {
    if (!started || player.dead) return;
    this.timer -= dt;
    if (this.timer > 0 || horde.zombies.length >= 12) return;
    this.wave++;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < this.size; i++) {
      const a = a0 + (i - (this.size - 1) / 2) * 0.22;
      let x = Math.cos(a) * 36, z = Math.sin(a) * 36;
      if (Math.hypot(x - player.pos.x, z - player.pos.z) < 20) { x = -x; z = -z; }
      horde.spawn(this.n++, x, z);
    }
    if (--this.left <= 0) {
      this.size = Math.min(this.size + 1, 5);
      this.left = 3 + (Math.random() * 3 | 0);
      this.interval = Math.max(12, 28 - this.size * 3);
      hud.wave(['', '', 'They come in pairs', 'Now in threes', 'Four at a time', 'The dead are legion'][this.size]);
    } else this.interval = Math.max(7, this.interval * 0.84);
    this.timer = this.interval;
    if (this.wave > 1) hud.toast(`Wave ${this.wave}: a moan in the dark`, 2500);
  },
};
director.reset();

// ---- combat
let kills = 0, lastHurt = -9;
horde.onKill = () => { kills++; hud.kills(kills); };
horde.hurtPlayer = (dmg, z) => {
  if (player.dead) return false;
  camera.getWorldDirection(_f).setY(0).normalize();
  const to = _v.subVectors(z.pos, player.pos).setY(0).normalize();
  if (vm.block && vm.raised > 0.7 && _f.dot(to) > 0.34) {
    sfx.clang(_w.copy(z.pos).setY(1.4));
    vm.lh.v.z += 1.2; vm.lh.v.y -= 0.4;
    return true;
  }
  player.life -= dmg; lastHurt = gameT;
  hud.hurt(0.45 + dmg / 25); sfx.hurt();
  player.vel.addScaledVector(to, -2.5);
  if (player.life <= 0) { player.dead = true; player.life = 0; hud.dead(true); player.controls.unlock(); }
  return false;
};
const _d = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
function combat(dt) {
  if (!vm.active) return;
  const w = inv.equip.right;
  for (const h of horde.sweep(vm.segments(5), vm.swing, 0.02)) {
    const base = w ? w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0]) : 2 + Math.random() * 2;
    const dmg = base * (0.6 + vm.charge * 0.9) * (w ? w.undead : 1) * (vm.combo === 4 ? 1.2 : 1);
    _d.subVectors(vm.p1, vm.q1);
    if (_d.lengthSq() < 1e-8) camera.getWorldDirection(_d);
    _d.normalize();
    _s.subVectors(vm.p1, vm.p0).normalize();
    _n.crossVectors(_s, _d).normalize();
    if (_n.lengthSq() < 0.5) _n.set(0, 1, 0);
    const power = Math.min(1.5, dmg / 28);
    const r = h.z.hit({ bone: h.bone, point: h.point, dir: _d.clone(), power, dmg, sever: w ? w.sever : 0, plane: _n.clone() });
    vm.bite(r.severed);
    if (w?.leech) player.life = Math.min(player.maxLife, player.life + dmg * w.leech);
    if (h.point.distanceTo(camera.position) < 1.7 && Math.random() < 0.6) hud.lens();
  }
}

// ---- loop
const vmCtx = {
  vel: player.vel, moonDir: MOON,
  get bob() { return player.bob; },
  nearLights(p, out) {
    const idx = lanternPos.map((q, i) => [q.distanceToSquared(p), i]).sort((a, b) => a[0] - b[0]);
    out.forEach((l, k) => { const i = idx[k][1]; l.position.copy(lanternPos[i]); l.intensity = lights[i].light.intensity; });
  },
};
const clock = new THREE.Clock();
let gameT = 0;
function frame(dt, render = true) {
  const t = gameT += dt;
  player.speedMul = vm.block ? 0.55 : vm.state === 'charge' ? 0.8 : 1;
  player.dynamic = horde.zombies.map(z => ({ x: z.pos.x, z: z.pos.z, r: 0.3 }));
  player.update(dt);
  vm.update(dt, camera, vmCtx, () => player.mana);
  horde.update(dt, t, player);
  combat(dt);
  gore.update(dt, t);
  director.update(dt);
  for (const u of updaters) u(dt, t, camera.position);
  for (const l of lights) {  // lantern flicker
    const n = Math.sin(t * 9.1 + l.seed) * 0.5 + Math.sin(t * 23.7 + l.seed * 2) * 0.3 + Math.sin(t * 3.3 + l.seed) * 0.2;
    l.light.intensity = l.base * (0.88 + n * 0.1);
    l.flame.emissiveIntensity = 5 * (0.9 + n * 0.12);
  }
  if (!player.dead) {
    player.mana = Math.min(player.maxMana, player.mana + dt * 3);
    if (t - lastHurt > 5) player.life = Math.min(player.maxLife, player.life + dt * 1.5);
  }
  if (player.controls.isLocked) findPickup(); else hud.prompt(null);
  hud.bars(player.life, player.maxLife, player.mana, player.maxMana);
  hud.update(dt);
  listen(camera, camera.getWorldDirection(_w));
  if (render) composer.render();
}
renderer.setAnimationLoop(() => {
  try { frame(Math.min(clock.getDelta(), 0.05)); }
  catch (e) { console.error(e); composer.render(); }  // a bug in one system must not freeze the game
});

window.FLESHVOW = { THREE, scene, camera, renderer, player, colliders, lights, vm, inv, horde, gore, hud, pickups, director, take, findPickup, frame };
