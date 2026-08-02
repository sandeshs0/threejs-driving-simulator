"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Instance, Instances } from "@react-three/drei";
import { CONFIG, railHalfWidth } from "@/lib/config";
import { buildSweep } from "@/lib/ribbon";
import { roadPoint, roadYaw } from "@/lib/road";

/**
 * Guardrail
 * ---------
 * A steel beam and posts down both edges of the road.
 *
 * These exist mainly to explain the barrier: the vehicle is held inside
 * this line, and an invisible wall reads as a bug, while a guardrail
 * reads as a road. The beam is a swept profile so it follows the curve
 * exactly, and the posts are instanced, so a rail costs two draw calls
 * per chunk side.
 */
export function Guardrail({ sStart, sEnd }: { sStart: number; sEnd: number }) {
  const u = railHalfWidth();
  const h = CONFIG.road.railHeight;

  const geometries = useMemo(() => {
    // A shallow W-beam suggestion: the face plus a small return at the top.
    const beam = (side: number) =>
      buildSweep({
        profile: [
          { u: side * u, y: h - 0.34 },
          { u: side * u, y: h },
          { u: side * (u + 0.07), y: h + 0.04 },
        ],
        sStart,
        sEnd,
      });
    return { left: beam(-1), right: beam(1) };
  }, [sStart, sEnd, u, h]);

  useEffect(() => {
    return () => {
      for (const g of Object.values(geometries)) g.dispose();
    };
  }, [geometries]);

  const posts = useMemo(() => {
    const p = { x: 0, y: 0, z: 0 };
    const out: { pos: [number, number, number]; rot: number }[] = [];
    for (let s = sStart; s < sEnd; s += 4.5) {
      const rot = roadYaw(s);
      for (const side of [-1, 1]) {
        roadPoint(side * u, s, p);
        out.push({ pos: [p.x, p.y + (h - 0.34) / 2, p.z], rot });
      }
    }
    return out;
  }, [sStart, sEnd, u, h]);

  return (
    <group>
      <mesh geometry={geometries.left} castShadow receiveShadow>
        <meshStandardMaterial
          color="#a9adb2"
          metalness={0.75}
          roughness={0.45}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={geometries.right} castShadow receiveShadow>
        <meshStandardMaterial
          color="#a9adb2"
          metalness={0.75}
          roughness={0.45}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Instances limit={posts.length} castShadow>
        <boxGeometry args={[0.09, CONFIG.road.railHeight - 0.34, 0.09]} />
        <meshLambertMaterial color="#6f7377" />
        {posts.map((post, i) => (
          <Instance key={i} position={post.pos} rotation={[0, post.rot, 0]} />
        ))}
      </Instances>
    </group>
  );
}
