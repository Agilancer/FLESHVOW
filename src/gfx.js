// Textures and Quake-style materials. Everything works in "gamma space" like the 1996 software renderer:
// textures are NoColorSpace, the renderer outputs linear (no conversion), so texture * light is the palette lookup.
import * as THREE from 'three';

export let manifest = {};
const cache = new Map();
const loader = new THREE.TextureLoader();
export const time = { value: 0 };

// dynamic lights: rockets, explosions, muzzle flashes, powerups (Quake's dlights)
export const MAX_DL = 8;
export const dlPos = { value: Array.from({ length: MAX_DL }, () => new THREE.Vector4(0, -999, 0, 0.001)) };
export const dlCol = { value: Array.from({ length: MAX_DL }, () => new THREE.Vector3()) };
export const fog = { value: new THREE.Vector4(0, 0, 0, 0.012) };   // rgb, density

export async function loadManifest() {
  manifest = await (await fetch('assets/textures/manifest.json')).json();
}

export function tex(name, { repeat = true } = {}) {
  const key = name + (repeat ? '' : '#c');
  if (cache.has(key)) return cache.get(key);
  if (Object.keys(manifest).length && !manifest[name]) console.warn('missing texture', name);
  const t = loader.load(`assets/textures/${name}.png`);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 1;
  cache.set(key, t);
  return t;
}

// preload a list of texture names and resolve when all images are in
export function preload(names) {
  return Promise.all([...new Set(names)].map(n => new Promise(res => {
    const t = tex(n);
    if (t.image && t.image.complete) return res();
    const iv = setInterval(() => { if (t.image && t.image.width) { clearInterval(iv); res(); } }, 20);
    setTimeout(() => { clearInterval(iv); res(); }, 8000);
  })));
}

const DL_GLSL = `
uniform vec4 dlPos[${MAX_DL}]; uniform vec3 dlCol[${MAX_DL}];
vec3 dynLight(vec3 p) {
  vec3 s = vec3(0.);
  for (int i = 0; i < ${MAX_DL}; i++) { float d = distance(p, dlPos[i].xyz); s += dlCol[i] * max(0., 1. - d / dlPos[i].w); }
  return s;
}`;
const FOG_GLSL = `uniform vec4 fogc; vec3 applyFog(vec3 c, float d) { return mix(c, fogc.rgb, 1. - exp(-fogc.w * fogc.w * d * d)); }`;

const WORLD_VS = `
attribute vec3 color; varying vec3 vL; varying vec2 vUv; varying vec3 vW; varying float vD;
void main() { vUv = uv; vL = color; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;

// light: baked vertex light (0.5 = texture at full brightness, up to 1 = 2x overbright), banded into 32 steps
const WORLD_FS = `
uniform sampler2D map; uniform float alphaTest; uniform float bright; varying vec3 vL; varying vec2 vUv; varying vec3 vW; varying float vD;
${DL_GLSL} ${FOG_GLSL}
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < alphaTest) discard;
  vec3 l = vL + dynLight(vW);
  l = floor(min(l, vec3(1.)) * 32. + .5) / 32.;
  vec3 c = t.rgb * mix(l * 2., vec3(1.), bright);
  gl_FragColor = vec4(applyFog(c, vD), 1.);
}`;

export function worldMat(name, { alphaTest = 0, bright = 0, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex(name) }, alphaTest: { value: alphaTest }, bright: { value: bright }, dlPos, dlCol, fogc: fog },
    vertexShader: WORLD_VS, fragmentShader: WORLD_FS, side });
}

// Quake sky: two layers projected on a squashed sphere around the eye, the front one with holes, scrolling at 2 speeds
const SKY_FS = `
uniform sampler2D back, front; uniform float time; uniform vec3 tint; varying vec3 vW;
void main() {
  vec3 d = vW - cameraPosition; d.y *= 3.; d = normalize(d);
  vec2 uv = d.xz * 2.4;
  vec3 b = texture2D(back, uv + time * .018).rgb;
  vec4 f = texture2D(front, uv + time * .036);
  vec3 c = mix(b * tint, f.rgb * tint * 1.35, f.a);
  gl_FragColor = vec4(c, 1.);
}`;
export function skyMat(tint) {
  return new THREE.ShaderMaterial({
    uniforms: { back: { value: tex('sky_back') }, front: { value: tex('sky_front') }, time, tint: { value: new THREE.Color(...tint) } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: SKY_FS });
}

// turbulent liquids (Quake's warp): fullbright for lava/slime/slipgates, translucent water
const LIQ_FS = `
uniform sampler2D map; uniform float time, alpha, lit; varying vec2 vUv; varying vec3 vL; varying vec3 vW; varying float vD;
${FOG_GLSL}
void main() {
  vec2 uv = vUv + .125 * sin(vUv.yx * 3.14159 + time * 1.6);
  vec3 c = texture2D(map, uv).rgb;
  c *= mix(vec3(1.), vL * 2.2 + .25, lit);
  gl_FragColor = vec4(applyFog(c, vD), alpha);
}`;
export function liquidMat(name) {
  const water = name === 'water';
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex(name) }, time, alpha: { value: water ? 0.62 : 1 }, lit: { value: water ? 1 : 0 }, fogc: fog },
    vertexShader: WORLD_VS, fragmentShader: LIQ_FS, transparent: water, depthWrite: !water, side: THREE.DoubleSide });
}

// models and sprites: Quake lit an alias model with ONE light value taken under it. Per-instance material, colour = light.
export function modelMat(name, opts = {}) {
  const t = typeof name === 'string' ? tex(name) : name;
  return new THREE.MeshBasicMaterial({ map: t, vertexColors: !opts.noShade, alphaTest: opts.alphaTest || 0, side: opts.side || THREE.FrontSide,
    transparent: !!opts.transparent, depthWrite: opts.depthWrite !== false, fog: false });
}

// sprite planes for wall torches and props
export function spriteMat(name) {
  const m = modelMat(tex(name, { repeat: false }), { alphaTest: 0.5, noShade: true, side: THREE.DoubleSide });
  return m;
}

// canvas texture helper (HUD icons, explosion frames, gate swirl)
export function canvasTex(c, nearest = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}
