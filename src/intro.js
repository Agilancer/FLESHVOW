// The opening cinematic: letterboxed camera moves through the crypt, the slipgate fires, the Ranger steps out,
// the camera circles him as the title comes up, then flies into his eyes and hands over to first person.
// Also the slow title-screen pan and the intermission camera.
import * as THREE from 'three';
import { rangerModel } from './models.js';
import { S } from './level.js';
import { play, musicSting } from './audio.js';

const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Intro {
  constructor(G) {
    this.G = G; this.running = false; this.t = 0;
    this.bars = document.getElementById('bars'); this.cap = document.getElementById('caption'); this.title = document.getElementById('title');
  }

  // where things are, in metres
  setup() {
    const G = this.G, L = G.level, P = G.player;
    this.start = P.pos.clone(); this.yaw = P.yaw;
    const gate = (L.gates || []).find(g => !g.exit && !g.tele);
    this.gate = gate ? gate.p.clone() : this.start.clone().add(V(0, 1.5, 4));
    const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.fwd = fwd;
    const hall = L.def.intro?.hall || [[this.start.x / S, 6, this.start.z / S - 10], [this.start.x / S, 2.5, this.start.z / S - 3], [this.start.x / S, 4, this.start.z / S - 12]];
    this.hall = hall.map(([x, y, z]) => V(x * S, y, z * S));
  }

  titleCam() {
    this.setup();
    this.G.state = 'title';
  }
  titleUpdate(dt) {
    const c = this.G.camera, t = this.G.time * .05;
    const h = this.hall[2];
    c.position.set(h.x + Math.sin(t) * 6, h.y + 1, h.z + 6 + Math.cos(t) * 4);
    c.lookAt(h.x, 1.5, h.z + 6);
  }

  play(done) {
    const G = this.G;
    this.setup();
    this.done = done; this.running = true; this.t = 0; G.state = 'intro';
    this.bars.classList.add('on');
    this.ranger = rangerModel();
    this.ranger.root.visible = false;
    G.scene.add(this.ranger.root);
    this.steps = new Set();
  }

  once(k, t, fn) { if (this.t >= t && !this.steps.has(k)) { this.steps.add(k); fn(); } }
  caption(text) { this.cap.textContent = text; this.cap.classList.toggle('on', !!text); }

  update(dt) {
    if (!this.running) return;
    const G = this.G, c = G.camera, t = (this.t += dt), R = this.ranger;
    const st = this.start, gate = this.gate, fwd = this.fwd;
    const rp = R.root.position;
    // ---- shot 1: a crane down through the great hall (0 - 5 s)
    if (t < 5) {
      const k = ease(t / 5), [a, b] = this.hall;
      c.position.copy(a).lerp(b, k);
      c.lookAt(V(b.x, 1.2 + (1 - k) * 2, b.z + 4));
      this.once('c1', .6, () => this.caption('The slipgate under the drowned crypt was sealed for a reason.'));
      this.once('c1x', 4.2, () => this.caption(''));
    }
    // ---- shot 2: the arrival slipgate fires and the Ranger steps through (5 - 9.6 s)
    else if (t < 9.6) {
      const k = (t - 5) / 4.6;
      const camFrom = st.clone().addScaledVector(fwd, 2.2).setY(st.y + .55), camTo = st.clone().addScaledVector(fwd, 1.2).setY(st.y + .9);
      c.position.copy(camFrom).lerp(camTo, ease(k));
      c.position.x += Math.sin(t * .8) * .25;
      c.lookAt(gate.x, st.y + 1.3, gate.z);
      this.once('c2', 5.3, () => this.caption('Something has come through it.'));
      this.once('gate', 6.4, () => {
        R.root.visible = true; rp.copy(gate).setY(st.y); R.root.rotation.y = this.yaw;
        G.fx.teleportFog(rp.clone()); G.fx.light(gate, [1, 1, 1.2], 12, .8);
        play('teleport'); G.flash([1, 1, 1], .5);
      });
      this.once('c2x', 8.6, () => this.caption(''));
      if (t > 6.4) {   // walk out of the gate to the start spot
        const w = ease((t - 6.6) / 2.4);
        rp.copy(gate).setY(st.y).lerp(st, w);
        this.walk(R, t > 6.6 && w < 1 ? (t - 6.6) * 7 : 0, w < 1 && t > 6.6);
      }
    }
    // ---- shot 3: circling him, the title (9.6 - 15 s)
    else if (t < 15) {
      rp.copy(st); this.walk(R, 0, false);
      const k = (t - 9.6) / 5.4;
      const a = this.yaw + Math.PI * (-0.38 + k * .9);   // sweep across his front
      const rad = 3.0 - k * .6, h = .5 + k * 1.0;
      c.position.set(st.x - Math.sin(a) * rad, st.y + h, st.z - Math.cos(a) * rad);
      c.lookAt(st.x, st.y + 1.35 - k * .1, st.z);
      this.once('title', 10.1, () => { this.title.querySelector('h2').textContent = `${G.level.def.id.toUpperCase()} · ${G.level.def.title}`; this.title.classList.add('on'); musicSting(); });
      this.once('pump', 11.3, () => play('weapon', rp));
      // rack the shotgun, then look left and right
      const J = R.rig ? R.rig.J : R.J;
      const pk = Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - 11.1) / .5)) * Math.PI));
      J.armR.rotation.set(1.25 - pk * .25, 0, .05); J.foreR.rotation.x = -.3;
      J.armL.rotation.set(1.05 + pk * .2, 0, .5); J.foreL.rotation.x = -.9 + pk * .5;
      J.head.rotation.y = Math.sin(Math.max(0, t - 12) * 1.4) * .5 * ease((t - 12) / .6);
    }
    // ---- shot 4: up behind his head and into first person (15 - 17.4 s)
    else if (t < 17.4) {
      const k = ease((t - 15) / 2.4);
      this.once('tx', 15.2, () => this.title.classList.remove('on'));
      const a = this.yaw + Math.PI * .52;
      const orbit = V(st.x - Math.sin(a) * 2.4, st.y + 1.5, st.z - Math.cos(a) * 2.4);
      const eye = V(st.x, st.y + G.player.eyeH, st.z);
      const right = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const shoulder = eye.clone().addScaledVector(fwd, -1.3).addScaledVector(right, .55).setY(eye.y + .3);
      const p = orbit.clone().lerp(shoulder, ease(k / .75));
      c.position.copy(p);
      c.lookAt(eye.clone().addScaledVector(fwd, 8).lerp(V(st.x, st.y + 1.3, st.z), Math.max(0, 1 - k * 2)));
      R.J.head.rotation.y *= .9;
      // blink into his eyes
      this.once('blink', 16.9, () => { G.flash([0, 0, 0], 1); R.root.visible = false; });
      if (t > 16.9) { c.position.copy(eye); c.lookAt(eye.clone().addScaledVector(fwd, 8)); }
    } else this.finish();
    // light the ranger like any model
    if (R.root.visible) { const l = G.level.modelLight(rp.x, rp.y + 1, rp.z), d = G.fx.dynamicAt(rp.x, rp.y + 1, rp.z); R.mats.light((l[0] + d[0]) * 2.2, (l[1] + d[1]) * 2.2, (l[2] + d[2]) * 2.2); }
  }

  walk(R, ph, on) {
    const J = R.J, s = on ? Math.sin(ph) : 0, c = on ? Math.cos(ph) : 0;
    J.thighL.rotation.x = s * .6; J.thighR.rotation.x = -s * .6;
    J.shinL.rotation.x = Math.max(0, -c) * .9; J.shinR.rotation.x = Math.max(0, c) * .9;
    J.armR.rotation.set(1.25, 0, .05); J.foreR.rotation.x = -.3; J.armL.rotation.set(1.05, 0, .5); J.foreL.rotation.x = -.9;
  }

  skip() { if (this.running && this.t > .3) this.finish(); }

  finish() {
    if (!this.running) return;
    this.running = false;
    this.G.scene.remove(this.ranger.root);
    this.bars.classList.remove('on'); this.caption(''); this.title.classList.remove('on');
    const P = this.G.player; P.pos.copy(this.start); P.yaw = this.yaw; P.pitch = 0;
    this.done?.();
  }

  interCam(dt) {
    const c = this.G.camera, P = this.G.player;
    const t = this.G.time - this.G.interT;
    c.position.set(P.pos.x + Math.sin(t * .15) * 2, P.pos.y + 2.2, P.pos.z + Math.cos(t * .15) * 2);
    c.lookAt(P.pos.x, P.pos.y + 1, P.pos.z);
  }
}
