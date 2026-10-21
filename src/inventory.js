// Crude inventory: a paper doll of equipment slots, a 40-cell pack, hover tooltips with stats. Click to equip/unequip.
import { RARITY, iconFor } from './items.js';

const SLOTS = [  // id, label, x, y, w, h on the doll
  ['helmet', 'Helmet', 150, 8, 80, 72], ['earL', 'Earring', 100, 26, 40, 40], ['earR', 'Earring', 240, 26, 40, 40],
  ['necklace', 'Necklace', 170, 90, 40, 40], ['right', 'Right Hand', 14, 96, 86, 170], ['left', 'Left Hand', 280, 96, 86, 170],
  ['armor', 'Armor', 145, 138, 90, 118], ['ring1', 'Ring', 106, 216, 34, 34], ['ring2', 'Ring', 106, 258, 34, 34],
  ['ring3', 'Ring', 240, 216, 34, 34], ['ring4', 'Ring', 240, 258, 34, 34], ['gauntlets', 'Gauntlets', 14, 280, 86, 72],
  ['pants', 'Pants', 145, 264, 90, 84], ['boots', 'Boots', 280, 280, 86, 72],
];
const BAG = 40;

export class Inventory {
  constructor(renderer, env, onChange) {
    this.renderer = renderer; this.env = env; this.onChange = onChange;
    this.bag = Array(BAG).fill(null); this.equip = {}; this.isOpen = false;
    const el = this.el = document.createElement('div');
    el.id = 'inv'; el.className = 'hidden';
    el.innerHTML = `<div class="inv-panel"><header><h2>Inventory</h2><button class="inv-close" title="Close">&times;</button></header>
      <div class="inv-body"><div class="doll">${SLOTS.map(([id, label, x, y, w, h]) =>
        `<div class="slot" data-slot="${id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><span>${label}</span></div>`).join('')}</div>
      <div class="pack"><div class="bag">${Array.from({ length: BAG }, (_, i) => `<div class="cell" data-bag="${i}"></div>`).join('')}</div>
      <div class="inv-stats"></div></div></div>
      <p class="inv-hint">Click an item to equip or unequip it &middot; I or Tab to close</p></div><div id="tip"></div>`;
    document.body.appendChild(el);
    this.tip = el.querySelector('#tip');
    el.addEventListener('click', e => {
      const s = e.target.closest('[data-slot]'), b = e.target.closest('[data-bag]');
      if (s && this.equip[s.dataset.slot]) this.unequip(s.dataset.slot);
      else if (b && this.bag[+b.dataset.bag]) this.wear(+b.dataset.bag);
      else return;
      this.showTip(e);
    });
    el.addEventListener('mousemove', e => this.showTip(e));
    el.addEventListener('mouseleave', () => { this.tip.style.display = 'none'; });
    this.closeBtn = el.querySelector('.inv-close');
  }

  itemAt(t) {
    const s = t.closest('[data-slot]'), b = t.closest('[data-bag]');
    return s ? this.equip[s.dataset.slot] : b ? this.bag[+b.dataset.bag] : null;
  }

  showTip(e) {
    const it = this.itemAt(e.target);
    if (!it) { this.tip.style.display = 'none'; return; }
    const worn = Object.values(this.equip).includes(it);
    this.tip.innerHTML = `<b style="color:${RARITY[it.rarity]}">${it.name}</b><i style="color:${RARITY[it.rarity]}">${it.base}</i>
      ${it.stats.map(s => `<div>${s}</div>`).join('')}<div class="mods">${it.mods.map(s => `<div>${s}</div>`).join('')}</div>
      <p class="flavor">${it.flavor}</p><p class="act">${worn ? 'Click to unequip' : 'Click to equip'}</p>`;
    this.tip.style.display = 'block';
    const r = this.tip.getBoundingClientRect();
    this.tip.style.left = Math.min(innerWidth - r.width - 8, e.clientX + 18) + 'px';
    this.tip.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, e.clientY - r.height / 2)) + 'px';
  }

  add(item) {
    const i = this.bag.indexOf(null);
    if (i < 0) return false;
    this.bag[i] = item;
    this.render();
    return true;
  }

  wear(i) {
    const it = this.bag[i], old = this.equip[it.slot] || null;
    this.equip[it.slot] = it; this.bag[i] = old;
    this.render(); this.onChange();
  }

  unequip(slot) {
    const i = this.bag.indexOf(null);
    if (i < 0) return;
    this.bag[i] = this.equip[slot]; delete this.equip[slot];
    this.render(); this.onChange();
  }

  render() {
    const icon = it => `<img src="${iconFor(it, this.renderer, this.env)}" alt="${it.name}" draggable="false">`;
    for (const [id] of SLOTS) {
      const s = this.el.querySelector(`[data-slot="${id}"]`), it = this.equip[id];
      s.classList.toggle('full', !!it);
      s.querySelector('img')?.remove();
      if (it) s.insertAdjacentHTML('beforeend', icon(it));
    }
    this.bag.forEach((it, i) => {
      const c = this.el.querySelector(`[data-bag="${i}"]`);
      c.innerHTML = it ? icon(it) : '';
      c.style.borderColor = it ? RARITY[it.rarity] + '88' : '';
    });
    const w = this.equip.right, life = Object.values(this.equip).reduce((a, it) => a + (it.life || 0), 0);
    this.el.querySelector('.inv-stats').innerHTML = `<div>Damage <b>${w ? w.dmg.join(' - ') : '2 - 4'}</b></div>
      <div>Bonus Life <b>+${life}</b></div><div>Block <b>${this.equip.left ? 'Frontal, raised' : 'None'}</b></div>`;
  }

  toggle(on = !this.isOpen) {
    this.isOpen = on;
    this.el.classList.toggle('hidden', !on);
    if (on) this.render(); else this.tip.style.display = 'none';
  }
}
