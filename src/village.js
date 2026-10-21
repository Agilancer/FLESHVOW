// The test village: four houses round a cobbled square with a well, dirt lanes, dead trees, a ring of black pines.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, mesh, at, scaleUV, rng } from './geo.js';
import { mat, tex } from './textures.js';
import { house, lantern, beamMat, iron, PW, SH } from './houses.js';

export const GROUND = 140;  // metres, square
export const BOUND = 42;    // the player stays inside this radius
export const FOG = new THREE.Color(0x1a1e2a);
export const MOON = new THREE.Vector3(-0.55, 0.62, -0.56).normalize();

const HOUSES = [
  { name: 'tavern', x: 0, z: -15.5, ry: 0.04, w: 5, d: 4, storeys: 2, walls: ['timber_plaster_b', 'timber_plaster_a'],
    gable: 'wood_planks_a', roof: 'shingles_wood', pitch: 1.05, door: 'tavern', doorX: -1.2, jetty: 0.35, posts: true, chimney: true, lit: 0.85 },
  { name: 'smithy', x: 16.5, z: 1, ry: -Math.PI / 2 - 0.07, w: 4, d: 4, storeys: 1, walls: ['fieldstone_a'],
    gable: 'wood_planks_b', roof: 'thatch', pitch: 1.2, door: 'iron_studded', chimney: true, lit: 0.5 },
  { name: 'cottage', x: 1.5, z: 16.5, ry: Math.PI + 0.06, w: 4, d: 3, storeys: 1, walls: ['brick_b'],
    roof: 'tiles_clay', pitch: 0.95, door: 'zbrace_ring', doorX: 0.9, lit: 0.6, shutter: 'planks_red' },
  { name: 'chapel', x: -16, z: -0.5, ry: Math.PI / 2 + 0.05, w: 3, d: 5, storeys: 1, walls: ['ashlar_b'],
    roof: 'slate', pitch: 1.6, door: 'gothic', lit: 0.3 },
];

export function buildVillage(scene) {
  const lights = [], colliders = [], updaters = [];
  scene.add(sky(), ground(), pines());

  for (const h of HOUSES) {
    const g = at(scene, house(h, lights), h.x, 0, h.z, h.ry);
    const f = g.userData.footprint;
    colliders.push({ x: h.x, z: h.z, rot: h.ry, hw: f.hw + 0.05, hd: f.hd + 0.05 });
  }

  const w = well(lights);
  scene.add(w);
  colliders.push({ x: 0, z: 0, r: 1.65 });

  for (const [x, z, a] of [[6.5, 6.8, 0.6], [-7.2, 6.1, -0.4], [7.4, -7.6, 2.4], [-6.4, -8, -2.2]]) {
    at(scene, post(lights), x, 0, z, a);
    colliders.push({ x, z, r: 0.3 });
  }

  const r = rng(7);
  for (const [x, z, s] of [[-24, 13, 1.1], [23, -14, 1.3], [-21, -19, 0.9], [27, 16, 1.2], [-31, -2, 1.4], [8, 30, 1], [-9, -31, 1.15], [33, -2, 0.95]]) {
    at(scene, deadTree(r, s), x, 0, z, r() * 6);
    colliders.push({ x, z, r: 0.45 * s });
  }

  // barrels and crates against the walls
  for (const [x, z, k] of [[5.2, -11.2, 'b'], [6.1, -10.7, 'b'], [-6.4, -11.1, 'c'], [12.6, 5.8, 'c'], [12.4, 6.9, 'b'],
                           [-12.2, 4.4, 'b'], [-3.5, 12.6, 'c'], [-4.4, 13.1, 'b']]) {
    const ry = r() * Math.PI;
    if (k === 'b') { at(scene, barrel(), x, 0, z, ry); colliders.push({ x, z, r: 0.48 }); }
    else { const s = 0.8 + r() * 0.25; at(scene, box(s, s, s, mat('planks_nailed'), 1), x, s / 2, z, ry); colliders.push({ x, z, rot: ry, hw: s / 2, hd: s / 2 }); }
  }

  scene.add(motes(updaters));
  return { lights, colliders, updaters };
}

function sky() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { moon: { value: MOON }, fogCol: { value: FOG } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 moon, fogCol;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(vec3(0.085, 0.09, 0.115), vec3(0.012, 0.014, 0.025), pow(h, 0.55));
        c = mix(fogCol, c, smoothstep(0.0, 0.35, vDir.y));  // melt into the fog at the horizon
        float m = max(dot(vDir, moon), 0.0);
        c += vec3(0.30, 0.33, 0.42) * pow(m, 60.0) + vec3(0.05, 0.055, 0.075) * pow(m, 6.0);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -2;
  g.add(dome);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xd9d4c4, fog: false }));
  moon.position.copy(MOON).multiplyScalar(400);
  moon.lookAt(0, 0, 0);
  g.add(moon);
  const r = rng(3), pos = [];
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3(r() * 2 - 1, r() * 0.9 + 0.2, r() * 2 - 1).normalize().multiplyScalar(420);
    pos.push(v.x, v.y, v.z);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x6d7488, size: 1, sizeAttenuation: false, fog: false })));
  return g;
}

// Splat map: r = dirt lanes, g = cobbles, b = second grass. Drawn on a canvas covering the whole ground.
function splat() {
  const S = 1024, c = document.createElement('canvas'), x = c.getContext('2d'), r = rng(11);
  c.width = c.height = S;
  const px = m => (m / GROUND + 0.5) * S;
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'lighter';
  x.filter = 'blur(14px)';
  for (let i = 0; i < 70; i++) {  // grass variation blobs
    x.fillStyle = `rgba(0,0,255,${0.25 + r() * 0.35})`;
    x.beginPath(); x.arc(r() * S, r() * S, 20 + r() * 70, 0, 7); x.fill();
  }
  x.filter = 'blur(5px)';
  x.lineCap = 'round';
  const lane = (pts, wm) => {
    x.strokeStyle = 'rgba(255,0,0,0.9)'; x.lineWidth = wm / GROUND * S;
    x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo : x.moveTo).call(x, px(a), px(b))); x.stroke();
  };
  lane([[-70, 3], [-35, 2], [-22, -1], [-8, 0]], 3.4);
  lane([[8, 1], [24, 1.5], [40, -3], [70, -6]], 3.4);
  lane([[0, -8], [-0.8, -11.5]], 3);
  lane([[0, 8], [0.5, 13]], 2.6);
  lane([[1, 9], [-6, 30], [-14, 70]], 2.4);
  for (let i = 0; i < 40; i++) {  // worn patches around the square
    const a = r() * 7, d = 8 + r() * 6;
    x.fillStyle = `rgba(255,0,0,${0.2 + r() * 0.3})`;
    x.beginPath(); x.arc(px(Math.cos(a) * d), px(Math.sin(a) * d), 8 + r() * 14, 0, 7); x.fill();
  }
  x.filter = 'blur(3px)';
  x.fillStyle = 'rgb(0,255,0)';
  x.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * Math.PI * 2, d = 9 + Math.sin(a * 3) * 0.6 + r() * 0.9;
    (i ? x.lineTo : x.moveTo).call(x, px(Math.cos(a) * d), px(Math.sin(a) * d));
  }
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;  // canvas row = +z
  return t;
}

function ground() {
  const g = new THREE.PlaneGeometry(GROUND, GROUND);
  g.rotateX(-Math.PI / 2);
  // PlaneGeometry uv.y runs -z..+z flipped; rebuild uvs from world xz so the splat canvas maps x->right, z->down
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / GROUND + 0.5, p.getZ(i) / GROUND + 0.5);
  const m = new THREE.MeshStandardMaterial({ map: tex('grass_wild'), roughness: 0.97 });
  const u = {
    uSize: { value: GROUND }, uSplat: { value: splat() },
    uGrass2: { value: tex('grass_dark') }, uDirt: { value: tex('dirt_tracks') }, uMud: { value: tex('mud_puddles') }, uCobble: { value: tex('cobble_mossy') },
  };
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, u);
    s.fragmentShader = s.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform float uSize; uniform sampler2D uSplat, uGrass2, uDirt, uMud, uCobble;')
      .replace('#include <map_fragment>', `
        vec2 wuv = vMapUv * uSize;
        vec4 sp = texture2D(uSplat, vMapUv);
        vec4 col = mix(texture2D(map, wuv / 2.6), texture2D(uGrass2, wuv / 3.4 + 0.37), smoothstep(0.25, 0.7, sp.b));
        vec4 dirt = mix(texture2D(uDirt, wuv / 3.2), texture2D(uMud, wuv / 2.9), smoothstep(0.55, 0.9, sp.b));
        col = mix(col, dirt, smoothstep(0.12, 0.6, sp.r));
        col = mix(col, texture2D(uCobble, wuv / 2.4), smoothstep(0.35, 0.65, sp.g));
        diffuseColor *= col;`);
  };
  const o = mesh(g, m);
  o.castShadow = false;
  return o;
}

function pines() {
  const r = rng(5), N = 220;
  const tiers = [[2.9, 4.2, 3.4], [2.4, 4, 5.6], [1.9, 3.6, 7.6], [1.3, 3.4, 9.5], [0.7, 2.6, 11.3]];  // radius, height, base y
  const geo = mergeGeometries([new THREE.CylinderGeometry(0.22, 0.35, 4, 5).translate(0, 2, 0),
    ...tiers.map(([rd, h, y], i) => new THREE.ConeGeometry(rd, h, 9, 1).rotateY(i).translate(0, y + h / 2, 0))]);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x0d1411, roughness: 1 }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, d = 47 + r() * 22, k = 0.8 + r() * 0.9;
    m.compose(v.set(Math.cos(a) * d, 0, Math.sin(a) * d), q.setFromAxisAngle(s.set(0, 1, 0), r() * 6), s.set(k, k * (0.9 + r() * 0.5), k));
    im.setMatrixAt(i, m);
  }
  return im;
}

function well(lights) {
  const g = new THREE.Group(), stone = mat('wall_fieldstone_b'), C = 2 * Math.PI * 1.35;
  at(g, mesh(scaleUV(new THREE.CylinderGeometry(1.35, 1.45, 0.95, 24, 1, true), C / PW, 0.95 / SH * 1.6), stone), 0, 0.475, 0);
  const inner = mesh(scaleUV(new THREE.CylinderGeometry(1.05, 1.05, 0.95, 24, 1, true), C / PW, 0.3), new THREE.MeshStandardMaterial({ map: tex('wall_fieldstone_a'), side: THREE.BackSide, color: 0x666666 }));
  at(g, inner, 0, 0.475, 0);
  const rim = mesh(new THREE.RingGeometry(1.0, 1.42, 24, 1), mat('slabs_slate'));
  rim.rotation.x = -Math.PI / 2;
  at(g, rim, 0, 0.96, 0);
  const water = mesh(new THREE.CircleGeometry(1.05, 24), new THREE.MeshStandardMaterial({ color: 0x050708, roughness: 0.08, metalness: 0.8 }), false);
  water.rotation.x = -Math.PI / 2;
  at(g, water, 0, 0.35, 0);
  const beam = beamMat();
  for (const s of [-1, 1]) at(g, box(0.22, 2.6, 0.22, beam, 1), s * 1.2, 1.3, 0);
  at(g, box(2.7, 0.18, 0.18, beam, 1), 0, 2.15, 0);
  const crank = at(g, mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.3, 10), beam), 0, 1.75, 0);
  crank.rotation.z = Math.PI / 2;
  at(g, box(0.03, 0.75, 0.03, iron), 0.1, 1.33, 0);
  at(g, barrel(0.28, 0.35), 0.1, 0.78, 0);
  const rm = mat('roof_shingles_wood', { ns: 1.5 });
  for (const s of [-1, 1]) {
    const slab = at(g, box(3.1, 0.12, 1.25, rm, 2.8), 0, 2.85, s * 0.48);
    slab.rotation.x = s * 0.72;
  }
  return g;
}

function post(lights) {
  const g = new THREE.Group(), beam = beamMat();
  at(g, box(0.22, 3.4, 0.22, beam, 1), 0, 1.7, 0);
  at(g, box(0.1, 0.1, 0.9, beam, 1), 0, 3.25, 0.4);
  at(g, box(0.03, 0.25, 0.03, iron), 0, 3.07, 0.78);
  at(g, lantern(lights, 20), 0, 2.72, 0.78);
  return g;
}

function barrel(rad = 0.45, hgt = 1.0) {
  const g = new THREE.Group(), pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(rad * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * hgt)); }
  pts.unshift(new THREE.Vector2(0, 0)); pts.push(new THREE.Vector2(0, hgt));
  at(g, mesh(scaleUV(new THREE.LatheGeometry(pts, 16), 2 * Math.PI * rad / 1.2, hgt / 1.6), mat('planks_stained')), 0, 0, 0);
  for (const t of [0.15, 0.85]) {
    const band = at(g, mesh(new THREE.TorusGeometry(rad * (0.86 + 0.14 * Math.sin(t * Math.PI)) + 0.01, 0.022, 4, 20), iron), 0, t * hgt, 0);
    band.rotation.x = Math.PI / 2;
  }
  return g;
}

// Gnarled bare tree: recursive tapering limbs, merged into one mesh.
function deadTree(r, scale) {
  const parts = [], m = new THREE.Matrix4();
  const limb = (mat4, len, rad, depth) => {
    const geo = scaleUV(new THREE.CylinderGeometry(rad * 0.62, rad, len, 7, 1, true), 2 * Math.PI * rad / 1.4, len / 1.8).translate(0, len / 2, 0);
    parts.push(geo.applyMatrix4(mat4));
    if (depth === 0) return;
    const kids = depth > 2 ? 2 + (r() * 2 | 0) : 2;
    for (let i = 0; i < kids; i++) {
      const k = new THREE.Matrix4().makeTranslation(0, len * (0.65 + r() * 0.35), 0)
        .multiply(new THREE.Matrix4().makeRotationY(r() * Math.PI * 2))
        .multiply(new THREE.Matrix4().makeRotationZ(0.35 + r() * 0.6));
      limb(mat4.clone().multiply(k), len * (0.58 + r() * 0.2), rad * 0.6, depth - 1);
    }
  };
  limb(m.makeScale(scale, scale, scale), 3.4, 0.42, 4);
  return mesh(mergeGeometries(parts), mat('planks_cracked', { color: 0x7a6e64, ns: 1.6 }));
}

// Drifting ash in the air around the player.
function motes(updaters) {
  const N = 700, R = 22, pos = new Float32Array(N * 3), r = rng(9);
  for (let i = 0; i < N; i++) pos.set([r.range(-R, R), r.range(0, 9), r.range(-R, R)], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc8bba6, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
  pts.frustumCulled = false;
  updaters.push((dt, t, cam) => {
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      pos[k] += Math.sin(t * 0.3 + i) * 0.12 * dt + 0.05 * dt;
      pos[k + 1] -= (0.12 + (i % 7) * 0.02) * dt;
      pos[k + 2] += Math.cos(t * 0.27 + i * 1.3) * 0.12 * dt;
      if (pos[k + 1] < 0) pos[k + 1] += 9;
      for (const [a, c] of [[k, cam.x], [k + 2, cam.z]]) {  // wrap round the camera
        if (pos[a] - c > R) pos[a] -= 2 * R; else if (pos[a] - c < -R) pos[a] += 2 * R;
      }
    }
    g.attributes.position.needsUpdate = true;
  });
  return pts;
}
