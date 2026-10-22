# FLESHVOW

A Quake (id Software, 1996) style first-person shooter in three.js: three levels, eight weapons, ten monsters and an
opening cinematic, built from the VELSCOUR biome packs. Plain ES modules, no build step; three.js r170 comes from
jsDelivr through the import map in `index.html`.

## Run it
```bash
python tools/serve.py 8171
```
Open http://localhost:8171 and click to enter (the server sends no-cache headers, so edits always reload).

- **Controls:** WASD move, mouse look, Space jump (or swim up), Shift walk, left mouse fire, 1–8 or the wheel to change weapons, Q for the previous weapon, F to toggle the chunky low-res pixels, C for the crosshair, Esc to pause.
- **Phones:** a stick on the left, drag the right side to look, plus FIRE, JUMP and next-weapon buttons.
- **Quake movement:** air control (so strafe-jumping works), rocket jumps, and a water jump out of pools.

URL flags: `?level=2` starts on a later level, `?nointro` skips the cinematic, `?test` starts at once with no damage
and never pauses (for automated tests).

## The game
| Map | Pack | What happens |
|---|---|---|
| E1M1 The Drowned Crypt | Catacombs | Great hall with a water channel. Silver key in the ossuary, a lift down to the slime crypt, a button for the gold key's portcullis. The rocket launcher sits on an island in a lava moat. |
| E1M2 The Cathedral of Ash | Cathedral & Graveyard | Moonlit graveyard and a mausoleum, then the stained-glass nave. A stair leads down to the flooded crypt, and the sanctum is behind the altar. |
| E1M3 Gloom Keep | Overworld & Town | Walled town at night. A lever in the inn raises the gatehouse over the lava moat. Lifts reach the courtyard ramparts. The Shambler guards the last slipgate. |

- **Weapons** (Quake's numbers): Axe, Shotgun, Double-barrelled Shotgun, Nailgun, Super Nailgun, Grenade Launcher, Rocket Launcher, Thunderbolt.
- **Monsters:** Rottweiler, Grunt, Enforcer, Knight, Death Knight, Ogre, Scrag, Zombie (only a single blow of 60 or more kills it), Fiend, Shambler (takes half damage from explosions).
- **Monster behaviour:** they wake on sight or on gunfire, path round corners on a flow field, fight each other when hit by friendly fire, and gib.
- **Items:** health, megahealth, green/yellow/red armour, ammo, silver and gold keys, Quad Damage, plus secrets.

## Layout
- `src/main.js`: renderer (renders at about 540 lines and scales up with nearest filtering), input, touch, loop, test hooks
- `src/gfx.js`: texture loading and the shaders: baked light × texture banded into 32 light levels, dynamic lights, two-layer scrolling sky, warping liquids
- `src/level.js`: the level compiler. It turns an ASCII grid and legend into brush geometry with world-aligned UVs, ray-traced per-vertex light from torches, lava and sky, doors, lifts, secret walls, buttons, slipgates, collision boxes and traces
- `src/levels/e1m*.js`: the maps. Geometry characters come from each map's `legend`; entity characters (monsters, items, torches) take the floor of a neighbouring cell; `ents` adds per-map entities
- `src/physics.js`: Quake's pmove (friction, accelerate, air-accelerate, 18-unit steps) on axis-swept boxes
- `src/player.js`, `src/weapons.js`: stats, armour, water and lava, the view model, firing, projectiles, splash damage
- `src/monsters.js`, `src/models.js`: AI and animation for the ten monsters, and the low-poly model kit (rigs, weapons, items, the Ranger)
- `src/fx.js`: particles, sprite explosions, flames, gibs, the thunderbolt beam
- `src/intro.js`: the opening cinematic, the title-screen pan and the intermission camera
- `src/hud.js`, `src/ui.css`: the status bar, messages, letterbox and title
- `src/audio.js`: every sound is synthesised in WebAudio, including the ambient drones

## Textures
`python tools/build_textures.py "F:/!  VELSCOUR/AI ASSETS/Biome Packs"` (needs pillow and numpy) does the following:
- reads the extracted Catacombs, Cathedral_Graveyard and Overworld_Town packs
- cuts the wall elevations, square floors, doors, arches, torches and props into textures at about 64 texels per metre
- maps everything to one shared 256-colour palette without dithering (`assets/palette.png`)
- recolours pack textures into monster and weapon skins (`skin_*`)
- generates the liquids, sky layers and slipgate swirl

Its output goes to `assets/textures/` with `manifest.json`. The packs stay outside the repo; don't hand-edit the generated files.

## Tests
With the server running on 8175 (`python tools/serve.py 8175`) and Playwright installed globally:
```bash
NODE_PATH=$(npm root -g) node tools/tests/levels.js            # load every map, solve it (keys, weapons, exit reachable), screenshots
NODE_PATH=$(npm root -g) node tools/tests/play.js              # keys, ambushes, doors, buttons, lifts, secrets, rocket jump, boss gate, exits, finale
```
Screenshots go to `tools/tests/out/` (git-ignored). The debug hook is `window.FLESHVOW`: `game` (with `level`, `player`,
`monsters`, `godMode`), `frame(dt, render)` to step by hand, `go(cellX, cellZ, yawDeg, pitchDeg)` in test mode.
