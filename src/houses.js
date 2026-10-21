// Houses: storeys of textured wall panels, gables, a pitched roof, a door with frame and step, windows, a lantern.
import * as THREE from 'three';
import { box, mesh, at } from './geo.js';
import { mat, doorMat } from './textures.js';

export const SH = 3.2;              // storey height = one wall panel
export const PW = SH * 256 / 416;   // wall panel width (texture aspect)
const T = 0.3;                      // wall thickness

export const beamMat = () => mat('planks_dark', { color: 0x8c7c6c });
export const iron = new THREE.MeshStandardMaterial({ color: 0x201d1a, roughness: 0.5, metalness: 0.75 });
const glows = [0xff8a3a, 0xffa04a, 0xff7a30].map(c =>
  new THREE.MeshStandardMaterial({ color: 0x140a04, emissive: c, emissiveIntensity: 2.4, roughness: 0.4 }));
const darkGlass = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.25, metalness: 0.3 });

// Hanging lantern with a flickering point light; lights collects { light, base } for main.js.
export function lantern(lights, power = 16) {
  const g = new THREE.Group();
  at(g, box(0.3, 0.05, 0.3, iron), 0, -0.2, 0);
  const cap = at(g, mesh(new THREE.ConeGeometry(0.25, 0.22, 4), iron), 0, 0.31, 0);
  cap.rotation.y = Math.PI / 4;
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) at(g, box(0.03, 0.4, 0.03, iron), x * 0.13, 0, z * 0.13);
  const flame = new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: 0xffa14e, emissiveIntensity: 5 });
  at(g, mesh(new THREE.BoxGeometry(0.17, 0.28, 0.17), flame, false), 0, 0, 0);
  const light = at(g, new THREE.PointLight(0xff9548, power, 20, 1.8), 0, 0, 0);
  lights.push({ light, base: power, flame, seed: Math.random() * 100 });
  return g;
}

function win(lit, beam, shutter) {
  const g = new THREE.Group(), w = 0.9, h = 1.1;
  at(g, mesh(new THREE.PlaneGeometry(w, h), lit ? glows[Math.random() * 3 | 0] : darkGlass, false), 0, 0, 0.01);
  for (const s of [-1, 1]) {
    at(g, box(w + 0.24, 0.12, 0.14, beam, 1), 0, s * (h / 2 + 0.06), 0.05);
    at(g, box(0.12, h, 0.14, beam, 1), s * (w / 2 + 0.06), 0, 0.05);
    const sh = at(g, box(w / 2, h + 0.1, 0.06, shutter, 1, 1.2), s * (w * 0.75 + 0.14), 0, 0.06);
    sh.rotation.y = s * 0.35;
  }
  at(g, box(0.06, h, 0.06, beam, 1), 0, 0, 0.04);
  at(g, box(w, 0.06, 0.06, beam, 1), 0, 0, 0.04);
  at(g, box(w + 0.4, 0.1, 0.3, beam, 1), 0, -h / 2 - 0.1, 0.12);
  return g;
}

function gable(D, rise, m) {  // triangle in the YZ plane facing -x
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -D / 2, 0, 0, D / 2, 0, rise, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([-D / 2 / PW, 0, D / 2 / PW, 0, 0, rise / SH], 2));
  g.computeVertexNormals();
  return mesh(g, m);
}

// o: { w, d (panels), storeys, walls[], gable, roof, pitch, door, doorX, jetty, posts, chimney, lit, shutter }
export function house(o, lights) {
  const g = new THREE.Group(), beam = beamMat(), shutter = mat(o.shutter ?? 'planks_weathered');
  const w0 = o.w * PW, d0 = o.d * PW, lit = o.lit ?? 0.6;
  let W = w0, D = d0;
  for (let s = 0; s < o.storeys; s++) {
    if (s && o.jetty) {  // upper storeys overhang the street, on a beam floor
      W += o.jetty * 2; D += o.jetty * 2;
      at(g, box(W + 0.1, 0.3, D + 0.1, beam, 1.5), 0, s * SH - 0.15, 0);
    }
    const m = mat('wall_' + o.walls[s % o.walls.length]), y = s * SH + SH / 2;
    for (const z of [-1, 1]) at(g, box(W, SH, T, m, PW, SH), 0, y, z * (D / 2 - T / 2));
    for (const x of [-1, 1]) at(g, box(T, SH, D - 2 * T, m, PW, SH), x * (W / 2 - T / 2), y, 0);
    if (o.posts) for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
      at(g, box(0.36, SH, 0.36, beam, 1, SH), x * (W / 2 - 0.1), y, z * (D / 2 - 0.1));
    // windows: front (around the door on the ground floor), sides, back
    const fy = s * SH + 1.75, xs = [];
    const n = Math.max(1, Math.floor(W / 3));
    for (let i = 0; i < n; i++) xs.push(-W / 2 + W * (i + 0.5) / n);
    for (const x of xs) {
      if (!s && Math.abs(x - (o.doorX ?? 0)) < 1.6) continue;
      at(g, win(Math.random() < lit, beam, shutter), x, fy, D / 2);
    }
    for (const sx of [-1, 1]) at(g, win(Math.random() < lit, beam, shutter), sx * W / 2, fy, 0, sx * Math.PI / 2);
    at(g, win(Math.random() < lit * 0.5, beam, shutter), xs[0] ?? 0, fy, -D / 2, Math.PI);
  }
  // roof: two slabs hinged at the ridge, image top at the ridge so the courses overlap downhill
  const H = o.storeys * SH, rise = (o.pitch ?? 0.9) * D / 2, a = Math.atan2(rise, D / 2);
  const oh = 0.55, L = (D / 2 + oh) / Math.cos(a), RW = W + oh * 2, rm = mat('roof_' + o.roof, { ns: 1.5 });
  for (const side of [0, Math.PI]) {
    const piv = at(g, new THREE.Group(), 0, H + rise, 0, side);
    const slab = box(RW, 0.22, L, rm, 2.8, 2.8);
    slab.rotation.x = a;
    slab.position.set(0, -L / 2 * Math.sin(a) + 0.11 * Math.cos(a), L / 2 * Math.cos(a) + 0.11 * Math.sin(a));
    piv.add(slab);
  }
  at(g, box(RW + 0.1, 0.26, 0.34, beam, 1.5), 0, H + rise + 0.2, 0);
  const gm = mat('wall_' + (o.gable ?? o.walls[0]));
  at(g, gable(D, rise, gm), -W / 2, H, 0);
  at(g, gable(D, rise, gm), W / 2, H, 0, Math.PI);
  if (o.chimney) at(g, box(0.95, rise + 2.2, 0.95, mat('wall_fieldstone_b'), PW, SH), W / 2 - 1.2, H + (rise + 2.2) / 2 - 0.4, -D / 4);
  // door, frame, step, lantern
  const dx = o.doorX ?? 0, dw = 1.25, dh = 2.5, fz = d0 / 2;
  at(g, mesh(new THREE.PlaneGeometry(dw, dh), doorMat(o.door)), dx, dh / 2 + 0.14, fz + 0.03);
  for (const s of [-1, 1]) at(g, box(0.22, dh + 0.24, 0.26, beam, 1), dx + s * (dw / 2 + 0.11), (dh + 0.24) / 2 + 0.02, fz + 0.06);
  at(g, box(dw + 0.7, 0.26, 0.28, beam, 1), dx, dh + 0.39, fz + 0.07);
  at(g, box(dw + 1, 0.14, 0.95, mat('slabs_slate'), 1.4), dx, 0.07, fz + 0.48);
  const lx = dx + dw / 2 + 0.75;
  at(g, box(0.06, 0.06, 0.55, iron), lx, 2.95, fz + 0.27);
  at(g, box(0.04, 0.3, 0.04, iron), lx, 2.8, fz + 0.52);
  at(g, lantern(lights), lx, 2.4, fz + 0.52);
  g.userData.footprint = { hw: w0 / 2, hd: d0 / 2 };
  return g;
}
