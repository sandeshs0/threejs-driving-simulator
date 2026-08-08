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
| `I` | Infotainment — radio, music, YouTube |
| `T` | Time of day — step to the next dawn / noon / dusk / night |
| `K` | Weather — clear / hazy / rain / monsoon |
| `L` | Headlights — auto / on / off |
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
  vehicle/Headlights    the only real lights in the game besides the sun
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
  environment/Weather   owns the clock; runs before every other system
  environment/Atmosphere sky, sun, moon, stars, fog — all of it from SKY
  environment/Rain      a box of streaks that rides with the viewpoint
  environment/          biome scenery
  audio/AudioSystem     synthesizer lifecycle
  ui/                   HUD, radar + route map, start overlay, Leva panel
  ui/Infotainment       the head unit: radio, library, YouTube
  ui/MediaPlayer        live streams and track files, one media element
  vehicle/InfotainmentScreen  the live panel in the centre console
lib/
  config.ts             every tuning constant, live-editable via Leva
  road.ts               the road curve, elevation and terrain height
  roadFeatures.ts       where bridges and tunnels go, and the land under them
  ribbon.ts             curved-strip and swept-profile geometry builders
  collision.ts          OBB separating-axis test + two-body impulse response
  journey.ts            route signals, waypoints, progress and place names
  weather.ts            the clock, the sun path, and the sky as 0→1 signals
  litMaterials.ts       the handful of materials that change after dark
  junction.ts           the Kalanki underpass cut, as a terrain function
  cityGrid.ts           the street network: analytic lattice + containment
  cityBlocks.ts         what stands along each street, per tile
  city.ts               deterministic Kathmandu street layout
  biomes.ts             biome table and cross-fading
  scatter.ts            deterministic prop placement
  audio/AudioEngine.ts  Web Audio synthesis (no audio files)
  audio/MusicEngine.ts  the stereo: bansuri, madal, drone, FM colouring
  music/tracks.ts       arrangements as data, FM stations, YouTube parsing
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

### The sky is a clock

`lib/weather.ts` is the atmospheric counterpart to `journey.ts`, and
deliberately the same shape. That file turns *distance* along the route into
smooth 0→1 signals — `cityness`, `mountainness` — and every system multiplies
by them instead of branching on a stage. This one does the same with *time*.

So there is no `isNight` anywhere in the project. There is `SKY.daylight`,
which is 1 at noon and 0 after dark and spends twenty minutes in between, and
there is `SKY.lamps`, which leads it. Dusk is then a gradient rather than a
switch, which is the only way it ever looks right: the street lighting comes
on while there is still colour in the sky, and that overlap *is* dusk.

Two objects, mirroring the split in `stores/useGame.ts`. `CLOCK` is what the
player sets — the time, the rate it runs at, which weather is rolling in,
whether the light stalk has been forced. `SKY` is what falls out of that each
frame: derived, mutated in place, read by everything, subscribed to by
nothing. `<Weather/>` advances both at `UPDATE_ORDER.weather`, before traffic
and before the car, so every system sees the same sky on the same frame.

**The sun is Kathmandu's sun.** `sunPosition()` is the standard hour-angle
formula at 27.7°N, which costs six lines and buys the real thing: it rises due
east, crosses at 62° — high, but never overhead, so shadows always have a
direction — and sets due west. Driving north up the Prithvi Highway that puts
the morning sun on your right and the evening sun on your left, which is what
the drive actually looks like.

Weather is four presets, and **haze is separate from rain** because in
Kathmandu it usually is: the winter inversion traps brick-kiln smoke under the
valley rim and the hills vanish behind it without a drop falling. Each rolls
in over tens of seconds rather than cutting. Rain also leaves `wetness`
behind, which rises quickly and falls very slowly, because asphalt does — and
`wetness`, not `rain`, is what the tyres read. The ten minutes after a shower
stops are the ones that catch people out.

### One light, and a lot of things that only look like lights

There is exactly one shadow-casting light in the scene and it does both the
sun and the moon, swinging round to the moon's side of the sky as the sun goes
down and taking its colour and intensity with it. Moonlit shadows for the cost
of the shadow map that was already being drawn.

The player's headlights are two real spot lights, because the entire
experience of driving at night is watching a piece of road appear inside them.
They cast no shadows: a shadow map redrawn every frame from a viewpoint moving
at fifty metres a second, twice, would buy a hard-edged silhouette on the road
ahead, and that is not what dipped beams look like. They sit inside the car's
tilt group, so they dip under braking and lift under acceleration.

**Everything else is emissive surfaces and additive decals.** Thirty vehicles
and sixty street lamps in view is not sixty-two lights, it is a slideshow. A
sodium lamp seen from a moving car is a soft ellipse on the tarmac and a glow
at the head, and that is exactly what it is drawn as. The bloom pass already in
the post chain turns a bright unlit face into a glow, and a glow at distance is
all an oncoming headlight ever is.

That works because of `lib/litMaterials.ts`: the handful of materials that
change after dark are module-level singletons, not per-component instances.
City chunks mount and unmount constantly and none of them can afford a
subscription or a per-frame walk of the scene graph — but because every chunk
points at the *same* material object, one write lights every window in
Kathmandu, and a chunk that mounts at midnight is already lit before its first
frame. It is the same reasoning as `CONFIG`.

The cost is that everything sharing a material changes together, so anything
that should vary building-to-building has to be a *different* material. Which
is why the windows come in a lit set and a dark set, split at build time by a
hash of where the window is. Half the rooms are empty. That is one extra draw
call per chunk and it is the difference between a city and a lamp.

The car's paint is the one PBR surface in the game and it is lit by the little
procedural cubemap baked on the first frame — a blue sky and a sun, forever.
Nothing about the clock reaches it, so `scene.environmentIntensity` is turned
down after dark or the roadster drives through midnight reflecting a June
afternoon.

### Rain

One box of streaks, twenty-six metres across, kept centred on the viewpoint.
Rain is uniform and endless, so simulating a world full of it and culling buys
nothing: this is indistinguishable and costs a fixed budget however fast you
are going. The drops are not translated against the car's motion either — for
a statistically uniform field, moving every drop backwards and wrapping it
round reproduces the field you already had. What the car's speed *does* change
is the slant, and the slant is the part the eye reads as speed.

Streaks, not points. A drop crossing the frame during one exposure is a line,
which is why rain photographs and renders as lines; a field of dots reads as
snow. Draw range comes from the intensity, so drizzle costs a quarter of what
the monsoon does instead of drawing the full count at low opacity. Nothing
falls inside the Nagdhunga bore.

It reaches the driving, not just the view. Wet braking is down to 62% and the
steering is numbed rather than capped — the arcade model has no cornering cap
to lower, since it turns the car by the bicycle equation and lets it hold
whatever that asks for, so numbing the wheel is the same result from the
driver's seat and leaves the dry handling exactly as it was. The tyres protest
sooner in both directions. The wipers run, and park properly at the end of a
stroke rather than stopping mid-screen. And the audio gains three voices,
because that is how you hear rain from inside a car: the airy hiss of the
shower, the duller patter on the roof and screen, and the wet rush of spray off
the tyres, which follows `wetness` and speed rather than the sky.

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

### The stereo is synthesized too

`I`, the screen in the centre console, or the tab above the speedo opens the head unit, built to Android Auto's actual design language: a Material 3 navigation rail with an active indicator pill behind the icon, one content pane, and a persistent now-playing bar.

The rules it follows are the ones that make an automotive interface work rather than merely look dark. Surfaces are separated by **tone, not shadow or glow** — automotive UI is matte because gloss reflects a windscreen. There is **one accent** (M3 dark primary), used only for state: what is selected, what is playing; nothing decorative is coloured. Targets are 48–56dp because this is operated at arm's length while moving. Frequencies are set in **tabular numerals** so the dial does not jitter between 96.1 and 100.0. And every glyph is a **Material vector, never an emoji** — emoji inherit the platform's own glyph set, so the same screen renders as flat vectors on one machine and glossy blobs on another, at sizes and baselines nobody controls. `components/ui/Icons.tsx` holds the paths.

**The radio is the real broadcast.** `LiveRadio` points an ordinary `<audio>` element at the same URL the station's own web player uses, so tuning to 100.0 plays what is on air in Kathmandu right now. Four stations: Kantipur FM 96.1, Radio Nepal 100.0, and Radio Nepal's Bagmati and Gandaki provincial services.

Only stations with a verified live stream are listed at all. A dial full of frequencies that turn out to play synthesized filler is a toy, and worse, a toy pretending to be a radio — so Ujyaalo, Hits FM, Image FM and Sagarmatha, whose endpoints could not be confirmed, are simply not there.

Three things shape that path, and the interface says so rather than hiding them:

- **It has to be HTTPS.** An HTTP stream on an HTTPS page is blocked as mixed content. Every endpoint in `STATIONS` was checked and returns audio over TLS.
- **It cannot go through the AudioContext.** `createMediaElementSource` needs CORS headers that broadcast servers do not send, so volume and mute are applied to the media element directly rather than through the master gain.
- **Endpoints rot.** A failed or stalled stream marks that station dead for the session and hands it to the synthesizer, so the radio never just goes quiet. That fallback is a parachute, not a feature, which is why there is no switch for it.

The element is mounted for the session and only its `src` changes; remounting per station would restart buffering, which on a live stream is a two-second hole in the audio.

**Library tracks play real recordings when you supply them.** Drop an audio file at `public/music/<id>.mp3` and that track plays it instead of the synthesizer — no code change and no manifest, because a manifest that has to be kept in step with a folder eventually drifts and gives you a silent track with no obvious cause. A `file:` field on the track overrides the extension, which is how `dhading.m4a` and `deuralidada.m4a` are picked up.

Those two are also what **Follow the route** selects — Dhading Jilla Baireni Ghar through the Dhading hills, Deurali Dada on the descent from Thankot — so the real recordings are what you actually hear on the drive. `MediaPlayer` is one `<audio>` element serving both this and the radio, since a station whose stream is down and a track with no file on disk are the same situation wearing different clothes.

Those files are **gitignored on purpose** — see `public/music/README.md`. A folk *song* being traditional does not make a *recording* of it free; the performance and master are separately owned. So a fresh clone has an empty folder and a working stereo, and the library labels each track as a recording or as synthesized rather than leaving you to guess.

Anything without a file is **played live by `MusicEngine`**, out of the same oscillators and the same AudioContext as the engine note — so `M` mutes both and there is only ever one clock and one output stream. `lib/music/tracks.ts` holds arrangements as *data*: a melody line, a bass line, a taal. Four voices play them — a bansuri lead with breath noise on the attack, a sine bass, a barely-there harmonium drone, and a madal whose `dhin` is a sine dropping in pitch and whose `na` is filtered noise. Notes are scheduled a quarter-second ahead against `ctx.currentTime`, because triggering them on a JS timer gives audible jitter on any frame the main thread is busy — which in a 3D game is most of them. Radio mode is the same synth through a bandpass and a hiss floor, which is genuinely how FM differs from the same music on a phone.

Be clear about what that means. The traditional tunes are in the right idiom — right scale, right taal, a melodic shape that goes where the song goes — but they are **arrangements from memory, not transcriptions**, and a Nepali listener will hear the difference at once. That is exactly why there is a YouTube tab: for the actual recording, paste the actual recording. The interface says so on the card rather than hiding it in here.

With **Follow the route** on, the library tracks the journey — the Dhading song through Dhading, the tunnel piece in the bore, Valley Traffic once you are in town. Picking a track by hand turns it off, because a manual choice is an instruction rather than a suggestion. The region follow lives in `AudioSystem`, not in the modal, or the music would only follow the route while the screen was open.

The whole modal stays mounted and collapses to a clipped one-pixel box when closed, and the YouTube player sits outside the tab switch. Both for the same reason: an iframe stops the instant React unmounts it, and a car stereo does not stop playing when you look away from it.

## Extending

The seams are deliberate:

- **Seasons, or a sandstorm** — add a signal to `weather.ts` and a pair of colour endpoints to `Atmosphere`. Neither file needs a branch: `weather.ts` owns *when*, `Atmosphere` owns only what that should look like.
- **Fuel, GPS, dashboard extras** — add a field to `VehicleState`, render it in `CarInterior` next to the existing gauges.
- **New biomes** — append to the `BIOMES` table in `lib/biomes.ts`.
- **Multiplayer** — remote cars are just more transforms driven into the same scene; the vehicle state object is already the single authority for local motion.
