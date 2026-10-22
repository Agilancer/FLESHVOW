// Plays the mechanics of all three levels by teleporting between the important spots: keys and their ambushes,
// key doors, buttons, lifts, secret walls and hidden areas, the boss gate, the exits and the level change.
// Also lets the monsters run for a while to catch AI errors.
//   python tools/serve.py 8175 &
//   NODE_PATH=$(npm root -g) node tools/tests/play.js
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8175';
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?test&nointro`);
  await page.waitForFunction(() => window.FLESHVOW?.go && window.FLESHVOW.game.ready, null, { timeout: 60000 });
  // step the game by hand (dt 1/60) so the test does not depend on rAF
  await page.evaluate(() => {
    window.run = (secs, fn) => { for (let i = 0; i < secs * 60; i++) { fn?.(i); FLESHVOW.frame(1 / 60, false); } };
    window.G = FLESHVOW.game; window.P = () => G.player;
    window.mover = (kind, trig) => G.level.movers.find(m => m.kind === kind && (!trig || m.trig === trig || m.key === trig));
    window.fireAt = (yawDeg, pitch = 0) => { P().yaw = yawDeg * Math.PI / 180; P().pitch = pitch; FLESHVOW.input.fire = true; run(.1); FLESHVOW.input.fire = false; run(.6); };
  });
  const ev = (f, a) => page.evaluate(f, a);

  console.log('E1M1');
  let r = await ev(() => { const n = G.monsters.length; FLESHVOW.go(48.5, 10.5, 0); run(.5); return { key: P().keys.has('silver'), spawned: G.monsters.length - n }; });
  check(r.key, 'silver key picked up'); check(r.spawned === 3, `silver key ambush teleports in 3 knights (${r.spawned})`);
  r = await ev(() => { FLESHVOW.go(25.5, 12.5, 0); run(2.5); return mover('door', 'silver').state; });
  check(r === 'open', `silver door opens (${r})`);
  r = await ev(() => { FLESHVOW.go(42.5, 1.4, 0); run(2.5); return [mover('door', 'gate1').state, mover('button').state]; });
  check(r[0] !== 'closed' && r[1] === 'down', `button raises the portcullis (${r})`);
  r = await ev(() => { FLESHVOW.go(34.5, 3.5, 0); run(4); return P().pos.y; });
  check(Math.abs(r - 1) < .1, `lift carries the player up to the chapel (y ${r.toFixed(2)})`);
  r = await ev(() => { P().weapons[1] = 1; P().ammo.shells = 50; P().select(1); run(.5); FLESHVOW.go(50.5, 20.5, -90); run(.3); fireAt(-90); run(2.5); return [G.level.secretsFound, mover('secret').state]; });
  check(r[0] === 1, `shooting the ossuary wall opens a secret (${r})`);
  r = await ev(() => { FLESHVOW.go(8.5, 35.5, 0); run(.3); return G.level.secretsFound; });
  check(r === 2, `the drowned ledge counts as a secret (${r}/2)`);
  r = await ev(() => { const n = G.monsters.length; FLESHVOW.go(9.5, 6.5, 0, 0, 1.6); run(.5); return { rl: P().weapons[6], w: P().weapon, spawned: G.monsters.length - n }; });
  check(r.rl === 1 && r.w === 6, `rocket launcher picked up and selected (${JSON.stringify(r)})`);
  check(r.spawned === 4, `rocket launcher ambush (${r.spawned})`);
  // rocket jump: fire at the floor while jumping
  r = await ev(() => { FLESHVOW.go(25.5, 24.5, 0); run(.5); const y0 = P().pos.y; P().pitch = -1.5; P().ammo.rockets = 20; P().select(6); run(.6);
    let peak = y0; FLESHVOW.hold.jump = true; run(.05); FLESHVOW.input.fire = true; run(.05); FLESHVOW.input.fire = false; FLESHVOW.hold.jump = false;
    run(1.2, () => { peak = Math.max(peak, P().pos.y); }); return peak - y0; });
  check(r > 2, `rocket jump lifts the player ${r.toFixed(2)} m`);
  // let the AI run with the player standing in the great hall
  r = await ev(() => { FLESHVOW.go(25.5, 25, 0); run(20); return { awake: G.monsters.filter(m => m.state !== 'idle').length, nan: G.monsters.some(m => !isFinite(m.pos.x + m.pos.y + m.pos.z)) }; });
  check(!r.nan, `20 s of monster AI (${r.awake} awake)`);
  r = await ev(() => { FLESHVOW.go(2.5, 6.5, -90); run(.2); return G.state; });
  check(r === 'intermission', `slipgate ends the level (${r})`);
  await page.screenshot({ path: path.join(OUT, 'play_intermission.png') });
  await ev(() => G.nextLevel());
  await page.waitForFunction(() => G.ready && G.levelIndex === 1);
  r = await ev(() => ({ w: P().weapons.join(''), rockets: P().ammo.rockets, state: G.state }));
  check(r.w[6] === '1' && r.state === 'play', `E1M2 starts with the weapons carried over (${JSON.stringify(r)})`);

  console.log('E1M2');
  r = await ev(() => { G.godMode = true; const n = G.monsters.length; FLESHVOW.go(5.5, 35.5, 90); run(.5); return { key: P().keys.has('silver'), spawned: G.monsters.length - n }; });
  check(r.key && r.spawned === 3, `mausoleum key and graveyard ambush (${JSON.stringify(r)})`);
  r = await ev(() => { FLESHVOW.go(5.5, 34.5, 90); run(.3); fireAt(90); run(2.5); return G.level.secretsFound; });
  check(r === 1, `mausoleum secret wall (${r})`);
  r = await ev(() => { FLESHVOW.go(26.5, 29.5, 0); run(2.5); return mover('door', 'silver').state; });
  check(r === 'open', `cathedral doors open with the silver key (${r})`);
  r = await ev(() => { FLESHVOW.go(45.5, 9.5, -90); run(.2); FLESHVOW.go(48.5, 12.5, 180); run(1); return P().pos.y; });
  check(Math.abs(r + 3.5) < .1, `down the stair into the crypt (y ${r.toFixed(2)})`);
  r = await ev(() => { const n = G.monsters.length; FLESHVOW.go(54.5, 23.5, 0); run(.5); return { key: P().keys.has('gold'), spawned: G.monsters.length - n }; });
  check(r.key && r.spawned === 3, `crypt gold key and ambush (${JSON.stringify(r)})`);
  r = await ev(() => { FLESHVOW.go(26.5, 8.5, 0); run(2.5); return mover('door', 'gold').state; });
  check(r === 'open', `gold door behind the altar (${r})`);
  r = await ev(() => { const n = G.monsters.length; FLESHVOW.go(26.5, 5.5, 0); run(.5); return G.monsters.length - n; });
  check(r === 2, `sanctum ambush (${r})`);
  r = await ev(() => { FLESHVOW.go(26.5, 1.5, 0); run(.2); return G.state; });
  check(r === 'intermission', `E1M2 slipgate (${r})`);
  await ev(() => G.nextLevel());
  await page.waitForFunction(() => G.ready && G.levelIndex === 2);

  console.log('E1M3');
  r = await ev(() => { G.godMode = true; FLESHVOW.go(5.5, 35.5, 90); run(3); return mover('door', 'gate').state; });
  check(r !== 'closed', `the inn lever raises the gatehouse portcullis (${r})`);
  r = await ev(() => { FLESHVOW.go(31.5, 25.5, 0); run(.5); return P().pos.y; });
  check(Math.abs(r) < .1, `the drawbridge holds the player over the lava (y ${r.toFixed(2)})`);
  r = await ev(() => { FLESHVOW.go(10.5, 20.5, 0); run(4.5); return P().pos.y; });
  check(Math.abs(r - 3) < .1, `courtyard lift up to the rampart (y ${r.toFixed(2)})`);
  r = await ev(() => { FLESHVOW.go(8.5, 14.5, 90); run(.3); fireAt(90); run(2.5); return G.level.secretsFound; });
  check(r >= 1, `rampart secret wall (${r})`);
  r = await ev(() => { const n = G.monsters.length; FLESHVOW.go(54.5, 8.5, 0); run(.5); return { key: P().keys.has('gold'), spawned: G.monsters.length - n }; });
  check(r.key && r.spawned === 3, `rampart gold key and fiend ambush (${JSON.stringify(r)})`);
  r = await ev(() => { FLESHVOW.go(31.5, 8.5, 0); run(2.5); return mover('door', 'gold').state; });
  check(r === 'open', `great hall gold door (${r})`);
  r = await ev(() => { const b = G.monsters.find(m => m.type === 'shambler'); G.damage(b, 2000, P(), b.pos.clone().setY(b.pos.y + 3), 'shot'); run(3); return [b.state, mover('door', 'boss').state]; });
  check(r[0] === 'dead' && r[1] !== 'closed', `the Shambler's death opens the last gate (${r})`);
  r = await ev(() => { FLESHVOW.go(16.5, 3.5, 90); run(.2); return G.state; });
  check(r === 'intermission', `final slipgate (${r})`);
  r = await ev(() => { run(4); return G.state; });
  check(r === 'finale', `the end screen (${r})`);
  await page.screenshot({ path: path.join(OUT, 'play_finale.png') });

  const errs = [...new Set(errors)].filter(e => !e.includes('pointer lock'));
  check(!errs.length, `no page errors${errs.length ? ':\n   ' + errs.slice(0, 6).join('\n   ') : ''}`);
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
