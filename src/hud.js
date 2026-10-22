// The status bar, drawn like Quake's sbar: a riveted bronze strip with chunky numbers, the face, ammo and weapons.
import { WEAPONS } from './weapons.js';

const DIGITS = {   // 5 x 7 block glyphs
  0: ['01110', '11011', '11011', '11011', '11011', '11011', '01110'], 1: ['00110', '01110', '00110', '00110', '00110', '00110', '01111'],
  2: ['01110', '11011', '00011', '00110', '01100', '11000', '11111'], 3: ['11110', '00011', '00011', '01110', '00011', '00011', '11110'],
  4: ['00110', '01110', '11010', '11010', '11111', '00010', '00010'], 5: ['11111', '11000', '11110', '00011', '00011', '11011', '01110'],
  6: ['01110', '11000', '11110', '11011', '11011', '11011', '01110'], 7: ['11111', '00011', '00110', '00110', '01100', '01100', '01100'],
  8: ['01110', '11011', '11011', '01110', '11011', '11011', '01110'], 9: ['01110', '11011', '11011', '01111', '00011', '00011', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
};

export class HUD {
  constructor(canvas) {
    this.c = canvas; this.x = canvas.getContext('2d');
    this.bg = new Image(); this.bg.src = 'assets/textures/cw_rust_up.png';
    this.visible = false; this.alpha = 0;
  }
  resize(w, h) {
    this.c.width = w; this.c.height = h; this.x.imageSmoothingEnabled = false;
    this.s = Math.max(1, Math.floor(h / 330));
    if (w < 700) this.s = Math.max(1, Math.floor(w / 340));
  }

  digit(ch, x, y, s, warn) {
    const g = DIGITS[ch]; if (!g) return;
    const X = this.x, bw = 4 * s, bh = 3 * s;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (g[r][c] !== '1') continue;
      const px = x + 2 * s + c * bw, py = y + 2 * s + r * bh;
      X.fillStyle = warn ? '#a01808' : '#7a3a14'; X.fillRect(px, py, bw, bh);
      X.fillStyle = warn ? '#f05030' : '#c47a3a'; X.fillRect(px, py, bw - s, s);
      X.fillStyle = warn ? '#ff8060' : '#e0a060'; X.fillRect(px, py, s, s);
      X.fillStyle = '#2a1006'; X.fillRect(px, py + bh - s, bw, s);
    }
  }
  num(n, x, y, s, warn) {
    const str = String(Math.max(-99, Math.min(999, Math.floor(n)))).padStart(3, ' ');
    for (let i = 0; i < 3; i++) this.digit(str[i], x + i * 24 * s, y, s, warn);
  }

  face(P, x, y, s, t) {
    const X = this.x, px = (a, b, w, h, c) => { X.fillStyle = c; X.fillRect(x + a * s, y + b * s, w * s, h * s); };
    if (P.dead) { px(4, 3, 16, 18, '#d8cfb8'); px(7, 9, 4, 4, '#000'); px(13, 9, 4, 4, '#000'); px(10, 14, 4, 2, '#000'); px(6, 17, 12, 3, '#000'); return; }
    const hurt = P.health >= 80 ? 0 : P.health >= 60 ? 1 : P.health >= 40 ? 2 : P.health >= 20 ? 3 : 4;
    const look = P.painFace > 0 ? (Math.floor(t * 20) % 2 ? 1 : -1) : Math.sin(t * .7) > .85 ? 1 : Math.sin(t * .7) < -.85 ? -1 : 0;
    px(3, 1, 18, 8, '#4a5232'); px(2, 6, 20, 3, '#3a4026');   // helmet
    px(5, 8, 14, 13, '#c08a68'); px(5, 18, 14, 3, '#9a6a4c');   // face
    const eye = P.quad > this.now ? '#60a0ff' : '#1a0c08';
    px(7 + look, 11, 3, 2, eye); px(14 + look, 11, 3, 2, eye);
    px(9, 16, 6, 1, '#5a2a18');
    const blood = '#9a0c08';
    if (hurt >= 1) px(15, 9, 3, 2, blood);
    if (hurt >= 2) { px(6, 14, 3, 4, blood); px(16, 15, 2, 4, blood); }
    if (hurt >= 3) { px(9, 8, 6, 2, blood); px(12, 18, 5, 3, blood); px(5, 10, 2, 5, blood); }
    if (hurt >= 4) { px(7, 11, 3, 2, '#600'); px(13, 13, 6, 6, blood); px(6, 19, 6, 2, blood); }
    if (P.painFace > 0) px(9, 15, 6, 3, '#3a0a04');
  }

  icon(kind, x, y, s) {
    const X = this.x, px = (a, b, w, h, c) => { X.fillStyle = c; X.fillRect(x + a * s, y + b * s, w * s, h * s); };
    switch (kind) {
      case 'armor_green': case 'armor_yellow': case 'armor_red': case 'armor_none': {
        const c = { armor_green: '#3a7a20', armor_yellow: '#c49c20', armor_red: '#b02818', armor_none: '#3a3026' }[kind];
        px(4, 3, 16, 18, c); px(2, 3, 5, 6, c); px(17, 3, 5, 6, c); px(9, 3, 6, 4, '#1a1008'); px(6, 9, 12, 2, 'rgba(255,255,255,.25)'); break;
      }
      case 'shells': px(4, 6, 4, 14, '#a02818'); px(10, 6, 4, 14, '#a02818'); px(16, 6, 4, 14, '#a02818'); px(4, 16, 16, 4, '#c8a050'); break;
      case 'nails': for (let i = 0; i < 4; i++) { px(5 + i * 4, 4, 2, 14, '#b06838'); px(4 + i * 4, 4, 4, 2, '#d09050'); } break;
      case 'rockets': px(7, 6, 10, 14, '#a07438'); px(9, 2, 6, 4, '#b02818'); px(6, 18, 12, 3, '#3a2a18'); break;
      case 'cells': px(5, 4, 14, 17, '#4a4a52'); px(8, 7, 8, 11, '#80c0ff'); px(9, 2, 6, 2, '#888'); break;
      case 'axe': px(4, 10, 16, 2, '#7a5636'); px(4, 6, 4, 10, '#999'); break;
    }
  }

  weaponIcon(i, x, y, s, col) {
    const X = this.x; X.fillStyle = col;
    const r = (a, b, w, h) => X.fillRect(x + a * s, y + b * s, w * s, h * s);
    switch (i) {
      case 1: r(2, 5, 16, 2); r(14, 6, 6, 3); break;
      case 2: r(2, 4, 16, 2); r(2, 7, 16, 2); r(14, 5, 6, 4); break;
      case 3: r(4, 4, 10, 4); r(14, 5, 6, 3); r(10, 8, 3, 3); break;
      case 4: r(2, 3, 12, 6); r(14, 4, 6, 4); r(10, 9, 3, 2); break;
      case 5: r(4, 3, 7, 7); r(11, 5, 9, 3); break;
      case 6: r(1, 3, 17, 5); r(18, 4, 2, 3); r(6, 8, 2, 3); r(12, 8, 2, 3); break;
      case 7: r(4, 4, 11, 4); r(15, 5, 5, 2); for (let k = 0; k < 3; k++) r(6 + k * 3, 3, 1, 6); break;
    }
  }

  draw(G, t) {
    const X = this.x, W = this.c.width, H = this.c.height, s = this.s;
    X.clearRect(0, 0, W, H);
    this.now = G.time;
    const P = G.player;
    if (!P) return;
    if (G.state === 'play' && !P.dead && G.showCross) {   // small crosshair
      X.fillStyle = 'rgba(220,200,160,.7)'; const cx = W / 2 | 0, cy = H / 2 | 0, k = Math.max(1, s);
      X.fillRect(cx - 4 * k, cy, 3 * k, k); X.fillRect(cx + 2 * k, cy, 3 * k, k); X.fillRect(cx, cy - 4 * k, k, 3 * k); X.fillRect(cx, cy + 2 * k, k, 3 * k);
    }
    this.alpha += ((this.visible ? 1 : 0) - this.alpha) * .08;
    if (this.alpha < .02) return;
    X.globalAlpha = this.alpha;
    const bw = 320 * s, bx = (W - bw) / 2 | 0, by = H - 48 * s + Math.round((1 - this.alpha) * 48 * s);
    // background: the riveted catacomb plate, darkened, with bevels
    if (this.bg.complete && this.bg.width) {
      for (let yy = 0; yy < 48 * s; yy += this.bg.height * s / 2) for (let xx = 0; xx < bw; xx += this.bg.width * s / 2)
        X.drawImage(this.bg, bx + xx, by + yy, this.bg.width * s / 2, this.bg.height * s / 2);
      X.fillStyle = 'rgba(30,14,4,.55)'; X.fillRect(bx, by, bw, 48 * s);
    } else { X.fillStyle = '#3a2412'; X.fillRect(bx, by, bw, 48 * s); }
    X.fillStyle = '#c08048'; X.fillRect(bx, by, bw, s); X.fillStyle = '#120804'; X.fillRect(bx, by + 24 * s - s, bw, s);
    X.fillStyle = 'rgba(0,0,0,.35)'; X.fillRect(bx, by, bw, 24 * s);
    // inventory row: ammo counts and weapons
    X.font = `${6 * s}px 'Press Start 2P', monospace`; X.textBaseline = 'top';
    const ammoK = ['shells', 'nails', 'rockets', 'cells'];
    for (let k = 0; k < 4; k++) {
      const v = P.ammo[ammoK[k]];
      X.fillStyle = '#b89060'; X.fillText(ammoK[k][0].toUpperCase(), bx + (4 + k * 48) * s, by + 3 * s);
      X.fillStyle = v ? '#f0d8a0' : '#6a5038'; X.fillText(String(v).padStart(3, ' '), bx + (12 + k * 48) * s, by + 3 * s);
    }
    for (let i = 1; i < 8; i++) {
      const own = P.weapons[i], sel = P.weapon === i;
      const wx = bx + (2 + (i - 1) * 27) * s, wy = by + 11 * s;
      if (sel) { X.fillStyle = 'rgba(255,200,90,.25)'; X.fillRect(wx - s, wy - s, 24 * s, 12 * s); }
      this.weaponIcon(i, wx, wy - s, s * .55, own ? (sel ? '#ffe090' : '#c08a48') : '#3a2a1c');
      X.fillStyle = own ? (sel ? '#ffe090' : '#a07040') : '#3a2a1c'; X.font = `${4 * s}px 'Press Start 2P', monospace`; X.fillText(String(i + 1), wx + 16 * s, wy + 5 * s);
    }
    // keys and powerups
    if (P.keys.has('silver')) { X.fillStyle = '#d0d8e8'; X.fillRect(bx + 200 * s, by + 4 * s, 6 * s, 6 * s); X.fillRect(bx + 202 * s, by + 10 * s, 2 * s, 9 * s); }
    if (P.keys.has('gold')) { X.fillStyle = '#ffcc30'; X.fillRect(bx + 212 * s, by + 4 * s, 6 * s, 6 * s); X.fillRect(bx + 214 * s, by + 10 * s, 2 * s, 9 * s); }
    if (P.quad > G.time) { X.fillStyle = '#4060ff'; X.fillRect(bx + 226 * s, by + 5 * s, 12 * s, 12 * s); X.fillStyle = '#c0d0ff'; X.font = `${5 * s}px 'Press Start 2P', monospace`; X.fillText(String(Math.ceil(P.quad - G.time)), bx + 242 * s, by + 8 * s); }
    X.fillStyle = '#d0b080'; X.font = `${5 * s}px 'Press Start 2P', monospace`;
    X.fillText(`${G.kills}/${G.totalKills}`, bx + 262 * s, by + 4 * s);
    X.fillText(`${G.level.secretsFound}/${G.level.secrets}`, bx + 262 * s, by + 13 * s);
    // main row
    const my = by + 24 * s;
    this.icon(P.armorType >= .8 ? 'armor_red' : P.armorType >= .6 ? 'armor_yellow' : P.armorType > 0 ? 'armor_green' : 'armor_none', bx, my, s);
    this.num(P.armor, bx + 24 * s, my, s, false);
    this.face(P, bx + 112 * s, my, s, t);
    this.num(P.health, bx + 136 * s, my, s, P.health <= 25);
    const W8 = WEAPONS[P.weapon];
    if (W8.ammo) { this.icon(W8.ammo, bx + 224 * s, my, s); this.num(P.ammo[W8.ammo], bx + 248 * s, my, s, P.ammo[W8.ammo] <= 5); }
    else this.icon('axe', bx + 224 * s, my, s);
    X.globalAlpha = 1;
    if (P.waterLevel === 3 && P.air < 8) { X.fillStyle = '#9ad'; X.font = `${6 * s}px 'Press Start 2P', monospace`; X.fillText('AIR ' + Math.max(0, Math.ceil(P.air)), W / 2 - 24 * s, by - 14 * s); }
  }
}
