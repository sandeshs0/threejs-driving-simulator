# Driving Simulator

A browser-based first-person driving simulator. Next.js 15 + TypeScript, React Three Fiber / Three.js / Drei, Rapier physics, Zustand state, Tailwind HUD, Leva tuning, and postprocessing.

```bash
npm install
npm run dev     # http://localhost:3000
```

Click the title card to start — that click is also the user gesture browsers require before audio may play.

## Controls

| Key | Action |
| --- | --- |
| `W` | Accelerate |
| `S` | Brake / reverse |
| `A` / `D` | Steer |
| `C` | Camera: driver → chase → cinematic |
| `H` | Horn |
| `M` | Mute |
| `Tab` | Full route map |
| Mouse | Look around / orbit |

You drive on the **left**. Nepal is a keep-left country, the car is
right-hand drive because of it, and the HUD tells you when you have wandered
onto the offside — as does the oncoming bus.

## Architecture

State flows one way: `Vehicle` writes the physics state into a mutable Zustand object each frame, and every other system reads from it. Nothing subscribes reactively to per-frame data, so the React tree does not re-render while driving — the only renders are chunk mount/unmount and the ~5 Hz HUD update.

```
app/page.tsx            client-only entry
components/Experience   composition root: canvas, physics, systems
  vehicle/Vehicle       arcade physics, gearbox, slip, terrain following
  vehicle/CarExterior   black roadster body, windshield frame, wheels
  vehicle/CarInterior   dashboard, live analogue gauges, wheel, seats
  camera/CameraController  driver / chase / cinematic viewpoints
  road/RoadChunkManager sliding window of chunks around the player
  road/RoadChunk        ribbon geometry for one slice of world
  road/TunnelStructure  swept concrete bore with portals and lighting
  road/BridgeStructure  deck soffit, parapets, terrain-measured piers
  road/Checkpost        the Thankot gateway into the valley
  traffic/Traffic       pooled AI vehicles + the collision pass
  city/CityChunk        buildings, shops, temples for one block
  city/StreetLife       carts, parked bikes, bystanders, cows, prayer flags
  city/Pedestrians      pooled walking figures with a real gait
  environment/          biome scenery + sky, sun, fog
  audio/AudioSystem     synthesizer lifecycle
  ui/                   HUD, radar + route map, start overlay, Leva panel
lib/
  config.ts             every tuning constant, live-editable via Leva
  road.ts               the road curve, elevation and terrain height
  roadFeatures.ts       where bridges and tunnels go, and the land under them
  ribbon.ts             curved-strip and swept-profile geometry builders
  collision.ts          OBB separating-axis test + two-body impulse response
  journey.ts            route signals, waypoints, progress and place names
  city.ts               deterministic Kathmandu street layout
  biomes.ts             biome table and cross-fading
  scatter.ts            deterministic prop placement
  audio/AudioEngine.ts  Web Audio synthesis (no audio files)
stores/useGame.ts       transient vehicle state + reactive HUD slice
```

### The journey

The drive is a scripted route rather than endless random road:

```
   0 ── 410 ── 840 ── 1200 ─ 1375 ─ 1520 ─ 1700 ─ 1950 ─ 2200 ─ 2450 ─ 2700 ─▶
Dhading  bridge bridge tunnel      checkpost Thankot Kalanki  Kalimati   Ratna
                                                          Tripureshwor  Park
```

Two river bridges in the hills, the Nagdhunga tunnel through the valley rim, the Thankot checkpost on the far side — a gantry, booths, raised barriers and the flag, which is the moment the drive changes character — then the city, which continues indefinitely, so the world is still infinite.

**Length is one number.** Every distance in `journey.ts` is written at full scale — the real drive is a good 25 km — and multiplied by `ROUTE_SCALE`, currently `0.5`. Raise it for a longer haul, drop it for a shorter one; `roadFeatures.ts` reads `ROUTE` and everything else reads `WAYPOINTS`, so nothing else hard-codes a route distance.

Heights go through the same scale as distances, which is the reason for doing it this way rather than editing the numbers by hand: scaling both axes together leaves every gradient identical, so a shorter drive never quietly becomes a climb the car cannot pull. The transition widths — how far the city takes to thicken, how far the hills take to subside — scale too, or on a short route they would overlap and Kathmandu would start building itself inside the mountain.

`WAYPOINTS` is the single list behind the progress bar, the "next place" readout, the pins on both maps and the district names in the HUD. Add a row and all four pick it up.

`journey.ts` exposes the route as smooth 0→1 signals — `cityness`, `mountainness`, `swayScale`, `terracing` — rather than `if (stage)` branches. Every other system multiplies by them: the road's switchbacks flatten into city streets, the ridges subside into a valley floor, the terraces fade out, the forest thins as buildings thicken, and the fog warms and closes in. All of it happens over hundreds of metres, the way it does coming down from Thankot.

### The road is math, not meshes

`lib/road.ts` defines the world as pure functions of distance along the road: `centerX(s)` for the curve, `elevation(s)` for crests and dips, `groundY(x, z)` for off-road terrain that is flush with the asphalt at the verge and rolls into hills further out.

Every surface, prop and the car's own ground height derives from those functions, so there is one source of truth for "where is the road". Chunks are built by `buildRibbon` between two lateral offsets over a distance range, which is why joins are invisible even mid-bend, and why props placed in road space can never land on the asphalt. The car's spawn point comes from the same place — `roadPoint(laneWidth / 2, 0)` — because the centreline is *not* at x = 0 at s = 0, and a hard-coded spawn drops the car into the scenery beside the road.

Two heights come out of this and they are not interchangeable. `groundY` is the terrain; `surfaceY` is what the car is driving on. On a bridge they differ by the depth of the gorge, so anything carrying the vehicle uses `surfaceY` — using the terrain there drops the car through the deck.

The car is held inside the guardrail line by a lateral clamp that pushes it back along the road normal (not via `roadPoint`, which would shunt it forward or back and read as a lurch). The rails exist so that barrier looks like a road rather than a bug.

Bridges and tunnels extend the same idea. `roadFeatures.ts` decides where they go, and feeds the terrain function two continuous signals: `ravineDepth(s)` drops the ground away under a bridge and returns it to grade exactly at the abutments, and `mountainMass(s)` raises a hillside around a tunnel's portals. The structures themselves are `buildSweep` cross-sections — an arch, a parapet — swept along the same curve, so they bend with the road instead of being straight tubes laid over it. Bridge piers measure the real terrain height beneath each position, so none float and none are buried.

### Sound is synthesized, not sampled

`AudioEngine` builds every voice from oscillators and a shared noise buffer: an engine harmonic stack tracking firing frequency (`rpm / 30`) through a load-dependent lowpass, intake breath, tyre roll that drops and widens on gravel, speed-squared wind, resonant brake squeal and cornering scrub, an ambient bed, and a two-reed horn. No files to download, and every voice responds continuously to the physics.

### Collisions are solved, not simulated

Rapier carries the car's collider for the static world, but it does not own the motion — the arcade model does. So vehicle-to-vehicle contact is resolved explicitly in `lib/collision.ts`, in two steps and entirely in 2D, because cars stay on the road surface and the vertical axis carries no information.

`overlap` is a separating-axis test between two oriented boxes. Vehicles are long and they meet at an angle, so an axis-aligned test would both miss real side-swipes and invent collisions in traffic that is merely alongside. It returns the minimum translation vector.

`resolve` turns that into an impulse: restitution well under 1 (most of a crash is deformation, not bounce), a tangential term so a glancing blow drags along the other vehicle instead of sliding frictionlessly past, and a torque from the lever arm — which is what makes an off-centre hit spin you rather than merely slow you down. Momentum is shared by mass, and that is the point: a motorbike bounces off, a loaded Tata does not notice you.

The response comes back as three things the arcade model can express: `spin`, a yaw rate that unwinds as the tyres bite; `pushX/pushZ`, a sideways knock it otherwise has no vocabulary for; and `impact`, a decaying flash that drives the camera shake, the tyre screech and the crash voice in the audio engine. Damage accumulates and takes the edge off the engine.

Traffic is driven, not played back. Vehicles behind you hold a gap rather than parking on your bumper, and oncoming traffic that finds you on its side of the road dives for the near side — the left, here — which is the direction that actually clears the conflict.

## Extending

The seams are deliberate:

- **Weather / day-night** — animate `CONFIG.sky` and the `Atmosphere` lights; both are read every frame.
- **Fuel, GPS, dashboard extras** — add a field to `VehicleState`, render it in `CarInterior` next to the existing gauges.
- **New biomes** — append to the `BIOMES` table in `lib/biomes.ts`.
- **Multiplayer** — remote cars are just more transforms driven into the same scene; the vehicle state object is already the single authority for local motion.
