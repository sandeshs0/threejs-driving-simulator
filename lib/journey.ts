/**
 * The journey
 * ===========
 * The drive is no longer endless random road: it is the run from the
 * Dhading hills up the Prithvi Highway, through the Nagdhunga tunnel, and
 * down into Kathmandu.
 *
 *   0 m ──────── 1200 ── 1375 ────── 1700 ─────────────▶
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

/**
 * Master length of the drive.
 *
 * Every distance in this file is written at full scale — the real thing is
 * a good 25 km — and then multiplied by this, so the whole journey can be
 * made longer or shorter by changing one number. Nothing else in the
 * project hard-codes a route distance: `roadFeatures.ts` reads `ROUTE`, and
 * the maps, progress bar and place names all read `WAYPOINTS`.
 *
 * Heights are scaled by the same factor (see `PROFILE`). That is the point
 * of doing it this way rather than by hand: scaling both axes together
 * leaves every gradient exactly as it was, so a shorter drive does not
 * quietly become a climb the car cannot pull.
 */
export const ROUTE_SCALE = 0.5;

/** A route distance in scaled metres. */
const at = (metres: number) => Math.round(metres * ROUTE_SCALE);

export const ROUTE = {
  tunnelStart: at(2400),
  tunnelEnd: at(2750),
  descentEnd: at(3400),
  /** River crossings in the hill section. */
  bridges: [
    { from: at(820), to: at(940) },
    { from: at(1680), to: at(1800) },
  ],
};

export const PLACE_NAMES: Record<Stage, string> = {
  hills: "Dhading · Prithvi Highway",
  tunnel: "Nagdhunga Tunnel",
  descent: "Thankot · valley rim",
  city: "Kathmandu",
};

/** The checkpost on the Thankot side of the tunnel — everyone stops here. */
export const CHECKPOST_S = at(3040);

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
  { s: at(880), name: "Trishuli bridge", kind: "bridge" },
  { s: at(1740), name: "Mahesh Khola bridge", kind: "bridge" },
  { s: ROUTE.tunnelStart, name: "Nagdhunga · west portal", kind: "tunnel" },
  { s: ROUTE.tunnelEnd, name: "Nagdhunga · east portal", kind: "tunnel" },
  { s: CHECKPOST_S, name: "Thankot checkpost", kind: "checkpost" },
  { s: ROUTE.descentEnd, name: "Thankot bazaar", kind: "district" },
  { s: at(3900), name: "Kalanki chowk", kind: "district" },
  { s: at(4400), name: "Kalimati", kind: "district" },
  { s: at(4900), name: "Tripureshwor", kind: "district" },
  { s: at(5400), name: "Ratna Park", kind: "finish" },
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

/**
 * 0 in the hills, 1 once fully inside Kathmandu.
 *
 * The blend widths are scaled along with the route. They have to be: they
 * are what make the city thicken over a distance rather than switch on, and
 * left at full length on a half-length route they would overlap the tunnel
 * and start building Kathmandu inside the mountain.
 */
export function cityness(s: number): number {
  return ramp(s, ROUTE.descentEnd - at(500), ROUTE.descentEnd + at(260));
}

/** 1 in the high hills, falling away as the road drops into the valley. */
export function mountainness(s: number): number {
  const rise = ramp(s, 0, at(700)); // foothills build up out of the plain
  const fall = 1 - ramp(s, ROUTE.tunnelEnd, ROUTE.descentEnd + at(200));
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
  const throughTunnel = hump(
    s,
    ROUTE.tunnelStart - at(220),
    ROUTE.tunnelEnd + at(220)
  );
  return base * (1 - 0.78 * throughTunnel);
}

/**
 * Height of the route above its starting point.
 *
 * Control points, smoothly interpolated: the long climb out of the river
 * valleys, the crest inside the tunnel, then the drop to the valley floor.
 * Gradients are kept under about 8° — steep for a road, which is the
 * point, but still drivable.
 *
 * Heights run through the same `at()` as the distances, so shortening the
 * route does not steepen it. Halve the length and keep the 190 m climb and
 * the descent from the tunnel becomes a 22% grade the car cannot hold.
 */
const PROFILE: { s: number; y: number }[] = [
  { s: 0, y: 0 },
  { s: at(900), y: at(55) },
  { s: at(1800), y: at(120) },
  { s: ROUTE.tunnelStart, y: at(178) },
  { s: ROUTE.tunnelEnd, y: at(190) },
  { s: at(3100), y: at(150) },
  { s: ROUTE.descentEnd, y: at(118) },
  { s: at(4600), y: at(112) },
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
