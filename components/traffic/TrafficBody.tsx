"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { TRAFFIC_HEADLAMP, TRAFFIC_TAILLAMP } from "@/lib/litMaterials";
import { mulberry32 } from "@/lib/rng";

/**
 * TrafficBody
 * -----------
 * Low-poly Kathmandu traffic, in the same visual language as the world:
 *
 *  bus    the long, brightly painted intercity coach with a roof rack
 *  micro  the white minibus that stops anywhere for anyone
 *  tempo  the little three-wheeled electric people-carrier
 *  taxi   a small white hatchback with the black roof sign
 *  truck  a Tata with a decorated cab and a tarpaulin load
 *  bike   a motorbike with a rider
 *
 * All face -Z like the player's car, so the same heading maths applies.
 */
export type TrafficKind = "bus" | "micro" | "tempo" | "taxi" | "truck" | "van" | "bike";

const BUS_COLORS = ["#2f6fae", "#3f8f5a", "#b8462f", "#8d5aa8", "#c9922c"];
const CAR_COLORS = ["#dfe2e5", "#5c6a75", "#8f2f2a", "#2f5a8d", "#d8d3c4"];

export function TrafficBody({ kind, seed }: { kind: TrafficKind; seed: number }) {
  const rng = useMemo(() => mulberry32(seed * 7919 + 13), [seed]);
  const palette = useMemo(
    () => ({
      bus: BUS_COLORS[Math.floor(rng() * BUS_COLORS.length)],
      car: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
    }),
    [rng]
  );

  const body = () => {
    switch (kind) {
      case "bus":
        return <Bus color={palette.bus} />;
      case "micro":
      case "van":
        return <Micro />;
      case "tempo":
        return <Tempo />;
      case "truck":
        return <Truck color={palette.bus} />;
      case "bike":
        return <Bike />;
      default:
        return <Taxi color={palette.car} />;
    }
  };

  return (
    <group>
      {body()}
      <Lamps kind={kind} />
    </group>
  );
}

/**
 * Head and tail lamps.
 *
 * These are emissive faces, not lights. A city street holds thirty vehicles
 * in view and thirty pairs of spot lights is not a frame budget — but the
 * bloom pass already in the post chain turns a bright unlit face into a
 * glow, and a glow at distance is all an oncoming headlight ever is. The
 * player's car is the exception and gets real beams; see
 * components/vehicle/Headlights.
 *
 * Every lamp in the game shares two materials, so the whole valley switches
 * on together at dusk. See lib/litMaterials.
 */
type Lamp = [number, number, number];

const LAMP_GEOMETRY = new THREE.BoxGeometry(0.26, 0.13, 0.07);
const LAMP_GEOMETRY_SMALL = new THREE.BoxGeometry(0.14, 0.11, 0.06);

const LAMPS: Record<TrafficKind, { front: Lamp[]; rear: Lamp[] }> = {
  bus: {
    front: [[-0.95, 0.95, -5.03], [0.95, 0.95, -5.03]],
    rear: [[-0.95, 1.0, 5.03], [0.95, 1.0, 5.03]],
  },
  truck: {
    front: [[-0.85, 0.95, -3.56], [0.85, 0.95, -3.56]],
    rear: [[-0.95, 0.8, 3.92], [0.95, 0.8, 3.92]],
  },
  micro: {
    front: [[-0.72, 0.8, -2.62], [0.72, 0.8, -2.62]],
    rear: [[-0.75, 1.0, 2.62], [0.75, 1.0, 2.62]],
  },
  van: {
    front: [[-0.72, 0.8, -2.62], [0.72, 0.8, -2.62]],
    rear: [[-0.75, 1.0, 2.62], [0.75, 1.0, 2.62]],
  },
  taxi: {
    front: [[-0.58, 0.66, -1.97], [0.58, 0.66, -1.97]],
    rear: [[-0.58, 0.72, 1.97], [0.58, 0.72, 1.97]],
  },
  // A three-wheeler has one lamp, above its single front wheel.
  tempo: {
    front: [[0, 0.95, -1.67]],
    rear: [[-0.45, 1.05, 1.62], [0.45, 1.05, 1.62]],
  },
  bike: {
    front: [[0, 0.86, -0.94]],
    rear: [[0, 0.72, 0.95]],
  },
};

function Lamps({ kind }: { kind: TrafficKind }) {
  const { front, rear } = LAMPS[kind];
  const geometry = kind === "bike" || kind === "tempo"
    ? LAMP_GEOMETRY_SMALL
    : LAMP_GEOMETRY;

  return (
    <>
      {front.map((p, i) => (
        <mesh key={`f${i}`} position={p} geometry={geometry} material={TRAFFIC_HEADLAMP} />
      ))}
      {rear.map((p, i) => (
        <mesh key={`r${i}`} position={p} geometry={geometry} material={TRAFFIC_TAILLAMP} />
      ))}
    </>
  );
}

/** Shared wheel row. */
function Wheels({
  positions,
  radius = 0.42,
}: {
  positions: [number, number][];
  radius?: number;
}) {
  return (
    <>
      {positions.map(([x, z], i) => (
        <mesh key={i} position={[x, radius, z]} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[radius, radius, 0.26, 10]} />
          <meshLambertMaterial color="#141416" />
        </mesh>
      ))}
    </>
  );
}

function Bus({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 1.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 2.5, 10]} />
        <meshLambertMaterial color={color} />
      </mesh>
      {/* Window band down both flanks and across the front */}
      <mesh position={[0, 2.35, -0.2]}>
        <boxGeometry args={[2.54, 0.9, 8.6]} />
        <meshLambertMaterial color="#20323f" />
      </mesh>
      {/* Painted skirt — every bus has one */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[2.56, 0.5, 9.9]} />
        <meshLambertMaterial color="#c9302c" />
      </mesh>
      {/* Roof rack piled with luggage */}
      <mesh position={[0, 3.15, 1.5]} castShadow>
        <boxGeometry args={[2.2, 0.6, 5]} />
        <meshLambertMaterial color="#7d7466" />
      </mesh>
      <Wheels positions={[[-1.1, -3.4], [1.1, -3.4], [-1.1, 3.4], [1.1, 3.4]]} radius={0.52} />
    </group>
  );
}

function Micro() {
  return (
    <group>
      <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 1.9, 5.2]} />
        <meshLambertMaterial color="#e6e6e2" />
      </mesh>
      <mesh position={[0, 1.75, -0.3]}>
        <boxGeometry args={[2.04, 0.7, 4.2]} />
        <meshLambertMaterial color="#22343f" />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[2.06, 0.35, 5.0]} />
        <meshLambertMaterial color="#2f6fae" />
      </mesh>
      <Wheels positions={[[-0.9, -1.7], [0.9, -1.7], [-0.9, 1.8], [0.9, 1.8]]} />
    </group>
  );
}

function Tempo() {
  return (
    <group>
      {/* Three-wheeler: single wheel up front, cabin behind */}
      <mesh position={[0, 1.1, 0.2]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.5, 2.8]} />
        <meshLambertMaterial color="#3f9e8c" />
      </mesh>
      <mesh position={[0, 1.55, 0.1]}>
        <boxGeometry args={[1.54, 0.55, 2.2]} />
        <meshLambertMaterial color="#22343f" />
      </mesh>
      <mesh position={[0, 0.95, -1.3]} castShadow>
        <boxGeometry args={[0.8, 0.9, 0.7]} />
        <meshLambertMaterial color="#3f9e8c" />
      </mesh>
      <Wheels positions={[[0, -1.4], [-0.66, 1.1], [0.66, 1.1]]} radius={0.32} />
    </group>
  );
}

function Taxi({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.62, 3.9]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.25, 0.25]} castShadow>
        <boxGeometry args={[1.55, 0.58, 1.9]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.26, 0.25]}>
        <boxGeometry args={[1.58, 0.4, 1.7]} />
        <meshLambertMaterial color="#22343f" />
      </mesh>
      {/* Roof sign */}
      <mesh position={[0, 1.62, 0.3]}>
        <boxGeometry args={[0.7, 0.18, 0.28]} />
        <meshLambertMaterial color="#e8d24a" />
      </mesh>
      <Wheels positions={[[-0.8, -1.25], [0.8, -1.25], [-0.8, 1.3], [0.8, 1.3]]} radius={0.32} />
    </group>
  );
}

function Truck({ color }: { color: string }) {
  return (
    <group>
      {/* Cab, painted and decorated */}
      <mesh position={[0, 1.55, -2.6]} castShadow receiveShadow>
        <boxGeometry args={[2.3, 2.1, 1.9]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, 2.1, -3.5]}>
        <boxGeometry args={[2.1, 0.75, 0.16]} />
        <meshLambertMaterial color="#22343f" />
      </mesh>
      {/* Tarpaulin-covered load */}
      <mesh position={[0, 1.85, 1.1]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 2.3, 5.6]} />
        <meshLambertMaterial color="#7d7f74" />
      </mesh>
      <mesh position={[0, 0.75, 0.4]}>
        <boxGeometry args={[2.44, 0.5, 7.6]} />
        <meshLambertMaterial color="#b8462f" />
      </mesh>
      <Wheels
        positions={[[-1.05, -2.6], [1.05, -2.6], [-1.05, 2.0], [1.05, 2.0], [-1.05, 3.1], [1.05, 3.1]]}
        radius={0.5}
      />
    </group>
  );
}

function Bike() {
  return (
    <group>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[0.28, 0.34, 1.5]} />
        <meshLambertMaterial color="#2b2b30" />
      </mesh>
      {/* Rider: torso and helmet */}
      <mesh position={[0, 1.15, 0.15]} castShadow>
        <boxGeometry args={[0.42, 0.62, 0.34]} />
        <meshLambertMaterial color="#3f5a7a" />
      </mesh>
      <mesh position={[0, 1.58, 0.1]} castShadow>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshLambertMaterial color="#c9302c" />
      </mesh>
      <Wheels positions={[[0, -0.72], [0, 0.72]]} radius={0.3} />
    </group>
  );
}
