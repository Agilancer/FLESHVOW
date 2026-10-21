# FLESHVOW

A dark fantasy game in three.js. Plain ES modules, no build step; three.js r170 comes from jsDelivr through the import map in `index.html`.

## Run it
```bash
python -m http.server 8171
```
Then open http://localhost:8171 and click to enter. Controls: WASD to move, mouse to look, Shift to run, Space to jump,
E to take an item, I or Tab for the inventory, left mouse to swing (hold to charge a heavy blow, 10 Mana), right mouse to
raise the shield, Esc to release the mouse. The sword is driven into the ground by the well; the shield leans on it.

## Layout
- `src/main.js`: renderer, moonlight and fog, bloom, the game loop, lantern flicker
- `src/village.js`: the test village (ground splat shader, sky, well, lantern posts, dead trees, pines, props, drifting ash)
- `src/houses.js`: house builder (storeys of wall panels, jetty, gables, roof, door, windows, lantern)
- `src/player.js`: first-person walker with pointer lock and circle-vs-box collision
- `src/items.js`: item stats, the Vowbreaker sword and Hollow Vigil tower shield models, inventory icons, pickups
- `src/inventory.js`, `src/hud.js`, `src/ui.css`: paper-doll inventory with tooltips; life/mana bars, prompts, death screen
- `src/viewmodel.js`: first-person hands; five combo swings on damped springs, charge on hold, shield raise with eye slits
- `src/zombie.js`: jointed zombies (gashes, severing anywhere along a limb, balance springs, verlet ragdolls) and the horde
- `src/gore.js`: blood spray, splats and pools, meat chunks, spurting stumps
- `src/audio.js`: synthesised sounds (moans, cuts, clangs), positional
- `src/geo.js`, `src/textures.js`: UVs in metres, a seeded RNG, texture and material cache

## Textures
The source sheets are in `assets/source/`. `python tools/slice_textures.py` (needs pillow and numpy) cuts them into
tileable textures with generated normal maps in `assets/textures/`, and writes `manifest.json` listing every name.
Don't hand-edit the generated files.

Debug hook: `window.FLESHVOW` (scene, camera, player, vm, inv, horde, gore, director, ...). `FLESHVOW.frame(dt, render)` steps
the game by hand, which tests use because a hidden browser tab pauses requestAnimationFrame.
