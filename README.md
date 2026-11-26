# SOLARIS WING

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/kitworks-lab/mf-solaris-wing/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/kitworks-lab/mf-solaris-wing/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

## Overview

Fly the KW-14 "Kestrel" courier over the procedural Caldera Isles: a volcanic caldera, a sea canyon, a lighthouse cliff and Runway 09/27 on a coastal plateau. Land cleanly and earn a graded touchdown. Offline, three.js vendored, no network.

## Controls

| Input | Action |
| --- | --- |
| W / S or Up / Down | Pitch |
| A / D or Left / Right | Roll (coordinated turn assist) |
| Q / E | Rudder |
| Shift / Ctrl | Throttle up / down |
| Space | Boost (throttle > 85%) |
| B | Airbrake |
| 0 / 1 / 2 | Flaps |
| G | Landing gear |
| C | Camera (chase / cockpit) |

## Architecture

- `game/src/terrainWorld.js` - terrain, ocean, sky, clouds, airstrip, lighthouse
- `game/src/flightPhysics.js` - quaternion 6-DOF flight model, collisions, landing grading
- `game/src/aircraftModel.js` - Kestrel exterior, live-instrument cockpit, effects
- `game/src/main.js` - game loop, cameras, HUD, UI
- `main.ts` - packaging and dossier builder

## Run it

```
node serve.ts
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

[make.fun](https://make.fun/?ref=hqpqp1gd&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
