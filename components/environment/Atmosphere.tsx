"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { CONFIG } from "@/lib/config";
import { cityness } from "@/lib/journey";
import { sFromZ } from "@/lib/road";
import { useGame } from "@/stores/useGame";

/**
 * Atmosphere
 * ----------
 * Daytime sky, distance fog, ambient light and the sun.
 *
 * The directional light and its shadow frustum ride along with the car, so
 * there are always crisp moving shadows around the player without needing
 * a huge, blurry shadow map that covers the whole world.
 */
export function Atmosphere() {
  const sunGroup = useRef<THREE.Group>(null);
  const { scene } = useThree();

  const hillFog = useRef(new THREE.Color(CONFIG.sky.fogColor)).current;
  const valleyFog = useRef(new THREE.Color("#cdc2ad")).current;
  const workingFog = useRef(new THREE.Color()).current;

  useFrame((_, dt) => {
    const { position } = useGame.getState().vehicle;
    if (sunGroup.current) {
      // Move the whole light rig (light + its target) with the car.
      sunGroup.current.position.set(position.x, position.y, position.z);
    }

    // Kathmandu sits under a bowl of dust. As the road drops into the
    // valley the fog warms and closes in; up in the hills the air is clear.
    const fog = scene.fog as THREE.Fog | null;
    if (!fog) return;

    const urban = cityness(sFromZ(position.z));
    workingFog.copy(hillFog).lerp(valleyFog, urban);
    fog.color.lerp(workingFog, 1 - Math.exp(-dt));
    fog.near = THREE.MathUtils.damp(fog.near, CONFIG.sky.fogNear - urban * 45, 1, dt);
    fog.far = THREE.MathUtils.damp(fog.far, CONFIG.sky.fogFar - urban * 150, 1, dt);
  });

  const s = CONFIG.sky;

  return (
    <>
      {/* Bright daytime sky dome */}
      <Sky sunPosition={s.sunPosition} turbidity={4} rayleigh={0.6} />

      {/* Soft fog hides chunks appearing in the far distance */}
      <fog attach="fog" args={[s.fogColor, s.fogNear, s.fogFar]} />

      {/* Soft ambient fill */}
      <ambientLight intensity={0.5} color="#dfeaf5" />
      <hemisphereLight intensity={0.4} color="#cfe5ff" groundColor="#7a8a5f" />

      {/* Sun — follows the car so shadows are always crisp nearby */}
      <group ref={sunGroup}>
        <directionalLight
          position={s.sunPosition}
          intensity={1.5}
          color="#fff4e0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={10}
          shadow-camera-far={320}
          shadow-camera-left={-70}
          shadow-camera-right={70}
          shadow-camera-top={70}
          shadow-camera-bottom={-70}
          shadow-bias={-0.0004}
        />
      </group>
    </>
  );
}
