// Items: stats, the Vowbreaker longsword and the Hollow Vigil tower shield (built from palette-swapped textures),
// inventory icons rendered from the models, and pickups lying in the world.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { swapTex, swapMat } from './textures.js';

export const RARITY = { unique: '#c9a254', rare: '#e8d36a', magic: '#7d93ff', common: '#d8d2c4' };

export const ITEMS = {
  vowbreaker: {
    id: 'vowbreaker', name: 'Vowbreaker', base: 'Gravewrought Longsword', slot: 'right', rarity: 'unique', model: 'sword',
    dmg: [18, 27], sever: 1.25, undead: 1.35, leech: 0.03,
    stats: ['One-Hand Damage: 18 to 27', 'Attack Speed: Fast', 'Durability: 64 of 64', 'Required Strength: 22'],
    mods: ['+35% Damage to Undead', 'Severs limbs 25% more easily', '3% Life stolen per hit', 'Hold to charge: heavy blows cost 10 Mana'],
    flavor: 'Forged to break the vow that binds the dead to the soil. The runes drink what the edge spills.',
  },
  hollowvigil: {
    id: 'hollowvigil', name: 'The Hollow Vigil', base: 'Iron-Bound Tower Shield', slot: 'left', rarity: 'unique', model: 'shield',
    life: 15, stagger: true,
    stats: ['Defense: 64', 'Blocks every frontal blow while raised', 'Durability: 90 of 90', 'Required Strength: 34'],
    mods: ['+15 to Life', 'Attackers stagger when blocked', 'You see through the Watcher\'s eyes'],
    flavor: 'Its last bearer held the gate for nine nights. On the tenth it stood there without him.',
  },
};

const steelFn = (r, g, b, l) => [62 + l * 150, 64 + l * 152, 70 + l * 160];
const ironFn = (r, g, b, l) => [14 + l * 92, 13 + l * 88, 15 + l * 92];
const leatherFn = (r, g, b, l) => [26 + l * 86, 13 + l * 46, 9 + l * 28];
const oakFn = (r, g, b, l) => [20 + l * 96, 12 + l * 60, 9 + l * 44];

function runeTex() {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = 64; c.height = 512;
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 512);
  x.strokeStyle = '#fff'; x.lineWidth = 2.2; x.lineCap = 'round'; x.shadowColor = '#fff'; x.shadowBlur = 3;
  let s = 3;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 13; i++) {  // a column of runes in the fuller, from the guard up
    const cy = 512 - (36 + i * 26), cx = 32;
    x.beginPath(); x.moveTo(cx, cy + 9); x.lineTo(cx, cy - 9);
    for (let k = 0; k < 2 + (r() * 2 | 0); k++) {
      const y0 = cy - 8 + r() * 16, sd = r() < 0.5 ? -1 : 1;
      x.moveTo(cx, y0); x.lineTo(cx + sd * (3 + r() * 3), y0 + (r() - 0.5) * 10);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Double-edged blade with a fuller, built from stations along +Y; u runs across the face so the runes sit in the fuller.
function bladeGeo(L) {
  const N = 48, pos = [], uv = [], idx = [], us = [0, 0.42, 0.5, 0.58, 1];
  const wf = v => v < 0.8 ? 0.027 * (1 - 0.22 * v) + 0.003 * Math.sin(v * 9) * (1 - v) : 0.027 * 0.824 * Math.pow((1 - v) / 0.2, 0.75);
  const tf = v => (v < 0.8 ? 0.0062 * (1 - 0.3 * v) : 0.0062 * 0.76 * (1 - v) / 0.2);
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const v = i / N, w = wf(v), t = tf(v) * side;
      const ring = [[w, 0], [w * 0.45, t], [0, t * 0.4], [-w * 0.45, t], [-w, 0]];
      ring.forEach(([x, z], j) => { pos.push(x, v * L, z); uv.push(us[j], v); });
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < 4; j++) {
      const a = base + i * 5 + j, b = a + 5;
      if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const part = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };

// Origin at the centre of the grip, blade up +Y, edges along X.
export function buildSword(env) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ map: swapTex('stone_light', 'steel', steelFn), color: 0xc4c8d0, metalness: 1, roughness: 0.32,
    envMap: env, envMapIntensity: 1.5, flatShading: true, emissiveMap: runeTex(), emissive: 0xff2412, emissiveIntensity: 1.6 });
  const iron = swapMat('slabs_slate', 'iron', ironFn, { metal: 0.85, rough: 0.42, env, envI: 1.3 });
  const leather = swapMat('planks_dark', 'leather', leatherFn, { rough: 0.8 });
  const gem = new THREE.MeshStandardMaterial({ color: 0x2a0303, emissive: 0xff160a, emissiveIntensity: 2.6, roughness: 0.15, envMap: env, flatShading: true });
  g.add(part(bladeGeo(0.84), steel, 0, 0.13, 0));
  g.add(part(new THREE.BoxGeometry(0.062, 0.034, 0.016), iron, 0, 0.135, 0));  // ricasso plate
  g.add(part(new THREE.BoxGeometry(0.078, 0.042, 0.04), iron, 0, 0.11, 0));
  for (const s of [-1, 1]) {
    const dir = new THREE.Vector2(s * Math.cos(0.32), Math.sin(0.32)), st = new THREE.Vector2(s * 0.036, 0.11);
    const q = part(new THREE.CylinderGeometry(0.0065, 0.013, 0.14, 6), iron, st.x + dir.x * 0.07, st.y + dir.y * 0.07, 0);
    q.rotation.z = -s * (Math.PI / 2 - 0.32);
    const sp = part(new THREE.ConeGeometry(0.011, 0.045, 6), iron, st.x + dir.x * 0.155, st.y + dir.y * 0.155, 0);
    sp.rotation.z = q.rotation.z;
    const fang = part(new THREE.ConeGeometry(0.008, 0.04, 5), iron, s * 0.03, 0.074, 0);
    fang.rotation.z = Math.PI - s * 0.25;
    const gm = part(new THREE.OctahedronGeometry(0.017), gem, 0, 0.112, s * 0.021);
    gm.scale.set(1, 1.25, 0.45);
    g.add(q, sp, fang, gm);
  }
  g.add(part(new THREE.CylinderGeometry(0.0158, 0.0175, 0.19, 10), leather, 0, -0.005, 0));
  for (let i = 0; i < 8; i++) {
    const w = part(new THREE.TorusGeometry(0.0172, 0.0032, 4, 14), leather, 0, -0.088 + i * 0.024, 0);
    w.rotation.set(Math.PI / 2 + 0.25, 0, 0);
    g.add(w);
  }
  const pm = part(new THREE.DodecahedronGeometry(0.03), iron, 0, -0.125, 0);
  pm.scale.set(1, 1.25, 0.8);
  const ps = part(new THREE.ConeGeometry(0.012, 0.04, 6), iron, 0, -0.175, 0);
  ps.rotation.z = Math.PI;
  g.add(pm, ps, part(new THREE.OctahedronGeometry(0.012), gem, 0, -0.125, 0.022));
  const base = new THREE.Object3D(), tip = new THREE.Object3D();
  base.position.y = 0.16; tip.position.y = 0.97;
  g.add(base, tip);
  g.userData = { base, tip, steel };
  return g;
}

// ---- tower shield: front +Z, eye slits at y = SLIT, origin at the arm strap
export const SLIT = 0.42;
const SW = 0.4, TOP = 0.68, SHO = 0.53, BOT = -0.86, BEND = 0.55;

function outline() {
  const half = [];
  for (let i = 0; i <= 12; i++) { const a = i / 12; half.push([SW * a, SHO + (TOP - SHO) * Math.cos(a * Math.PI / 2)]); }
  half.push([SW * 0.98, 0], [SW * 0.96, -0.3]);
  for (let i = 1; i <= 14; i++) {  // curved flank down to the point
    const t = i / 14, u = 1 - t;
    half.push([u * u * SW * 0.96 + 2 * u * t * SW * 0.92, u * u * -0.3 + 2 * u * t * -0.7 + t * t * BOT]);
  }
  half[half.length - 1][0] = 0;
  const left = half.slice(1, -1).reverse().map(([x, y]) => [-x, y]);
  return half.concat(left);  // clockwise
}

function inset(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let nx = (b[1] - a[1]), ny = -(b[0] - a[0]);  // right-hand normal = inward for clockwise
    const l = Math.hypot(nx, ny) || 1;
    return [p[0] + nx / l * d, p[1] + ny / l * d];
  });
}

const shapeOf = pts => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
const pathOf = pts => new THREE.Path(pts.map(([x, y]) => new THREE.Vector2(x, y)));

function slit(cx, s, grow = 0) {  // almond eye slit, tilted down toward the nose
  const pts = [], hl = 0.076 + grow, hh = 0.027 + grow;
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2, x = Math.cos(a) * hl, y = Math.sign(Math.sin(a)) * hh * Math.pow(Math.abs(Math.sin(a)), 1.5);
    const tilt = s * 0.13;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), SLIT + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return pts.reverse();
}

function bend(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - BEND * p.getX(i) ** 2);
  g.computeVertexNormals();
  return g;
}

function worldUV(g, s) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / s + 0.5, p.getY(i) / s);
  return g;
}

function emblemTex(back) {
  const S = 256, c = document.createElement('canvas'), x = c.getContext('2d');
  c.width = c.height = S;
  let s = back ? 7 : 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  x.translate(S / 2, S / 2);
  if (back) {  // nine nights, scratched into the back
    x.strokeStyle = 'rgba(205,190,165,0.75)'; x.lineWidth = 2.4;
    for (let i = 0; i < 9; i++) {
      const bx = -70 + i * 13 + (i > 4 ? 12 : 0);
      x.beginPath(); x.moveTo(bx + (r() - 0.5) * 4, -40); x.lineTo(bx + (r() - 0.5) * 6, 40); x.stroke();
    }
    x.beginPath(); x.moveTo(-74, 30); x.lineTo(-6, -30); x.stroke();
  } else {
    x.fillStyle = '#7a0b07'; x.strokeStyle = '#7a0b07';
    for (let i = 0; i < 14; i++) {  // thorns radiating from the eye
      const a = i / 14 * Math.PI * 2 + 0.11, l = 92 + r() * 22, w = 0.07;
      x.beginPath(); x.moveTo(Math.cos(a - w) * 50, Math.sin(a - w) * 50); x.lineTo(Math.cos(a) * l, Math.sin(a) * l);
      x.lineTo(Math.cos(a + w) * 50, Math.sin(a + w) * 50); x.fill();
    }
    x.lineWidth = 9; x.beginPath(); x.arc(0, 0, 56, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(-84, 0); x.quadraticCurveTo(0, -62, 84, 0); x.quadraticCurveTo(0, 62, -84, 0); x.fill();
    x.fillStyle = '#1a0202'; x.beginPath(); x.arc(0, 0, 24, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#7a0b07';
    for (let i = 0; i < 5; i++) {  // drips
      const dx = -40 + r() * 80, dl = 30 + r() * 60;
      x.fillRect(dx, 30, 5 + r() * 3, dl); x.beginPath(); x.arc(dx + 3, 30 + dl, 5, 0, 7); x.fill();
    }
    x.globalCompositeOperation = 'destination-out';  // wear the paint
    for (let i = 0; i < 900; i++) { x.globalAlpha = r() * 0.7; x.fillRect(-128 + r() * S, -128 + r() * S, 1 + r() * 4, 1 + r() * 2); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildShield(env) {
  const g = new THREE.Group(), O = outline();
  const oak = swapMat('planks_dark', 'blackoak', oakFn, { rough: 0.85, ns: 0.9 });
  const iron = swapMat('slabs_slate', 'iron', ironFn, { metal: 0.85, rough: 0.48, env, envI: 1.2 });
  const leather = swapMat('planks_dark', 'leather', leatherFn, { rough: 0.8 });
  const eyes = [slit(-0.088, -1), slit(0.088, 1)];
  // wooden core with the slits cut through
  const core = shapeOf(O);
  eyes.forEach(e => core.holes.push(pathOf(e)));
  const cg = new THREE.ExtrudeGeometry(core, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
  cg.translate(0, 0, -0.02);
  g.add(new THREE.Mesh(bend(worldUV(cg, 0.55)), [oak, iron]));
  // iron rim through both faces
  const rim = shapeOf(O);
  rim.holes.push(pathOf(inset(O, 0.045).reverse()));
  const rg = new THREE.ExtrudeGeometry(rim, { depth: 0.085, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2 });
  rg.translate(0, 0, -0.0425);
  g.add(new THREE.Mesh(bend(worldUV(rg, 0.4)), iron));
  // visor brow plate, front and back, with a nose guard
  const sideX = y => SW + (SW * 0.96 - SW) * (SHO - y) / (SHO + 0.3) - 0.03;
  const plate = [[-sideX(0.27), 0.27]];
  for (let i = 0; i <= 12; i++) { const a = i / 12, x = -(SW - 0.03) + 2 * (SW - 0.03) * a; plate.push([x, SHO - 0.03 + (TOP - SHO) * Math.sin(Math.PI * a)]); }
  plate.push([sideX(0.27), 0.27], [0.1, 0.27], [0.04, 0.2], [0, 0.14], [-0.04, 0.2], [-0.1, 0.27]);
  for (const z of [1, -1]) {
    const ps = shapeOf(plate.slice().reverse());
    eyes.forEach((e, i) => ps.holes.push(pathOf(slit(i ? 0.088 : -0.088, i ? 1 : -1, 0.004))));
    const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 1 });
    pg.translate(0, 0, z > 0 ? 0.027 : -0.043);
    g.add(new THREE.Mesh(bend(worldUV(pg, 0.4)), iron));
  }
  // band, boss and studs
  const by = -0.5, bw = 2 * (sideX(by) - 0.02);
  g.add(new THREE.Mesh(bend(new THREE.BoxGeometry(bw, 0.05, 0.014, 24, 1, 1).translate(0, by, 0.033)), iron));
  const studs = [], dome = () => new THREE.SphereGeometry(0.011, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  for (let x = -bw / 2 + 0.04; x < bw / 2 - 0.02; x += 0.085) studs.push(dome().translate(x, by, 0.04));
  const ring = inset(O, 0.0225);
  let acc = 0;
  ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; acc += Math.hypot(q[0] - p[0], q[1] - p[1]); if (acc > 0.085) { acc = 0; studs.push(dome().translate(p[0], p[1], 0.05)); } });
  for (const x of [-0.25, -0.12, 0.12, 0.25]) studs.push(dome().translate(x, 0.24, 0.04));
  g.add(new THREE.Mesh(bend(mergeGeometries(studs)), iron));
  const boss = new THREE.Mesh(bend(mergeGeometries([new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, -0.12, 0.02),
    new THREE.ConeGeometry(0.02, 0.07, 8).rotateX(Math.PI / 2).translate(0, -0.12, 0.09)])), iron);
  g.add(boss);
  // painted eye on the front, tallies on the back
  for (const back of [false, true]) {
    const dg = new THREE.PlaneGeometry(back ? 0.42 : 0.66, back ? 0.42 : 0.66, 16, 1);
    if (back) dg.rotateY(Math.PI);
    dg.translate(0, back ? -0.45 : -0.12, back ? -0.0285 : 0.0285);
    g.add(new THREE.Mesh(bend(dg), new THREE.MeshStandardMaterial({ map: emblemTex(back), transparent: true, roughness: 0.7, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2 })));
  }
  // straps and grip on the back
  for (const [y, w] of [[0.05, 0.34], [-0.24, 0.3]]) g.add(new THREE.Mesh(bend(new THREE.BoxGeometry(w, 0.05, 0.012, 12, 1, 1).translate(0, y, -0.036)), leather));
  g.add(new THREE.Mesh(bend(new THREE.CylinderGeometry(0.017, 0.017, 0.15, 8).translate(0.13, -0.2, -0.06)), leather));
  for (const y of [-0.12, -0.28]) g.add(new THREE.Mesh(bend(new THREE.BoxGeometry(0.03, 0.025, 0.05).translate(0.13, y, -0.045)), iron));
  g.userData = { slit: SLIT };
  return g;
}

export function buildModel(item, env) {
  return item.model === 'sword' ? buildSword(env) : buildShield(env);
}

// ---- icons: render the model into a small transparent render target, once
const icons = new Map();
export function iconFor(item, renderer, env) {
  if (icons.has(item.id)) return icons.get(item.id);
  const S = 192, rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(), m = buildModel(item, env);
  sc.add(new THREE.HemisphereLight(0xc8d0e8, 0x403020, 1.6));
  const key = new THREE.DirectionalLight(0xffe2c0, 3.2); key.position.set(-1, 2, 3);
  const rim = new THREE.DirectionalLight(0xff5030, 2.5); rim.position.set(2, -1, -2);
  sc.add(key, rim, m);
  if (item.model === 'sword') m.rotation.set(0.2, 0.5, -0.75);
  else m.rotation.set(0.05, -0.35, 0);
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const h = Math.max(sz.x, sz.y) * 0.56, cam = new THREE.OrthographicCamera(-h, h, h, -h, 0.01, 20);
  cam.position.set(c.x, c.y, c.z + 5); cam.lookAt(c);
  const oldClear = renderer.getClearAlpha(), oldTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
  const px = new Uint8Array(S * S * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
  renderer.setRenderTarget(oldTarget); renderer.setClearAlpha(oldClear);
  rt.dispose();
  const cv = document.createElement('canvas'), x = cv.getContext('2d'), img = x.createImageData(S, S);
  cv.width = cv.height = S;
  for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
  x.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  icons.set(item.id, url);
  return url;
}

// ---- pickups lying in the world
export function placePickups(scene, env) {
  const list = [];
  const sword = buildSword(env);  // driven point-first into the earth by the well
  sword.position.set(2.4, 0.73, 4.2);
  sword.rotation.set(Math.PI + 0.16, 0.6, 0.12);
  const shield = buildShield(env);  // leaning on the well, eye to the square
  shield.position.set(0.35, 0.84, 1.66);
  shield.rotation.set(-0.36, 0.08, 0.04);
  for (const [o, item, glow] of [[sword, ITEMS.vowbreaker, 0xff3a20], [shield, ITEMS.hollowvigil, 0x9fb4ff]]) {
    o.traverse(m => { if (m.isMesh) m.castShadow = true; });
    scene.add(o);
    const light = new THREE.PointLight(glow, 3, 4, 2);
    light.position.copy(o.position).add(new THREE.Vector3(0, 0.6, 0.4));
    scene.add(light);
    list.push({ item, obj: o, light, pos: o.position.clone().setY(0.6) });
  }
  return list;
}
