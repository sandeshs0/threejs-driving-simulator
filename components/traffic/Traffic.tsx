"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CONFIG, laneU, ownLaneU, roadHalfWidth } from "@/lib/config";
import { UPDATE_ORDER } from "@/lib/controls";
import { cityness } from "@/lib/journey";
import { roadPoint, roadYaw, sFromZ } from "@/lib/road";
import {
  forwardX,
  forwardZ,
  makeContact,
  makeResolution,
  overlap,
  resolve,
  rightX,
  rightZ,
  type Body,
  type Obb,
} from "@/lib/collision";
import { useGame, type Blip } from "@/stores/useGame";
import { TrafficBody, type TrafficKind } from "./TrafficBody";

/**
 * Traffic
 * -------
 * A fixed pool of vehicles that live on the road curve and recycle around
 * the player, so traffic is always present without ever being simulated
 * far away.
 *
 * Each slot keeps its type for the lifetime of the pool and only its
 * position and speed are recycled — that way the React tree never changes
 * and the whole system is transform updates in two useFrame passes:
 *
 *  1. `move` (UPDATE_ORDER.traffic) — drive every slot along the road,
 *     react to the player, publish the gap to the car ahead and the radar
 *     blips. Runs before the player's physics, which reads that gap.
 *
 *  2. `collide` (UPDATE_ORDER.collision) — runs after the player has
 *     integrated, so both bodies are where they actually are this frame,
 *     and resolves any real contact between them.
 *
 * Vehicles are not scenery. They hold you up, they brake when you loom in
 * their mirrors, they swerve off a head-on, and if you hit one you both
 * feel it. Getting stuck behind a bus is the authentic experience; so is
 * clipping a motorbike that filtered up your inside.
 */

interface Slot {
  kind: TrafficKind;
  /** +1 travelling with the player, -1 oncoming. */
  direction: number;
  /** Only appears once the road reaches the city. */
  cityOnly: boolean;
  s: number;
  /** Lane centre this driver is aiming for, in road-space u. */
  laneTarget: number;
  /** Where it actually is laterally — lags the target, and gets shoved. */
  u: number;
  /** Lateral velocity, from being hit or from swerving (m/s). */
  driftU: number;
  speed: number;
  /** Speed it wants to be doing; `speed` is damped toward it. */
  cruise: number;
  /** Motorbikes drift across their lane instead of tracking it exactly. */
  weave: number;
  /** Yaw wobble left over from an impact (rad), decays. */
  wobble: number;
}

const POOL: { kind: TrafficKind; direction: number; cityOnly: boolean }[] = [
  { kind: "bus", direction: 1, cityOnly: false },
  { kind: "bus", direction: -1, cityOnly: false },
  { kind: "truck", direction: -1, cityOnly: false },
  { kind: "truck", direction: 1, cityOnly: false },
  { kind: "micro", direction: 1, cityOnly: false },
  { kind: "micro", direction: -1, cityOnly: false },
  { kind: "taxi", direction: 1, cityOnly: true },
  { kind: "taxi", direction: -1, cityOnly: true },
  { kind: "taxi", direction: 1, cityOnly: true },
  { kind: "bike", direction: 1, cityOnly: true },
  { kind: "bike", direction: -1, cityOnly: true },
  { kind: "bike", direction: 1, cityOnly: true },
  { kind: "bike", direction: -1, cityOnly: false },
  { kind: "van", direction: 1, cityOnly: true },
  { kind: "van", direction: -1, cityOnly: false },
  { kind: "tempo", direction: 1, cityOnly: true },
];

/** Cruising speeds in m/s, by type. Buses and trucks are the hold-ups. */
const SPEEDS: Record<TrafficKind, [number, number]> = {
  bus: [8, 12],
  truck: [7, 11],
  micro: [11, 16],
  taxi: [12, 18],
  bike: [13, 20],
  van: [10, 15],
  tempo: [8, 12],
};

/**
 * Collider footprint and mass per type, matched to the meshes in
 * TrafficBody. Mass is what makes the impacts read differently: a bike
 * bounces off you, a loaded Tata does not notice you are there.
 */
const DIMS: Record<TrafficKind, { halfW: number; halfL: number; mass: number }> = {
  bus: { halfW: 1.28, halfL: 5.0, mass: 12000 },
  truck: { halfW: 1.24, halfL: 4.1, mass: 14000 },
  micro: { halfW: 1.02, halfL: 2.6, mass: 2600 },
  van: { halfW: 1.02, halfL: 2.6, mass: 2600 },
  taxi: { halfW: 0.86, halfL: 1.98, mass: 1150 },
  tempo: { halfW: 0.78, halfL: 1.7, mass: 900 },
  bike: { halfW: 0.34, halfL: 0.95, mass: 190 },
};

const AHEAD = 300;
const BEHIND = 140;

/** How far a vehicle may stray from the centreline before the kerb stops it. */
const strayLimit = () => roadHalfWidth() - 0.9;

export function Traffic() {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  const slots = useMemo<Slot[]>(
    () =>
      POOL.map((base, i) => {
        const lane = laneU(base.direction);
        return {
          ...base,
          // Spread the pool out along the road at the start.
          s: (i / POOL.length) * (AHEAD + BEHIND) - BEHIND,
          laneTarget: lane,
          u: lane,
          driftU: 0,
          speed: SPEEDS[base.kind][0],
          cruise: SPEEDS[base.kind][0],
          weave: Math.random() * Math.PI * 2,
          wobble: 0,
        };
      }),
    []
  );

  // Radar blips are allocated once and mutated in place — the minimap reads
  // this array every frame and nothing subscribes to it.
  const blips = useMemo<Blip[]>(
    () =>
      POOL.map((base) => ({
        x: 0,
        z: 0,
        yaw: 0,
        size: DIMS[base.kind].halfL,
        active: false,
        oncoming: base.direction < 0,
      })),
    []
  );

  const scratch = useRef({
    p: { x: 0, y: 0, z: 0 },
    contact: makeContact(),
    resolution: makeResolution(),
    playerBox: { x: 0, z: 0, yaw: 0, halfW: 0, halfL: 0 } as Obb,
    otherBox: { x: 0, z: 0, yaw: 0, halfW: 0, halfL: 0 } as Obb,
    playerBody: {} as Body,
    otherBody: {} as Body,
  }).current;

  // ---------------------------------------------------------------- move

  useFrame((_, dt) => {
    const car = useGame.getState().vehicle;
    const traffic = useGame.getState().traffic;
    if (traffic.blips !== blips) traffic.blips = blips;

    const playerS = sFromZ(car.position.z);
    const urban = cityness(playerS);
    const limit = strayLimit();

    let leadGap = Infinity;
    let leadSpeed = 0;

    slots.forEach((slot, i) => {
      const group = groupRefs.current[i];
      const blip = blips[i];
      if (!group) return;

      // Thin the city-only vehicles out on the hill road.
      const active = !slot.cityOnly || urban > 0.35;
      group.visible = active;
      blip.active = active;
      if (!active) return;

      // Recycle once it leaves the band around the player.
      const relative = (slot.s - playerS) * slot.direction;
      if (relative > AHEAD || relative < -BEHIND) {
        const [min, max] = SPEEDS[slot.kind];
        // Denser and slower once inside the city.
        slot.cruise = (min + Math.random() * (max - min)) * (urban > 0.5 ? 0.75 : 1);
        slot.speed = slot.cruise;
        slot.laneTarget = laneU(slot.direction);
        slot.u = slot.laneTarget;
        slot.driftU = 0;
        slot.wobble = 0;
        // Respawn at the far end of the band it just left.
        slot.s =
          relative > AHEAD
            ? playerS - BEHIND * slot.direction
            : playerS + AHEAD * slot.direction;
      }

      driveTowardPlayer(slot, car, playerS, dt);

      slot.speed = THREE.MathUtils.damp(slot.speed, slot.cruise, 1.6, dt);
      slot.s += slot.speed * slot.direction * dt;

      // Lateral: a spring back toward the lane the driver wants, plus
      // whatever momentum a shunt left behind. Damped rather than snapped,
      // so being nudged reads as the other driver recovering.
      slot.driftU += (slot.laneTarget - slot.u) * 4.5 * dt;
      slot.driftU *= Math.exp(-3.2 * dt);
      slot.u = THREE.MathUtils.clamp(slot.u + slot.driftU * dt, -limit, limit);

      slot.wobble *= Math.exp(-2.4 * dt);

      // Two-wheelers never hold a line.
      slot.weave += dt * 0.8;
      const lane = slot.u + (slot.kind === "bike" ? Math.sin(slot.weave) * 0.9 : 0);

      roadPoint(lane, slot.s, scratch.p);
      const yaw =
        roadYaw(slot.s) + (slot.direction > 0 ? 0 : Math.PI) + slot.wobble;

      group.position.set(scratch.p.x, scratch.p.y, scratch.p.z);
      group.rotation.y = yaw;

      blip.x = scratch.p.x;
      blip.z = scratch.p.z;
      blip.yaw = yaw;

      // Is this the vehicle we are about to run into? Only same-direction
      // traffic counts, and only if it is genuinely in our lane — pulling
      // out to overtake clears the obstruction, as it should.
      if (slot.direction > 0) {
        const gap = slot.s - playerS;
        if (gap > 0 && gap < leadGap && Math.abs(lane - car.lateral) < 2.2) {
          leadGap = gap;
          leadSpeed = slot.speed;
        }
      }
    });

    traffic.leadGap = leadGap;
    traffic.leadSpeed = leadSpeed;
  }, UPDATE_ORDER.traffic);

  // ------------------------------------------------------------- collide

  useFrame((_, dt) => {
    const car = useGame.getState().vehicle;
    const v = CONFIG.vehicle;
    const c = CONFIG.collision;
    const playerS = sFromZ(car.position.z);

    const pfx = forwardX(car.yaw);
    const pfz = forwardZ(car.yaw);

    const box = scratch.playerBox;
    box.x = car.position.x;
    box.z = car.position.z;
    box.yaw = car.yaw;
    box.halfW = v.halfWidth;
    box.halfL = v.halfLength;

    const a = scratch.playerBody as Body;
    a.x = box.x;
    a.z = box.z;
    a.yaw = car.yaw;
    a.mass = v.mass;
    a.halfW = box.halfW;
    a.halfL = box.halfL;

    let hardest = 0;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const group = groupRefs.current[i];
      if (!group || !group.visible) continue;

      // Cheap reject first: anything more than a bus-length away in road
      // distance cannot be touching us, and that is nearly all of them.
      if (Math.abs(slot.s - playerS) > 14) continue;

      const dims = DIMS[slot.kind];
      const other = scratch.otherBox;
      other.x = group.position.x;
      other.z = group.position.z;
      other.yaw = group.rotation.y;
      other.halfW = dims.halfW;
      other.halfL = dims.halfL;

      if (!overlap(box, other, scratch.contact)) continue;

      // Velocities, in world space. Traffic always moves along its own
      // facing, so `direction` is already baked into its yaw.
      const ofx = forwardX(other.yaw);
      const ofz = forwardZ(other.yaw);
      const orx = rightX(other.yaw);
      const orz = rightZ(other.yaw);

      // The lateral drift is measured in road space, where +u is to the
      // right of increasing s; for oncoming traffic that is the opposite of
      // its own right, hence the direction factor.
      const driftWorld = slot.driftU * slot.direction;

      const b = scratch.otherBody as Body;
      b.x = other.x;
      b.z = other.z;
      b.yaw = other.yaw;
      b.vx = ofx * slot.speed + orx * driftWorld;
      b.vz = ofz * slot.speed + orz * driftWorld;
      b.mass = dims.mass;
      b.halfW = other.halfW;
      b.halfL = other.halfL;

      a.vx = pfx * car.speed + car.pushX;
      a.vz = pfz * car.speed + car.pushZ;

      const r = resolve(a, b, scratch.contact, scratch.resolution);
      const n = scratch.contact;

      // ---- Separate ----
      car.position.x += r.pushA * n.nx;
      car.position.z += r.pushA * n.nz;

      const pushAlong = r.pushB * (n.nx * ofx + n.nz * ofz);
      const pushAcross = r.pushB * (n.nx * orx + n.nz * orz);
      slot.s += pushAlong * slot.direction;
      slot.u = THREE.MathUtils.clamp(
        slot.u + pushAcross * slot.direction,
        -strayLimit(),
        strayLimit()
      );

      // Nothing more to transmit if they were already moving apart.
      if (r.impactSpeed <= c.minImpactSpeed) continue;

      // ---- Player response ----
      // Split the new velocity into "along the car" (which is the arcade
      // model's own speed) and "sideways" (which it has no concept of, so
      // it becomes a decaying world-space knock).
      car.speed = r.avx * pfx + r.avz * pfz;
      car.pushX = r.avx - pfx * car.speed;
      car.pushZ = r.avz - pfz * car.speed;
      car.spin += r.spinA * c.spinPerImpact * r.impactSpeed;

      // ---- Traffic response ----
      slot.speed = Math.max(0, r.bvx * ofx + r.bvz * ofz);
      slot.driftU += (r.bvx * orx + r.bvz * orz) * slot.direction;
      slot.wobble += r.spinB * 0.12;
      // Whoever just got hit is not going to carry on at cruising speed.
      slot.cruise = Math.min(slot.cruise, slot.speed + 2);

      const severity = Math.min(1, r.impactSpeed / c.referenceImpact);
      if (severity > hardest) hardest = severity;
    }

    if (hardest > 0) {
      car.impact = Math.max(car.impact, hardest);
      car.damage = Math.min(1, car.damage + hardest * c.damagePerCrash);
      car.crashes += 1;
    }
    car.impact = Math.max(0, car.impact - c.impactDecay * dt);
  }, UPDATE_ORDER.collision);

  return (
    <group>
      {slots.map((slot, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
        >
          <TrafficBody kind={slot.kind} seed={i} />
        </group>
      ))}
    </group>
  );
}

/**
 * The bit of AI that makes traffic feel driven rather than played back.
 *
 *  - Same-direction traffic behind the player lifts off when the player is
 *    close in front, instead of walking straight into the back of them.
 *  - Oncoming traffic that finds you on its side of the road pulls over
 *    hard. In Nepal that is the near side — its left — so it dives toward
 *    the kerb, which is the direction that actually clears the conflict.
 *  - Once you are past, everyone drifts back to their lane.
 */
function driveTowardPlayer(
  slot: Slot,
  car: ReturnType<typeof useGame.getState>["vehicle"],
  playerS: number,
  dt: number
) {
  const lane = laneU(slot.direction);
  // >0 when the player is in front of this vehicle, whichever way it faces.
  const ahead = (playerS - slot.s) * slot.direction;
  const sameLane = Math.abs(car.lateral - slot.u) < 2.4;

  slot.laneTarget = lane;

  if (slot.direction > 0) {
    // Following the player: back off if we are closing on them.
    if (ahead > 0 && ahead < 16 && sameLane) {
      const closeness = 1 - ahead / 16;
      slot.cruise = Math.min(
        slot.cruise,
        Math.max(0, Math.abs(car.speed) * (1 - closeness * 0.35))
      );
    }
  } else if (ahead > 0 && ahead < 70) {
    // Head-on. Are they on our side of the road?
    const onOurSide = Math.abs(car.lateral - lane) < 2.6;
    if (onOurSide) {
      // Dive for the kerb — the near side, whichever way that is here.
      const kerb = Math.sign(ownLaneU()) * strayLimit();
      const urgency = 1 - ahead / 70;
      slot.laneTarget = THREE.MathUtils.lerp(lane, kerb, urgency);
      slot.cruise = Math.min(slot.cruise, 4 + (1 - urgency) * 8);
    }
  }

  // Recover toward the posted cruise once the drama is over.
  const [min, max] = SPEEDS[slot.kind];
  slot.cruise = THREE.MathUtils.damp(slot.cruise, (min + max) / 2, 0.35, dt);
}
