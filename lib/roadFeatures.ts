import { CONFIG } from "./config";
import { ROUTE, hump } from "./journey";

/**
 * Road features
 * =============
 * Bridges and tunnels. These are no longer scattered on a repeating
 * period — they are the fixed landmarks of the route: two river crossings
 * in the Dhading hills, and the Nagdhunga tunnel through the valley rim.
 *
 * Two kinds of query are needed and both live here:
 *
 *  - per chunk (`featureForChunk`) drives which structures get built
 *  - continuous in `s` (`ravineDepth`, `mountainMass`) feeds the terrain
 *    function, so the ground drops away under a bridge and rises into the
 *    mountain the tunnel is bored through
 *
 * This module depends only on config and the route, so `road.ts` can
 * import it without a cycle.
 */

export type FeatureKind = "open" | "tunnel" | "bridge";

export interface ChunkFeature {
  kind: FeatureKind;
  /** First / last chunk of a span — where portals and abutments go. */
  isStart: boolean;
  isEnd: boolean;
}

interface Span {
  from: number;
  to: number;
}

const TUNNEL: Span = { from: ROUTE.tunnelStart, to: ROUTE.tunnelEnd };

/** Does a chunk's distance range overlap this span at all? */
function overlaps(span: Span, sStart: number, sEnd: number) {
  return sStart < span.to && sEnd > span.from;
}

export function featureForChunk(index: number): ChunkFeature {
  const L = CONFIG.road.chunkLength;
  const sStart = index * L;
  const sEnd = sStart + L;

  const describe = (span: Span, kind: FeatureKind): ChunkFeature => ({
    kind,
    isStart: sStart <= span.from && sEnd > span.from,
    isEnd: sStart < span.to && sEnd >= span.to,
  });

  if (overlaps(TUNNEL, sStart, sEnd)) return describe(TUNNEL, "tunnel");

  for (const bridge of ROUTE.bridges) {
    if (overlaps(bridge, sStart, sEnd)) return describe(bridge, "bridge");
  }

  return { kind: "open", isStart: false, isEnd: false };
}

/** True when this chunk should keep props well clear of the road. */
export function suppressesScatter(kind: FeatureKind): boolean {
  return kind !== "open";
}

/**
 * The distance range a chunk's structure should actually be built over.
 *
 * Structures are clipped to the span rather than the chunk, so a bridge
 * starts and ends exactly at its abutments instead of at whichever chunk
 * boundary happens to be nearby.
 */
export function featureSpan(index: number): Span | null {
  const L = CONFIG.road.chunkLength;
  const sStart = index * L;
  const sEnd = sStart + L;

  const clip = (span: Span): Span => ({
    from: Math.max(span.from, sStart),
    to: Math.min(span.to, sEnd),
  });

  if (overlaps(TUNNEL, sStart, sEnd)) return clip(TUNNEL);
  for (const bridge of ROUTE.bridges) {
    if (overlaps(bridge, sStart, sEnd)) return clip(bridge);
  }
  return null;
}

/**
 * How far the ground drops below the road at distance s.
 *
 * Zero except under a bridge, where it opens into a gorge that meets road
 * level exactly at the abutments — so the deck always starts and ends at
 * grade.
 */
export function ravineDepth(s: number): number {
  let depth = 0;
  for (const bridge of ROUTE.bridges) {
    depth += hump(s, bridge.from, bridge.to) * CONFIG.features.ravineDepth;
  }
  return depth;
}

/**
 * The mountain the tunnel is driven through. Extends well past both
 * portals so the hillside wraps around the entrances instead of the bore
 * standing in open ground.
 */
export function mountainMass(s: number): number {
  const margin = CONFIG.features.tunnelHillMargin;
  return (
    hump(s, TUNNEL.from - margin, TUNNEL.to + margin) *
    CONFIG.features.tunnelHillHeight
  );
}


