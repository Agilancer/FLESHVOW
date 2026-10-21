// Zombies: a jointed body of lathed limbs that shambles, keeps its balance against blows, takes gashes where it is
// struck, loses hands, forearms, arms, feet, legs, its head or its upper half wherever the blade cuts, and falls as a
// verlet ragdoll. Severed parts are ragdolls too.
import * as THREE from 'three';
import { swapTex, tex } from './textures.js';
import { sfx } from './audio.js';

const fleshFn = (r, g, b, l) => [50 + l * 125, 56 + l * 122, 42 + l * 96];
const clothFn = (r, g, b, l) => [20 + l * 74, 18 + l * 62, 16 + l * 52];
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const MEAT = [1.35, 0.06, 0.05];

// joint: parent, rest offset (the zombie faces +Z; L is the +X side)
const JOINTS = { pelvis: [null, 0, 0.98, 0], spine: ['pelvis', 0, 0.25, 0.02], neck: ['spine', 0, 0.27, 0.02], head: ['neck', 0, 0.1, 0.025], crown: ['head', 0, 0.25, 0] };
for (const [s, k] of [[1, 'L'], [-1, 'R']]) Object.assign(JOINTS, {
  ['sh' + k]: ['neck', s * 0.19, -0.05, -0.02], ['el' + k]: ['sh' + k, s * 0.03, -0.29, 0], ['wr' + k]: ['el' + k, 0, -0.26, 0.02], ['fi' + k]: ['wr' + k, 0, -0.16, 0.01],
  ['hip' + k]: ['pelvis', s * 0.1, -0.04, 0], ['kn' + k]: ['hip' + k, s * 0.01, -0.44, 0.02], ['an' + k]: ['kn' + k, 0, -0.43, -0.03], ['to' + k]: ['an' + k, 0, -0.05, 0.16],
});
// bone: from, to, r0, r1, material, integrity (0 = can't be severed), end overlaps e0 e1, cross-section scale sx sz
const BONES = [['abdomen', 'pelvis', 'spine', 0.125, 0.13, 'cloth', 95, 0.13, 0.02, 1.4, 0.9], ['chest', 'spine', 'neck', 0.135, 0.125, 'flesh', 0, 0.02, 0.05, 1.55, 0.88],
  ['neck', 'neck', 'head', 0.048, 0.044, 'flesh', 30, 0.02, 0.03, 1, 1], ['head', 'head', 'crown', 0, 0, 'flesh', 60, 0, 0, 1, 1]];
for (const k of ['L', 'R']) BONES.push(
  ['uarm' + k, 'sh' + k, 'el' + k, 0.052, 0.04, 'flesh', 32, 0.035, 0.015, 1, 1], ['farm' + k, 'el' + k, 'wr' + k, 0.042, 0.03, 'flesh', 24, 0.015, 0.01, 1, 1],
  ['hand' + k, 'wr' + k, 'fi' + k, 0.034, 0.022, 'flesh', 14, 0.012, 0, 0.6, 1.3], ['thigh' + k, 'hip' + k, 'kn' + k, 0.078, 0.055, 'cloth', 48, 0.05, 0.02, 1, 1],
  ['shin' + k, 'kn' + k, 'an' + k, 0.054, 0.036, 'cloth', 38, 0.02, 0.015, 1, 1], ['foot' + k, 'an' + k, 'to' + k, 0.042, 0.03, 'flesh', 18, 0.035, 0.01, 1.15, 0.65]);
const BRACES = [['shL', 'shR'], ['hipL', 'hipR'], ['shL', 'spine'], ['shR', 'spine'], ['hipL', 'spine'], ['hipR', 'spine'], ['shL', 'pelvis'], ['shR', 'pelvis'],
  ['crown', 'neck'], ['toL', 'knL'], ['toR', 'knR'], ['fiL', 'elL'], ['fiR', 'elR']];
const PRAD = { pelvis: 0.12, spine: 0.12, neck: 0.08, head: 0.09, crown: 0.08 };

let mats = null;
function materials() {
  if (mats) return mats;
  mats = {
    flesh: new THREE.MeshStandardMaterial({ map: swapTex('mud_clay', 'zflesh', fleshFn), normalMap: tex('mud_clay_n', false), vertexColors: true, roughness: 0.62 }),
    cloth: new THREE.MeshStandardMaterial({ map: swapTex('dirt_grey', 'zcloth', clothFn), normalMap: tex('dirt_grey_n', false), vertexColors: true, roughness: 0.95 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.5 }),
  };
  mats.flesh.normalScale.setScalar(1.3);
  return mats;
}

const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

function colorize(g, seed, bruise) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 31 + y * 17 + seed) * Math.sin(z * 29 - y * 13 + seed * 2) * 0.5 + 0.5;
    const v = 0.78 + 0.32 * n + (hash(x, y, z) - 0.5) * 0.08;
    const b = bruise && n > 0.82 ? (n - 0.82) * 4 : 0;
    col.set([v * (1 - b * 0.15), v * (1 - b * 0.45), v * (1 - b * 0.05)], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function limbGeo(len, r0, r1, e0, e1, sx, sz, seed, bruise) {
  const total = len + e0 + e1, n = Math.max(10, Math.round(total / 0.022)), pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = -e0 + t * total, k = Math.min(1, Math.max(0, y / len));
    let r = (r0 + (r1 - r0) * k) * (1 + 0.14 * Math.sin(Math.PI * k));
    const rc = Math.min(Math.max(r0, r1), total / 2), d0 = t * total, d1 = total - d0;
    if (d0 < rc) r *= Math.sqrt(Math.max(0, 1 - ((rc - d0) / rc) ** 2));
    if (d1 < rc) r *= Math.sqrt(Math.max(0, 1 - ((rc - d1) / rc) ** 2));
    pts.push(new THREE.Vector2(Math.max(r, 0.0008), y));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  g.scale(sx, 1, sz);
  const uv = g.attributes.uv, circ = Math.PI * 2 * Math.max(r0, r1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / 0.3, uv.getY(i) * total / 0.3);
  colorize(g, seed, bruise);
  g.computeVertexNormals();
  return g;
}

function headGeo(seed) {
  const prof = [[0.001, -0.035], [0.045, -0.03], [0.068, -0.005], [0.08, 0.03], [0.086, 0.07], [0.094, 0.11], [0.1, 0.15], [0.097, 0.19], [0.082, 0.225], [0.052, 0.248], [0.001, 0.26]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  g.scale(0.9, 1, 1.08);
  colorize(g, seed, true);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 0 && y < 0.1) z *= 1.08;  // jaw forward
    let dark = 0;
    for (const ex of [-0.036, 0.036]) {  // sunken eye sockets
      const d = Math.hypot(x - ex, y - 0.125, Math.max(0, 0.1 - z));
      if (d < 0.034 && z > 0.03) { z -= 0.018 * (1 - d / 0.034); dark = Math.max(dark, 1 - d / 0.034); }
    }
    if (z > 0.05 && y > 0.02 && y < 0.055 && Math.abs(x) < 0.04) { z -= 0.012; dark = 1; }  // gaping mouth
    p.setXYZ(i, x, y, z);
    if (dark) c.setXYZ(i, c.getX(i) * (1 - dark * 0.75), c.getY(i) * (1 - dark * 0.85), c.getZ(i) * (1 - dark * 0.85));
  }
  g.computeVertexNormals();
  return g;
}

function orient(dir, ref, out) {
  const y = _a.copy(dir).normalize(), z = _b.copy(ref).addScaledVector(y, -ref.dot(y));
  if (z.lengthSq() < 1e-4) z.set(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  const x = _c.crossVectors(y, z);
  return out.setFromRotationMatrix(_m.makeBasis(x, y, z));
}

// closest points between segments p1q1 and p2q2 (Ericson): returns [s, t, dist]
function segSeg(p1, q1, p2, q2) {
  const d1 = _a.subVectors(q1, p1), d2 = _b.subVectors(q2, p2), r = _c.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a < 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e < 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const dist = _d.copy(p1).addScaledVector(d1, s).sub(_c.copy(p2).addScaledVector(d2, t)).length();
  return [s, t, dist];
}

// ---------------------------------------------------------------- ragdoll
class Ragdoll {
  constructor(scene, joints, bones, colliders, impulse, vel) {
    this.scene = scene; this.colliders = colliders; this.pts = []; this.sticks = []; this.segs = []; this.calm = 0; this.age = 0;
    const idx = new Map();
    for (const j of joints) {
      const p = j.getWorldPosition(new THREE.Vector3()), v = (vel.get(j) || _a.set(0, 0, 0)).clone().add(impulse).multiplyScalar(1 / 60);
      const pt = { p, o: p.clone().sub(v.multiplyScalar(1)), r: PRAD[j.name] ?? 0.045 };
      j.userData.pt = pt;
      idx.set(j, this.pts.length); this.pts.push(pt);
    }
    const stick = (i, k) => this.sticks.push([i, k, this.pts[i].p.distanceTo(this.pts[k].p)]);
    for (const b of bones) {
      const i = idx.get(b.a), k = idx.get(b.b);
      if (i === undefined || k === undefined) continue;
      stick(i, k);
      scene.attach(b.mesh);
      this.segs.push({ mesh: b.mesh, i, k, dir: _a.subVectors(this.pts[k].p, this.pts[i].p).normalize().clone() });
    }
    const byName = new Map(joints.map(j => [j.name, j]));
    for (const [x, y] of BRACES) if (byName.has(x) && byName.has(y)) stick(idx.get(byName.get(x)), idx.get(byName.get(y)));
  }

  update(dt) {
    if (this.calm > 2) return;
    this.age += dt;
    const sub = dt > 0.02 ? 2 : 1, h = dt / sub;
    let motion = 0;
    for (let s = 0; s < sub; s++) {
      for (const q of this.pts) {
        const vx = (q.p.x - q.o.x) * 0.996, vy = (q.p.y - q.o.y) * 0.996, vz = (q.p.z - q.o.z) * 0.996;
        q.o.copy(q.p);
        q.p.x += vx; q.p.y += vy - 9.8 * h * h; q.p.z += vz;
        motion += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
      }
      for (let it = 0; it < 8; it++) {
        for (const [i, k, L] of this.sticks) {
          const a = this.pts[i].p, b = this.pts[k].p, d = _a.subVectors(b, a), l = d.length() || 1e-6, f = (l - L) / l * 0.5;
          a.addScaledVector(d, f); b.addScaledVector(d, -f);
        }
        for (const q of this.pts) if (q.p.y < q.r) { q.p.y = q.r; q.o.x = q.p.x - (q.p.x - q.o.x) * 0.55; q.o.z = q.p.z - (q.p.z - q.o.z) * 0.55; }
      }
      for (const q of this.pts) if (q.p.y < 4) pushOut(q.p, q.r, this.colliders);
    }
    for (const s of this.segs) {
      const a = this.pts[s.i].p, d = _b.subVectors(this.pts[s.k].p, a).normalize();
      s.mesh.position.copy(a);
      s.mesh.quaternion.premultiply(_q.setFromUnitVectors(s.dir, d));
      s.dir.copy(d);
    }
    this.calm = motion < 0.004 * this.pts.length * sub ? this.calm + dt : 0;
  }

  dispose() { for (const s of this.segs) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); } }
}

function pushOut(p, r, colliders) {
  for (const c of colliders) {
    const dx = p.x - c.x, dz = p.z - c.z;
    if (c.r) {
      const d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-5) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
      continue;
    }
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    let lx = cs * dx - sn * dz, lz = sn * dx + cs * dz;
    if (Math.abs(lx) > c.hw + r || Math.abs(lz) > c.hd + r) continue;
    const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz)), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
    if (d >= r) continue;
    if (d > 1e-5) { lx = qx + ex / d * r; lz = qz + ez / d * r; }
    else if (c.hw - Math.abs(lx) < c.hd - Math.abs(lz)) lx = Math.sign(lx || 1) * (c.hw + r); else lz = Math.sign(lz || 1) * (c.hd + r);
    p.x = c.x + cs * lx + sn * lz; p.z = c.z - sn * lx + cs * lz;
  }
}

// ---------------------------------------------------------------- zombie
let nextId = 1;
export class Zombie {
  constructor(horde, level, x, z) {
    const M = materials();
    this.h = horde; this.level = level; this.id = nextId++;
    this.mult = 1 + level * 0.1;
    this.hp = this.maxHp = 260 * this.mult;  // mostly it dies by losing its head, its middle or a leg
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    this.heading = Math.atan2(-x, -z);
    this.seed = Math.random() * 100;
    const S = (0.95 + Math.random() * 0.12) * (1 + Math.min(level, 20) * 0.006);
    this.J = {};
    for (const [name, [par, jx, jy, jz]] of Object.entries(JOINTS)) {
      const o = new THREE.Object3D();
      o.name = name; o.userData.joint = true;
      o.position.set(jx * S, jy * S, jz * S);
      this.J[name] = o;
      (par ? this.J[par] : this.root).add(o);
    }
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.12), fog: false });
    this.bones = [];
    for (const [name, from, to, r0, r1, mat, integ, e0, e1, sx, sz] of BONES) {
      const a = this.J[from], b = this.J[to], len = b.position.length(), dir = b.position.clone().normalize();
      const geo = name === 'head' ? headGeo(this.seed) : limbGeo(len, r0 * S, r1 * S, e0, e1, sx, sz, this.seed + len * 10, mat === 'flesh');
      const mesh = new THREE.Mesh(geo, M[mat]);
      mesh.castShadow = true;
      orient(dir, name.startsWith('foot') ? Y : Z, mesh.quaternion);
      a.add(mesh);
      const bone = { name, a, b, len, r: Math.max(r0, r1, name === 'head' ? 0.1 : 0) * S * Math.max(sx, sz), mesh, integ: integ * this.mult, sev: integ > 0 };
      this.bones.push(bone);
      if (name === 'head') for (const ex of [-0.036, 0.036]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), this.eyeMat);
        eye.position.set(ex, 0.125, 0.092);
        mesh.add(eye);
      }
    }
    this.vel = new THREE.Vector3(); this.lean = new THREE.Vector2(); this.leanV = new THREE.Vector2();
    this.flinch = new Map(); this.last = new Map(); this.jv = new Map();
    this.phase = Math.random() * 6; this.atk = -1; this.cool = 1; this.moanT = 1 + Math.random() * 4; this.stuck = 0; this.detour = 0;
    this.speed = 0.5 + Math.min(level, 10) * 0.025 + Math.random() * 0.12;
    this.dead = false; this.limp = 0; this.lastSwing = -1;
    horde.scene.add(this.root);
  }

  get pos() { return this.root.position; }
  has(n) { return this.bones.some(b => b.name === n && !b.cut); }

  update(dt, t, P) {
    const pos = this.root.position, toX = P.pos.x - pos.x, toZ = P.pos.z - pos.z, dist = Math.hypot(toX, toZ);
    // steering: straight at the player, around obstacles if stuck
    let want = Math.atan2(toX, toZ);
    if (this.detour > 0) { this.detour -= dt; want += this.detourDir * 1.2; }
    let dh = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.heading += Math.max(-1.5 * dt, Math.min(1.5 * dt, dh));
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const arms = (this.has('uarmL') ? 1 : 0) + (this.has('uarmR') ? 1 : 0);
    this.cool -= dt;
    let moving = 0;
    if (this.atk >= 0) {
      const prev = this.atk;
      this.atk += dt / 1.15;
      if (prev < 0.6 && this.atk >= 0.6) {  // the blow lands
        const ang = Math.abs(((Math.atan2(toX, toZ) - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dist < 1.75 && ang < 0.9 && !P.dead) {
          const dmg = (7 + this.level * 0.8) * (arms === 2 ? 1 : arms ? 0.8 : 0.6) * (0.85 + Math.random() * 0.3);
          if (this.h.hurtPlayer(dmg, this)) { this.leanV.x -= 4; this.vel.addScaledVector(_a.set(fx, 0, fz), -2.2); this.cool = 1.6; }
        }
      }
      if (this.atk >= 0.55 && this.atk < 0.72) { pos.x += fx * dt * 1.4; pos.z += fz * dt * 1.4; }
      if (this.atk >= 1) { this.atk = -1; this.cool = 0.9 + Math.random() * 0.8; }
    } else if (dist > 1.12 && !P.dead) {
      const sp = this.speed * (this.limp ? 0.5 : 1) * (1 - Math.min(0.6, this.lean.length()));
      const ox = pos.x, oz = pos.z;
      pos.x += fx * sp * dt; pos.z += fz * sp * dt;
      this.phase += dt * sp * 4.6;
      moving = 1;
      this._moved = [ox, oz];
    } else if (this.cool <= 0 && dist < 1.35 && !P.dead) { this.atk = 0; sfx.growl(pos); }
    // stagger, balance
    pos.addScaledVector(this.vel, dt);
    this.vel.multiplyScalar(Math.exp(-dt * 5));
    const k = 38, c = 6.5;
    this.leanV.x += (-k * this.lean.x - c * this.leanV.x) * dt;
    this.leanV.y += (-k * this.lean.y - c * this.leanV.y) * dt;
    this.lean.addScaledVector(this.leanV, dt);
    const ll = this.lean.length();
    if (ll > 0.45) {  // catch itself with a step
      const lx = this.lean.y * -1, lz = this.lean.x;  // local lean direction
      pos.x += (Math.cos(this.heading) * lx + Math.sin(this.heading) * lz) * dt * 1.2;
      pos.z += (-Math.sin(this.heading) * lx + Math.cos(this.heading) * lz) * dt * 1.2;
      if (ll > 0.85) this.lean.multiplyScalar(0.85 / ll);
    }
    // collisions
    const bx = pos.x, bz = pos.z;
    pushOut(pos, 0.32, this.h.colliders);
    for (const o of this.h.zombies) if (o !== this && !o.dead) {
      const dx = pos.x - o.pos.x, dz = pos.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.6 && d > 1e-4) { pos.x += dx / d * (0.6 - d) * 0.5; pos.z += dz / d * (0.6 - d) * 0.5; }
    }
    if (dist < 0.75 && dist > 1e-4) { pos.x -= toX / dist * (0.75 - dist); pos.z -= toZ / dist * (0.75 - dist); }
    if (moving && Math.hypot(pos.x - this._moved[0], pos.z - this._moved[1]) < this.speed * dt * 0.3) {
      if ((this.stuck += dt) > 0.8 && this.detour <= 0) { this.detour = 2.2; this.detourDir = Math.random() < 0.5 ? -1 : 1; this.stuck = 0; }
    } else this.stuck = 0;
    if (Math.abs(bx - pos.x) + Math.abs(bz - pos.z) > 0.002 && this.detour <= 0 && dist > 3) this.stuck += dt * 0.5;
    this.moanT -= dt;
    if (this.moanT <= 0) { this.moanT = 4 + Math.random() * 6; sfx.moan(_a.copy(pos).setY(1.6), 1 - this.level * 0.01); }
    this.pose(dt, t);
  }

  pose(dt, t) {
    const J = this.J, p = this.phase, L = this.lean, S = this.root;
    S.rotation.y = this.heading;
    const atk = this.atk < 0 ? 0 : this.atk, wind = Math.min(1, atk / 0.5), strike = atk > 0.55 ? Math.min(1, (atk - 0.55) / 0.15) : 0;
    const rec = atk > 0.75 ? (atk - 0.75) / 0.25 : 0;
    const set = (j, x, y, z) => { if (!J[j]) return; J[j].quaternion.setFromEuler(_e.set(x, y, z)); const f = this.flinch.get(j); if (f) J[j].quaternion.multiply(_q.setFromAxisAngle(_a.copy(f.r).normalize(), f.r.length() || 0)); };
    if (J.pelvis) J.pelvis.position.y = JOINTS.pelvis[2] * (1 - this.limp * 0.04) - Math.abs(Math.sin(p)) * 0.025 - atk * 0.03;
    set('pelvis', L.x * 0.35, Math.sin(p) * 0.12, Math.sin(p) * 0.05 + L.y * 0.35 + this.limp * 0.08);
    set('spine', 0.22 + L.x * 0.65 - wind * (1 - strike) * 0.15 + strike * (1 - rec) * 0.45, -Math.sin(p) * 0.08, -Math.sin(p) * 0.04 + L.y * 0.65);
    set('neck', 0.12, 0, 0);
    set('head', -0.3 + Math.sin(t * 0.6 + this.seed) * 0.08, Math.sin(t * 0.3 + this.seed) * 0.15, Math.sin(t * 0.45 + this.seed) * 0.18);
    for (const [s, k, ph] of [[1, 'L', p], [-1, 'R', p + Math.PI]]) {
      const A = 0.42 * (k === 'R' && this.limp ? 0.5 : 1), hip = -Math.sin(ph) * A;
      const knee = 0.12 + 0.6 * Math.max(0, Math.cos(ph));
      set('hip' + k, hip, 0, s * 0.03);
      set('kn' + k, knee, 0, 0);
      set('an' + k, -(hip + knee) * 0.8, 0, 0);
      const reach = -1.25 + Math.sin(p * 0.5 + s) * 0.1;
      const arm = this.atk < 0 ? reach : atk < 0.55 ? reach + (-2.65 - reach) * wind : atk < 0.75 ? -2.65 + (2.25 * strike) : -0.4 + (reach + 0.4) * rec;
      set('sh' + k, arm, 0, s * (0.16 + Math.sin(t * 0.8 + s) * 0.04));
      set('el' + k, -0.28 - Math.sin(t * 1.1 + s * 2) * 0.08, 0, 0);
      set('wr' + k, 0.55, 0, 0);
    }
    // flinch springs relax
    for (const f of this.flinch.values()) { f.v.addScaledVector(f.r, -70 * dt).multiplyScalar(Math.exp(-dt * 7)); f.r.addScaledVector(f.v, dt); }
    this.root.updateMatrixWorld(true);
    for (const j of Object.values(J)) {  // joint velocities, for ragdolls
      const w = j.getWorldPosition(_a), l = this.last.get(j);
      if (l) { const v = this.jv.get(j) || new THREE.Vector3(); v.subVectors(w, l).divideScalar(Math.max(dt, 1e-3)); this.jv.set(j, v); l.copy(w); }
      else this.last.set(j, w.clone());
    }
  }

  // blade segment p0-p1 against every live bone; returns the best { bone, s, t, dist }
  test(p0, p1, reach) {
    let best = null;
    for (const b of this.bones) {
      if (b.cut === 'gone') continue;
      const A = b.mesh.getWorldPosition(_d.clone()), dir = _c.set(0, 1, 0).applyQuaternion(b.mesh.getWorldQuaternion(_q)), B = A.clone().addScaledVector(dir, b.len);
      const [s, tt, dist] = segSeg(p0, p1, A, B);
      if (dist < b.r + reach && (!best || dist - b.r < best.dist - best.bone.r)) best = { bone: b, s, t: tt, dist, A, B };
    }
    return best;
  }

  hit(h) {
    const { bone: b, point, dir, power, dmg, sever } = h;
    const hm = b.name === 'head' ? 1.3 : b.name === 'neck' ? 1.2 : b.name.startsWith('hand') || b.name.startsWith('foot') ? 0.6 : 1;
    this.hp -= dmg * hm;
    const gore = this.h.gore;
    // gash: deform toward the bone axis along the cut plane, paint it raw
    const lp = b.mesh.worldToLocal(point.clone());
    const ln = h.plane.clone().applyQuaternion(b.mesh.getWorldQuaternion(_q).invert()).normalize();
    gash(b.mesh.geometry, lp, ln, Math.min(0.75, 0.25 + dmg / 55) * b.r, 0.012 + power * 0.012, 0.05 + power * 0.06 + b.r * 0.8);
    // reaction: lean, stagger, flinch the struck joint
    const loc = _a.copy(dir).applyAxisAngle(Y, -this.heading), J = power * (b.name === 'head' ? 1.4 : 1) / this.mult ** 0.5;
    this.leanV.x += loc.z * J * 4.5; this.leanV.y += -loc.x * J * 4.5;
    this.vel.addScaledVector(_b.copy(dir).setY(0), J * 0.55);
    const ax = _c.crossVectors(_d.set(0, 1, 0).applyQuaternion(b.mesh.getWorldQuaternion(_q)), dir).normalize();
    const pq = b.a.parent ? b.a.parent.getWorldQuaternion(new THREE.Quaternion()).invert() : _q.identity();
    const f = this.flinch.get(b.a.name) || { r: new THREE.Vector3(), v: new THREE.Vector3() };
    f.v.addScaledVector(ax.applyQuaternion(pq), J * 9);
    this.flinch.set(b.a.name, f);
    if (this.atk >= 0 && this.atk < 0.55 && power > 0.7) { this.atk = -1; this.cool = 0.8; }  // heavy blows interrupt
    const yc = lp.y;
    b.integ -= dmg * sever;
    const out = { severed: false, killed: false };
    gore.burst(point, _b.copy(dir).multiplyScalar(0.8).add(_c.copy(point).sub(b.mesh.getWorldPosition(_d)).setY(0.15).normalize().multiplyScalar(0.6)).normalize(), power, Math.round(1 + power * 3));
    if (b.sev && b.integ <= 0 && !b.cut) {
      const neck = b.name === 'head' && this.bones.find(x => x.name === 'neck' && !x.cut);  // a smashed head comes off at the top of the neck
      if (neck) { this.sever(neck, neck.len * 0.85, dir, power); out.severed = true; }
      else if (b.name !== 'head') { this.sever(b, Math.min(b.len * 0.9, Math.max(b.len * (b.name === 'neck' ? 0.2 : 0.12), yc)), dir, power); out.severed = true; }
    }
    sfx[out.severed ? 'sever' : 'flesh'](power, point);
    const legs = ['thighL', 'shinL', 'thighR', 'shinR'].some(n => this.bones.some(x => x.name === n && x.cut));
    if (this.hp <= 0 || !this.has('neck') || !this.has('abdomen') || legs) { this.die(dir.clone().multiplyScalar(0.6 + power * 0.8)); out.killed = true; }
    if (!out.killed && (this.bones.some(x => x.name.startsWith('foot') && x.cut))) this.limp = 1;
    return out;
  }

  sever(b, yc, dir, power) {
    const M = materials(), gore = this.h.gore;
    this.root.updateMatrixWorld(true);
    const geo = b.mesh.geometry, stump = clampGeo(geo, yc, true), piece = clampGeo(geo, yc, false);
    piece.translate(0, -yc, 0);
    const local = _a.set(0, 1, 0).applyQuaternion(b.mesh.quaternion);
    const X = new THREE.Object3D(); X.name = 'cut'; X.userData.joint = true;
    X.position.copy(b.mesh.position).addScaledVector(local, yc);
    b.a.add(X);
    const end = new THREE.Object3D(); end.name = 'stump'; end.userData.joint = true;
    end.position.copy(X.position);
    b.a.add(end);
    X.updateMatrixWorld(true);
    X.attach(b.b);
    const pm = new THREE.Mesh(piece, b.mesh.material);
    pm.quaternion.copy(b.mesh.quaternion); pm.castShadow = true;
    X.add(pm);
    for (const [m, y0] of [[b.mesh, yc - 0.012], [pm, -0.02]]) {  // bone through the wound
      const st = new THREE.Mesh(new THREE.CylinderGeometry(b.r * 0.22, b.r * 0.26, 0.04, 6).translate(0, y0 + 0.02, 0), M.bone);
      m.add(st);
    }
    for (const c of b.mesh.children.slice()) if (c.geometry && c.geometry.type === 'SphereGeometry') pm.attach(c);  // eyes go with the head piece
    b.mesh.geometry = stump; geo.dispose();
    b.cut = true;
    const oldB = b.b;
    b.b = end; b.len = yc;
    // everything under X becomes a ragdoll
    const joints = [], bones = [{ a: X, b: oldB, mesh: pm }];
    X.traverse(o => { if (o.userData.joint) joints.push(o); });
    const set = new Set(joints);
    for (const o of this.bones) if (set.has(o.a)) { bones.push(o); o.cut = 'gone'; }
    this.bones = this.bones.filter(o => o.cut !== 'gone');
    for (const j of joints) { if (!this.jv.has(j)) this.jv.set(j, (this.jv.get(oldB) || new THREE.Vector3()).clone()); delete this.J[j.name]; }
    const imp = dir.clone().multiplyScalar(0.5 + power * 1.1).add(_b.set(0, 0.5 + power * 0.6, 0));
    const rag = new Ragdoll(this.h.scene, joints, bones, this.h.colliders, imp, this.jv);
    if (b.name === 'neck') for (const p of rag.pts) { p.o.x -= dir.x * 0.01; p.o.y -= 0.03; p.o.z -= dir.z * 0.01; }  // heads fly
    this.h.ragdolls.push(rag);
    b.a.remove(X);
    // pumping stumps on both sides
    const a = b.a, src = (j, from) => () => {
      const p = j.userData.pt ? j.userData.pt.p : (j.parent ? j.getWorldPosition(new THREE.Vector3()) : null);
      if (!p) return null;
      const q = from.userData.pt ? from.userData.pt.p : from.getWorldPosition(new THREE.Vector3());
      return { p, d: p.clone().sub(q).normalize().add(_c.set(0, 0.3, 0)).normalize() };
    };
    gore.spurt(src(end, a), b.name === 'neck' || b.name === 'abdomen' ? 5 : 3.2, b.name === 'neck' ? 260 : 170);
    gore.spurt(src(X, oldB), 2, 110);
    gore.burst(X.userData.pt.p, dir, power + 0.6, 5 + Math.round(power * 5));
  }

  die(imp) {
    if (this.dead) return;
    this.dead = true;
    this.root.updateMatrixWorld(true);
    const joints = [];
    this.root.traverse(o => { if (o.userData.joint) joints.push(o); });
    const rag = new Ragdoll(this.h.scene, joints, this.bones, this.h.colliders, imp.setY(Math.max(imp.y, 0.3)), this.jv);
    this.h.ragdolls.push(rag);
    this.h.scene.remove(this.root);
    this.corpse = rag;
    const p = this.J.pelvis ? this.J.pelvis.userData.pt : rag.pts[0];
    setTimeout(() => { if (p) { this.h.gore.pool(p.p.x, p.p.z, 1 + Math.random() * 0.6); sfx.thud(p.p); } }, 900);
    this.h.onKill(this);
  }
}

function gash(g, lp, ln, depth, width, R) {
  const P = g.attributes.position, C = g.attributes.color;
  for (let i = 0; i < P.count; i++) {
    _a.fromBufferAttribute(P, i);
    const d = _a.distanceTo(lp);
    if (d > R * 1.7) continue;
    const pd = Math.abs(_b.subVectors(_a, lp).dot(ln));
    const cut = Math.max(0, 1 - d / R) * Math.max(0, 1 - pd / width);
    if (cut > 0) {
      const rr = Math.hypot(_a.x, _a.z), nr = Math.max(rr * 0.15, rr - depth * cut);
      if (rr > 1e-4) P.setXYZ(i, _a.x * nr / rr, _a.y, _a.z * nr / rr);
    }
    const red = Math.min(1, cut * 2) + Math.max(0, 1 - d / (R * 1.7)) * 0.35;
    if (red > 0) {
      const k = Math.min(1, red);
      C.setXYZ(i, C.getX(i) + (MEAT[0] - C.getX(i)) * k, C.getY(i) + (MEAT[1] - C.getY(i)) * k, C.getZ(i) + (MEAT[2] - C.getZ(i)) * k);
    }
  }
  P.needsUpdate = true; C.needsUpdate = true;
  g.computeVertexNormals();
}

// squash everything past the cut onto the cut plane (a raw cap), on one side
function clampGeo(g, yc, below) {
  const n = g.clone(), P = n.attributes.position, C = n.attributes.color;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i);
    if (below ? y > yc : y < yc) {
      P.setY(i, yc);
      const k = 0.85 + Math.random() * 0.3;
      C.setXYZ(i, MEAT[0] * k, MEAT[1] * k, MEAT[2] * k);
      P.setX(i, P.getX(i) * 0.92); P.setZ(i, P.getZ(i) * 0.92);
    }
  }
  n.computeVertexNormals();
  return n;
}

// ---------------------------------------------------------------- horde
export class Horde {
  constructor(scene, gore, colliders) {
    this.scene = scene; this.gore = gore; this.colliders = colliders;
    this.zombies = []; this.ragdolls = []; this.corpses = [];
    this.hurtPlayer = () => false; this.onKill = () => {};
  }

  spawn(level, x, z) { const zb = new Zombie(this, level, x, z); this.zombies.push(zb); return zb; }

  update(dt, t, P) {
    for (const z of this.zombies) if (!z.dead) z.update(dt, t, P);
    for (const z of this.zombies) if (z.dead) {
      z.eyeMat.color.multiplyScalar(Math.exp(-dt * 0.9));
      this.corpses.push(z);
    }
    this.zombies = this.zombies.filter(z => !z.dead);
    for (const r of this.ragdolls) r.update(dt);
    while (this.ragdolls.length > 40) this.ragdolls.shift().dispose();
    for (const z of this.corpses) z.eyeMat.color.multiplyScalar(Math.exp(-dt * 0.9));
    if (this.corpses.length > 30) this.corpses.shift();
  }

  // blade sweep: list of [p0, p1] segments in time order; returns hits for zombies not yet struck by this swing
  sweep(segs, swing, reach) {
    const out = [];
    for (const z of this.zombies) {
      if (z.dead || z.lastSwing === swing) continue;
      if (z.pos.distanceTo(segs[0][0]) > 4) continue;
      for (const [p0, p1] of segs) {
        const h = z.test(p0, p1, reach);
        if (h) {
          const bp = h.A.clone().lerp(h.B, h.t), sp = p0.clone().lerp(p1, h.s), n = sp.clone().sub(bp);
          const point = n.lengthSq() > 1e-8 ? bp.addScaledVector(n.normalize(), Math.min(h.bone.r, h.dist)) : bp;
          z.lastSwing = swing;
          out.push({ z, bone: h.bone, point });
          break;
        }
      }
    }
    return out;
  }

  clear() {
    for (const z of this.zombies) this.scene.remove(z.root);
    for (const r of this.ragdolls) r.dispose();
    this.zombies = []; this.ragdolls = []; this.corpses = [];
  }
}
