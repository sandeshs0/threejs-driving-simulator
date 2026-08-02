"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { pavementOuter, roadHalfWidth } from "@/lib/config";
import {
  JUNCTION,
  UNDERPASS_DEPTH,
  UNDERPASS_HALF_WIDTH,
  underpassDepth,
} from "@/lib/junction";
import { elevation, roadPoint, roadYaw } from "@/lib/road";
import { Policeman } from "@/components/city/Policeman";

/**
 * Kalanki chowk
 * =============
 * Where the highway from Thankot meets the Ring Road, and the junction the
 * whole valley complains about.
 *
 * The real layout, which this follows: Nepal's first underpass — 800 m,
 * four lanes, opened 2018 — carries the *Ring Road* beneath the chowk,
 * running Bafal in the north to Khasibazar in the south. The Tribhuvan
 * Highway stays at grade over the top and carries on east to Kalimati. So
 * the player crosses the underpass on its deck and sees the Ring Road drop
 * away into the cut on both sides. Surface lanes flank the trench for
 * everything that is turning rather than passing through.
 *
 * Local frame
 * -----------
 * The whole junction is one group placed at the centreline and rotated by
 * the road's yaw. Inside it:
 *
 *   +X  along the Ring Road (north, toward Bafal / Sitapaila)
 *   -X  the other way (south, toward Khasibazar / Balkhu)
 *   -Z  the direction the player is travelling (on toward Kalimati)
 *
 * That is worth the one line of setup: a group rotated by `rot` maps local
 * (1,0,0) to the road's own lateral axis and local (0,0,-1) to its heading,
 * so everything below is plain axis-aligned numbers instead of curve maths.
 *
 * The ground under all this is not decoration — `lib/junction.ts` cuts the
 * trench out of `groundY`, the same way a bridge's gorge is cut, so the
 * terrain really does fall away beneath the deck.
 */

const COLORS = {
  asphalt: "#33353a",
  apron: "#3a3c40",
  wall: "#9c968a",
  wallStain: "#807a70",
  deck: "#8e887c",
  kerb: "#b8b2a4",
  line: "#e2e2e0",
  signBlue: "#1f5f8d",
  signGreen: "#2f6f5e",
  rail: "#c9302c",
};

/** Half-width of the four-lane Ring Road carriageway in the cut. */
const CARRIAGEWAY = UNDERPASS_HALF_WIDTH - 1;

/** Where the surface (turning) lanes run, either side of the trench. */
const SERVICE_OFFSET = UNDERPASS_HALF_WIDTH + JUNCTION.wall + 4;

export function KalankiJunction() {
  const s = JUNCTION.s;

  const anchor = useMemo(() => {
    const p = roadPoint(0, s);
    return {
      position: [p.x, elevation(s), p.z] as [number, number, number],
      rot: roadYaw(s),
    };
  }, [s]);

  /**
   * The trench, built as three strips running along X and sampled densely
   * enough to follow the ramp: the carriageway floor, and a retaining wall
   * on each side whose height is whatever the cut depth is at that point.
   *
   * A strip rather than a stretched box because the floor is not flat — it
   * climbs out at about 7% at each end, and the walls have to climb with it
   * or they float over the ramps.
   */
  const geometries = useMemo(() => {
    const samples: { x: number; depth: number }[] = [];
    const span = JUNCTION.rampEnd;
    const step = 2.5;
    for (let x = -span; x <= span + 0.001; x += step) {
      samples.push({ x, depth: underpassDepth(x, 0) });
    }

    /** A ribbon along X between two (z, y) profile points per sample. */
    const strip = (
      edge: (depth: number) => [number, number][]
    ): THREE.BufferGeometry => {
      const profileLength = edge(0).length;
      const positions: number[] = [];
      const indices: number[] = [];

      for (const sample of samples) {
        for (const [z, y] of edge(sample.depth)) {
          positions.push(sample.x, y, z);
        }
      }

      for (let i = 0; i < samples.length - 1; i++) {
        for (let k = 0; k < profileLength - 1; k++) {
          const a = i * profileLength + k;
          const b = a + profileLength;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    return {
      // Carriageway floor, four lanes wide.
      floor: strip((d) => [
        [-CARRIAGEWAY, -d],
        [CARRIAGEWAY, -d],
      ]),
      // Retaining walls: vertical from the floor up to street level, plus a
      // coping strip along the top.
      wallSouth: strip((d) => [
        [-CARRIAGEWAY, -d],
        [-UNDERPASS_HALF_WIDTH, -d],
        [-UNDERPASS_HALF_WIDTH, 0],
        [-UNDERPASS_HALF_WIDTH - JUNCTION.wall, 0.02],
      ]),
      wallNorth: strip((d) => [
        [CARRIAGEWAY, -d],
        [UNDERPASS_HALF_WIDTH, -d],
        [UNDERPASS_HALF_WIDTH, 0],
        [UNDERPASS_HALF_WIDTH + JUNCTION.wall, 0.02],
      ]),
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const g of Object.values(geometries)) g.dispose();
    };
  }, [geometries]);

  /** Lane dashes down the underpass, on both carriageways. */
  const dashes = useMemo(() => {
    const out: { x: number; z: number; y: number }[] = [];
    for (let x = -JUNCTION.rampEnd + 4; x < JUNCTION.rampEnd; x += 9) {
      const y = -underpassDepth(x, 0) + 0.02;
      // Skip the dashes that would be hidden under the deck anyway.
      if (Math.abs(x) < deckHalf()) continue;
      for (const z of [-4.4, 4.4]) out.push({ x, z, y });
    }
    return out;
  }, []);

  return (
    <group position={anchor.position} rotation={[0, anchor.rot, 0]}>
      {/* ---------------- The cut ---------------- */}
      <mesh geometry={geometries.floor} receiveShadow>
        <meshLambertMaterial color={COLORS.asphalt} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometries.wallSouth} receiveShadow castShadow>
        <meshLambertMaterial color={COLORS.wall} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometries.wallNorth} receiveShadow castShadow>
        <meshLambertMaterial color={COLORS.wall} side={THREE.DoubleSide} />
      </mesh>

      {/* Median down the middle of the four lanes. Only along the flat run:
          past that the floor starts climbing and a straight kerb would
          bury itself in the ramp. */}
      <mesh position={[0, -UNDERPASS_DEPTH + 0.15, 0]}>
        <boxGeometry args={[JUNCTION.flatRun * 2, 0.3, 0.9]} />
        <meshLambertMaterial color={COLORS.kerb} />
      </mesh>

      {dashes.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.2, 0.14]} />
          <meshBasicMaterial color={COLORS.line} />
        </mesh>
      ))}

      <Deck />
      <Apron />
      <PortalSigns />
      <FootBridge />
      <TrafficPolice />
    </group>
  );
}

/** Half-width of the deck the highway crosses on, measured along the Ring Road. */
const deckHalf = () => pavementOuter() + 1.5;

/**
 * The deck: the slab the highway runs over, its soffit visible from inside
 * the underpass, and the parapet stopping anyone walking off the edge of it.
 */
function Deck() {
  const half = deckHalf();
  const trench = UNDERPASS_HALF_WIDTH + JUNCTION.wall;

  return (
    <group>
      {/* Structural slab. Its underside is the roof of the underpass, and
          its two ends are the portal headers the player sees from below. */}
      <mesh position={[0, -0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[half * 2, 1.5, trench * 2]} />
        <meshLambertMaterial color={COLORS.deck} />
      </mesh>

      {/* A darker band under the portal lip — the stain every underpass
          mouth has, and it stops the header reading as a clean white box. */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * (half + 0.02), -1.35, 0]}>
          <boxGeometry args={[0.06, 0.5, trench * 2]} />
          <meshLambertMaterial color={COLORS.wallStain} />
        </mesh>
      ))}

      {/* Parapet along both edges of the deck, across the highway */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[0, 0, side * trench]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <boxGeometry args={[half * 2, 0.7, 0.28]} />
            <meshLambertMaterial color={COLORS.kerb} />
          </mesh>
          {/* Red-and-white rail on top */}
          <mesh position={[0, 0.82, 0]}>
            <boxGeometry args={[half * 2, 0.12, 0.14]} />
            <meshLambertMaterial color={COLORS.rail} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * The at-grade junction itself: paving on both sides of the trench, and the
 * surface lanes that carry everything turning between the Ring Road and the
 * highway. Through traffic uses the underpass; this is for everyone else.
 */
function Apron() {
  const trench = UNDERPASS_HALF_WIDTH + JUNCTION.wall;
  const outer = JUNCTION.apronN;

  return (
    <group>
      {([-1, 1] as const).map((side) => (
        <group key={side}>
          {/* Paved quadrant, from the trench wall out to the shopfronts */}
          <mesh
            position={[0, 0.014, side * (trench + (outer - trench) / 2)]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[JUNCTION.apronT * 2, outer - trench]} />
            <meshLambertMaterial color={COLORS.apron} />
          </mesh>

          {/* Surface lane running parallel to the trench */}
          <mesh
            position={[0, 0.02, side * SERVICE_OFFSET]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[JUNCTION.apronT * 2, 7]} />
            <meshLambertMaterial color={COLORS.asphalt} />
          </mesh>

          {/* Kerb line between the surface lane and the trench coping */}
          <mesh position={[0, 0.1, side * (trench + 0.2)]}>
            <boxGeometry args={[JUNCTION.apronT * 2, 0.2, 0.3]} />
            <meshLambertMaterial color={COLORS.kerb} />
          </mesh>
        </group>
      ))}

      {/* Yellow box across the middle of the intersection, which everyone
          stops in anyway. */}
      {[-1, 1].map((side) =>
        [0, 1, 2].map((i) => (
          <mesh
            key={`${side}-${i}`}
            position={[
              0,
              0.03,
              side * (UNDERPASS_HALF_WIDTH + JUNCTION.wall + 6 + i * 3),
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[roadHalfWidth() * 2, 0.35]} />
            <meshBasicMaterial color="#d8c04a" />
          </mesh>
        ))
      )}
    </group>
  );
}

/**
 * Overhead direction signs on a gantry — the one thing that actually tells
 * the player what this junction is, since none of the lettering is spelled
 * out anywhere in this project.
 */
function PortalSigns() {
  const trench = UNDERPASS_HALF_WIDTH + JUNCTION.wall;

  return (
    <group>
      {/* Gantry over the highway, on the Thankot approach */}
      <group position={[0, 0, trench + 16]}>
        {([-1, 1] as const).map((side) => (
          <mesh
            key={side}
            position={[side * (roadHalfWidth() + 0.8), 3, 0]}
            castShadow
          >
            <boxGeometry args={[0.4, 6, 0.4]} />
            <meshLambertMaterial color="#a8a294" />
          </mesh>
        ))}
        <mesh position={[0, 6.1, 0]} castShadow>
          <boxGeometry args={[(roadHalfWidth() + 1) * 2, 0.4, 0.4]} />
          <meshLambertMaterial color="#a8a294" />
        </mesh>

        {/* Straight on for Kalimati, left and right for the Ring Road */}
        <mesh position={[0, 5.1, -0.06]} castShadow>
          <boxGeometry args={[4.2, 1.3, 0.1]} />
          <meshLambertMaterial color={COLORS.signGreen} />
        </mesh>
        {([-1, 1] as const).map((side) => (
          <mesh key={side} position={[side * 3.4, 5.1, -0.06]} castShadow>
            <boxGeometry args={[2.4, 1.3, 0.1]} />
            <meshLambertMaterial color={COLORS.signBlue} />
          </mesh>
        ))}
        {/* Lettering, suggested with bands so no font has to load */}
        {[-3.4, 0, 3.4].map((x) => (
          <mesh key={x} position={[x, 5.1, -0.12]}>
            <boxGeometry args={[x === 0 ? 3.0 : 1.7, 0.16, 0.02]} />
            <meshBasicMaterial color="#f0ead8" />
          </mesh>
        ))}
      </group>

      {/* Blue board over each underpass mouth, as at the real portals */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          position={[side * (deckHalf() + 0.2), -0.75, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <boxGeometry args={[6, 0.9, 0.12]} />
          <meshLambertMaterial color={COLORS.signBlue} />
        </mesh>
      ))}
    </group>
  );
}

/** The pedestrian overbridge — nobody uses it, and it is always there. */
function FootBridge() {
  const trench = UNDERPASS_HALF_WIDTH + JUNCTION.wall;
  const z = -(trench + 13);
  const span = roadHalfWidth() + 5;

  return (
    <group position={[0, 0, z]}>
      {/* Deck */}
      <mesh position={[0, 5.4, 0]} castShadow>
        <boxGeometry args={[span * 2, 0.22, 2.0]} />
        <meshLambertMaterial color="#8d8a82" />
      </mesh>
      {/* Side railings */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[0, 5.95, side * 0.95]}>
          <boxGeometry args={[span * 2, 1.0, 0.08]} />
          <meshLambertMaterial color="#6a6f74" />
        </mesh>
      ))}
      {/* Stair towers at each end */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * span, 0, 0]}>
          <mesh position={[0, 2.7, 0]} castShadow>
            <boxGeometry args={[2.0, 5.4, 2.0]} />
            <meshLambertMaterial color="#9c968a" />
          </mesh>
          {/* Flight of steps down to the pavement */}
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[0, 0.3 + i * 0.55, 1.1 + i * 0.34]} castShadow>
              <boxGeometry args={[1.8, 0.12, 0.34]} />
              <meshLambertMaterial color="#8e887c" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * Traffic police working the chowk.
 *
 * Around thirty officers are posted to Kalanki on a normal day, because
 * roughly 8,000 vehicles enter the valley through here. Three is enough to
 * make the point: one up on the podium in the middle directing, two more
 * out on the approaches.
 */
function TrafficPolice() {
  const trench = UNDERPASS_HALF_WIDTH + JUNCTION.wall;

  return (
    <group>
      {/* The podium in the middle of the junction */}
      <group position={[roadHalfWidth() + 2.6, 0, trench + 8]}>
        <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.95, 1.1, 0.4, 12]} />
          <meshLambertMaterial color="#d8d3c6" />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.98, 0.98, 0.06, 12]} />
          <meshLambertMaterial color="#1f5f8d" />
        </mesh>
        <group position={[0, 0.45, 0]} rotation={[0, -0.6, 0]}>
          <Policeman duty="direct" />
        </group>
      </group>

      {/* One on each approach, on the pavement */}
      <group position={[-(roadHalfWidth() + 1.8), 0, trench + 14]} rotation={[0, 0.9, 0]}>
        <Policeman duty="direct" phase={2.1} />
      </group>
      <group position={[roadHalfWidth() + 1.6, 0, -(trench + 10)]} rotation={[0, 2.6, 0]}>
        <Policeman duty="stand" />
      </group>
    </group>
  );
}
