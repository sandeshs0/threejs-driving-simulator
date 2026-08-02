import * as THREE from "three";
import { CONFIG } from "./config";
import { cityness, mountainness, stageAt } from "./journey";

/**
 * Landscape along the route.
 *
 * Not a random biome table any more — the land changes because of where
 * you are on the journey. Terraced green hillsides above the Trishuli,
 * drier pine as the road climbs to the rim, then the dust and haze of the
 * valley floor. Colours are sampled per chunk and interpolate continuously,
 * so there is never a seam between one landscape and the next.
 */

export type TreeKind = "pine" | "broadleaf" | "none";

export interface Biome {
  name: string;
  ground: string;
  shoulder: string;
  tree: TreeKind;
  trunk: string;
  foliage: string;
  rock: string;
  treeDensity: number;
  rockDensity: number;
  grassDensity: number;
}

/** Landscape keyframes, blended by the route signals. */
const TERRACED: Biome = {
  name: "terraced hills",
  ground: "#6d8f45",
  shoulder: "#9c8a68",
  tree: "broadleaf",
  trunk: "#5c4230",
  foliage: "#3f6f38",
  rock: "#8b8880",
  treeDensity: 1.1,
  rockDensity: 0.7,
  grassDensity: 1.3,
};

const PINE_RIDGE: Biome = {
  name: "pine ridge",
  ground: "#5c7748",
  shoulder: "#93836a",
  tree: "pine",
  trunk: "#553d2b",
  foliage: "#2f5a37",
  rock: "#83857c",
  treeDensity: 1.5,
  rockDensity: 1.3,
  grassDensity: 0.8,
};

const VALLEY: Biome = {
  name: "Kathmandu valley",
  ground: "#8d8873",
  shoulder: "#8a8371",
  tree: "broadleaf",
  trunk: "#5a4636",
  foliage: "#4b6b3f",
  rock: "#8f8c85",
  treeDensity: 0.25,
  rockDensity: 0.2,
  grassDensity: 0.3,
};

const mixHex = (a: string, b: string, t: number) =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/**
 * Resolve the landscape for a chunk from its position on the route.
 * Returns the dominant biome (props come from one biome so a tree type
 * never changes mid-chunk) plus continuously blended ground colours.
 */
export function biomeForChunk(index: number) {
  const s = (index + 0.5) * CONFIG.road.chunkLength;

  const urban = cityness(s);
  const high = mountainness(s);

  // Terraced farmland low down, pine as it climbs, valley floor at the end.
  const rugged = Math.max(0, high - 0.35) / 0.65;
  const land = urban > 0.5 ? VALLEY : rugged > 0.5 ? PINE_RIDGE : TERRACED;

  const hillMix = mixHex(TERRACED.ground, PINE_RIDGE.ground, rugged);
  const hillShoulder = mixHex(TERRACED.shoulder, PINE_RIDGE.shoulder, rugged);

  return {
    biome: land,
    stage: stageAt(s),
    groundColor: mixHex(hillMix, VALLEY.ground, urban),
    shoulderColor: mixHex(hillShoulder, VALLEY.shoulder, urban),
  };
}
