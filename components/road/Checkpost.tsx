"use client";

import { useMemo } from "react";
import { roadHalfWidth } from "@/lib/config";
import { elevation, roadPoint, roadYaw } from "@/lib/road";

/**
 * Checkpost
 * ---------
 * The Thankot checkpost, on the valley side of the Nagdhunga tunnel.
 *
 * Everything entering Kathmandu by road passes through here, and it is the
 * moment the drive changes character: the hill road ends, the barriers go
 * up, and the next thing is city. So it is built as a gateway — a gantry
 * across the carriageway with a welcome board on it, a booth on each side,
 * a raised barrier arm, and the flag.
 *
 * Positioned from the road curve like everything else, so it bends with the
 * road and sits on the true surface rather than being dropped in flat.
 */
export function Checkpost({ s }: { s: number }) {
  const rot = useMemo(() => roadYaw(s), [s]);
  const edge = roadHalfWidth();

  /** Place something at a lateral offset and distance along the road. */
  const at = (u: number, ds: number): [number, number, number] => {
    const p = roadPoint(u, s + ds);
    return [p.x, elevation(s + ds), p.z];
  };

  return (
    <group>
      {/* ---- Gantry across the carriageway ---- */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={at(side * (edge + 0.7), 0)} rotation={[0, rot, 0]}>
          <mesh position={[0, 2.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.55, 5.2, 0.55]} />
            <meshLambertMaterial color="#b9b3a4" />
          </mesh>
          {/* Painted band round the base, as every roadside column has */}
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.58, 0.6, 0.58]} />
            <meshLambertMaterial color="#c9302c" />
          </mesh>
        </group>
      ))}

      <group position={at(0, 0)} rotation={[0, rot, 0]}>
        {/* Beam */}
        <mesh position={[0, 5.5, 0]} castShadow>
          <boxGeometry args={[(edge + 1) * 2, 0.5, 0.5]} />
          <meshLambertMaterial color="#b9b3a4" />
        </mesh>

        {/* Welcome board slung under it. Lettering is suggested with bands
            rather than spelled out, so no font has to be loaded. */}
        <mesh position={[0, 4.6, -0.05]} castShadow>
          <boxGeometry args={[7.6, 1.5, 0.14]} />
          <meshLambertMaterial color="#1f5f8d" />
        </mesh>
        {[0.28, -0.16].map((y, i) => (
          <mesh key={y} position={[i === 0 ? 0 : -0.7, 4.6 + y, -0.14]}>
            <boxGeometry args={[i === 0 ? 5.4 : 3.6, i === 0 ? 0.3 : 0.18, 0.02]} />
            <meshBasicMaterial color="#f0ead8" />
          </mesh>
        ))}

        {/* Blue overhead direction sign on the beam */}
        <mesh position={[0, 6.1, 0]}>
          <boxGeometry args={[3.2, 0.7, 0.08]} />
          <meshLambertMaterial color="#2f6f5e" />
        </mesh>
      </group>

      {/* ---- Booths, one per side, set back on the shoulder ---- */}
      {([-1, 1] as const).map((side) => (
        <group
          key={side}
          position={at(side * (edge + 2.6), side * 3)}
          rotation={[0, rot, 0]}
        >
          <mesh position={[0, 1.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.4, 2.7, 2.4]} />
            <meshLambertMaterial color="#ddd6c4" />
          </mesh>
          {/* Window facing the traffic */}
          <mesh position={[-side * 1.22, 1.7, 0]}>
            <boxGeometry args={[0.06, 1.0, 1.6]} />
            <meshLambertMaterial color="#2b3138" />
          </mesh>
          {/* Tin roof with an overhang */}
          <mesh position={[0, 2.8, 0]} castShadow>
            <boxGeometry args={[3.0, 0.12, 3.0]} />
            <meshLambertMaterial color="#6e6a62" />
          </mesh>
          {/* Blue-and-white stripe, the standard checkpost livery */}
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[2.44, 0.5, 2.44]} />
            <meshLambertMaterial color="#1f5f8d" />
          </mesh>
        </group>
      ))}

      {/* ---- Barrier arms, up. Nobody is stopping you today. ---- */}
      {([-1, 1] as const).map((side) => (
        <group
          key={side}
          position={at(side * (edge + 1.6), side * -2)}
          rotation={[0, rot, 0]}
        >
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.28, 1.0, 0.28]} />
            <meshLambertMaterial color="#54585e" />
          </mesh>
          {/* Raised to about 70°, striped red and white */}
          <group position={[0, 1.0, 0]} rotation={[0, 0, -side * 1.2]}>
            {Array.from({ length: 6 }, (_, i) => (
              <mesh key={i} position={[-side * (0.4 + i * 0.75), 0, 0]} castShadow>
                <boxGeometry args={[0.75, 0.11, 0.11]} />
                <meshLambertMaterial color={i % 2 ? "#f0ead8" : "#c9302c"} />
              </mesh>
            ))}
          </group>
        </group>
      ))}

      {/* ---- Flagpole ---- */}
      <group position={at(-(edge + 5), 6)} rotation={[0, rot, 0]}>
        <mesh position={[0, 3.2, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 6.4, 8]} />
          <meshLambertMaterial color="#d8d3c6" />
        </mesh>
        {/*
          The flag: the only non-quadrilateral national flag there is, two
          stacked pennants. Two triangles is exactly the right primitive,
          and the crimson field with its blue border is unmistakable even
          at a glance from a moving car.
        */}
        {[0, 1].map((i) => (
          <group key={i} position={[0.02, 5.55 - i * 0.85, 0]}>
            <mesh position={[0.62, -0.42 + i * 0.06, 0]} rotation={[0, Math.PI / 2, 0]}>
              <coneGeometry args={[0.62, 1.24, 3]} />
              <meshLambertMaterial color="#1f3f8d" />
            </mesh>
            <mesh position={[0.58, -0.42 + i * 0.06, 0.01]} rotation={[0, Math.PI / 2, 0]}>
              <coneGeometry args={[0.54, 1.08, 3]} />
              <meshLambertMaterial color="#c9302c" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
