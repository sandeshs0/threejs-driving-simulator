"use client";

import { useState } from "react";
import { useFrame } from "@react-three/fiber";
import { CONFIG } from "@/lib/config";
import { UPDATE_ORDER } from "@/lib/controls";
import { sFromZ } from "@/lib/road";
import { useGame } from "@/stores/useGame";
import { RoadChunk } from "./RoadChunk";

/**
 * RoadChunkManager
 * ----------------
 * Keeps a sliding window of road chunks alive around the player.
 *
 * Every frame it computes which chunk the car is on; only when that index
 * changes does it touch React state, so mounting/unmounting chunks is the
 * only render work — one state change per chunk length driven.
 *
 * React keys are the chunk indices, so crossing a boundary unmounts one
 * chunk at the back and mounts one at the front while everything between
 * is left untouched.
 */
export function RoadChunkManager() {
  const [centerIndex, setCenterIndex] = useState(0);

  useFrame(() => {
    const { position } = useGame.getState().vehicle;
    const idx = Math.floor(sFromZ(position.z) / CONFIG.road.chunkLength);
    if (idx !== centerIndex) setCenterIndex(idx);
  }, UPDATE_ORDER.road);

  const indices: number[] = [];
  for (
    let i = centerIndex - CONFIG.road.chunksBehind;
    i <= centerIndex + CONFIG.road.chunksAhead;
    i++
  ) {
    indices.push(i);
  }

  return (
    <>
      {indices.map((i) => (
        <RoadChunk key={i} index={i} />
      ))}
    </>
  );
}
