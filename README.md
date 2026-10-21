# FLESHVOW

A dark fantasy game in three.js. Plain ES modules, no build step; three.js r170 comes from jsDelivr through the import map in `index.html`.

## Run it
```bash
python -m http.server 8171
```
Then open http://localhost:8171 and click to enter. Controls: WASD to move, mouse to look, Shift to run, Space to jump, Esc to release the mouse.

## Layout
- `src/main.js`: renderer, moonlight and fog, bloom, the game loop, lantern flicker
- `src/village.js`: the test village (ground splat shader, sky, well, lantern posts, dead trees, pines, props, drifting ash)
- `src/houses.js`: house builder (storeys of wall panels, jetty, gables, roof, door, windows, lantern)
- `src/player.js`: first-person walker with pointer lock and circle-vs-box collision
- `src/geo.js`, `src/textures.js`: UVs in metres, a seeded RNG, texture and material cache

## Textures
The source sheets are in `assets/source/`. `python tools/slice_textures.py` (needs pillow and numpy) cuts them into
tileable textures with generated normal maps in `assets/textures/`, and writes `manifest.json` listing every name.
Don't hand-edit the generated files.

Debug hook: `window.FLESHVOW = { THREE, scene, camera, renderer, player, colliders, lights }`.
