// Effects: Quake's square particles (blood, smoke, rocket trails, teleport fog), sprite explosions and flames,
// dynamic lights, the thunderbolt beam and bouncing gibs.
import * as THREE from 'three';
import { canvasTex, dlPos, dlCol, MAX_DL } from './gfx.js';
import { gibGeo, Mats } from './models.js';
import { entityMove } from './physics.js';

const MAXP = 6000;

export class FX {
  constructor(scene, level) {
    this.scene = scene; this.level = level;
    // particles
    const g = new THREE.BufferGeometry();
    this.pp = new Float32Array(MAXP * 3); this.pc = new Float32Array(MAXP * 3); this.ps = new Float32Array(MAXP);
    g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.pc, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.ps, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.pmat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 }, maxSize: { value: 6 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale, maxSize;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = clamp(size * scale / -mv.z, 1.5, maxSize); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.); }`,
    });
    this.points = new THREE.Points(g, this.pmat); this.points.frustumCulled = false;
    scene.add(this.points);
    this.P = [];   // live particles {x,y,z,vx,vy,vz,life,max,g,drag,c0,c1,size}
    this.sprites = []; this.dls = []; this.gibs = []; this.beams = [];
    this.makeExplosionFrames(); this.makeFlameFrames();
    this.flameMats = [0, 1, 2].map(k => { const m = new THREE.SpriteMaterial({ map: this.flameTex[k], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); m.userData.k = k; return m; });
    for (const f of level.flames || []) {
      const s = new THREE.Sprite(this.flameMats[(Math.random() * 3) | 0]); s.position.copy(f.p); s.scale.set(f.s * .7, f.s, 1); scene.add(s);
    }
    this.gibMats = new Mats();
    this.t = 0;
  }

  // ------------------------------------------------------------ particles
  add(x, y, z, vx, vy, vz, life, c0, c1 = c0, size = .06, grav = 0, drag = 0) {
    if (this.P.length >= MAXP) this.P.shift();
    this.P.push({ x, y, z, vx, vy, vz, life, max: life, c0, c1, size, g: grav, drag });
  }
  burst(p, n, col, spd = 2, life = .6, size = .05, grav = 6, col2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), s = spd * (.3 + Math.random() * .7);
      this.add(p.x, p.y, p.z, Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s, life * (.5 + Math.random() * .5), col, col2 || col, size, grav, 1);
    }
  }
  blood(p, n = 12, dir) {
    for (let i = 0; i < n; i++) {
      const v = dir ? dir.clone().multiplyScalar(1.5 + Math.random() * 2) : new THREE.Vector3();
      this.add(p.x, p.y, p.z, v.x + (Math.random() - .5) * 2.5, v.y + Math.random() * 2, v.z + (Math.random() - .5) * 2.5, .7 + Math.random() * .4, [.6, .02, .02], [.3, 0, 0], .07, 9);
    }
  }
  puff(p, n = 6) { this.burst(p, n, [.55, .5, .42], 1.2, .5, .04, 3, [.25, .22, .2]); }
  sparks(p, n = 8) { this.burst(p, n, [1, .9, .5], 4, .35, .035, 8, [1, .4, .1]); }
  trail(p, kind) {
    if (kind === 'rocket') {
      this.add(p.x, p.y, p.z, (Math.random() - .5) * .3, .3 + Math.random() * .3, (Math.random() - .5) * .3, .8, [.55, .52, .5], [.15, .14, .14], .1, -.2, 1);
      this.add(p.x, p.y, p.z, (Math.random() - .5) * .8, (Math.random() - .5) * .8, (Math.random() - .5) * .8, .25, [1, .85, .3], [1, .3, 0], .07, 0, 2);
    } else if (kind === 'grenade') this.add(p.x, p.y, p.z, 0, .3, 0, .6, [.5, .48, .45], [.2, .2, .2], .07, -.1, 1);
    else if (kind === 'blood') this.add(p.x, p.y, p.z, (Math.random() - .5) * .3, 0, (Math.random() - .5) * .3, .7, [.55, 0, 0], [.25, 0, 0], .06, 6);
    else if (kind === 'acid') this.add(p.x, p.y, p.z, (Math.random() - .5) * .4, (Math.random() - .5) * .4, (Math.random() - .5) * .4, .4, [.5, 1, .2], [.1, .3, 0], .06);
    else if (kind === 'fire') this.add(p.x, p.y, p.z, (Math.random() - .5) * .5, (Math.random() - .5) * .5, (Math.random() - .5) * .5, .35, [1, .8, .3], [.7, .1, 0], .08);
    else if (kind === 'laser') this.add(p.x, p.y, p.z, 0, 0, 0, .2, [1, .7, .2], [.6, .2, 0], .05);
  }
  teleportFog(p) {
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * 6.283, r = .2 + Math.random() * .7, y = Math.random() * 2;
      this.add(p.x + Math.cos(a) * r, p.y + y, p.z + Math.sin(a) * r, -Math.cos(a) * .6, (Math.random() - .3) * 1.5, -Math.sin(a) * .6, .6 + Math.random() * .7, [1, 1, .85], [.8, .6, .2], .05);
    }
    this.light(p.clone().setY(p.y + 1), [.8, .8, 1], 8, .5);
  }
  lavaSplash(p) { this.burst(p, 20, [1, .7, .2], 3, .8, .07, 9, [.6, .1, 0]); }

  // ------------------------------------------------------------ sprites
  makeExplosionFrames() {
    this.expTex = [];
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const k = f / 5;
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * 6.283, r = Math.random() * (10 + k * 18);
        const rr = (6 + Math.random() * 10) * (1 - k * .4);
        const heat = 1 - k - Math.random() * .3;
        const col = heat > .6 ? '#fff4a0' : heat > .35 ? '#ffb030' : heat > .1 ? '#e05010' : '#602010';
        x.fillStyle = col; x.globalAlpha = 1 - k * .5;
        x.beginPath(); x.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, rr, 0, 7); x.fill();
      }
      // posterise to chunky pixels
      const d = x.getImageData(0, 0, 64, 64), q = document.createElement('canvas'); q.width = q.height = 32;
      const qx = q.getContext('2d'); qx.imageSmoothingEnabled = false; qx.drawImage(c, 0, 0, 32, 32);
      this.expTex.push(canvasTex(q));
    }
  }
  makeFlameFrames() {
    this.flameTex = [];
    for (let f = 0; f < 3; f++) {
      const c = document.createElement('canvas'); c.width = 16; c.height = 24; const x = c.getContext('2d');
      for (let i = 0; i < 30; i++) {
        const y = 22 - Math.random() * 20, w = (22 - (22 - y)) / 22 * 5 + 1;
        x.fillStyle = y > 15 ? '#ffe080' : y > 9 ? '#ff9a20' : '#c03808';
        x.fillRect(8 + (Math.random() - .5) * w * 1.6 - 1, y, 2 + Math.random() * 2, 2 + Math.random() * 2);
      }
      this.flameTex.push(canvasTex(c));
    }
  }
  explosion(p, size = 2.2) {
    const m = new THREE.SpriteMaterial({ map: this.expTex[0], transparent: true, depthWrite: false });
    const s = new THREE.Sprite(m); s.position.copy(p); s.scale.set(size, size, 1); this.scene.add(s);
    this.sprites.push({ s, t: 0, kind: 'exp' });
    this.burst(p, 70, [1, .8, .3], 7, .7, .07, 4, [.6, .15, 0]);
    this.burst(p, 30, [.4, .38, .35], 3, 1.2, .1, -.5, [.15, .14, .13]);
    this.light(p, [1.2, .7, .3], 9, .5);
  }
  sprite(tex, p, size, life, add = true) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(m); s.position.copy(p); s.scale.set(size, size, 1); this.scene.add(s);
    this.sprites.push({ s, t: 0, life, kind: 'fade' });
    return s;
  }

  // ------------------------------------------------------------ dynamic lights
  light(p, col, r, life, decay = true) { const d = { p: p.clone(), col, r, life, max: life, decay }; this.dls.push(d); return d; }
  lightOn(p, col, r) { const d = { p, col, r, life: 1e9, max: 1e9, decay: false, follow: true }; this.dls.push(d); return d; }

  dynamicAt(x, y, z) {
    let r = 0, g = 0, b = 0;
    for (const d of this.dls) {
      const dist = Math.hypot(d.p.x - x, d.p.y - y, d.p.z - z); if (dist >= d.r) continue;
      const k = (1 - dist / d.r) * (d.decay ? d.life / d.max : 1);
      r += d.col[0] * k; g += d.col[1] * k; b += d.col[2] * k;
    }
    return [r * .5, g * .5, b * .5];
  }

  // ------------------------------------------------------------ beams (thunderbolt, shambler lightning)
  beam(a, b, col = 0xbfd8ff, w = .09) {
    const segs = Math.max(2, Math.ceil(a.distanceTo(b) / .7));
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      if (i && i < segs) p.add(new THREE.Vector3((Math.random() - .5) * .35, (Math.random() - .5) * .35, (Math.random() - .5) * .35));
      pts.push(p);
    }
    const g = new THREE.BufferGeometry(), pos = [];
    for (let i = 0; i < segs; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      for (const [ox, oy] of [[w, 0], [0, w]]) {
        pos.push(p0.x - ox, p0.y - oy, p0.z, p1.x - ox, p1.y - oy, p1.z, p1.x + ox, p1.y + oy, p1.z,
                 p0.x - ox, p0.y - oy, p0.z, p1.x + ox, p1.y + oy, p1.z, p0.x + ox, p0.y + oy, p0.z);
        pos.push(p0.x, p0.y - oy, p0.z - ox, p1.x, p1.y - oy, p1.z - ox, p1.x, p1.y + oy, p1.z + ox,
                 p0.x, p0.y - oy, p0.z - ox, p1.x, p1.y + oy, p1.z + ox, p0.x, p0.y + oy, p0.z + ox);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(m); this.beams.push({ m, life: .1 });
    this.light(b, [.5, .6, 1], 5, .1);
  }

  // ------------------------------------------------------------ gibs
  gib(p, vel, skin = 'skin_flesh', head = null) {
    const mesh = head || new THREE.Mesh(gibGeo((Math.random() * 9) | 0), this.gibMats.get(skin));
    mesh.position.copy(p); this.scene.add(mesh);
    const e = { pos: p.clone(), vel: vel.clone(), r: .08, h: .14, mesh, life: 25, spin: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5), onGround: false, isHead: !!head };
    this.gibs.push(e);
    return e;
  }
  gibBurst(p, n, skin, vel, head) {
    for (let i = 0; i < n; i++) this.gib(p.clone().add(new THREE.Vector3((Math.random() - .5) * .5, Math.random() * .8, (Math.random() - .5) * .5)),
      new THREE.Vector3((Math.random() - .5) * 8, 3 + Math.random() * 6, (Math.random() - .5) * 8).add(vel || new THREE.Vector3()), i % 3 ? 'skin_flesh' : skin);
    if (head) this.gib(p.clone().add(new THREE.Vector3(0, .8, 0)), new THREE.Vector3((Math.random() - .5) * 4, 5, (Math.random() - .5) * 4), skin, head);
    this.blood(p.clone().add(new THREE.Vector3(0, .8, 0)), 50);
  }

  // ------------------------------------------------------------ update
  update(dt, camera, game) {
    this.t += dt;
    // particles
    const P = this.P;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt; if (p.life <= 0) continue;
      p.vy -= p.g * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.g > 0) { const c = this.level.at(p.x, p.z); if (c && !c.solid && p.y < c.f) { p.y = c.f; p.vx = p.vy = p.vz = 0; p.g = 0; } }
      const k = 1 - p.life / p.max;
      this.pp[n * 3] = p.x; this.pp[n * 3 + 1] = p.y; this.pp[n * 3 + 2] = p.z;
      this.pc[n * 3] = p.c0[0] + (p.c1[0] - p.c0[0]) * k; this.pc[n * 3 + 1] = p.c0[1] + (p.c1[1] - p.c0[1]) * k; this.pc[n * 3 + 2] = p.c0[2] + (p.c1[2] - p.c0[2]) * k;
      this.ps[n] = p.size;
      P[n++] = p;
    }
    P.length = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
    this.pmat.uniforms.scale.value = game.renderH / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.pmat.uniforms.maxSize.value = Math.max(3, game.renderH / 90);

    // sprites
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i]; s.t += dt;
      if (s.kind === 'exp') {
        const f = Math.floor(s.t / .07);
        if (f >= 6) { this.scene.remove(s.s); s.s.material.dispose(); this.sprites.splice(i, 1); continue; }
        s.s.material.map = this.expTex[f];
      } else if (s.t >= s.life) { this.scene.remove(s.s); s.s.material.dispose(); this.sprites.splice(i, 1); continue; }
      else s.s.material.opacity = 1 - s.t / s.life;
    }
    const fi = Math.floor(this.t * 10);
    for (const m of this.flameMats) m.map = this.flameTex[(fi + m.userData.k) % 3];

    // beams live one frame or so
    for (let i = this.beams.length - 1; i >= 0; i--) { const b = this.beams[i]; if ((b.life -= dt) <= 0) { this.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); this.beams.splice(i, 1); } }

    // gibs
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const e = this.gibs[i];
      e.life -= dt;
      if (e.life <= 0) { this.scene.remove(e.mesh); this.gibs.splice(i, 1); continue; }
      if (!e.rest) {
        const vy = e.vel.y;
        const res = entityMove(this.level, e, dt);
        if (res.blockedH) { e.vel.x *= -.4; e.vel.z *= -.4; }
        if (e.onGround) {
          if (vy < -3) { e.vel.y = -vy * .3; e.onGround = false; game.sound('splat', e.pos, { vol: .4, range: 15 }); }
          e.vel.x *= .8; e.vel.z *= .8;
          if (Math.hypot(e.vel.x, e.vel.z) < .1 && Math.abs(e.vel.y) < .5) e.rest = true;
        }
        if (Math.random() < .5) this.trail(e.pos, 'blood');
        e.mesh.rotation.x += e.spin.x * dt; e.mesh.rotation.y += e.spin.y * dt; e.mesh.rotation.z += e.spin.z * dt;
      }
      if (e.life < 2) e.pos.y -= dt * .1;
      e.mesh.position.copy(e.pos).y += e.isHead ? 0 : .06;
      const l = this.level.modelLight(e.pos.x, e.pos.y, e.pos.z);
      e.mesh.traverse(o => { if (o.material && !o.material.userData.glow && o.material.color) o.material.color.setRGB(l[0] * 2, l[1] * 2, l[2] * 2); });
    }

    // dynamic lights -> shader uniforms (closest to the camera first)
    for (let i = this.dls.length - 1; i >= 0; i--) { const d = this.dls[i]; if (d.decay && (d.life -= dt) <= 0) this.dls.splice(i, 1); }
    const cp = camera.position;
    const sorted = this.dls.slice().sort((a, b) => a.p.distanceToSquared(cp) - b.p.distanceToSquared(cp));
    for (let i = 0; i < MAX_DL; i++) {
      const d = sorted[i];
      if (d) {
        const k = d.decay ? d.life / d.max : 1;
        dlPos.value[i].set(d.p.x, d.p.y, d.p.z, d.r);
        dlCol.value[i].set(d.col[0] * k * .5, d.col[1] * k * .5, d.col[2] * k * .5);
      } else { dlPos.value[i].set(0, -999, 0, .001); dlCol.value[i].set(0, 0, 0); }
    }
  }

  dispose() {
    this.scene.remove(this.points);
    for (const s of this.sprites) this.scene.remove(s.s);
    for (const g of this.gibs) this.scene.remove(g.mesh);
  }
}
