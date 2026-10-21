// First-person walker: pointer-lock mouse look, WASD, Shift to run, Space to jump; circle vs. box/circle colliders.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const EYE = 1.68, RADIUS = 0.38, WALK = 4.2, RUN = 7.5, JUMP = 4.8, GRAVITY = 15;

export class Player {
  constructor(camera, dom, colliders, bound) {
    this.cam = camera; this.colliders = colliders; this.bound = bound;
    this.controls = new PointerLockControls(camera, dom);
    this.pos = new THREE.Vector3(0, 0, 9);
    this.vel = new THREE.Vector3();
    this.vy = 0; this.bob = 0; this.keys = new Set();
    camera.position.set(this.pos.x, EYE, this.pos.z);
    camera.lookAt(0, 1.6, -15);
    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'Space' && this.controls.isLocked) e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  update(dt) {
    const k = this.keys, live = (this.controls.isLocked || this.free) && !this.dead;
    const f = (live && (k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0) - (live && (k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0);
    const s = (live && (k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0) - (live && (k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0);
    const fwd = new THREE.Vector3();
    this.cam.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const want = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (want.lengthSq() > 1) want.normalize();
    const onGround = this.pos.y <= 0;
    want.multiplyScalar((k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK) * (this.speedMul ?? 1));
    this.vel.lerp(want, 1 - Math.exp(-dt * (onGround ? 12 : 2.5)));
    this.pos.addScaledVector(this.vel, dt);

    if (live && onGround && k.has('Space')) this.vy = JUMP;
    this.vy -= GRAVITY * dt;
    this.pos.y = Math.max(0, this.pos.y + this.vy * dt);
    if (this.pos.y === 0) this.vy = Math.max(0, this.vy);

    for (let i = 0; i < 3; i++) this.collide();
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > this.bound) this.pos.multiplyScalar(this.bound / d).setY(this.pos.y);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.bob += dt * speed * 2.1;
    const bobY = onGround ? Math.sin(this.bob) * 0.035 * Math.min(1, speed / WALK) : 0;
    this.cam.position.set(this.pos.x, this.pos.y + EYE + bobY, this.pos.z);
  }

  collide() {
    const p = this.pos;
    for (const c of this.dynamic ? this.colliders.concat(this.dynamic) : this.colliders) {
      let dx = p.x - c.x, dz = p.z - c.z;
      if (c.r) {
        const d = Math.hypot(dx, dz), m = c.r + RADIUS;
        if (d < m && d > 1e-5) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
        continue;
      }
      // into the box's local frame (inverse of its rotation.y), push out, and back
      const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      let lx = cs * dx - sn * dz, lz = sn * dx + cs * dz;
      const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
      let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
      if (d >= RADIUS) continue;
      if (d > 1e-5) { lx = qx + ex / d * RADIUS; lz = qz + ez / d * RADIUS; }
      else if (c.hw - Math.abs(lx) < c.hd - Math.abs(lz)) lx = Math.sign(lx || 1) * (c.hw + RADIUS);  // inside: out the nearest side
      else lz = Math.sign(lz || 1) * (c.hd + RADIUS);
      p.x = c.x + cs * lx + sn * lz;
      p.z = c.z - sn * lx + cs * lz;
    }
  }
}
