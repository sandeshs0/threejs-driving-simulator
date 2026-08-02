"use client";

import { Suspense } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Environment, KeyboardControls } from "@react-three/drei";
import { Physics, CuboidCollider, RigidBody } from "@react-three/rapier";
import { controlsMap } from "@/lib/controls";
import { Vehicle } from "@/components/vehicle/Vehicle";
import { CameraController } from "@/components/camera/CameraController";
import { RoadChunkManager } from "@/components/road/RoadChunkManager";
import { Traffic } from "@/components/traffic/Traffic";
import { Pedestrians } from "@/components/city/Pedestrians";
import { Atmosphere } from "@/components/environment/Atmosphere";
import { Effects } from "@/components/effects/Effects";
import { AudioSystem } from "@/components/audio/AudioSystem";
import { HUD } from "@/components/ui/HUD";
import { Minimap } from "@/components/ui/Minimap";
import { HudBridge } from "@/components/ui/HudBridge";
import { StartOverlay } from "@/components/ui/StartOverlay";
import { TuningPanel } from "@/components/ui/TuningPanel";

/**
 * Experience
 * ----------
 * Composition root: canvas, physics world, vehicle, camera, infinite road,
 * atmosphere, audio, post-processing and the DOM overlays.
 *
 * Systems are separate components that communicate only through the
 * Zustand store, so AI traffic, weather or a day/night cycle can be added
 * by dropping in a new component without touching the rest.
 */
export default function Experience() {
  return (
    <>
      <KeyboardControls map={controlsMap}>
        <Canvas shadows dpr={[1, 2]}>
          <Suspense fallback={null}>
            {/*
              Reflection source for the car's black paint and chrome.
              Built from geometry rather than a downloaded HDR: a sky dome,
              a ground half and a bright sun, baked into a small cubemap on
              the first frame. No network request, and gloss has something
              to reflect — without it the paint reads as a flat dark blob.
            */}
            <Environment resolution={128} frames={1}>
              <mesh scale={60}>
                <sphereGeometry args={[1, 24, 16]} />
                <meshBasicMaterial color="#8fb8e0" side={THREE.BackSide} />
              </mesh>
              <mesh position={[0, -12, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[120, 120]} />
                <meshBasicMaterial color="#5c6a58" />
              </mesh>
              <mesh position={[14, 26, 10]}>
                <sphereGeometry args={[7, 16, 12]} />
                <meshBasicMaterial color="#fff6e2" />
              </mesh>
            </Environment>

            <Physics gravity={[0, -9.81, 0]}>
              {/* Ground plane collider for future dynamic objects */}
              <RigidBody type="fixed">
                <CuboidCollider args={[5000, 0.5, 5000]} position={[0, -0.5, 0]} />
              </RigidBody>

              <Vehicle />
            </Physics>

            <CameraController />
            <RoadChunkManager />
            <Traffic />
            <Pedestrians />
            <Atmosphere />
            <Effects />
            <AudioSystem />
            <HudBridge />
          </Suspense>
        </Canvas>
      </KeyboardControls>

      {/* DOM overlays */}
      <HUD />
      <Minimap />
      <StartOverlay />
      <TuningPanel />
    </>
  );
}
