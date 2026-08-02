"use client";

import { Instance, Instances } from "@react-three/drei";
import type { ChunkScatter, ScatterItem } from "@/lib/scatter";

/**
 * ChunkScenery
 * ------------
 * Roadside props for one chunk, drawn with instancing so each prop type
 * costs a single draw call per chunk.
 *
 * The tree model swaps with the biome (broadleaf, pine, cactus, or none),
 * and placement/height come from the shared road + terrain functions, so
 * props sit flush on the ground and never land on the asphalt.
 */
export function ChunkScenery({ scatter }: { scatter: ChunkScatter }) {
  const { biome, trees, rocks, grass, posts } = scatter;

  return (
    <group>
      {biome.tree === "broadleaf" && <BroadleafTrees items={trees} biome={biome} />}
      {biome.tree === "pine" && <PineTrees items={trees} biome={biome} />}

      {/* Rocks */}
      {rocks.length > 0 && (
        <Instances limit={rocks.length} castShadow receiveShadow>
          <icosahedronGeometry args={[0.4, 0]} />
          <meshLambertMaterial color={biome.rock} flatShading />
          {rocks.map((r, i) => (
            <Instance
              key={i}
              position={[r.x, r.y + 0.18 * r.scale, r.z]}
              scale={[r.scale, r.scale * 0.72, r.scale * 0.9]}
              rotation={[0, r.rotation, 0.12]}
            />
          ))}
        </Instances>
      )}

      {/* Low shrubs / grass tufts */}
      {grass.length > 0 && (
        <Instances limit={grass.length}>
          <coneGeometry args={[0.42, 0.55, 5]} />
          <meshLambertMaterial color={biome.foliage} flatShading />
          {grass.map((g, i) => (
            <Instance
              key={i}
              position={[g.x, g.y + 0.2 * g.scale, g.z]}
              scale={[g.scale, g.scale * 0.7, g.scale]}
              rotation={[0, g.rotation, 0]}
            />
          ))}
        </Instances>
      )}

      {/* Roadside marker posts — strong speed and curve cues */}
      <Instances limit={posts.length} castShadow>
        <boxGeometry args={[0.09, 1.05, 0.09]} />
        <meshLambertMaterial color="#e6e3da" />
        {posts.map((p, i) => (
          <Instance
            key={i}
            position={[p.x, p.y + 0.52, p.z]}
            rotation={[0, p.rotation, 0]}
          />
        ))}
      </Instances>
      {/* Reflector band near the top of each post */}
      <Instances limit={posts.length}>
        <boxGeometry args={[0.1, 0.16, 0.1]} />
        <meshBasicMaterial color="#d8452f" />
        {posts.map((p, i) => (
          <Instance
            key={i}
            position={[p.x, p.y + 0.86, p.z]}
            rotation={[0, p.rotation, 0]}
          />
        ))}
      </Instances>
    </group>
  );
}

type TreeProps = { items: ScatterItem[]; biome: ChunkScatter["biome"] };

/** Broadleaf: trunk + a chunky low-poly canopy. */
function BroadleafTrees({ items, biome }: TreeProps) {
  if (items.length === 0) return null;
  return (
    <group>
      <Instances limit={items.length} castShadow>
        <cylinderGeometry args={[0.15, 0.22, 1.6, 6]} />
        <meshLambertMaterial color={biome.trunk} />
        {items.map((t, i) => (
          <Instance key={i} position={[t.x, t.y + 0.8 * t.scale, t.z]} scale={t.scale} />
        ))}
      </Instances>
      <Instances limit={items.length} castShadow>
        <dodecahedronGeometry args={[1.25, 0]} />
        <meshLambertMaterial color={biome.foliage} flatShading />
        {items.map((t, i) => (
          <Instance
            key={i}
            position={[t.x, t.y + 2.35 * t.scale, t.z]}
            scale={[t.scale, t.scale * 0.85, t.scale]}
            rotation={[0, t.rotation, 0]}
          />
        ))}
      </Instances>
    </group>
  );
}

/** Conifer: trunk + two stacked cones. */
function PineTrees({ items, biome }: TreeProps) {
  if (items.length === 0) return null;
  return (
    <group>
      <Instances limit={items.length} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 1.4, 6]} />
        <meshLambertMaterial color={biome.trunk} />
        {items.map((t, i) => (
          <Instance key={i} position={[t.x, t.y + 0.7 * t.scale, t.z]} scale={t.scale} />
        ))}
      </Instances>
      <Instances limit={items.length} castShadow>
        <coneGeometry args={[1.25, 2.4, 7]} />
        <meshLambertMaterial color={biome.foliage} flatShading />
        {items.map((t, i) => (
          <Instance
            key={i}
            position={[t.x, t.y + 2.1 * t.scale, t.z]}
            scale={t.scale}
            rotation={[0, t.rotation, 0]}
          />
        ))}
      </Instances>
      <Instances limit={items.length} castShadow>
        <coneGeometry args={[0.85, 2.0, 7]} />
        <meshLambertMaterial color={biome.foliage} flatShading />
        {items.map((t, i) => (
          <Instance
            key={i}
            position={[t.x, t.y + 3.5 * t.scale, t.z]}
            scale={t.scale}
            rotation={[0, t.rotation, 0]}
          />
        ))}
      </Instances>
    </group>
  );
}
