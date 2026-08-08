"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { HEADLAMP_LENS } from "@/lib/litMaterials";
import { CLOCK, SKY } from "@/lib/weather";
import { useGame } from "@/stores/useGame";

/**
 * CarExterior
 * -----------
 * A black two-seat roadster in the Mercedes SL idiom: long hood, cabin set
 * well back, open top with twin roll hoops behind the seats, chrome
 * detailing and a star in the grille.
 *
 * Materials are the one place in the project that uses PBR. The world is
 * MeshLambert for speed, but glossy black paint is defined by what it
 * reflects — with a flat material it reads as a dark blob. So the car gets
 * MeshPhysicalMaterial with clearcoat and picks up the procedural
 * environment map declared in <Experience/>.
 *
 * Cabin dimensions are shared with CarInterior and follow from the driver's
 * eye at (CONFIG.camera.eyeOffset) — right-hand drive, since Nepal keeps
 * left. The shell itself is symmetric, so only the wipers care:
 *
 *   hood top      0.88   ~11° below the sightline, road visible from ~7 m
 *   cowl / glass base at z = -0.95, so the dash sits inside the glass
 *   windshield header  y 1.44, z -0.42 — low enough to look over
 *   roll hoops    z +0.95, behind the seats
 *
 * This component owns the windshield frame and glass; CarInterior owns
 * everything inboard of it. Front of the car points toward -Z.
 */

/** Windshield rake, derived from its base and header positions. */
const GLASS_BASE = { y: 0.98, z: -0.95 };
const GLASS_TOP = { y: 1.44, z: -0.42 };
const GLASS_DY = GLASS_TOP.y - GLASS_BASE.y;
const GLASS_DZ = GLASS_TOP.z - GLASS_BASE.z;
/**
 * Rake of the frame. A part whose long axis is +Y maps to (0, cosθ, sinθ)
 * under an X rotation, so a positive angle tips its top backward (+Z) —
 * which is what the header being behind the base means here.
 */
const GLASS_RAKE = Math.atan2(GLASS_DZ, GLASS_DY);
const GLASS_LENGTH = Math.hypot(GLASS_DY, GLASS_DZ);
const GLASS_MID: [number, number, number] = [
  0,
  (GLASS_BASE.y + GLASS_TOP.y) / 2,
  (GLASS_BASE.z + GLASS_TOP.z) / 2,
];

/** Where a wiper sits when it is not sweeping, and how far it swings. */
const WIPER_PARK = 0.1;
const WIPER_SWEEP = 0.95;

export function CarExterior() {
  const spinRefs = useRef<(THREE.Group | null)[]>([]);
  const steerRefs = useRef<(THREE.Group | null)[]>([]);
  const brakeLights = useRef<(THREE.Mesh | null)[]>([]);
  const wipers = useRef<(THREE.Group | null)[]>([]);
  /** Wiper phase, in radians of its own cycle. Never resets, so speeding
   *  the wipers up mid-sweep does not jump the blade. */
  const wiperPhase = useRef(0);

  const m = useMemo(
    () => ({
      // Deep black with a clearcoat — the lacquer layer over the paint.
      paint: new THREE.MeshPhysicalMaterial({
        color: "#0a0a0c",
        metalness: 0.55,
        roughness: 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.35,
      }),
      paintSoft: new THREE.MeshPhysicalMaterial({
        color: "#0d0d10",
        metalness: 0.4,
        roughness: 0.42,
        clearcoat: 0.6,
        envMapIntensity: 0.9,
      }),
      chrome: new THREE.MeshStandardMaterial({
        color: "#e8ecf0",
        metalness: 1,
        roughness: 0.07,
        envMapIntensity: 1.6,
      }),
      darkChrome: new THREE.MeshStandardMaterial({
        color: "#4a4d52",
        metalness: 1,
        roughness: 0.25,
        envMapIntensity: 1.1,
      }),
      tyre: new THREE.MeshStandardMaterial({
        color: "#121214",
        metalness: 0,
        roughness: 0.92,
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: "#aac6dd",
        metalness: 0,
        roughness: 0.03,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        envMapIntensity: 1.4,
      }),
      headlight: new THREE.MeshStandardMaterial({
        color: "#dfe8f2",
        metalness: 0.9,
        roughness: 0.12,
        emissive: "#7d9dc4",
        emissiveIntensity: 0.35,
      }),
      tail: new THREE.MeshBasicMaterial({ color: "#8e1b18" }),
    }),
    []
  );

  // Tail-light colours, blended rather than switched: off, sidelights on
  // after dark, and full under braking.
  const tailColors = useMemo(
    () => ({
      off: new THREE.Color("#8e1b18"),
      side: new THREE.Color("#c22a20"),
      brake: new THREE.Color("#ff3b30"),
      work: new THREE.Color(),
    }),
    []
  );

  useFrame((_, dt) => {
    const car = useGame.getState().vehicle;
    for (const w of spinRefs.current) if (w) w.rotation.x = car.wheelSpin;
    for (const g of steerRefs.current) if (g) g.rotation.y = car.steerAngle;

    // The lamp units themselves light from inside when the beams are on.
    m.headlight.emissiveIntensity = 0.35 + SKY.headlights * 1.9;

    // Tail lights: dim when the lights are on, bright under braking. Two
    // separate states in the same lamp, which is what a rear light is.
    const lit = car.braking
      ? tailColors.work.copy(tailColors.brake)
      : tailColors.work.copy(tailColors.off).lerp(tailColors.side, SKY.headlights);
    for (const light of brakeLights.current) {
      if (!light) continue;
      (light.material as THREE.MeshBasicMaterial).color.copy(lit);
    }

    // ---- Wipers ----
    // They run while there is rain and then finish the stroke they are on
    // rather than stopping mid-screen, which is why the phase is only ever
    // advanced and the blade angle is read off it.
    const rain = CLOCK.rain;
    if (rain > 0.02) {
      // Intermittent in drizzle, fast in a downpour.
      wiperPhase.current += (1.1 + rain * 2.6) * dt;
    } else {
      // Park: creep on to the end of the current stroke and stop dead
      // there. The blade is at rest at every whole cycle, so the next
      // multiple of 2π is where it is allowed to stop.
      const parked = Math.ceil(wiperPhase.current / (Math.PI * 2)) * Math.PI * 2;
      wiperPhase.current = Math.min(parked, wiperPhase.current + 1.6 * dt);
    }
    const angle = WIPER_PARK + WIPER_SWEEP * (0.5 - 0.5 * Math.cos(wiperPhase.current));
    for (const blade of wipers.current) {
      if (blade) blade.rotation.z = angle;
    }
  });

  const wheels: [number, number, boolean][] = [
    [-0.86, -1.3, true],
    [0.86, -1.3, true],
    [-0.86, 1.3, false],
    [0.86, 1.3, false],
  ];

  return (
    <group>
      {/* ---------------- Lower body ---------------- */}
      <mesh position={[0, 0.62, -0.1]} material={m.paint} castShadow>
        <boxGeometry args={[1.82, 0.42, 4.35]} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={m.paintSoft} castShadow>
        <boxGeometry args={[1.88, 0.2, 3.5]} />
      </mesh>

      {/* Haunches over each axle — a roadster's widest points */}
      {[-1, 1].map((side) =>
        [-1.3, 1.3].map((z) => (
          <mesh
            key={`${side}${z}`}
            position={[side * 0.84, 0.72, z]}
            material={m.paint}
            castShadow
          >
            <boxGeometry args={[0.18, 0.34, 1.5]} />
          </mesh>
        ))
      )}

      {/* ---------------- Hood ---------------- */}
      <mesh position={[0, 0.855, -1.6]} rotation-x={-0.035} material={m.paint} castShadow>
        <boxGeometry args={[1.74, 0.1, 1.3]} />
      </mesh>
      {/* Raised centre dome and the creases either side of it */}
      <mesh position={[0, 0.9, -1.6]} rotation-x={-0.035} material={m.paint} castShadow>
        <boxGeometry args={[0.68, 0.06, 1.2]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.52, 0.885, -1.6]}
          rotation-x={-0.035}
          material={m.paint}
          castShadow
        >
          <boxGeometry args={[0.12, 0.05, 1.2]} />
        </mesh>
      ))}

      {/* Cowl at the base of the windshield */}
      <mesh position={[0, 0.9, -0.98]} material={m.paintSoft} castShadow>
        <boxGeometry args={[1.72, 0.14, 0.26]} />
      </mesh>
      {/* Wiper arms — the long one sweeps the driver's side, which is the
          right in a keep-left country.

          Each blade hangs off a group at its outboard pivot rather than
          being a bar centred on the screen: a mesh rotated about its own
          middle scissors across the glass instead of sweeping it. The mesh
          is offset by half its length so the geometry is unchanged and only
          the origin has moved. */}
      {[0.72, 0.06].map((pivot, i) => (
        <group
          key={pivot}
          position={[pivot, 0.98, -0.98]}
          ref={(el) => {
            wipers.current[i] = el;
          }}
        >
          <mesh position={[-0.3, 0, 0]} material={m.darkChrome}>
            <boxGeometry args={[0.6, 0.016, 0.016]} />
          </mesh>
        </group>
      ))}

      {/* ---------------- Nose ---------------- */}
      <group position={[0, 0.68, -2.24]} rotation-x={-0.18}>
        <mesh material={m.darkChrome} castShadow>
          <boxGeometry args={[1.16, 0.44, 0.12]} />
        </mesh>
        {[-0.13, 0, 0.13].map((y) => (
          <mesh key={y} position={[0, y, 0.07]} material={m.chrome}>
            <boxGeometry args={[1.1, 0.035, 0.03]} />
          </mesh>
        ))}
        {/* Three-pointed star */}
        <group position={[0, 0, 0.11]}>
          <mesh material={m.chrome}>
            <torusGeometry args={[0.115, 0.014, 8, 24]} />
          </mesh>
          {[90, 210, 330].map((deg) => {
            const a = (deg * Math.PI) / 180;
            return (
              <mesh
                key={deg}
                position={[Math.cos(a) * 0.055, Math.sin(a) * 0.055, 0]}
                rotation-z={a + Math.PI / 2}
                material={m.chrome}
              >
                <boxGeometry args={[0.016, 0.11, 0.012]} />
              </mesh>
            );
          })}
        </group>
      </group>

      {/* Front bumper and splitter */}
      <mesh position={[0, 0.44, -2.24]} material={m.paint} castShadow>
        <boxGeometry args={[1.8, 0.26, 0.24]} />
      </mesh>
      <mesh position={[0, 0.3, -2.3]} material={m.paintSoft} castShadow>
        <boxGeometry args={[1.7, 0.06, 0.2]} />
      </mesh>

      {/* Swept headlight units with a daytime-running strip */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.6, 0.78, -2.18]}>
          <mesh rotation-y={side * 0.12} material={m.headlight} castShadow>
            <boxGeometry args={[0.46, 0.17, 0.22]} />
          </mesh>
          {/* Daytime running strip — and the lens that lights up at night.
              Shares its material with the traffic, so every lamp in the
              valley comes on at the same moment. */}
          <mesh
            position={[0, 0.08, -0.1]}
            rotation-y={side * 0.12}
            material={HEADLAMP_LENS}
          >
            <boxGeometry args={[0.42, 0.035, 0.04]} />
          </mesh>
        </group>
      ))}

      {/* ---------------- Windshield frame ---------------- */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.7, GLASS_MID[1], GLASS_MID[2]]}
          rotation={[GLASS_RAKE, 0, side * 0.08]}
          material={m.darkChrome}
          castShadow
        >
          <boxGeometry args={[0.06, GLASS_LENGTH, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0, GLASS_TOP.y, GLASS_TOP.z]} material={m.darkChrome} castShadow>
        <boxGeometry args={[1.44, 0.07, 0.1]} />
      </mesh>
      <mesh position={GLASS_MID} rotation-x={GLASS_RAKE} material={m.glass}>
        <planeGeometry args={[1.4, GLASS_LENGTH]} />
      </mesh>

      {/* Door tops / cockpit rim */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.85, 0.94, 0.1]} material={m.paint} castShadow>
          <boxGeometry args={[0.14, 0.1, 1.6]} />
        </mesh>
      ))}

      {/* Roll hoops behind the seats */}
      {[-0.42, 0.42].map((x) => (
        <group key={x} position={[x, 1.1, 0.95]}>
          <mesh material={m.darkChrome} castShadow>
            <boxGeometry args={[0.3, 0.32, 0.12]} />
          </mesh>
          <mesh position={[0, 0.15, 0]} material={m.chrome} castShadow>
            <boxGeometry args={[0.34, 0.06, 0.14]} />
          </mesh>
        </group>
      ))}

      {/* ---------------- Rear deck ---------------- */}
      <mesh position={[0, 0.98, 1.42]} material={m.paint} castShadow>
        <boxGeometry args={[1.74, 0.16, 0.86]} />
      </mesh>
      <mesh position={[0, 0.92, 1.98]} rotation-x={0.1} material={m.paint} castShadow>
        <boxGeometry args={[1.76, 0.12, 0.44]} />
      </mesh>
      <mesh position={[0, 0.7, 2.14]} material={m.paint} castShadow>
        <boxGeometry args={[1.8, 0.36, 0.16]} />
      </mesh>

      {/* Tail lights — they brighten under braking */}
      {[-1, 1].map((side, i) => (
        <mesh
          key={side}
          ref={(el) => {
            brakeLights.current[i] = el;
          }}
          position={[side * 0.62, 0.74, 2.23]}
          material={m.tail}
        >
          <boxGeometry args={[0.44, 0.14, 0.05]} />
        </mesh>
      ))}

      {/* Rear bumper and twin chrome exhaust tips */}
      <mesh position={[0, 0.44, 2.2]} material={m.paint} castShadow>
        <boxGeometry args={[1.78, 0.26, 0.22]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.52, 0.32, 2.3]}
          rotation-x={Math.PI / 2}
          material={m.chrome}
        >
          <cylinderGeometry args={[0.062, 0.062, 0.16, 10]} />
        </mesh>
      ))}

      {/* ---------------- Side detail ---------------- */}
      {/* Chrome fender vent, an SL signature */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.93, 0.72, -1.1]}>
          <mesh material={m.chrome}>
            <boxGeometry args={[0.03, 0.12, 0.34]} />
          </mesh>
          {[-0.09, 0.03].map((z) => (
            <mesh key={z} position={[0.01, 0, z]} material={m.darkChrome}>
              <boxGeometry args={[0.03, 0.07, 0.06]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Door mirrors on chrome stalks */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.9, 1.02, -0.72]}>
          <mesh position={[side * 0.06, 0, 0.04]} material={m.chrome} castShadow>
            <boxGeometry args={[0.11, 0.035, 0.08]} />
          </mesh>
          <mesh position={[side * 0.16, 0.02, 0]} material={m.paint} castShadow>
            <boxGeometry args={[0.12, 0.09, 0.2]} />
          </mesh>
          <mesh position={[side * 0.221, 0.02, 0]} material={m.chrome}>
            <boxGeometry args={[0.008, 0.075, 0.17]} />
          </mesh>
        </group>
      ))}

      {/* ---------------- Wheels ---------------- */}
      {wheels.map(([x, z, isFront], i) => {
        const outboard = x > 0 ? 1 : -1;
        return (
          <group
            key={i}
            position={[x, 0.34, z]}
            ref={(el) => {
              if (isFront) steerRefs.current[i] = el;
            }}
          >
            {/* Brake disc stays with the upright, not the wheel */}
            <mesh rotation-z={Math.PI / 2} material={m.darkChrome}>
              <cylinderGeometry args={[0.21, 0.21, 0.02, 14]} />
            </mesh>

            {/* Everything that rolls lives in this group */}
            <group
              ref={(el) => {
                spinRefs.current[i] = el;
              }}
            >
              <mesh rotation-z={Math.PI / 2} material={m.tyre} castShadow>
                <cylinderGeometry args={[0.34, 0.34, 0.25, 16]} />
              </mesh>

              {/* Five-spoke alloy, offset outboard so it reads from the side */}
              <group position={[outboard * 0.075, 0, 0]}>
                <mesh rotation-z={Math.PI / 2} material={m.darkChrome}>
                  <cylinderGeometry args={[0.235, 0.235, 0.03, 16]} />
                </mesh>
                {[0, 1, 2, 3, 4].map((k) => (
                  <mesh
                    key={k}
                    rotation-x={(k / 5) * Math.PI * 2}
                    position={[outboard * 0.01, 0, 0]}
                    material={m.chrome}
                  >
                    <boxGeometry args={[0.02, 0.42, 0.055]} />
                  </mesh>
                ))}
                <mesh
                  rotation-z={Math.PI / 2}
                  position={[outboard * 0.02, 0, 0]}
                  material={m.chrome}
                >
                  <cylinderGeometry args={[0.055, 0.055, 0.03, 10]} />
                </mesh>
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
}
