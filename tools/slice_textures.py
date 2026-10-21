"""Slice the texture sheets in assets/source/ into tileable textures + normal maps.

  python tools/slice_textures.py

Writes assets/textures/<name>.webp, <name>_n.webp (normal map from luminance) and
assets/textures/manifest.json. Needs pillow + numpy. Never hand-edit the outputs.
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source')
OUT = os.path.join(ROOT, 'assets', 'textures')

# 5x4 grids, row by row
FLOORS = ['stone_light', 'stone_slabs_dark', 'stone_slabs_cracked', 'pebbles', 'stone_mossy',
          'flagstone_cobble', 'stone_gravel', 'cobble_pale', 'planks_weathered', 'planks_dark',
          'planks_grey', 'planks_red', 'planks_nailed', 'planks_knotty', 'planks_diagonal',
          'planks_studded', 'planks_patchwork', 'planks_cracked', 'planks_stained', 'planks_herringbone']
GRASS = ['grass_dry', 'grass_lush', 'grass_yellow', 'grass_patchy', 'grass_wild',
         'moss_pebbles', 'grass_sparse', 'grass_flowers', 'grass_autumn', 'grass_dark',
         'grass_straw', 'grass_clover', 'gravel_grey', 'gravel_dark', 'gravel_pale',
         'gravel_black', 'gravel_tracks', 'gravel_mixed', 'gravel_dirt', 'gravel_tan']
DIRT = ['dirt_brown', 'mud_puddles', 'dirt_cracked', 'dirt_tracks', 'dirt_red',
        'dirt_grey', 'mud_puddles_2', 'mud_clay', 'dirt_twigs', 'sand',
        'dirt_sticks', 'straw', 'cobble_grey', 'flagstone_rough', 'slabs_pale',
        'slabs_slate', 'bricks_red', 'cobble_square', 'cobble_mossy', 'bricks_herringbone']
WALLS = ['timber_plaster', 'wood_planks', 'fieldstone', 'ashlar', 'brick', 'wattle']  # columns; rows a, b
ROOFS = ['shingles_wood', 'slate', 'tiles_clay', 'thatch']  # 2x2
DOORS = ['plank_ring', 'tavern', 'iron_lock', 'gothic', 'zbrace_ring',
         'plank_bars', 'zbrace_iron', 'iron_studded', 'panel_dark', 'zbrace_light']


def load(name):
  return np.asarray(Image.open(os.path.join(SRC, name)).convert('RGB')).astype(np.float32)


def cell(a, cols, rows, c, r, inset):
  h, w = a.shape[:2]
  x0, x1 = round(c * w / cols) + inset, round((c + 1) * w / cols) - inset
  y0, y1 = round(r * h / rows) + inset, round((r + 1) * h / rows) - inset
  return a[y0:y1, x0:x1]


def wrap(a, k, axis):
  """Cross-fade the last k pixels along axis into the first k, then drop them: tiles seamlessly."""
  a = np.moveaxis(a, axis, 0)
  n = a.shape[0] - k
  t = np.linspace(0, 1, k + 2)[1:-1].reshape((k,) + (1,) * (a.ndim - 1))
  head = a[:k] * t + a[n:] * (1 - t)
  return np.moveaxis(np.concatenate([head, a[k:n]], 0), 0, axis)


def normals(rgb, strength):
  hgt = rgb.mean(2) / 255
  # soften so the normal follows shapes, not pixel noise (wraps, so it stays tileable)
  for _ in range(2):
    hgt = (hgt + np.roll(hgt, 1, 0) + np.roll(hgt, -1, 0) + np.roll(hgt, 1, 1) + np.roll(hgt, -1, 1)) / 5
  dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * strength
  dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * strength
  n = np.dstack([-dx, dy, np.ones_like(hgt)])
  n /= np.linalg.norm(n, axis=2, keepdims=True)
  return (n * 0.5 + 0.5) * 255


def save(name, a, size, strength=6, alpha=None):
  img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
  if size: img = img.resize(size, Image.LANCZOS)
  if alpha is not None:
    img = img.convert('RGBA')
    img.putalpha(Image.fromarray(alpha).resize(img.size, Image.LANCZOS))
    img.save(os.path.join(OUT, name + '.webp'), quality=92)
    return img.size
  img.save(os.path.join(OUT, name + '.webp'), quality=90)
  Image.fromarray(normals(np.asarray(img).astype(np.float32), strength).astype(np.uint8)).save(
    os.path.join(OUT, name + '_n.webp'), quality=90)
  return img.size


def main():
  os.makedirs(OUT, exist_ok=True)
  man = {'ground': {}, 'walls': {}, 'roofs': {}, 'doors': {}}
  for sheet, names in (('floors_stone_wood.webp', FLOORS), ('ground_grass_gravel.webp', GRASS),
                       ('ground_dirt_paving.webp', DIRT)):
    a = load(sheet)
    for i, nm in enumerate(names):
      c = cell(a, 5, 4, i % 5, i // 5, 6)
      c = wrap(wrap(c, 28, 1), 28, 0)
      man['ground'][nm] = save(nm, c, (256, 256), 5)
  a = load('walls.webp')
  for i, nm in enumerate(WALLS):
    for r, v in enumerate('ab'):
      c = cell(a, 6, 2, i, r, 3)
      c = wrap(c, 16, 1)  # walls repeat sideways; one panel is one storey tall
      man['walls'][nm + '_' + v] = save('wall_' + nm + '_' + v, c, (256, 416), 7)
  a = load('roofs.webp')
  for i, nm in enumerate(ROOFS):
    c = cell(a, 2, 2, i % 2, i // 2, 4)
    c = wrap(wrap(c, 40, 1), 40, 0)
    man['roofs'][nm] = save('roof_' + nm, c, (512, 512), 8)
  rgba = np.asarray(Image.open(os.path.join(SRC, 'doors.webp')).convert('RGBA'))
  xs = [(114, 326), (403, 622), (695, 922), (994, 1218), (1294, 1512)]
  ys = [(23, 454), (489, 920)]
  for i, nm in enumerate(DOORS):
    (x0, x1), (y0, y1) = xs[i % 5], ys[i // 5]
    c = rgba[y0:y1, x0:x1]
    al = np.where(c[..., 3] > 128, 255, 0).astype(np.uint8)
    man['doors'][nm] = save('door_' + nm, c[..., :3].astype(np.float32), None, alpha=al)
  with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump(man, f, indent=1)
  print(sum(len(v) for v in man.values()), 'textures ->', OUT)


if __name__ == '__main__':
  main()
