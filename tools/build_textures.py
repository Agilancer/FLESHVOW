"""Cut the VELSCOUR biome packs into Quake-style textures and skins.

  python tools/build_textures.py "F:/!  VELSCOUR/AI ASSETS/Biome Packs"

The packs (Catacombs, Cathedral_Graveyard, Overworld_Town; extracted next to their zips) stay outside the repo.
Every texture is resampled to ~64 texels per metre and mapped to ONE shared 256-colour palette without dithering,
like Quake's palette.lmp: 224 colours fitted to the art plus 32 fullbright fire/glow colours. Monster and weapon
skins are pack textures gradient-mapped to new materials (flesh, fur, bronze, ...). Liquids, sky clouds and the
slipgate swirl are generated. Writes assets/textures/*.png and assets/textures/manifest.json. Needs pillow, numpy.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'textures')
rng = np.random.default_rng(1996)


def load(p):
  return Image.open(p).convert('RGBA')


def grid_cells(path, cols, rows, inset=8):
  """Split a contact sheet into cells, snapping each cut to the darkest line near the even split."""
  im = load(path); g = np.asarray(im.convert('L'), float)
  def cuts(n, prof):
    out = [0]
    for k in range(1, n):
      e = round(k * len(prof) / n); lo, hi = max(0, e - 14), min(len(prof), e + 15)
      out.append(lo + int(np.argmin(prof[lo:hi])))
    return out + [len(prof)]
  xs, ys = cuts(cols, g.mean(0)), cuts(rows, g.mean(1))
  return [[im.crop((xs[c] + inset, ys[r] + inset, xs[c + 1] - inset, ys[r + 1] - inset)) for c in range(cols)] for r in range(rows)]


def tileable(im, axis_x=True, axis_y=False, frac=0.12):
  """Cross-fade opposite edges so the texture repeats without a seam."""
  a = np.asarray(im, float)
  for ax, on in ((1, axis_x), (0, axis_y)):
    if not on: continue
    n = a.shape[ax]; b = max(2, int(n * frac))
    a = np.moveaxis(a, ax, 0).copy()
    for i in range(b):
      t = 0.5 * (1 - i / b)  # 0.5 at the edge, fading to 0
      lo, hi = a[i].copy(), a[n - 1 - i].copy()
      a[i] = lo * (1 - t) + hi * t; a[n - 1 - i] = hi * (1 - t) + lo * t
    a = np.moveaxis(a, 0, ax)
  return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), im.mode)


def lum(im):
  a = np.asarray(im.convert('RGB'), float) / 255
  l = a @ [0.3, 0.55, 0.15]
  lo, hi = np.percentile(l, 2), np.percentile(l, 98)
  return np.clip((l - lo) / max(1e-3, hi - lo), 0, 1)


def gradmap(im, stops, noise=0.0, contrast=1.0):
  """Recolour a texture by its luminance through a colour ramp: the 'cut and paste' skin maker."""
  l = 0.5 + (lum(im) - 0.5) * contrast
  if noise: l = np.clip(l + rng.normal(0, noise, l.shape), 0, 1)
  pos = np.array([s[0] for s in stops]); cols = np.array([s[1] for s in stops], float)
  out = np.stack([np.interp(l, pos, cols[:, c]) for c in range(3)], -1)
  return Image.fromarray(out.astype(np.uint8), 'RGB').convert('RGBA')


def hexc(h):
  return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def ramp(*hs):
  n = len(hs) - 1
  return [(i / n, hexc(h)) for i, h in enumerate(hs)]


def fbm(n, octaves=5, seed=0, period=True):
  """Tileable value noise in [0,1]."""
  r = np.random.default_rng(seed); acc = np.zeros((n, n)); amp, tot = 1.0, 0.0
  for o in range(octaves):
    f = 4 * 2 ** o; g = r.random((f, f))
    x = np.arange(n) * f / n; i0 = np.floor(x).astype(int); t = x - i0; t = t * t * (3 - 2 * t)
    i1 = (i0 + 1) % f
    a = g[i0][:, i0] * (1 - t)[None] + g[i0][:, i1] * t[None]
    b = g[i1][:, i0] * (1 - t)[None] + g[i1][:, i1] * t[None]
    acc += amp * (a * (1 - t)[:, None] + b * t[:, None]); tot += amp; amp *= 0.5
  acc /= tot
  return (acc - acc.min()) / (acc.max() - acc.min())


def from_array(a):
  return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def crop_alpha(im, pad=1):
  bb = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
  if not bb: return im
  return im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad)))


def fit(im, w, h=None):
  h = h or round(im.height * w / im.width)
  return im.resize((w, h), Image.LANCZOS)


# ---------------------------------------------------------------- inventory
TEX = {}   # name -> (image, meta)


def add(name, im, **meta):
  TEX[name] = (im, meta)


def build(packs):
  C = os.path.join(packs, 'Catacombs_Biome_Pack'); K = os.path.join(packs, 'Cathedral_Graveyard_Biome_Pack')
  T = os.path.join(packs, 'Overworld_Town_Biome_Pack')

  # walls: front row and reverse row of each material sheet. World size 2 x 3 m at 64 px/m.
  walls = [
    (C + '/source_art/wall_materials.png', 5, 'c', ['ashlar', 'ossuary', 'chapel', 'grate', 'drowned'], ['ashlar2', 'slit', 'niche', 'rust', 'drowned2']),
    (K + '/source_art/wall_materials.png', 5, 'k', ['arcade', 'glass', 'pillar', 'moss', 'fence'], ['arcade2', 'lead', 'pillar2', 'moss2', 'fence2']),
    (T + '/source_art/building_walls.png', 6, 't', ['timber', 'planks', 'rubble', 'sandstone', 'brick', 'wattle'], ['timber2', 'planks2', 'rubble2', 'sandstone2', 'brick2', 'wattle2'])]
  for path, n, pre, front, back in walls:
    cells = grid_cells(path, n, 2, inset=7)
    for row, names in ((0, front), (1, back)):
      for c, nm in enumerate(names):
        im = tileable(fit(cells[row][c], 128, 192), True, False, 0.1)
        add(f'{pre}w_{nm}', im, kind='wall', size=[2, 3])
        # upper course: the middle of the panel, made to repeat vertically (used above the first 3 m)
        mid = cells[row][c]; m = mid.crop((0, int(mid.height * 0.22), mid.width, int(mid.height * 0.78)))
        add(f'{pre}w_{nm}_up', tileable(fit(m, 128, 128), True, True, 0.12), kind='wall', size=[2, 2])

  # floors: 60 per pack, 2 x 2 m
  for d, pre, pat in ((C, 'c', '/source_art/floor_uv_%02d.png'), (K, 'k', '/source_art/floor_uv_%02d.png'),
                      (T, 't', '/source_art/normalized/floor_%02d.png')):
    for i in range(1, 61):
      p = d + pat % i
      if os.path.exists(p): add(f'{pre}f_{i:02d}', fit(load(p), 128, 128), kind='floor', size=[2, 2])

  # doors (2 m wide, 3.5 m leaf) keep their native 64 x 112: Quake density already
  for d, pre, n, sub in ((C, 'c', 3, ''), (K, 'k', 3, ''), (T, 't', 5, 'normalized/')):
    for i in range(1, n + 1):
      for side in ('front', 'back'):
        add(f'{pre}door_{i}_{side}', load(f'{d}/source_art/{sub}door_{i}_{side}.png'), kind='door', size=[2, 3.5])
  # arches and gateways, alpha cut-outs
  for d, pre, n, nm in ((C, 'c', 3, 'arch'), (K, 'k', 6, 'arch'), (T, 't', 3, 'gateway')):
    for i in range(1, n + 1):
      sub = 'normalized/' if pre == 't' else ''
      im = load(f'{d}/source_art/{sub}{nm}_{i}_front.png'); add(f'{pre}arch_{i}', im, kind='sprite', alpha=True)
  # wall torches (front views) and set-dressing sprites
  for i in range(1, 9):
    add(f'torch_{i}', crop_alpha(load(f'{T}/source_art/normalized/torch_{i:02d}.png')), kind='sprite', alpha=True)
  props = {
    C: ['04_skull_pyramid', '05_long_bone_heap', '10_grave_lantern', '11_vigil_candles', '12_iron_candelabrum',
        '15_kneeling_mourner', '16_headless_angel', '18_column_stump', '25_incense_brazier', '26_torch_stand',
        '32_funerary_obelisk', '36_funerary_bell', '07_ossuary_urn', '06_supine_skeleton'],
    K: ['01_celtic_cross', '02_rounded_headstone', '03_gothic_marker', '04_broken_headstone', '05_squat_cross',
        '11_hooded_mourner', '12_mourning_angel', '13_funerary_obelisk', '15_grave_lantern', '25_iron_candelabrum',
        '30_saint_statue', '36_dead_shrub', '28_pipe_organ', '35_church_bell', '24_baptismal_font', '21_cathedral_altar']}
  for d, names in props.items():
    pre = 'c' if d == C else 'k'
    for n in names:
      im = crop_alpha(load(f'{d}/sprites/scatter/scatter_{n}.png'))
      add(f'{pre}p_{n[3:]}', im, kind='sprite', alpha=True)
  for f in sorted(os.listdir(T + '/sprites/trees')):
    im = crop_alpha(load(T + '/sprites/trees/' + f)); im = fit(im, min(im.width, 192))
    add('tree_' + f[5:7], im, kind='sprite', alpha=True)

  # ---- skins: gradient-mapped pack textures
  src = lambda n: TEX[n][0]
  plate = TEX['kdoor_2_back'][0].crop((8, 8, 56, 48))       # riveted metal plate, above the latch
  planks = TEX['tf_52'][0]                                    # plank floor
  TEX['_plate'] = (plate, {}); TEX['_planks'] = (planks, {})
  skins = {
    'skin_flesh': ('tf_23', ramp('#2a0d0a', '#6e2a20', '#a9584a', '#d79a84', '#f0c8b0')),
    'skin_rotflesh': ('tf_29', ramp('#121208', '#3a3a1c', '#6b6a3a', '#9c8f5c', '#c8b98a')),
    'skin_ogre': ('kf_08', ramp('#1e140c', '#4f3524', '#86603e', '#b08a5f', '#d6b58a')),
    'skin_fur': ('tf_11', ramp('#0c0806', '#2a1c12', '#4a3220', '#7a5636', '#a07a52')),
    'skin_whitefur': ('tf_13', ramp('#3a3630', '#7a7266', '#b2a998', '#d8d0bf', '#f2ecdf')),
    'skin_scales': ('tf_22', ramp('#0e0a06', '#3a2c18', '#6a5428', '#8e7a3c', '#b8a066')),
    'skin_fatigues': ('tf_16', ramp('#141810', '#2c3420', '#4a5232', '#6c704a', '#8e8a62')),
    'skin_armor_blue': ('_plate', ramp('#0a0e18', '#1c2a44', '#34507a', '#5c7ca8', '#9ab4d4')),
    'skin_iron': ('_plate', ramp('#0a0a0c', '#26262a', '#45454b', '#6c6c72', '#a0a0a8')),
    'skin_bronze': ('_plate', ramp('#140c04', '#402810', '#704c20', '#a07434', '#cca058', '#ecd08c')),
    'skin_copper': ('_plate', ramp('#140804', '#4a1e0c', '#8a4420', '#c07038', '#e8a868')),
    'skin_wood': ('_planks', ramp('#140a04', '#3a2210', '#5e3a1c', '#86592e', '#a87a44')),
    'skin_darkwood': ('_planks', ramp('#080402', '#1e1208', '#3a2412', '#58381e', '#74502c')),
    'skin_leather': ('tf_21', ramp('#120a06', '#33200f', '#523519', '#714d28', '#8f6a3c')),
    'skin_purplerobe': ('tf_18', ramp('#0c0610', '#24142e', '#3e2650', '#5c3a72', '#7e5896')),
    'skin_bone': ('cf_04', ramp('#2a2418', '#6a5e48', '#a89878', '#d0c4a2', '#efe6cc')),
    'skin_chain': ('tf_33', ramp('#0e0e10', '#2e2e34', '#55555c', '#80808a', '#b4b4bc')),
    'skin_green_armor': ('_plate', ramp('#060c04', '#14280c', '#2a4a18', '#4a7430', '#78a050')),
    'skin_yellow_armor': ('_plate', ramp('#140c00', '#4a3404', '#8a660c', '#c49c20', '#ecd060')),
    'skin_red_armor': ('_plate', ramp('#140202', '#4a0a08', '#8a1810', '#c43420', '#ec6a48')),
    'skin_slime': ('cf_05', ramp('#041004', '#0c3008', '#1c5a10', '#3a8a1c', '#70c03a')),
    'skin_crate': ('_planks', ramp('#1a0e06', '#45280f', '#6c4520', '#93683a', '#b48a52')),
    'skin_vore': ('tf_25', ramp('#0e0608', '#341a1e', '#5e3438', '#8a5254', '#b48078')),
  }
  for name, (s, stops) in skins.items():
    add(name, fit(gradmap(src(s), stops, 0.02, 0.5 if s == '_plate' else 1.0), 64, 64), kind='skin', size=[1, 1])
  del TEX['_plate'], TEX['_planks']

  # ---- generated surfaces (64 x 64 like Quake's liquids)
  n = fbm(64, 5, 7); m = fbm(64, 4, 9)
  lava = np.stack([np.interp(n, [0, .45, .7, 1], c) for c in ([60, 150, 230, 255], [6, 30, 110, 220], [0, 4, 10, 90])], -1)
  add('lava', from_array(lava), kind='liquid', size=[2, 2], fullbright=True)
  slime = np.stack([np.interp(n * .7 + m * .3, [0, .5, 1], c) for c in ([8, 40, 110], [30, 90, 170], [4, 16, 30])], -1)
  add('slime', from_array(slime), kind='liquid', size=[2, 2], fullbright=True)
  water = np.stack([np.interp(n * .6 + m * .4, [0, .5, 1], c) for c in ([10, 34, 80], [18, 50, 104], [16, 44, 74])], -1)
  add('water', from_array(water), kind='liquid', size=[2, 2])
  # sky: Quake's two layers, a solid back and a cut-out front
  s1 = fbm(128, 6, 21); s2 = fbm(128, 6, 33)
  back = np.stack([np.interp(s1, [0, 1], [30, 200])] * 3, -1)  # grey: each level tints its sky
  add('sky_back', from_array(back), kind='sky')
  front = np.stack([np.interp(s2, [0, .55, 1], [60, 150, 255])] * 3, -1)
  fa = from_array(front); fa.putalpha(Image.fromarray(((s2 > .52) * 255).astype(np.uint8)))
  add('sky_front', fa, kind='sky', alpha=True)
  # slipgate: a turbulent purple-blue swirl (fullbright)
  sw = fbm(64, 5, 44)
  gate = np.stack([np.interp(sw, [0, .5, 1], c) for c in ([20, 90, 200], [10, 40, 150], [60, 160, 255])], -1)
  add('gate', from_array(gate), kind='liquid', size=[2, 2], fullbright=True)
  # metal plate for lifts, buttons and trims, cut from the riveted catacomb wall
  add('plate', fit(gradmap(src('cw_rust_up'), ramp('#0c0a08', '#2e2820', '#504638', '#706452', '#988a70')), 64, 64), kind='floor', size=[2, 2])
  add('button', fit(gradmap(src('cdoor_2_front').crop((8, 30, 56, 78)), ramp('#200402', '#601008', '#a02010', '#e04a20')), 32, 32), kind='floor', size=[1, 1], fullbright=True)


# ---------------------------------------------------------------- palette
def palette():
  """224 colours fitted to everything, plus 32 fullbright ramps (fire and glow) at the end."""
  samp = []
  for name, (im, meta) in TEX.items():
    a = np.asarray(im.convert('RGBA')); px = a[a[..., 3] > 128][:, :3]
    if len(px) > 4000: px = px[rng.choice(len(px), 4000, replace=False)]
    samp.append(px)
  px = np.concatenate(samp).astype(np.uint8)
  side = int(np.ceil(np.sqrt(len(px)))); pad = np.zeros((side * side, 3), np.uint8); pad[:len(px)] = px; pad[len(px):] = px[0]
  q = Image.fromarray(pad.reshape(side, side, 3)).quantize(224, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
  pal = list(q.getpalette()[:224 * 3])
  fire = [(255, 255, 160), (255, 240, 96), (255, 210, 40), (255, 170, 20), (250, 130, 10), (230, 90, 0), (200, 60, 0), (160, 30, 0)]
  blue = [(220, 240, 255), (150, 200, 255), (90, 150, 255), (50, 100, 230), (30, 60, 190), (20, 40, 140)]
  green = [(200, 255, 140), (130, 230, 70), (70, 180, 30), (40, 130, 10)]
  extra = fire + blue + green + [(255, 255, 255), (255, 60, 40), (190, 20, 20), (120, 0, 0)]
  extra += [(0, 0, 0)] * (32 - len(extra))
  for c in extra[:32]: pal += list(c)
  return pal


def quantize(im, pal, alpha):
  """8-bit palette image; cut-outs use index 255 as the transparent colour (Quake's 255 too)."""
  pimg = Image.new('P', (1, 1)); pimg.putpalette(pal)
  q = im.convert('RGB').quantize(palette=pimg, dither=Image.Dither.NONE)
  if alpha:
    a = np.asarray(im.getchannel('A')) > 110; idx = np.asarray(q).copy(); idx[~a] = 255
    q = Image.fromarray(idx, 'P'); q.putpalette(pal); q.info['transparency'] = 255
  return q


def main():
  if len(sys.argv) < 2: sys.exit(__doc__)
  build(sys.argv[1])
  os.makedirs(OUT, exist_ok=True)
  for f in os.listdir(OUT):
    if f.endswith('.png') or f == 'manifest.json': os.remove(os.path.join(OUT, f))
  pal = palette(); man = {}
  for name, (im, meta) in TEX.items():
    alpha = meta.get('alpha', False)
    q = quantize(im, pal, alpha)
    q.save(os.path.join(OUT, name + '.png'), optimize=True, **({'transparency': 255} if alpha else {}))
    man[name] = dict(meta, w=q.width, h=q.height)
  with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(man, f, indent=0, separators=(',', ':'))
  Image.frombytes('RGB', (16, 16), bytes(pal)).resize((256, 256), Image.NEAREST).save(os.path.join(ROOT, 'assets', 'palette.png'))
  print(len(man), 'textures ->', OUT)


if __name__ == '__main__':
  main()
