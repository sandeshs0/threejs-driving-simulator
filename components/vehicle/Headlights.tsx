"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CONFIG } from "@/lib/config";
import { BEAM } from "@/lib/litMaterials";
import { SKY } from "@/lib/weather";
import { useGame } from "@/stores/useGame";

/**
 * Headlights
 * ----------
 * Two spot lights on the nose, plus the cones of lit air in front of them.
 *
 * These are the only real lights in the game that are not the sun. Traffic,
 * street lamps and shopfronts are all emissive surfaces and additive decals
 * — sixty spot lights in view is not a frame budget, it is a slideshow — but
 * the player's own beams have to be genuine, because the entire experience
 * of driving at night is watching a piece of road appear inside them.
 *
 * They cast no shadows. A headlight's shadow map would need to be redrawn
 * every frame from a viewpoint that moves at fifty metres a second, for two
 * lights, on top of the sun's; and what it would buy is a hard-edged
 * silhouette on the road ahead, which is not what dipped beams look like.
 *
 * Mounted inside the car's tilt group, so they dip under braking and lift
 * under acceleration along with the body. That is free here and it is one of
 * the things that makes night driving feel weighted.
 */

/** Lamp positions, matching the units in <CarExterior/>. */
const LAMP_X = 0.6;
const LAMP_Y = 0.78;
const LAMP_Z = -2.18;

export function Headlights() {
  const group = useRef<THREE.Group>(null);
  const left = useRef<THREE.SpotLight>(null);
  const right = useRef<THREE.SpotLight>(null);
  const leftTarget = useRef<THREE.Object3D>(null);
  const rightTarget = useRef<THREE.Object3D>(null);
  const beams = useRef<THREE.Group>(null);

  useFrame(() => {
    const on = SKY.headlights;
    const g = group.current;
    if (!g) return;

    // Skip the whole rig by day — including the matrix work for four extra
    // objects and two shadowless-but-still-uploaded light uniforms.
    g.visible = on > 0.01;
    if (!g.visible) return;

    const cfg = CONFIG.lighting;
    const car = useGame.getState().vehicle;
    // Full beam is worth a little more reach on an unlit hill road; in town
    // there is enough spill that it would only wash out.
    const level = on * cfg.headlightIntensity;

    for (const [light, target] of [
      [left, leftTarget],
      [right, rightTarget],
    ] as const) {
      const l = light.current;
      if (!l) continue;
      if (target.current && l.target !== target.current) l.target = target.current;
      l.intensity = level;
    }

    // The beams themselves swing with the steering, the way projectors on a
    // solid axle do not — but the pool of light on the road does move with
    // where the wheels are pointed, and following the steer angle is how
    // that reads from the driver's seat.
    const swing = car.steerAngle * 0.55;
    if (leftTarget.current) leftTarget.current.position.x = -LAMP_X + swing * 12;
    if (rightTarget.current) rightTarget.current.position.x = LAMP_X + swing * 12;
    if (beams.current) beams.current.rotation.y = swing * 0.5;
  });

  const cfg = CONFIG.lighting;

  return (
    <group ref={group} visible={false}>
      {[-1, 1].map((side) => {
        const isLeft = side < 0;
        return (
          <group key={side}>
            <spotLight
              ref={isLeft ? left : right}
              position={[side * LAMP_X, LAMP_Y, LAMP_Z]}
              angle={cfg.headlightAngle}
              penumbra={0.65}
              // Slow falloff: physical inverse-square puts everything past
              // fifteen metres in the dark, and a dipped beam throws further
              // than that. This is a lens, not a bare bulb.
              decay={1.45}
              distance={cfg.headlightRange}
              intensity={0}
              color="#fff3dc"
            />
            <object3D
              ref={isLeft ? leftTarget : rightTarget}
              position={[side * LAMP_X, LAMP_Y - 1.5, LAMP_Z - 22]}
            />
          </group>
        );
      })}

      {/* Lit air. Only drawn when there is something in it — see BEAM. */}
      <group ref={beams} position={[0, LAMP_Y, LAMP_Z]} rotation-x={-0.05}>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * LAMP_X, 0, -cfg.beamLength / 2]}
            rotation-x={Math.PI / 2}
            material={BEAM}
          >
            <coneGeometry
              args={[
                cfg.beamLength * Math.tan(cfg.headlightAngle) * 0.8,
                cfg.beamLength,
                14,
                1,
                true,
              ]}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
