// Game flow: loading a level, items, damage, flow-field pathing, triggers, slipgates, intermission and death.
import * as THREE from 'three';
import { Level, S, rayBox } from './level.js';
import { preload, manifest, time as gtime, fog } from './gfx.js';
import { FX } from './fx.js';
import { Player, ARMOR } from './player.js';
import { Monster, MDEF } from './monsters.js';
import { ViewModel, WEAPONS } from './weapons.js';
import { itemModel, Mats, preloadSkins } from './models.js';
import { play, setListener, ambient } from './audio.js';
import { LEVELS } from './levels/index.js';

const ITEMS = {
  health: { snd: 'health', msg: 'You receive 25 health', r: .6 }, health_small: { snd: 'health', msg: 'You receive 15 health', r: .5 },
  mega: { snd: 'health', msg: 'You receive 100 health', r: .7 },
  armor_green: { snd: 'armor', msg: 'You got armor', r: .6 }, armor_yellow: { snd: 'armor', msg: 'You got armor', r: .6 }, armor_red: { snd: 'armor', msg: 'You got armor', r: .6 },
  shells: { snd: 'pickup', msg: 'You got the shells', n: 20 }, nails: { snd: 'pickup', msg: 'You got the nails', n: 25 },
  rockets: { snd: 'pickup', msg: 'You got the rockets', n: 5 }, cells: { snd: 'pickup', msg: 'You got the cells', n: 6 },
  quad: { snd: 'quad', msg: 'You got the Quad Damage', r: .7 },
  key_silver: { snd: 'key', msg: 'You got the silver key', r: .6 }, key_gold: { snd: 'key', msg: 'You got the gold key', r: .6 },
  w_ssg: { snd: 'weapon', w: 2, ammo: ['shells', 5] }, w_nailgun: { snd: 'weapon', w: 3, ammo: ['nails', 30] }, w_snailgun: { snd: 'weapon', w: 4, ammo: ['nails', 30] },
  w_grenade: { snd: 'weapon', w: 5, ammo: ['rockets', 5] }, w_rocket: { snd: 'weapon', w: 6, ammo: ['rockets', 5] }, w_lightning: { snd: 'weapon', w: 7, ammo: ['cells', 15] },
};

export class Game {
  constructor(renderer, hud) {
    this.renderer = renderer; this.hud = hud;
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.05, 400);
    this.vm = new ViewModel();
    this.state = 'title'; this.time = 0; this.levelIndex = 0; this.showCross = true;
    this.renderH = 540;
    this.msgEl = document.getElementById('msgs'); this.centerEl = document.getElementById('center'); this.tintEl = document.getElementById('tint');
    this.msgs = []; this.tint = [0, 0, 0, 0];
  }

  // ------------------------------------------------------------------ levels
  async loadLevel(i, parms) {
    this.levelIndex = i; this.ready = false;
    const def = LEVELS[i];
    if (this.scene) this.dispose();
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0, 0, 0);
    const level = this.level = new Level(def);
    const names = new Set(['sky_back', 'sky_front', 'lava', 'slime', 'water', 'gate', 'plate', 'button', 'cp_incense_brazier', 'carch_1', ...preloadSkins()]);
    for (const c of level.cells) for (const k of ['ft', 'ct', 'wt', 'door', 'secret', 'pt', 'dt']) if (c[k] && typeof c[k] === 'string') { names.add(c[k]); if (manifest[c[k] + '_up']) names.add(c[k] + '_up'); }
    for (const c of level.cells) if (c.box?.t) names.add(c.box.t);
    for (const e of level.ents) if (e.prop) [].concat(e.prop).forEach(n => names.add(n));
    if (def.torch) names.add(def.torch); else names.add('torch_1');
    if (def.arch) names.add(def.arch);
    await preload([...names].filter(n => manifest[n]));
    level.build();
    this.scene.add(level.group);
    fog.value.set(...(def.fog || [0, 0, 0, .012]));
    this.fx = new FX(this.scene, level);
    this.player = this.player || new Player(this);
    this.startParms = parms || this.startParms || null;
    this.player.reset(this.startParms);
    this.monsters = []; this.items = []; this.projectiles = []; this.ambushes = [];
    this.kills = 0; this.totalKills = 0; this.levelTime = 0;
    const start = level.ents.find(e => e.player);
    this.player.pos.copy(start.pos); this.player.yaw = (def.startYaw || 0) * Math.PI / 180; this.player.pitch = 0;
    for (const e of level.ents) {
      if (e.monster) {
        const yaw = (e.yaw ?? def.monsterYaw ?? Math.random() * 360) * Math.PI / 180;
        if (e.ambush) { this.ambushes.push({ e, yaw }); this.totalKills++; continue; }
        this.monsters.push(new Monster(this, e.monster, e.pos, yaw, { boss: e.boss })); this.totalKills++;
      } else if (e.item) this.spawnItem(e.item, e.pos).trig = e.trig;
    }
    this.vm.cur = -1; this.vm.drop = 1; this.vm.models.forEach(m => m.visible = false); this.vm.show(this.player.weapon);
    this.flowT = 0; this.flowWalk = null; this.flowFly = null;
    ambient(def.music || 'crypt');
    this.level.anim.length = 0;
    this.ready = true;
  }

  dispose() {
    this.scene.traverse(o => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
    this.scene = null;
  }

  spawnItem(kind, pos, drop) {
    const mats = new Mats();
    const mesh = itemModel(kind, mats);
    mesh.position.copy(pos); this.scene.add(mesh);
    const it = { kind, pos: pos.clone(), mesh, mats, phase: Math.random() * 6, drop, vel: drop ? new THREE.Vector3((Math.random() - .5) * 2, 4, (Math.random() - .5) * 2) : null, r: .1, h: .2, onGround: false };
    this.items.push(it);
    const l = this.level.modelLight(pos.x, pos.y + .5, pos.z);
    mats.light(l[0] * 2 + .1, l[1] * 2 + .1, l[2] * 2 + .1);
    return it;
  }
  dropItem(kind, pos) { this.spawnItem(kind, pos.clone().setY(pos.y + .5), true).small = true; }

  pickup(it) {
    const P = this.player, d = ITEMS[it.kind];
    let ok = true;
    switch (it.kind) {
      case 'health': case 'health_small': if (P.health >= 100) return false; P.health = Math.min(100, P.health + (it.kind === 'health' ? 25 : 15)); break;
      case 'mega': P.health = Math.min(250, P.health + 100); P.megaT = 5; break;
      case 'armor_green': case 'armor_yellow': case 'armor_red': {
        const [v, ty] = ARMOR[it.kind];
        if (ty * v < P.armorType * P.armor) return false;
        P.armor = v; P.armorType = ty; break;
      }
      case 'shells': case 'nails': case 'rockets': case 'cells': ok = P.give(it.kind, (d.n) * (it.small ? .5 : 1)); if (!ok) return false; break;
      case 'quad': P.quad = this.time + 30; P.quadWarn = false; break;
      case 'key_silver': P.keys.add('silver'); this.level.fire('silver', this); break;
      case 'key_gold': P.keys.add('gold'); this.level.fire('gold', this); break;
      default:
        if (d.w !== undefined) {
          const had = P.weapons[d.w]; P.weapons[d.w] = 1; P.give(d.ammo[0], d.ammo[1]);
          this.message(`You got the ${WEAPONS[d.w].name}`);
          if (!had || d.w > P.weapon) P.select(d.w);
          this.sound(d.snd, null); this.flash([1, .8, .3], .25);
          if (it.trig) this.level.fire(it.trig, this);
          return true;
        }
    }
    this.message(d.msg); this.sound(d.snd, null); this.flash([1, .8, .3], .22);
    if (it.trig) this.level.fire(it.trig, this);
    return true;
  }

  // ------------------------------------------------------------------ queries used by AI and weapons
  movingEnts() { return [this.player, ...this.monsters.filter(m => !m.dead && m.state !== 'dead')]; }
  solidEnts() { return this._solid; }

  traceEnts(o, d, maxT, ignore, rad = 0) {
    let best = null;
    const list = this.monsters;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m === ignore || m.state === 'dead') continue;
      const b = m.box(); b.x0 -= rad; b.x1 += rad; b.z0 -= rad; b.z1 += rad; b.y0 -= rad; b.y1 += rad;
      const h = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b);
      if (h && h.t <= maxT && (!best || h.t < best.t)) best = { t: h.t, ent: m };
    }
    const P = this.player;
    if (P && ignore !== P && !P.dead) {
      const b = { x0: P.pos.x - P.r - rad, x1: P.pos.x + P.r + rad, y0: P.pos.y - rad, y1: P.pos.y + P.h + rad, z0: P.pos.z - P.r - rad, z1: P.pos.z + P.r + rad };
      const h = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b);
      if (h && h.t <= maxT && (!best || h.t < best.t)) best = { t: h.t, ent: P };
    }
    return best;
  }

  aimAt(eye, fwd, max) {
    const hw = this.level.trace(eye.x, eye.y, eye.z, fwd.x, fwd.y, fwd.z, max);
    const t = hw ? hw.t : max, he = this.traceEnts(eye, fwd, t, this.player);
    return eye.clone().addScaledVector(fwd, Math.max(2, he ? he.t : t));
  }

  damage(target, dmg, attacker, from, kind, dir) {
    if (!target || dmg <= 0) return;
    if (target.isPlayer) return target.hurt(dmg, attacker, from, kind, dir);
    if (!dir && from) dir = target.pos.clone().sub(from).setY(0).normalize();
    target.hurt(dmg, attacker, dir, kind);
  }

  radiusDamage(p, dmg, attacker, ignore, kind) {
    const ents = [...this.monsters.filter(m => !m.gibbed), this.player];
    for (const e of ents) {
      if (e === ignore || (e.isPlayer && e.dead)) continue;
      const c = e.pos.clone().setY(e.pos.y + (e.h || 1.7) / 2);
      const pts = dmg - 16 * c.distanceTo(p);
      if (pts <= 0) continue;
      if (this.level.occluded(p.x, p.y, p.z, c.x, c.y, c.z, true)) continue;
      this.damage(e, pts, attacker, p, 'splash', c.clone().sub(p).normalize());
    }
  }

  noise(p) {
    for (const m of this.monsters) if (m.state === 'idle' && m.pos.distanceTo(p) < 14 && !m.ambush) m.wake();
  }

  // breadth-first distance field from the player's cell; walkers respect steps and drops, fliers only open space
  updateFlow() {
    const L = this.level, W = L.w, H = L.h, P = this.player;
    const start = Math.floor(P.pos.z / S) * W + Math.floor(P.pos.x / S);
    const walkF = (c) => {
      if (!c || c.solid) return null;
      if (c.box && !c.box.inset && c.box.y1 < c.c - 1.6 && c.box.y1 > c.f) return c.box.y1;
      return c.f;
    };
    const blocked = (k) => { const c = L.cells[k]; if (!c || c.solid) return true; if (c.liquid === 'lava' || c.liquid === 'slime') return true;
      for (const b of L.boxCells[k]) if (b.mover && b.mover.kind !== 'plat' && b.mover.kind !== 'button' && !b.nonsolid && b.y0 < walkF(c) + 1.5) return true;
      for (const b of L.boxCells[k]) if (!b.mover && b.y1 - walkF(c) > .6 && b.y0 < walkF(c) + 1.6 && (b.x1 - b.x0) > 1) return true;
      return false; };
    for (const fly of [false, true]) {
      const dist = new Int32Array(W * H).fill(-1);
      if (start < 0 || start >= W * H) continue;
      dist[start] = 0; const q = [start];
      for (let qi = 0; qi < q.length; qi++) {
        const k = q[qi], x = k % W, z = (k / W) | 0, ck = L.cells[k];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const nk = nz * W + nx; if (dist[nk] >= 0 || blocked(nk)) continue;
          const cn = L.cells[nk];
          if (!fly) { if (walkF(ck) - walkF(cn) > .62) continue; }   // the monster at nk would have to climb into k
          else if (Math.min(cn.c, ck.c) - Math.max(cn.f, ck.f) < 1.4) continue;
          dist[nk] = dist[k] + 1; q.push(nk);
        }
      }
      if (fly) this.flowFly = dist; else this.flowWalk = dist;
    }
  }

  flowStep(pos, fly) {
    const L = this.level, W = L.w, dist = fly ? this.flowFly : this.flowWalk;
    if (!dist) return null;
    const x = Math.floor(pos.x / S), z = Math.floor(pos.z / S), k = z * W + x;
    let best = dist[k] >= 0 ? dist[k] : 1e9, bx = -1, bz = -1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = (z + dz) * W + (x + dx); if (x + dx < 0 || z + dz < 0 || x + dx >= W || z + dz >= L.h) continue;
      const d = dist[nk]; if (d >= 0 && d < best) { best = d; bx = x + dx; bz = z + dz; }
    }
    if (bx < 0) return dist[k] >= 0 ? this.player.pos : null;
    const c = L.cell(bx, bz);
    // aim at the near edge centre of the next cell, which rounds corners less tightly than its centre
    return new THREE.Vector3((bx + .5) * S, fly ? Math.min(c.c - 1.4, Math.max(c.f + 1.2, this.player.pos.y + 1)) : c.f, (bz + .5) * S);
  }

  // ------------------------------------------------------------------ events
  sound(name, pos, opts) { play(name, pos && pos.x !== undefined ? pos : pos ? { x: (pos.x0 + pos.x1) / 2, y: (pos.y0 + pos.y1) / 2, z: (pos.z0 + pos.z1) / 2 } : null, opts); }
  message(t) { this.msgs.push({ t, until: this.time + 4 }); if (this.msgs.length > 4) this.msgs.shift(); this.renderMsgs(); }
  renderMsgs() { this.msgEl.textContent = ''; for (const m of this.msgs) { const d = document.createElement('div'); d.textContent = m.t; this.msgEl.appendChild(d); } }
  center(t, dur = 2.5) { this.centerEl.textContent = t; this.centerUntil = this.time + dur; }
  flash(col, a) { this.tint = [col[0], col[1], col[2], Math.max(this.tint[3], a)]; }
  shake(p, k) { const d = this.player.pos.distanceTo(p); if (d < 10) this.player.punch = Math.min(1, this.player.punch + k * (1 - d / 10) * .6); }
  secret() { this.center('You found a secret area!'); this.sound('secret', null); }
  onTrigger(name) {
    for (const a of this.ambushes) if (!a.spawned && a.e.ambush === name) {
      a.spawned = true;
      const m = new Monster(this, a.e.monster, a.e.pos, a.yaw); m.state = 'chase'; m.cool = 1.2;
      this.monsters.push(m); this.fx.teleportFog(a.e.pos); this.sound('teleport', a.e.pos);
    }
    const def = this.level.def;
    if (def.onTrigger?.[name]) def.onTrigger[name](this);
  }
  onMonsterDeath(m) { if (m.boss) { this.level.fire('boss', this); this.center('The way out is open'); } }
  onPlayerDeath() { this.deathT = this.time; setTimeout(() => { if (this.player.dead) this.center('You died.\nClick or press Space to restart the level', 99); }, 1200); }

  async restartLevel() { await this.loadLevel(this.levelIndex, this.startParms); this.state = 'play'; this.hud.visible = true; this.center(''); }

  // ------------------------------------------------------------------ frame
  update(dt, input) {
    this.time += dt; gtime.value = this.time;
    const P = this.player, L = this.level;
    this._solid = [P, ...this.monsters.filter(m => m.state !== 'dead' && m.state !== 'down')];
    if (this.state === 'play') {
      this.levelTime += dt;
      P.update(dt, input);
      if (P.dead && input.fire && this.time - this.deathT > 1.5) { input.fire = false; this.restartLevel(); return; }
      if ((this.flowT -= dt) <= 0) { this.flowT = .35; this.updateFlow(); }
    }
    L.update(dt, this);
    for (const m of this.monsters) m.update(dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) { const p = this.projectiles[i]; p.update(dt); if (p.dead) this.projectiles.splice(i, 1); }
    // items: spin, bob, pick up
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.vel) { const res = entityMovePlain(L, it, dt); if (it.onGround) it.vel = null; }
      it.phase += dt;
      it.mesh.position.set(it.pos.x, it.pos.y + (it.kind.startsWith('key') || it.kind === 'quad' || it.kind.startsWith('w_') ? Math.sin(it.phase * 2) * .08 : 0), it.pos.z);
      if (it.kind.startsWith('w_') || it.kind.startsWith('key') || it.kind === 'quad' || it.kind.startsWith('armor')) it.mesh.rotation.y += dt * 1.6;
      if (this.state === 'play' && !P.dead && Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z) < (ITEMS[it.kind].r || .55) + P.r && it.pos.y < P.pos.y + 1.6 && it.pos.y + 1 > P.pos.y) {
        if (this.pickup(it)) { this.scene.remove(it.mesh); this.items.splice(i, 1); }
      }
    }
    // slipgates and teleporters
    if (this.state === 'play' && !P.dead) for (const g of L.gates || []) {
      if (Math.floor(P.pos.x / S) !== g.x || Math.floor(P.pos.z / S) !== g.z) continue;
      if (g.exit) { this.exitLevel(); break; }
      if (g.tele) {
        const dst = L.ents.find(e => e.dest === g.tele);
        if (dst) { this.fx.teleportFog(P.pos.clone()); P.pos.copy(dst.pos); P.vel.set(0, 0, 0); P.yaw = (dst.yaw || 0) * Math.PI / 180; this.fx.teleportFog(dst.pos); this.sound('teleport', null); this.flash([1, 1, 1], .3); }
      }
    }
    // sprites face the camera around their vertical axis
    const cp = this.camera.position;
    for (const s of L.sprites) s.rotation.y = Math.atan2(cp.x - s.position.x, cp.z - s.position.z);
    for (const g of L.gates || []) if (Math.random() < dt * 30) this.fx.add(g.p.x + (Math.random() - .5) * 1.6, g.p.y - 1.4 + Math.random() * 3, g.p.z + (Math.random() - .5) * 1.6, 0, .4, 0, 1, [.6, .7, 1], [.2, .2, .6], .04);
    this.fx.update(dt, this.camera, this);
    // messages and screen tint
    if (this.msgs.length && this.msgs[0].until < this.time) { this.msgs.shift(); this.renderMsgs(); }
    if (this.centerUntil && this.centerUntil < this.time) { this.centerEl.textContent = ''; this.centerUntil = 0; }
    this.tint[3] = Math.max(0, this.tint[3] - dt * 1.4);
    let [r, g, b, a] = this.tint;
    if (P.quad > this.time) { r = r * a + .1 * (1 - a); g = g * a + .2 * (1 - a); b = b * a + 1 * (1 - a); a = Math.max(a, .18); }
    if (P.waterLevel === 3) { const lc = { water: [.2, .4, .6], slime: [.1, .5, .1], lava: [1, .3, 0] }[P.liquid] || [0, 0, 0]; [r, g, b] = lc; a = Math.max(a, .4); }
    this.tintEl.style.background = `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},${a.toFixed(3)})`;
    // view model light and listener
    const pl = L.modelLight(P.pos.x, P.pos.y + 1, P.pos.z), dl = this.fx.dynamicAt(P.pos.x, P.pos.y + 1.4, P.pos.z);
    const lq = (v) => Math.min(1.5, (v) * 2.2 + .12);
    this.vm.update(dt, P, [lq(pl[0] + dl[0]), lq(pl[1] + dl[1]), lq(pl[2] + dl[2])]);
    setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, P.yaw);
  }

  exitLevel() {
    if (this.state !== 'play') return;
    this.state = 'intermission';
    this.sound('teleport', null);
    this.flash([1, 1, 1], .8);
    this.hud.visible = false;
    const t = this.levelTime, mm = Math.floor(t / 60), ss = String(Math.floor(t % 60)).padStart(2, '0');
    const last = this.levelIndex >= LEVELS.length - 1;
    this.interText = `${LEVELS[this.levelIndex].id.toUpperCase()}: ${LEVELS[this.levelIndex].title}\n\nCOMPLETED\n\nTime   ${mm}:${ss}\nKills  ${this.kills} / ${this.totalKills}\nSecrets  ${this.level.secretsFound} / ${this.level.secrets}\n\n` +
      (last ? '' : 'Click to continue');
    this.center(this.interText, 1e9);
    if (last) setTimeout(() => this.finale(), 3500);
    const ip = this.level.def.intermission;
    if (ip) { this.interCam = ip; }
    this.interT = this.time;
  }

  finale() {
    this.state = 'finale';
    this.center(`${this.interText}\n\nThe Shambler is dead and the keep is silent.\nThe slipgate hums, and the dark beyond it waits for you.\n\nTHE END\n\nClick to play again`, 1e9);
  }

  async nextLevel() {
    if (this.state === 'finale') { this.player = null; this.startParms = null; await this.loadLevel(0); this.state = 'play'; this.hud.visible = true; this.center(''); return; }
    const parms = this.player.parms();
    await this.loadLevel(this.levelIndex + 1, parms);
    this.state = 'play'; this.hud.visible = true;
    const def = this.level.def;
    this.center(`${def.id.toUpperCase()}: ${def.title}`, 3);
  }
}

// items and gibs falling: gravity only
import { entityMove } from './physics.js';
function entityMovePlain(L, e, dt) { return entityMove(L, e, dt, null); }
