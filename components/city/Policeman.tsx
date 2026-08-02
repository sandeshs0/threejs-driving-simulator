"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { makeLimbs, Person, type Palette } from "./Person";

/**
 * Policeman
 * ---------
 * Nepal Police, in the uniform: light blue shirt, navy trousers, navy
 * peaked cap. Traffic duty adds the white sleeves worn over the forearms —
 * the detail that makes an officer legible down a crowded street, and the
 * thing that reads as Nepali traffic police rather than generic police.
 *
 * Two duties:
 *
 *  `stand`   at ease — the checkpost officer watching vehicles come
 *            through the barrier.
 *  `direct`  one arm out and sweeping across. Animated, because an officer
 *            frozen mid-gesture reads as a statue of one, and there are
 *            around thirty of them working Kalanki on any given day.
 *
 * The white sleeves are their own groups pivoted at the same shoulder point
 * as the arms and driven by the same angles, rather than being parented
 * into <Person/>'s limbs. Parenting would mean reaching into another
 * component's scene graph; sharing the angle is the same result and the
 * arms stay entirely Person's business.
 */

/** Shirt / trousers / skin. */
const UNIFORM: Palette = ["#5f8ac6", "#1e2749", "#8a6247"];
const CAP = "#1b2447";

/** Shoulder pivot, matching the arm groups in <Person/>. */
const SHOULDER_Y = 1.32;
const SHOULDER_X = 0.25;

export function Policeman({
  duty = "stand",
  phase = 0,
}: {
  duty?: "stand" | "direct";
  phase?: number;
}) {
  const limbs = useRef(makeLimbs());
  const sleeves = useRef<(THREE.Group | null)[]>([]);

  useFrame(({ clock }) => {
    if (duty !== "direct") return;
    const l = limbs.current;

    // A slow beckoning sweep: right arm out and across, left arm at rest.
    const t = clock.elapsedTime * 1.6 + phase;
    const swing = Math.sin(t);
    const rightZ = -1.35 - swing * 0.22;
    const rightX = -0.25 + swing * 0.5;
    const leftX = 0.12 + Math.sin(t * 0.5) * 0.08;

    if (l.armR) {
      l.armR.rotation.z = rightZ;
      l.armR.rotation.x = rightX;
    }
    if (l.armL) l.armL.rotation.x = leftX;

    // Sleeves follow the same angles — index 0 is left, 1 is right.
    const left = sleeves.current[0];
    const right = sleeves.current[1];
    if (left) left.rotation.x = leftX;
    if (right) {
      right.rotation.z = rightZ;
      right.rotation.x = rightX;
    }
  });

  return (
    <group>
      <Person palette={UNIFORM} cap={CAP} limbs={limbs} />

      {duty === "direct" &&
        ([-1, 1] as const).map((side, i) => (
          <group
            key={side}
            position={[side * SHOULDER_X, SHOULDER_Y, 0]}
            ref={(el) => {
              sleeves.current[i] = el;
            }}
          >
            <mesh position={[0, -0.36, 0]}>
              <boxGeometry args={[0.118, 0.3, 0.138]} />
              <meshLambertMaterial color="#f0f2f4" />
            </mesh>
          </group>
        ))}

      {/* Duty belt */}
      <mesh position={[0, 0.79, 0]}>
        <boxGeometry args={[0.42, 0.07, 0.24]} />
        <meshLambertMaterial color="#15192c" />
      </mesh>
      {/* Shoulder flash */}
      <mesh position={[0, 1.33, 0.115]}>
        <boxGeometry args={[0.36, 0.05, 0.02]} />
        <meshLambertMaterial color="#c8b04a" />
      </mesh>
    </group>
  );
}
