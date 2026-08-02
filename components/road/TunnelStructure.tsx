"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CONFIG } from "@/lib/config";
import { buildSweep } from "@/lib/ribbon";
import { roadPoint, roadYaw } from "@/lib/road";
import type { ChunkFeature } from "@/lib/roadFeatures";

/**
 * TunnelStructure
 * ---------------
 * A concrete bore swept along the road curve, so it bends with the road
 * instead of being a straight tube dropped on top of it.
 *
 * The shell casts and receives shadows, which is what actually makes the
 * inside go dark — there is no special-case lighting. Ceiling strips are
 * unlit emissive geometry rather than real lights, so a tunnel costs the
 * same as any other chunk no matter how long it runs.
 */
export function TunnelStructure({
  sStart,
  sEnd,
  feature,
}: {
  sStart: number;
  sEnd: number;
  feature: ChunkFeature;
}) {
  const f = CONFIG.features;

  /** Arch cross-section: straight walls up to `wallHeight`, then a half-round. */
  const archProfile = useMemo(() => {
    const pts: { u: number; y: number }[] = [];
    const R = f.tunnelRadius;
    const wall = f.tunnelWallHeight;

    pts.push({ u: -R, y: 0 });
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI - (i / steps) * Math.PI; // π → 0, left to right
      pts.push({ u: R * Math.cos(a), y: wall + R * Math.sin(a) });
    }
    pts.push({ u: R, y: 0 });
    return pts;
  }, [f.tunnelRadius, f.tunnelWallHeight]);

  /** Portal rim: the same arch pushed outward, giving the entrance depth. */
  const rimProfile = useMemo(
    () => archProfile.map((p) => ({ u: p.u * 1.1, y: p.y * 1.08 })),
    [archProfile]
  );

  const geometries = useMemo(() => {
    const out: Record<string, THREE.BufferGeometry> = {
      bore: buildSweep({ profile: archProfile, sStart, sEnd }),
    };
    // Portals are short, thicker collars at the very ends of the span.
    if (feature.isStart) {
      out.portalStart = buildSweep({
        profile: rimProfile,
        sStart,
        sEnd: sStart + 2,
        lengthSegments: 2,
      });
    }
    if (feature.isEnd) {
      out.portalEnd = buildSweep({
        profile: rimProfile,
        sStart: sEnd - 2,
        sEnd,
        lengthSegments: 2,
      });
    }
    return out;
  }, [archProfile, rimProfile, sStart, sEnd, feature.isStart, feature.isEnd]);

  useEffect(() => {
    return () => {
      for (const g of Object.values(geometries)) g.dispose();
    };
  }, [geometries]);

  // Ceiling light strips every 14 m along the bore.
  const lights = useMemo(() => {
    const p = { x: 0, y: 0, z: 0 };
    const out: { pos: [number, number, number]; rot: number }[] = [];
    for (let s = sStart + 7; s < sEnd; s += 14) {
      roadPoint(0, s, p);
      out.push({
        pos: [p.x, p.y + f.tunnelWallHeight + f.tunnelRadius - 0.35, p.z],
        rot: roadYaw(s),
      });
    }
    return out;
  }, [sStart, sEnd, f.tunnelWallHeight, f.tunnelRadius]);

  return (
    <group>
      {/* Bore. DoubleSide because it is seen from the inside. */}
      <mesh geometry={geometries.bore} castShadow receiveShadow>
        <meshLambertMaterial color="#5a5a5e" side={THREE.DoubleSide} />
      </mesh>

      {/* Portal collars */}
      {geometries.portalStart && (
        <mesh geometry={geometries.portalStart} castShadow receiveShadow>
          <meshLambertMaterial color="#48484c" side={THREE.DoubleSide} />
        </mesh>
      )}
      {geometries.portalEnd && (
        <mesh geometry={geometries.portalEnd} castShadow receiveShadow>
          <meshLambertMaterial color="#48484c" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Sodium-ish ceiling strips — unlit, so they read as bright inside */}
      {lights.map((l, i) => (
        <mesh key={i} position={l.pos} rotation={[0, l.rot, 0]}>
          <boxGeometry args={[0.5, 0.06, 2.4]} />
          <meshBasicMaterial color="#ffd9a0" />
        </mesh>
      ))}
    </group>
  );
}
