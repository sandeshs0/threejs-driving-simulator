"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Instance, Instances } from "@react-three/drei";
import type { CityLayout } from "@/lib/city";
import { LAMP_HEAD, LAMP_POOL } from "@/lib/litMaterials";

/**
 * StreetFurniture
 * ---------------
 * Lamp posts, the overhead cable tangle, and traffic signals.
 *
 * The wires are what actually sell a Kathmandu street: bundles of cable
 * sagging between poles, far more of them than any city needs. Each span
 * is a thin catenary drawn with a tube; a few per pole gives the tangle
 * without much geometry.
 *
 * Signals cycle red → green → amber on a shared clock, offset per junction
 * so they are not all in step.
 */
export function StreetFurniture({ city }: { city: CityLayout }) {
  const signalRefs = useRef<(THREE.Group | null)[]>([]);

  /** Sagging cable spans, three per pole gap at slightly different drops. */
  const wireGeometries = useMemo(() => {
    const geos: THREE.TubeGeometry[] = [];
    for (const span of city.wires) {
      const from = new THREE.Vector3(...span.from);
      const to = new THREE.Vector3(...span.to);

      for (let k = 0; k < 3; k++) {
        const sag = 0.55 + k * 0.28;
        const side = (k - 1) * 0.16;
        const mid = from.clone().lerp(to, 0.5);
        mid.y -= sag;
        mid.x += side;

        const curve = new THREE.QuadraticBezierCurve3(
          from.clone().setY(from.y - k * 0.22),
          mid,
          to.clone().setY(to.y - k * 0.22)
        );
        geos.push(new THREE.TubeGeometry(curve, 8, 0.022, 4, false));
      }
    }
    return geos;
  }, [city.wires]);

  useFrame(({ clock }) => {
    // Shared 12-second cycle: 6 s green, 1.5 s amber, 4.5 s red.
    const t = clock.elapsedTime;
    signalRefs.current.forEach((group, i) => {
      if (!group) return;
      const phase = (t + i * 3.7) % 12;
      const on = phase < 6 ? 2 : phase < 7.5 ? 1 : 0; // index of the lit lamp
      group.children.forEach((child, k) => {
        const mesh = child as THREE.Mesh;
        if (!(mesh.material instanceof THREE.MeshBasicMaterial)) return;
        const colors = ["#c9302c", "#d9a520", "#3aa757"];
        mesh.material.color.set(k === on ? colors[k] : "#2a2a2c");
      });
    });
  });

  return (
    <group>
      {/* Lamp posts: column, arm and head */}
      {city.lamps.length > 0 && (
        <>
          <Instances limit={city.lamps.length} castShadow>
            <cylinderGeometry args={[0.08, 0.11, 7, 6]} />
            <meshLambertMaterial color="#6a6a6c" />
            {city.lamps.map((lamp, i) => (
              <Instance
                key={i}
                position={[lamp.x, lamp.y + 3.5, lamp.z]}
                rotation={[0, lamp.rot, 0]}
              />
            ))}
          </Instances>
          <Instances limit={city.lamps.length}>
            <boxGeometry args={[0.9, 0.07, 0.07]} />
            <meshLambertMaterial color="#6a6a6c" />
            {city.lamps.map((lamp, i) => (
              <Instance
                key={i}
                position={[lamp.x - lamp.side * 0.45, lamp.y + 6.9, lamp.z]}
                rotation={[0, lamp.rot, 0]}
              />
            ))}
          </Instances>
          {/* The head. Shares one material with every other lamp in the
              city, so the whole street lights at once at dusk. */}
          <Instances limit={city.lamps.length}>
            <boxGeometry args={[0.42, 0.12, 0.22]} />
            <primitive object={LAMP_HEAD} attach="material" />
            {city.lamps.map((lamp, i) => (
              <Instance
                key={i}
                position={[lamp.x - lamp.side * 0.85, lamp.y + 6.82, lamp.z]}
                rotation={[0, lamp.rot, 0]}
              />
            ))}
          </Instances>

          {/* The pool each one throws on the road.

              An additive disc rather than a point light, and not a
              compromise: sixty real lights in view is not a frame budget on
              any hardware, and a sodium lamp seen from a moving car is
              exactly this — a soft ellipse on the tarmac and a glow at the
              head. Lifted a few centimetres so it does not z-fight the
              road, and drawn only after dark (see lib/litMaterials). */}
          <Instances limit={city.lamps.length}>
            <circleGeometry args={[3.6, 16]} />
            <primitive object={LAMP_POOL} attach="material" />
            {city.lamps.map((lamp, i) => (
              <Instance
                key={i}
                position={[lamp.x - lamp.side * 1.1, lamp.y + 0.04, lamp.z]}
                rotation={[-Math.PI / 2, 0, 0]}
              />
            ))}
          </Instances>
        </>
      )}

      {/* The cable tangle */}
      {wireGeometries.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshLambertMaterial color="#1e1e20" />
        </mesh>
      ))}

      {/* Traffic signals */}
      {city.signals.map((signal, i) => (
        <group key={i} position={[signal.x, signal.y, signal.z]} rotation={[0, signal.rot, 0]}>
          <mesh position={[0, 1.7, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.09, 3.4, 6]} />
            <meshLambertMaterial color="#4c5152" />
          </mesh>
          <mesh position={[0, 3.6, 0]} castShadow>
            <boxGeometry args={[0.34, 0.9, 0.28]} />
            <meshLambertMaterial color="#2f3436" />
          </mesh>
          <group
            ref={(el) => {
              signalRefs.current[i] = el;
            }}
          >
            {[0, 1, 2].map((k) => (
              <mesh key={k} position={[0, 3.9 - k * 0.28, -0.16]}>
                <circleGeometry args={[0.1, 10]} />
                <meshBasicMaterial color="#2a2a2c" />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}
