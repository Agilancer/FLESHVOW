// Box movement against the level, and Quake's player physics (pmove.c numbers converted at 32 units = 1 m).
import * as THREE from 'three';

export const Q = 1 / 32;                      // one Quake unit in metres
export const GRAVITY = 800 * Q;               // 25 m/s^2
const STEP = 18 * Q + 0.02;                    // step-up height
const EPS = 0.001;

// move an entity box (pos at the feet centre, half width r, height h) along one axis; returns the distance moved
export function moveAxis(level, e, axis, d) {
  if (!d) return 0;
  const p = e.pos, r = e.r, h = e.h;
  let x0 = p.x - r, x1 = p.x + r, y0 = p.y, y1 = p.y + h, z0 = p.z - r, z1 = p.z + r;
  if (axis === 0) { if (d > 0) x1 += d; else x0 += d; }
  else if (axis === 1) { if (d > 0) y1 += d; else y0 += d; }
  else { if (d > 0) z1 += d; else z0 += d; }
  let allow = d, hit = null;
  level.forBoxes(x0, z0, x1, z1, (b) => {
    if (b.y1 <= y0 + EPS || b.y0 >= y1 - EPS) return;
    if (b.x1 <= x0 + EPS || b.x0 >= x1 - EPS || b.z1 <= z0 + EPS || b.z0 >= z1 - EPS) return;
    if (axis === 0) {
      if (d > 0 && b.x0 >= p.x + r - EPS) { const a = b.x0 - (p.x + r) - EPS; if (a < allow) { allow = a; hit = b; } }
      else if (d < 0 && b.x1 <= p.x - r + EPS) { const a = b.x1 - (p.x - r) + EPS; if (a > allow) { allow = a; hit = b; } }
    } else if (axis === 1) {
      if (d > 0 && b.y0 >= p.y + h - EPS) { const a = b.y0 - (p.y + h) - EPS; if (a < allow) { allow = a; hit = b; } }
      else if (d < 0 && b.y1 <= p.y + EPS) { const a = b.y1 - p.y + EPS; if (a > allow) { allow = a; hit = b; } }
    } else {
      if (d > 0 && b.z0 >= p.z + r - EPS) { const a = b.z0 - (p.z + r) - EPS; if (a < allow) { allow = a; hit = b; } }
      else if (d < 0 && b.z1 <= p.z - r + EPS) { const a = b.z1 - (p.z - r) + EPS; if (a > allow) { allow = a; hit = b; } }
    }
  });
  if (d > 0) allow = Math.max(0, allow); else allow = Math.min(0, allow);
  if (axis === 0) p.x += allow; else if (axis === 1) p.y += allow; else p.z += allow;
  e._hit = hit;
  return allow;
}

// also block against other monsters / the player (simple box overlap, x/z only)
function entBlock(e, others, axis, d) {
  if (!others) return d;
  for (const o of others) {
    if (o === e || o.dead || o.nonsolid) continue;
    const rr = e.r + o.r;
    if (e.pos.y + e.h <= o.pos.y || e.pos.y >= o.pos.y + o.h) continue;
    const ox = o.pos.x - e.pos.x, oz = o.pos.z - e.pos.z;
    if (axis === 0) { if (Math.abs(oz) >= rr) continue; if (d > 0 && ox >= rr - .01) d = Math.min(d, ox - rr); else if (d < 0 && ox <= -rr + .01) d = Math.max(d, ox + rr); }
    else { if (Math.abs(ox) >= rr) continue; if (d > 0 && oz >= rr - .01) d = Math.min(d, oz - rr); else if (d < 0 && oz <= -rr + .01) d = Math.max(d, oz + rr); }
  }
  return d;
}

// slide-move with stairs: returns {blocked}
export function slideMove(level, e, dx, dy, dz, others, canStep = true) {
  const sx = e.pos.x, sz = e.pos.z;
  dx = entBlock(e, others, 0, dx); const mx = moveAxis(level, e, 0, dx);
  dz = entBlock(e, others, 2, dz); const mz = moveAxis(level, e, 2, dz);
  const blockedH = Math.abs(mx - dx) > 1e-4 || Math.abs(mz - dz) > 1e-4;
  if (blockedH && canStep && e.onGround && dy <= 0.001) {
    // try again from STEP higher, then settle down
    const keep = e.pos.clone();
    e.pos.x = sx; e.pos.z = sz;
    const up = moveAxis(level, e, 1, STEP);
    const mx2 = moveAxis(level, e, 0, dx), mz2 = moveAxis(level, e, 2, dz);
    moveAxis(level, e, 1, -up - 0.05);
    const gain = Math.hypot(mx2, mz2) - Math.hypot(mx, mz);
    if (gain > 1e-3 && e._hit) e.stepped = e.pos.y - keep.y; else e.pos.copy(keep);
  }
  const my = moveAxis(level, e, 1, dy);
  const blockedV = Math.abs(my - dy) > 1e-4;
  if (dy < 0) e.onGround = blockedV;
  else if (dy > 0 && blockedV && e.vel) e.vel.y = Math.min(0, e.vel.y);
  if (dy <= 0 && !blockedV) e.onGround = false;
  return { blockedH, blockedV, mx, mz };
}

// ground probe without moving
export function probeGround(level, e) {
  const y = e.pos.y; const m = moveAxis(level, e, 1, -0.03);
  const g = m > -0.029; e.pos.y = y; return g;
}

// Quake pmove: friction, accelerate, airaccelerate (wishspeed capped at 30 units in the air => strafe jumping)
const MAXSPEED = 320 * Q, STOPSPEED = 100 * Q, ACCEL = 10, AIRACCEL = 10, FRICTION = 4, JUMP = 270 * Q;
export function playerMove(level, P, input, dt, others) {
  const v = P.vel;
  const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const wish = new THREE.Vector3().addScaledVector(fwd, input.fwd).addScaledVector(right, input.side);
  let wishspeed = Math.min(1, wish.length()) * MAXSPEED * (input.walk ? 0.5 : 1);
  if (wish.lengthSq() > 0) wish.normalize();
  const inWater = P.waterLevel >= 2;
  if (inWater) {
    // swimming: look direction drives vertical motion, jump swims up
    const pitchF = new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
    const w3 = pitchF.multiplyScalar(input.fwd).addScaledVector(right, input.side);
    if (input.jump) w3.y += 1;
    let ws = Math.min(1, w3.length()) * MAXSPEED * 0.7;
    if (w3.lengthSq() > 0) w3.normalize(); else v.y -= 60 * Q * dt;   // slow sink
    const sp = v.length();
    if (sp > 0) { const drop = sp * FRICTION * dt; v.multiplyScalar(Math.max(0, sp - drop) / sp); }
    accelerate(v, w3, ws, ACCEL, dt);
    const r = slideMove(level, P, v.x * dt, v.y * dt, v.z * dt, others);
    if (r.blockedH && input.jump && input.fwd > 0) v.y = 9;   // Quake's water jump onto a ledge
    P.onGround = probeGround(level, P);
    return;
  }
  if (P.onGround) {
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0) {
      const control = Math.max(sp, STOPSPEED);
      const ns = Math.max(0, sp - control * FRICTION * dt);
      v.x *= ns / sp; v.z *= ns / sp;
    }
    accelerate(v, wish, wishspeed, ACCEL, dt);
    if (input.jump && P.canJump) { v.y = JUMP; P.onGround = false; P.canJump = false; P.jumped = true; }
  } else {
    accelerate(v, wish, Math.min(wishspeed, 30 * Q), AIRACCEL, dt, wishspeed);
  }
  if (!input.jump) P.canJump = true;
  if (!P.onGround) v.y -= GRAVITY * dt;
  if (v.y < -60) v.y = -60;
  const fallV = v.y;
  const res = slideMove(level, P, v.x * dt, v.y * dt, v.z * dt, others);
  if (res.blockedV && fallV < 0) { if (P.onGround && fallV < -10) P.landed = fallV; v.y = 0; }
  if (Math.abs(res.mx - v.x * dt) > 1e-4 && !P.stepped) v.x = res.mx / dt;
  if (Math.abs(res.mz - v.z * dt) > 1e-4 && !P.stepped) v.z = res.mz / dt;
  P.stepped = 0;
  if (!P.onGround && v.y <= 0) P.onGround = probeGround(level, P);
}

// Quake's accelerate: adds speed toward wishdir only up to wishspeed along it; air control uses the uncapped accel
function accelerate(v, wishdir, wishspeed, accel, dt, accelSpeed) {
  const cur = v.x * wishdir.x + v.y * wishdir.y + v.z * wishdir.z;
  const add = wishspeed - cur;
  if (add <= 0) return;
  const a = Math.min(add, accel * dt * (accelSpeed ?? wishspeed));
  v.x += a * wishdir.x; v.y += a * wishdir.y; v.z += a * wishdir.z;
}

// monsters and gibs: gravity + slide, returns the slide result
export function entityMove(level, e, dt, others, fly = false) {
  if (!fly && !e.onGround) e.vel.y -= GRAVITY * dt;
  const res = slideMove(level, e, e.vel.x * dt, e.vel.y * dt, e.vel.z * dt, others, !fly);
  if (res.blockedV) e.vel.y = 0;
  if (!fly && !e.onGround && e.vel.y <= 0) e.onGround = probeGround(level, e);
  return res;
}
