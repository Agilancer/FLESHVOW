// Weapons (Quake's eight, with Quake's numbers), the first-person view model, projectiles and splash damage.
import * as THREE from 'three';
import { Mats, WEAPON_MODELS, finish, box, cyl, ball, cone } from './models.js';
import { rayBox } from './level.js';
import { Q } from './physics.js';

export const WEAPONS = [
  { id: 'axe', name: 'Axe', ammo: null, use: 0, rate: .5, kick: .3 },
  { id: 'shotgun', name: 'Shotgun', ammo: 'shells', use: 1, rate: .5, kick: .5, sound: 'shotgun' },
  { id: 'ssg', name: 'Double-barrelled Shotgun', ammo: 'shells', use: 2, rate: .7, kick: .9, sound: 'ssg' },
  { id: 'nailgun', name: 'Nailgun', ammo: 'nails', use: 1, rate: .1, kick: .12, sound: 'nail' },
  { id: 'snailgun', name: 'Super Nailgun', ammo: 'nails', use: 2, rate: .1, kick: .16, sound: 'snail' },
  { id: 'grenade', name: 'Grenade Launcher', ammo: 'rockets', use: 1, rate: .6, kick: .6, sound: 'grenade' },
  { id: 'rocket', name: 'Rocket Launcher', ammo: 'rockets', use: 1, rate: .8, kick: .8, sound: 'rocket' },
  { id: 'lightning', name: 'Thunderbolt', ammo: 'cells', use: 1, rate: .1, kick: .05, sound: 'lightning' },
];
export const MAXAMMO = { shells: 100, nails: 200, rockets: 100, cells: 100 };

// ------------------------------------------------------------------ the view model (own scene, drawn over the world)
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.mats = new Mats();
    this.models = WEAPON_MODELS.map(f => { const g = f(this.mats, 1); g.visible = false; this.scene.add(g); return g; });
    // Quake held its guns low and centred
    this.rest = [[.14, -.22, -.42], [.03, -.21, -.56], [.03, -.21, -.56], [.03, -.17, -.5], [.03, -.18, -.52], [.03, -.18, -.5], [.03, -.2, -.5], [.03, -.18, -.5]];
    this.models.forEach(m => m.scale.multiplyScalar(.85));
    const fm = new THREE.SpriteMaterial({ color: 0xffd080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.flash = new THREE.Sprite(fm); this.flash.scale.set(.18, .18, 1); this.scene.add(this.flash);
    this.cur = -1; this.drop = 1; this.kick = 0; this.bobT = 0; this.swing = 0; this.spin = 0;
  }
  show(i) { this.next = i; }
  update(dt, P, light) {
    // lower the old gun, raise the new one
    if (this.next !== undefined && this.next !== this.cur) { this.drop = Math.min(1, this.drop + dt * 6); if (this.drop >= 1) { if (this.cur >= 0) this.models[this.cur].visible = false; this.cur = this.next; this.models[this.cur].visible = true; } }
    else this.drop = Math.max(0, this.drop - dt * 5);
    if (this.cur < 0) return;
    const g = this.models[this.cur], r = this.rest[this.cur];
    const sp = Math.hypot(P.vel.x, P.vel.z) * (P.onGround ? 1 : .2);
    this.bobT += dt * sp * 1.1;
    const bob = Math.min(1, sp / 10) * .012;
    this.kick = Math.max(0, this.kick - dt * 4);
    g.position.set(r[0] + Math.sin(this.bobT) * bob * .5, r[1] + Math.abs(Math.cos(this.bobT)) * bob - this.drop * .3 + P.landKick * .02, r[2] + this.kick * .07);
    g.rotation.set(.06 + this.kick * .12 + this.drop * -.6, -.03, 0);
    if (this.cur === 0) {   // axe swing
      this.swing = Math.max(0, this.swing - dt * 3.2);
      const s = Math.sin(this.swing * Math.PI);
      g.rotation.set(.3 - s * 1.7, -.3 + s * .6, -.5 + s * .4);
      g.position.x = .12 - s * .12; g.position.y = r[1] + s * .1 - this.drop * .3;
    }
    const sp2 = g.userData.spin; if (sp2) { this.spin *= Math.pow(.02, dt); sp2.rotation.z += this.spin * dt; }
    this.mats.light(light[0], light[1], light[2]);
    this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 12);
  }
  fire(i) {
    this.kick = WEAPONS[i].kick;
    if (i === 0) { this.swing = 1; return; }
    if (i === 3 || i === 4) this.spin = 30;
    if (i !== 7) { this.flash.material.opacity = 1; const r = this.rest[i]; this.flash.position.set(r[0], r[1] + .05, r[2] - (i === 6 ? .8 : .6)); }
  }
}

// ------------------------------------------------------------------ projectiles
const projGeo = {};
function pgeo(kind) {
  if (projGeo[kind]) return projGeo[kind];
  let g;
  if (kind === 'rocket') { g = new THREE.CylinderGeometry(.05, .05, .4, 6).rotateX(Math.PI / 2); }
  else if (kind === 'grenade' || kind === 'ogrenade') g = new THREE.IcosahedronGeometry(.09, 0);
  else if (kind === 'nail' || kind === 'snail') g = new THREE.BoxGeometry(.02, .02, .24);
  else if (kind === 'laser') g = new THREE.BoxGeometry(.05, .05, .6);
  else if (kind === 'spike') g = new THREE.ConeGeometry(.06, .4, 4).rotateX(-Math.PI / 2);
  else g = new THREE.IcosahedronGeometry(.12, 0);
  return projGeo[kind] = finish(g, 6);
}
const PCOL = { laser: 0xffa020, acid: 0x70ff30, spike: 0xff6020, fire: 0xff8020, voreball: 0xff60ff };

export class Projectile {
  constructor(game, kind, pos, vel, owner, dmg) {
    Object.assign(this, { game, kind, pos: pos.clone(), vel: vel.clone(), owner, dmg, life: kind.includes('grenade') ? 2.5 : 8, dead: false });
    let mat;
    if (PCOL[kind]) { mat = new THREE.MeshBasicMaterial({ color: PCOL[kind] }); this.glow = true; }
    else mat = game.fx.gibMats.get(kind === 'rocket' ? 'skin_bronze' : kind.includes('nail') ? 'skin_copper' : kind === 'meat' ? 'skin_flesh' : 'skin_iron');
    this.mesh = new THREE.Mesh(pgeo(kind), mat);
    this.mesh.position.copy(pos); game.scene.add(this.mesh);
    if (kind === 'rocket') this.dl = game.fx.lightOn(this.pos, [1, .6, .25], 5);
    if (this.glow) this.dl = game.fx.lightOn(this.pos, kind === 'acid' ? [.3, .8, .2] : [1, .5, .2], 3);
    this.r = .06;
  }
  update(dt) {
    const G = this.game, L = G.level;
    this.life -= dt;
    const grav = this.kind.includes('grenade') || this.kind === 'meat';
    if (grav) this.vel.y -= 800 * Q * dt;
    const d = this.vel.clone().multiplyScalar(dt), len = d.length();
    if (!len) return;
    const dir = d.clone().divideScalar(len);
    const hw = L.trace(this.pos.x, this.pos.y, this.pos.z, dir.x, dir.y, dir.z, len);
    const he = G.traceEnts(this.pos, dir, hw ? hw.t : len, this.owner, this.r);
    if (he) { this.pos.addScaledVector(dir, he.t); this.hitEnt(he.ent, dir); return; }
    if (hw) {
      this.pos.addScaledVector(dir, Math.max(0, hw.t - .02));
      if (hw.box && hw.box.mover) L.shotMover(hw.box, G);
      if (grav && this.kind !== 'meat') {   // grenades bounce
        const n = new THREE.Vector3(...hw.n);
        this.vel.addScaledVector(n, -1.5 * this.vel.dot(n)).multiplyScalar(.6);
        if (this.vel.length() > 1) G.sound('bounce', this.pos, { vol: .6 });
        if (this.vel.length() < .5) this.vel.set(0, 0, 0);
      } else this.impact(hw);
    } else this.pos.add(d);
    if (this.life <= 0) { if (this.kind.includes('grenade')) this.explode(); else this.remove(); }
    this.mesh.position.copy(this.pos);
    if (!grav) this.mesh.lookAt(this.pos.clone().add(this.vel));
    else this.mesh.rotation.x += dt * 8;
    const age = (this.kind.includes('grenade') ? 2.5 : 8) - this.life;
    if (age < .04) {}
    else if (this.kind === 'rocket') { G.fx.trail(this.pos, 'rocket'); G.fx.trail(this.pos, 'rocket'); }
    else if (this.kind.includes('grenade')) G.fx.trail(this.pos, 'grenade');
    else if (this.kind === 'acid') G.fx.trail(this.pos, 'acid');
    else if (this.kind === 'spike' || this.kind === 'fire') G.fx.trail(this.pos, 'fire');
    else if (this.kind === 'laser') G.fx.trail(this.pos, 'laser');
    else if (this.kind === 'meat') G.fx.trail(this.pos, 'blood');
  }
  hitEnt(ent, dir) {
    const G = this.game;
    if (this.kind === 'rocket') { G.damage(ent, 100 + Math.random() * 20, this.owner, this.pos, 'rocket'); this.explode(ent); return; }
    if (this.kind.includes('grenade')) { this.explode(); return; }
    G.damage(ent, this.dmg, this.owner, this.pos, this.kind, dir);
    if (ent.isMonster || ent.isPlayer) G.fx.blood(this.pos, 4, dir.clone().negate());
    this.remove();
  }
  impact(hw) {
    const G = this.game;
    if (this.kind === 'rocket') return this.explode();
    if (this.kind === 'nail' || this.kind === 'snail') { G.fx.puff(this.pos, 3); if (Math.random() < .4) G.sound('ric', this.pos, { vol: .5, range: 20 }); }
    else if (this.kind === 'meat') { G.sound('splat', this.pos); G.fx.blood(this.pos, 8); }
    else G.fx.sparks(this.pos, 10);
    this.remove();
  }
  explode(direct) {
    const G = this.game;
    this.pos.y += .1;
    G.radiusDamage(this.pos, this.kind === 'ogrenade' ? 40 : 120, this.owner, direct, this.kind);
    G.fx.explosion(this.pos);
    G.sound('explode', this.pos, { range: 60 });
    G.shake(this.pos, 1);
    this.remove();
  }
  remove() {
    if (this.dead) return;
    this.dead = true; this.game.scene.remove(this.mesh);
    if (this.dl) { this.game.fx.dls.splice(this.game.fx.dls.indexOf(this.dl), 1); this.game.fx.light(this.pos, this.dl.col, 4, .15); }
  }
}

// ------------------------------------------------------------------ firing
const tmpV = new THREE.Vector3();
export function fireWeapon(G, P, i) {
  const W = WEAPONS[i];
  const eye = P.eye(), fwd = P.forward(), right = P.right(), up = new THREE.Vector3().crossVectors(right, fwd);
  const quad = P.quad > G.time ? 4 : 1;
  G.vm.fire(i);
  if (W.sound) G.sound(W.sound, null);
  if (quad > 1 && i) G.sound('quadfire', null);
  G.noise(P.pos);
  if (i) G.fx.light(eye.clone().addScaledVector(fwd, .8), [1, .8, .5], 6, .1);
  if (W.ammo) P.ammo[W.ammo] -= W.use;
  const muzzle = eye.clone().addScaledVector(fwd, .5).addScaledVector(up, -.15);
  switch (W.id) {
    case 'axe': {
      const h = hitscan(G, P, eye, fwd, 1.8);
      G.sound('axe', null);
      if (h.ent) { G.damage(h.ent, 20 * quad, P, h.p, 'axe'); G.sound('axehit', h.p); G.fx.blood(h.p, 10); }
      else if (h.world) { G.sound('thud', h.p); G.fx.sparks(h.p, 6); }
      break;
    }
    case 'shotgun': case 'ssg': {
      const ssg = W.id === 'ssg', n = ssg ? 14 : 6, sx = ssg ? .14 : .04, sy = ssg ? .08 : .04;
      const acc = new Map();
      for (let k = 0; k < n; k++) {
        const d = fwd.clone().addScaledVector(right, (Math.random() + Math.random() - 1) * sx).addScaledVector(up, (Math.random() + Math.random() - 1) * sy).normalize();
        const h = hitscan(G, P, eye, d, 64);
        if (h.ent) { acc.set(h.ent, (acc.get(h.ent) || 0) + 4); G.fx.blood(h.p, 3, d.clone().negate()); }
        else if (h.world) G.fx.puff(h.p, 2);
      }
      // Quake's multidamage: all pellets land as one hit (this is what gibs a zombie)
      for (const [e, dmg] of acc) G.damage(e, dmg * quad, P, eye, 'shot', fwd);
      if (ssg) P.vel.addScaledVector(fwd, -1.2);
      break;
    }
    case 'nailgun': case 'snailgun': {
      const side = (P.nailSide = -(P.nailSide || 1)) * (W.id === 'nailgun' ? .06 : 0);
      const o = muzzle.clone().addScaledVector(right, side);
      const aim = G.aimAt(eye, fwd, 50);
      G.projectiles.push(new Projectile(G, W.id === 'nailgun' ? 'nail' : 'snail', o, aim.sub(o).normalize().multiplyScalar(1000 * Q), P, (W.id === 'nailgun' ? 9 : 18) * quad));
      break;
    }
    case 'grenade': {
      const v = fwd.clone().multiplyScalar(600 * Q).addScaledVector(up, 200 * Q).add(new THREE.Vector3((Math.random() - .5) * .3, 0, (Math.random() - .5) * .3));
      const pr = new Projectile(G, 'grenade', muzzle, v, P, 120 * quad); pr.quad = quad; G.projectiles.push(pr);
      break;
    }
    case 'rocket': {
      const aim = G.aimAt(eye, fwd, 80);
      const pr = new Projectile(G, 'rocket', muzzle, aim.sub(muzzle).normalize().multiplyScalar(1000 * Q), P, 100 * quad); pr.quad = quad; G.projectiles.push(pr);
      break;
    }
    case 'lightning': {
      if (P.waterLevel >= 2) {   // discharge in water
        G.radiusDamage(P.pos.clone().setY(P.pos.y + 1), P.ammo.cells * 35, P, null, 'discharge');
        P.ammo.cells = 0; G.fx.light(P.pos, [.6, .7, 1], 15, .5); break;
      }
      const h = hitscan(G, P, eye, fwd, 19);
      G.fx.beam(muzzle, h.p);
      if (h.ent) { G.damage(h.ent, 30 * quad, P, h.p, 'lightning', fwd); G.fx.blood(h.p, 4, fwd.clone().negate()); }
      else if (h.world) G.fx.sparks(h.p, 4);
      break;
    }
  }
}

// trace world + monsters; returns { p, ent, world, t }
export function hitscan(G, shooter, o, d, max) {
  const hw = G.level.trace(o.x, o.y, o.z, d.x, d.y, d.z, max);
  const tw = hw ? hw.t : max;
  const he = G.traceEnts(o, d, tw, shooter, 0);
  if (he) return { p: o.clone().addScaledVector(d, he.t), ent: he.ent, t: he.t };
  if (hw) { if (hw.box && hw.box.mover) G.level.shotMover(hw.box, G); return { p: o.clone().addScaledVector(d, Math.max(0, hw.t - .03)), world: true, t: hw.t, n: hw.n }; }
  return { p: o.clone().addScaledVector(d, max), t: max };
}

export { rayBox };
