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
| Mouse | Look around / orbit |

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
  environment/          biome scenery + sky, sun, fog
  audio/AudioSystem     synthesizer lifecycle
  ui/                   HUD, start overlay, Leva panel
lib/
  config.ts             every tuning constant, live-editable via Leva
  road.ts               the road curve, elevation and terrain height
  roadFeatures.ts       where bridges and tunnels go, and the land under them
  ribbon.ts             curved-strip and swept-profile geometry builders
  biomes.ts             biome table and cross-fading
  scatter.ts            deterministic prop placement
  audio/AudioEngine.ts  Web Audio synthesis (no audio files)
stores/useGame.ts       transient vehicle state + reactive HUD slice
```

### The journey

The drive is a scripted route rather than endless random road:

```
0 m ──────────── 2400 ── 2750 ────── 3400 ─────────────▶
   Dhading hills   tunnel   descent      Kathmandu (forever)
```

Two river bridges in the hills, the Nagdhunga tunnel through the valley rim, then the city — which continues indefinitely, so the world is still infinite.

`journey.ts` exposes the route as smooth 0→1 signals — `cityness`, `mountainness`, `swayScale`, `terracing` — rather than `if (stage)` branches. Every other system multiplies by them: the road's switchbacks flatten into city streets, the ridges subside into a valley floor, the terraces fade out, the forest thins as buildings thicken, and the fog warms and closes in. All of it happens over hundreds of metres, the way it does coming down from Thankot.

### The road is math, not meshes

`lib/road.ts` defines the world as pure functions of distance along the road: `centerX(s)` for the curve, `elevation(s)` for crests and dips, `groundY(x, z)` for off-road terrain that is flush with the asphalt at the verge and rolls into hills further out.

Every surface, prop and the car's own ground height derives from those functions, so there is one source of truth for "where is the road". Chunks are built by `buildRibbon` between two lateral offsets over a distance range, which is why joins are invisible even mid-bend, and why props placed in road space can never land on the asphalt. The car's spawn point comes from the same place — `roadPoint(laneWidth / 2, 0)` — because the centreline is *not* at x = 0 at s = 0, and a hard-coded spawn drops the car into the scenery beside the road.

Two heights come out of this and they are not interchangeable. `groundY` is the terrain; `surfaceY` is what the car is driving on. On a bridge they differ by the depth of the gorge, so anything carrying the vehicle uses `surfaceY` — using the terrain there drops the car through the deck.

The car is held inside the guardrail line by a lateral clamp that pushes it back along the road normal (not via `roadPoint`, which would shunt it forward or back and read as a lurch). The rails exist so that barrier looks like a road rather than a bug.

Bridges and tunnels extend the same idea. `roadFeatures.ts` decides where they go, and feeds the terrain function two continuous signals: `ravineDepth(s)` drops the ground away under a bridge and returns it to grade exactly at the abutments, and `mountainMass(s)` raises a hillside around a tunnel's portals. The structures themselves are `buildSweep` cross-sections — an arch, a parapet — swept along the same curve, so they bend with the road instead of being straight tubes laid over it. Bridge piers measure the real terrain height beneath each position, so none float and none are buried.

### Sound is synthesized, not sampled

`AudioEngine` builds every voice from oscillators and a shared noise buffer: an engine harmonic stack tracking firing frequency (`rpm / 30`) through a load-dependent lowpass, intake breath, tyre roll that drops and widens on gravel, speed-squared wind, resonant brake squeal and cornering scrub, an ambient bed, and a two-reed horn. No files to download, and every voice responds continuously to the physics.

## Extending

The seams are deliberate:

- **AI traffic** — a component that spawns vehicles at `roadPoint(u, s)` ahead of the player; the Rapier collider on the car is already there for them to hit.
- **Weather / day-night** — animate `CONFIG.sky` and the `Atmosphere` lights; both are read every frame.
- **Fuel, GPS, dashboard extras** — add a field to `VehicleState`, render it in `CarInterior` next to the existing gauges.
- **New biomes** — append to the `BIOMES` table in `lib/biomes.ts`.
- **Multiplayer** — remote cars are just more transforms driven into the same scene; the vehicle state object is already the single authority for local motion.
