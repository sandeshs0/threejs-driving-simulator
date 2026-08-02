"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { CityLayout, Placed } from "@/lib/city";
import { Person } from "./Person";

/**
 * StreetLife
 * ----------
 * Everything on a Kathmandu pavement that is not a building: the fruit
 * carts pulled up against the kerb, the rank of parked motorbikes, the
 * people standing about outside the shops, the dog asleep in the sun, the
 * cow that has decided this lane is now hers, and the prayer flags strung
 * right across the street.
 *
 * These are the details that make a street read as somewhere rather than as
 * geometry. They are also all small and static, so they are plain groups —
 * there are only a handful per chunk and instancing them would cost more in
 * bookkeeping than it saves in draw calls.
 */

const FLAG_COLORS = ["#2f6fbf", "#ffffff", "#d33a2c", "#2f9e52", "#e8b52c"];
const PRODUCE = ["#d94f2b", "#e8a52c", "#5c8f3a", "#c22f3a", "#e0c845"];

/**
 * Yaw that makes an item on the footpath face the street.
 *
 * Derived, not guessed: a group's local -Z maps to (-sin θ, -cos θ), and
 * the road lies in the -side outward direction, which gives θ = rot + side·π/2.
 */
const facingRoad = (item: Placed) => item.rot + (item.side * Math.PI) / 2;

export function StreetLife({ city }: { city: CityLayout }) {
  return (
    <group>
      {city.bystanders.map((b, i) => (
        <group
          key={i}
          position={[b.x, b.y, b.z]}
          // Nobody stands square to anything; the phase gives each person a
          // slightly different angle so a group is not a formation.
          rotation={[0, facingRoad(b) + Math.sin(b.phase) * 0.9, 0]}
        >
          <Person outfit={b.outfit} hat={b.hat} pose={b.pose} />
        </group>
      ))}

      {city.carts.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} rotation={[0, facingRoad(c), 0]}>
          <Cart seed={i} />
        </group>
      ))}

      {city.parkedBikes.map((b, i) => (
        <group key={i} position={[b.x, b.y, b.z]} rotation={[0, facingRoad(b), 0]}>
          <ParkedBike />
        </group>
      ))}

      {city.animals.map((a, i) => (
        <group key={i} position={[a.x, a.y, a.z]} rotation={[0, a.rot + 0.4, 0]}>
          {a.kind === "cow" ? <Cow /> : <Dog />}
        </group>
      ))}

      {city.flagLines.map((line, i) => (
        <FlagSpan key={i} from={line.from} to={line.to} />
      ))}
    </group>
  );
}

/** A hand-cart of fruit and vegetables, the kind pushed up to a corner. */
function Cart({ seed }: { seed: number }) {
  const piles = useMemo(() => {
    const out: { x: number; z: number; color: string; r: number }[] = [];
    for (let i = 0; i < 6; i++) {
      out.push({
        x: -0.7 + (i % 3) * 0.7,
        z: i < 3 ? -0.18 : 0.2,
        color: PRODUCE[(seed + i) % PRODUCE.length],
        r: 0.13 + ((seed + i) % 3) * 0.025,
      });
    }
    return out;
  }, [seed]);

  return (
    <group>
      {/* Deck and the frame under it */}
      <mesh position={[0, 0.68, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.12, 0.95]} />
        <meshLambertMaterial color="#8a6b45" />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[1.9, 0.36, 0.12]} />
        <meshLambertMaterial color="#6d5335" />
      </mesh>
      {/* Low rails so nothing rolls off */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[0, 0.8, side * 0.44]}>
          <boxGeometry args={[2.1, 0.14, 0.05]} />
          <meshLambertMaterial color="#7a5c3c" />
        </mesh>
      ))}
      {/* Two cart wheels and the prop that holds it level */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          position={[side * 0.6, 0.3, 0]}
          rotation-z={Math.PI / 2}
          castShadow
        >
          <cylinderGeometry args={[0.3, 0.3, 0.08, 12]} />
          <meshLambertMaterial color="#2e2b28" />
        </mesh>
      ))}
      <mesh position={[-1.0, 0.34, 0]} rotation-z={0.25}>
        <cylinderGeometry args={[0.03, 0.03, 0.68, 6]} />
        <meshLambertMaterial color="#5c4a34" />
      </mesh>

      {/* The produce, heaped in rows */}
      {piles.map((pile, i) => (
        <group key={i} position={[pile.x, 0.78, pile.z]}>
          {[0, 1, 2].map((k) => (
            <mesh
              key={k}
              position={[(k - 1) * pile.r * 0.9, pile.r * (k === 1 ? 1.4 : 0.9), 0]}
              castShadow
            >
              <sphereGeometry args={[pile.r, 8, 6]} />
              <meshLambertMaterial color={pile.color} />
            </mesh>
          ))}
        </group>
      ))}

      {/* A single bulb on a wire over the stock, for after dark */}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshBasicMaterial color="#ffe9b0" />
      </mesh>
    </group>
  );
}

/** A motorbike on its side stand, nose in to the kerb. */
function ParkedBike() {
  return (
    <group rotation={[0, 0, 0.09]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.24, 0.3, 1.4]} />
        <meshLambertMaterial color="#31353d" />
      </mesh>
      <mesh position={[0, 0.82, 0.18]} castShadow>
        <boxGeometry args={[0.26, 0.14, 0.6]} />
        <meshLambertMaterial color="#1a1a1e" />
      </mesh>
      {/* Handlebars */}
      <mesh position={[0, 0.98, -0.55]}>
        <boxGeometry args={[0.6, 0.05, 0.05]} />
        <meshLambertMaterial color="#54585e" />
      </mesh>
      {([-0.66, 0.66] as const).map((z) => (
        <mesh key={z} position={[0, 0.3, z]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.29, 0.29, 0.09, 10]} />
          <meshLambertMaterial color="#151517" />
        </mesh>
      ))}
    </group>
  );
}

/** Zebu: pale, humped, entirely unbothered. */
function Cow() {
  return (
    <group>
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.7, 1.7]} />
        <meshLambertMaterial color="#d8d2c4" />
      </mesh>
      {/* The shoulder hump that says zebu rather than dairy cow */}
      <mesh position={[0, 1.36, -0.4]} castShadow>
        <boxGeometry args={[0.42, 0.3, 0.5]} />
        <meshLambertMaterial color="#cec7b8" />
      </mesh>
      {/* Neck and head */}
      <mesh position={[0, 1.1, -1.0]} castShadow>
        <boxGeometry args={[0.36, 0.36, 0.6]} />
        <meshLambertMaterial color="#d8d2c4" />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * 0.17, 1.32, -1.1]} rotation-z={side * 0.6}>
          <cylinderGeometry args={[0.02, 0.045, 0.26, 6]} />
          <meshLambertMaterial color="#b3a894" />
        </mesh>
      ))}
      {/* Legs */}
      {([-1, 1] as const).map((sx) =>
        ([-0.6, 0.6] as const).map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.22, 0.3, sz]} castShadow>
            <boxGeometry args={[0.13, 0.6, 0.14]} />
            <meshLambertMaterial color="#c9c2b3" />
          </mesh>
        ))
      )}
      {/* Tail */}
      <mesh position={[0, 1.0, 0.9]} rotation-x={-0.35}>
        <cylinderGeometry args={[0.03, 0.02, 0.7, 5]} />
        <meshLambertMaterial color="#c2bbab" />
      </mesh>
    </group>
  );
}

/** Street dog, asleep. */
function Dog() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.26, 0.24, 0.72]} />
        <meshLambertMaterial color="#a8845c" />
      </mesh>
      <mesh position={[0, 0.28, -0.44]} castShadow>
        <boxGeometry args={[0.2, 0.2, 0.24]} />
        <meshLambertMaterial color="#b28e63" />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * 0.07, 0.4, -0.44]} rotation-z={side * 0.3}>
          <boxGeometry args={[0.05, 0.12, 0.06]} />
          <meshLambertMaterial color="#8d6c48" />
        </mesh>
      ))}
      <mesh position={[0, 0.16, 0.44]} rotation-x={0.5}>
        <cylinderGeometry args={[0.025, 0.02, 0.34, 5]} />
        <meshLambertMaterial color="#a8845c" />
      </mesh>
    </group>
  );
}

/**
 * Prayer flags strung across the street.
 *
 * The line is a quadratic Bézier with the control point pulled down, which
 * is close enough to a catenary at this scale, and each flag is placed
 * along it and tipped by the local slope so the row hangs rather than
 * floating.
 */
function FlagSpan({
  from,
  to,
}: {
  from: [number, number, number];
  to: [number, number, number];
}) {
  const flags = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 1.5;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);

    const count = 22;
    const points = curve.getPoints(count);
    return points.slice(1, -1).map((p, i) => {
      const next = points[i + 2];
      const prev = points[i];
      // Tip each flag with the slope of the line it hangs from.
      const tilt = Math.atan2(next.y - prev.y, prev.distanceTo(next));
      const yaw = Math.atan2(next.x - prev.x, next.z - prev.z);
      return { pos: [p.x, p.y - 0.16, p.z] as const, tilt, yaw, i };
    });
  }, [from, to]);

  return (
    <group>
      {flags.map((f) => (
        <mesh
          key={f.i}
          position={[f.pos[0], f.pos[1], f.pos[2]]}
          rotation={[0, f.yaw, f.tilt]}
        >
          <planeGeometry args={[0.3, 0.34]} />
          <meshLambertMaterial
            color={FLAG_COLORS[f.i % FLAG_COLORS.length]}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
