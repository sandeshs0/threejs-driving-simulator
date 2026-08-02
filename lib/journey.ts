/**
 * The journey
 * ===========
 * The drive is no longer endless random road: it is the run from the
 * Dhading hills up the Prithvi Highway, through the Nagdhunga tunnel, and
 * down into Kathmandu.
 *
 *   0 m ──────── 2400 ── 2750 ────── 3400 ─────────────▶
 *     hill road    tunnel   descent      Kathmandu (forever)
 *
 * Everything that varies along the route — how twisty the road is, how
 * much it climbs, how mountainous the terrain, whether there is a city —
 * comes from the smooth 0→1 signals below rather than from `if (stage)`
 * branches. That keeps the transitions gradual: the hills flatten and the
 * buildings thicken over hundreds of metres, the way they actually do on
 * the way down from Thankot.
 *
 * Past the end of the script the city simply continues, so the world is
 * still infinite.
 */

export type Stage = "hills" | "tunnel" | "descent" | "city";

export const ROUTE = {
  tunnelStart: 2400,
  tunnelEnd: 2750,
  descentEnd: 3400,
  /** River crossings in the hill section. */
  bridges: [
    { from: 820, to: 940 },
    { from: 1680, to: 1800 },
  ],
};

export const PLACE_NAMES: Record<Stage, string> = {
  hills: "Dhading · Prithvi Highway",
  tunnel: "Nagdhunga Tunnel",
  descent: "Thankot · valley rim",
  city: "Kathmandu",
};

/** The checkpost on the Thankot side of the tunnel — everyone stops here. */
export const CHECKPOST_S = 3040;

/**
 * The route as a list of places, for the map and the progress bar.
 *
 * `s` is where the marker sits; the drive is "finished" at the last one,
 * which is only a milestone — the city keeps going after it.
 */
export interface Waypoint {
  s: number;
  name: string;
  kind: "start" | "bridge" | "tunnel" | "checkpost" | "district" | "finish";
}

export const WAYPOINTS: Waypoint[] = [
  { s: 0, name: "Dhading Besi", kind: "start" },
  { s: 880, name: "Trishuli bridge", kind: "bridge" },
  { s: 1740, name: "Mahesh Khola bridge", kind: "bridge" },
  { s: ROUTE.tunnelStart, name: "Nagdhunga · west portal", kind: "tunnel" },
  { s: ROUTE.tunnelEnd, name: "Nagdhunga · east portal", kind: "tunnel" },
  { s: CHECKPOST_S, name: "Thankot checkpost", kind: "checkpost" },
  { s: ROUTE.descentEnd, name: "Thankot bazaar", kind: "district" },
  { s: 3900, name: "Kalanki chowk", kind: "district" },
  { s: 4400, name: "Kalimati", kind: "district" },
  { s: 4900, name: "Tripureshwor", kind: "district" },
  { s: 5400, name: "Ratna Park", kind: "finish" },
];

/** Where the scripted journey is considered complete. */
export const ROUTE_END = WAYPOINTS[WAYPOINTS.length - 1].s;

/** 0 at the start, 1 on arrival in the centre of town. */
export function progressAt(s: number): number {
  return Math.max(0, Math.min(1, s / ROUTE_END));
}

/** The next place ahead, or null once the route has been completed. */
export function nextWaypoint(s: number): Waypoint | null {
  for (const w of WAYPOINTS) if (w.s > s + 5) return w;
  return null;
}

/**
 * Name for the "you are here" readout.
 *
 * Coarse stage names in the hills, where one name covers kilometres, then
 * district names once inside the ring road, which is how anyone in the
 * valley actually describes where they are.
 */
export function placeAt(s: number): string {
  const stage = stageAt(s);
  if (stage !== "city") return PLACE_NAMES[stage];

  let name = PLACE_NAMES.city;
  for (const w of WAYPOINTS) {
    if (w.s <= s && (w.kind === "district" || w.kind === "finish")) name = w.name;
  }
  return name === "Ratna Park" ? "Ratna Park · Kathmandu" : `${name} · Kathmandu`;
}

export const smoothstep = (t: number) => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/** Smooth 0 → 1 as s crosses from `a` to `b`. */
const ramp = (s: number, a: number, b: number) => smoothstep((s - a) / (b - a));

/** Smooth 0 → 1 → 0 hump across a range, zero at both ends. */
export function hump(s: number, from: number, to: number): number {
  if (s <= from || s >= to) return 0;
  return 0.5 - 0.5 * Math.cos(((s - from) / (to - from)) * Math.PI * 2);
}

export function stageAt(s: number): Stage {
  if (s < ROUTE.tunnelStart) return "hills";
  if (s < ROUTE.tunnelEnd) return "tunnel";
  if (s < ROUTE.descentEnd) return "descent";
  return "city";
}

/** 0 in the hills, 1 once fully inside Kathmandu. */
export function cityness(s: number): number {
  return ramp(s, ROUTE.descentEnd - 500, ROUTE.descentEnd + 260);
}

/** 1 in the high hills, falling away as the road drops into the valley. */
export function mountainness(s: number): number {
  const rise = ramp(s, 0, 700); // foothills build up out of the plain
  const fall = 1 - ramp(s, ROUTE.tunnelEnd, ROUTE.descentEnd + 200);
  return Math.min(rise, fall);
}

/**
 * How twisty the road is, 0→1.
 * Full switchbacks in the hills; nearly straight through the bore, where
 * a tight sweep would look wrong and crowd the arch; calm grid streets in
 * the city.
 */
export function swayScale(s: number): number {
  const base = 1 - 0.85 * cityness(s);
  const throughTunnel = hump(s, ROUTE.tunnelStart - 220, ROUTE.tunnelEnd + 220);
  return base * (1 - 0.78 * throughTunnel);
}

/**
 * Height of the route above its starting point.
 *
 * Control points, smoothly interpolated: the long climb out of the river
 * valleys, the crest inside the tunnel, then the drop to the valley floor.
 * Gradients are kept under about 8° — steep for a road, which is the
 * point, but still drivable.
 */
const PROFILE: { s: number; y: number }[] = [
  { s: 0, y: 0 },
  { s: 900, y: 55 },
  { s: 1800, y: 120 },
  { s: ROUTE.tunnelStart, y: 178 },
  { s: ROUTE.tunnelEnd, y: 190 },
  { s: 3100, y: 150 },
  { s: ROUTE.descentEnd, y: 118 },
  { s: 4600, y: 112 },
];

export function baseElevation(s: number): number {
  if (s <= PROFILE[0].s) return PROFILE[0].y;
  const last = PROFILE[PROFILE.length - 1];
  if (s >= last.s) return last.y;

  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = PROFILE[i];
    const b = PROFILE[i + 1];
    if (s <= b.s) {
      return a.y + (b.y - a.y) * smoothstep((s - a.s) / (b.s - a.s));
    }
  }
  return last.y;
}

/**
 * How strongly the hillsides are cut into farming terraces.
 * The signature of the mid-hills, and gone by the time you reach the city.
 */
export function terracing(s: number): number {
  return mountainness(s) * (1 - cityness(s));
}
