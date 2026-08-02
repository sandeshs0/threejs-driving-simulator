import { CONFIG, pavementOuter, pavementY, roadHalfWidth } from "./config";
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
 * pastels, older Newari brick houses with carved timber windows wedged
 * between them, shuttered shops at ground level under sun-bleached awnings,
 * water tanks and unfinished rebar on the roofs, tangled overhead cable and
 * prayer flags strung across the street, a tea shop or momo pasal every
 * block, fruit carts and parked bikes crowding the kerb, people standing
 * about on the footpath, a cow that has decided to sit down, and a pagoda,
 * stupa or roadside chaitya every so often.
 *
 * Everything here is *placement only* — positions, sizes, colours. The
 * meshes live in components/city, so the layout can be reasoned about (and
 * drawn on the minimap) without touching Three.
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
  /**
   * `concrete` is the modern pastel block; `newari` is the older brick
   * house, lower, red, with carved dark timber windows and a tiled roof.
   */
  style: "concrete" | "newari";
  /** Rooftop billboard facing the street. */
  hoarding: boolean;
  hoardingColor: string;
}

export interface Stall extends Placed {
  kind: "tea" | "momo" | "shop" | "fruit";
  awning: string;
}

export interface Landmark extends Placed {
  kind: "pagoda" | "stupa" | "chaitya";
}

/** Somebody standing, squatting or sitting on the footpath. */
export interface Bystander extends Placed {
  pose: "stand" | "squat";
  /** Index into the clothing palettes in components/city/Person. */
  outfit: number;
  hat: boolean;
  /** Small phase offset so a group of people is not one rigid formation. */
  phase: number;
}

export interface Animal extends Placed {
  kind: "cow" | "dog";
}

export interface CityLayout {
  buildings: Building[];
  stalls: Stall[];
  landmarks: Landmark[];
  lamps: Placed[];
  signals: Placed[];
  /** Fruit and vegetable carts pulled up against the kerb. */
  carts: Placed[];
  /** Motorbikes parked nose-in to the footpath, as they are everywhere. */
  parkedBikes: Placed[];
  bystanders: Bystander[];
  animals: Animal[];
  /** Overhead cable spans: pairs of pole tops to string a line between. */
  wires: { from: [number, number, number]; to: [number, number, number] }[];
  /** Prayer flags strung right across the street, pole to pole. */
  flagLines: { from: [number, number, number]; to: [number, number, number] }[];
}

/** Faded pastels and washed concrete — the real palette of the city. */
const FACADE_COLORS = [
  "#d9c9a8", "#c8b7a0", "#e0d3c1", "#b9c4b0", "#d6b7a4",
  "#cbb8c4", "#bfc9cf", "#d8c6b0", "#a9b5a4", "#e2d8c4",
];

/** Old Kathmandu brick, in the range you actually see it. */
const BRICK_COLORS = ["#8d4a33", "#96543a", "#7f4530", "#a35f42"];

const AWNING_COLORS = ["#2f6f5e", "#8d3a34", "#2f5f8d", "#a5762c", "#6a4a7c"];

/** Hoardings are all for the same four things, in the same four colours. */
const HOARDING_COLORS = ["#c9302c", "#1f6fb2", "#e0a92c", "#2f8f5e"];

/** Footpath edge — where the buildings start. */
const KERB = () => pavementOuter();

/** Where someone stands: on the pavement, clear of the kerb face. */
const WALK_LINE = () => roadHalfWidth() + 1.6;

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
    carts: [],
    parkedBikes: [],
    bystanders: [],
    animals: [],
    wires: [],
    flagLines: [],
  };
  if (urban < 0.05) return layout;

  const rng = mulberry32(chunkSeed(index * 31 + 5));
  const p = { x: 0, y: 0, z: 0 };

  const place = (u: number, s: number, lift = 0): Placed => {
    roadPoint(u, s, p);
    // Buildings stand on the street's own level, not the rolling terrain —
    // a city block is cut flat, and it stops shops floating on a slope.
    return {
      x: p.x,
      y: elevation(s) + lift,
      z: p.z,
      rot: roadYaw(s),
      side: Math.sign(u) || 1,
    };
  };

  /** Anything that stands on the pavement rather than in the road. */
  const onPavement = (u: number, s: number) => place(u, s, pavementY());

  // ---- Building frontages down both sides ----
  // Walk each side independently, laying plots end to end with small gaps,
  // which is what gives a street its irregular, unplanned rhythm.
  for (const side of [-1, 1]) {
    let s = sStart + rng() * 6;
    while (s < sStart + L) {
      // Newari houses are narrower and older; they survive in gaps between
      // the concrete, which is why they are the shorter plots here.
      const newari = rng() < 0.26;
      const width = newari ? 5 + rng() * 3.5 : 6 + rng() * 8;
      const gap = rng() < 0.18 ? 2.5 + rng() * 4 : 0.4 + rng() * 0.9;

      // Density falls off at the edge of town.
      if (rng() < urban) {
        const depth = newari ? 6 + rng() * 3 : 7 + rng() * 6;
        const floors = newari ? 3 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 4);
        const setback = KERB() + 1.4 + rng() * 1.2;
        const base = place(side * (setback + depth / 2), s + width / 2);
        const hoarding = !newari && rng() < 0.3;

        layout.buildings.push({
          ...base,
          width,
          depth,
          floors,
          height: floors * (newari ? 2.75 : 3.05),
          color: newari
            ? BRICK_COLORS[Math.floor(rng() * BRICK_COLORS.length)]
            : FACADE_COLORS[Math.floor(rng() * FACADE_COLORS.length)],
          rebar: !newari && rng() < 0.45,
          tank: rng() < 0.7,
          style: newari ? "newari" : "concrete",
          hoarding,
          hoardingColor:
            HOARDING_COLORS[Math.floor(rng() * HOARDING_COLORS.length)],
        });
      }
      s += width + gap;
    }
  }

  // ---- Roadside stalls: tea shops, momo pasals, fruit and general stores ----
  const stallCount = Math.round(urban * (2 + rng() * 3));
  for (let i = 0; i < stallCount; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const s = sStart + rng() * L;
    const kindRoll = rng();
    layout.stalls.push({
      ...place(side * (KERB() + 1.1), s),
      kind:
        kindRoll < 0.32
          ? "tea"
          : kindRoll < 0.62
          ? "momo"
          : kindRoll < 0.82
          ? "fruit"
          : "shop",
      awning: AWNING_COLORS[Math.floor(rng() * AWNING_COLORS.length)],
    });
  }

  // ---- Carts and parked bikes crowding the kerb ----
  const cartCount = Math.round(urban * rng() * 2.5);
  for (let i = 0; i < cartCount; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    layout.carts.push(onPavement(side * (KERB() - 1.6), sStart + rng() * L));
  }

  // Bikes park in a rank, nose to the kerb, so they come in short runs
  // rather than scattered singly.
  if (urban > 0.4 && rng() < 0.75) {
    const side = rng() < 0.5 ? -1 : 1;
    const start = sStart + rng() * (L - 8);
    const count = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      layout.parkedBikes.push(
        onPavement(side * (KERB() - 2.1), start + i * 1.0)
      );
    }
  }

  // ---- People ----
  // Clustered rather than evenly spread: a knot outside a shop, a couple
  // waiting to cross, someone squatting by a cart.
  const groups = Math.round(urban * (1 + rng() * 2.5));
  for (let g = 0; g < groups; g++) {
    const side = rng() < 0.5 ? -1 : 1;
    const s = sStart + rng() * L;
    const size = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < size; i++) {
      const spread = (rng() - 0.5) * 3;
      layout.bystanders.push({
        ...onPavement(side * (WALK_LINE() + rng() * 1.9), s + spread),
        pose: rng() < 0.22 ? "squat" : "stand",
        outfit: Math.floor(rng() * 6),
        hat: rng() < 0.22,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  // ---- Animals ----
  // A dog asleep on the pavement is a certainty; a cow standing in the road
  // is close enough to one, and it is the only obstacle nobody will honk at.
  if (rng() < urban * 0.5) {
    layout.animals.push({
      ...onPavement((rng() < 0.5 ? -1 : 1) * (KERB() - 1.2), sStart + rng() * L),
      kind: "dog",
    });
  }
  if (rng() < urban * 0.22) {
    const side = rng() < 0.5 ? -1 : 1;
    layout.animals.push({
      ...place(side * (roadHalfWidth() - 0.6), sStart + rng() * L),
      kind: "cow",
    });
  }

  // ---- Street lighting, every 24 m, alternating sides ----
  let lampSide = index % 2 === 0 ? -1 : 1;
  for (let s = sStart + 6; s < sStart + L; s += 24) {
    layout.lamps.push({ ...onPavement(lampSide * (KERB() - 0.6), s) });
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

  // Prayer flags across the street, above the wires. Not on every block —
  // they go up for a festival and stay until the weather takes them down.
  if (urban > 0.5 && rng() < 0.45) {
    const s = sStart + 10 + rng() * (L - 20);
    const a = onPavement(-(KERB() - 0.6), s);
    const b = onPavement(KERB() - 0.6, s + 2 + rng() * 4);
    layout.flagLines.push({
      from: [a.x, a.y + 7.2, a.z],
      to: [b.x, b.y + 7.2, b.z],
    });
  }

  // ---- A junction with signals roughly every fourth block ----
  if (urban > 0.6 && index % 4 === 0) {
    const s = sStart + L * 0.5;
    for (const side of [-1, 1]) {
      layout.signals.push({ ...onPavement(side * (KERB() - 0.5), s) });
    }
  }

  // ---- Temples ----
  // The big ones are set well back from the street; a chaitya is a shrine
  // small enough to sit on the pavement, and there is one on every corner.
  if (urban > 0.55 && index % 3 === 1) {
    const side = rng() < 0.5 ? -1 : 1;
    layout.landmarks.push({
      ...place(side * (KERB() + 16), sStart + L * (0.3 + rng() * 0.4)),
      kind: rng() < 0.6 ? "pagoda" : "stupa",
    });
  }
  if (urban > 0.4 && rng() < 0.4) {
    const side = rng() < 0.5 ? -1 : 1;
    layout.landmarks.push({
      ...onPavement(side * (KERB() - 1.3), sStart + rng() * L),
      kind: "chaitya",
    });
  }

  return layout;
}
