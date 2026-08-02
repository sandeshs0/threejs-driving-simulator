import { CONFIG, roadHalfWidth } from "./config";
import { cityness } from "./journey";
import { chunkSeed, mulberry32 } from "./rng";
import { elevation, roadPoint, roadYaw } from "./road";

/**
 * Kathmandu street layout.
 * ========================
 * Deterministic per chunk, generated in road space and converted to world
 * space, so buildings line the street correctly however the road bends.
 *
 * The look being aimed at is the ordinary Kathmandu street rather than the
 * postcard: narrow concrete buildings three to six storeys tall in faded
 * pastels, shuttered shops at ground level under sun-bleached awnings,
 * water tanks and unfinished rebar on the roofs, tangled overhead cable,
 * a tea shop or momo pasal every block, and a pagoda or stupa set back
 * from the road every so often.
 */

export interface Placed {
  x: number;
  y: number;
  z: number;
  rot: number;
  /** Which side of the road: -1 left, +1 right. Facades face -side. */
  side: number;
}

export interface Building extends Placed {
  width: number;
  depth: number;
  height: number;
  floors: number;
  color: string;
  /** Unfinished top floor with rebar columns — extremely common. */
  rebar: boolean;
  tank: boolean;
}

export interface Stall extends Placed {
  kind: "tea" | "momo" | "shop";
  awning: string;
}

export interface Landmark extends Placed {
  kind: "pagoda" | "stupa";
}

export interface CityLayout {
  buildings: Building[];
  stalls: Stall[];
  landmarks: Landmark[];
  lamps: Placed[];
  signals: Placed[];
  /** Overhead cable spans: pairs of pole tops to string a line between. */
  wires: { from: [number, number, number]; to: [number, number, number] }[];
}

/** Faded pastels and washed concrete — the real palette of the city. */
const FACADE_COLORS = [
  "#d9c9a8", "#c8b7a0", "#e0d3c1", "#b9c4b0", "#d6b7a4",
  "#cbb8c4", "#bfc9cf", "#d8c6b0", "#a9b5a4", "#e2d8c4",
];

const AWNING_COLORS = ["#2f6f5e", "#8d3a34", "#2f5f8d", "#a5762c", "#6a4a7c"];

/** Footpath edge — where the buildings start. */
const KERB = () => roadHalfWidth() + 1.2;

/**
 * Unit vector pointing away from the road centre (the +u direction) for a
 * given heading. Facades, awnings and signboards are offset along it, so
 * they face the street however the road is bending.
 */
export function outwardVector(rot: number): [number, number] {
  return [Math.cos(rot), -Math.sin(rot)];
}

/** Offset a placed item from its centre toward (or away from) the road. */
export function offsetFrom(
  item: Placed,
  distance: number
): [number, number, number] {
  const [ox, oz] = outwardVector(item.rot);
  return [item.x + ox * item.side * distance, item.y, item.z + oz * item.side * distance];
}

export function generateCity(index: number): CityLayout {
  const L = CONFIG.road.chunkLength;
  const sStart = index * L;
  const urban = cityness(sStart + L / 2);

  const layout: CityLayout = {
    buildings: [],
    stalls: [],
    landmarks: [],
    lamps: [],
    signals: [],
    wires: [],
  };
  if (urban < 0.05) return layout;

  const rng = mulberry32(chunkSeed(index * 31 + 5));
  const p = { x: 0, y: 0, z: 0 };

  const place = (u: number, s: number): Placed => {
    roadPoint(u, s, p);
    // Buildings stand on the street's own level, not the rolling terrain —
    // a city block is cut flat, and it stops shops floating on a slope.
    return {
      x: p.x,
      y: elevation(s),
      z: p.z,
      rot: roadYaw(s),
      side: Math.sign(u) || 1,
    };
  };


  // ---- Building frontages down both sides ----
  // Walk each side independently, laying plots end to end with small gaps,
  // which is what gives a street its irregular, unplanned rhythm.
  for (const side of [-1, 1]) {
    let s = sStart + rng() * 6;
    while (s < sStart + L) {
      const width = 6 + rng() * 8;
      const gap = rng() < 0.18 ? 2.5 + rng() * 4 : 0.4 + rng() * 0.9;

      // Density falls off at the edge of town.
      if (rng() < urban) {
        const depth = 7 + rng() * 6;
        const floors = 3 + Math.floor(rng() * 4);
        const setback = KERB() + 1.4 + rng() * 1.2;
        const base = place(side * (setback + depth / 2), s + width / 2);

        layout.buildings.push({
          ...base,
          width,
          depth,
          floors,
          height: floors * 3.05,
          color: FACADE_COLORS[Math.floor(rng() * FACADE_COLORS.length)],
          rebar: rng() < 0.45,
          tank: rng() < 0.7,
        });
      }
      s += width + gap;
    }
  }

  // ---- Roadside stalls: tea shops, momo pasals, general stores ----
  const stallCount = Math.round(urban * (1 + rng() * 2.5));
  for (let i = 0; i < stallCount; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const s = sStart + rng() * L;
    const kindRoll = rng();
    layout.stalls.push({
      ...place(side * (KERB() + 1.1), s),
      kind: kindRoll < 0.38 ? "tea" : kindRoll < 0.72 ? "momo" : "shop",
      awning: AWNING_COLORS[Math.floor(rng() * AWNING_COLORS.length)],
    });
  }

  // ---- Street lighting, every 24 m, alternating sides ----
  let lampSide = index % 2 === 0 ? -1 : 1;
  for (let s = sStart + 6; s < sStart + L; s += 24) {
    layout.lamps.push({ ...place(lampSide * (KERB() + 0.4), s) });
    lampSide *= -1;
  }

  // Overhead cable strung between consecutive poles — the tangle of wires
  // over every Kathmandu street.
  for (let i = 0; i < layout.lamps.length - 1; i++) {
    const a = layout.lamps[i];
    const b = layout.lamps[i + 1];
    layout.wires.push({
      from: [a.x, a.y + 6.4, a.z],
      to: [b.x, b.y + 6.4, b.z],
    });
  }

  // ---- A junction with signals roughly every fourth block ----
  if (urban > 0.6 && index % 4 === 0) {
    const s = sStart + L * 0.5;
    for (const side of [-1, 1]) {
      layout.signals.push({ ...place(side * (KERB() + 0.5), s) });
    }
  }

  // ---- Temples, set back from the street ----
  if (urban > 0.55 && index % 3 === 1) {
    const side = rng() < 0.5 ? -1 : 1;
    layout.landmarks.push({
      ...place(side * (KERB() + 16), sStart + L * (0.3 + rng() * 0.4)),
      kind: rng() < 0.6 ? "pagoda" : "stupa",
    });
  }

  return layout;
}
