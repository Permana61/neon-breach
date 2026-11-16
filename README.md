# NEON BREACH

[![make.fun](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/Permana61/neon-breach/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/Permana61/neon-breach/reward.svg)](https://make.fun/bounty/best-game-01)

**NEON BREACH** is a raycasting FPS built from scratch for [make.fun's "Make the best game" bounty](https://make.fun/bounty/best-game-01) — a Wolfenstein-style 3D shooter rendered by a hand-written raycaster, with zero libraries and zero network requests. Pure HTML + hand-written JavaScript + Canvas 2D.

## The game

Sector 7 is a neon cyberpunk arena. You are VANGUARD (cyan) against the CINDER squad (orange). Plant the spike at **REACTOR (A)** or **VAULT (B)** — or wipe the enemy team. First to 7 rounds takes the sector; halftime swaps sides, and at 6–6 the next round wins it all.

- **Real 3D, no engine:** a hand-written DDA raycaster with procedural neon wall textures, distance shading, z-buffered sprite bots, and a weapon viewmodel with muzzle flash, recoil and bob.
- **Full round loop:** 12s buy phase, 100s rounds, spike plant (hold E, 3s) with a 30s fuse, defuse (4s), economy ($800 start, $300/kill, win/loss bonuses), halftime swap and overtime.
- **Five weapons:** P9 Sidearm, KX-9 Ripper SMG, AR-77 Duskfire rifle, M590 Breakwater shotgun (8 pellets), LR-80 Longshadow sniper — distinct damage, rate, spread and ADS zoom.
- **Nine bots, ten people:** 4 teammates + 5 enemies with lane patrols, line-of-sight chasing, strafe duels, reaction times, plant/defuse behaviour and rotations when the spike goes down.
- **Feel:** tracers, impact sparks, floating damage numbers, hitmarkers, killfeed with HEADSHOT tags, screen shake, damage vignette, round-end slow-mo with MVP overlay, and fully synthesized WebAudio (shots, hits, plant beeps, footsteps, ambient hum) — no audio files.
- **HUD:** health/armor, ammo, money, round timer and score, live minimap with players and sites, plant/defuse progress, and the **ox90_666** brand painted on the arena walls.

## How to play

Serve the game and open it in a desktop browser:

```
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Aim (click to capture) |
| Click | Fire |
| Right-click | Aim down sights |
| R | Reload |
| G | Throw grenade |
| E (hold) | Plant / defuse the spike |
| B | Buy menu (also 1–5 to quick-buy) |
| Shift | Sprint |
| C | Crouch |
| P | Pause |

## Structure

- `game/index.html` — canvas + HUD overlays + menus
- `game/src/config.js` — arena map, weapons, economy, pathfinding
- `game/src/textures.js` — procedural wall/sprite textures painted in code
- `game/src/raycast.js` — the DDA raycaster, sprites, weapon view, effects
- `game/src/audio.js` — synthesized WebAudio sounds
- `game/src/weapons.js` — hitscan combat, reload, grenades
- `game/src/bots.js` — bot AI (patrol, chase, plant, defuse, rotate)
- `game/src/player.js` — player movement, input, combat actions
- `game/src/game.js` — match flow: rounds, economy, spike, scoring
- `game/src/hud.js` — HUD, killfeed, minimap, buy menu
- `game/src/main.js` — bootstrap, game loop, screenshot driver
- `main.ts` — the kit dossier entrypoint
