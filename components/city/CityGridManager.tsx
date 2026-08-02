"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { UPDATE_ORDER } from "@/lib/controls";
import { TILE, tileOf } from "@/lib/cityGrid";
import { GRID_START_S } from "@/lib/journey";
import { sFromZ } from "@/lib/road";
import { useGame } from "@/stores/useGame";
import { StreetTile } from "./StreetTile";

/**
 * CityGridManager
 * ---------------
 * Mounts a square of street tiles around the player and recycles them as
 * the player moves — the two-dimensional counterpart to RoadChunkManager,
 * which slides a one-dimensional window along the highway.
 *
 * The difference matters. A corridor only ever needs chunks ahead and
 * behind, so its window is a range; a city has to be explorable in any
 * direction, so the window is an area and the player can leave it by
 * driving sideways. Hence a radius rather than an ahead/behind pair.
 *
 * Tiles are keyed by their coordinates, so React keeps the ones that are
 * still in range mounted and only builds the new edge. State is set from a
 * useFrame, but only on the frames where the centre tile actually changes —
 * roughly once every 120 m — so this costs one render per tile crossing
 * rather than one per frame.
 */

/** Tiles kept either side of the player. 2 covers 600 m, past the fog. */
const RADIUS = 2;

export function CityGridManager() {
  const [tiles, setTiles] = useState<{ i: number; j: number }[]>([]);
  const centre = useRef({ i: NaN, j: NaN });

  useFrame(() => {
    const { position } = useGame.getState().vehicle;
    const s = sFromZ(position.z);

    // Nothing to build until the corridor hands over. Tear down what is
    // mounted if the player somehow reverses out of the city.
    if (s < GRID_START_S - TILE) {
      if (tiles.length > 0) {
        centre.current = { i: NaN, j: NaN };
        setTiles([]);
      }
      return;
    }

    const i = tileOf(position.x);
    const j = tileOf(s);
    if (i === centre.current.i && j === centre.current.j) return;
    centre.current = { i, j };

    const next: { i: number; j: number }[] = [];
    for (let di = -RADIUS; di <= RADIUS; di++) {
      for (let dj = -RADIUS; dj <= RADIUS; dj++) {
        const tile = { i: i + di, j: j + dj };
        if ((tile.j + 1) * TILE <= GRID_START_S) continue;
        next.push(tile);
      }
    }
    setTiles(next);
  }, UPDATE_ORDER.road);

  return (
    <group>
      {tiles.map((tile) => (
        <StreetTile key={`${tile.i}:${tile.j}`} i={tile.i} j={tile.j} />
      ))}
    </group>
  );
}
