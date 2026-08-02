import { KALANKI_S, ROUTE_SCALE, smoothstep } from "./journey";

/**
 * Kalanki chowk and its underpass
 * ===============================
 *
 * The real junction: the Tribhuvan Highway comes down from Thankot and
 * meets the Ring Road at Kalanki. Nepal's first underpass — 800 m, four
 * lanes, opened 2018 — carries the *Ring Road* beneath the intersection,
 * running Bafal to Khasibazar, which leaves the highway at grade on top.
 *
 * So the player does not drive through the underpass. They drive over it,
 * on the deck, and see the Ring Road drop away into the cut on both sides
 * before carrying on east to Kalimati. Getting that the right way round is
 * the whole point — an underpass the player drives *into* would be the
 * wrong junction entirely.
 *
 * Local frame
 * -----------
 * Everything here is expressed in coordinates centred on the junction:
 *
 *   `t`  along the Ring Road — which is the highway's own lateral axis, so
 *        `t` is just the lateral offset `u`. The cut runs a long way in t.
 *   `n`  along the highway, `s - KALANKI_S`. The cut is narrow in n: it is
 *        the width of the Ring Road carriageway.
 *
 * The depth function takes those two numbers and nothing else, which is
 * what keeps this module free of any dependency on `road.ts` — `road.ts`
 * already has `u` and `s` in hand when it calls in, and importing it back
 * would be a cycle.
 */

/** Depth of the cut where the Ring Road passes under the highway. */
export const UNDERPASS_DEPTH = 6.5;

/**
 * Half-width of the cut, measured along the highway. Four 3.5 m lanes plus
 * a median and margins.
 */
export const UNDERPASS_HALF_WIDTH = 9;

/** How far the cut stays at full depth either side of the highway. */
const FLAT_RUN = 22;

/**
 * Where the ramps reach the surface again.
 *
 * The real underpass is 800 m end to end. Scaled to this route that is 400,
 * but the terrain is only rendered 130 m either side of the road, so the
 * ramp is brought up inside that — otherwise the cut would be sliced off
 * mid-air at the edge of the world. The grade that results is about 7%,
 * which is what a real underpass ramp runs at anyway.
 */
const RAMP_END = Math.min(115, 400 * ROUTE_SCALE + 115);

/** Thickness of the retaining walls, over which the cut closes up. */
const WALL = 1.5;

/**
 * How far down the ground is cut at a point, given its position in the
 * junction's local frame. Zero everywhere except in the trench.
 *
 * Fed into `groundY`, exactly like `ravineDepth` under a bridge: the
 * terrain drops away and the highway's own surface stays where it is, so
 * the road becomes a deck over the cut without any special case in the
 * road geometry.
 */
export function underpassDepth(t: number, n: number): number {
  const at = Math.abs(t);
  const an = Math.abs(n);
  if (an > UNDERPASS_HALF_WIDTH + WALL || at > RAMP_END) return 0;

  // Across the cut: full depth between the walls, closing over their width.
  const across = 1 - smoothstep((an - UNDERPASS_HALF_WIDTH) / WALL);

  // Along the cut: deepest under the junction, ramping back up to grade.
  const along = 1 - smoothstep((at - FLAT_RUN) / (RAMP_END - FLAT_RUN));

  return UNDERPASS_DEPTH * across * along;
}

/** The same, from world-ish road coordinates. */
export const underpassDepthAt = (u: number, s: number) =>
  underpassDepth(u, s - KALANKI_S);

/**
 * True where the junction owns the ground, so the city generator and the
 * prop scatter leave it alone.
 *
 * Without this, shopfronts and lamp posts placed on the flat street level
 * end up hanging in the air over the open cut — they are positioned from
 * `elevation(s)`, which knows nothing about the trench.
 */
export function inJunction(s: number): boolean {
  return Math.abs(s - KALANKI_S) < UNDERPASS_HALF_WIDTH + WALL + 5;
}

/** Extent of the junction's paving, for the geometry and the minimap. */
export const JUNCTION = {
  s: KALANKI_S,
  rampEnd: RAMP_END,
  flatRun: FLAT_RUN,
  wall: WALL,
  /** How far the paved intersection reaches along the Ring Road. */
  apronT: 34,
  /** …and along the highway. */
  apronN: 30,
};
