/**
 * Central tuning object.
 *
 * This is a plain mutable singleton on purpose: the physics/camera/audio
 * systems read from it every frame inside useFrame, and the Leva panel
 * writes into it directly. That gives live tuning without re-rendering
 * the React tree.
 */
export const CONFIG = {
  // ---- Road ----
  road: {
    chunkLength: 60, // metres per chunk
    chunksAhead: 7,
    chunksBehind: 2,
    laneWidth: 3.5,
    shoulderWidth: 1.6,
    // Which side of the centreline traffic keeps to. Nepal drives on the
    // left, so this is -1 (the near-side lane is at negative u) and every
    // lane assignment — the player's spawn, the traffic pool, the driver's
    // seat — derives from it rather than hard-coding a sign.
    driveSide: -1,
    groundHalfWidth: 130, // grass/terrain half-width per chunk
    lengthSegments: 24, // curve tessellation along a chunk
    groundSegments: 26, // lateral tessellation of the terrain
    railOffset: 0.18, // guardrail, measured out from the shoulder edge
    railHeight: 0.78,
    // How far inside the rail the car's centre is held. Roughly half the
    // body width, so the flank stops at the barrier rather than in it.
    barrierClearance: 1.0,
  },

  // ---- Road shape (see lib/road.ts) ----
  curve: {
    // Lateral sway: layered sines, amplitude (m) / wavelength (m).
    // Steering demand is amp·2π/wave; the sum of those stays under ~0.45
    // (about 24°) so the road is twisty but always drivable.
    sway: [
      { amp: 30, wave: 430, phase: 0.0 },
      { amp: 13, wave: 155, phase: 1.7 },
      { amp: 5, wave: 74, phase: 4.1 },
    ],
    // Extra sway that only appears in the hills — the switchbacks.
    mountainSway: { amp: 10, wave: 260, phase: 2.4 },
  },

  // ---- Off-road terrain ----
  terrain: {
    flatMargin: 9, // metres from road centre kept perfectly flat
    blendDistance: 46, // fade-in distance for hills beyond the margin
    amplitude: 1.0, // global multiplier on off-road relief
    ridgeMargin: 55, // mountains only start this far from the road
    ridgeBlend: 70, // and take this far to reach full height
    terraceStep: 4.5, // height of one farming terrace
    terraceStrength: 0.62, // how hard the hillsides snap to those steps
  },

  // ---- Bridges and tunnels (see lib/roadFeatures.ts) ----
  features: {
    ravineDepth: 34, // how deep the gorge under a bridge is
    tunnelHillHeight: 72, // the ridge Nagdhunga is bored through
    tunnelHillMargin: 130, // how far past the portals that hill extends
    tunnelRadius: 6.2, // bore radius
    tunnelWallHeight: 2.4, // straight wall below the arch
    bridgeRailHeight: 1.05,
    bridgePierSpacing: 30,
  },

  // ---- Vehicle physics (SI units: metres, seconds) ----
  vehicle: {
    maxSpeed: 50, // ~180 km/h
    maxReverseSpeed: 8,
    engineAccel: 9,
    brakeDecel: 16,
    reverseAccel: 5,
    dragCoef: 0.0028, // quadratic aero drag
    rollingResistance: 0.8,
    offRoadDrag: 4.2, // extra decel when both wheels are off the asphalt
    followDistance: 14, // start matching the speed of the car in front
    wheelBase: 2.6,
    wheelRadius: 0.34,
    maxSteerAngle: 0.55, // radians at standstill
    steerSpeedFalloff: 0.055, // higher = steering numbs faster with speed
    steerLerpRate: 6,
    steerReturnRate: 8,
    // Simple gearbox — used for engine note, tacho and shift feel.
    gearTopSpeeds: [12, 20, 29, 39, 50],
    idleRpm: 850,
    redlineRpm: 6800,
    /** Collider half-extents (x, z) used for vehicle-to-vehicle contact. */
    halfWidth: 0.95,
    halfLength: 2.35,
    mass: 1500, // kg — only the ratio against traffic masses matters
  },

  // ---- Collision response (see lib/collision.ts) ----
  collision: {
    /** Speed kept along the surface after a head-on impact. 0 = dead stop. */
    restitution: 0.22,
    /** How much of a glancing blow is shrugged off rather than absorbed. */
    slideFriction: 0.55,
    /** Yaw kick per m/s of impact, scaled by how far off-centre the hit is. */
    spinPerImpact: 0.045,
    maxSpinKick: 1.9, // rad/s
    /** Impact speed (m/s) that counts as a full-strength crash. */
    referenceImpact: 16,
    /** How fast the impact flash used by camera/audio decays. */
    impactDecay: 2.6,
    /** Damage accumulated per full-strength crash, 0..1. */
    damagePerCrash: 0.34,
    /** Impacts softer than this are ignored entirely (kerb-speed nudges). */
    minImpactSpeed: 1.2,
  },

  // ---- Camera ----
  camera: {
    fov: 72,
    // Driver's eye, car-local. Positive x is the driver's right, so this is
    // a right-hand-drive car — which is what you drive in a keep-left
    // country. CarInterior lays the whole cabin out from this x.
    // Height matters a lot: the sightline over the hood is what decides how
    // much road is visible ahead, so it is exposed in the tuning panel as
    // "seat height".
    eyeOffset: { x: 0.37, y: 1.3, z: 0.0 },
    rotationLerp: 7, // yaw lag through corners
    mouseMaxYaw: 0.75,
    mouseMaxPitch: 0.16,
    mouseLerp: 8,
    leanStrength: 0.02, // head roll into corners (per m/s² lateral)
    shakeStrength: 1.0, // multiplier on suspension bob / road vibration
  },

  // ---- Environment scatter (per chunk, per side, before biome scaling) ----
  environment: {
    treesPerSide: 8,
    rocksPerSide: 5,
    grassPerSide: 12,
    minDistFromRoad: 3, // metres beyond the shoulder edge
    maxDistFromRoad: 105,
  },

  // ---- Atmosphere ----
  sky: {
    fogColor: "#bdd7ee",
    fogNear: 80,
    fogFar: 380,
    sunPosition: [60, 90, 40] as [number, number, number],
  },

  // ---- Audio (all procedurally synthesized, no asset files) ----
  audio: {
    masterVolume: 0.7,
    engineVolume: 0.5,
    tyreVolume: 0.55,
    windVolume: 0.45,
    ambienceVolume: 0.35,
    hornVolume: 0.5,
    crashVolume: 0.85,
  },
};

/** Half-width of the drivable asphalt (both lanes). */
export const asphaltHalfWidth = () => CONFIG.road.laneWidth;

/** Half-width of asphalt + shoulders — nothing may spawn inside this. */
export const roadHalfWidth = () =>
  CONFIG.road.laneWidth + CONFIG.road.shoulderWidth;

/** Lateral offset of the guardrail line. */
export const railHalfWidth = () => roadHalfWidth() + CONFIG.road.railOffset;

/** How far off-centre the car is allowed to get before the barrier bites. */
export const driveHalfWidth = () =>
  roadHalfWidth() - CONFIG.road.barrierClearance;

/**
 * Centre of the lane you are supposed to be in, as a lateral offset.
 * Negative in Nepal — you keep left.
 */
export const ownLaneU = () => (CONFIG.road.driveSide * CONFIG.road.laneWidth) / 2;

/** Centre of the lane traffic comes at you in. */
export const oncomingLaneU = () => -ownLaneU();

/** Lane centre for a vehicle travelling in `direction` (+1 = with you). */
export const laneU = (direction: number) =>
  direction > 0 ? ownLaneU() : oncomingLaneU();
