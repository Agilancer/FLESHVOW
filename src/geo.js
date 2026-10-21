// Geometry helpers. UVs are in metres / tile size, so one texture repeat covers tu x tv metres on any mesh.
import * as THREE from 'three';

export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

export function boxGeo(w, h, d, tu = 2, tv = tu) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];  // px nx py ny pz nz
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] / tu, uv.getY(k) * dims[f][1] / tv);
  }
  return g;
}

export function mesh(g, m, shadows = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = o.receiveShadow = shadows;
  return o;
}

export const box = (w, h, d, m, tu, tv) => mesh(boxGeo(w, h, d, tu, tv), m);

export function at(parent, o, x = 0, y = 0, z = 0, ry = 0) {
  o.position.set(x, y, z);
  if (ry) o.rotation.y = ry;
  parent.add(o);
  return o;
}

// Small seeded RNG so the village looks the same every load.
export function rng(seed) {
  let s = seed >>> 0;
  const r = () => {  // mulberry32
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  return r;
}
