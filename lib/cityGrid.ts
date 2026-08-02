import { driveHalfWidth } from "./config";
import { GRID_START_S } from "./journey";

export { GRID_START_S };

/**
 * The Kathmandu street network
 * ============================
 *
 * Up to Kalanki the world is a corridor: one curve, and the car is held on
 * it. That is the right model for a highway through the hills and the wrong
 * one for a city — you cannot explore a line. Past Kalanki the world
 * becomes a two-dimensional network instead, and this module is it.
 *
 * It is a *lattice, not a mesh*, in the same spirit as `road.ts`: the
 * streets are defined by arithmetic, so any question about them is answered
 * in constant time from a position, with no spatial index and nothing
 * baked. "Which street am I on", "am I on a street at all", "where is the
 * next junction" and "what should this tile draw" are all the same two
 * divisions.
 *
 * That is only possible because the valley floor is axis-aligned:
 * `swayScale` goes to exactly zero once `cityness` reaches 1, so the
 * highway is the line x = 0 running along -Z, and the grid can align to the
 * world axes. See the note in journey.ts.
 *
 * Geometry
 * --------
 *   avenues  run parallel to the highway — constant x, indexed by `k`.
 *            k = 0 *is* the highway, which is why it takes no jitter and
 *            inherits the corridor's own half-width: the handover from
 *            corridor clamp to grid containment then has no seam in it.
 *   crosses  run perpendicular — constant z, indexed by `m`.
 *
 * Both are offset by a small deterministic jitter so the city is not a
 * printed circuit board. The jitter is kept under half the spacing, which
 * is what keeps `Math.round(x / SPACING)` a valid nearest-line lookup.
 */

/** Distance between street centrelines. A Kathmandu block is small. */
export const SPACING = 60;

/** Side of one render tile. Two streets per axis per tile. */
export const TILE = 120;

/** How far the built-up grid reaches either side of the highway. */
export const AVENUE_LIMIT = 8;

/** The first cross street, held a block clear of the handover — see below. */
const FIRST_CROSS = Math.ceil(GRID_START_S / SPACING) + 1;

const HALF_MAIN = 6.0;
const HALF_MINOR = 3.6;

export type StreetKind = "avenue" | "cross";

export interface Street {
  kind: StreetKind;
  index: number;
  /** World x for an avenue, world z for a cross street. */
  coord: number;
  halfWidth: number;
  main: boolean;
  name: string;
}

/** Deterministic 0..1 from an integer. */
function hash(n: number, salt: number): number {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Offset applied to a street line, always under half the spacing. */
const jitter = (n: number, salt: number) => (hash(n, salt) - 0.5) * 20;

/**
 * Names.
 *
 * Real names only where the road is real — the highway, and the Ring Road
 * back at Kalanki. Everything else gets the ordinary Kathmandu pattern: a
 * `Marg` for a road you would give directions by, a numbered `Gali` for the
 * lanes between them, which is genuinely how the small streets are known.
 * Inventing real place names for a lattice that is not the real city would
 * make the map confidently wrong, which is worse than generic.
 */
const MARG_NAMES = [
  "Naya Bato", "Shanti", "Buddha", "Ganesh", "Bagmati", "Machhindra",
  "Saraswati", "Dharma", "Bhimsen", "Narayan", "Indra", "Tundikhel",
];

const margName = (n: number) =>
  `${MARG_NAMES[((n % MARG_NAMES.length) + MARG_NAMES.length) % MARG_NAMES.length]} Marg`;

function avenueName(k: number): string {
  if (k === 0) return "Tribhuvan Highway";
  return k % 3 === 0 ? margName(k * 5 + 3) : `Gali ${Math.abs(k)}`;
}

function crossName(m: number): string {
  return m % 3 === 0 ? margName(m) : `Gali ${(m % 20) + 1}`;
}

// ------------------------------------------------------------------ lines

export function avenue(k: number): Street | null {
  if (k < -AVENUE_LIMIT || k > AVENUE_LIMIT) return null;
  const main = k % 3 === 0;
  return {
    kind: "avenue",
    index: k,
    // The highway keeps its exact line and its exact width, so crossing
    // into the grid changes nothing about where the car is allowed to be.
    coord: k === 0 ? 0 : k * SPACING + jitter(k, 1),
    halfWidth: k === 0 ? driveHalfWidth() : main ? HALF_MAIN : HALF_MINOR,
    main: main,
    name: avenueName(k),
  };
}

export function cross(m: number): Street | null {
  if (m < FIRST_CROSS) return null;
  const main = m % 3 === 0;
  const s = m * SPACING + jitter(m, 2);
  return {
    kind: "cross",
    index: m,
    coord: -s,
    halfWidth: main ? HALF_MAIN : HALF_MINOR,
    main,
    name: crossName(m),
  };
}

/** Road distance of a cross street, which is what the map and HUD want. */
export const crossS = (street: Street) => -street.coord;

/** True once the world is a network rather than a corridor. */
export const inGrid = (z: number) => -z >= GRID_START_S;

// --------------------------------------------------------------- queries

/**
 * Nearest line of each family. Three candidates each, because the jitter
 * can put the true nearest one index either side of the rounded guess.
 */
export function nearestAvenue(x: number): Street | null {
  const k = Math.round(x / SPACING);
  let best: Street | null = null;
  let bestDistance = Infinity;
  for (let i = k - 1; i <= k + 1; i++) {
    const street = avenue(i);
    if (!street) continue;
    const d = Math.abs(x - street.coord);
    if (d < bestDistance) {
      bestDistance = d;
      best = street;
    }
  }
  return best;
}

export function nearestCross(z: number): Street | null {
  const m = Math.round(-z / SPACING);
  let best: Street | null = null;
  let bestDistance = Infinity;
  for (let i = m - 1; i <= m + 1; i++) {
    const street = cross(i);
    if (!street) continue;
    const d = Math.abs(z - street.coord);
    if (d < bestDistance) {
      bestDistance = d;
      best = street;
    }
  }
  return best;
}

/** Signed distance outside a street's edge. Negative means on it. */
const outside = (position: number, street: Street | null) =>
  street ? Math.abs(position - street.coord) - street.halfWidth : Infinity;

export interface Containment {
  x: number;
  z: number;
  /** True when the position had to be moved back onto the network. */
  corrected: boolean;
  /** How far it was pushed, for the scrape sound and speed loss. */
  push: number;
}

/**
 * Hold a position on the street network.
 *
 * The drivable area is the *union* of the two corridors, which is what
 * makes junctions work without any special case: at a crossing you are
 * inside both, on a straight you are inside one, and the intersection
 * square is simply where neither test fails. Off the network entirely, the
 * position is pushed back to the edge of whichever corridor is closer —
 * along one axis only, so sliding down a wall of buildings feels like
 * sliding along a kerb rather than being sucked to a centreline.
 */
export function contain(x: number, z: number, out: Containment): Containment {
  out.x = x;
  out.z = z;
  out.corrected = false;
  out.push = 0;

  const av = nearestAvenue(x);
  const cr = nearestCross(z);

  const outAvenue = outside(x, av);
  const outCross = outside(z, cr);

  // Inside either corridor: nothing to do.
  if (outAvenue <= 0 || outCross <= 0) return out;

  out.corrected = true;
  if (outAvenue < outCross && av) {
    out.x = av.coord + Math.sign(x - av.coord) * av.halfWidth;
    out.push = outAvenue;
  } else if (cr) {
    out.z = cr.coord + Math.sign(z - cr.coord) * cr.halfWidth;
    out.push = outCross;
  }
  return out;
}

/** True when the position is on paved street. */
export function onStreet(x: number, z: number): boolean {
  return outside(x, nearestAvenue(x)) <= 0 || outside(z, nearestCross(z)) <= 0;
}

export interface Location {
  /** The street you are travelling on. */
  street: string;
  /** The nearest crossing, and how far ahead or behind it is. */
  junction: string;
  junctionDistance: number;
  /** True when you are actually inside an intersection right now. */
  atJunction: boolean;
}

/**
 * "Where am I", in the terms a person would use: the street you are on and
 * the next one that crosses it.
 *
 * Which of the two is "the street you are on" is decided by which corridor
 * holds you more securely — deepest inside wins. On a straight that is
 * unambiguous; in a junction it flips to whichever you are more centred in,
 * which is the right answer while turning.
 */
export function locate(x: number, z: number): Location {
  const av = nearestAvenue(x);
  const cr = nearestCross(z);
  const outAvenue = outside(x, av);
  const outCross = outside(z, cr);

  const onAvenue = outAvenue <= outCross;
  const here = onAvenue ? av : cr;
  const crossing = onAvenue ? cr : av;

  return {
    street: here ? here.name : "off the map",
    junction: crossing ? crossing.name : "",
    junctionDistance: crossing
      ? Math.abs((onAvenue ? z : x) - crossing.coord)
      : Infinity,
    atJunction: outAvenue <= 0 && outCross <= 0,
  };
}

/**
 * The street a position is most securely on — the one you would say you
 * were driving down. Null only if the position is off the network entirely.
 */
export function currentStreet(x: number, z: number): Street | null {
  const av = nearestAvenue(x);
  const cr = nearestCross(z);
  return outside(x, av) <= outside(z, cr) ? av : cr;
}

/**
 * A street's own frame, so anything placed on one — a pedestrian, a parked
 * car, a lane marking — can be positioned the same way whichever direction
 * the street runs.
 *
 *   `along`   distance up the street (world z for an avenue, world x for a
 *             cross street; both increase the way the axis does)
 *   `across`  signed offset from its centreline
 */
export function streetPoint(
  street: Street,
  along: number,
  across: number
): [number, number] {
  return street.kind === "avenue"
    ? [street.coord + across, along]
    : [along, street.coord + across];
}

/** Inverse: where a world position sits along a street. */
export const alongOf = (street: Street, x: number, z: number) =>
  street.kind === "avenue" ? z : x;

/**
 * Heading of a street, in the vehicle's yaw convention — the value that
 * goes in a `Placed.rot`, matching `roadYaw` for the corridor.
 */
export const streetYaw = (street: Street) =>
  street.kind === "avenue" ? 0 : -Math.PI / 2;

/**
 * Yaw facing the direction `along` *increases* in, which is not the same
 * thing: an avenue's heading faces -Z while its `along` axis is +z, so
 * anything walking or driving up-street on one faces the other way. Getting
 * these two confused is a whole street of pedestrians moonwalking.
 */
export const alongYaw = (street: Street) =>
  street.kind === "avenue" ? Math.PI : -Math.PI / 2;

// --------------------------------------------------------------- ranges

/** Every avenue whose line falls in [x0, x1]. */
export function avenuesBetween(x0: number, x1: number): Street[] {
  const out: Street[] = [];
  const from = Math.floor(x0 / SPACING) - 1;
  const to = Math.ceil(x1 / SPACING) + 1;
  for (let k = from; k <= to; k++) {
    const street = avenue(k);
    if (street && street.coord >= x0 && street.coord < x1) out.push(street);
  }
  return out;
}

/** Every cross street whose line falls in road distances [s0, s1]. */
export function crossesBetween(s0: number, s1: number): Street[] {
  const out: Street[] = [];
  const from = Math.floor(s0 / SPACING) - 1;
  const to = Math.ceil(s1 / SPACING) + 1;
  for (let m = from; m <= to; m++) {
    const street = cross(m);
    if (!street) continue;
    const s = crossS(street);
    if (s >= s0 && s < s1) out.push(street);
  }
  return out;
}

/** Tile index a world coordinate falls in. */
export const tileOf = (v: number) => Math.floor(v / TILE);
