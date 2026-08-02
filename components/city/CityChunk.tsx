"use client";

import { useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";
import {
  alongVector,
  generateCity,
  outwardVector,
  type Building,
  type CityLayout,
} from "@/lib/city";
import { Temple } from "./Temple";
import { StallShop } from "./StallShop";
import { StreetFurniture } from "./StreetFurniture";
import { StreetLife } from "./StreetLife";

/**
 * CityChunk / CityBuild
 * ---------------------
 * The built environment for one piece of Kathmandu.
 *
 * `CityBuild` draws a `CityLayout` and knows nothing about where it came
 * from, which is what lets the corridor city and the street grid past
 * Kalanki share one renderer — they differ in how plots are laid out, not
 * in what a building looks like. `CityChunk` is the corridor's thin wrapper
 * around it.
 *
 * Buildings are instanced boxes with per-instance colour and scale, so a
 * whole street frontage costs a couple of draw calls. Window bands are a
 * second instanced pass — cheaper and more legible at speed than a
 * texture, and it keeps the low-poly language of the rest of the project.
 * Temples, stalls and street life are ordinary groups because there are
 * only a handful of each.
 *
 * Two building styles share those passes. The modern concrete block gets
 * dark glazing bands, a water tank and the rebar columns of a top floor
 * that will be finished eventually. The older Newari house gets narrow
 * carved-timber windows and an overhanging tiled roof instead — the two
 * standing shoulder to shoulder is what a Kathmandu street actually looks
 * like.
 *
 * Orientation
 * -----------
 * A building's `rot` is the *street's* heading, and the meshes are laid out
 * with their local X running along the frontage and local Z out of it. A
 * group turned by `rot` alone maps local X across the street instead, which
 * stands every facade side-on: window bands become thin slabs poking out of
 * the flank and awnings hang off the gable. The quarter turn in
 * `FACE` is what puts them right, and every pass below shares it so they
 * cannot drift apart.
 */
const FACE = Math.PI / 2;

export function CityChunk({ index }: { index: number }) {
  const city = useMemo(() => generateCity(index), [index]);
  return <CityBuild city={city} />;
}

export function CityBuild({ city }: { city: CityLayout }) {
  /**
   * Facade dressing: a window band per upper floor, plus a shop awning at
   * street level. Both are pushed out along the building's own outward
   * normal so they sit on the face that looks at the road.
   */
  const facades = useMemo(() => {
    type Piece = {
      pos: [number, number, number];
      rot: number;
      scale: [number, number, number];
    };
    const windows: Piece[] = [];
    const timberWindows: Piece[] = [];
    const awnings: Piece[] = [];
    const hoardings: (Piece & { color: string })[] = [];

    const faceOffset = (b: Building, distance: number) => {
      const [ox, oz] = outwardVector(b.rot);
      // -side moves from the building's centre toward the road.
      return [
        b.x - ox * b.side * distance,
        b.z - oz * b.side * distance,
      ] as const;
    };

    for (const b of city.buildings) {
      const storey = b.height / b.floors;
      const [wx, wz] = faceOffset(b, b.depth / 2 + 0.05);

      if (b.style === "newari") {
        // Narrow carved windows in pairs rather than one continuous band —
        // the brick between them is most of the facade.
        for (let floor = 1; floor < b.floors; floor++) {
          for (const offset of [-0.26, 0.26]) {
            const [ax, az] = alongVector(b.rot);
            timberWindows.push({
              pos: [
                wx + ax * b.width * offset,
                b.y + floor * storey + 1.2,
                wz + az * b.width * offset,
              ],
              rot: b.rot,
              scale: [b.width * 0.3, 1.1, 0.12],
            });
          }
        }
      } else {
        for (let floor = 1; floor < b.floors; floor++) {
          windows.push({
            pos: [wx, b.y + floor * storey + 1.5, wz],
            rot: b.rot,
            scale: [b.width * 0.78, 1.25, 0.1],
          });
        }
      }

      const [ax, az] = faceOffset(b, b.depth / 2 + 0.7);
      awnings.push({
        pos: [ax, b.y + 3.15, az],
        rot: b.rot,
        scale: [b.width * 0.9, 1, 1],
      });

      if (b.hoarding) {
        // Billboard standing on the parapet, right on the street edge.
        const [hx, hz] = faceOffset(b, b.depth / 2 - 0.2);
        hoardings.push({
          pos: [hx, b.y + b.height + 1.1, hz],
          rot: b.rot,
          scale: [b.width * 0.85, 2.0, 0.12],
          color: b.hoardingColor,
        });
      }
    }

    return { windows, timberWindows, awnings, hoardings };
  }, [city.buildings]);

  if (city.buildings.length === 0 && city.stalls.length === 0) return null;

  const withTank = city.buildings.filter((b) => b.tank);
  const withRebar = city.buildings.filter((b) => b.rebar);
  const newari = city.buildings.filter((b) => b.style === "newari");

  return (
    <group>
      {/* Building masses */}
      {city.buildings.length > 0 && (
        <Instances limit={city.buildings.length} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial />
          {city.buildings.map((b, i) => (
            <Instance
              key={i}
              position={[b.x, b.y + b.height / 2, b.z]}
              rotation={[0, b.rot + FACE, 0]}
              scale={[b.width, b.height, b.depth]}
              color={b.color}
            />
          ))}
        </Instances>
      )}

      {/* Window bands */}
      {facades.windows.length > 0 && (
        <Instances limit={facades.windows.length}>
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial color="#2b3138" />
          {facades.windows.map((w, i) => (
            <Instance key={i} position={w.pos} rotation={[0, w.rot + FACE, 0]} scale={w.scale} />
          ))}
        </Instances>
      )}

      {/* Carved timber windows of the older brick houses */}
      {facades.timberWindows.length > 0 && (
        <Instances limit={facades.timberWindows.length}>
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial color="#3a2617" />
          {facades.timberWindows.map((w, i) => (
            <Instance key={i} position={w.pos} rotation={[0, w.rot + FACE, 0]} scale={w.scale} />
          ))}
        </Instances>
      )}

      {/* Overhanging tiled roofs on those same houses — the one silhouette
          that separates old Kathmandu from the concrete around it. */}
      {newari.length > 0 && (
        <Instances limit={newari.length} castShadow>
          <boxGeometry args={[1, 0.22, 1]} />
          <meshLambertMaterial color="#7d3527" />
          {newari.map((b, i) => (
            <Instance
              key={i}
              position={[b.x, b.y + b.height + 0.11, b.z]}
              rotation={[0, b.rot + FACE, 0]}
              scale={[b.width + 1.1, 1, b.depth + 1.1]}
            />
          ))}
        </Instances>
      )}

      {/* Rooftop hoardings, all shouting over each other at the street */}
      {facades.hoardings.length > 0 && (
        <Instances limit={facades.hoardings.length} castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial />
          {facades.hoardings.map((h, i) => (
            <Instance
              key={i}
              position={h.pos}
              rotation={[0, h.rot + FACE, 0]}
              scale={h.scale}
              color={h.color}
            />
          ))}
        </Instances>
      )}

      {/* Shopfront awnings along the ground floor */}
      {facades.awnings.length > 0 && (
        <Instances limit={facades.awnings.length} castShadow>
          <boxGeometry args={[1, 0.07, 1.5]} />
          <meshLambertMaterial color="#7a5636" />
          {facades.awnings.map((a, i) => (
            <Instance key={i} position={a.pos} rotation={[0, a.rot + FACE, 0]} scale={a.scale} />
          ))}
        </Instances>
      )}

      {/* Rooftop water tanks. Offset along the building's own frontage
          rather than along world X — on a street running the other way
          that difference is the tank sitting out in mid-air. */}
      {withTank.length > 0 && (
        <Instances limit={withTank.length} castShadow>
          <cylinderGeometry args={[0.5, 0.5, 0.9, 8]} />
          <meshLambertMaterial color="#2f4f7a" />
          {withTank.map((b, i) => {
            const [ax, az] = alongVector(b.rot);
            return (
              <Instance
                key={i}
                position={[
                  b.x + ax * (b.width / 2 - 1.1),
                  b.y + b.height + 0.45,
                  b.z + az * (b.width / 2 - 1.1),
                ]}
                rotation={[0, b.rot + FACE, 0]}
              />
            );
          })}
        </Instances>
      )}

      {/* Unfinished rebar columns sprouting from flat roofs — the city's
          permanent state of being one storey from finished. One at each
          corner, found in the building's own frame. */}
      {withRebar.length > 0 && (
        <Instances limit={withRebar.length * 4}>
          <boxGeometry args={[0.06, 1.1, 0.06]} />
          <meshLambertMaterial color="#8a7a63" />
          {withRebar.flatMap((b, i) => {
            const [ax, az] = alongVector(b.rot);
            const [ox, oz] = outwardVector(b.rot);
            const along = b.width / 2 - 0.5;
            const across = b.depth / 2 - 0.5;
            return [-1, 1].flatMap((sa) =>
              [-1, 1].map((so) => (
                <Instance
                  key={`${i}-${sa}-${so}`}
                  position={[
                    b.x + ax * sa * along + ox * so * across,
                    b.y + b.height + 0.55,
                    b.z + az * sa * along + oz * so * across,
                  ]}
                  rotation={[0, b.rot + FACE, 0]}
                />
              ))
            );
          })}
        </Instances>
      )}

      {city.stalls.map((stall, i) => (
        <StallShop key={i} stall={stall} />
      ))}
      {city.landmarks.map((mark, i) => (
        <Temple key={i} mark={mark} />
      ))}

      <StreetFurniture city={city} />
      <StreetLife city={city} />
    </group>
  );
}
