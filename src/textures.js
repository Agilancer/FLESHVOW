// Textures sliced by tools/slice_textures.py, cached; every mesh UV is in metres (see geo.js), so repeat stays 1.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const texCache = new Map(), matCache = new Map();
let aniso = 8;
export const setAnisotropy = n => { aniso = n; };

export function tex(name, srgb = true) {
  let t = texCache.get(name);
  if (t) return t;
  t = loader.load(`assets/textures/${name}.webp`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(name, t);
  return t;
}

// Standard material with the texture's generated normal map. o: { ns: normal strength, color, rough, normal: false }
export function mat(name, o = {}) {
  const key = name + '|' + JSON.stringify(o);
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: tex(name), roughness: o.rough ?? 0.92, metalness: 0, color: o.color ?? 0xffffff });
  if (o.normal !== false) { m.normalMap = tex(name + '_n', false); m.normalScale.setScalar(o.ns ?? 1); }
  matCache.set(key, m);
  return m;
}

export function doorMat(name) {
  return new THREE.MeshStandardMaterial({ map: tex('door_' + name), alphaTest: 0.5, roughness: 0.85 });
}
