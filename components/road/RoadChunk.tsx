"use client";

import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { CONFIG, asphaltHalfWidth, roadHalfWidth } from "@/lib/config";
import { buildRibbon, buildTerrain } from "@/lib/ribbon";
import { generateScatter } from "@/lib/scatter";
import { roadPoint, roadYaw } from "@/lib/road";
import { ChunkScenery } from "@/components/environment/ChunkScenery";
import { TunnelStructure } from "./TunnelStructure";
import { BridgeStructure } from "./BridgeStructure";
import { Guardrail } from "./Guardrail";
import { Footpath } from "./Footpath";
import { CityChunk } from "@/components/city/CityChunk";
import { Checkpost } from "./Checkpost";
import { featureSpan } from "@/lib/roadFeatures";
import { CHECKPOST_S } from "@/lib/journey";

/**
 * RoadChunk
 * ---------
 * One reusable slice of world: terrain, shoulders, asphalt, markings and
 * roadside props. Chunk `index` covers road distance s ∈ [i·L, (i+1)·L].
 *
 * All surfaces are ribbons generated from the same road curve, so chunks
 * meet exactly at their shared boundary — the joins are invisible even
 * mid-bend. Geometry is built once per chunk index and disposed on
 * unmount.
 *
 * Surfaces are stacked in a few millimetres of Y to avoid z-fighting.
 */
export function RoadChunk({ index }: { index: number }) {
  const L = CONFIG.road.chunkLength;
  const sStart = index * L;
  const sEnd = sStart + L;

  const scatter = useMemo(() => generateScatter(index), [index]);
  const span = useMemo(() => featureSpan(index), [index]);

  // ---- Surface geometry ----
  const geometries = useMemo(() => {
    const asphalt = asphaltHalfWidth();
    const shoulder = roadHalfWidth();
    const ground = CONFIG.road.groundHalfWidth;

    return {
      // Terrain uses its own builder — see buildTerrain for why a surface
      // this wide cannot be an offset curve.
      terrain: buildTerrain({ sStart, sEnd, halfWidth: ground }),
      shoulder: buildRibbon({
        sStart, sEnd,
        uMin: -shoulder, uMax: shoulder,
        widthSegments: 2,
      }),
      asphalt: buildRibbon({
        sStart, sEnd,
        uMin: -asphalt, uMax: asphalt,
        widthSegments: 2,
        yOffset: 0.012,
      }),
      edgeLeft: buildRibbon({
        sStart, sEnd,
        uMin: -asphalt + 0.19, uMax: -asphalt + 0.31,
        yOffset: 0.024,
      }),
      edgeRight: buildRibbon({
        sStart, sEnd,
        uMin: asphalt - 0.31, uMax: asphalt - 0.19,
        yOffset: 0.024,
      }),
    };
  }, [sStart, sEnd]);

  // Release GPU buffers when the chunk scrolls out of the window.
  useEffect(() => {
    return () => {
      for (const g of Object.values(geometries)) g.dispose();
    };
  }, [geometries]);

  // ---- Dashed centre line ----
  // 3 m dash every 7.5 m divides 60 m exactly, so the pattern continues
  // unbroken across chunk boundaries. Each dash is placed and rotated
  // along the curve instead of being a straight strip.
  const dashes = useMemo(() => {
    const dashPeriod = 7.5;
    const p = { x: 0, y: 0, z: 0 };
    const out: { pos: [number, number, number]; rot: number }[] = [];
    for (let s = sStart + dashPeriod / 2; s < sEnd; s += dashPeriod) {
      roadPoint(0, s, p);
      out.push({ pos: [p.x, p.y + 0.026, p.z], rot: roadYaw(s) });
    }
    return out;
  }, [sStart, sEnd]);

  return (
    <group>
      {/* Rolling terrain, coloured by biome */}
      <mesh geometry={geometries.terrain} receiveShadow>
        <meshLambertMaterial color={scatter.groundColor} />
      </mesh>

      {/* Gravel shoulders */}
      <mesh geometry={geometries.shoulder} receiveShadow>
        <meshLambertMaterial color={scatter.shoulderColor} />
      </mesh>

      {/* Asphalt: two 3.5 m lanes */}
      <mesh geometry={geometries.asphalt} receiveShadow>
        <meshLambertMaterial color="#3a3a3e" />
      </mesh>

      {/* Solid white edge lines */}
      <mesh geometry={geometries.edgeLeft}>
        <meshBasicMaterial color="#e2e2e0" />
      </mesh>
      <mesh geometry={geometries.edgeRight}>
        <meshBasicMaterial color="#e2e2e0" />
      </mesh>

      {/* Dashed centre line */}
      {dashes.map((d, i) => (
        <mesh
          key={i}
          position={d.pos}
          rotation={[-Math.PI / 2, 0, d.rot]}
          renderOrder={1}
        >
          <planeGeometry args={[0.14, 3]} />
          <meshBasicMaterial color="#e8c94a" />
        </mesh>
      ))}

      {/* Out of town the road edge is a guardrail; in town it is a kerb
          and footpath. Both sit on the same line, so the barrier the car
          is held behind stays continuous. */}
      {scatter.feature.kind === "open" && scatter.urban < 0.5 && (
        <Guardrail sStart={sStart} sEnd={sEnd} />
      )}
      {scatter.feature.kind === "open" && scatter.urban >= 0.5 && (
        <Footpath sStart={sStart} sEnd={sEnd} />
      )}

      {/* Bridge or tunnel, when this chunk carries one. Structures are
          clipped to the feature's own span, so a portal or an abutment
          lands where the route says rather than on a chunk boundary. */}
      {span && scatter.feature.kind === "tunnel" && (
        <TunnelStructure sStart={span.from} sEnd={span.to} feature={scatter.feature} />
      )}
      {span && scatter.feature.kind === "bridge" && (
        <BridgeStructure sStart={span.from} sEnd={span.to} />
      )}

      {/* The Thankot checkpost, wherever the route puts it. One chunk owns
          it — the one its road distance falls inside. */}
      {CHECKPOST_S >= sStart && CHECKPOST_S < sEnd && <Checkpost s={CHECKPOST_S} />}

      {/* Kathmandu */}
      {scatter.urban > 0.05 && <CityChunk index={index} />}

      {/* Trees, rocks, grass, marker posts — always beyond the shoulder */}
      <ChunkScenery scatter={scatter} />
    </group>
  );
}
