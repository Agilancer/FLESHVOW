// Life and mana bars, pickup prompt, toasts, wave banner, kill count, hurt vignette, blood on the lens, death screen.
export class Hud {
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = `<div class="bar life"><i></i><span></span></div><div class="bar mana"><i></i><span></span></div>
      <div id="prompt"></div><div id="toast"></div><div id="wave"></div><div id="kills"></div>
      <div id="hurt"></div><div id="lens"></div>
      <div id="dead"><h1>You Have Perished</h1><p>Click to rise again</p></div>`;
    document.body.appendChild(el);
    this.$ = s => el.querySelector(s);
    this.hurtA = 0; this.lensA = 0;
  }

  bars(life, maxLife, mana, maxMana) {
    this.$('.life i').style.width = Math.max(0, life / maxLife * 100) + '%';
    this.$('.life span').textContent = `${Math.ceil(Math.max(0, life))} / ${maxLife}`;
    this.$('.mana i').style.width = Math.max(0, mana / maxMana * 100) + '%';
    this.$('.mana span').textContent = `${Math.floor(mana)} / ${maxMana}`;
    this.$('.life').classList.toggle('low', life / maxLife < 0.3);
  }

  prompt(t) { const p = this.$('#prompt'); if (p.textContent !== (t || '')) p.innerHTML = t || ''; p.style.opacity = t ? 1 : 0; }

  toast(t, ms = 3200) {
    const d = document.createElement('div');
    d.innerHTML = t;
    this.$('#toast').appendChild(d);
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 800);
  }

  wave(t) {
    const w = this.$('#wave');
    w.textContent = t; w.classList.remove('show'); void w.offsetWidth; w.classList.add('show');
  }

  kills(n) { this.$('#kills').textContent = n ? `${n} laid to rest` : ''; }

  hurt(a) { this.hurtA = Math.min(1, this.hurtA + a); }

  lens() {  // blood on the camera
    const l = this.$('#lens');
    for (let i = 0; i < 6; i++) {
      const b = document.createElement('i'), s = 30 + Math.random() * 120, edge = Math.random() < 0.5;
      b.style.cssText = `left:${edge ? (Math.random() < 0.5 ? -5 + Math.random() * 18 : 82 + Math.random() * 18) : Math.random() * 100}%;top:${Math.random() * 100}%;width:${s}px;height:${s * (0.7 + Math.random() * 0.6)}px`;
      l.appendChild(b);
    }
    while (l.children.length > 24) l.firstChild.remove();
    this.lensA = 1;
  }

  update(dt) {
    this.hurtA = Math.max(0, this.hurtA - dt * 1.4);
    this.$('#hurt').style.opacity = this.hurtA;
    this.lensA = Math.max(0, this.lensA - dt * 0.35);
    this.$('#lens').style.opacity = this.lensA;
    if (this.lensA === 0 && this.$('#lens').children.length) this.$('#lens').innerHTML = '';
  }

  dead(on) { this.$('#dead').classList.toggle('show', on); }
}
