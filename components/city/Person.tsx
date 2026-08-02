"use client";

import type { RefObject } from "react";
import * as THREE from "three";

/**
 * Person
 * ------
 * One low-poly figure, in the same box-and-cylinder language as everything
 * else in the world. Roughly 1.7 m tall with the origin at the feet, so a
 * figure can be dropped straight onto the pavement height.
 *
 * The limbs live in their own groups pivoted at hip and shoulder. That
 * costs nothing when the figure is standing still, and it is what lets
 * <Pedestrians/> walk them: the parent holds a `limbs` ref and writes
 * rotations into it every frame, so a moving crowd never re-renders React.
 *
 * Outfits are the ordinary street mix — kurta surwal, a sari, daura
 * suruwal, jeans and a shirt, a school uniform — plus the dhaka topi, which
 * is common enough on older men to be worth its own flag.
 */

export interface Limbs {
  legL: THREE.Group | null;
  legR: THREE.Group | null;
  armL: THREE.Group | null;
  armR: THREE.Group | null;
}

export const makeLimbs = (): Limbs => ({
  legL: null,
  legR: null,
  armL: null,
  armR: null,
});

/** top / bottom / skin, one row per outfit index. */
const OUTFITS: [string, string, string][] = [
  ["#c8453f", "#2b3550", "#8a6247"], // red kurta, dark surwal
  ["#e0d8c6", "#e0d8c6", "#7d5840"], // daura suruwal, off-white
  ["#2f6f8d", "#31343c", "#93684b"], // blue shirt, dark trousers
  ["#d98f2c", "#7d2f4a", "#875f45"], // sari, ochre and maroon
  ["#3f7a4c", "#3d4048", "#7a5539"], // green kurta
  ["#8fa7c4", "#25304a", "#8d6449"], // school uniform
];

const TOPI = "#e6dfcd";
const HAIR = "#1b1614";

export function Person({
  outfit = 0,
  hat = false,
  pose = "stand",
  scale = 1,
  limbs,
}: {
  outfit?: number;
  hat?: boolean;
  pose?: "stand" | "squat";
  scale?: number;
  limbs?: RefObject<Limbs>;
}) {
  const [top, bottom, skin] = OUTFITS[outfit % OUTFITS.length];

  // Squatting outside a shop is its own posture, not a shorter standing
  // one: the whole body drops and the thighs come forward.
  const squat = pose === "squat";
  const bodyY = squat ? -0.42 : 0;
  const legAngle = squat ? 1.35 : 0;

  return (
    <group scale={scale}>
      <group position={[0, bodyY, 0]}>
        {/* ---- Legs, pivoted at the hip ---- */}
        {([-1, 1] as const).map((side) => (
          <group
            key={side}
            position={[side * 0.1, 0.78, 0]}
            rotation={[legAngle, 0, 0]}
            ref={(el) => {
              if (!limbs?.current) return;
              if (side === -1) limbs.current.legL = el;
              else limbs.current.legR = el;
            }}
          >
            <mesh position={[0, -0.39, squat ? 0.1 : 0]} castShadow>
              <boxGeometry args={[0.14, 0.78, 0.16]} />
              <meshLambertMaterial color={bottom} />
            </mesh>
          </group>
        ))}

        {/* ---- Torso ---- */}
        <mesh position={[0, 1.07, 0]} castShadow>
          <boxGeometry args={[0.4, 0.6, 0.22]} />
          <meshLambertMaterial color={top} />
        </mesh>

        {/* ---- Arms, pivoted at the shoulder ---- */}
        {([-1, 1] as const).map((side) => (
          <group
            key={side}
            position={[side * 0.25, 1.32, 0]}
            rotation={[squat ? -0.5 : 0, 0, side * 0.06]}
            ref={(el) => {
              if (!limbs?.current) return;
              if (side === -1) limbs.current.armL = el;
              else limbs.current.armR = el;
            }}
          >
            <mesh position={[0, -0.26, 0]} castShadow>
              <boxGeometry args={[0.1, 0.52, 0.12]} />
              <meshLambertMaterial color={top} />
            </mesh>
            {/* Hand */}
            <mesh position={[0, -0.56, 0]}>
              <boxGeometry args={[0.09, 0.1, 0.11]} />
              <meshLambertMaterial color={skin} />
            </mesh>
          </group>
        ))}

        {/* ---- Head ---- */}
        <mesh position={[0, 1.44, 0]}>
          <boxGeometry args={[0.11, 0.09, 0.11]} />
          <meshLambertMaterial color={skin} />
        </mesh>
        <mesh position={[0, 1.58, 0]} castShadow>
          <boxGeometry args={[0.21, 0.24, 0.2]} />
          <meshLambertMaterial color={skin} />
        </mesh>
        {/* Hair, or a dhaka topi over it */}
        <mesh position={[0, 1.69, 0.01]}>
          <boxGeometry args={[0.22, 0.08, 0.21]} />
          <meshLambertMaterial color={HAIR} />
        </mesh>
        {hat && (
          <mesh position={[0, 1.77, 0]}>
            <cylinderGeometry args={[0.12, 0.13, 0.11, 10]} />
            <meshLambertMaterial color={TOPI} />
          </mesh>
        )}
      </group>
    </group>
  );
}
