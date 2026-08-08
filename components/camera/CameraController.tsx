"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { CONFIG } from "@/lib/config";
import { CameraMode, UPDATE_ORDER } from "@/lib/controls";
import { useGame } from "@/stores/useGame";

/**
 * CameraController
 * ----------------
 * Three viewpoints, cycled with C:
 *
 *  Driver     first-person from the seat. The camera is *derived* from the
 *             vehicle rather than parented to it, which lets yaw lag, head
 *             lean, road pitch, dive and suspension shake be layered
 *             independently.
 *  Chase      classic third-person. Trails behind on a spring and pulls
 *             back and widens with speed.
 *  Cinematic  slow orbit at ride height, for looking at the car.
 *
 * All three write into the same camera. Switching modes lerps the position
 * rather than cutting, so a mode change reads as a move, not a jump — the
 * one exception is that Driver mode snaps its rotation, since a lagging
 * head would be nauseating.
 */
export function CameraController() {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const mode = useGame((s) => s.cameraMode);
  const cycleCamera = useGame((s) => s.cycleCamera);

  // Mouse position normalized to [-1, 1] from screen centre.
  const mouse = useRef({ x: 0, y: 0 });

  const state = useRef({
    yaw: 0,
    lookYaw: 0,
    lookPitch: 0,
    pitch: 0,
    roll: 0,
    floatPhase: 0,
    rumblePhase: 0,
    orbit: 0,
    fov: CONFIG.camera.fov,
    /** Set on a mode change so the next frame eases in from where we are. */
    blending: 0,
  }).current;

  const eye = useRef(new THREE.Vector3()).current;
  const desired = useRef(new THREE.Vector3()).current;
  const target = useRef(new THREE.Vector3()).current;
  const UP = useRef(new THREE.Vector3(0, 1, 0)).current;

  // C cycles the viewpoint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyC") cycleCamera();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleCamera]);

  /**
   * Looking around, from a mouse or a thumb.
   *
   * These want opposite behaviours from the same event, and the difference
   * is not cosmetic. A mouse has a position on screen at all times, so
   * where it *is* can mean where you are looking, and the view tracks it
   * continuously. A finger has no position until it lands, so mapping the
   * touch point the same way would snap the view sideways the instant you
   * touched the right of the screen — which is also the instant you were
   * reaching for something else. Touch therefore accumulates *movement*,
   * and the view stays where you left it.
   *
   * Touch drags are also ignored unless they started on the canvas, or
   * every turn of the steering wheel would swing the camera with it.
   */
  useEffect(() => {
    let dragging = -1;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if ((e.target as HTMLElement | null)?.tagName !== "CANVAS") return;
      dragging = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
        return;
      }
      if (e.pointerId !== dragging) return;

      // The delta is measured rather than read off `movementX`, which is
      // not implemented for touch pointers everywhere and silently reports
      // zero where it is not.
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      // About two screen-widths of travel for the full sweep: slow enough
      // to aim with, fast enough to reach the mirrors.
      const gain = 2 / window.innerWidth;
      const m = mouse.current;
      m.x = THREE.MathUtils.clamp(m.x + dx * gain, -1, 1);
      m.y = THREE.MathUtils.clamp(m.y + dy * gain * 2, -1, 1);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId === dragging) dragging = -1;
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Ease in whenever the viewpoint changes.
  useEffect(() => {
    state.blending = 1;
  }, [mode, state]);

  useFrame((_, dt) => {
    const cam = cameraRef.current;
    if (!cam) return;
    const c = CONFIG.camera;
    const car = useGame.getState().vehicle;

    const speed = Math.abs(car.speed);
    const speedRatio = Math.min(speed / CONFIG.vehicle.maxSpeed, 1);

    // Heading with lag — shared by every mode.
    state.yaw = THREE.MathUtils.damp(state.yaw, car.yaw, c.rotationLerp, dt);

    // Mouse look, clamped and smoothed.
    state.lookYaw = THREE.MathUtils.damp(
      state.lookYaw, -mouse.current.x * c.mouseMaxYaw, c.mouseLerp, dt
    );
    state.lookPitch = THREE.MathUtils.damp(
      state.lookPitch, -mouse.current.y * c.mouseMaxPitch, c.mouseLerp, dt
    );

    state.blending = Math.max(0, state.blending - dt * 2);

    if (mode === CameraMode.Driver) {
      updateDriver(cam, car, state, eye, UP, speedRatio, dt);
    } else {
      updateExternal(cam, car, state, desired, target, mode, speedRatio, dt);
    }

    // Field of view opens up slightly with speed for a sense of rush.
    const targetFov = c.fov + (mode === CameraMode.Driver ? 6 : 8) * speedRatio;
    state.fov = THREE.MathUtils.damp(state.fov, targetFov, 3, dt);
    if (Math.abs(cam.fov - state.fov) > 0.01) {
      cam.fov = state.fov;
      cam.updateProjectionMatrix();
    }
  }, UPDATE_ORDER.camera);

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={CONFIG.camera.fov}
      near={0.05}
      far={900}
    />
  );
}

type CamState = {
  yaw: number;
  lookYaw: number;
  lookPitch: number;
  pitch: number;
  roll: number;
  floatPhase: number;
  rumblePhase: number;
  orbit: number;
  fov: number;
  blending: number;
};

type Car = ReturnType<typeof useGame.getState>["vehicle"];

/** First-person: eye point in the cabin, with all the body motion. */
function updateDriver(
  cam: THREE.PerspectiveCamera,
  car: Car,
  state: CamState,
  eye: THREE.Vector3,
  UP: THREE.Vector3,
  speedRatio: number,
  dt: number
) {
  const c = CONFIG.camera;

  // Slow suspension float plus a faster road vibration that turns coarse
  // once the wheels leave the asphalt.
  state.floatPhase += dt * (3 + speedRatio * 9);
  state.rumblePhase += dt * (14 + speedRatio * (car.offRoad ? 48 : 26) + car.impact * 70);

  // A crash shakes the head far harder than any road surface does, and it
  // is the shake — not the numbers — that tells you how bad it was.
  const rumbleAmp =
    ((car.offRoad ? 0.02 : 0.004) * speedRatio + car.impact * 0.055) *
    c.shakeStrength;
  const floatAmp = 0.013 * speedRatio * c.shakeStrength;

  const bobY =
    Math.sin(state.floatPhase) * floatAmp + Math.sin(state.rumblePhase) * rumbleAmp;
  const bobX =
    Math.sin(state.floatPhase * 0.63) * floatAmp * 0.5 +
    Math.sin(state.rumblePhase * 1.37) * rumbleAmp * 0.7;

  // Road slope under the car, plus dive and squat.
  const targetPitch =
    car.pitch + THREE.MathUtils.clamp(car.acceleration * 0.004, -0.035, 0.022);
  state.pitch = THREE.MathUtils.damp(state.pitch, targetPitch, 5, dt);

  // The head leans into a corner with lateral load, and is thrown by the
  // yaw a collision put into the car.
  const targetRoll =
    THREE.MathUtils.clamp(car.lateralAccel * c.leanStrength, -0.09, 0.09) +
    THREE.MathUtils.clamp(car.spin * 0.05, -0.11, 0.11);
  state.roll = THREE.MathUtils.damp(state.roll, targetRoll, 4, dt);

  // Seat offset rotated by the smoothed yaw, so the head trails the
  // chassis slightly through corners.
  eye
    .set(c.eyeOffset.x + bobX, c.eyeOffset.y + bobY, c.eyeOffset.z)
    .applyAxisAngle(UP, state.yaw);

  const goal = eye.add(car.position);
  // Ease in after a mode change, then track exactly.
  if (state.blending > 0) cam.position.lerp(goal, 1 - state.blending);
  else cam.position.copy(goal);

  cam.rotation.order = "YXZ";
  cam.rotation.y = state.yaw + state.lookYaw;
  cam.rotation.x = state.pitch + state.lookPitch;
  cam.rotation.z = state.roll;
}

/** Chase and cinematic: a point in the world that looks at the car. */
function updateExternal(
  cam: THREE.PerspectiveCamera,
  car: Car,
  state: CamState,
  desired: THREE.Vector3,
  target: THREE.Vector3,
  mode: CameraMode,
  speedRatio: number,
  dt: number
) {
  // Aim at a point just above the car's roofline.
  target.copy(car.position).addScaledVector(new THREE.Vector3(0, 1, 0), 1.15);

  if (mode === CameraMode.Chase) {
    // Behind the car, pulling back and dropping as speed rises.
    const angle = state.yaw + state.lookYaw;
    const distance = 7.0 + speedRatio * 2.4;
    const height = 2.9 - speedRatio * 0.5 + state.lookPitch * 3;

    desired.set(
      car.position.x + Math.sin(angle) * distance,
      car.position.y + height,
      car.position.z + Math.cos(angle) * distance
    );
    // A soft spring: the car pulls away under acceleration and settles back.
    cam.position.lerp(desired, 1 - Math.exp(-6 * dt));
  } else {
    // Cinematic: slow orbit at roughly ride height.
    state.orbit += dt * 0.28;
    const angle = state.orbit + state.lookYaw;
    const distance = 8.5;

    desired.set(
      car.position.x + Math.sin(angle) * distance,
      car.position.y + 1.9 + Math.sin(state.orbit * 0.7) * 0.6,
      car.position.z + Math.cos(angle) * distance
    );
    cam.position.lerp(desired, 1 - Math.exp(-3 * dt));
  }

  cam.rotation.z = 0;
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
}
