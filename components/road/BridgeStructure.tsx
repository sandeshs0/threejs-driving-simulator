"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CONFIG, railHalfWidth, roadHalfWidth } from "@/lib/config";
import { buildSweep } from "@/lib/ribbon";
import { elevation, groundY, roadPoint, roadYaw } from "@/lib/road";

/**
 * BridgeStructure
 * ---------------
 * Deck underside, parapets and piers for a span crossing a gorge.
 *
 * The gorge itself is not modelled here — it comes from `ravineDepth` in
 * the terrain function, which drops the ground away beneath the deck and
 * returns it to road level exactly at the abutments. This component only
 * adds the structure, and measures each pier against the real terrain
 * height so they always land on the valley floor.
 */
export function BridgeStructure({
  sStart,
  sEnd,
}: {
  sStart: number;
  sEnd: number;
}) {
  const f = CONFIG.features;
  const edge = roadHalfWidth();

  const geometries = useMemo(() => {
    // Parapet walls, on the same line as the guardrails on open road so
    // the barrier the car is held behind is continuous across the join.
    const rail = railHalfWidth();
    const parapet = (side: number) =>
      buildSweep({
        profile: [
          { u: side * rail, y: 0 },
          { u: side * rail, y: f.bridgeRailHeight },
          { u: side * (rail + 0.16), y: f.bridgeRailHeight },
          { u: side * (rail + 0.16), y: 0 },
        ],
        sStart,
        sEnd,
      });

    return {
      // Deck soffit, slightly wider than the road and hung below it.
      soffit: buildSweep({
        profile: [
          { u: -edge - 0.3, y: -0.15 },
          { u: -edge - 0.3, y: -0.85 },
          { u: edge + 0.3, y: -0.85 },
          { u: edge + 0.3, y: -0.15 },
        ],
        sStart,
        sEnd,
      }),
      railLeft: parapet(-1),
      railRight: parapet(1),
    };
  }, [sStart, sEnd, edge, f.bridgeRailHeight]);

  useEffect(() => {
    return () => {
      for (const g of Object.values(geometries)) g.dispose();
    };
  }, [geometries]);

  /**
   * Piers, spaced along the span. Each is measured from the deck down to
   * the actual ground below it, so none float and none are buried.
   */
  const piers = useMemo(() => {
    const p = { x: 0, y: 0, z: 0 };
    const out: {
      pos: [number, number, number];
      height: number;
      rot: number;
    }[] = [];

    const first = Math.ceil(sStart / f.bridgePierSpacing) * f.bridgePierSpacing;
    for (let s = first; s < sEnd; s += f.bridgePierSpacing) {
      roadPoint(0, s, p);
      const deckY = elevation(s) - 0.85;
      const floorY = groundY(p.x, p.z);
      const height = deckY - floorY;
      // Skip piers near the abutments, where the ground meets the deck.
      if (height < 2) continue;
      out.push({
        pos: [p.x, floorY + height / 2, p.z],
        height,
        rot: roadYaw(s),
      });
    }
    return out;
  }, [sStart, sEnd, f.bridgePierSpacing]);

  return (
    <group>
      <mesh geometry={geometries.soffit} castShadow receiveShadow>
        <meshLambertMaterial color="#6b6b70" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometries.railLeft} castShadow receiveShadow>
        <meshLambertMaterial color="#8d8d92" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometries.railRight} castShadow receiveShadow>
        <meshLambertMaterial color="#8d8d92" side={THREE.DoubleSide} />
      </mesh>

      {piers.map((pier, i) => (
        <group key={i} position={pier.pos} rotation={[0, pier.rot, 0]}>
          {/* Twin columns, like a real box-girder viaduct */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 2.4, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.5, pier.height, 1.5]} />
              <meshLambertMaterial color="#77777c" />
            </mesh>
          ))}
          {/* Cross-brace near the top */}
          <mesh position={[0, pier.height / 2 - 1.6, 0]} castShadow>
            <boxGeometry args={[5.4, 0.8, 1.1]} />
            <meshLambertMaterial color="#77777c" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
