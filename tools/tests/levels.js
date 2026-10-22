// Loads every level headless, checks for errors, solves each map (can the player reach the keys, weapons and the
// exit using steps, jumps, drops, swimming, lifts, keys, buttons and secrets?) and saves screenshots.
//   python tools/serve.py 8175 &
//   NODE_PATH=$(npm root -g) node tools/tests/levels.js [levels] [x,z,yaw,pitch;...]
// Screenshots go to tools/tests/out/ (git-ignored).
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8175';
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

const solve = () => {
  const G = window.FLESHVOW.game, L = G.level, W = L.w, H = L.h;
  const walk = (c) => (c.box && !c.box.inset && c.box.y1 < c.c - 1.6 && c.box.y1 > c.f) ? c.box.y1 : c.f;
  const start = L.ents.find(e => e.player);
  const keys = new Set(), trigs = new Set(), seen = new Set([start.z * W + start.x]);
  const reachAll = () => {
    const q = [...seen];
    while (q.length) {
      const k = q.pop(), x = k % W, z = (k / W) | 0, a = L.cells[k];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (z + dz) * W + x + dx, b = L.cells[nk];
        if (!b || seen.has(nk)) continue;
        let ok = false;
        if (b.button) { trigs.add(b.button); continue; }
        if (b.solid) continue;
        if (b.door && b.key && !keys.has(b.key)) continue;
        if (b.door && b.trig && !trigs.has(b.trig)) continue;
        const af = walk(a), bf = walk(b);
        const aTop = a.plat !== undefined ? a.plat : af, bTop = b.plat !== undefined ? b.plat : bf;
        const swimA = a.liquid ? Math.max(af, (a.lh ?? af) - .4) : af;
        const from = Math.max(af, aTop, swimA);
        if (Math.min(a.c, b.c) - Math.max(af, bf) < 1.8 && !(a.liquid || b.liquid)) continue;
        if (Math.min(bf, bTop) - from <= 1.2 || (b.liquid && (b.lh ?? bf) - from <= 1.2)) ok = true;
        if (b.secret) ok = true;
        if (ok) { seen.add(nk); q.push(nk); }
      }
    }
  };
  for (let it = 0; it < 12; it++) {
    const before = seen.size + keys.size + trigs.size;
    reachAll();
    for (const e of L.ents) if (seen.has(e.z * W + e.x)) {
      if (e.item === 'key_silver') keys.add('silver');
      if (e.item === 'key_gold') { keys.add('gold'); }
      if (e.monster && e.boss) trigs.add('boss');
    }
    for (const c of L.cells) if (c.trig && !c.door) trigs.add(c.trig);
    if (seen.size + keys.size + trigs.size === before) break;
  }
  const unreached = L.ents.filter(e => (e.item || e.monster) && !seen.has(e.z * W + e.x)).map(e => `${e.item || e.monster}@${e.x},${e.z}`);
  const exit = (L.gates || []).filter(g => g.exit).some(g => seen.has(g.z * W + g.x));
  return { exit, keys: [...keys], trigs: [...trigs], reached: seen.size, unreached, monsters: G.monsters.length, items: G.items.length, secrets: L.secrets };
};

(async () => {
  const which = (process.argv[2] || '1,2,3').split(',').map(Number);
  const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '').split(' ').filter(Boolean) });
  let bad = 0;
  for (const n of which) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(`${BASE}/?test&nointro&level=${n}`);
    try { await page.waitForFunction(() => window.FLESHVOW?.go && window.FLESHVOW.game.ready, null, { timeout: 60000 }); }
    catch (e) { console.log(`E1M${n}: did not load: ${await page.$eval('#status', el => el.textContent)}\n  ${errors.join('\n  ')}`); bad++; await page.close(); continue; }
    const load = Date.now() - t0;
    const r = await page.evaluate(solve);
    console.log(`E1M${n}: load ${load} ms, ${r.monsters} monsters, ${r.items} items, ${r.secrets} secrets, cells reached ${r.reached}, keys ${r.keys}, triggers ${r.trigs}`);
    console.log(`  exit reachable: ${r.exit}${r.unreached.length ? '\n  unreached: ' + r.unreached.join(' ') : ''}`);
    if (!r.exit) bad++;
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `e1m${n}_start.png`) });
    const spots = (process.argv[3] || '').split(';').filter(Boolean);
    for (const [i, s] of spots.entries()) {
      const [x, z, yaw, pitch] = s.split(',').map(Number);
      await page.evaluate(([x, z, yaw, pitch]) => FLESHVOW.go(x, z, yaw, pitch), [x, z, yaw, pitch || 0]);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `e1m${n}_spot${i}.png`) });
    }
    if (errors.length) { bad++; console.log('  errors:\n   ' + [...new Set(errors)].slice(0, 8).join('\n   ')); }
    await page.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
