import { create } from "zustand";
import * as THREE from "three";
import { ownLaneU } from "@/lib/config";
import { roadPoint, roadYaw } from "@/lib/road";
import { CameraMode } from "@/lib/controls";

/**
 * Spawn the car on the road rather than at a hard-coded point.
 *
 * The centreline is not at x = 0 at s = 0 — the sway terms sum to roughly
 * x = 9 there — so a fixed spawn drops the car into the scenery beside the
 * road. Deriving it from the same curve everything else uses puts the car
 * in the near-side (left) lane, pointing along the road, wherever that is.
 */
function spawn() {
  const p = roadPoint(ownLaneU(), 0);
  return {
    position: new THREE.Vector3(p.x, p.y, p.z),
    yaw: roadYaw(0),
  };
}

/**
 * Game state, split into two halves:
 *
 * 1. `vehicle` — a mutable object updated in-place every frame inside
 *    useFrame ("transient updates"). Nothing subscribes to it reactively,
 *    so mutating it costs zero React renders. Audio, camera, HUD and the
 *    road manager all read from it.
 *
 * 2. reactive slices (`hud`, `started`) — small, updated rarely, and the
 *    only things the DOM re-renders from.
 */
export interface VehicleState {
  position: THREE.Vector3;
  yaw: number;
  pitch: number; // road slope under the car (rad)
  speed: number; // m/s, signed (negative = reversing)
  steerAngle: number; // current front-wheel angle (rad)
  acceleration: number; // longitudinal accel (m/s²)
  lateralAccel: number; // cornering force proxy (m/s²)
  throttle: number; // -1..1 as pressed this frame
  braking: boolean; // brake pedal actually slowing us down
  offRoad: boolean; // both wheels off the asphalt
  slip: number; // 0..1 tyre protest (hard cornering / braking)
  rpm: number;
  gear: number; // -1 reverse, 0 neutral/idle, 1..5 forward
  lateral: number; // signed offset from the road centreline (m)
  distance: number; // odometer, metres
  wheelSpin: number; // accumulated wheel rotation (rad)

  // ---- Collision state (written by the collision pass in Traffic) ----
  spin: number; // collision-induced yaw rate (rad/s), decays to 0
  pushX: number; // world-space knock velocity from an impact (m/s)
  pushZ: number;
  impact: number; // 0..1 flash of the last hit, drives shake and crash audio
  damage: number; // 0..1 accumulated panel damage
  crashes: number; // how many hits, for the HUD
  wrongLane: boolean; // driving on the offside — you keep left here
}

/**
 * What the traffic system knows about the vehicle directly ahead in our
 * lane. Mutated in place each frame before the vehicle update, which reads
 * it to avoid driving through the car in front.
 */
export interface TrafficState {
  leadGap: number; // metres, Infinity when the road ahead is clear
  leadSpeed: number; // m/s
  /**
   * Live world positions of every active traffic vehicle, refreshed in
   * place each frame. The minimap reads this; nothing subscribes to it.
   */
  blips: Blip[];
}

export interface Blip {
  x: number;
  z: number;
  yaw: number;
  /** Rough footprint, so a bus reads bigger than a motorbike on the radar. */
  size: number;
  active: boolean;
  /** Oncoming vehicles are drawn in a different colour. */
  oncoming: boolean;
}

export interface HudState {
  speedKmh: number;
  fps: number;
  distanceKm: number;
  gear: number;
  biome: string;
  place: string;
  /** 0..1 along the scripted route, for the progress bar. */
  progress: number;
  /** Next waypoint on the route, and how far it still is. */
  nextName: string;
  nextDistanceM: number;
  damage: number;
  crashes: number;
  wrongLane: boolean;
}

interface GameStore {
  vehicle: VehicleState;
  traffic: TrafficState;
  hud: HudState;
  started: boolean;
  muted: boolean;
  cameraMode: CameraMode;
  /** Full-screen route map, toggled with Tab. */
  mapExpanded: boolean;
  setHud: (hud: HudState) => void;
  start: () => void;
  toggleMute: () => void;
  cycleCamera: () => void;
  toggleMap: () => void;
}

export const useGame = create<GameStore>((set) => ({
  vehicle: {
    // Centred in the right-hand lane, aligned with the road.
    ...spawn(),
    pitch: 0,
    speed: 0,
    steerAngle: 0,
    acceleration: 0,
    lateralAccel: 0,
    throttle: 0,
    braking: false,
    offRoad: false,
    slip: 0,
    rpm: 850,
    gear: 1,
    lateral: 0,
    distance: 0,
    wheelSpin: 0,
    spin: 0,
    pushX: 0,
    pushZ: 0,
    impact: 0,
    damage: 0,
    crashes: 0,
    wrongLane: false,
  },
  traffic: { leadGap: Infinity, leadSpeed: 0, blips: [] },
  hud: {
    speedKmh: 0,
    fps: 0,
    distanceKm: 0,
    gear: 1,
    biome: "terraced hills",
    place: "Dhading · Prithvi Highway",
    progress: 0,
    nextName: "Nagdhunga Tunnel",
    nextDistanceM: 2400,
    damage: 0,
    crashes: 0,
    wrongLane: false,
  },
  started: false,
  muted: false,
  cameraMode: CameraMode.Driver,
  mapExpanded: false,
  setHud: (hud) => set({ hud }),
  start: () => set({ started: true }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  cycleCamera: () => set((s) => ({ cameraMode: (s.cameraMode + 1) % 3 })),
  toggleMap: () => set((s) => ({ mapExpanded: !s.mapExpanded })),
}));
