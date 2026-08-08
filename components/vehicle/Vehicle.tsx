"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { CONFIG, driveHalfWidth, ownLaneU } from "@/lib/config";
import { Controls, UPDATE_ORDER } from "@/lib/controls";
import { contain, inGrid, onStreet, type Containment } from "@/lib/cityGrid";
import { INPUT } from "@/lib/input";
import { centerDX, isOnAsphalt, lateralOffset, sFromZ, surfaceY } from "@/lib/road";
import { CLOCK } from "@/lib/weather";
import { useGame } from "@/stores/useGame";
import { CarExterior } from "./CarExterior";
import { CarInterior } from "./CarInterior";
import { Headlights } from "./Headlights";

/**
 * Vehicle
 * -------
 * Arcade car physics: a single rigid body with signed forward speed and a
 * simplified bicycle model for steering
 * (yawRate = v / wheelBase · tan(steer)). Steering authority shrinks with
 * speed, so the car is stable at motorway pace but agile when slow.
 *
 * On top of that it derives the values the rest of the game reacts to:
 * a five-speed gearbox (engine note, tacho, shift feel), tyre slip
 * (screech, camera shake), surface type (gravel drag and rumble), and the
 * road slope under the wheels (the car drives over crests and dips).
 *
 * The Rapier body is kinematic: this code owns the motion, Rapier just
 * carries a collider for the static world. Traffic collisions are resolved
 * analytically in <Traffic/> instead (see lib/collision.ts) and hand back
 * three things this integrates: `spin`, a yaw rate that unwinds; `pushX/Z`,
 * a world-space knock the arcade model has no other way to express; and
 * `impact`, the flash the camera and audio react to.
 *
 * Convention: yaw = 0 faces -Z, positive yaw turns left.
 */
export function Vehicle() {
  const [, getKeys] = useKeyboardControls<Controls>();

  const bodyRef = useRef<RapierRigidBody>(null);
  const groupRef = useRef<THREE.Group>(null); // position + yaw + road pitch
  const tiltRef = useRef<THREE.Group>(null); // visual-only roll/pitch

  // Scratch objects reused every frame to avoid per-frame allocation.
  const scratch = useRef({
    forward: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    euler: new THREE.Euler(0, 0, 0, "YXZ"),
    containment: { x: 0, z: 0, corrected: false, push: 0 } as Containment,
  }).current;

  useFrame((_, dt) => {
    const v = CONFIG.vehicle;
    const car = useGame.getState().vehicle;
    const keys = getKeys();

    // ---- Two inputs, one pair of numbers ----
    // The keys were always reduced to a throttle and a steering value
    // before anything used them, and the bicycle model below takes a
    // continuous steer angle rather than a direction — so the keyboard was
    // never really digital, it was an analogue input only ever handed -1, 0
    // or 1. Tilt and the on-screen wheel fill in the rest of the range and
    // nothing downstream changes.
    //
    // A pressed key always wins. That way a laptop with a touchscreen
    // behaves like a laptop right up until someone puts a thumb on a pedal.
    const keyThrottle = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
    const keySteer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    const throttle = keyThrottle !== 0 ? keyThrottle : INPUT.throttle;
    const steering = keySteer !== 0 ? keySteer : INPUT.steer;
    const prevSpeed = car.speed;
    car.throttle = throttle;

    // ---- How wet the road is ----
    // Read once and used three times below. This is `wetness`, not `rain`:
    // the tyres do not care whether it is falling, only what is on the
    // asphalt, and that is still there ten minutes after a shower stops.
    const wet = CLOCK.wetness;
    const w = CONFIG.weather;
    const wetBrake = 1 - (1 - w.wetBraking) * wet;
    const wetGrip = 1 - (1 - w.wetGrip) * wet;

    // ---- Longitudinal forces ----
    // A battered car does not pull as hard. Enough to notice after a bad
    // run through the traffic, not enough to strand you.
    // Scaled by how far the pedal is down, which for a key is always all
    // the way — so this is identical on the keyboard and correct on a
    // half-pressed analogue input.
    const health = 1 - 0.35 * car.damage;
    if (throttle > 0) {
      car.speed += v.engineAccel * health * throttle * dt;
    } else if (throttle < 0) {
      const pedal = -throttle;
      if (car.speed > 0.1) {
        car.speed -= v.brakeDecel * wetBrake * pedal * dt; // braking
      } else {
        car.speed -= v.reverseAccel * pedal * dt; // reversing
      }
    }
    car.braking = throttle < 0 && prevSpeed > 0.1;

    // Aero drag (quadratic) + rolling resistance, plus a penalty for
    // leaving the asphalt — gravel scrubs off speed noticeably.
    //
    // That penalty ramps in with speed rather than applying flat. A
    // constant 4.2 m/s² is a wall the drivetrain has to push through even
    // at a standstill, and it happened to cancel reverse exactly, so a car
    // that had put a wheel on the shoulder could not back off it. Drag that
    // grows with speed is also closer to the truth: it is the tyres
    // ploughing, and at a crawl they are not ploughing anything.
    let resistance = v.dragCoef * car.speed * car.speed + v.rollingResistance;
    if (car.offRoad) {
      const bite = Math.min(1, Math.abs(car.speed) / v.offRoadDragRamp);
      resistance += v.offRoadDrag * bite;
    }

    if (car.speed > 0) car.speed = Math.max(0, car.speed - resistance * dt);
    else if (car.speed < 0) car.speed = Math.min(0, car.speed + resistance * dt);

    car.speed = THREE.MathUtils.clamp(
      car.speed,
      -v.maxReverseSpeed,
      v.maxSpeed * health
    );

    // ---- Don't drive through the vehicle in front ----
    // Close on it freely, then match its speed. Pull out into the other
    // lane and the traffic system stops reporting it, so you get past.
    const { leadGap, leadSpeed } = useGame.getState().traffic;
    if (leadGap < v.followDistance && car.speed > leadSpeed) {
      const closeness = 1 - leadGap / v.followDistance;
      const matched = leadSpeed + (car.speed - leadSpeed) * (1 - closeness);
      car.speed = THREE.MathUtils.damp(car.speed, matched, 8, dt);
      car.braking = car.braking || closeness > 0.4;
    }

    car.acceleration = (car.speed - prevSpeed) / Math.max(dt, 1e-4);

    // ---- Steering: less authority at speed, and less again when wet ----
    // Wet grip is applied to how far the wheels will bite rather than as a
    // hard cornering cap, because the arcade model has no cap to lower: it
    // turns the car by the bicycle equation and lets it hold whatever that
    // asks for. Numbing the wheel is the same result from the driver's
    // seat — the car will not take the line you point it at — and it leaves
    // the dry handling exactly as it was.
    const speedFactor = 1 / (1 + Math.abs(car.speed) * v.steerSpeedFalloff);
    const targetSteer = steering * v.maxSteerAngle * speedFactor * wetGrip;
    const rate = steering === 0 ? v.steerReturnRate : v.steerLerpRate;
    car.steerAngle = THREE.MathUtils.damp(car.steerAngle, targetSteer, rate, dt);

    // Bicycle model. The sign of speed flips turning while reversing —
    // physically correct, and it feels right on the stick.
    let yawRate = 0;
    if (Math.abs(car.speed) > 0.05) {
      yawRate = (car.speed / v.wheelBase) * Math.tan(car.steerAngle);
      car.yaw += yawRate * dt;
    }

    // Collision spin, on top of whatever the wheels are asking for. It
    // unwinds as the tyres bite again — quickly at speed, where there is
    // grip to straighten the car, slowly at a crawl.
    if (Math.abs(car.spin) > 1e-4) {
      car.yaw += car.spin * dt;
      yawRate += car.spin;
      car.spin *= Math.exp(-(2.2 + Math.abs(car.speed) * 0.16) * dt);
    }

    // Lateral (cornering) acceleration drives tyre scrub and camera lean.
    car.lateralAccel = car.speed * yawRate;

    // ---- Integrate position along the ground ----
    scratch.forward.set(-Math.sin(car.yaw), 0, -Math.cos(car.yaw));
    car.position.addScaledVector(scratch.forward, car.speed * dt);

    // Sideways knock from an impact, bled off by the tyres.
    if (car.pushX !== 0 || car.pushZ !== 0) {
      car.position.x += car.pushX * dt;
      car.position.z += car.pushZ * dt;
      const bleed = Math.exp(-4.5 * dt);
      car.pushX *= bleed;
      car.pushZ *= bleed;
      if (Math.abs(car.pushX) + Math.abs(car.pushZ) < 0.01) {
        car.pushX = 0;
        car.pushZ = 0;
      }
    }

    car.distance += Math.abs(car.speed) * dt;
    car.wheelSpin += (car.speed / v.wheelRadius) * dt;

    // ---- Stay on the road ----
    // Two different worlds, and the car is held in whichever it is in.
    //
    // On the highway there is one road, so the car is clamped to a lateral
    // offset from it. That matters most on bridges, where "off the road" is
    // a thirty-metre drop, and it keeps the drive pointed at the road
    // rather than across the scenery.
    //
    // In the city there is a network, so the car is held on the union of
    // the streets instead — free to turn at any junction, stopped by the
    // buildings. The handover is seamless because the grid's avenue 0 is
    // the highway, with the same centreline and the same half-width.
    let offset = lateralOffset(car.position.x, car.position.z);
    let scrape = 0;
    const city = inGrid(car.position.z);

    if (city) {
      const held = contain(car.position.x, car.position.z, scratch.containment);
      if (held.corrected) {
        car.position.x = held.x;
        car.position.z = held.z;
        car.speed *= 1 - Math.min(0.6, held.push * 6) * dt * 4;
        scrape = Math.min(1, 0.35 + held.push * 4);
      }
      offset = lateralOffset(car.position.x, car.position.z);
    } else {
      const limit = driveHalfWidth();
      if (Math.abs(offset) > limit) {
        // Push straight back along the road normal, which leaves distance
        // travelled untouched — correcting via roadPoint would shunt the
        // car up to a metre forward or back and read as a lurch.
        const s = sFromZ(car.position.z);
        const dx = centerDX(s);
        const len = Math.hypot(dx, 1);
        const dir = Math.sign(offset);
        const push = Math.abs(offset) - limit;

        car.position.x -= (dir * push) / len;
        car.position.z -= (dir * push * dx) / len;
        offset = dir * limit;

        // Scrubbing along a barrier costs speed and howls.
        car.speed *= 1 - Math.min(0.6, push * 6) * dt * 4;
        scrape = Math.min(1, 0.35 + push * 4);
      }
    }

    // ---- Follow the road surface ----
    // surfaceY, not groundY: on a bridge the ground is the gorge floor
    // far below, while the surface under the wheels is the deck.
    const y = surfaceY(car.position.x, car.position.z);
    car.position.y = y;

    // Pitch from the slope in the direction we are actually travelling:
    // sample the surface one metre ahead of the nose.
    const aheadY = surfaceY(
      car.position.x + scratch.forward.x,
      car.position.z + scratch.forward.z
    );
    car.pitch = THREE.MathUtils.damp(car.pitch, Math.atan(aheadY - y), 8, dt);

    // ---- Surface + tyre slip ----
    car.lateral = offset;
    // In the city "on the asphalt" means on any street, not within a lane
    // width of the highway — otherwise every side street reports as gravel
    // and the car ploughs through town with the off-road drag on.
    car.offRoad = city
      ? !onStreet(car.position.x, car.position.z)
      : !isOnAsphalt(offset);

    // Nepal keeps left. Straying onto the offside is legal enough to
    // overtake with, but the HUD says so and oncoming traffic reacts.
    // Only meaningful on the highway: on a side street with no centre line
    // there is no offside to be on.
    car.wrongLane = !city && offset * Math.sign(ownLaneU()) < -0.6;

    // Wet asphalt starts protesting sooner, in both directions — the
    // thresholds come down by `wetSlipOnset`, so the same corner that was
    // quiet in the dry now squeals through it.
    const onset = 1 - (1 - w.wetSlipOnset) * wet;
    const corneringSlip = THREE.MathUtils.clamp(
      (Math.abs(car.lateralAccel) - 5.5 * onset) / 8, 0, 1
    );
    const brakingSlip = car.braking
      ? THREE.MathUtils.clamp((-car.acceleration - 11 * onset) / 6, 0, 1)
      : 0;
    const target = Math.min(
      1,
      Math.max(corneringSlip, brakingSlip, scrape, car.impact) *
        (car.offRoad ? 1.35 : 1)
    );
    car.slip = THREE.MathUtils.damp(car.slip, target, 9, dt);

    // ---- Gearbox (drives engine note, tacho and shift feel) ----
    updateDrivetrain(car, throttle, dt);

    // ---- Sync visuals + physics body ----
    if (groupRef.current) {
      groupRef.current.position.copy(car.position);
      groupRef.current.rotation.order = "YXZ";
      groupRef.current.rotation.y = car.yaw;
      groupRef.current.rotation.x = car.pitch;
    }
    if (bodyRef.current) {
      bodyRef.current.setNextKinematicTranslation(car.position);
      scratch.euler.set(car.pitch, car.yaw, 0);
      scratch.quat.setFromEuler(scratch.euler);
      bodyRef.current.setNextKinematicRotation(scratch.quat);
    }

    // Visual-only body roll into corners + squat/dive under accel/braking.
    if (tiltRef.current) {
      const roll = THREE.MathUtils.clamp(car.lateralAccel * 0.006, -0.055, 0.055);
      const dive = THREE.MathUtils.clamp(car.acceleration * -0.0055, -0.028, 0.045);
      tiltRef.current.rotation.z = THREE.MathUtils.damp(
        tiltRef.current.rotation.z, roll, 6, dt
      );
      tiltRef.current.rotation.x = THREE.MathUtils.damp(
        tiltRef.current.rotation.x, dive, 6, dt
      );
    }
  }, UPDATE_ORDER.vehicle);

  return (
    <>
      {/* Kinematic collider — driven by the arcade physics above. */}
      <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false}>
        <CuboidCollider args={[0.9, 0.7, 2.1]} position={[0, 0.7, 0]} />
      </RigidBody>

      {/* Car visuals. Front points toward -Z. */}
      <group ref={groupRef}>
        <group ref={tiltRef}>
          <CarExterior />
          <CarInterior />
          {/* Inside the tilt group, so the beams dip and lift with the body */}
          <Headlights />
        </group>
      </group>
    </>
  );
}

/**
 * Five-speed gearbox model.
 * Each gear maps its speed band onto the rev range, so accelerating hard
 * sweeps the tacho up and drops it on each shift.
 */
function updateDrivetrain(
  car: ReturnType<typeof useGame.getState>["vehicle"],
  throttle: number,
  dt: number
) {
  const v = CONFIG.vehicle;
  const speed = Math.abs(car.speed);
  const tops = v.gearTopSpeeds;

  let gear: number;
  let rpmNorm: number;

  if (car.speed < -0.2) {
    gear = -1;
    rpmNorm = Math.min(speed / v.maxReverseSpeed, 1);
  } else if (speed < 0.4) {
    // Stationary: idle, or blip the throttle in neutral.
    gear = 0;
    rpmNorm = throttle > 0 ? 0.28 : 0;
  } else {
    let index = tops.findIndex((top) => speed <= top);
    if (index === -1) index = tops.length - 1;
    const bottom = index === 0 ? 0 : tops[index - 1];
    gear = index + 1;
    rpmNorm = (speed - bottom) / (tops[index] - bottom);
  }

  car.gear = gear;
  const targetRpm = v.idleRpm + rpmNorm * (v.redlineRpm - v.idleRpm);
  // Light smoothing: fast enough to keep the shift drop audible.
  car.rpm = THREE.MathUtils.damp(car.rpm, targetRpm, 14, dt);
}
