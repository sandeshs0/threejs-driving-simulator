"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { UPDATE_ORDER } from "@/lib/controls";
import { stageAt } from "@/lib/journey";
import { sFromZ } from "@/lib/road";
import { CLOCK } from "@/lib/weather";
import { useGame } from "@/stores/useGame";

/**
 * Rain
 * ----
 * A column of falling streaks that rides with the camera.
 *
 * Rain is uniform and endless, so there is no point simulating a world full
 * of it and culling: one box of drops, twenty-six metres across, kept
 * centred on the viewpoint, is indistinguishable from the real thing and
 * costs a fixed budget however fast you are going. The drops are not moved
 * against the car's motion either — for a statistically uniform field,
 * translating every drop backwards and wrapping it round produces exactly
 * the field you already had. What the car's speed *does* change is the
 * slant, and that is the part the eye reads as speed.
 *
 * Streaks, not points. A raindrop crossing the frame during one exposure is
 * a line, which is why rain photographs and renders as lines; a field of
 * dots reads as snow or as dirt on the lens.
 *
 * Draw range is set from the intensity, so drizzle costs a quarter of what
 * the monsoon does rather than drawing the full count at low opacity.
 */

const MAX_DROPS = 2400;
/** Half-width of the box the drops live in, and its height. */
const SPREAD = 26;
const HEIGHT = 24;
const FLOOR = -7;
/** Terminal velocity of a raindrop, near enough (m/s). */
const FALL = 17;

export function Rain() {
  const lines = useRef<THREE.LineSegments>(null);
  const { camera } = useThree();

  const state = useMemo(() => {
    const positions = new Float32Array(MAX_DROPS * 2 * 3);
    const x = new Float32Array(MAX_DROPS);
    const y = new Float32Array(MAX_DROPS);
    const z = new Float32Array(MAX_DROPS);
    // A spread of fall speeds, so the sheet has depth instead of moving as
    // one plate.
    const rate = new Float32Array(MAX_DROPS);

    for (let i = 0; i < MAX_DROPS; i++) {
      x[i] = (Math.random() * 2 - 1) * SPREAD;
      z[i] = (Math.random() * 2 - 1) * SPREAD;
      y[i] = FLOOR + Math.random() * HEIGHT;
      rate[i] = 0.82 + Math.random() * 0.36;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);

    return { geometry, positions, x, y, z, rate };
  }, []);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#c3d2de",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    []
  );

  useFrame((_, dt) => {
    const group = lines.current;
    if (!group) return;

    const car = useGame.getState().vehicle;

    // Nothing falls inside the bore. Obvious once you are in one, and the
    // sort of thing that quietly ruins a tunnel if it is missing.
    const sheltered = stageAt(sFromZ(car.position.z)) === "tunnel";
    const intensity = sheltered ? 0 : CLOCK.rain;

    const active = Math.floor(intensity * MAX_DROPS);
    if (active === 0) {
      group.visible = false;
      return;
    }
    group.visible = true;
    material.opacity = 0.28 + intensity * 0.3;

    // Sit the box on the viewpoint. The camera has already been placed for
    // this frame — this useFrame runs after it.
    group.position.copy(camera.position);

    // The slant. A drop falls straight down in the world; what you see from
    // a car doing 60 is the vector sum with your own motion, so the faster
    // you go the flatter the rain lies.
    const vx = -Math.sin(car.yaw) * car.speed;
    const vz = -Math.cos(car.yaw) * car.speed;
    const length = 1.1 + intensity * 0.9;
    const scale = length / Math.hypot(FALL, vx, vz);
    const dx = -vx * scale;
    const dy = -FALL * scale;
    const dz = -vz * scale;

    const { positions, x, y, z, rate } = state;
    const step = FALL * dt;

    for (let i = 0; i < active; i++) {
      y[i] -= step * rate[i];
      if (y[i] < FLOOR) {
        // Reseed across the box rather than dropping the same drop down the
        // same column forever, which shows up as vertical seams.
        y[i] += HEIGHT;
        x[i] = (Math.random() * 2 - 1) * SPREAD;
        z[i] = (Math.random() * 2 - 1) * SPREAD;
      }

      const o = i * 6;
      positions[o] = x[i];
      positions[o + 1] = y[i];
      positions[o + 2] = z[i];
      positions[o + 3] = x[i] + dx;
      positions[o + 4] = y[i] + dy;
      positions[o + 5] = z[i] + dz;
    }

    state.geometry.setDrawRange(0, active * 2);
    state.geometry.getAttribute("position").needsUpdate = true;
  }, UPDATE_ORDER.audio);

  return (
    <lineSegments
      ref={lines}
      geometry={state.geometry}
      material={material}
      frustumCulled={false}
    />
  );
}
