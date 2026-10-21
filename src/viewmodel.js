// First-person hands, sword and shield, drawn in their own scene over the world. The hands chase keyframed targets
// through damped springs, so swings carry weight, overshoot and bite when they hit. Hold to charge, release to swing;
// five swings in a combo. Right mouse raises the tower shield over your face: you look out through its eye slits.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildModel, SLIT } from './items.js';
import { swapMat } from './textures.js';
import { sfx } from './audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SWINGS = [  // [position in camera space, blade direction] for windup, middle, follow-through
  { keys: [[V(0.45, -0.1, -0.3), V(1, 0.15, 0.35)], [V(0.05, -0.1, -0.52), V(0, 0.05, -1)], [V(-0.42, -0.2, -0.35), V(-1, -0.2, 0.3)]] },
  { keys: [[V(-0.36, -0.04, -0.34), V(-1, 0.2, 0.3)], [V(0, -0.1, -0.52), V(0, 0, -1)], [V(0.46, -0.26, -0.3), V(1, -0.25, 0.4)]] },
  { keys: [[V(0.14, 0.24, -0.22), V(0.1, 0.62, 0.78)], [V(0.05, 0.04, -0.56), V(0, 0.3, -1)], [V(0.0, -0.38, -0.46), V(0, -0.9, -0.43)]] },
  { keys: [[V(0.25, -0.2, -0.12), V(-0.05, 0.05, -1)], [V(0.1, -0.12, -0.7), V(0, 0, -1)], [V(0.06, -0.1, -0.86), V(0, 0, -1)]], edge: V(1, 0, 0) },
  { keys: [[V(-0.36, -0.42, -0.3), V(-0.7, -0.6, -0.1)], [V(0, -0.05, -0.56), V(0.1, 0.4, -1)], [V(0.42, 0.26, -0.34), V(0.7, 0.7, 0.1)]] },
];
const REST = { p: V(0.27, -0.3, -0.5), q: basis(V(-0.15, 0.9, -0.4), V(1, 0, 0.1)) };
const GUARD = { p: V(0.36, -0.58, -0.42), q: basis(V(0.15, 0.6, -0.8), V(1, 0, 0)) };
const SH_REST = { p: V(-0.7, -0.6, -0.8), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, -2.2, 0.08)) };
const SH_UP = { p: V(0, -SLIT, -0.3), q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI) };
const Y = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

function basis(d, e) {
  const y = d.clone().normalize(), x = e.clone().addScaledVector(y, -e.dot(y)).normalize(), z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

for (const s of SWINGS) {  // edge leads the motion
  const [W, M, E] = s.keys;
  const edge = (prev, next) => s.edge || next[1].clone().sub(prev[1]);
  s.q = [basis(W[1], edge(W, M)), basis(M[1], edge(W, E)), basis(E[1], edge(M, E))];
  s.p = [W[0], M[0], E[0]];
  s.p2 = W[0].clone().add(W[0].clone().sub(M[0]).multiplyScalar(0.45)).add(V(0, 0.06, 0.05));
  s.q2 = basis(W[1].clone().multiplyScalar(1.5).sub(M[1].clone().multiplyScalar(0.5)), edge(W, M));
  s.ctrl = M[0].clone().multiplyScalar(2).sub(W[0].clone().add(E[0]).multiplyScalar(0.5));
}

class Spring {
  constructor(p, q) { this.p = p.clone(); this.v = new THREE.Vector3(); this.q = q.clone(); this.w = new THREE.Vector3(); }
  step(dt, tp, tq, k, z = 0.75) {
    const c = 2 * z * Math.sqrt(k);
    this.v.addScaledVector(_a.subVectors(tp, this.p).multiplyScalar(k).addScaledVector(this.v, -c), dt);
    this.p.addScaledVector(this.v, dt);
    _q.copy(tq).multiply(_q2.copy(this.q).invert());
    if (_q.w < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
    const ang = 2 * Math.acos(Math.min(1, _q.w)), s = Math.sqrt(1 - _q.w * _q.w);
    const ax = s > 1e-5 ? _b.set(_q.x / s, _q.y / s, _q.z / s) : _b.set(0, 0, 0);
    this.w.addScaledVector(ax.multiplyScalar(ang * k).addScaledVector(this.w, -c), dt);
    const wl = this.w.length();
    if (wl > 1e-6) this.q.premultiply(_q.setFromAxisAngle(_a.copy(this.w).divideScalar(wl), wl * dt)).normalize();
  }
}

export class ViewModel {
  constructor(env) {
    this.env = env;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    this.scene.add(this.root);
    this.hemi = new THREE.HemisphereLight(0x5b6782, 0x2a2018, 0.8);
    this.moon = new THREE.DirectionalLight(0x9fb0d6, 0.8);
    this.warm = [0, 1].map(() => { const l = new THREE.PointLight(0xff9548, 0, 20, 1.8); this.scene.add(l); return l; });
    this.fill = new THREE.PointLight(0xb8a890, 0.3, 2.5, 1.5);  // just enough to read the back of the shield
    this.scene.add(this.hemi, this.moon, this.moon.target, this.fill);
    const sleeve = swapMat('planks_dark', 'leather', (r, g, b, l) => [26 + l * 86, 13 + l * 46, 9 + l * 28], { rough: 0.8 });
    const glove = swapMat('slabs_slate', 'iron', (r, g, b, l) => [14 + l * 92, 13 + l * 88, 15 + l * 92], { metal: 0.7, rough: 0.5, env, envI: 1 });
    const knuckles = mergeGeometries([new THREE.BoxGeometry(0.082, 0.095, 0.085), ...[0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.019, 0.026, 0.03).translate(-0.03 + i * 0.02, 0.035, -0.05)),
      new THREE.BoxGeometry(0.03, 0.05, 0.03).rotateZ(0.4).translate(0.045, 0.01, -0.025), new THREE.CylinderGeometry(0.05, 0.056, 0.09, 10).translate(0, -0.08, 0)]);
    const arm = () => {
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 1, 10).translate(0, 0.5, 0), sleeve);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.056, 1, 10).translate(0, 0.5, 0), sleeve);
      const fist = new THREE.Mesh(knuckles, glove);
      this.root.add(upper, fore, fist);
      return { upper, fore, fist, elbow: new THREE.Vector3(), sh: new THREE.Vector3() };
    };
    this.rArm = arm(); this.lArm = arm();
    this.rh = new Spring(REST.p, REST.q);
    this.lh = new Spring(SH_REST.p, SH_REST.q);
    this.sword = null; this.shield = null; this.weapon = null; this.shieldItem = null;
    this.state = 'idle'; this.t = 0; this.u = 0; this.combo = 0; this.charge = 0; this.held = false; this.idleT = 0;
    this.block = false; this.raised = 0; this.swing = 0; this.hitstop = 0; this.blood = 0;
    this.p0 = new THREE.Vector3(); this.p1 = new THREE.Vector3(); this.q0 = new THREE.Vector3(); this.q1 = new THREE.Vector3();
    this.active = false; this._bob = new THREE.Vector3(); this._dir = new THREE.Vector3(); this._lh = new THREE.Vector3(); this._hand = new THREE.Vector3(); this.kick = new THREE.Vector3(); this.sway = new THREE.Vector2(); this.lastYaw = null;
  }

  setItems(right, left) {
    if (this.weapon !== right) {
      if (this.sword) this.root.remove(this.sword);
      this.weapon = right;
      this.sword = right ? buildModel(right, this.env) : null;
      if (this.sword) this.root.add(this.sword);
    }
    if (this.shieldItem !== left) {
      if (this.shield) this.root.remove(this.shield);
      this.shieldItem = left;
      this.shield = left ? buildModel(left, this.env) : null;
      if (this.shield) this.root.add(this.shield);
    }
  }

  press() { this.held = true; if (this.block) return; this.beginCharge(); }
  release() {
    this.held = false;
    if (this.state !== 'charge') return;
    this.state = 'strike'; this.u = 0; this.swing++;
    this.dur = (this.sword ? 0.27 : 0.2) - this.charge * 0.05;
    sfx.whoosh(this.charge, this.dur + 0.1);
  }
  beginCharge() {
    if (this.state === 'strike') { this.queued = true; return; }
    if (this.state === 'recover' || this.idleT < 0.9) this.combo = (this.combo + 1) % 5; else this.combo = 0;
    if (this.firstSwing === undefined) { this.firstSwing = true; this.combo = 0; }
    this.state = 'charge'; this.t = 0; this.charge = 0;
  }
  setBlock(on) { this.block = on && !!this.shield; if (this.block && this.state === 'charge') this.state = 'recover'; }

  // the blade bit flesh: slow the swing, kick the hand back
  bite(severed) {
    const k = severed ? 0.65 : 0.3;
    this.rh.v.multiplyScalar(k); this.rh.w.multiplyScalar(k);
    this.hitstop = severed ? 0.04 : 0.09;
    this.blood = Math.min(1, this.blood + 0.22);
    this.kick.set((Math.random() - 0.5) * 0.02, 0.012, 0.02);
  }

  update(dt, cam, P, mana) {
    // charge / strike / recover
    const S = SWINGS[this.combo];
    let tp = REST.p, tq = REST.q, k = 220;
    if (this.state === 'idle') this.idleT += dt;
    if (this.state === 'charge') {
      this.t += dt;
      const cap = mana() >= 10 ? 1 : 0.6;
      this.charge = Math.min(cap, this.t / 0.9);
      tp = _a.copy(S.p[0]).lerp(S.p2, this.charge).add(_b.set(Math.sin(this.t * 61), Math.cos(this.t * 47), 0).multiplyScalar(this.charge > 0.98 ? 0.004 : 0));
      tq = _q2.copy(S.q[0]).slerp(S.q2, this.charge);
      k = 260;
    } else if (this.state === 'strike') {
      if (this.hitstop > 0) { this.hitstop -= dt; this.u += dt / this.dur * 0.15; } else this.u += dt / this.dur;
      const u = Math.min(1, this.u), e = u * u * (3 - 2 * u);
      const W = _b.copy(S.p[0]).lerp(S.p2, this.charge);
      tp = _a.copy(W).multiplyScalar((1 - e) ** 2).addScaledVector(S.ctrl, 2 * e * (1 - e)).addScaledVector(S.p[2], e * e);
      const qW = _q.copy(S.q[0]).slerp(S.q2, this.charge);
      tq = e < 0.5 ? qW.slerp(S.q[1], e * 2) : _q.copy(S.q[1]).slerp(S.q[2], (e - 0.5) * 2);
      tq = _q2.copy(tq);
      k = 1300 - 520 * this.charge;  // heavy swings lag and overshoot more
      this.active = u > 0.1 && u < 0.93;
      if (this.u >= 1) { this.state = 'recover'; this.t = 0; this.active = false; }
    } else if (this.state === 'recover') {
      this.t += dt; k = 160;
      if (this.t > 0.32) { this.state = 'idle'; this.idleT = 0; }
      if (this.queued) { this.queued = false; this.beginCharge(); if (!this.held) this.release(); }
      else if (this.held && this.t > 0.05 && !this.block) this.beginCharge();
    }
    if (this.state !== 'strike') this.active = false;
    if (this.block && this.state !== 'strike') { tp = GUARD.p; tq = GUARD.q; k = 200; }
    // sway from walking and turning
    const sp = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 4);
    const yaw = Math.atan2(-cam.matrixWorld.elements[8], -cam.matrixWorld.elements[10]), pitch = Math.asin(Math.max(-1, Math.min(1, -cam.matrixWorld.elements[9])));
    if (this.lastYaw !== null) {
      let dy = yaw - this.lastYaw; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
      this.sway.x += (Math.max(-0.05, Math.min(0.05, dy * 0.8)) - this.sway.x) * Math.min(1, dt * 10);
      this.sway.y += (Math.max(-0.05, Math.min(0.05, (pitch - this.lastPitch) * 0.8)) - this.sway.y) * Math.min(1, dt * 10);
    }
    this.lastYaw = yaw; this.lastPitch = pitch;
    const bob = this._bob.set(Math.sin(P.bob) * 0.014 * sp + this.sway.x, -Math.abs(Math.cos(P.bob)) * 0.012 * sp - this.sway.y, 0);
    this.rh.step(dt, _a.copy(tp).add(bob), tq, k);
    const up = this.block ? 1 : 0;
    const lp = _a.copy(up ? SH_UP.p : SH_REST.p).addScaledVector(bob, up ? 0.35 : 1);
    if (up) lp.y += Math.sin(performance.now() / 700) * 0.002;
    this.lh.step(dt, lp, up ? SH_UP.q : SH_REST.q, up ? 240 : 140, 0.9);
    this.raised = Math.max(0, 1 - this.lh.p.distanceTo(SH_UP.p) / 0.25);
    this.kick.multiplyScalar(Math.exp(-dt * 12));

    // place everything in camera space
    this.root.matrix.copy(cam.matrixWorld);
    this.root.matrixWorld.copy(cam.matrixWorld);
    const hp = _a.copy(this.rh.p).add(this.kick);
    if (this.sword) { this.sword.position.copy(hp); this.sword.quaternion.copy(this.rh.q); }
    this.place(this.rArm, hp, this.rh.q, V(0.24, -0.36, 0.06), 1);
    if (this.shield) {
      this.shield.position.copy(this.lh.p); this.shield.quaternion.copy(this.lh.q);
      const grip = _b.set(0.13, -0.2, -0.07).applyQuaternion(this.lh.q).add(this.lh.p);
      this.place(this.lArm, grip, this.lh.q, V(-0.26, -0.38, 0.06), 0, true);
    } else this.place(this.lArm, this._lh.set(-0.3, -0.38, -0.46), REST.q, V(-0.26, -0.38, 0.06), 1);
    this.root.updateMatrixWorld(true);
    for (const o of this.root.children) o.updateMatrixWorld(true);
    // lights follow the world's lanterns
    this.moon.position.copy(P.moonDir).multiplyScalar(10).add(cam.position); this.moon.target.position.copy(cam.position);
    P.nearLights(cam.position, this.warm);
    this.fill.position.copy(cam.position);
    // blood on the blade
    if (this.sword) {
      this.blood = Math.max(0, this.blood - dt * 0.006);
      this.sword.userData.steel.color.setRGB(0.77 - this.blood * 0.45, 0.78 - this.blood * 0.7, 0.82 - this.blood * 0.72);
      this.sword.userData.steel.roughness = 0.32 - this.blood * 0.15;
    }
    // blade segment in world space (tip reaches a little past the steel)
    this.q0.copy(this.p0); this.q1.copy(this.p1);
    if (this.sword) {
      this.sword.userData.base.getWorldPosition(this.p0);
      this.sword.userData.tip.getWorldPosition(this.p1);
      this.p1.addScaledVector(_a.subVectors(this.p1, this.p0).normalize(), 0.22);
    } else {
      this.rArm.fist.getWorldPosition(this.p0);
      this.p1.copy(this.p0).addScaledVector(_a.set(0, 0, -1).transformDirection(cam.matrixWorld), 0.25);
    }
    this.root.visible = true;
  }

  // two-bone arm from an off-screen shoulder to the hand; the shoulder leans in when the hand reaches past it
  place(arm, hand, q, shoulder, fist, shield) {
    const A = 0.34, B = 0.31, side = Math.sign(shoulder.x);
    hand = this._hand.copy(hand);
    arm.fist.visible = !!fist || !shield;
    arm.fist.position.copy(hand); arm.fist.quaternion.copy(q);
    const sh = arm.sh.copy(shoulder), d = this._dir.subVectors(hand, sh), len = d.length();
    if (len > A + B - 0.01) sh.addScaledVector(d, (len - (A + B - 0.01)) / len);
    d.subVectors(hand, sh);
    const L = d.length(), x = (A * A - B * B + L * L) / (2 * L), h = Math.sqrt(Math.max(0, A * A - x * x));
    const hint = _b.set(side * 0.6, -1, 0.2).addScaledVector(d, -_b.set(side * 0.6, -1, 0.2).dot(d) / (L * L)).normalize();
    arm.elbow.copy(sh).addScaledVector(d, x / L).addScaledVector(hint, h);
    const seg = (m, a, b) => { const v = _a.subVectors(b, a), l = v.length(); m.position.copy(a); m.scale.set(1, l, 1); m.quaternion.setFromUnitVectors(Y, v.divideScalar(l || 1)); };
    seg(arm.upper, sh, arm.elbow);
    seg(arm.fore, arm.elbow, hand);
  }

  // the swept blade this frame, as segments in time order
  segments(n = 5) {
    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      out.push([this.q0.clone().lerp(this.p0, t), this.q1.clone().lerp(this.p1, t)]);
    }
    return out;
  }
}
