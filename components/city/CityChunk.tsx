"use client";

import { useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";
import { generateCity, outwardVector, type Building } from "@/lib/city";
import { Temple } from "./Temple";
import { StallShop } from "./StallShop";
import { StreetFurniture } from "./StreetFurniture";

/**
 * CityChunk
 * ---------
 * The built environment for one chunk of Kathmandu.
 *
 * Buildings are instanced boxes with per-instance colour and scale, so a
 * whole street frontage costs a couple of draw calls. Window bands are a
 * second instanced pass — cheaper and more legible at speed than a
 * texture, and it keeps the low-poly language of the rest of the project.
 * Temples and stalls are ordinary groups because there are only a handful.
 */
export function CityChunk({ index }: { index: number }) {
  const city = useMemo(() => generateCity(index), [index]);

  /**
   * Facade dressing: a window band per upper floor, plus a shop awning at
   * street level. Both are pushed out along the building's own outward
   * normal so they sit on the face that looks at the road.
   */
  const facades = useMemo(() => {
    const windows: {
      pos: [number, number, number];
      rot: number;
      scale: [number, number, number];
    }[] = [];
    const awnings: {
      pos: [number, number, number];
      rot: number;
      scale: [number, number, number];
    }[] = [];

    const faceOffset = (b: Building, distance: number) => {
      const [ox, oz] = outwardVector(b.rot);
      // -side moves from the building's centre toward the road.
      return [
        b.x - ox * b.side * distance,
        b.z - oz * b.side * distance,
      ] as const;
    };

    for (const b of city.buildings) {
      const [wx, wz] = faceOffset(b, b.depth / 2 + 0.05);
      for (let floor = 1; floor < b.floors; floor++) {
        windows.push({
          pos: [wx, b.y + floor * 3.05 + 1.5, wz],
          rot: b.rot,
          scale: [b.width * 0.78, 1.25, 0.1],
        });
      }

      const [ax, az] = faceOffset(b, b.depth / 2 + 0.7);
      awnings.push({
        pos: [ax, b.y + 3.15, az],
        rot: b.rot,
        scale: [b.width * 0.9, 1, 1],
      });
    }

    return { windows, awnings };
  }, [city.buildings]);

  if (city.buildings.length === 0 && city.stalls.length === 0) return null;

  const withTank = city.buildings.filter((b) => b.tank);
  const withRebar = city.buildings.filter((b) => b.rebar);

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
              rotation={[0, b.rot, 0]}
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
            <Instance key={i} position={w.pos} rotation={[0, w.rot, 0]} scale={w.scale} />
          ))}
        </Instances>
      )}

      {/* Shopfront awnings along the ground floor */}
      {facades.awnings.length > 0 && (
        <Instances limit={facades.awnings.length} castShadow>
          <boxGeometry args={[1, 0.07, 1.5]} />
          <meshLambertMaterial color="#7a5636" />
          {facades.awnings.map((a, i) => (
            <Instance key={i} position={a.pos} rotation={[0, a.rot, 0]} scale={a.scale} />
          ))}
        </Instances>
      )}

      {/* Rooftop water tanks */}
      {withTank.length > 0 && (
        <Instances limit={withTank.length} castShadow>
          <cylinderGeometry args={[0.5, 0.5, 0.9, 8]} />
          <meshLambertMaterial color="#2f4f7a" />
          {withTank.map((b, i) => (
            <Instance
              key={i}
              position={[b.x + 1.2, b.y + b.height + 0.45, b.z]}
              rotation={[0, b.rot, 0]}
            />
          ))}
        </Instances>
      )}

      {/* Unfinished rebar columns sprouting from flat roofs — the city's
          permanent state of being one storey from finished. */}
      {withRebar.length > 0 && (
        <Instances limit={withRebar.length * 4}>
          <boxGeometry args={[0.06, 1.1, 0.06]} />
          <meshLambertMaterial color="#8a7a63" />
          {withRebar.flatMap((b, i) =>
            [-1, 1].flatMap((sx) =>
              [-1, 1].map((sz) => (
                <Instance
                  key={`${i}-${sx}-${sz}`}
                  position={[
                    b.x + sx * (b.width / 2 - 0.5),
                    b.y + b.height + 0.55,
                    b.z + sz * (b.depth / 2 - 0.5),
                  ]}
                  rotation={[0, b.rot, 0]}
                />
              ))
            )
          )}
        </Instances>
      )}

      {city.stalls.map((stall, i) => (
        <StallShop key={i} stall={stall} />
      ))}
      {city.landmarks.map((mark, i) => (
        <Temple key={i} mark={mark} />
      ))}

      <StreetFurniture city={city} />
    </group>
  );
}
