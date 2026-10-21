// Blood: spray particles, wet splats on the ground, growing pools, flying chunks of meat, spurting stumps.
import * as THREE from 'three';
import { swapTex, tex } from './textures.js';

const N = 6000, MAXDECAL = 1400, MAXCHUNK = 240;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function splatTex() {
  const S = 128, c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = c.height = S;
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(64, 64, 30, 0, 7); x.fill();
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * 7, d = 18 + Math.random() * 38, r = 3 + Math.random() * 12 * (1 - d / 64);
    x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, Math.max(1.5, r), 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export const meatFn = (r, g, b, l) => [70 + l * 150, 6 + l * 28, 6 + l * 22];

export class Gore {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders;
    this.pos = new Float32Array(N * 3).fill(-100);
    this.vel = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.life = new Float32Array(N);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 600 };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: `attribute float aSize; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(aSize * uScale / -mv.z, 22.0); }`,
      fragmentShader: `void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
        gl_FragColor = vec4(vec3(0.34, 0.012, 0.01) * (0.55 + 1.2 * (0.25 - d)), 1.0); }`,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    const dm = new THREE.MeshStandardMaterial({ map: splatTex(), color: 0x4a0404, roughness: 0.42, metalness: 0, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), dm, MAXDECAL);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAXDECAL; i++) this.decals.setMatrixAt(i, _m);
    this.decals.frustumCulled = false;
    this.decals.receiveShadow = true;
    scene.add(this.decals);
    this.dHead = 0; this.decalBudget = 0;
    this.poolMat = dm.clone(); this.poolMat.color.set(0x3e0303); this.poolMat.roughness = 0.3;
    this.pools = [];

    this.meat = new THREE.MeshStandardMaterial({ map: swapTex('mud_clay', 'meat', meatFn), normalMap: tex('mud_clay_n', false), vertexColors: true, roughness: 0.32, metalness: 0.05 });
    this.chunkGeos = [0, 1, 2, 3].map(k => {
      const g = (k % 2 ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0));
      const p = g.attributes.position, col = [];
      const jit = new Map();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        if (!jit.has(key)) jit.set(key, 0.65 + Math.random() * 0.6);
        const j = jit.get(key);
        p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * 0.8, p.getZ(i) * j);
      }
      for (let i = 0; i < p.count; i += 3) {
        const skin = Math.random() < 0.25, bone = !skin && Math.random() < 0.05;
        const c = skin ? [0.75, 0.82, 0.7] : bone ? [1.5, 1.35, 1.15] : [1, 0.85 + Math.random() * 0.3, 0.85];
        for (let k = 0; k < 3; k++) col.push(...c);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    });
    this.chunks = [];
    this.emitters = [];
  }

  resize(h, fov) { this.uScale.value = h / (2 * Math.tan(fov * Math.PI / 360)); }

  spray(p, dir, count, speed = 3, spread = 0.5, size = 1) {
    for (let n = 0; n < count; n++) {
      const i = this.head; this.head = (this.head + 1) % N;
      const k = i * 3, sp = speed * (0.25 + Math.random() * 0.95);
      this.pos[k] = p.x + (Math.random() - 0.5) * 0.04; this.pos[k + 1] = p.y + (Math.random() - 0.5) * 0.04; this.pos[k + 2] = p.z + (Math.random() - 0.5) * 0.04;
      this.vel[k] = (dir.x + (Math.random() - 0.5) * 2 * spread) * sp;
      this.vel[k + 1] = (dir.y + (Math.random() - 0.3) * 2 * spread) * sp + Math.random() * 0.8;
      this.vel[k + 2] = (dir.z + (Math.random() - 0.5) * 2 * spread) * sp;
      this.size[i] = (0.007 + Math.random() * Math.random() * 0.026) * size;
      this.life[i] = 2.5;
    }
  }

  decal(x, z, s) {
    const i = this.dHead; this.dHead = (this.dHead + 1) % MAXDECAL;
    _q.setFromAxisAngle(_up, Math.random() * 6.28);
    _m.compose(_v.set(x, 0.006 + (i % 40) * 0.00015, z), _q, _s.set(s, 1, s * (0.7 + Math.random() * 0.6)));
    this.decals.setMatrixAt(i, _m);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  pool(x, z, r) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat);
    m.position.set(x, 0.005, z); m.rotation.y = Math.random() * 6;
    m.scale.setScalar(0.01);
    this.scene.add(m);
    this.pools.push({ m, r, t: 0 });
    if (this.pools.length > 30) { const o = this.pools.shift(); this.scene.remove(o.m); }
  }

  chunk(p, vel, size = 0.05) {
    const m = new THREE.Mesh(this.chunkGeos[Math.random() * 4 | 0], this.meat);
    m.position.copy(p); m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    m.castShadow = true;
    this.scene.add(m);
    this.chunks.push({ m, v: vel.clone().add(_v.set((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5)),
      w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18), rest: 0 });
    if (this.chunks.length > MAXCHUNK) { const o = this.chunks.shift(); this.scene.remove(o.m); }
  }

  // A stump that pumps blood for a while: src() returns { p, d } in world space, or null once it is gone.
  spurt(src, time = 3, rate = 160) { this.emitters.push({ src, t: time, T: time, rate, acc: 0 }); }

  burst(p, dir, power, chunks = 0) {
    this.spray(p, dir, 40 + power * 160, 2 + power * 3.5, 0.45, 1 + power * 0.4);
    for (let i = 0; i < chunks; i++) this.chunk(p, _v.copy(dir).multiplyScalar(1.5 + Math.random() * 2.5 * power), 0.025 + Math.random() * 0.035);
  }

  update(dt, t) {
    this.decalBudget = Math.min(this.decalBudget + dt * 90, 12);
    for (const e of this.emitters) {
      e.t -= dt;
      const s = e.src();
      if (!s) { e.t = 0; continue; }
      const pump = Math.max(0, Math.sin(t * 9 + e.T)) ** 2 * (e.t / e.T);
      e.acc += e.rate * pump * dt;
      const n = e.acc | 0; e.acc -= n;
      if (n) this.spray(s.p, s.d, n, 1.6 + pump * 2.4, 0.18, 0.8);
    }
    this.emitters = this.emitters.filter(e => e.t > 0);

    const P = this.pos, V = this.vel, drag = Math.exp(-dt * 0.6);
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      V[k + 1] -= 9.8 * dt;
      V[k] *= drag; V[k + 2] *= drag;
      P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
      if (P[k + 1] < 0.01 || this.life[i] <= 0) {
        if (P[k + 1] < 0.05 && this.decalBudget >= 1 && Math.random() < 0.35) {
          this.decalBudget--;
          this.decal(P[k], P[k + 2], 0.04 + this.size[i] * 3 + Math.random() * 0.08);
        }
        this.life[i] = 0; this.size[i] = 0; P[k + 1] = -100;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;

    for (const c of this.chunks) {
      if (c.rest > 1.5) continue;
      const m = c.m, r = m.scale.x * 0.7;
      c.v.y -= 9.8 * dt;
      m.position.addScaledVector(c.v, dt);
      m.rotation.x += c.w.x * dt; m.rotation.y += c.w.y * dt; m.rotation.z += c.w.z * dt;
      if (m.position.y < r) {
        m.position.y = r;
        if (c.v.y < -1.2) { this.spray(m.position, _v.set(0, 0.6, 0), 6, 1, 0.8, 0.7); if (this.decalBudget >= 1) { this.decalBudget--; this.decal(m.position.x, m.position.z, 0.12 + Math.random() * 0.12); } }
        c.v.y *= -0.22; c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.5);
      }
      if (c.v.lengthSq() < 0.02 && m.position.y <= r + 0.001) c.rest += dt; else c.rest = 0;
      if (c.v.y > 0 || m.position.y > r) this.drip(m.position, dt);
    }
    for (const o of this.pools) {
      if (o.t > 9) continue;
      o.t += dt;
      o.m.scale.setScalar(o.r * Math.min(1, Math.sqrt(o.t / 9)));
    }
  }

  drip(p, dt) {
    if (Math.random() < dt * 12) this.spray(p, _v.set(0, -0.2, 0), 1, 0.4, 0.4, 0.6);
  }

  clear() {
    this.life.fill(0); this.size.fill(0);
    for (const c of this.chunks) this.scene.remove(c.m);
    for (const o of this.pools) this.scene.remove(o.m);
    this.chunks = []; this.pools = []; this.emitters = [];
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAXDECAL; i++) this.decals.setMatrixAt(i, _m);
    this.decals.instanceMatrix.needsUpdate = true;
  }
}
