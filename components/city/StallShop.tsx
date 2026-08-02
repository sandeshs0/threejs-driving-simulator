"use client";

import { useMemo } from "react";
import type { Stall } from "@/lib/city";
import { outwardVector } from "@/lib/city";

/**
 * StallShop
 * ---------
 * The roadside tea shop / momo pasal: a tin-roofed shack with a striped
 * awning over a counter, a couple of plastic stools, and a hand-painted
 * signboard facing the traffic.
 *
 * A momo pasal gets a steamer stack on the counter; a tea shop gets a
 * kettle and glasses; a fruit shop gets its stock heaped in trays out
 * front; a general store gets stacked crates. They are one component
 * because the differences are two or three small meshes.
 */
export function StallShop({ stall }: { stall: Stall }) {
  // Everything is laid out in the stall's local frame, then the whole
  // group is rotated to face the road, so -Z is "toward the street".
  const facing = useMemo(() => {
    const [ox, oz] = outwardVector(stall.rot);
    return { ox, oz };
  }, [stall.rot]);

  const counterColor =
    stall.kind === "tea"
      ? "#6b4b32"
      : stall.kind === "momo"
      ? "#5f5a52"
      : stall.kind === "fruit"
      ? "#6e5a3c"
      : "#5a4636";

  return (
    <group
      position={[
        stall.x + facing.ox * stall.side * 1.1,
        stall.y,
        stall.z + facing.oz * stall.side * 1.1,
      ]}
      rotation={[0, stall.rot + (stall.side > 0 ? 0 : Math.PI), 0]}
    >
      {/* Back wall and side panels — corrugated tin */}
      <mesh position={[0, 1.2, 1.0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 2.4, 0.08]} />
        <meshLambertMaterial color="#8a8578" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.3, 1.2, 0.5]} castShadow>
          <boxGeometry args={[0.08, 2.4, 1.1]} />
          <meshLambertMaterial color="#7d786c" />
        </mesh>
      ))}

      {/* Tin roof, pitched toward the street */}
      <mesh position={[0, 2.5, 0.5]} rotation-x={-0.14} castShadow>
        <boxGeometry args={[2.9, 0.07, 1.9]} />
        <meshLambertMaterial color="#6e6a62" />
      </mesh>

      {/* Awning out over the counter, on two thin poles */}
      <mesh position={[0, 2.2, -0.55]} rotation-x={0.22} castShadow>
        <boxGeometry args={[2.8, 0.05, 1.2]} />
        <meshLambertMaterial color={stall.awning} />
      </mesh>
      {[-1.3, 1.3].map((x) => (
        <mesh key={x} position={[x, 1.1, -1.05]}>
          <cylinderGeometry args={[0.03, 0.03, 2.2, 6]} />
          <meshLambertMaterial color="#5c5750" />
        </mesh>
      ))}

      {/* Counter facing the road */}
      <mesh position={[0, 0.5, -0.35]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 1.0, 0.6]} />
        <meshLambertMaterial color={counterColor} />
      </mesh>

      {/* Signboard above the awning */}
      <mesh position={[0, 2.75, -0.9]} rotation-x={0.1}>
        <boxGeometry args={[2.2, 0.42, 0.05]} />
        <meshLambertMaterial color={stall.awning} />
      </mesh>
      {/* A band of lettering — suggested, not spelled out, so no font load */}
      <mesh position={[0, 2.75, -0.93]} rotation-x={0.1}>
        <boxGeometry args={[1.7, 0.12, 0.02]} />
        <meshLambertMaterial color="#efe6d2" />
      </mesh>

      {stall.kind === "momo" && (
        <group position={[-0.6, 1.05, -0.35]}>
          {/* Stacked aluminium steamer, with the lid slightly ajar */}
          {[0, 0.16, 0.32].map((y) => (
            <mesh key={y} position={[0, y, 0]} castShadow>
              <cylinderGeometry args={[0.24, 0.24, 0.15, 12]} />
              <meshStandardMaterial color="#b8bcc0" metalness={0.7} roughness={0.4} />
            </mesh>
          ))}
          <mesh position={[0, 0.46, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.06, 12]} />
            <meshStandardMaterial color="#c6cacd" metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      )}

      {stall.kind === "tea" && (
        <group position={[0.5, 1.05, -0.35]}>
          {/* Kettle on a gas ring, and a row of glasses */}
          <mesh castShadow>
            <cylinderGeometry args={[0.2, 0.16, 0.26, 10]} />
            <meshStandardMaterial color="#9a9084" metalness={0.5} roughness={0.5} />
          </mesh>
          {[-0.45, -0.3, -0.15].map((x) => (
            <mesh key={x} position={[x, 0.05, 0.12]}>
              <cylinderGeometry args={[0.045, 0.035, 0.11, 8]} />
              <meshLambertMaterial color="#d8cfae" />
            </mesh>
          ))}
        </group>
      )}

      {stall.kind === "fruit" && (
        <group position={[0, 1.02, -0.55]}>
          {/* Sloped trays of stock, angled out toward the street so the
              colour is what you see first — which is the entire point of
              stacking it that way. */}
          {[-0.75, 0, 0.75].map((x, i) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh rotation-x={-0.3} castShadow>
                <boxGeometry args={[0.66, 0.05, 0.5]} />
                <meshLambertMaterial color="#7d6242" />
              </mesh>
              {[-0.18, 0, 0.18].map((dx, k) => (
                <mesh key={dx} position={[dx, 0.12, -0.02]} castShadow>
                  <sphereGeometry args={[0.1, 8, 6]} />
                  <meshLambertMaterial
                    color={
                      ["#e0651f", "#d3352f", "#e8c22c", "#4f8f3a"][(i + k) % 4]
                    }
                  />
                </mesh>
              ))}
            </group>
          ))}
          {/* A hand scale hanging off the awning pole */}
          <mesh position={[1.15, 0.5, 0]}>
            <boxGeometry args={[0.22, 0.03, 0.03]} />
            <meshLambertMaterial color="#9a958a" />
          </mesh>
        </group>
      )}

      {stall.kind === "shop" && (
        <group position={[0.55, 1.12, -0.3]}>
          {/* Crates of bottles and packets stacked on the counter */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[i * 0.32 - 0.32, 0.1, 0]} castShadow>
              <boxGeometry args={[0.28, 0.2, 0.28]} />
              <meshLambertMaterial color={i % 2 ? "#b2452f" : "#31678f"} />
            </mesh>
          ))}
        </group>
      )}

      {/* Two plastic stools out front */}
      {[-0.8, 0.75].map((x) => (
        <group key={x} position={[x, 0, -1.35]}>
          <mesh position={[0, 0.32, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.14, 0.06, 8]} />
            <meshLambertMaterial color="#c14a3a" />
          </mesh>
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.12, 0.14, 0.3, 8]} />
            <meshLambertMaterial color="#a83f30" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
