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

// Palette-swap a sliced texture on a canvas: fn(r, g, b, lum 0..1) -> [r, g, b]. The original's normal map still fits.
export function swapTex(name, key, fn) {
  const k = name + '#' + key;
  let t = texCache.get(k);
  if (t) return t;
  t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, t);
  loader.load(`assets/textures/${name}.webp`, src => {
    const img = src.image, c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const o = fn(p[i], p[i + 1], p[i + 2], (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) / 255);
      p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2];
    }
    x.putImageData(d, 0, 0);
    t.image = c;
    t.needsUpdate = true;
  });
  return t;
}

export function swapMat(name, key, fn, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: swapTex(name, key, fn), normalMap: tex(name + '_n', false), roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0, color: o.color ?? 0xffffff, envMap: o.env ?? null, envMapIntensity: o.envI ?? 1, vertexColors: !!o.vc,
    flatShading: !!o.flat, side: o.side ?? THREE.FrontSide });
  m.normalScale.setScalar(o.ns ?? 1);
  return m;
}

// A night environment map for metal: dark sky, a pale moon, warm lantern glints.
let envTex = null;
export function nightEnv(renderer) {
  if (envTex) return envTex;
  const s = new THREE.Scene(), pm = new THREE.PMREMGenerator(renderer);
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.06, 0.09), side: THREE.BackSide })));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9.5, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.04, 0.03) }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2; s.add(ground);
  const spot = (c, x, y, z, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); s.add(m); };
  spot(new THREE.Color(3, 3.1, 3.6), -4.5, 6, -5, 0.9);
  for (const [x, z] of [[6, 2], [-5, 5], [3, -7], [8, -3]]) spot(new THREE.Color(6, 2.6, 0.8), x, 0.5, z, 0.35);
  spot(new THREE.Color(0.5, 0.55, 0.7), 0, 9, 0, 3);
  envTex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return envTex;
}

export function doorMat(name) {
  return new THREE.MeshStandardMaterial({ map: tex('door_' + name), alphaTest: 0.5, roughness: 0.85 });
}
