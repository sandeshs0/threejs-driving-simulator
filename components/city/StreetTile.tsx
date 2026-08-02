"use client";

import { useMemo } from "react";
import { CONFIG } from "@/lib/config";
import { generateTile } from "@/lib/cityBlocks";
import {
  TILE,
  avenuesBetween,
  crossesBetween,
  type Street,
} from "@/lib/cityGrid";
import { GRID_START_S } from "@/lib/journey";
import { elevation } from "@/lib/road";
import { CityBuild } from "./CityChunk";

/**
 * StreetTile
 * ----------
 * One square of the city: its ground, the streets whose centrelines fall
 * inside it, and everything built along them.
 *
 * Tiles are flat planes rather than ribbons because past the handover the
 * valley floor is genuinely level — the elevation profile is given two
 * equal control points there precisely so this is true. Streets are quads
 * laid on that plane, which is only possible because the world is
 * axis-aligned in the city; the whole grid design rests on those two facts.
 *
 * Ownership matches `cityBlocks`: a tile draws the streets whose centreline
 * is inside it, spanning the tile's full extent in the other axis. So each
 * street is drawn once per tile it passes through and the pieces meet
 * exactly at the boundary.
 *
 * Coplanar surfaces are stacked in millimetres of Y — ground, avenue, cross
 * street, markings — which is also what makes junctions work for free: the
 * cross street simply paints over the avenue where they meet, and the
 * result reads as an intersection with no junction geometry at all.
 */

const COLORS = {
  ground: "#6d6a5f",
  asphalt: "#33353a",
  laneLine: "#d8d3c0",
  kerb: "#9c9789",
};

const KERB_HEIGHT = CONFIG.road.kerbHeight;
const FOOTPATH = 2.6;

export function StreetTile({ i, j }: { i: number; j: number }) {
  const x0 = i * TILE;
  const s0 = j * TILE;
  const s1 = s0 + TILE;

  const city = useMemo(() => generateTile(i, j), [i, j]);

  const streets = useMemo(() => {
    const avenues = avenuesBetween(x0, x0 + TILE);
    const crosses = crossesBetween(s0, s1);
    // Junctions inside this tile, needed to break the footpaths.
    const nearCrosses = crossesBetween(s0 - TILE, s1 + TILE);
    const nearAvenues = avenuesBetween(x0 - TILE, x0 + 2 * TILE);
    return { avenues, crosses, nearCrosses, nearAvenues };
  }, [x0, s0, s1]);

  const y = elevation(s0);
  const centre: [number, number, number] = [x0 + TILE / 2, y, -(s0 + TILE / 2)];

  if (s1 <= GRID_START_S) return null;

  return (
    <group>
      {/* Ground the blocks stand on */}
      <mesh position={centre} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[TILE, TILE]} />
        <meshLambertMaterial color={COLORS.ground} />
      </mesh>

      {/* Avenues: run along z, so they span the tile's whole s range */}
      {streets.avenues.map((av) => (
        <Carriageway
          key={`a${av.index}`}
          street={av}
          y={y + 0.02}
          centreAlong={-(s0 + TILE / 2)}
          length={TILE}
          horizontal={false}
          breaks={streets.nearCrosses.map((c) => ({
            at: c.coord,
            half: c.halfWidth + 0.4,
          }))}
        />
      ))}

      {/* Cross streets: run along x. Drawn a millimetre higher so they read
          as passing over the avenue at each junction rather than fighting
          it for the same plane. */}
      {streets.crosses.map((cr) => (
        <Carriageway
          key={`c${cr.index}`}
          street={cr}
          y={y + 0.03}
          centreAlong={x0 + TILE / 2}
          length={TILE}
          horizontal
          breaks={streets.nearAvenues.map((a) => ({
            at: a.coord,
            half: a.halfWidth + 0.4,
          }))}
        />
      ))}

      <CityBuild city={city} />
    </group>
  );
}

/**
 * One street's surface within a tile: the asphalt, a dashed centreline on
 * the main roads, and a raised footpath down each side.
 *
 * The footpath is the only part that cannot be a single quad — it has to
 * stop at every junction, or the kerb runs straight across the mouth of
 * each side street and the city becomes a set of walled corridors again.
 * `breaks` are the crossing streets, and the path is emitted in the gaps
 * between them.
 */
function Carriageway({
  street,
  y,
  centreAlong,
  length,
  horizontal,
  breaks,
}: {
  street: Street;
  y: number;
  /** Centre of this tile in the direction the street runs. */
  centreAlong: number;
  length: number;
  /** True when the street runs along world x. */
  horizontal: boolean;
  breaks: { at: number; half: number }[];
}) {
  /** Place something at (along the street, across it). */
  const put = (along: number, across: number): [number, number, number] =>
    horizontal ? [along, y, street.coord + across] : [street.coord + across, y, along];

  const from = centreAlong - length / 2;
  const to = centreAlong + length / 2;

  /** Runs of footpath between the junctions. */
  const spans = useMemo(() => {
    const gaps = breaks
      .filter((b) => b.at > from - 40 && b.at < to + 40)
      .sort((a, b) => a.at - b.at);

    const out: { start: number; end: number }[] = [];
    let cursor = from;
    for (const gap of gaps) {
      const start = gap.at - gap.half;
      const end = gap.at + gap.half;
      if (start > cursor) out.push({ start: cursor, end: Math.min(start, to) });
      cursor = Math.max(cursor, end);
    }
    if (cursor < to) out.push({ start: cursor, end: to });
    return out.filter((span) => span.end - span.start > 0.6);
  }, [breaks, from, to]);

  const dashes = useMemo(() => {
    if (!street.main) return [];
    const out: number[] = [];
    for (let a = from + 3; a < to; a += 7.5) {
      if (breaks.some((b) => Math.abs(a - b.at) < b.half + 2)) continue;
      out.push(a);
    }
    return out;
  }, [street.main, from, to, breaks]);

  return (
    <group>
      {/* Asphalt */}
      <mesh
        position={put(centreAlong, 0)}
        rotation={horizontal ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, Math.PI / 2]}
        receiveShadow
      >
        <planeGeometry args={[length, street.halfWidth * 2]} />
        <meshLambertMaterial color={COLORS.asphalt} />
      </mesh>

      {/* Dashed centreline, main roads only */}
      {dashes.map((a) => (
        <mesh
          key={a}
          position={put(a, 0)}
          rotation={horizontal ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, Math.PI / 2]}
        >
          <planeGeometry args={[3, 0.14]} />
          <meshBasicMaterial color={COLORS.laneLine} />
        </mesh>
      ))}

      {/* Footpaths, broken at every junction */}
      {[-1, 1].map((side) =>
        spans.map((span, k) => {
          const mid = (span.start + span.end) / 2;
          const run = span.end - span.start;
          const [px, , pz] = put(mid, side * (street.halfWidth + FOOTPATH / 2));
          return (
            <mesh
              key={`${side}-${k}`}
              position={[px, y + KERB_HEIGHT / 2, pz]}
              receiveShadow
              castShadow
            >
              <boxGeometry
                args={
                  horizontal
                    ? [run, KERB_HEIGHT, FOOTPATH]
                    : [FOOTPATH, KERB_HEIGHT, run]
                }
              />
              <meshLambertMaterial color={COLORS.kerb} />
            </mesh>
          );
        })
      )}
    </group>
  );
}
