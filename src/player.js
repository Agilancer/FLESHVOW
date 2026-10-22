// The player: Quake's stats, armour absorption, water levels, drowning, lava, falling, and the death view.
import * as THREE from 'three';
import { playerMove } from './physics.js';
import { WEAPONS, MAXAMMO, fireWeapon } from './weapons.js';

export const ARMOR = { armor_green: [100, .3], armor_yellow: [150, .6], armor_red: [200, .8] };

export class Player {
  constructor(G) {
    this.G = G; this.isPlayer = true;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.r = .4; this.h = 1.75; this.eyeH = 1.55;
    this.reset();
  }
  reset(parms) {
    const p = parms || { health: 100, armor: 0, armorType: 0, ammo: { shells: 25, nails: 0, rockets: 0, cells: 0 }, weapons: [1, 1, 0, 0, 0, 0, 0, 0], weapon: 1 };
    this.health = p.health; this.armor = p.armor; this.armorType = p.armorType;
    this.ammo = { ...p.ammo }; this.weapons = [...p.weapons]; this.weapon = p.weapon;
    this.keys = new Set(); this.quad = 0; this.dead = false; this.deadT = 0; this.vel.set(0, 0, 0);
    this.fireT = 0; this.waterLevel = 0; this.air = 12; this.burnT = 0; this.painT = 0; this.landKick = 0; this.punch = 0; this.megaT = 0;
    this.onGround = false; this.canJump = true;
  }
  parms() {
    return { health: Math.max(50, Math.min(100, this.health)), armor: this.armor, armorType: this.armorType, ammo: { ...this.ammo }, weapons: [...this.weapons], weapon: this.weapon };
  }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  update(dt, input) {
    const G = this.G;
    if (this.dead) {
      this.deadT += dt;
      this.vel.x *= .9; this.vel.z *= .9;
      playerMove(G.level, this, { fwd: 0, side: 0, jump: false }, dt, null);
      return;
    }
    this.waterCheck();
    const yv = this.vel.y;
    playerMove(G.level, this, input, dt, G.monsters);
    if (this.jumped) { this.jumped = false; G.sound('jump', null, { vol: .5 }); }
    if (this.landed) {
      if (this.landed < -20.3) { this.hurt(5, null, null, 'fall'); G.sound('land', null); }
      else if (this.landed < -11) G.sound('land', null, { vol: .5 });
      this.landKick = Math.min(1, -this.landed / 20); this.landed = 0;
    }
    this.landKick = Math.max(0, this.landKick - dt * 4);
    this.punch = Math.max(0, this.punch - dt * 6);
    // weapons
    this.fireT -= dt;
    if (input.weapon !== undefined) { this.select(input.weapon); input.weapon = undefined; }
    if (input.cycle) { this.cycle(input.cycle); input.cycle = 0; }
    if (input.fire && this.fireT <= 0 && G.vm.drop < .2) {
      const W = WEAPONS[this.weapon];
      if (W.ammo && this.ammo[W.ammo] < W.use) this.bestWeapon();
      else { fireWeapon(G, this, this.weapon); this.fireT = W.rate; this.punch = Math.min(1, this.punch + W.kick * .5); }
    }
    // powerups and megahealth decay
    if (this.health > 100 && (this.megaT -= dt) <= 0) { this.health -= 1; this.megaT = 1; }
    if (this.quad && this.quad - G.time < 3 && this.quad > G.time && !this.quadWarn) { this.quadWarn = true; G.message('Quad Damage is wearing off'); G.sound('quad', null, { vol: .4 }); }
    this.hazards(dt);
  }

  waterCheck() {
    const L = this.G.level, c = L.at(this.pos.x, this.pos.z);
    const prev = this.waterLevel;
    this.waterLevel = 0; this.liquid = null;
    if (c && c.liquid) {
      const top = c.lh ?? c.f + 1;
      if (this.pos.y < top) { this.waterLevel = 1; this.liquid = c.liquid; }
      if (this.pos.y + .9 < top) this.waterLevel = 2;
      if (this.pos.y + this.eyeH < top) this.waterLevel = 3;
    }
    if (!prev && this.waterLevel) this.G.sound('splash', this.pos);
  }

  hazards(dt) {
    const G = this.G;
    if (this.waterLevel === 3) { this.air -= dt; if (this.air < 0 && (this.burnT -= dt) <= 0) { this.burnT = 1; this.hurt(Math.min(15, 2 - this.air * 2), null, null, 'drown'); } }
    else { if (this.air < 5) G.sound('jump', null, { vol: .4 }); this.air = 12; }
    if (this.liquid === 'lava' || this.liquid === 'slime') {
      if ((this.burnT -= dt) <= 0) {
        this.burnT = this.liquid === 'lava' ? .2 : 1;
        this.hurt(this.liquid === 'lava' ? 10 * this.waterLevel : 4 * this.waterLevel, null, null, this.liquid);
        if (this.liquid === 'lava') G.sound('burn', null);
      }
    }
  }

  select(i) {
    const G = this.G;
    if (!this.weapons[i]) return;
    const W = WEAPONS[i];
    if (W.ammo && this.ammo[W.ammo] < W.use) { G.message('Not enough ammo.'); return; }
    if (i !== this.weapon) { this.weapon = i; G.vm.show(i); }
  }
  cycle(d) {
    for (let k = 1; k <= 8; k++) {
      const i = (this.weapon + d * k + 16) % 8, W = WEAPONS[i];
      if (this.weapons[i] && (!W.ammo || this.ammo[W.ammo] >= W.use)) { this.select(i); return; }
    }
  }
  bestWeapon() {
    for (const i of [7, 4, 2, 3, 1, 0]) {
      const W = WEAPONS[i];
      if (this.weapons[i] && (!W.ammo || this.ammo[W.ammo] >= W.use) && !(i === 7 && this.waterLevel > 1)) { this.select(i); return; }
    }
  }

  give(kind, n) {
    if (MAXAMMO[kind]) { if (this.ammo[kind] >= MAXAMMO[kind]) return false; this.ammo[kind] = Math.min(MAXAMMO[kind], this.ammo[kind] + n); return true; }
    return false;
  }

  hurt(dmg, attacker, from, kind, dir) {
    const G = this.G;
    if (this.dead || G.godMode) return;
    if (attacker === this && kind !== 'fall') dmg *= .5;   // self splash
    let save = Math.ceil(this.armorType * dmg);
    if (save >= this.armor) { save = this.armor; this.armorType = 0; }
    this.armor -= save;
    const take = Math.ceil(dmg - save);
    this.health -= take;
    G.flash([1, 0, 0], Math.min(.6, .1 + take / 40));
    this.punch = Math.min(1, this.punch + .4);
    this.painFace = .3;
    if (from) {
      const d = new THREE.Vector3(this.pos.x - from.x, (this.pos.y + .9) - from.y, this.pos.z - from.z);
      if (d.lengthSq() > 1e-6) { d.normalize(); this.vel.addScaledVector(d, Math.min(20, dmg * (attacker === this ? .25 : .12))); if (d.y > .2 && this.vel.y > 0) this.onGround = false; }
    }
    if (this.health <= 0) return this.die(kind, dmg);
    if ((this.painT || 0) < G.time) { G.sound(kind === 'drown' ? 'splash' : 'pain', null, { voice: 'player' }); this.painT = G.time + .5; }
  }

  die(kind, dmg) {
    const G = this.G;
    this.dead = true; this.deadT = 0; this.health = Math.min(0, this.health);
    G.sound('death', null, { voice: 'player' });
    if (this.health < -40) { G.fx.gibBurst(this.pos.clone(), 4, 'skin_fatigues'); G.sound('gib', this.pos); }
    G.onPlayerDeath(kind);
  }

  // first-person camera with Quake's bob, roll and punch
  camera(cam, t) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const bob = this.onGround && !this.dead ? Math.sin(t * 11) * Math.min(1, sp / 10) * .05 : 0;
    const eyeH = this.dead ? Math.max(.3, this.eyeH - this.deadT * 4) : this.eyeH;
    cam.position.set(this.pos.x, this.pos.y + eyeH + bob - this.landKick * .12, this.pos.z);
    const side = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    const roll = this.dead ? Math.min(1, this.deadT * 3) * .6 : -side / 10 * .035;
    cam.rotation.set(this.pitch + this.punch * .05, this.yaw, roll, 'YXZ');
  }
}
