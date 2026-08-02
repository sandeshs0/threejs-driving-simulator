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
  road/KalankiJunction  the chowk and the Ring Road underpass beneath it
  city/Policeman        Nepal Police, on the barrier and directing traffic
  traffic/Traffic       pooled AI vehicles + the collision pass
  city/CityChunk        buildings, shops, temples for one block
  city/StreetLife       carts, parked bikes, bystanders, cows, prayer flags
  city/Pedestrians      pooled walking figures with a real gait
  city/CityGridManager  sliding square of street tiles around the player
  city/StreetTile       one square of city: ground, carriageways, frontages
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
  junction.ts           the Kalanki underpass cut, as a terrain function
  cityGrid.ts           the street network: analytic lattice + containment
  cityBlocks.ts         what stands along each street, per tile
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

Two river bridges in the hills, the Nagdhunga tunnel through the valley rim, the Thankot checkpost on the far side — a gantry, booths, raised barriers, the flag and Nepal Police waving traffic through, which is the moment the drive changes character — then Kalanki chowk, then the city, which continues indefinitely, so the world is still infinite.

### Kalanki chowk

The Ring Road passes **under** the junction here. Nepal's first underpass — 800 m, four lanes, opened 2018 — runs Bafal to Khasibazar, which leaves the Tribhuvan Highway at grade over the top on its way to Kalimati. So the player crosses on the deck and watches the Ring Road drop away into the cut on both sides; surface lanes flank the trench for everything that is turning rather than passing through. Building it the other way round — the player driving *into* the underpass — would be a different junction entirely.

The cut is real geometry, not a painted backdrop: `lib/junction.ts` subtracts `underpassDepth` from `groundY` exactly as a bridge's gorge is subtracted, so the terrain genuinely falls away beneath the deck. That is also why the city generator and the prop scatter both consult `inJunction(s)` — everything they place is positioned from `elevation(s)`, which knows nothing about the trench, so a shopfront left inside the footprint would hang six metres over open air.

### The city is a network, not a corridor

Up to Kalanki the world is one curve and the car is held on it. That is the right model for a highway through the hills and the wrong one for a city — you cannot explore a line. Past `GRID_START_S` the world becomes two-dimensional and you can turn off the highway, take any junction and get lost.

`lib/cityGrid.ts` is a **lattice, not a mesh**, in the same spirit as `road.ts`. Streets are defined by arithmetic — avenues at constant x, cross streets at constant z, each nudged by a deterministic jitter — so every question about them is answered in constant time from a position, with no spatial index and nothing baked. "Which street am I on", "am I on a street at all", "where is the next junction" and "what should this tile draw" are all the same two divisions.

Three things had to become exactly true for that to work, and each is load-bearing:

- **`swayScale` goes to exactly 0** once `cityness` reaches 1, so the highway becomes the line x = 0 and the valley floor is axis-aligned with the world. Leave even a few metres of sway in and every junction in Kathmandu is a curved intersection that has to be solved numerically.
- **City relief goes to exactly 0**, because the grid puts roads hundreds of metres off the highway and they all have to meet at one height.
- **The elevation profile gets two equal control points** past the handover, so the floor is level and tiles can be flat planes.

Avenue 0 *is* the highway — same centreline, same half-width — so the handover from corridor clamp to grid containment has no seam in it.

Containment is the union of the two corridors, which is what makes junctions work without any special case: at a crossing you are inside both, on a straight you are inside one, and the intersection square is simply where neither test fails. Off the network you are pushed back along one axis only, so scraping down a wall of buildings reads as sliding along a kerb rather than being sucked to a centreline.

`CityGridManager` mounts a square of tiles around the player and recycles them — the two-dimensional counterpart to `RoadChunkManager`. The difference matters: a corridor only needs chunks ahead and behind, so its window is a range; a city has to be explorable in any direction, so the window is an area. Past the handover `RoadChunk` returns null entirely and the grid owns the ground, the carriageways and everything built along them.

Blocks are filled by **frontages, not polygons**: each street lays a row of buildings down both sides, which is how a city is actually built. A block bounded by four streets gets four frontages and a hollow middle — right for Kathmandu, where the middle of a block is courtyards. Ownership is by line: a tile furnishes the streets whose centreline falls inside it, so nothing generates twice.

The map switches with the world. On the highway, Tab is a route overview; in the city it is a north-up street map centred on you, with every main road named, the street you are on picked out, and the junctions marked. The radar draws the network in all directions and labels the main roads upright, because a name that rotates with the map is a name you cannot read at a glance.

`KalankiJunction` builds the whole thing in one group rotated by the road's yaw, which buys a local frame where **+X runs along the Ring Road** and **−Z is the direction of travel**. Every number in the component is then plain and axis-aligned instead of curve maths. The trench floor and its retaining walls are swept strips rather than stretched boxes, because the floor is not flat — it climbs out at about 7% at each end and the walls have to climb with it.

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
