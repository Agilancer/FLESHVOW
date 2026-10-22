// Low-poly, flat-shaded models in the spirit of Quake's .mdl files: jointed rigs built from tapered boxes and
// 6-8 sided cylinders, skinned with pack textures recoloured into flesh, fur, bronze and iron (tools/build_textures.py).
// Forward is -z, feet at y = 0. Each instance gets its own materials so it can be lit by the floor under it.
import * as THREE from 'three';
import { modelMat, tex } from './gfx.js';

const LDIR = new THREE.Vector3(0.35, 0.85, 0.4).normalize();

// flat normals, planar UVs by dominant axis (density = repeats per metre), baked directional shade in vertex colour
export function finish(geo, dens = 1.4, shadeMin = 0.5) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, cnt = p.count;
  const uv = new Float32Array(cnt * 2), col = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u * dens + 0.37; uv[i * 2 + 1] = v * dens + 0.19;
    const s = shadeMin + (1 - shadeMin) * Math.max(0, nx * LDIR.x + ny * LDIR.y + nz * LDIR.z);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// box from y=0 to y=h whose cross-section goes from w0 x d0 to w1 x d1; zs shifts the top forward (-) or back (+)
export function taper(w0, d0, w1, d1, h, zs = 0, xs = 0) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5;
    p.setXYZ(i, p.getX(i) * (w0 + (w1 - w0) * t) + xs * t, t * h, p.getZ(i) * (d0 + (d1 - d0) * t) + zs * t);
  }
  return g;
}
export const box = (w, h, d) => taper(w, d, w, d, h);
export const cyl = (r0, r1, h, seg = 6) => new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, h / 2, 0);
export const ball = (r, det = 0) => new THREE.IcosahedronGeometry(r, det);
export const cone = (r, h, seg = 5) => new THREE.ConeGeometry(r, h, seg).translate(0, h / 2, 0);

// per-instance material set
export class Mats {
  constructor() { this.m = new Map(); this.list = []; }
  get(name, opts) {
    const k = name + (opts ? JSON.stringify(opts) : '');
    if (!this.m.has(k)) { const m = modelMat(name, opts); this.m.set(k, m); this.list.push(m); }
    return this.m.get(k);
  }
  light(r, g, b) { for (const m of this.list) if (!m.userData.glow) m.color.setRGB(r, g, b); }
}

// rig helper: joints are Object3Ds, meshes hang off them
class Rig {
  constructor() { this.root = new THREE.Group(); this.J = { root: this.root }; this.mats = new Mats(); }
  joint(name, parent, x, y, z) { const j = new THREE.Group(); j.position.set(x, y, z); (this.J[parent] || this.root).add(j); this.J[name] = j; return j; }
  mesh(joint, geo, skin, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, dens) {
    const m = new THREE.Mesh(finish(geo, dens), typeof skin === 'string' ? this.mats.get(skin) : skin);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    (this.J[joint] || joint).add(m);
    return m;
  }
  glow(color) { const m = new THREE.MeshBasicMaterial({ color }); m.userData.glow = true; return m; }
}

// generic humanoid: everything hangs from hips; limbs point down (+x rotation swings them forward)
function biped(o) {
  const R = new Rig(), s = o.skins;
  const hip = o.thigh + o.shin + 0.06;
  R.joint('hips', 'root', 0, hip, 0);
  R.mesh('hips', taper(o.hipW, o.d * .9, o.waistW, o.d * .85, 0.16), s.legs, 0, -0.06, 0);
  R.joint('torso', 'hips', 0, 0.08, 0);
  R.mesh('torso', taper(o.waistW, o.d, o.chestW, o.d * 1.1, o.torso, o.lean || 0), s.torso);
  R.joint('neck', 'torso', 0, o.torso, (o.lean || 0) * .9);
  R.joint('head', 'neck', 0, 0.02, 0);
  for (const sd of [-1, 1]) {
    const L = sd < 0 ? 'L' : 'R';
    R.joint('thigh' + L, 'hips', sd * o.hipW * .3, 0, 0);
    R.mesh('thigh' + L, taper(o.legW * .8, o.legW * .8, o.legW, o.legW * 1.05, o.thigh).translate(0, -o.thigh, 0), s.legs);
    R.joint('shin' + L, 'thigh' + L, 0, -o.thigh, 0);
    R.mesh('shin' + L, taper(o.legW * .7, o.legW * .75, o.legW * .85, o.legW * .9, o.shin).translate(0, -o.shin, 0), s.boots || s.legs);
    R.mesh('shin' + L, box(o.legW * .9, .08, o.legW * 1.5), s.boots || s.legs, 0, -o.shin, -o.legW * .3);
    R.joint('arm' + L, 'torso', sd * (o.chestW / 2 + o.armW * .3), o.torso - 0.08, (o.lean || 0) * .8);
    R.mesh('arm' + L, taper(o.armW * .85, o.armW * .85, o.armW, o.armW, o.upper).translate(0, -o.upper, 0), s.arms);
    R.joint('fore' + L, 'arm' + L, 0, -o.upper, 0);
    R.mesh('fore' + L, taper(o.armW * .65, o.armW * .65, o.armW * .85, o.armW * .85, o.fore).translate(0, -o.fore, 0), s.fore || s.arms);
    R.joint('hand' + L, 'fore' + L, 0, -o.fore, 0);
    if (o.pads) R.mesh('arm' + L, taper(o.armW * 1.5, o.armW * 1.5, o.armW * 1.1, o.armW * 1.2, .14), s.pads || s.torso, sd * .02, -.08, 0);
  }
  R.height = hip + o.torso + 0.3;
  return R;
}

// --------------------------------------------------------------------------- monsters
export const MONSTER_MODELS = {
  dog() {
    const R = new Rig(), F = 'skin_fur';
    R.joint('body', 'root', 0, .62, 0);
    R.mesh('body', taper(.34, .38, .3, .3, .78).rotateX(-Math.PI / 2).translate(0, 0, .38), F);
    R.mesh('body', taper(.38, .3, .36, .26, .3), F, 0, -.08, -.32);
    R.joint('head', 'body', 0, .16, -.46);
    R.mesh('head', box(.26, .24, .28), F, 0, -.06, -.06);
    R.mesh('head', taper(.18, .2, .12, .14, .22).rotateX(-Math.PI / 2), F, 0, -.02, -.2);
    R.joint('jaw', 'head', 0, -.06, -.12);
    R.mesh('jaw', box(.12, .05, .2), 'skin_flesh', 0, -.04, -.1);
    R.mesh('head', cone(.04, .1, 4), F, -.09, .17, 0, .2, 0, -.3); R.mesh('head', cone(.04, .1, 4), F, .09, .17, 0, .2, 0, .3);
    R.mesh('head', box(.04, .03, .02), R.glow(0xffc040), -.07, .06, -.2); R.mesh('head', box(.04, .03, .02), R.glow(0xffc040), .07, .06, -.2);
    for (const [n, x, z] of [['FL', -.12, -.3], ['FR', .12, -.3], ['BL', -.12, .3], ['BR', .12, .3]]) {
      R.joint('leg' + n, 'body', x, -.05, z);
      R.mesh('leg' + n, taper(.08, .1, .12, .14, .3).translate(0, -.3, 0), F);
      R.joint('low' + n, 'leg' + n, 0, -.3, 0);
      R.mesh('low' + n, taper(.06, .08, .07, .08, .28).translate(0, -.28, 0), F);
    }
    R.joint('tail', 'body', 0, .06, .42);
    R.mesh('tail', taper(.05, .05, .02, .02, .3).rotateX(.9), F);
    Object.assign(R, { height: .9 });
    return R;
  },

  grunt() {
    const R = biped({ thigh: .44, shin: .44, torso: .52, hipW: .34, waistW: .32, chestW: .42, d: .24, legW: .15, armW: .12, upper: .3, fore: .28, pads: true,
      skins: { legs: 'skin_fatigues', boots: 'skin_leather', torso: 'skin_green_armor', arms: 'skin_fatigues', pads: 'skin_leather' } });
    R.mesh('head', box(.22, .24, .24), 'skin_flesh', 0, 0, 0);
    R.mesh('head', taper(.3, .3, .24, .24, .16), 'skin_iron', 0, .16, 0);
    R.mesh('head', cyl(.07, .05, .1, 6).rotateX(-Math.PI / 2), 'skin_iron', 0, .06, -.16);   // gas mask
    R.mesh('head', box(.06, .04, .02), R.glow(0xff3010), -.06, .13, -.125); R.mesh('head', box(.06, .04, .02), R.glow(0xff3010), .06, .13, -.125);
    const gun = shotgunModel(R.mats, .9); gun.position.set(0, -.02, -.02); gun.rotation.x = -Math.PI / 2; R.J.handR.add(gun); R.gun = gun;
    return R;
  },

  enforcer() {
    const R = biped({ thigh: .46, shin: .46, torso: .6, hipW: .4, waistW: .38, chestW: .56, d: .32, legW: .19, armW: .16, upper: .32, fore: .3, pads: true,
      skins: { legs: 'skin_chain', boots: 'skin_iron', torso: 'skin_armor_blue', arms: 'skin_chain', fore: 'skin_armor_blue', pads: 'skin_armor_blue' } });
    R.mesh('head', ball(.17, 1), 'skin_armor_blue', 0, .14, 0);
    R.mesh('head', box(.24, .06, .06), R.glow(0xffa020), 0, .14, -.15);
    R.mesh('torso', box(.3, .26, .14), 'skin_iron', 0, .14, .2);   // backpack
    const gun = new THREE.Group();
    gun.add(new THREE.Mesh(finish(box(.1, .12, .5)), R.mats.get('skin_iron')));
    const b = new THREE.Mesh(finish(cyl(.03, .03, .3, 6).rotateX(-Math.PI / 2)), R.mats.get('skin_copper')); b.position.set(0, .06, -.35); gun.add(b);
    gun.position.set(0, -.04, -.1); gun.rotation.x = -Math.PI / 2; R.J.handR.add(gun); R.gun = gun;
    return R;
  },

  knight() {
    const R = biped({ thigh: .44, shin: .44, torso: .55, hipW: .36, waistW: .32, chestW: .48, d: .28, legW: .16, armW: .13, upper: .3, fore: .28, pads: true,
      skins: { legs: 'skin_chain', boots: 'skin_bronze', torso: 'skin_bronze', arms: 'skin_chain', fore: 'skin_bronze', pads: 'skin_bronze' } });
    R.mesh('head', taper(.24, .26, .2, .22, .3), 'skin_bronze', 0, 0, 0);
    R.mesh('head', box(.16, .03, .02), R.glow(0x200800), 0, .17, -.13);
    R.mesh('head', taper(.04, .2, .02, .04, .2), 'skin_red_armor', 0, .28, .02);
    R.mesh('torso', taper(.5, .05, .42, .05, .5), 'skin_red_armor', 0, -.35, .16);   // tabard behind
    const sw = swordModel(R.mats, .95, 'skin_iron'); sw.rotation.x = -Math.PI / 2; R.J.handR.add(sw); R.sword = sw;
    return R;
  },

  hellknight() {
    const R = biped({ thigh: .5, shin: .5, torso: .66, hipW: .42, waistW: .38, chestW: .6, d: .34, legW: .19, armW: .16, upper: .36, fore: .32, pads: true, lean: -.06,
      skins: { legs: 'skin_iron', boots: 'skin_iron', torso: 'skin_red_armor', arms: 'skin_iron', fore: 'skin_red_armor', pads: 'skin_iron' } });
    for (const sd of [-1, 1]) {
      const L = sd < 0 ? 'L' : 'R';
      R.mesh('arm' + L, cone(.06, .26, 4), 'skin_bone', sd * .06, .04, 0, 0, 0, -sd * .5);
      R.mesh('head', cone(.04, .24, 4), 'skin_bone', sd * .12, .26, 0, -.3, 0, -sd * .7);
    }
    R.mesh('head', taper(.28, .3, .22, .26, .32), 'skin_iron', 0, 0, 0);
    R.mesh('head', box(.2, .04, .02), R.glow(0xff4010), 0, .18, -.155);
    R.mesh('torso', cone(.05, .2, 4), 'skin_bone', 0, .5, .2, .9);
    const sw = swordModel(R.mats, 1.2, 'skin_iron', true); sw.rotation.x = -Math.PI / 2; R.J.handR.add(sw); R.sword = sw;
    return R;
  },

  ogre() {
    const R = biped({ thigh: .5, shin: .48, torso: .7, hipW: .6, waistW: .72, chestW: .7, d: .5, legW: .26, armW: .2, upper: .4, fore: .38, lean: -.08,
      skins: { legs: 'skin_leather', boots: 'skin_ogre', torso: 'skin_ogre', arms: 'skin_ogre' } });
    R.mesh('torso', ball(.38, 1), 'skin_ogre', 0, .25, -.14);   // belly
    R.mesh('hips', taper(.66, .52, .62, .5, .3), 'skin_leather', 0, -.2, 0);
    R.mesh('head', taper(.3, .32, .24, .26, .3), 'skin_ogre', 0, -.02, -.06);
    R.mesh('head', box(.22, .06, .1), 'skin_bone', 0, .02, -.2);
    R.mesh('head', box(.05, .04, .02), R.glow(0xffe060), -.07, .17, -.2); R.mesh('head', box(.05, .04, .02), R.glow(0xffe060), .07, .17, -.2);
    // chainsaw held in both hands
    const cs = new THREE.Group();
    cs.add(new THREE.Mesh(finish(box(.2, .2, .34)), R.mats.get('skin_iron')));
    const bar = new THREE.Mesh(finish(box(.05, .12, .7)), R.mats.get('skin_chain')); bar.position.set(0, .06, -.5); cs.add(bar);
    for (let i = 0; i < 7; i++) { const t = new THREE.Mesh(finish(cone(.025, .05, 3)), R.mats.get('skin_bone')); t.position.set(0, .13, -.2 - i * .1); cs.add(t); }
    cs.position.set(-.05, -.05, -.05); cs.rotation.x = -Math.PI / 2; R.J.handR.add(cs); R.saw = cs;
    // grenade tube on the back
    R.mesh('torso', cyl(.08, .08, .5, 6), 'skin_iron', .18, .3, .3, .5, 0, .3);
    R.height = 2.3;
    return R;
  },

  scrag() {
    const R = new Rig(), F = 'skin_rotflesh';
    R.joint('body', 'root', 0, 1.1, 0);
    R.mesh('body', taper(.18, .16, .46, .3, .7), 'skin_purplerobe', 0, -.2, 0);
    let prev = 'body';
    for (let i = 0; i < 4; i++) {
      const n = 'tail' + i;
      R.joint(n, prev, 0, i ? -.24 : -.2, i ? .02 : 0);
      R.mesh(n, taper(.12 - i * .025, .1 - i * .02, .16 - i * .025, .13 - i * .02, .26).translate(0, -.26, 0), i % 2 ? 'skin_purplerobe' : F);
      prev = n;
    }
    R.joint('head', 'body', 0, .52, -.04);
    R.mesh('head', taper(.2, .22, .14, .16, .26), F, 0, 0, 0);
    R.mesh('head', taper(.14, .3, .06, .12, .1).rotateX(-1.3), F, 0, .04, -.08);
    R.mesh('head', box(.05, .04, .02), R.glow(0x80ff40), -.06, .16, -.11); R.mesh('head', box(.05, .04, .02), R.glow(0x80ff40), .06, .16, -.11);
    for (const sd of [-1, 1]) {
      const L = sd < 0 ? 'L' : 'R';
      R.joint('arm' + L, 'body', sd * .26, .42, 0);
      R.mesh('arm' + L, taper(.08, .08, .1, .1, .4).translate(0, -.4, 0), F);
      R.joint('fore' + L, 'arm' + L, 0, -.4, 0);
      R.mesh('fore' + L, taper(.05, .05, .08, .08, .36).translate(0, -.36, 0), F);
      for (let k = -1; k <= 1; k++) R.mesh('fore' + L, cone(.015, .14, 3).rotateX(Math.PI), 'skin_bone', k * .03, -.36, 0);
    }
    R.height = 1.3;
    return R;
  },

  zombie() {
    const R = biped({ thigh: .43, shin: .42, torso: .5, hipW: .3, waistW: .24, chestW: .36, d: .2, legW: .12, armW: .1, upper: .3, fore: .3, lean: -.1,
      skins: { legs: 'skin_rotflesh', torso: 'skin_rotflesh', arms: 'skin_rotflesh', fore: 'skin_flesh' } });
    R.mesh('head', taper(.2, .22, .18, .2, .25), 'skin_rotflesh', 0, 0, -.02);
    R.mesh('head', box(.12, .05, .04), 'skin_flesh', 0, .04, -.12);
    R.mesh('hips', taper(.32, .22, .3, .2, .2), 'skin_leather', 0, -.14, 0);
    R.mesh('torso', box(.2, .2, .04), 'skin_flesh', .04, .2, -.11);   // open wound
    return R;
  },

  fiend() {
    const R = new Rig(), F = 'skin_scales';
    R.joint('hips', 'root', 0, .82, .1);
    R.mesh('hips', taper(.4, .36, .44, .38, .26), F, 0, -.1, 0);
    R.joint('torso', 'hips', 0, .12, -.04);
    R.mesh('torso', taper(.46, .4, .62, .5, .6, -.32).rotateX(-.5), F);
    R.joint('neck', 'torso', 0, .42, -.5);
    R.joint('head', 'neck', 0, 0, -.04);
    R.mesh('head', taper(.26, .3, .2, .22, .26), F, 0, -.06, -.06);
    R.mesh('head', box(.2, .06, .14), 'skin_flesh', 0, -.08, -.2);
    for (let k = 0; k < 4; k++) R.mesh('head', cone(.015, .06, 3).rotateX(Math.PI), 'skin_bone', -.07 + k * .045, -.02, -.25);
    R.mesh('head', cone(.04, .22, 4), 'skin_bone', -.1, .16, 0, -.4, 0, .5); R.mesh('head', cone(.04, .22, 4), 'skin_bone', .1, .16, 0, -.4, 0, -.5);
    R.mesh('head', box(.05, .04, .02), R.glow(0xff8000), -.07, .1, -.18); R.mesh('head', box(.05, .04, .02), R.glow(0xff8000), .07, .1, -.18);
    for (const sd of [-1, 1]) {
      const L = sd < 0 ? 'L' : 'R';
      R.joint('arm' + L, 'torso', sd * .32, .38, -.4);
      R.mesh('arm' + L, taper(.12, .12, .15, .15, .42).translate(0, -.42, 0), F);
      R.joint('fore' + L, 'arm' + L, 0, -.42, 0);
      R.mesh('fore' + L, taper(.09, .09, .12, .12, .36).translate(0, -.36, 0), F);
      R.joint('hand' + L, 'fore' + L, 0, -.36, 0);
      for (let k = -1; k <= 1; k++) R.mesh('hand' + L, cone(.025, .38, 3).rotateX(Math.PI), 'skin_bone', k * .045, 0, -.02);
      R.joint('thigh' + L, 'hips', sd * .2, -.06, .05);
      R.mesh('thigh' + L, taper(.13, .16, .18, .2, .38).translate(0, -.38, 0), F);
      R.joint('shin' + L, 'thigh' + L, 0, -.38, 0);
      R.mesh('shin' + L, taper(.08, .1, .12, .13, .38).translate(0, -.38, 0), F);
      R.mesh('shin' + L, box(.14, .06, .24), F, 0, -.38, -.06);
    }
    R.height = 1.5;
    return R;
  },

  shambler() {
    const R = new Rig(), F = 'skin_whitefur';
    R.joint('hips', 'root', 0, 1.0, 0);
    R.mesh('hips', taper(.6, .5, .7, .55, .3), F, 0, -.12, 0);
    R.joint('torso', 'hips', 0, .16, 0);
    R.mesh('torso', taper(.75, .6, 1.25, .8, 1.0, -.1), F);
    R.mesh('torso', ball(.34, 0), F, 0, 1.05, .05);  // hump instead of a head
    R.joint('head', 'torso', 0, .55, -.38);   // the chest mouth is the 'head'
    R.mesh('head', box(.46, .22, .1), 'skin_vore', 0, -.1, 0);
    for (let k = 0; k < 6; k++) { R.mesh('head', cone(.02, .07, 3).rotateX(Math.PI), 'skin_bone', -.18 + k * .072, .01, -.05); R.mesh('head', cone(.02, .07, 3), 'skin_bone', -.18 + k * .072, -.21, -.05); }
    R.mesh('torso', box(.06, .05, .02), R.glow(0xffffff), -.18, .82, -.4); R.mesh('torso', box(.06, .05, .02), R.glow(0xffffff), .18, .82, -.4);
    for (const sd of [-1, 1]) {
      const L = sd < 0 ? 'L' : 'R';
      R.joint('arm' + L, 'torso', sd * .66, .88, -.05);
      R.mesh('arm' + L, taper(.2, .22, .3, .3, .62).translate(0, -.62, 0), F);
      R.joint('fore' + L, 'arm' + L, 0, -.62, 0);
      R.mesh('fore' + L, taper(.16, .18, .22, .24, .6).translate(0, -.6, 0), F);
      R.joint('hand' + L, 'fore' + L, 0, -.6, 0);
      for (let k = -1; k <= 1; k++) R.mesh('hand' + L, cone(.04, .3, 3).rotateX(Math.PI), 'skin_bone', k * .07, 0, -.04);
      R.joint('thigh' + L, 'hips', sd * .26, -.05, 0);
      R.mesh('thigh' + L, taper(.22, .26, .3, .32, .5).translate(0, -.5, 0), F);
      R.joint('shin' + L, 'thigh' + L, 0, -.5, 0);
      R.mesh('shin' + L, taper(.18, .22, .22, .26, .45).translate(0, -.45, 0), F);
      R.mesh('shin' + L, box(.28, .08, .38), 'skin_bone', 0, -.45, -.06);
    }
    R.height = 2.7;
    return R;
  },
};

// the player character for the intro: a ranger in green armour with a shotgun
export function rangerModel() {
  const R = biped({ thigh: .44, shin: .44, torso: .55, hipW: .36, waistW: .32, chestW: .48, d: .27, legW: .16, armW: .13, upper: .3, fore: .28, pads: true,
    skins: { legs: 'skin_fatigues', boots: 'skin_leather', torso: 'skin_green_armor', arms: 'skin_fatigues', fore: 'skin_leather', pads: 'skin_green_armor' } });
  R.mesh('head', box(.22, .25, .24), 'skin_flesh', 0, 0, 0);
  R.mesh('head', taper(.29, .3, .25, .27, .14), 'skin_iron', 0, .18, .01);
  R.mesh('head', box(.24, .05, .03), R.glow(0x101010), 0, .14, -.125);
  R.mesh('torso', box(.36, .3, .14), 'skin_leather', 0, .14, .19);
  R.mesh('torso', box(.5, .06, .3), 'skin_leather', 0, -.02, 0);
  const gun = shotgunModel(R.mats, 1); gun.position.set(0, -.02, -.02); gun.rotation.x = -Math.PI / 2; R.J.handR.add(gun); R.gun = gun;
  return R;
}

// --------------------------------------------------------------------------- weapons (barrel along -z, grip at origin)
function M(mats, name) { return mats.get(name); }
function part(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, dens = 6) {
  const m = new THREE.Mesh(finish(geo, dens), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
const tube = (r0, r1, len, seg = 8) => new THREE.CylinderGeometry(r1, r0, len, seg).rotateX(-Math.PI / 2).translate(0, 0, -len / 2);

export function shotgunModel(mats, s = 1) {
  const g = new THREE.Group(), I = M(mats, 'skin_iron'), W = M(mats, 'skin_wood');
  part(g, tube(.022, .022, .62), I, 0, .05, -.18);
  part(g, tube(.016, .016, .46), I, 0, .015, -.14);
  part(g, box(.06, .05, .14), W, 0, -.01, -.3);            // pump
  part(g, box(.05, .055, .18), I, 0, .015, .03);            // receiver
  part(g, taper(.04, .05, .05, .1, .3, .0).rotateX(Math.PI / 2 + .35).translate(0, -.05, .12), W, 0, -.03, 0);
  g.scale.setScalar(s); return g;
}
export function ssgModel(mats, s = 1) {
  const g = new THREE.Group(), I = M(mats, 'skin_iron'), W = M(mats, 'skin_darkwood');
  part(g, tube(.024, .024, .6), I, -.026, .05, -.16); part(g, tube(.024, .024, .6), I, .026, .05, -.16);
  part(g, box(.11, .05, .3), W, 0, .0, -.2);
  part(g, box(.08, .06, .16), I, 0, .02, .05);
  part(g, taper(.05, .06, .06, .11, .3).rotateX(Math.PI / 2 + .35).translate(0, -.05, .14), W, 0, -.03, 0);
  g.scale.setScalar(s); return g;
}
export function nailgunModel(mats, s = 1) {
  const g = new THREE.Group(), I = M(mats, 'skin_iron'), C = M(mats, 'skin_copper');
  part(g, box(.12, .12, .3), I, 0, 0, -.02);
  const spin = new THREE.Group(); spin.position.set(0, .03, -.2); g.add(spin);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; part(spin, tube(.016, .016, .4, 6), C, Math.cos(a) * .035, Math.sin(a) * .035, 0); }
  part(spin, tube(.05, .05, .04, 8), I, 0, 0, -.32);
  part(g, cyl(.06, .06, .1, 8).rotateZ(Math.PI / 2), C, 0, -.02, .05);
  part(g, box(.05, .12, .07), M(mats, 'skin_leather'), 0, -.1, .06, .3);
  g.userData.spin = spin; g.scale.setScalar(s); return g;
}
export function snailgunModel(mats, s = 1) {
  const g = new THREE.Group(), I = M(mats, 'skin_iron'), C = M(mats, 'skin_copper'), B = M(mats, 'skin_bronze');
  part(g, box(.2, .16, .34), B, 0, 0, .02);
  const spin = new THREE.Group(); spin.position.set(0, .04, -.16); g.add(spin);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; part(spin, tube(.028, .028, .5, 6), I, Math.cos(a) * .06, Math.sin(a) * .06, 0); }
  part(spin, tube(.1, .1, .05, 8), C, 0, 0, -.06); part(spin, tube(.1, .1, .05, 8), C, 0, 0, -.38);
  part(g, cyl(.1, .1, .12, 8).rotateZ(Math.PI / 2), C, 0, -.03, .08);
  part(g, box(.06, .14, .08), M(mats, 'skin_leather'), 0, -.12, .1, .3);
  g.userData.spin = spin; g.scale.setScalar(s); return g;
}
export function grenadeModel(mats, s = 1) {
  const g = new THREE.Group(), I = M(mats, 'skin_iron'), W = M(mats, 'skin_wood');
  part(g, tube(.055, .06, .34, 8), I, 0, .05, -.22);
  part(g, tube(.1, .1, .16, 6), M(mats, 'skin_copper'), 0, .04, -.04);
  part(g, box(.08, .09, .16), I, 0, .02, .1);
  part(g, taper(.05, .06, .065, .12, .26).rotateX(Math.PI / 2 + .3).translate(0, -.04, .16), W, 0, -.02, 0);
  part(g, tube(.04, .04, .02, 8), M(mats, 'skin_leather'), 0, .05, -.39);
  g.scale.setScalar(s); return g;
}
// the Quake rocket launcher: a long bronze tube with a peaked spine (the arrowhead you see from behind),
// a flared muzzle collar, a dark bore, a ribbed rear and two grips
export function rocketModel(mats, s = 1) {
  const g = new THREE.Group(), B = M(mats, 'skin_bronze'), I = M(mats, 'skin_iron'), D = M(mats, 'skin_darkwood');
  const sh = new THREE.Shape();
  sh.moveTo(-.075, -.06); sh.lineTo(.075, -.06); sh.lineTo(.085, .04); sh.lineTo(0, .115); sh.lineTo(-.085, .04); sh.closePath();
  const body = new THREE.ExtrudeGeometry(sh, { depth: .62, bevelEnabled: false }); body.translate(0, 0, -.62);
  part(g, body, B, 0, .02, -.02, 0, 0, 0, 5);
  part(g, tube(.09, .1, .1, 8), B, 0, .025, -.62);                    // muzzle collar
  part(g, tube(.105, .095, .04, 8), I, 0, .025, -.72);
  part(g, tube(.06, .06, .02, 8), M(mats, 'skin_vore'), 0, .025, -.75); // dark bore
  part(g, tube(.08, .08, .14, 8), I, 0, .02, .1);                       // ribbed breech
  for (let k = 0; k < 3; k++) part(g, tube(.088, .088, .02, 8), D, 0, .02, .05 + k * .045);
  const notch = new THREE.Shape(); notch.moveTo(-.03, 0); notch.lineTo(.03, 0); notch.lineTo(0, .05); notch.closePath();
  part(g, new THREE.ExtrudeGeometry(notch, { depth: .16, bevelEnabled: false }).translate(0, 0, -.16), D, 0, .11, -.04);
  part(g, box(.05, .14, .07), D, 0, -.16, .0, .2);                      // rear grip
  part(g, box(.05, .12, .06), D, 0, -.15, -.3, .1);                     // front grip
  part(g, box(.04, .02, .12), I, 0, -.075, -.03);
  g.scale.setScalar(s); return g;
}
export function lightningModel(mats, s = 1) {
  const g = new THREE.Group(), C = M(mats, 'skin_copper'), I = M(mats, 'skin_iron');
  part(g, box(.14, .14, .3), I, 0, 0, 0);
  for (let k = 0; k < 4; k++) part(g, new THREE.TorusGeometry(.08, .018, 4, 8), C, 0, .02, -.18 - k * .06);
  part(g, tube(.03, .03, .32, 6), C, 0, .02, -.14);
  part(g, tube(.012, .006, .16, 4), C, -.04, .05, -.42, 0, 0, 0); part(g, tube(.012, .006, .16, 4), C, .04, .05, -.42);
  part(g, box(.06, .14, .08), M(mats, 'skin_leather'), 0, -.12, .06, .3);
  g.scale.setScalar(s); return g;
}
export function axeModel(mats, s = 1) {
  const g = new THREE.Group(), I = M(mats, 'skin_iron'), W = M(mats, 'skin_wood');
  part(g, tube(.02, .022, .6, 6), W, 0, 0, .2);
  const head = new THREE.Shape(); head.moveTo(0, -.03); head.lineTo(.2, -.1); head.lineTo(.22, .12); head.lineTo(0, .05); head.closePath();
  part(g, new THREE.ExtrudeGeometry(head, { depth: .03, bevelEnabled: false }).translate(0, 0, -.015).rotateY(Math.PI / 2), I, 0, 0, -.36, 0, 0, Math.PI / 2);
  g.scale.setScalar(s); return g;
}
export function swordModel(mats, len = 1, skin = 'skin_iron', wide = false) {
  const g = new THREE.Group();
  part(g, taper(wide ? .12 : .08, .02, .02, .01, len).rotateX(-Math.PI / 2), mats.get(skin), 0, 0, -.06);
  part(g, box(.28, .04, .05), mats.get('skin_bronze'), 0, 0, -.04);
  part(g, tube(.025, .025, .16, 5), mats.get('skin_leather'), 0, 0, .14);
  return g;
}
export const WEAPON_MODELS = [axeModel, shotgunModel, ssgModel, nailgunModel, snailgunModel, grenadeModel, rocketModel, lightningModel];

// --------------------------------------------------------------------------- items
export function itemModel(kind, mats) {
  const g = new THREE.Group();
  const crate = (w, h, d, skin = 'skin_crate') => part(g, box(w, h, d), mats.get(skin), 0, 0, 0, 0, 0, 0, 3);
  const red = new THREE.MeshBasicMaterial({ color: 0xc01010 }); red.userData.glow = true;
  if (kind === 'health' || kind === 'health_small' || kind === 'mega') {
    const s = kind === 'mega' ? 1.3 : kind === 'health' ? 1 : .8;
    crate(.5 * s, .32 * s, .5 * s, kind === 'mega' ? 'skin_iron' : 'skin_crate');
    part(g, box(.3 * s, .02, .08 * s), red, 0, .32 * s, 0); part(g, box(.08 * s, .02, .3 * s), red, 0, .32 * s, 0);
    if (kind === 'mega') { const glow = new THREE.MeshBasicMaterial({ color: 0x8080ff }); glow.userData.glow = true; part(g, ball(.12, 1), glow, 0, .55, 0); }
  } else if (kind.startsWith('armor')) {
    const skin = { armor_green: 'skin_green_armor', armor_yellow: 'skin_yellow_armor', armor_red: 'skin_red_armor' }[kind];
    part(g, taper(.44, .26, .56, .3, .5), mats.get(skin), 0, .05, 0, 0, 0, 0, 3);
    for (const sd of [-1, 1]) part(g, taper(.2, .3, .16, .26, .1), mats.get(skin), sd * .3, .5, 0, 0, 0, -sd * .4, 3);
    part(g, box(.2, .1, .32), mats.get('skin_leather'), 0, .55, .02);
  } else if (kind === 'shells') {
    crate(.44, .26, .3);
    const shellM = new THREE.MeshBasicMaterial({ color: 0xa02818 }); shellM.userData.glow = true;
    for (let i = 0; i < 4; i++) part(g, cyl(.035, .035, .12, 6), mats.get('skin_bronze'), -.15 + i * .1, .26, 0);
  } else if (kind === 'nails') {
    crate(.44, .28, .32, 'skin_iron');
    for (let i = 0; i < 6; i++) part(g, cone(.012, .1, 3), mats.get('skin_copper'), -.15 + i * .06, .28, (i % 2) * .08 - .04);
  } else if (kind === 'rockets') {
    crate(.5, .26, .36);
    for (let i = 0; i < 2; i++) { part(g, cyl(.06, .06, .26, 6), mats.get('skin_bronze'), -.1 + i * .2, .26, 0); part(g, cone(.06, .12, 6), mats.get('skin_red_armor'), -.1 + i * .2, .52, 0); }
  } else if (kind === 'cells') {
    crate(.4, .3, .32, 'skin_iron');
    const cm = new THREE.MeshBasicMaterial({ color: 0x80c0ff }); cm.userData.glow = true;
    part(g, box(.24, .06, .2), cm, 0, .3, 0);
  } else if (kind === 'key_silver' || kind === 'key_gold') {
    const km = mats.get(kind === 'key_gold' ? 'skin_yellow_armor' : 'skin_iron');
    part(g, new THREE.TorusGeometry(.14, .035, 4, 8), km, 0, .75, 0);
    part(g, box(.05, .5, .05), km, 0, .2, 0);
    part(g, box(.14, .05, .05), km, .07, .26, 0); part(g, box(.1, .05, .05), km, .05, .38, 0);
    const gm = new THREE.MeshBasicMaterial({ color: kind === 'key_gold' ? 0xffd040 : 0xd0e0ff }); gm.userData.glow = true;
    part(g, ball(.06, 0), gm, 0, .75, 0);
  } else if (kind === 'quad') {
    const qm = new THREE.MeshBasicMaterial({ color: 0x4060ff }); qm.userData.glow = true;
    part(g, new THREE.OctahedronGeometry(.3, 0), qm, 0, .6, 0);
    const im = new THREE.MeshBasicMaterial({ color: 0xc0d0ff, wireframe: true }); im.userData.glow = true;
    part(g, new THREE.OctahedronGeometry(.38, 0), im, 0, .6, 0);
  } else if (kind.startsWith('w_')) {
    const i = ['w_axe', 'w_shotgun', 'w_ssg', 'w_nailgun', 'w_snailgun', 'w_grenade', 'w_rocket', 'w_lightning'].indexOf(kind);
    const w = WEAPON_MODELS[i](mats, 1.6); w.position.y = .45; w.rotation.y = Math.PI / 2; g.add(w);
  }
  return g;
}

// meat chunks for gibs
export function gibGeo(seed) {
  const g = new THREE.IcosahedronGeometry(.1 + (seed % 3) * .03, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + ((i * 7 + seed) % 5) * .12), p.getY(i) * .8, p.getZ(i));
  return finish(g, 4);
}

// clone a joint's meshes into a standalone head gib
export function headGib(R) {
  const g = R.J.head.clone(true);
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
  return g;
}

export function preloadSkins() {
  return ['skin_flesh', 'skin_rotflesh', 'skin_ogre', 'skin_fur', 'skin_whitefur', 'skin_scales', 'skin_fatigues', 'skin_armor_blue', 'skin_iron',
    'skin_bronze', 'skin_copper', 'skin_wood', 'skin_darkwood', 'skin_leather', 'skin_purplerobe', 'skin_bone', 'skin_chain', 'skin_green_armor',
    'skin_yellow_armor', 'skin_red_armor', 'skin_slime', 'skin_crate', 'skin_vore'];
}
