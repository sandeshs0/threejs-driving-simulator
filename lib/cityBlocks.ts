import { pavementY, roadHalfWidth } from "./config";
import type { Building, CityLayout, Placed, Stall } from "./city";
import {
  SPACING,
  TILE,
  avenuesBetween,
  crossesBetween,
  type Street,
} from "./cityGrid";
import { GRID_START_S } from "./journey";
import { elevation } from "./road";
import { chunkSeed, mulberry32 } from "./rng";

/**
 * Blocks and frontages
 * ====================
 * What fills the street grid: buildings, shops, people and street lighting,
 * generated per render tile and deterministic from its coordinates.
 *
 * The approach is *frontages, not blocks*. Rather than working out the
 * polygon of each city block and filling it, each street lays a row of
 * buildings down both of its sides. That is how a city is actually built —
 * plots face the street they are on — and it means a block bounded by four
 * streets gets four frontages and a hollow middle, which is exactly right
 * for Kathmandu, where the middle of a block is courtyards and lanes rather
 * than more shopfront.
 *
 * Ownership is by line, not by area: a tile furnishes the streets whose
 * *centreline* falls inside it, along the tile's extent in the other axis.
 * Every street therefore belongs to exactly one tile in each direction, so
 * nothing is generated twice and no seam needs stitching.
 *
 * Orientation follows the same `rot` + `side` convention as the corridor
 * city, so every mesh in components/city renders these unchanged:
 *
 *   avenue  runs along z. rot = 0, outward is +x.
 *   cross   runs along x. rot = -π/2, outward is +z.
 */

/** Kept clear either side of a junction: corner setbacks and sightlines. */
const JUNCTION_CLEAR = 13;

/** Rotation for each family, matching `outwardVector` in city.ts. */
const AVENUE_ROT = 0;
const CROSS_ROT = -Math.PI / 2;

const FACADE_COLORS = [
  "#d9c9a8", "#c8b7a0", "#e0d3c1", "#b9c4b0", "#d6b7a4",
  "#cbb8c4", "#bfc9cf", "#d8c6b0", "#a9b5a4", "#e2d8c4",
];
const BRICK_COLORS = ["#8d4a33", "#96543a", "#7f4530", "#a35f42"];
const AWNING_COLORS = ["#2f6f5e", "#8d3a34", "#2f5f8d", "#a5762c", "#6a4a7c"];
const HOARDING_COLORS = ["#c9302c", "#1f6fb2", "#e0a92c", "#2f8f5e"];

const empty = (): CityLayout => ({
  buildings: [],
  stalls: [],
  landmarks: [],
  lamps: [],
  signals: [],
  carts: [],
  parkedBikes: [],
  bystanders: [],
  animals: [],
  wires: [],
  flagLines: [],
});

/**
 * Everything standing in one tile of the grid.
 *
 * `i` indexes world x, `j` indexes road distance s (so world z = -s).
 */
export function generateTile(i: number, j: number): CityLayout {
  const layout = empty();

  const x0 = i * TILE;
  const x1 = x0 + TILE;
  const s0 = j * TILE;
  const s1 = s0 + TILE;
  if (s1 <= GRID_START_S) return layout;

  const rng = mulberry32(chunkSeed(i * 7349 + j * 151 + 17));
  const y = elevation(s0); // the valley floor is level here by construction

  // Crossing streets a little beyond the tile too — a junction just outside
  // the edge still has to keep its corner clear inside it.
  const crossingCrosses = crossesBetween(s0 - SPACING, s1 + SPACING);
  const crossingAvenues = avenuesBetween(x0 - SPACING, x1 + SPACING);

  // ---- Frontages along every avenue this tile owns ----
  for (const av of avenuesBetween(x0, x1)) {
    // Junctions along an avenue are at the cross streets' z coordinates.
    const blockers = crossingCrosses.map((c) => ({
      at: c.coord,
      clear: JUNCTION_CLEAR + c.halfWidth,
    }));
    frontage(layout, rng, {
      street: av,
      rot: AVENUE_ROT,
      // Along an avenue we walk world z, which runs from -s1 to -s0.
      from: -s1,
      to: -s0,
      blockers,
      y,
      toWorld: (along, across) => [across, along],
    });
  }

  // ---- …and along every cross street ----
  for (const cr of crossesBetween(s0, s1)) {
    const blockers = crossingAvenues.map((a) => ({
      at: a.coord,
      clear: JUNCTION_CLEAR + a.halfWidth,
    }));
    frontage(layout, rng, {
      street: cr,
      rot: CROSS_ROT,
      from: x0,
      to: x1,
      blockers,
      y,
      toWorld: (along, across) => [along, across],
    });
  }

  // Overhead cable between consecutive lamps, as in the corridor city.
  for (let k = 0; k < layout.lamps.length - 1; k++) {
    const a = layout.lamps[k];
    const b = layout.lamps[k + 1];
    // Only string a span between poles that are actually near each other.
    if (Math.hypot(a.x - b.x, a.z - b.z) > 40) continue;
    layout.wires.push({
      from: [a.x, a.y + 6.4, a.z],
      to: [b.x, b.y + 6.4, b.z],
    });
  }

  return layout;
}

interface FrontageOptions {
  street: Street;
  rot: number;
  /** Range walked along the street, in whichever world axis it runs. */
  from: number;
  to: number;
  blockers: { at: number; clear: number }[];
  y: number;
  /**
   * Map (position along the street, position across it) to world (x, z).
   * The one place the two street families differ.
   */
  toWorld: (along: number, across: number) => [number, number];
}

/** True when a stretch of frontage would sit in a junction. */
const clearOfJunctions = (
  position: number,
  half: number,
  blockers: { at: number; clear: number }[]
) => blockers.every((b) => Math.abs(position - b.at) > b.clear + half);

/**
 * Lay one street's worth of buildings, shops and lamps down both sides.
 *
 * Plots are walked end to end with small irregular gaps, the same rhythm
 * the corridor city uses — it is what stops a street reading as a row of
 * identical boxes.
 */
function frontage(
  layout: CityLayout,
  rng: () => number,
  o: FrontageOptions
): void {
  const { street, rot, from, to, blockers, y, toWorld } = o;
  const kerb = street.halfWidth + 1.4;

  const put = (along: number, across: number, side: number): Placed => {
    const [x, z] = toWorld(along, street.coord + side * across);
    return { x, y, z, rot, side };
  };

  for (const side of [-1, 1]) {
    let along = from + rng() * 8;

    while (along < to) {
      const newari = rng() < 0.24;
      const width = newari ? 5 + rng() * 3.5 : 6 + rng() * 8;
      const gap = rng() < 0.2 ? 2.5 + rng() * 4 : 0.4 + rng() * 0.9;
      const centre = along + width / 2;

      if (clearOfJunctions(centre, width / 2, blockers)) {
        const depth = newari ? 6 + rng() * 3 : 7 + rng() * 6;
        // Lanes get lower buildings than the main roads, which is both true
        // and the thing that makes a Gali feel like a Gali from the car.
        const storeys = street.main
          ? 3 + Math.floor(rng() * 4)
          : 2 + Math.floor(rng() * 3);

        const base = put(centre, kerb + 1.2 + rng() * 1.2 + depth / 2, side);
        const building: Building = {
          ...base,
          width,
          depth,
          floors: storeys,
          height: storeys * (newari ? 2.75 : 3.05),
          color: newari
            ? BRICK_COLORS[Math.floor(rng() * BRICK_COLORS.length)]
            : FACADE_COLORS[Math.floor(rng() * FACADE_COLORS.length)],
          rebar: !newari && rng() < 0.45,
          tank: rng() < 0.7,
          style: newari ? "newari" : "concrete",
          hoarding: !newari && street.main && rng() < 0.3,
          hoardingColor:
            HOARDING_COLORS[Math.floor(rng() * HOARDING_COLORS.length)],
        };
        layout.buildings.push(building);

        // A shop out front, more often on a main road than in a lane.
        if (rng() < (street.main ? 0.34 : 0.16)) {
          const roll = rng();
          const stall: Stall = {
            ...put(centre + (rng() - 0.5) * width, kerb + 1.1, side),
            kind:
              roll < 0.32 ? "tea" : roll < 0.62 ? "momo" : roll < 0.82 ? "fruit" : "shop",
            awning: AWNING_COLORS[Math.floor(rng() * AWNING_COLORS.length)],
          };
          layout.stalls.push(stall);
        }

        // People outside it.
        const people = Math.floor(rng() * 2.6);
        for (let p = 0; p < people; p++) {
          layout.bystanders.push({
            ...put(
              centre + (rng() - 0.5) * width * 1.4,
              street.halfWidth + 0.9 + rng() * 1.6,
              side
            ),
            y: y + pavementY(),
            pose: rng() < 0.22 ? "squat" : "stand",
            outfit: Math.floor(rng() * 6),
            hat: rng() < 0.22,
            phase: rng() * Math.PI * 2,
          });
        }

        // Bikes parked nose-in, which is most of the kerb in most of the city.
        if (rng() < 0.34) {
          const rank = 1 + Math.floor(rng() * 3);
          for (let b = 0; b < rank; b++) {
            layout.parkedBikes.push({
              ...put(centre - width / 2 + b * 1.1, street.halfWidth + 1.5, side),
              y: y + pavementY(),
            });
          }
        }

        if (rng() < 0.08) {
          layout.carts.push({
            ...put(centre, street.halfWidth + 1.9, side),
            y: y + pavementY(),
          });
        }
        if (rng() < 0.05) {
          layout.animals.push({
            ...put(centre, street.halfWidth + 1.2, side),
            y: y + pavementY(),
            kind: rng() < 0.7 ? "dog" : "cow",
          });
        }
      }

      along += width + gap;
    }
  }

  // ---- Lighting and shrines, on the main roads only ----
  if (street.main) {
    let side = 1;
    for (let along = from + 12; along < to; along += 26) {
      if (!clearOfJunctions(along, 1, blockers)) continue;
      layout.lamps.push({
        ...put(along, street.halfWidth + 0.8, side),
        y: y + pavementY(),
      });
      side *= -1;
    }
  }

  // A chaitya on a corner, which in this city is a near certainty.
  const shrine = from + rng() * (to - from);
  if (rng() < 0.3 && clearOfJunctions(shrine, 2, blockers)) {
    layout.landmarks.push({
      ...put(shrine, street.halfWidth + 1.5, rng() < 0.5 ? -1 : 1),
      y: y + pavementY(),
      kind: "chaitya",
    });
  }

  // Signals at the main crossings.
  if (street.main) {
    for (const blocker of blockers) {
      if (blocker.at < from || blocker.at > to) continue;
      if (blocker.clear < JUNCTION_CLEAR + 5) continue; // minor crossing
      for (const side of [-1, 1]) {
        layout.signals.push({
          ...put(blocker.at - 9, street.halfWidth + 0.9, side),
          y: y + pavementY(),
        });
      }
    }
  }
}
