"use client";

import type { Landmark } from "@/lib/city";

/**
 * Temple
 * ------
 * Two Kathmandu landmarks, both built from primitives:
 *
 *  pagoda  the tiered Newari temple — a stepped plinth, a brick shrine,
 *          two or three overhanging tiled roofs on struts, a gajur finial.
 *  stupa   the whitewashed dome on a stepped base, with the harmika cube
 *          above it, the tapering gilded spire, and the painted eyes that
 *          look out in all four directions.
 *  chaitya the small stone shrine that stands on street corners all over
 *          the city — the same form as the stupa, shrunk to two metres and
 *          worn smooth, with marigolds and vermilion on the plinth.
 *
 * Prayer flags are strung from the finial on the two big ones.
 */
export function Temple({ mark }: { mark: Landmark }) {
  return (
    <group position={[mark.x, mark.y, mark.z]} rotation={[0, mark.rot, 0]}>
      {mark.kind === "pagoda" ? (
        <Pagoda />
      ) : mark.kind === "stupa" ? (
        <Stupa />
      ) : (
        <Chaitya />
      )}
    </group>
  );
}

/** The corner shrine: a stupa at the scale of a postbox. */
function Chaitya() {
  return (
    <group>
      {/* Stone plinth, offerings smeared across the top step */}
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.32, 1.5]} />
        <meshLambertMaterial color="#8f8a7e" />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[1.15, 0.22, 1.15]} />
        <meshLambertMaterial color="#a2765c" />
      </mesh>

      {/* Dome */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial color="#ded8ca" />
      </mesh>
      {/* Harmika and spire */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[0.34, 0.28, 0.34]} />
        <meshLambertMaterial color="#e2ddd0" />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 1.36 + i * 0.13, 0]}>
          <cylinderGeometry args={[0.14 - i * 0.025, 0.16 - i * 0.025, 0.11, 8]} />
          <meshStandardMaterial color="#c99b2c" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 1.92, 0]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshStandardMaterial color="#e8bb3c" metalness={0.85} roughness={0.3} />
      </mesh>

      {/* Marigolds left on the plinth */}
      {[-0.4, 0, 0.42].map((x, i) => (
        <mesh key={x} position={[x, 0.56, -0.42 + i * 0.06]}>
          <sphereGeometry args={[0.07, 6, 5]} />
          <meshLambertMaterial color={i === 1 ? "#e0651f" : "#e8a52c"} />
        </mesh>
      ))}
    </group>
  );
}

const FLAG_COLORS = ["#2f6fbf", "#ffffff", "#d33a2c", "#2f9e52", "#e8b52c"];

/** A line of prayer flags running down and away from a high point. */
function PrayerFlags({
  from,
  length,
  drop,
  count = 12,
  spin = 0,
}: {
  from: [number, number, number];
  length: number;
  drop: number;
  count?: number;
  spin?: number;
}) {
  return (
    <group position={from} rotation={[0, spin, 0]}>
      {Array.from({ length: count }, (_, i) => {
        const t = (i + 1) / count;
        return (
          <mesh
            key={i}
            position={[0, -drop * t * t, length * t]}
            rotation={[0.35 * t, 0, 0]}
          >
            <planeGeometry args={[0.26, 0.32]} />
            <meshLambertMaterial
              color={FLAG_COLORS[i % FLAG_COLORS.length]}
              side={2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Pagoda() {
  const tiers = [
    { y: 4.0, size: 6.4 },
    { y: 6.3, size: 5.2 },
    { y: 8.3, size: 4.0 },
  ];

  return (
    <group>
      {/* Stepped stone plinth */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.28 + i * 0.42, 0]} receiveShadow castShadow>
          <boxGeometry args={[9 - i * 1.1, 0.42, 9 - i * 1.1]} />
          <meshLambertMaterial color="#9a9184" />
        </mesh>
      ))}

      {/* Brick shrine */}
      <mesh position={[0, 2.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.2, 3.4, 5.2]} />
        <meshLambertMaterial color="#8d4a33" />
      </mesh>
      {/* Carved timber doorway */}
      <mesh position={[0, 2.1, -2.62]}>
        <boxGeometry args={[1.5, 2.4, 0.12]} />
        <meshLambertMaterial color="#4a3220" />
      </mesh>
      <mesh position={[0, 3.45, -2.66]}>
        <boxGeometry args={[2.1, 0.34, 0.16]} />
        <meshLambertMaterial color="#c8912f" />
      </mesh>

      {/* Overhanging tiled roofs, each on a ring of struts */}
      {tiers.map((tier, i) => (
        <group key={i}>
          <mesh position={[0, tier.y, 0]} castShadow>
            <cylinderGeometry args={[0.1, tier.size / 2, 1.0, 4]} />
            <meshLambertMaterial color="#7d3527" />
          </mesh>
          {/* Struts under the eaves, angled outward */}
          {[0, 1, 2, 3].map((k) => {
            const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
            const r = tier.size / 2 - 0.9;
            return (
              <mesh
                key={k}
                position={[Math.cos(a) * r, tier.y - 1.1, Math.sin(a) * r]}
                rotation={[0, -a, -0.32]}
              >
                <boxGeometry args={[0.12, 1.5, 0.12]} />
                <meshLambertMaterial color="#5c3a22" />
              </mesh>
            );
          })}
          {/* Upper storey wall between tiers */}
          {i < tiers.length - 1 && (
            <mesh position={[0, tier.y + 0.9, 0]} castShadow>
              <boxGeometry args={[tier.size * 0.55, 1.5, tier.size * 0.55]} />
              <meshLambertMaterial color="#8d4a33" />
            </mesh>
          )}
        </group>
      ))}

      {/* Gajur — the gilded finial */}
      <mesh position={[0, 9.3, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.36, 0.8, 8]} />
        <meshStandardMaterial color="#d9a827" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 9.9, 0]}>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshStandardMaterial color="#e8bb3c" metalness={0.9} roughness={0.25} />
      </mesh>

      <PrayerFlags from={[0, 9.4, 0]} length={9} drop={5.5} spin={0.6} />
      <PrayerFlags from={[0, 9.4, 0]} length={9} drop={5.5} spin={-2.3} />
    </group>
  );
}

function Stupa() {
  return (
    <group>
      {/* Stepped square base */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[0, 0.4 + i * 0.7, 0]} castShadow receiveShadow>
          <boxGeometry args={[11 - i * 2.2, 0.7, 11 - i * 2.2]} />
          <meshLambertMaterial color="#e6e2d8" />
        </mesh>
      ))}

      {/* Whitewashed dome */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[3.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial color="#f2efe6" />
      </mesh>

      {/* Harmika — the square block with the eyes */}
      <mesh position={[0, 5.5, 0]} castShadow>
        <boxGeometry args={[2.2, 1.6, 2.2]} />
        <meshLambertMaterial color="#f0ece1" />
      </mesh>
      {/* The eyes, on all four faces */}
      {[0, 1, 2, 3].map((k) => {
        const a = (k / 4) * Math.PI * 2;
        const r = 1.12;
        return (
          <group
            key={k}
            position={[Math.sin(a) * r, 5.6, Math.cos(a) * r]}
            rotation={[0, a, 0]}
          >
            {[-0.45, 0.45].map((x) => (
              <mesh key={x} position={[x, 0.1, 0]}>
                <boxGeometry args={[0.42, 0.2, 0.02]} />
                <meshLambertMaterial color="#1c2c4c" />
              </mesh>
            ))}
            {/* The curl of the Nepali "1" between the eyes */}
            <mesh position={[0, -0.25, 0]}>
              <boxGeometry args={[0.12, 0.3, 0.02]} />
              <meshLambertMaterial color="#1c2c4c" />
            </mesh>
          </group>
        );
      })}

      {/* Gilded tapering spire, thirteen steps to enlightenment */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[0, 6.6 + i * 0.34, 0]} castShadow>
          <cylinderGeometry args={[0.85 - i * 0.075, 0.92 - i * 0.075, 0.28, 10]} />
          <meshStandardMaterial color="#cf9f2c" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 10.1, 0]}>
        <sphereGeometry args={[0.3, 10, 8]} />
        <meshStandardMaterial color="#e8bb3c" metalness={0.9} roughness={0.22} />
      </mesh>

      <PrayerFlags from={[0, 9.8, 0]} length={11} drop={7} count={16} spin={0.9} />
      <PrayerFlags from={[0, 9.8, 0]} length={11} drop={7} count={16} spin={-1.9} />
      <PrayerFlags from={[0, 9.8, 0]} length={11} drop={7} count={16} spin={2.6} />
    </group>
  );
}
