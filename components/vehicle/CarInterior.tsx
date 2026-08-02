"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CONFIG } from "@/lib/config";
import { useGame } from "@/stores/useGame";
import { InfotainmentScreen } from "./InfotainmentScreen";

/**
 * CarInterior
 * -----------
 * The cabin inboard of the windshield: dashboard, twin-dial cluster,
 * steering wheel, centre console, door cards and seats.
 *
 * CarExterior owns the windshield frame and glass; this component owns
 * everything inside it, so the two never fight over the same surface.
 * Being a convertible there is no roof, header trim or sun visor — the
 * mirror hangs off the windshield header instead.
 *
 * The car is right-hand drive, because Nepal keeps left. Rather than
 * hard-code that, the whole cabin is laid out about `DX` — the driver's eye
 * x from CONFIG — so the seat, cluster, wheel, column and console all move
 * together if the drive side is ever flipped.
 *
 * Layout follows from the driver's eye at (DX, 1.30, 0). The vertical
 * budget below the eye is what makes or breaks a first-person view:
 *
 *   1.30  eye
 *   1.14  top of the instrument binnacle   (~15° down, easy to read)
 *   1.02  top of the steering wheel rim    (~32° down, bottom of frame)
 *   1.00  top of the dash pad
 *   0.88  hood                             (~11° down, road from ~7 m)
 *
 * The seats matter more than usual here: with the top down they are on
 * show in the chase and cinematic views.
 */

/** Gauge sweep: 270° of travel, starting at the lower left. */
const SWEEP_START = Math.PI * 0.75;
const SWEEP_TOTAL = Math.PI * 1.5;
const angleFor = (t: number) =>
  SWEEP_START - THREE.MathUtils.clamp(t, 0, 1) * SWEEP_TOTAL;

const SPEEDO_MAX_KMH = 260;

/** Driver's side of the cabin. Positive = right-hand drive. */
const DX = CONFIG.camera.eyeOffset.x;
/** Sign of the passenger side, used to swing the console the other way. */
const PX = -Math.sign(DX);

export function CarInterior() {
  const speedNeedle = useRef<THREE.Group>(null);
  const tachoNeedle = useRef<THREE.Group>(null);
  const wheelRef = useRef<THREE.Group>(null);
  const shifterRef = useRef<THREE.Group>(null);
  const gearPips = useRef<(THREE.Mesh | null)[]>([]);

  const m = useMemo(
    () => ({
      dash: new THREE.MeshStandardMaterial({ color: "#1a1a1e", roughness: 0.75 }),
      dashSoft: new THREE.MeshStandardMaterial({ color: "#141417", roughness: 0.9 }),
      trim: new THREE.MeshStandardMaterial({
        color: "#8d9298",
        metalness: 0.9,
        roughness: 0.28,
      }),
      leather: new THREE.MeshStandardMaterial({ color: "#151216", roughness: 0.85 }),
      stitch: new THREE.MeshStandardMaterial({ color: "#6e6a63", roughness: 0.9 }),
      gaugeFace: new THREE.MeshBasicMaterial({ color: "#0b0c0f" }),
      tick: new THREE.MeshBasicMaterial({ color: "#d8dade" }),
      tickRed: new THREE.MeshBasicMaterial({ color: "#d8402e" }),
      needle: new THREE.MeshBasicMaterial({ color: "#e8503a" }),
      screen: new THREE.MeshBasicMaterial({ color: "#10161d" }),
      mirror: new THREE.MeshStandardMaterial({
        color: "#20272f",
        metalness: 0.9,
        roughness: 0.1,
      }),
    }),
    []
  );

  useFrame(() => {
    const car = useGame.getState().vehicle;
    const cfg = CONFIG.vehicle;

    if (speedNeedle.current) {
      const kmh = Math.abs(car.speed) * 3.6;
      speedNeedle.current.rotation.z = angleFor(kmh / SPEEDO_MAX_KMH);
    }
    if (tachoNeedle.current) {
      tachoNeedle.current.rotation.z = angleFor(car.rpm / cfg.redlineRpm);
    }

    // Steering wheel mirrors the front axle, geared up like a real rack.
    if (wheelRef.current) wheelRef.current.rotation.z = -car.steerAngle * 3.2;

    if (shifterRef.current) {
      shifterRef.current.rotation.x =
        car.gear === -1 ? -0.28 : 0.1 + car.gear * 0.035;
    }

    // Gear indicator: pips are R, N, 1..5 (index 0..6).
    const active = car.gear === -1 ? 0 : car.gear + 1;
    gearPips.current.forEach((pip, i) => {
      if (!pip) return;
      (pip.material as THREE.MeshBasicMaterial).color.set(
        i === active ? "#5fd0a0" : "#2a2d33"
      );
    });
  });

  return (
    <group>
      {/* Fill light so the cabin isn't a silhouette against a bright sky */}
      <pointLight position={[0, 1.2, -0.3]} intensity={0.45} distance={3.2} decay={2} />

      {/* ---------------- Dashboard ---------------- */}
      <mesh position={[0, 0.8, -0.72]} material={m.dash}>
        <boxGeometry args={[1.72, 0.3, 0.42]} />
      </mesh>
      {/* Top pad, angled up toward the glass */}
      <mesh position={[0, 0.93, -0.87]} rotation-x={-0.4} material={m.dashSoft}>
        <boxGeometry args={[1.72, 0.04, 0.34]} />
      </mesh>
      {/* Knee bolster */}
      <mesh position={[0, 0.58, -0.58]} material={m.dashSoft}>
        <boxGeometry args={[1.68, 0.24, 0.28]} />
      </mesh>
      {/* Chrome trim strip across the fascia */}
      <mesh position={[0, 0.9, -0.51]} material={m.trim}>
        <boxGeometry args={[1.68, 0.02, 0.02]} />
      </mesh>

      {/* Round turbine vents, an SL interior signature */}
      {[-0.72, -0.02, 0.68].map((x) => (
        <group key={x} position={[x, 0.86, -0.5]}>
          <mesh rotation-x={Math.PI / 2} material={m.trim}>
            <cylinderGeometry args={[0.062, 0.062, 0.03, 14]} />
          </mesh>
          <mesh position={[0, 0, 0.012]} rotation-x={Math.PI / 2} material={m.dashSoft}>
            <cylinderGeometry args={[0.048, 0.048, 0.02, 14]} />
          </mesh>
        </group>
      ))}

      {/* ---------------- Instrument cluster ---------------- */}
      <group position={[DX, 1.02, -0.58]} rotation-x={0.32}>
        {/* Binnacle hood shading the dials */}
        <mesh position={[0, 0.14, -0.06]} rotation-x={-0.5} material={m.dashSoft}>
          <boxGeometry args={[0.56, 0.03, 0.2]} />
        </mesh>
        <mesh position={[0, 0, -0.015]} material={m.dashSoft}>
          <boxGeometry args={[0.56, 0.26, 0.03]} />
        </mesh>

        <Gauge
          position={[-0.125, 0, 0]}
          radius={0.095}
          majorTicks={8}
          redlineFrom={0.78}
          materials={m}
          needleRef={tachoNeedle}
        />
        <Gauge
          position={[0.125, 0, 0]}
          radius={0.095}
          majorTicks={11}
          materials={m}
          needleRef={speedNeedle}
        />

        {/* Gear indicator between the dials: R N 1 2 3 4 5 */}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh
            key={i}
            position={[0, 0.075 - i * 0.021, 0.005]}
            ref={(el) => {
              gearPips.current[i] = el;
            }}
          >
            <boxGeometry args={[0.02, 0.012, 0.004]} />
            <meshBasicMaterial color="#2a2d33" />
          </mesh>
        ))}
      </group>

      {/* ---------------- Steering wheel ---------------- */}
      <group position={[DX, 0.85, -0.42]} rotation-x={0.42}>
        <group ref={wheelRef}>
          <mesh material={m.leather}>
            <torusGeometry args={[0.185, 0.022, 8, 28]} />
          </mesh>
          {/* Three spokes */}
          {[-2.6, -0.54, Math.PI / 2].map((a, i) => (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0]}
              rotation-z={a}
              material={m.trim}
            >
              <boxGeometry args={[0.19, 0.026, 0.016]} />
            </mesh>
          ))}
          {/* Hub, with the star on the boss */}
          <mesh position={[0, 0, 0.012]} rotation-x={Math.PI / 2} material={m.dash}>
            <cylinderGeometry args={[0.055, 0.055, 0.035, 12]} />
          </mesh>
          <mesh position={[0, 0, 0.032]} rotation-x={Math.PI / 2} material={m.trim}>
            <cylinderGeometry args={[0.02, 0.02, 0.012, 10]} />
          </mesh>
        </group>
      </group>
      {/* Column shroud running back into the dash */}
      <mesh position={[DX, 0.81, -0.54]} rotation-x={1.15} material={m.dashSoft}>
        <cylinderGeometry args={[0.055, 0.07, 0.22, 8]} />
      </mesh>
      {/* Stalks */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[DX + side * 0.11, 0.83, -0.5]}
          rotation-z={side * 1.35}
          material={m.dash}
        >
          <cylinderGeometry args={[0.008, 0.008, 0.13, 6]} />
        </mesh>
      ))}

      {/* ---------------- Centre console ---------------- */}
      <mesh position={[PX * 0.05, 0.64, -0.2]} material={m.dashSoft}>
        <boxGeometry args={[0.4, 0.34, 0.9]} />
      </mesh>
      {/* Infotainment screen, angled toward the driver. Live, and it opens
          the head unit when clicked. */}
      <InfotainmentScreen
        position={[PX * 0.02, 0.87, -0.48]}
        rotation={Math.sign(DX) * 0.18}
      />
      {/* Shifter — on the driver's inboard hand, so it swaps sides too */}
      <group position={[PX * 0.05, 0.8, -0.1]}>
        <group ref={shifterRef}>
          <mesh position={[0, 0.05, 0]} material={m.trim}>
            <cylinderGeometry args={[0.014, 0.018, 0.11, 8]} />
          </mesh>
          <mesh position={[0, 0.12, 0]} material={m.leather}>
            <sphereGeometry args={[0.034, 10, 8]} />
          </mesh>
        </group>
      </group>
      {/* Handbrake */}
      <mesh position={[PX * 0.05, 0.78, 0.16]} rotation-x={-0.5} material={m.trim}>
        <cylinderGeometry args={[0.013, 0.013, 0.2, 8]} />
      </mesh>

      {/* ---------------- Seats ---------------- */}
      {[-0.37, 0.37].map((x) => (
        <group key={x} position={[x, 0, 0.42]}>
          {/* Cushion */}
          <mesh position={[0, 0.6, 0]} material={m.leather} castShadow>
            <boxGeometry args={[0.5, 0.14, 0.5]} />
          </mesh>
          {/* Backrest, reclined */}
          <mesh position={[0, 0.92, 0.28]} rotation-x={0.16} material={m.leather} castShadow>
            <boxGeometry args={[0.5, 0.6, 0.14]} />
          </mesh>
          {/* Side bolsters */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.21, 0.95, 0.26]}
              rotation-x={0.16}
              material={m.leather}
              castShadow
            >
              <boxGeometry args={[0.09, 0.52, 0.2]} />
            </mesh>
          ))}
          {/* Headrest */}
          <mesh position={[0, 1.26, 0.34]} rotation-x={0.16} material={m.leather} castShadow>
            <boxGeometry args={[0.28, 0.18, 0.12]} />
          </mesh>
          {/* Contrast stitch line down the backrest */}
          <mesh position={[0, 0.92, 0.2]} rotation-x={0.16} material={m.stitch}>
            <boxGeometry args={[0.012, 0.56, 0.01]} />
          </mesh>
        </group>
      ))}

      {/* ---------------- Door cards ---------------- */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.82, 0.78, -0.1]} material={m.leather}>
            <boxGeometry args={[0.06, 0.4, 1.5]} />
          </mesh>
          {/* Armrest with a chrome pull */}
          <mesh position={[side * 0.79, 0.86, 0.05]} material={m.leather}>
            <boxGeometry args={[0.1, 0.09, 0.6]} />
          </mesh>
          <mesh position={[side * 0.78, 0.9, -0.25]} material={m.trim}>
            <boxGeometry args={[0.04, 0.03, 0.22]} />
          </mesh>
        </group>
      ))}

      {/* Rear-view mirror, hung from the windshield header */}
      <group position={[0, 1.37, -0.46]}>
        <mesh position={[0, 0.05, 0.01]} material={m.dash}>
          <boxGeometry args={[0.025, 0.07, 0.025]} />
        </mesh>
        <mesh rotation-x={0.06} material={m.dash}>
          <boxGeometry args={[0.26, 0.075, 0.03]} />
        </mesh>
        <mesh position={[0, 0, 0.017]} rotation-x={0.06} material={m.mirror}>
          <boxGeometry args={[0.24, 0.06, 0.005]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * One analogue dial: face, tick marks and a pivoting needle.
 * Ticks are plain meshes rather than text so no font has to be loaded.
 */
function Gauge({
  position,
  radius,
  majorTicks,
  redlineFrom,
  materials,
  needleRef,
}: {
  position: [number, number, number];
  radius: number;
  majorTicks: number;
  redlineFrom?: number;
  materials: Record<string, THREE.Material>;
  needleRef: React.RefObject<THREE.Group | null>;
}) {
  // Pre-compute tick transforms once — they never move.
  const ticks = useMemo(() => {
    const out: {
      pos: [number, number, number];
      rot: number;
      major: boolean;
      red: boolean;
    }[] = [];
    const total = majorTicks * 2 - 1; // a minor tick between each major
    for (let i = 0; i < total; i++) {
      const t = i / (total - 1);
      const a = angleFor(t);
      const major = i % 2 === 0;
      const r = radius - (major ? 0.016 : 0.011);
      out.push({
        pos: [-Math.sin(a) * r, Math.cos(a) * r, 0.004],
        rot: a,
        major,
        red: redlineFrom !== undefined && t >= redlineFrom,
      });
    }
    return out;
  }, [majorTicks, radius, redlineFrom]);

  return (
    <group position={position}>
      <mesh material={materials.trim}>
        <torusGeometry args={[radius, 0.008, 6, 24]} />
      </mesh>
      <mesh position={[0, 0, -0.002]} material={materials.gaugeFace}>
        <circleGeometry args={[radius, 28]} />
      </mesh>

      {ticks.map((tick, i) => (
        <mesh
          key={i}
          position={tick.pos}
          rotation-z={tick.rot}
          material={tick.red ? materials.tickRed : materials.tick}
        >
          <boxGeometry args={[0.005, tick.major ? 0.02 : 0.012, 0.002]} />
        </mesh>
      ))}

      {/* Needle: pivots at the hub, so the mesh is offset half its length */}
      <group ref={needleRef}>
        <mesh position={[0, radius * 0.36, 0.006]} material={materials.needle}>
          <boxGeometry args={[0.006, radius * 0.72, 0.003]} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.008]} rotation-x={Math.PI / 2} material={materials.trim}>
        <cylinderGeometry args={[0.012, 0.012, 0.006, 8]} />
      </mesh>
    </group>
  );
}
