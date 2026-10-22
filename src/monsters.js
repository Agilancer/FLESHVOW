// The ten monsters: stats from Quake (health in hit points, metres per second), AI that wakes on sight or noise,
// follows a flow field to the player, infights when hurt by another monster, and per-type attacks and animation.
import * as THREE from 'three';
import { MONSTER_MODELS, headGib } from './models.js';
import { entityMove, Q } from './physics.js';
import { Projectile, hitscan } from './weapons.js';
import { S } from './level.js';

export const MDEF = {
  dog:        { hp: 25, r: .32, h: .9, walk: 3, run: 9, gib: -35, skin: 'skin_fur', name: 'Rottweiler', melee: 1.4, leap: [2.5, 7] },
  grunt:      { hp: 30, r: .38, h: 1.75, walk: 1.6, run: 4, gib: -35, skin: 'skin_fatigues', name: 'Grunt', ranged: [1, 22, 1.2] },
  enforcer:   { hp: 80, r: .42, h: 1.85, walk: 1.6, run: 3.6, gib: -35, skin: 'skin_armor_blue', name: 'Enforcer', ranged: [1, 25, 1.5] },
  knight:     { hp: 75, r: .4, h: 1.8, walk: 1.8, run: 6, gib: -40, skin: 'skin_bronze', name: 'Knight', melee: 1.7 },
  hellknight: { hp: 250, r: .45, h: 2.1, walk: 1.8, run: 5.4, gib: -40, skin: 'skin_red_armor', name: 'Death Knight', melee: 1.9, ranged: [3, 22, 2.2] },
  ogre:       { hp: 200, r: .55, h: 2.3, walk: 1.8, run: 4.2, gib: -80, skin: 'skin_ogre', name: 'Ogre', melee: 2.0, ranged: [4, 22, 2.2] },
  scrag:      { hp: 80, r: .4, h: 1.3, walk: 3, run: 4.5, gib: -40, skin: 'skin_rotflesh', name: 'Scrag', fly: true, ranged: [1, 24, 1.6] },
  zombie:     { hp: 60, r: .38, h: 1.75, walk: 1, run: 1.4, gib: -999, skin: 'skin_rotflesh', name: 'Zombie', ranged: [1, 18, 2.4] },
  fiend:      { hp: 300, r: .5, h: 1.6, walk: 3, run: 7.5, gib: -80, skin: 'skin_scales', name: 'Fiend', melee: 1.7, leap: [3, 10] },
  shambler:   { hp: 600, r: .7, h: 2.7, walk: 2, run: 4.6, gib: -60, skin: 'skin_whitefur', name: 'Shambler', melee: 2.3, ranged: [3, 26, 3] },
};

const _v = new THREE.Vector3();
let uid = 0;

export class Monster {
  constructor(G, type, pos, yaw = 0, opts = {}) {
    const d = MDEF[type];
    Object.assign(this, { G, type, def: d, pos: pos.clone(), vel: new THREE.Vector3(), yaw, hp: d.hp, r: d.r, h: d.h, isMonster: true, id: uid++ });
    this.rig = MONSTER_MODELS[type]();
    this.mesh = this.rig.root; this.mesh.position.copy(pos); G.scene.add(this.mesh);
    this.state = 'idle'; this.t = 0; this.atkT = 0; this.cool = 1 + Math.random(); this.walkPh = Math.random() * 6; this.sightT = Math.random() * .3;
    this.target = null; this.onGround = true; this.light = [.3, .3, .3]; this.stuck = 0; this.ambush = opts.ambush; this.boss = opts.boss;
    if (d.fly) { this.pos.y += 1.2; this.hover = this.pos.y; }
    this.mesh.rotation.y = yaw;
  }

  get dead() { return this.state === 'dead'; }

  // ------------------------------------------------------------ AI
  update(dt) {
    const G = this.G, P = G.player;
    this.t += dt;
    if (this.state === 'dead') return this.deadUpdate(dt);
    if (this.state === 'down') {   // zombie lying down
      this.downT -= dt;
      if (this.downT <= 0) { this.state = 'chase'; this.hp = 60; G.sound('idle', this.pos, { voice: 'zombie' }); }
      this.pose(dt); this.place(dt); return;
    }
    const tgt = this.target && !this.target.dead ? this.target : P;
    if (this.target && this.target.dead) this.target = null;
    const tp = tgt.pos, toT = _v.set(tp.x - this.pos.x, 0, tp.z - this.pos.z), dist = toT.length();
    this.sightT -= dt;
    if (this.sightT <= 0) {
      this.sightT = .2;
      this.canSee = !tgt.dead && this.sees(tgt);
      if (this.state === 'idle' && this.canSee && !P.notarget) {
        const fwd = Math.sin(this.yaw) * -toT.x + Math.cos(this.yaw) * -toT.z;   // facing dot
        if (dist < 8 || fwd > -.2 * dist) this.wake();
      }
    }
    if (this.state === 'idle') { this.idleUpdate(dt); this.pose(dt); this.place(dt); return; }
    if (this.state === 'pain') { if ((this.painT -= dt) <= 0) this.state = 'chase'; this.vel.x *= .8; this.vel.z *= .8; }
    if (this.state === 'attack') this.attackUpdate(dt, tgt, dist);
    if (this.state === 'leap') this.leapUpdate(dt, tgt);
    if (this.state === 'chase') {
      this.cool -= dt;
      const d = this.def;
      if (tgt.dead) { this.state = 'idle'; this.target = null; }
      else if (d.melee && this.canSee && dist < d.melee + tgt.r && Math.abs(tp.y - this.pos.y) < 1.6) this.startAttack('melee');
      else if (d.leap && this.canSee && dist > d.leap[0] && dist < d.leap[1] && this.cool <= 0 && this.onGround && Math.random() < dt * 2.5) this.startLeap(tgt);
      else if (d.ranged && this.canSee && dist > d.ranged[0] && dist < d.ranged[1] && this.cool <= 0 && Math.random() < dt * 1.6) this.startAttack('ranged');
      else this.chase(dt, tgt, dist);
    }
    this.pose(dt); this.place(dt);
  }

  sees(t) {
    const ey = this.pos.y + this.h * .85, ty = t.pos.y + (t.h || 1.7) * .7;
    if (_v.set(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).length() > 60) return false;
    return !this.G.level.occluded(this.pos.x, ey, this.pos.z, t.pos.x, ty, t.pos.z, true);
  }

  wake(attacker) {
    if (this.state !== 'idle') return;
    this.state = 'chase'; this.cool = .6 + Math.random() * .8;
    this.G.sound('sight', this.pos, { voice: this.type });
    // Quake: one monster's sight cry wakes the others near it
    for (const m of this.G.monsters) if (m !== this && m.state === 'idle' && m.pos.distanceTo(this.pos) < 10 && m.sees(this)) { m.state = 'chase'; m.cool = 1 + Math.random(); }
  }

  idleUpdate(dt) {
    this.vel.x *= .8; this.vel.z *= .8;
    if (this.def.fly) this.pos.y = this.hover + Math.sin(this.t * 2) * .15;
    else entityMove(this.G.level, this, dt, null);
    if (Math.random() < dt * .03) this.G.sound('idle', this.pos, { voice: this.type, vol: .5, range: 20 });
  }

  chase(dt, tgt, dist) {
    const G = this.G, d = this.def;
    let goal = null;
    if (this.canSee) goal = tgt.pos;
    else goal = G.flowStep(this.pos, d.fly, d.h);
    const spd = d.run;
    if (goal) {
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
      let ax = dx / l, az = dz / l;
      // like Quake's movestep: don't run off a ledge after the player; take the flow field around instead
      if (!d.fly && this.onGround && this.canSee) {
        const fl = G.level.floorAt(this.pos.x + ax * (this.r + .45), this.pos.y + .6, this.pos.z + az * (this.r + .45));
        if (fl < this.pos.y - 1.1) {
          const g2 = G.flowStep(this.pos, false);
          if (g2 && g2 !== tgt.pos) { const ex = g2.x - this.pos.x, ez = g2.z - this.pos.z, el = Math.hypot(ex, ez) || 1; ax = ex / el; az = ez / el; }
          else { ax = 0; az = 0; }
        }
      }
      if (this.stuck > .4) { const s = this.id % 2 ? 1 : -1; [ax, az] = [ax * .3 - az * s, az * .3 + ax * s]; }
      const want = (this.canSee && d.ranged && !d.melee && dist < 6) ? -.5 : 1;   // gunmen keep a little distance
      const k = this.onGround || d.fly ? 8 : 1;
      this.vel.x += (ax * spd * want - this.vel.x) * Math.min(1, k * dt);
      this.vel.z += (az * spd * want - this.vel.z) * Math.min(1, k * dt);
      this.turnTo(Math.atan2(-dx, -dz), dt, 6);
      if (d.fly) {
        const ty = (this.canSee ? tgt.pos.y + 1.4 : (goal.y ?? this.pos.y)) + Math.sin(this.t * 1.7) * .4;
        this.vel.y += ((ty - this.pos.y) * 2 - this.vel.y) * Math.min(1, 4 * dt);
        if (this.canSee) { const s = Math.sin(this.t * .9 + this.id) * 2.5; this.vel.x += -az * s * dt * 4; this.vel.z += ax * s * dt * 4; }
      }
    }
    const before = this.pos.clone();
    const res = entityMove(G.level, this, dt, G.solidEnts(), !!d.fly);
    // hop small obstacles and leave ledges that would strand us
    const moved = before.distanceTo(this.pos);
    this.stuck = moved < spd * dt * .25 ? this.stuck + dt : Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 1.6) this.stuck = 0;
    if (res.blockedH && this.onGround && !d.fly && this.stuck > .3 && Math.random() < .05) { this.vel.y = 5; this.onGround = false; }
    const cl = G.level.at(this.pos.x, this.pos.z);
    if (res.blockedH && !d.fly && cl?.liquid && this.pos.y < (cl.lh ?? 0)) { this.vel.y = 10.5; this.onGround = false; }   // water jump out
    this.walkPh += dt * Math.hypot(this.vel.x, this.vel.z) * 2.2;
    this.hazard(dt);
  }

  hazard(dt) {
    const c = this.G.level.at(this.pos.x, this.pos.z);
    if (c && c.liquid && this.pos.y < (c.lh ?? c.f + 1)) {
      if (c.liquid === 'lava' && !this.def.fly) this.G.damage(this, 60 * dt, null, this.pos, 'lava');
      if (c.liquid === 'slime' && !this.def.fly) this.G.damage(this, 10 * dt, null, this.pos, 'slime');
    }
  }

  turnTo(a, dt, rate) {
    let d = a - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  startAttack(kind) {
    this.state = 'attack'; this.atk = kind; this.atkT = 0; this.atkDone = 0;
    if (kind === 'melee') this.G.sound(this.type === 'ogre' ? 'saw' : 'melee', this.pos);
  }

  attackUpdate(dt, tgt, dist) {
    const G = this.G, d = this.def, P = tgt;
    this.atkT += dt;
    this.vel.x *= .7; this.vel.z *= .7;
    entityMove(G.level, this, dt, G.solidEnts(), !!d.fly);
    this.turnTo(Math.atan2(-(P.pos.x - this.pos.x), -(P.pos.z - this.pos.z)), dt, 8);
    const T = this.atkT, hit = (at) => T >= at && this.atkDone < at && (this.atkDone = at, true);
    const eye = this.pos.clone().setY(this.pos.y + d.h * .75);
    const aimAt = (lead = 0) => P.pos.clone().setY(P.pos.y + (P.h || 1.7) * .6).addScaledVector(P.vel || _v.set(0, 0, 0), lead);
    const shoot = (kind, speed, dmg, spread = 0, from = eye, lead = 0) => {
      const dir = aimAt(lead * dist / speed).sub(from).normalize();
      if (spread) dir.add(new THREE.Vector3((Math.random() - .5) * spread, (Math.random() - .5) * spread * .5, (Math.random() - .5) * spread)).normalize();
      G.projectiles.push(new Projectile(G, kind, from, dir.multiplyScalar(speed), this, dmg));
    };
    const melee = (dmg, range) => {
      if (P.pos.distanceTo(this.pos) < range + P.r + .3) { G.damage(P, dmg, this, this.pos, 'melee'); G.fx.blood(P.pos.clone().setY(P.pos.y + 1.2), 8); G.sound('claw', P.pos); }
    };
    let dur = 1;
    switch (this.type) {
      case 'dog': dur = .5; if (hit(.25)) melee(8 + Math.random() * 6, 1.3); break;
      case 'grunt':
        dur = 1.1;
        if (hit(.45)) {
          G.sound('shotgun', this.pos, { vol: .8 }); G.fx.light(eye, [1, .8, .4], 5, .1); G.noise(this.pos);
          for (let k = 0; k < 4; k++) {
            const dir = aimAt().sub(eye).normalize().add(new THREE.Vector3((Math.random() - .5) * .1, (Math.random() - .5) * .08, (Math.random() - .5) * .1)).normalize();
            const h = hitscan(G, this, eye, dir, 64);
            if (h.ent) { G.damage(h.ent, 4, this, eye, 'shot', dir); G.fx.blood(h.p, 2); } else if (h.world) G.fx.puff(h.p, 2);
          }
        }
        break;
      case 'enforcer':
        dur = 1.2;
        for (const at of [.4, .7]) if (hit(at)) { G.sound('laser', this.pos); shoot('laser', 600 * Q, 15, .04, eye.clone().setY(eye.y - .2)); }
        break;
      case 'knight': dur = .8; if (hit(.4)) melee(10 + Math.random() * 6, 1.7); break;
      case 'hellknight':
        if (this.atk === 'melee') { dur = .9; if (hit(.45)) melee(15 + Math.random() * 10, 1.9); }
        else {
          dur = 1.3;
          if (hit(.5)) {
            G.sound('fireball', this.pos);
            for (let k = -2; k <= 3; k++) {
              const dir = aimAt().sub(eye).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
              dir.addScaledVector(side, (k - .5) * .1).normalize();
              G.projectiles.push(new Projectile(G, 'spike', eye, dir.multiplyScalar(18), this, 9));
            }
          }
        }
        break;
      case 'ogre':
        if (this.atk === 'melee') { dur = 1.0; if (hit(.3) || hit(.6)) melee(10 + Math.random() * 8, 2.1); }
        else {
          dur = 1.2;
          if (hit(.55)) {
            G.sound('grenade', this.pos);
            const dir = aimAt().sub(eye); const h = Math.hypot(dir.x, dir.z);
            const v = new THREE.Vector3(dir.x / h, 0, dir.z / h).multiplyScalar(Math.min(17, h * 1.3)).setY(4 + dir.y * .7 + h * .12);
            G.projectiles.push(new Projectile(G, 'ogrenade', eye, v, this, 40));
          }
        }
        break;
      case 'scrag':
        dur = 1.0;
        for (const at of [.35, .55]) if (hit(at)) { G.sound('spit', this.pos); shoot('acid', 600 * Q, 9, .05, eye, .5); }
        break;
      case 'zombie':
        dur = 1.4;
        if (hit(.9)) { G.sound('meatthrow', this.pos); const dir = aimAt().sub(eye); const h = Math.hypot(dir.x, dir.z); G.projectiles.push(new Projectile(G, 'meat', eye, new THREE.Vector3(dir.x / h * 12, dir.y / h * 12 + h * .9, dir.z / h * 12), this, 10)); }
        break;
      case 'fiend': dur = .7; if (hit(.3)) melee(11 + Math.random() * 5, 1.7); break;
      case 'shambler':
        if (this.atk === 'melee') { dur = 1.2; if (hit(.7)) melee(40 + Math.random() * 15, 2.4); }
        else {
          dur = 1.6;
          if (T > .5 && T < 1.4) G.fx.light(eye.clone().setY(eye.y + .6), [.6, .7, 1], 6, .1);
          if (hit(.5)) G.sound('zap', this.pos);
          for (const at of [.8, 1.0, 1.2]) if (hit(at)) {
            const from = this.pos.clone().setY(this.pos.y + d.h + .1);
            const dir = aimAt().sub(from).normalize();
            const h = hitscan(G, this, from, dir, 40);
            G.fx.beam(from, h.p, 0xcfe0ff, .12);
            if (h.ent) G.damage(h.ent, 10, this, from, 'lightning');
          }
        }
        break;
    }
    if (T >= dur) { this.state = 'chase'; this.cool = d.ranged ? d.ranged[2] * (.7 + Math.random() * .6) : .3; }
  }

  startLeap(tgt) {
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z, l = Math.hypot(dx, dz);
    const sp = this.type === 'fiend' ? 14 : 10;
    this.vel.set(dx / l * sp, this.type === 'fiend' ? 5 : 4, dz / l * sp); this.onGround = false;
    this.state = 'leap'; this.leapHit = false; this.leapT = 0;
    this.G.sound(this.type === 'dog' ? 'sight' : 'melee', this.pos, { voice: this.type });
  }

  leapUpdate(dt, tgt) {
    const G = this.G;
    this.leapT += dt;
    entityMove(G.level, this, dt, null);
    if (!this.leapHit && tgt.pos.distanceTo(this.pos) < this.r + tgt.r + .5 && Math.abs(tgt.pos.y - this.pos.y) < 1.5) {
      this.leapHit = true;
      const dmg = this.type === 'fiend' ? 40 + Math.random() * 10 : 10 + Math.random() * 10;
      G.damage(tgt, dmg, this, this.pos, 'melee', this.vel.clone().normalize()); G.fx.blood(tgt.pos.clone().setY(tgt.pos.y + 1.2), 12); G.sound('claw', tgt.pos);
    }
    if ((this.onGround && this.leapT > .2) || this.leapT > 2) { this.state = 'chase'; this.cool = 1.5 + Math.random(); }
  }

  // ------------------------------------------------------------ damage
  hurt(dmg, attacker, dir, kind) {
    const G = this.G;
    if (this.state === 'dead') {
      // corpses can still be gibbed
      this.hp -= dmg;
      if (this.hp < this.def.gib && !this.gibbed) this.gibIt(dir);
      return;
    }
    if (this.type === 'shambler' && (kind === 'rocket' || kind === 'grenade' || kind === 'splash')) dmg *= .5;
    if (attacker && attacker.isMonster && attacker !== this && attacker.type !== this.type) this.target = attacker;   // infighting
    if (attacker && attacker.isPlayer && this.target && this.target.dead) this.target = null;
    if (this.state === 'idle') this.wake(attacker);
    if (dir && !this.def.fly) { this.vel.addScaledVector(dir, Math.min(6, dmg * .04)); }
    if (this.type === 'zombie') {
      // Quake zombies only die to a single blow of 60 or more; big hits knock them down
      if (dmg >= 60) { this.hp = -100; return this.die(dir, true); }
      if (dmg >= 25 && this.state !== 'down') { this.state = 'down'; this.downT = 5; this.downAng = 0; G.sound('pain', this.pos, { voice: 'zombie' }); return; }
      if (dmg >= 9) { this.state = 'pain'; this.painT = .3; G.sound('pain', this.pos, { voice: 'zombie' }); }
      return;
    }
    this.hp -= dmg;
    if (this.hp <= 0) return this.die(dir, this.hp < this.def.gib);
    const big = { shambler: 40, ogre: 20, hellknight: 25, fiend: 25 }[this.type] || 0;
    if (dmg > big && Math.random() < .6 && this.state !== 'attack' && this.state !== 'leap') { this.state = 'pain'; this.painT = .25 + Math.random() * .2; this.painKick = 1; }
    if (this.painSnd === undefined || this.painSnd < G.time) { G.sound('pain', this.pos, { voice: this.type }); this.painSnd = G.time + .4; }
  }

  die(dir, gib) {
    const G = this.G;
    this.state = 'dead'; this.deadT = 0; this.vel.set(0, 0, 0);
    this.fallDir = Math.random() < .5 ? 1 : -1;
    G.kills++;
    if (gib) this.gibIt(dir);
    else { G.sound('death', this.pos, { voice: this.type }); if (this.type === 'grunt') G.dropItem('shells', this.pos); if (this.type === 'ogre') G.dropItem('rockets', this.pos); if (this.type === 'enforcer') G.dropItem('cells', this.pos); }
    G.onMonsterDeath(this);
  }

  gibIt(dir) {
    const G = this.G;
    this.gibbed = true;
    G.sound('gib', this.pos);
    const head = headGib(this.rig);
    G.fx.gibBurst(this.pos.clone(), this.type === 'shambler' || this.type === 'ogre' ? 6 : 4, this.def.skin, dir ? dir.clone().multiplyScalar(3) : null, head);
    G.scene.remove(this.mesh);
  }

  deadUpdate(dt) {
    if (this.gibbed) return;
    this.deadT += dt;
    if (!this.def.fly || this.pos.y > this.G.level.floorAt(this.pos.x, this.pos.y, this.pos.z) + .02) entityMove(this.G.level, this, dt, null);
    this.pose(dt); this.place(dt);
  }

  // ------------------------------------------------------------ animation
  pose(dt) {
    const J = this.rig.J, T = this.type, st = this.state, t = this.t;
    const sp = Math.hypot(this.vel.x, this.vel.z), amt = Math.min(1, sp / (this.def.run * .7));
    const ph = this.walkPh, s = Math.sin(ph), c = Math.cos(ph);
    const set = (j, x = 0, y = 0, z = 0) => { if (J[j]) J[j].rotation.set(x, y, z); };
    const root = this.rig.root;
    root.rotation.x = 0; root.rotation.z = 0;
    let lift = 0;
    if (st === 'dead' || st === 'down') {
      const k = Math.min(1, (st === 'down' ? 5 - this.downT : this.deadT) * 2.2);
      const e = k * k * (3 - 2 * k), fd = this.fallDir || 1;
      if (T === 'scrag') { root.rotation.z = e * 1.4; lift = 0; }
      else { root.rotation.x = fd * e * Math.PI / 2; lift = e * .18; }
      if (st === 'down' && this.downT < 1) { const u = 1 - this.downT; root.rotation.x = fd * Math.PI / 2 * (1 - u); }
      for (const n of ['armL', 'armR']) if (J[n]) J[n].rotation.set(e * 2.4 * fd, 0, (n === 'armL' ? -1 : 1) * e * .5);
      this.rig.root.position.y = lift;
      return;
    }
    const pain = st === 'pain' ? Math.sin(Math.min(1, (this.painKick = Math.max(0, (this.painKick || 0) - dt * 4))) * 3) : 0;
    const A = st === 'attack' ? this.atkT : 0;
    if (T === 'dog') {
      const g = st === 'leap' ? 0 : 1;
      set('legFL', s * .8 * amt * g - (st === 'leap' ? .9 : 0)); set('legFR', Math.sin(ph + .5) * .8 * amt * g - (st === 'leap' ? .9 : 0));
      set('legBL', -Math.sin(ph + 2.6) * .8 * amt * g + (st === 'leap' ? .9 : 0)); set('legBR', -Math.sin(ph + 3.1) * .8 * amt * g + (st === 'leap' ? .9 : 0));
      for (const n of ['FL', 'FR', 'BL', 'BR']) set('low' + n, Math.max(0, Math.sin(ph + (n[0] === 'B' ? 3 : 0))) * .7 * amt * (n[0] === 'F' ? -1 : 1));
      set('jaw', st === 'attack' || st === 'leap' ? .6 * Math.abs(Math.sin(A * 12 + t * 8)) : .1);
      set('tail', Math.sin(t * 9) * .3, Math.sin(t * 7) * .4);
      set('head', st === 'attack' ? -.3 : Math.sin(ph * 2) * .05);
      J.body.position.y = .62 + Math.abs(c) * .05 * amt;
      J.body.rotation.x = pain * .3;
      return;
    }
    if (T === 'scrag') {
      J.body.rotation.x = .25 + pain * .3 - (st === 'attack' ? Math.sin(Math.min(1, A * 2) * Math.PI) * .4 : 0);
      for (let i = 0; i < 4; i++) set('tail' + i, Math.sin(t * 3 - i) * .25 + .1, 0, Math.sin(t * 2.3 - i * .8) * .2);
      const sw = st === 'attack' ? Math.sin(Math.min(1, A * 1.8) * Math.PI) : 0;
      set('armL', .4 + sw * 1.2 + Math.sin(t * 3) * .2, 0, -.3); set('armR', .4 + sw * 1.2 + Math.sin(t * 3 + 1) * .2, 0, .3);
      set('foreL', -.6 - sw * .4); set('foreR', -.6 - sw * .4);
      set('head', -.2 + sw * .3);
      return;
    }
    // bipeds (and the fiend / shambler which share the joint names)
    const quad = T === 'fiend';
    set('thighL', s * .7 * amt - (quad ? .3 : 0)); set('thighR', -s * .7 * amt - (quad ? .3 : 0));
    set('shinL', Math.max(0, -c) * 1.1 * amt + (quad ? .5 : 0)); set('shinR', Math.max(0, c) * 1.1 * amt + (quad ? .5 : 0));
    const bob = Math.abs(c) * .05 * amt;
    if (J.hips) { const y0 = J.hips.userData.y0 ??= J.hips.position.y; J.hips.position.y = y0 + bob - (quad ? .05 : 0); }
    if (J.torso) J.torso.rotation.set(-pain * .4 + (quad ? .2 : 0), 0, 0);
    const armSw = s * .5 * amt;
    let aL = [-armSw, 0, -.1], aR = [armSw, 0, .1], fL = -.2, fR = -.2;
    const k = (t0, t1) => Math.max(0, Math.min(1, (A - t0) / (t1 - t0)));
    if (T === 'grunt' || T === 'enforcer') {
      aR = [1.35, 0, .05]; fR = -.25; aL = [1.15, 0, .5]; fL = -.9;
      if (st === 'attack') { const r = Math.max(0, Math.sin(k(.4, .7) * Math.PI)) * .3; aR[0] -= r; aL[0] -= r; }
    } else if (T === 'knight' || T === 'hellknight') {
      aR = [.4 + armSw, 0, .2]; fR = -.6;
      if (st === 'attack' && this.atk === 'melee') { const u = k(0, .3), v = k(.3, .55); aR = [.4 + u * 2.4 - v * 2.6, 0, .2 + v * .3]; fR = -.4 - u * .6 + v * .6; set('torso', 0, -u * .4 + v * .7, 0); }
      if (st === 'attack' && this.atk === 'ranged') { const u = Math.sin(k(0, 1.0) * Math.PI); aR = [.4 + u * 1.2, 0, .2]; aL = [u * 2.2, 0, -.3]; fL = -.2; }
    } else if (T === 'ogre') {
      aR = [1.1, .2, .1]; aL = [1.0, -.5, -.3]; fR = -.6; fL = -1.2;
      if (st === 'attack' && this.atk === 'melee') { const u = Math.sin(A * 9); if (J.torso) J.torso.rotation.y = u * .5; aR[0] += u * .3; }
      if (st === 'attack' && this.atk === 'ranged') { const u = Math.sin(k(0, .8) * Math.PI); aL = [u * 2.6, 0, -.2]; fL = -.4; }
      if (this.rig.saw) this.rig.saw.position.x = Math.sin(t * 60) * .005;
    } else if (T === 'zombie') {
      aL = [1.3 + Math.sin(t * 2) * .2, 0, -.15]; aR = [1.2 + Math.sin(t * 2 + 1) * .2, 0, .15]; fL = fR = -.2;
      if (st === 'attack') { const u = k(.2, .8), v = k(.8, 1.0); aR = [1.2 + u * 1.8 - v * 2.6, 0, .2]; fR = -1.2 * u; }
      if (J.head) J.head.rotation.z = Math.sin(t * 1.3) * .2;
    } else if (T === 'fiend') {
      aL = [.9 + s * .6 * amt, 0, -.2]; aR = [.9 - s * .6 * amt, 0, .2]; fL = fR = -.6;
      if (st === 'leap') { aL = [2.2, 0, -.3]; aR = [2.2, 0, .3]; fL = fR = -.1; }
      if (st === 'attack') { const u = Math.sin(k(0, .6) * Math.PI); aL = [.9 + u * 1.4, 0, -.2]; aR = [.9 + u * 1.6, 0, .2]; }
    } else if (T === 'shambler') {
      aL = [armSw * .6 + .2, 0, -.15]; aR = [-armSw * .6 + .2, 0, .15]; fL = fR = -.3;
      if (st === 'attack' && this.atk === 'ranged') { const u = Math.min(1, A * 2); aL = [u * 2.7, 0, -.4 * u + .2]; aR = [u * 2.7, 0, .4 * u - .2]; fL = fR = -.2; }
      if (st === 'attack' && this.atk === 'melee') { const u = k(0, .6), v = k(.6, .85); aR = [u * 2.6 - v * 2.2, 0, .3]; fR = -.4; }
    }
    set('armL', ...aL); set('armR', ...aR); set('foreL', fL); set('foreR', fR);
    if (J.head && T !== 'zombie' && T !== 'shambler') J.head.rotation.x = st === 'idle' ? Math.sin(t * .7) * .1 : 0;
  }

  place(dt) {
    const G = this.G;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    // light from the floor under the model (Quake did exactly this) plus dynamic lights
    const l = G.level.modelLight(this.pos.x, this.pos.y + 1, this.pos.z), dl = G.fx.dynamicAt(this.pos.x, this.pos.y + 1, this.pos.z);
    for (let i = 0; i < 3; i++) this.light[i] += ((l[i] + dl[i]) - this.light[i]) * Math.min(1, dt * 8);
    const q = (v) => Math.min(1.6, Math.floor(v * 2 * 24) / 24);
    this.rig.mats.light(q(this.light[0]), q(this.light[1]), q(this.light[2]));
  }

  // hit box for traces
  box() { return { x0: this.pos.x - this.r, x1: this.pos.x + this.r, y0: this.pos.y, y1: this.pos.y + (this.state === 'dead' || this.state === 'down' ? .4 : this.h), z0: this.pos.z - this.r, z1: this.pos.z + this.r }; }
}
