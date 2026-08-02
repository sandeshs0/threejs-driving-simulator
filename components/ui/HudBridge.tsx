"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CONFIG } from "@/lib/config";
import { biomeForChunk } from "@/lib/biomes";
import { inGrid, locate } from "@/lib/cityGrid";
import { nextWaypoint, placeAt, progressAt } from "@/lib/journey";
import { sFromZ } from "@/lib/road";
import { useGame } from "@/stores/useGame";

/**
 * HudBridge
 * ---------
 * Lives inside the Canvas. Samples the transient vehicle state and the
 * frame rate, then pushes one small reactive update to the store a few
 * times per second so the DOM HUD renders without per-frame React churn.
 */
export function HudBridge() {
  const acc = useRef({ frames: 0, time: 0 });

  useFrame((_, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.time += dt;

    // Publish ~5×/second.
    if (a.time < 0.2) return;

    const fps = Math.round(a.frames / a.time);
    a.frames = 0;
    a.time = 0;

    const { vehicle, setHud } = useGame.getState();
    const s = sFromZ(vehicle.position.z);
    const chunk = Math.floor(s / CONFIG.road.chunkLength);
    const next = nextWaypoint(s);

    // Street-level position, once the world is a network you can get lost in.
    const where = inGrid(vehicle.position.z)
      ? locate(vehicle.position.x, vehicle.position.z)
      : null;

    setHud({
      speedKmh: Math.abs(vehicle.speed) * 3.6,
      fps,
      distanceKm: vehicle.distance / 1000,
      gear: vehicle.gear,
      biome: biomeForChunk(chunk).biome.name,
      place: placeAt(s),
      progress: progressAt(s),
      nextName: next ? next.name : "",
      nextDistanceM: next ? next.s - s : 0,
      damage: vehicle.damage,
      crashes: vehicle.crashes,
      wrongLane: vehicle.wrongLane,
      street: where ? where.street : "",
      junction: where && !where.atJunction ? where.junction : "",
      junctionDistance: where ? where.junctionDistance : 0,
    });
  });

  return null;
}
