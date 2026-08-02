import { CONFIG, roadHalfWidth } from "./config";
import { chunkSeed, mulberry32 } from "./rng";
import { groundY, roadPoint, roadYaw } from "./road";
import { biomeForChunk, type Biome } from "./biomes";
import { featureForChunk, suppressesScatter, type ChunkFeature } from "./roadFeatures";
import { cityness, type Stage } from "./journey";

/** One placed prop, in world space (chunks are not transformed). */
export interface ScatterItem {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
}

export interface ChunkScatter {
  biome: Biome;
  feature: ChunkFeature;
  stage: Stage;
  /** 0 in the hills, 1 in Kathmandu — drives city dressing. */
  urban: number;
  groundColor: string;
  shoulderColor: string;
  trees: ScatterItem[];
  rocks: ScatterItem[];
  grass: ScatterItem[];
  posts: ScatterItem[];
}

/**
 * Deterministically generate roadside props for one chunk.
 *
 * Props are placed in road space (lateral offset + distance) and then
 * converted to world space, which guarantees nothing ever lands on the
 * asphalt no matter how sharply the road bends. Height comes from the
 * shared terrain function so everything sits flush on the ground.
 */
export function generateScatter(index: number): ChunkScatter {
  const rng = mulberry32(chunkSeed(index));
  const e = CONFIG.environment;
  const L = CONFIG.road.chunkLength;
  const sStart = index * L;

  const { biome, stage, groundColor, shoulderColor } = biomeForChunk(index);
  const feature = featureForChunk(index);
  const urban = cityness(sStart + L / 2);
  const p = { x: 0, y: 0, z: 0 };

  // On a bridge or through a tunnel there is no verge to plant: props are
  // pushed well clear of the structure and thinned out. In the city the
  // roadside belongs to buildings and stalls, not forest.
  const built = suppressesScatter(feature.kind);
  const clearance = built ? 34 : e.minDistFromRoad;
  const thinning = (built ? 0.45 : 1) * (1 - 0.92 * urban);

  const place = (
    count: number,
    minScale: number,
    maxScale: number,
    minDist = clearance,
    maxDist = e.maxDistFromRoad
  ): ScatterItem[] => {
    const items: ScatterItem[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const u = side * (roadHalfWidth() + minDist + rng() * (maxDist - minDist));
        const s = sStart + rng() * L;
        roadPoint(u, s, p);
        items.push({
          x: p.x,
          y: groundY(p.x, p.z),
          z: p.z,
          scale: minScale + rng() * (maxScale - minScale),
          rotation: rng() * Math.PI * 2,
        });
      }
    }
    return items;
  };

  // Marker posts hug the shoulder at a regular spacing and face the road,
  // which gives a strong sense of speed and of the curve ahead. Bridges
  // and tunnels have their own parapets, so they get none.
  const posts: ScatterItem[] = [];
  const postSpacing = 20;
  for (let s = sStart; s < sStart + L && !built; s += postSpacing) {
    for (const side of [-1, 1]) {
      const u = side * (roadHalfWidth() + 0.6);
      roadPoint(u, s, p);
      posts.push({
        x: p.x,
        y: groundY(p.x, p.z),
        z: p.z,
        scale: 1,
        rotation: roadYaw(s),
      });
    }
  }

  const n = (base: number, density: number) =>
    Math.round(base * density * thinning);

  return {
    biome,
    feature,
    stage,
    urban,
    groundColor,
    shoulderColor,
    trees: place(n(e.treesPerSide, biome.treeDensity), 0.8, 1.7),
    rocks: place(n(e.rocksPerSide, biome.rockDensity), 0.5, 1.5),
    grass: place(n(e.grassPerSide, biome.grassDensity), 0.7, 1.9),
    posts,
  };
}
