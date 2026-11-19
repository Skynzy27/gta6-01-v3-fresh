# Solmar Bay 3D

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Skynzy27/gta6-01-v3-fresh/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Skynzy27/gta6-01-v3-fresh/reward.svg)](https://make.fun/c/gta6-01)

An open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/c/gta6-01). Solmar Bay is a
neon-sunset coastal city you explore on foot and by car: steal cars, outrun
the police under a helicopter spotlight, take jobs from the fixer Mara, and
climb the wanted ladder from a nobody to the bay's biggest score.

## Play

Serve `game/` with any static HTTP server and open `game/index.html` in
desktop Chrome. No network requests, no build step.

```
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

Staged scenes for screenshots: `?shot=start|chase|drive|mission&seed=1`
(see `shots.json`). On a slow machine, `?quality=low` turns off
antialiasing and shadows.

## Controls

- **W A S D** — move / drive (W accelerate, S brake/reverse)
- **Mouse** — orbit the chase camera (drag), **wheel** — zoom
- **Shift** — sprint on foot
- **E** — enter / exit a car, steal the nearest car
- **Space** — handbrake while driving
- **Left click** — shoot (pistol, on foot)
- **R** — reload
- **P / Esc** — pause
- **M** — mute

## The game

- A low-poly city at sunset: downtown towers, the boardwalk, the docks,
  traffic and pedestrians, palms and streetlights.
- Wanted level 0–5 stars: police cars chase you, a helicopter with a visible
  spotlight hunts you from 3 stars up. Lose the heat or get busted.
- Seven story missions with waypoints, timers and payouts, saved in the
  browser (localStorage) together with your cash.
- HUD with a live minimap, wanted stars, cash, speed, health and ammo.

## Layout

- `game/index.html` — the page, HUD and import of the game modules
- `game/src/` — the game's own source (one job per file)
- `game/vendor/three.min.js` — vendored Three.js r149 (UMD build)
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`
- `screenshots/` — four real renders of the game in a browser
- `shots.json` — the staged scenes used for those screenshots

## Build the dossier (local check)

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see `LICENSE`.
