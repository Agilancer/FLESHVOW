// FLESHVOW: renderer, moonlit night, bloom, the village and the walker.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { setAnisotropy } from './textures.js';
import { buildVillage, BOUND, MOON, FOG } from './village.js';
import { Player } from './player.js';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);
setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
scene.background = FOG;
scene.fog = new THREE.FogExp2(FOG, 0.03);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1000);

scene.add(new THREE.HemisphereLight(0x5b6782, 0x2a2018, 0.7));
const moon = new THREE.DirectionalLight(0x9fb0d6, 0.9);
moon.position.copy(MOON).multiplyScalar(60);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.03;
scene.add(moon, moon.target);

const { lights, colliders, updaters } = buildVillage(scene);
const player = new Player(camera, document.body, colliders, BOUND);

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const veil = document.getElementById('veil'), status = document.getElementById('status');
THREE.DefaultLoadingManager.onLoad = () => { status.textContent = 'Click to enter the village'; };
veil.addEventListener('click', () => player.controls.lock());
player.controls.addEventListener('lock', () => veil.classList.add('hidden'));
player.controls.addEventListener('unlock', () => { status.textContent = 'Click to return'; veil.classList.remove('hidden'); });

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  player.update(dt);
  for (const u of updaters) u(dt, t, camera.position);
  for (const l of lights) {  // lantern flicker
    const n = Math.sin(t * 9.1 + l.seed) * 0.5 + Math.sin(t * 23.7 + l.seed * 2) * 0.3 + Math.sin(t * 3.3 + l.seed) * 0.2;
    l.light.intensity = l.base * (0.88 + n * 0.1);
    l.flame.emissiveIntensity = 5 * (0.9 + n * 0.12);
  }
  composer.render();
});

window.FLESHVOW = { THREE, scene, camera, renderer, player, colliders, lights };
