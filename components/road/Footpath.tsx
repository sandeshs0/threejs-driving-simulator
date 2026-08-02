"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { railHalfWidth, roadHalfWidth } from "@/lib/config";
import { buildSweep } from "@/lib/ribbon";

/**
 * Footpath
 * --------
 * The city equivalent of the guardrail: a raised kerb and pavement down
 * both sides of the street.
 *
 * The kerb face sits on the same line as the guardrail out of town, so the
 * barrier holding the car on the road is continuous where the highway
 * becomes a street — the player never crosses an invisible seam.
 */
export function Footpath({ sStart, sEnd }: { sStart: number; sEnd: number }) {
  const geometries = useMemo(() => {
    const inner = railHalfWidth();
    const outer = roadHalfWidth() + 3.4;
    const kerbHeight = 0.16;

    // Kerb face rising off the road, then the pavement running outward.
    const path = (side: number) =>
      buildSweep({
        profile: [
          { u: side * inner, y: 0 },
          { u: side * inner, y: kerbHeight },
          { u: side * outer, y: kerbHeight + 0.03 },
        ],
        sStart,
        sEnd,
      });

    return { left: path(-1), right: path(1) };
  }, [sStart, sEnd]);

  useEffect(() => {
    return () => {
      for (const g of Object.values(geometries)) g.dispose();
    };
  }, [geometries]);

  return (
    <group>
      {[geometries.left, geometries.right].map((geo, i) => (
        <mesh key={i} geometry={geo} receiveShadow castShadow>
          <meshLambertMaterial color="#9c9789" side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
