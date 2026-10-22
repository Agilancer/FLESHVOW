// Level compiler: an ASCII grid + legend becomes Quake-like brush geometry (world-aligned UVs, tall rooms, steps,
// lintels, sky, liquids), a baked per-vertex lightmap with ray-traced shadows, movers (doors, lifts, secret walls,
// buttons), slipgates, and the collision / trace queries everything else uses. Cells are S metres square.
import * as THREE from 'three';
import { worldMat, skyMat, liquidMat, spriteMat, manifest, tex } from './gfx.js';

export const S = 2;
const BIG = 1e4;

// entity characters shared by every map (a map's `ents` can add more)
export const ENTS = {
  '@': { player: true },
  d: { monster: 'dog' }, g: { monster: 'grunt' }, e: { monster: 'enforcer' }, k: { monster: 'knight' },
  h: { monster: 'hellknight' }, o: { monster: 'ogre' }, w: { monster: 'scrag' }, z: { monster: 'zombie' },
  f: { monster: 'fiend' }, b: { monster: 'shambler' },
  '+': { item: 'health' }, j: { item: 'health_small' }, m: { item: 'mega' },
  a: { item: 'armor_green' }, y: { item: 'armor_yellow' }, r: { item: 'armor_red' },
  s: { item: 'shells' }, n: { item: 'nails' }, p: { item: 'rockets' }, l: { item: 'cells' }, u: { item: 'quad' },
  i: { torch: 1 }, '*': { brazier: 1 },
};

export class Level {
  constructor(def) {
    this.def = def;
    this.group = new THREE.Group();
    this.movers = []; this.lights = []; this.ents = []; this.boxes = []; this.sprites = []; this.anim = [];
    this.triggers = new Map(); this.fired = new Set(); this.secrets = 0; this.secretsFound = 0;
    this.parse();
  }

  // ------------------------------------------------------------------ parsing
  parse() {
    const def = this.def;
    const rows = def.map.replace(/^\n+|\n\s*$/g, '').split('\n');
    this.h = rows.length; this.w = Math.max(...rows.map(r => r.length));
    const ents = { ...ENTS, ...(def.ents || {}) };
    const legend = {};
    for (const [ch, v] of Object.entries(def.legend)) {
      if (ents[ch]) throw new Error(`legend char ${ch} is an entity char`);
      legend[ch] = typeof v === 'string' ? { solid: true, wt: v } : v;
    }
    const base = def.base || {};
    const N = this.w * this.h; this.cells = new Array(N);
    const raw = rows.map(r => r.padEnd(this.w, ' '));
    this.raw = raw;
    const plain = (ch) => { const L = legend[ch]; return L && !L.solid && !L.door && !L.secret && !L.exit && !L.tele && !L.deco && L.plat === undefined && !L.button && !L.box; };
    const geomChar = (x, z) => {
      // an entity cell takes its geometry from the nearest plain floor neighbour (left first)
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1], [-3, 0], [3, 0]]) {
        const ch = raw[z + dz]?.[x + dx];
        if (ch && !ents[ch] && plain(ch)) return ch;
      }
      throw new Error(`entity at ${x},${z} has no floor next to it`);
    };
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      let ch = raw[z][x];
      const ent = ents[ch];
      if (ent) { this.ents.push({ ...ent, ch, x, z }); ch = geomChar(x, z); }
      const L = ch === ' ' ? { solid: true, wt: base.wt || 'cw_ashlar' } : legend[ch];
      if (!L) throw new Error(`unknown map char '${ch}' at ${x},${z}`);
      const c = L.solid ? { solid: true, wt: L.wt || base.wt, ch, L } : { ...base, ...L, ch, L };
      if (c.button) c.solid = true;
      this.cells[z * this.w + x] = c;
    }
    // doors, secrets, exits inherit floor/ceiling from their open neighbours
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const c = this.cell(x, z);
      if (c.solid || !(c.door || c.secret || c.inherit)) continue;
      if (c.L.f !== undefined && c.L.c !== undefined) continue;
      let f = -BIG, cc = BIG;
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = this.cell(x + dx, z + dz);
        if (!n || n.solid || n.door || n.secret) continue;
        f = Math.max(f, n.f); cc = Math.min(cc, n.c);
      }
      if (f > -BIG) { if (c.L.f === undefined) c.f = f; if (c.L.c === undefined) c.c = Math.min(cc, f + (c.door ? 3.5 : 99)); }
      if (c.c <= c.f) c.c = c.f + 3;
    }
    for (const c of this.cells) if (!c.solid) { c.f = +c.f || 0; c.c = c.c ?? c.f + 4; }
    this.boxCells = Array.from({ length: N }, () => []);
  }

  cell(x, z) { return x < 0 || z < 0 || x >= this.w || z >= this.h ? null : this.cells[z * this.w + x]; }
  at(px, pz) { return this.cell(Math.floor(px / S), Math.floor(pz / S)); }
  solidAt(x, z) { const c = this.cell(x, z); return !c || c.solid; }
  center(x, z) { return new THREE.Vector3((x + 0.5) * S, this.cell(x, z)?.f ?? 0, (z + 0.5) * S); }

  // ------------------------------------------------------------------ building
  build() {
    this.collectLights();
    const B = new Builder(this);
    const W = this.w, H = this.h;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const c = this.cell(x, z);
      if (c.solid) continue;
      const x0 = x * S, x1 = x0 + S, z0 = z * S, z1 = z0 + S;
      // floor and ceiling
      if (c.plat === undefined) B.horiz(c.ft, x0, z0, x1, z1, c.f, +1);
      if (c.sky) B.sky(x0, z0, x1, z1, c.c); else B.horiz(c.ct, x0, z0, x1, z1, c.c, -1);
      if (c.liquid) B.liquid(c.liquid, x0, z0, x1, z1, c.lh ?? c.f + 1);
      // four sides
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = this.cell(x + dx, z + dz);
        if (!n || n.solid) { B.wall(n ? n.wt : c.wt, x, z, dx, dz, c.f, c.c, c.f, n?.button); continue; }
        if (n.f > c.f) B.wall(n.wt || c.wt, x, z, dx, dz, c.f, Math.min(n.f, c.c), c.f);
        if (n.c < c.c && !(n.sky && c.sky)) B.wall(n.wt || c.wt, x, z, dx, dz, Math.max(n.c, c.f), c.c, c.f);
        // sky cells next to taller sky: the sky face covers the gap
        if (n.sky && c.sky && n.c < c.c) B.skyWall(x, z, dx, dz, n.c, c.c);
      }
      if (c.box) this.addBox(x, z, c.box, B);
    }
    this.buildMovers(B);
    B.light(this);
    this.group.add(...B.meshes());
    this.lightGrid = new Float32Array(W * H * 3);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const c = this.cell(x, z); if (c.solid) continue;
      const l = this.lightAt((x + .5) * S, c.f + 1.1, (z + .5) * S, null);
      this.lightGrid.set(l, (z * W + x) * 3);
    }
    this.placeEnts();
  }

  addBox(x, z, b, B) {
    const ins = b.inset || 0;
    const box = { x0: x * S + ins, z0: z * S + ins, x1: (x + 1) * S - ins, z1: (z + 1) * S - ins, y0: b.y0, y1: b.y1, static: true };
    this.registerBox(box);
    // faces: skip sides shared with an identical neighbour box
    const same = (dx, dz) => { const n = this.cell(x + dx, z + dz); return n && n.box && !ins && !n.box.inset && n.box.y0 === b.y0 && n.box.y1 === b.y1; };
    B.boxFaces(b.t || 'plate', box, { nx: same(-1, 0), px: same(1, 0), nz: same(0, -1), pz: same(0, 1) }, b.tt);
  }

  registerBox(b) {
    this.boxes.push(b);
    const cx0 = Math.max(0, Math.floor(b.x0 / S)), cx1 = Math.min(this.w - 1, Math.floor((b.x1 - 1e-4) / S));
    const cz0 = Math.max(0, Math.floor(b.z0 / S)), cz1 = Math.min(this.h - 1, Math.floor((b.z1 - 1e-4) / S));
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) this.boxCells[z * this.w + x].push(b);
  }

  // doors, lifts, secret walls, buttons, exits and teleporters
  buildMovers(B) {
    const seen = new Set();
    const group = (x, z, ch) => {   // flood fill same-char cells
      const out = [], st = [[x, z]];
      while (st.length) {
        const [a, b] = st.pop(), k = b * this.w + a;
        if (seen.has(k) || this.raw[b]?.[a] !== ch) continue;
        seen.add(k); out.push([a, b]);
        st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
      }
      return out;
    };
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const c = this.cell(x, z), k = z * this.w + x;
      if (seen.has(k)) continue;
      if (c.door) {
        const cells = group(x, z, c.ch);
        const m = { kind: 'door', cells, key: c.key, trig: c.trig, state: 'closed', t: 0, wait: 0, parts: [], off: 0, msg: c.msg };
        m.max = c.c - c.f - 0.15; m.speed = c.speed || 3;
        for (const [a, b] of cells) {
          const cc = this.cell(a, b);
          const ns = !this.solidAt(a, b - 1) && !this.solidAt(a, b + 1);   // passage runs north-south
          const t = 0.25;
          const box = ns ? { x0: a * S, x1: (a + 1) * S, z0: (b + .5) * S - t, z1: (b + .5) * S + t }
                         : { x0: (a + .5) * S - t, x1: (a + .5) * S + t, z0: b * S, z1: (b + 1) * S };
          Object.assign(box, { y0: cc.f, y1: cc.c, mover: m, by0: cc.f, by1: cc.c });
          this.registerBox(box);
          const mesh = B.moverMesh(box, c.door, ns ? 'z' : 'x', c.dt || 'plate');
          m.parts.push({ box, mesh });
        }
        this.movers.push(m);
      } else if (c.plat !== undefined) {
        const cells = group(x, z, c.ch);
        const m = { kind: 'plat', cells, state: 'down', t: 0, wait: 0, parts: [], off: 0, max: c.plat - c.f, speed: c.speed || 2.6 };
        for (const [a, b] of cells) {
          const cc = this.cell(a, b);
          const box = { x0: a * S, x1: (a + 1) * S, z0: b * S, z1: (b + 1) * S, y0: cc.f - m.max - 0.2, y1: cc.f, mover: m };
          box.by0 = box.y0; box.by1 = box.y1;
          this.registerBox(box);
          m.parts.push({ box, mesh: B.moverMesh(box, c.pt || 'plate', null, c.pt || 'plate', true) });
        }
        this.movers.push(m);
      } else if (c.secret) {
        const cells = group(x, z, c.ch);
        const m = { kind: 'secret', cells, state: 'closed', t: 0, parts: [], off: 0, speed: 1.6, dir: c.sdir || 'down' };
        this.secrets++;
        for (const [a, b] of cells) {
          const cc = this.cell(a, b);
          const box = { x0: a * S, x1: (a + 1) * S, z0: b * S, z1: (b + 1) * S, y0: cc.f, y1: cc.c, mover: m };
          box.by0 = box.y0; box.by1 = box.y1;
          m.max = cc.c - cc.f;
          this.registerBox(box);
          m.parts.push({ box, mesh: B.moverMesh(box, c.secret, 'wall', c.secret, false, cc.f) });
        }
        this.movers.push(m);
      } else if (c.button) {
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const n = this.cell(x + dx, z + dz);
          if (!n || n.solid) continue;
          const cx = (x + .5) * S + dx * S / 2, cz = (z + .5) * S + dz * S / 2, y = n.f + 1.1, hw = .32, d = .12;
          const box = dx ? { x0: cx + (dx < 0 ? -d : 0), x1: cx + (dx > 0 ? d : 0), z0: cz - hw, z1: cz + hw }
                         : { x0: cx - hw, x1: cx + hw, z0: cz + (dz < 0 ? -d : 0), z1: cz + (dz > 0 ? d : 0) };
          Object.assign(box, { y0: y - hw, y1: y + hw });
          const m = { kind: 'button', trig: c.button, state: 'up', parts: [], off: 0, max: d * .8, dx, dz, speed: 1 };
          box.mover = m; box.by0 = box.y0; box.by1 = box.y1; box.bx = [box.x0, box.x1, box.z0, box.z1];
          this.registerBox(box);
          m.parts.push({ box, mesh: B.moverMesh(box, 'button', null, 'plate', true) });
          this.movers.push(m);
        }
      }
      if (c.secretArea && !c._grp) {   // a hidden area counts once, whichever of its cells you step in first
        const grp = { found: false };
        for (const [a, b] of group(x, z, c.ch)) this.cell(a, b)._grp = grp;
        this.secrets++;
      }
      if (c.exit || c.tele || c.deco) {
        const ns = !(this.solidAt(x, z - 1) && this.solidAt(x, z + 1));
        B.gate(x, z, c, ns, this);
      }
    }
  }

  collectLights() {
    const def = this.def;
    for (const e of this.ents) {
      const c = this.cell(e.x, e.z);
      if (e.torch) {
        // mount on the first solid neighbour
        let dir = [0, 0];
        for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (this.solidAt(e.x + dx, e.z + dz)) { dir = [dx, dz]; break; }
        const p = new THREE.Vector3((e.x + .5 + dir[0] * .44) * S, c.f + (e.ty || 2.3), (e.z + .5 + dir[1] * .44) * S);
        e.mount = { p, dir };
        this.lights.push({ p: p.clone().add(new THREE.Vector3(-dir[0] * .3, .35, -dir[1] * .3)), col: def.torchCol || [1, .62, .32], r: e.r || 11, i: 1.0, flame: true });
      } else if (e.brazier) {
        const p = new THREE.Vector3((e.x + .5) * S, c.f + 1.4, (e.z + .5) * S);
        this.lights.push({ p, col: [1, .55, .25], r: 12, i: 1.1, flame: true });
      } else if (e.light) {
        const [r, g, b, rad, hy] = e.light;
        this.lights.push({ p: new THREE.Vector3((e.x + .5) * S, (hy !== undefined ? c.f + hy : c.c - .3), (e.z + .5) * S), col: [r, g, b], r: rad, i: 1 });
      }
    }
    for (const l of def.lights || []) this.lights.push({ p: new THREE.Vector3(l[0] * S, l[1], l[2] * S), col: l[3], r: l[4], i: 1 });
    // lava and slime glow
    for (let z = 0; z < this.h; z += 1) for (let x = 0; x < this.w; x += 1) {
      const c = this.cell(x, z);
      if (c.liquid === 'lava' && (x + z) % 3 === 0) this.lights.push({ p: new THREE.Vector3((x + .5) * S, (c.lh ?? c.f + 1) + .6, (z + .5) * S), col: [1, .45, .15], r: 7, i: .9 });
      if (c.liquid === 'slime' && (x + z) % 4 === 0) this.lights.push({ p: new THREE.Vector3((x + .5) * S, (c.lh ?? c.f + 1) + .5, (z + .5) * S), col: [.3, .7, .2], r: 5, i: .6 });
      if ((c.exit || c.tele || c.deco) && !c.solid) this.lights.push({ p: new THREE.Vector3((x + .5) * S, c.f + 1.6, (z + .5) * S), col: [.45, .5, 1], r: 8, i: 1 });
    }
    // bucket lights by cell for fast lookup
    this.lightBins = new Map();
    for (const l of this.lights) {
      const r = Math.ceil(l.r / S);
      const lx = Math.floor(l.p.x / S), lz = Math.floor(l.p.z / S);
      for (let z = lz - r; z <= lz + r; z++) for (let x = lx - r; x <= lx + r; x++) {
        const k = z * 4096 + x; if (!this.lightBins.has(k)) this.lightBins.set(k, []); this.lightBins.get(k).push(l);
      }
    }
  }

  // baked light at a point with optional surface normal (Quake: (r - d) falloff, half-lambert)
  lightAt(x, y, z, n) {
    const amb = this.def.ambient ?? 0.06;
    let r = amb, g = amb, b = amb;
    const ls = this.lightBins.get(Math.floor(z / S) * 4096 + Math.floor(x / S));
    if (ls) for (const l of ls) {
      const dx = l.p.x - x, dy = l.p.y - y, dz = l.p.z - z, d = Math.hypot(dx, dy, dz);
      if (d >= l.r) continue;
      let ang = 1;
      if (n) { ang = (dx * n[0] + dy * n[1] + dz * n[2]) / (d || 1); if (ang <= -0.2) continue; ang = 0.5 + 0.5 * Math.max(0, ang); }
      if (this.occluded(x, y, z, l.p.x, l.p.y, l.p.z)) continue;
      const a = (1 - d / l.r) * l.i * ang * 0.95;
      r += a * l.col[0]; g += a * l.col[1]; b += a * l.col[2];
    }
    // skylight: rays toward the sky
    const sk = this.def.skyLight;
    if (sk) {
      let vis = 0;
      for (const [ux, uz] of SKYDIRS) if (this.seesSky(x, y, z, ux, uz)) vis++;
      if (vis) { const v = vis / SKYDIRS.length * (n ? 0.6 + 0.4 * Math.max(0, n[1]) : 1); r += sk[0] * v; g += sk[1] * v; b += sk[2] * v; }
    }
    return [r, g, b];
  }

  seesSky(x, y, z, ux, uz) {
    // march up a steep ray until it crosses a sky ceiling (open above) or hits something
    for (let t = 0.3; t < 30; t += 0.5) {
      const px = x + ux * t, py = y + t, pz = z + uz * t;
      const c = this.at(px, pz);
      if (!c || c.solid) return false;
      if (py < c.f) return false;
      if (py >= c.c) return !!c.sky;
      for (const b of this.boxCells[Math.floor(pz / S) * this.w + Math.floor(px / S)] || []) if (!b.mover && px > b.x0 && px < b.x1 && pz > b.z0 && pz < b.z1 && py > b.y0 && py < b.y1) return false;
    }
    return false;
  }

  // segment test used by light baking and line of sight; movers count only when `movers` is set
  occluded(ax, ay, az, bx, by, bz, movers = false) {
    const dx = bx - ax, dz = bz - az, dy = by - ay;
    let cx = Math.floor(ax / S), cz = Math.floor(az / S);
    const ex = Math.floor(bx / S), ez = Math.floor(bz / S);
    const sx = Math.sign(dx), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(S / dx) : Infinity, tdz = dz ? Math.abs(S / dz) : Infinity;
    let tmx = dx ? ((sx > 0 ? (cx + 1) * S - ax : ax - cx * S) / Math.abs(dx)) : Infinity;
    let tmz = dz ? ((sz > 0 ? (cz + 1) * S - az : az - cz * S) / Math.abs(dz)) : Infinity;
    let t0 = 0;
    for (let i = 0; i < 400; i++) {
      const t1 = Math.min(1, tmx, tmz);
      const c = this.cell(cx, cz);
      if (!c || c.solid) return true;
      const y0 = ay + dy * t0, y1 = ay + dy * t1;
      if (Math.min(y0, y1) < c.f - 0.02 || Math.max(y0, y1) > c.c + 0.02) return true;
      const bl = this.boxCells[cz * this.w + cx];
      for (let k = 0; k < bl.length; k++) {
        const b = bl[k];
        if (b.mover && !movers) continue;
        if (segBox(ax, ay, az, dx, dy, dz, b, 1)) return true;
      }
      if (t1 >= 1 || (cx === ex && cz === ez)) return false;
      if (tmx < tmz) { cx += sx; t0 = tmx; tmx += tdx; } else { cz += sz; t0 = tmz; tmz += tdz; }
    }
    return false;
  }

  // ray trace for hitscan and projectiles: returns { t, n:[x,y,z], box, sky } or null within maxT
  trace(ox, oy, oz, dx, dy, dz, maxT) {
    let cx = Math.floor(ox / S), cz = Math.floor(oz / S);
    const sx = Math.sign(dx), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(S / dx) : Infinity, tdz = dz ? Math.abs(S / dz) : Infinity;
    let tmx = dx ? ((sx > 0 ? (cx + 1) * S - ox : ox - cx * S) / Math.abs(dx)) : Infinity;
    let tmz = dz ? ((sz > 0 ? (cz + 1) * S - oz : oz - cz * S) / Math.abs(dz)) : Infinity;
    let t0 = 0, enterN = [0, 1, 0];
    for (let i = 0; i < 600 && t0 <= maxT; i++) {
      const t1 = Math.min(maxT, tmx, tmz);
      const c = this.cell(cx, cz);
      if (!c || c.solid) return { t: t0, n: enterN, cell: c, cx, cz };
      const ye = oy + dy * t0;
      if (ye < c.f - 1e-3 || ye > c.c + 1e-3) return { t: t0, n: enterN, cx, cz };
      let best = null;
      if (dy < 0) { const tf = (c.f - oy) / dy; if (tf >= t0 && tf <= t1) best = { t: tf, n: [0, 1, 0], floor: true, cx, cz }; }
      else if (dy > 0) { const tc = (c.c - oy) / dy; if (tc >= t0 && tc <= t1) best = { t: tc, n: [0, -1, 0], sky: !!c.sky, cx, cz }; }
      const bl = this.boxCells[cz * this.w + cx];
      for (let k = 0; k < bl.length; k++) {
        const h = rayBox(ox, oy, oz, dx, dy, dz, bl[k]);
        if (h && h.t >= 0 && h.t <= maxT && (!best || h.t < best.t)) best = h;
      }
      if (best && best.t <= t1 + 1e-4) return best;
      if (t1 >= maxT) return best && best.t <= maxT ? best : null;
      if (tmx < tmz) { cx += sx; t0 = tmx; tmx += tdx; enterN = [-sx, 0, 0]; } else { cz += sz; t0 = tmz; tmz += tdz; enterN = [0, 0, -sz]; }
    }
    return null;
  }

  // every blocking AABB near a region: solid columns, floor and ceiling slabs, boxes and movers
  forBoxes(x0, z0, x1, z1, fn) {
    const cx0 = Math.floor(x0 / S), cx1 = Math.floor(x1 / S), cz0 = Math.floor(z0 / S), cz1 = Math.floor(z1 / S);
    const tmp = this._tmp || (this._tmp = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 });
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) {
      const c = this.cell(x, z);
      tmp.x0 = x * S; tmp.x1 = tmp.x0 + S; tmp.z0 = z * S; tmp.z1 = tmp.z0 + S;
      if (!c || c.solid) { tmp.y0 = -BIG; tmp.y1 = BIG; fn(tmp); continue; }
      tmp.y0 = -BIG; tmp.y1 = c.f; fn(tmp);
      tmp.x0 = x * S; tmp.x1 = tmp.x0 + S; tmp.z0 = z * S; tmp.z1 = tmp.z0 + S; tmp.y0 = c.c; tmp.y1 = BIG; fn(tmp);
      const bl = this.boxCells[z * this.w + x];
      for (let k = 0; k < bl.length; k++) if (!bl[k].nonsolid) fn(bl[k]);
    }
  }

  // floor height under a point (for monsters, items, gibs)
  floorAt(x, y, z) {
    const c = this.at(x, z); if (!c || c.solid) return y;
    let f = c.f;
    for (const b of this.boxCells[Math.floor(z / S) * this.w + Math.floor(x / S)] || [])
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 <= y + 0.6 && b.y1 > f) f = b.y1;
    return f;
  }

  modelLight(x, y, z) {
    const cx = Math.floor(x / S), cz = Math.floor(z / S);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return [0.1, 0.1, 0.1];
    const i = (cz * this.w + cx) * 3, g = this.lightGrid;
    return [g[i], g[i + 1], g[i + 2]];
  }

  placeEnts() {
    for (const e of this.ents) {
      const c = this.cell(e.x, e.z);
      e.pos = new THREE.Vector3((e.x + .5) * S, c.f, (e.z + .5) * S);
      if (c.box && c.box.y1 <= c.f + 3 && !c.box.inset) e.pos.y = c.box.y1;
      if (e.torch) this.addTorch(e);
      if (e.brazier) this.addBrazier(e);
      if (e.prop) this.addProp(e);
    }
  }

  addSprite(name, h, pos, opts = {}) {
    const m = manifest[name] || { w: 64, h: 64 };
    const w = h * m.w / m.h;
    const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
    const mat = spriteMat(name);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    const l = this.lightAt(pos.x, pos.y + h * .5, pos.z, null);
    mat.color.setRGB(...l.map(v => Math.min(1.3, v * 2 + (opts.glow || 0))));
    if (opts.face) mesh.rotation.y = opts.face; else this.sprites.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  addTorch(e) {
    const { p, dir } = e.mount;
    const name = this.def.torch || 'torch_1';
    const m = this.addSprite(name, 0.9, p.clone().add(new THREE.Vector3(-dir[0] * .06, -.55, -dir[1] * .06)), { face: Math.atan2(-dir[0], -dir[1]), glow: .3 });
    m.material.color.setRGB(1, .9, .8);
    this.flames = this.flames || [];
    this.flames.push({ p: p.clone().add(new THREE.Vector3(-dir[0] * .18, .5, -dir[1] * .18)), s: 0.55 });
  }

  addBrazier(e) {
    const c = this.cell(e.x, e.z);
    const p = new THREE.Vector3((e.x + .5) * S, c.f, (e.z + .5) * S);
    const s = this.addSprite('cp_incense_brazier', 1.3, p, { glow: .4 });
    this.flames = this.flames || [];
    this.flames.push({ p: p.clone().add(new THREE.Vector3(0, 1.25, 0)), s: 0.9 });
    this.registerBox({ x0: p.x - .35, x1: p.x + .35, z0: p.z - .35, z1: p.z + .35, y0: c.f, y1: c.f + 1.1, static: true });
  }

  addProp(e) {
    const c = this.cell(e.x, e.z);
    if (Array.isArray(e.prop)) e = { ...e, prop: e.prop[(e.x * 7 + e.z * 13) % e.prop.length] };
    const p = e.pos.clone();
    if (e.off) p.add(new THREE.Vector3(e.off[0], 0, e.off[1]));
    this.addSprite(e.prop, e.h || 1.6, p, { glow: e.glow || 0 });
    if (e.solid !== false) { const r = e.rad || .4; this.registerBox({ x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r, y0: c.f, y1: c.f + (e.h || 1.6) * .9, static: true }); }
    if (e.flame) { this.flames = this.flames || []; this.flames.push({ p: p.clone().add(new THREE.Vector3(0, e.flame, 0)), s: .5 }); }
  }

  // ------------------------------------------------------------------ movers and triggers
  fire(name, game) {
    if (!name) return;
    for (const m of this.movers) if (m.trig === name && m.state !== 'open' && m.state !== 'opening') { m.state = 'opening'; m.perm = true; game?.sound('door', m.parts[0].box); }
    if (!this.fired.has(name)) { this.fired.add(name); game?.onTrigger(name); }
  }

  update(dt, game) {
    const P = game.player;
    for (const m of this.movers) {
      const near = (r) => m.parts.some(({ box }) => P && Math.abs(P.pos.x - (box.x0 + box.x1) / 2) < r + (box.x1 - box.x0) / 2 && Math.abs(P.pos.z - (box.z0 + box.z1) / 2) < r + (box.z1 - box.z0) / 2 && P.pos.y < box.by1 + 1 && P.pos.y + 1.8 > box.by0 - 1);
      if (m.kind === 'door') {
        if (m.state === 'closed' && !m.trig && P && !P.dead && near(1.6)) {
          if (m.key && !P.keys.has(m.key)) { if (!m.nagT || m.nagT < game.time) { game.center(`You need the ${m.key} key`); game.sound('locked', P.pos); m.nagT = game.time + 2; } }
          else { m.state = 'opening'; if (m.key) { m.perm = true; game.message(`The ${m.key} key opens the way`); } game.sound('door', m.parts[0].box); }
        }
        if (m.state === 'opening') { m.off = Math.min(m.max, m.off + m.speed * dt); if (m.off >= m.max) { m.state = 'open'; m.wait = 3.5; } }
        else if (m.state === 'open' && !m.perm) { if (near(1.8)) m.wait = 2; else if ((m.wait -= dt) <= 0) { m.state = 'closing'; game.sound('door', m.parts[0].box); } }
        else if (m.state === 'closing') {
          const no = Math.max(0, m.off - m.speed * dt);
          if (this.moverBlocked(m, no, game)) m.state = 'opening'; else { m.off = no; if (no <= 0) m.state = 'closed'; }
        }
        for (const { box, mesh } of m.parts) { box.y0 = box.by0 + m.off; box.y1 = box.by1 + m.off; mesh.position.y = m.off; }
      } else if (m.kind === 'plat') {
        const on = P && this.entOnMover(P, m);
        if (m.state === 'down' && on) { m.wait += dt; if (m.wait > .4) { m.state = 'up'; m.wait = 0; game.sound('plat', m.parts[0].box); } }
        else if (m.state === 'down') m.wait = 0;
        const target = m.state === 'up' ? m.max : 0;
        const prev = m.off;
        if (m.off !== target) m.off = target > m.off ? Math.min(target, m.off + m.speed * dt) : Math.max(target, m.off - m.speed * dt);
        if (m.state === 'up' && m.off >= m.max) { if (on) m.wait = 0; else if ((m.wait += dt) > 2.5) { m.state = 'down'; m.wait = 0; game.sound('plat', m.parts[0].box); } }
        const d = m.off - prev;
        for (const { box, mesh } of m.parts) { box.y0 = box.by0 + m.off; box.y1 = box.by1 + m.off; mesh.position.y = m.off; }
        if (d) for (const e of game.movingEnts()) if (this.entOnMover(e, m, prev)) e.pos.y = Math.max(e.pos.y + d, m.parts[0].box.y1);
      } else if (m.kind === 'secret') {
        if (m.state === 'opening') {
          m.off = Math.min(m.max, m.off + m.speed * dt);
          if (m.off >= m.max) m.state = 'open';
          for (const { box, mesh } of m.parts) {
            if (m.dir === 'down') { box.y1 = box.by1 - m.off; mesh.position.y = -m.off; }
            if (m.off >= m.max) box.nonsolid = true;
          }
        }
      } else if (m.kind === 'button') {
        if (m.state === 'up' && P && !P.dead) {
          const b = m.parts[0].box;
          const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, cy = (b.y0 + b.y1) / 2;
          if (Math.hypot(P.pos.x - cx, P.pos.z - cz) < 1.05 && Math.abs(P.pos.y + 1 - cy) < 1.4) this.press(m, game);
        }
        if (m.state === 'down' && m.off < m.max) {
          m.off = Math.min(m.max, m.off + dt * .8);
          const { box, mesh } = m.parts[0];
          const [a, b, c, d] = box.bx;
          box.x0 = a - m.dx * m.off; box.x1 = b - m.dx * m.off; box.z0 = c - m.dz * m.off; box.z1 = d - m.dz * m.off;
          mesh.position.set(-m.dx * m.off, 0, -m.dz * m.off);
        }
      }
    }
    // trigger cells under the player
    if (P && !P.dead) {
      const c = this.at(P.pos.x, P.pos.z);
      if (c && c.trig && !c.door && !this.fired.has(c.trig)) { if (c.msg) game.center(c.msg); this.fire(c.trig, game); }
      if (c && c._grp && !c._grp.found) { c._grp.found = true; this.secretsFound++; game.secret(); }
    }
    for (const a of this.anim) a(dt, game);
  }

  press(m, game) {
    m.state = 'down'; game.sound('button', m.parts[0].box);
    this.fire(m.trig, game);
  }

  shotMover(box, game) {
    const m = box.mover; if (!m) return;
    if (m.kind === 'secret' && m.state === 'closed') { m.state = 'opening'; this.secretsFound++; game.secret(); game.sound('door', box); }
    if (m.kind === 'button' && m.state === 'up') this.press(m, game);
  }

  entOnMover(e, m, offAt) {
    const r = e.r || .4;
    return m.parts.some(({ box }) => {
      const top = offAt !== undefined ? box.by1 + offAt : box.y1;
      return e.pos.x + r > box.x0 && e.pos.x - r < box.x1 && e.pos.z + r > box.z0 && e.pos.z - r < box.z1 && Math.abs(e.pos.y - top) < 0.12;
    });
  }

  moverBlocked(m, off, game) {
    for (const e of game.movingEnts()) {
      const r = e.r || .4, h = e.h || 1.7;
      for (const { box } of m.parts) {
        const y0 = box.by0 + off, y1 = box.by1 + off;
        if (e.pos.x + r > box.x0 && e.pos.x - r < box.x1 && e.pos.z + r > box.z0 && e.pos.z - r < box.z1 && e.pos.y + h > y0 && e.pos.y < y1) return true;
      }
    }
    return false;
  }
}

const SKYDIRS = [[0, 0], [.55, 0], [-.55, 0], [0, .55], [0, -.55]];

function segBox(ax, ay, az, dx, dy, dz, b, tmax) {
  let t0 = 0, t1 = tmax;
  const o = [ax, ay, az], d = [dx, dy, dz], lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] <= lo[i] || o[i] >= hi[i]) return false; continue; }
    let ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}

export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  if (b.nonsolid) return null;
  let t0 = -Infinity, t1 = Infinity, n = null;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
    let ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i], s = -1;
    if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; }
    if (ta > t0) { t0 = ta; n = [0, 0, 0]; n[i] = s; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (t1 < 0) return null;
  return { t: Math.max(0, t0), n: n || [0, 1, 0], box: b };
}

// ------------------------------------------------------------------ geometry builder
class Builder {
  constructor(level) {
    this.L = level;
    this.buckets = new Map();   // material key -> {pos, uv, nrm, idx, mat}
    this.extra = [];
  }

  bucket(key, make) {
    let b = this.buckets.get(key);
    if (!b) { b = { pos: [], uv: [], nrm: [], idx: [], ins: [], make, key }; this.buckets.set(key, b); }
    return b;
  }

  // emit a subdivided quad: origin o, axes ua/va (vectors), uv function, normal
  grid(b, o, ua, va, nu, nv, uvf, n) {
    const base = b.pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv;
      const x = o[0] + ua[0] * s + va[0] * t, y = o[1] + ua[1] * s + va[1] * t, z = o[2] + ua[2] * s + va[2] * t;
      b.pos.push(x, y, z); b.nrm.push(n[0], n[1], n[2]); b.ins.push(this.inside);
      const [u, v] = uvf(x, y, z); b.uv.push(u, v);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, c = a + nu + 1;
      b.idx.push(a, a + 1, c + 1, a, c + 1, c);
    }
  }

  size(t) { return manifest[t]?.size || [2, 2]; }

  horiz(t, x0, z0, x1, z1, y, up) {
    if (!t) return;
    this.inside = [(x0 + x1) / 2, (z0 + z1) / 2];
    const [sw, sh] = this.size(t);
    const b = this.bucket(t, () => worldMat(t));
    const uvf = (x, y, z) => [x / sw, -z / sh];
    // winding: floors face up, ceilings down
    if (up > 0) this.grid(b, [x0, y, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], 4, 4, uvf, [0, 1, 0]);
    else this.grid(b, [x0, y, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], 4, 4, uvf, [0, -1, 0]);
  }

  sky(x0, z0, x1, z1, y) {
    const b = this.bucket('#sky', () => skyMat(this.L.def.sky || [.5, .35, .6]));
    this.grid(b, [x0, y, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], 1, 1, () => [0, 0], [0, -1, 0]);
  }

  skyWall(x, z, dx, dz, y0, y1) {
    const b = this.bucket('#sky', () => skyMat(this.L.def.sky || [.5, .35, .6]));
    this.wallQuad(b, x, z, dx, dz, y0, y1, () => [0, 0], 1);
  }

  liquid(kind, x0, z0, x1, z1, y) {
    this.inside = null;
    const b = this.bucket('#liq_' + kind, () => liquidMat(kind));
    this.grid(b, [x0, y, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], 2, 2, (x, y, z) => [x / 2, -z / 2], [0, 1, 0]);
  }

  // a wall on side (dx,dz) of cell (x,z), facing into the cell, from y0 to y1; v measured from `base`
  wall(t, x, z, dx, dz, y0, y1, base) {
    if (y1 - y0 < 1e-3 || !t) return;
    const [sw, sh] = this.size(t);
    const up = manifest[t + '_up'] ? t + '_up' : null;
    const split = up ? base + sh : Infinity;
    const uAt = (px, pz) => dx ? (dx < 0 ? -pz : pz) : (dz < 0 ? px : -px);
    if (y0 < split) {
      const b = this.bucket(t, () => worldMat(t));
      this.wallQuad(b, x, z, dx, dz, y0, Math.min(y1, split), (px, py, pz) => [uAt(px, pz) / sw, (py - base) / sh]);
    }
    if (y1 > split) {
      const [uw, uh] = this.size(up);
      const b = this.bucket(up, () => worldMat(up));
      this.wallQuad(b, x, z, dx, dz, Math.max(y0, split), y1, (px, py, pz) => [uAt(px, pz) / uw, (py - split) / uh]);
    }
  }

  wallQuad(b, x, z, dx, dz, y0, y1, uvf, subH = 4) {
    const cx = (x + .5) * S, cz = (z + .5) * S, h = S / 2;
    this.inside = [cx, cz];
    // the wall plane is at the cell edge; corners ordered so the face points back into the cell
    let p0, p1;
    if (dx < 0) { p0 = [cx - h, cz + h]; p1 = [cx - h, cz - h]; }
    else if (dx > 0) { p0 = [cx + h, cz - h]; p1 = [cx + h, cz + h]; }
    else if (dz < 0) { p0 = [cx - h, cz - h]; p1 = [cx + h, cz - h]; }
    else { p0 = [cx + h, cz + h]; p1 = [cx - h, cz + h]; }
    const nv = Math.max(1, Math.round((y1 - y0) / 0.5));
    this.grid(b, [p0[0], y0, p0[1]], [p1[0] - p0[0], 0, p1[1] - p0[1]], [0, y1 - y0, 0], subH, nv, uvf, [-dx, 0, -dz]);
  }

  boxFaces(t, bx, skip, topT) {
    this.inside = null;
    const [sw, sh] = this.size(t);
    const b = this.bucket(t, () => worldMat(t));
    const tt = topT || t, [tw, th] = this.size(tt), bt = this.bucket(tt, () => worldMat(tt));
    const { x0, x1, y0, y1, z0, z1 } = bx;
    const nu = (a) => Math.max(1, Math.round(a / .5));
    this.grid(bt, [x0, y1, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], nu(x1 - x0), nu(z1 - z0), (x, y, z) => [x / tw, -z / th], [0, 1, 0]);
    if (y0 > -50) this.grid(b, [x0, y0, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], nu(x1 - x0), nu(z1 - z0), (x, y, z) => [x / sw, z / sh], [0, -1, 0]);
    const nv = nu(y1 - y0), uvy = (y) => (y - y0) / sh;
    if (!skip.pz) this.grid(b, [x0, y0, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0], nu(x1 - x0), nv, (x, y) => [x / sw, uvy(y)], [0, 0, 1]);
    if (!skip.nz) this.grid(b, [x1, y0, z0], [x0 - x1, 0, 0], [0, y1 - y0, 0], nu(x1 - x0), nv, (x, y) => [-x / sw, uvy(y)], [0, 0, -1]);
    if (!skip.px) this.grid(b, [x1, y0, z1], [0, 0, z0 - z1], [0, y1 - y0, 0], nu(z1 - z0), nv, (x, y, z) => [-z / sw, uvy(y)], [1, 0, 0]);
    if (!skip.nx) this.grid(b, [x0, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], nu(z1 - z0), nv, (x, y, z) => [z / sw, uvy(y)], [-1, 0, 0]);
  }

  // movers are their own meshes (they move), lit at build time like the world
  moverMesh(box, t, doorAxis, sideT, plain, base = 0) {
    const sub = new Builder(this.L);
    if (doorAxis === 'z' || doorAxis === 'x') {
      // door slab: the leaf texture stretched over each big face, plate on the edges
      const { x0, x1, y0, y1, z0, z1 } = box;
      const b = sub.bucket(t, () => worldMat(t));
      const fit = (u, v) => [u, v];
      if (doorAxis === 'z') {
        sub.grid(b, [x0, y0, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0], 4, 6, (x, y) => fit((x - x0) / (x1 - x0), (y - y0) / (y1 - y0)), [0, 0, 1]);
        sub.grid(b, [x1, y0, z0], [x0 - x1, 0, 0], [0, y1 - y0, 0], 4, 6, (x, y) => fit((x1 - x) / (x1 - x0), (y - y0) / (y1 - y0)), [0, 0, -1]);
      } else {
        sub.grid(b, [x1, y0, z1], [0, 0, z0 - z1], [0, y1 - y0, 0], 4, 6, (x, y, z) => fit((z1 - z) / (z1 - z0), (y - y0) / (y1 - y0)), [1, 0, 0]);
        sub.grid(b, [x0, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], 4, 6, (x, y, z) => fit((z - z0) / (z1 - z0), (y - y0) / (y1 - y0)), [-1, 0, 0]);
      }
      const e = { ...box };
      sub.boxFaces(sideT, e, doorAxis === 'z' ? { pz: 1, nz: 1 } : { px: 1, nx: 1 });
    } else if (doorAxis === 'wall') {
      // secret wall: wall-aligned texture identical to its neighbours
      const { x0, x1, y0, y1, z0, z1 } = box;
      const [sw, sh] = sub.size(t);
      const b = sub.bucket(t, () => worldMat(t));
      const v = (y) => (y - base) / sh, nv = Math.max(1, Math.round((y1 - y0) / .5));
      sub.grid(b, [x0, y0, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0], 4, nv, (x, y) => [x / sw, v(y)], [0, 0, 1]);
      sub.grid(b, [x1, y0, z0], [x0 - x1, 0, 0], [0, y1 - y0, 0], 4, nv, (x, y) => [-x / sw, v(y)], [0, 0, -1]);
      sub.grid(b, [x1, y0, z1], [0, 0, z0 - z1], [0, y1 - y0, 0], 4, nv, (x, y, z) => [-z / sw, v(y)], [1, 0, 0]);
      sub.grid(b, [x0, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], 4, nv, (x, y, z) => [z / sw, v(y)], [-1, 0, 0]);
    } else sub.boxFaces(t, box, {}, plain ? t : undefined);
    sub.light(this.L, true);
    const g = new THREE.Group(); g.add(...sub.meshes());
    this.L.group.add(g);
    return g;
  }

  // slipgate (exit) or teleporter: swirl plane in an arch frame
  gate(x, z, c, ns, L) {
    const cx = (x + .5) * S, cz = (z + .5) * S, f = c.f, top = Math.min(c.c, f + 3.2);
    const b = this.bucket('#liq_gate', () => liquidMat('gate'));
    if (ns) this.grid(b, [cx - S / 2 + .15, f, cz], [S - .3, 0, 0], [0, top - f, 0], 2, 3, (px, py) => [px / 2, py / 2], [0, 0, 1]);
    else this.grid(b, [cx, f, cz - S / 2 + .15], [0, 0, S - .3], [0, top - f, 0], 2, 3, (px, py, pz) => [pz / 2, py / 2], [1, 0, 0]);
    const arch = c.arch || L.def.arch || 'carch_1';
    if (arch !== 'none') {
      const m = manifest[arch] || { w: 240, h: 160 };
      const ah = 4.6, aw = ah * m.w / m.h;
      const geo = new THREE.PlaneGeometry(aw, ah); geo.translate(0, ah / 2, 0);
      for (const side of [1, -1]) {
        const mat = spriteMat(arch);
        mat.color.setRGB(1.1, 1, 1.15);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx + (ns ? 0 : side * .3), f - .02, cz + (ns ? side * .3 : 0));
        mesh.rotation.y = ns ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        mesh.scale.x = Math.min(1, (S + 1.4) / aw) * (aw > 4 ? 1 : 1);
        L.group.add(mesh);
      }
    }
    L.gates = L.gates || [];
    L.gates.push({ x, z, p: new THREE.Vector3(cx, f + 1.5, cz), exit: !!c.exit, tele: c.tele, ns });
  }

  light(L, noAo) {
    for (const b of this.buckets.values()) {
      const n = b.pos.length / 3; b.col = new Float32Array(n * 3);
      if (b.key.startsWith('#')) continue;
      for (let i = 0; i < n; i++) {
        const nx = b.nrm[i * 3], ny = b.nrm[i * 3 + 1], nz = b.nrm[i * 3 + 2], ins = b.ins[i];
        let x = b.pos[i * 3] + nx * .06, y = b.pos[i * 3 + 1] + ny * .06, z = b.pos[i * 3 + 2] + nz * .06;
        if (ins) { x += (ins[0] - x) * .03; z += (ins[1] - z) * .03; }
        const l = L.lightAt(x, y, z, [nx, ny, nz]);
        b.col[i * 3] = l[0]; b.col[i * 3 + 1] = l[1]; b.col[i * 3 + 2] = l[2];
      }
    }
  }

  meshes() {
    const out = [];
    for (const b of this.buckets.values()) {
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.BufferAttribute(b.col || new Float32Array(b.pos.length).fill(.5), 3));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, b.make());
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      out.push(mesh);
    }
    return out;
  }
}
