"use client";

import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { CONFIG } from "@/lib/config";
import { UPDATE_ORDER } from "@/lib/controls";
import { cityness } from "@/lib/journey";
import { sFromZ } from "@/lib/road";
import { CLOCK, SKY } from "@/lib/weather";
import { useGame } from "@/stores/useGame";

/**
 * Atmosphere
 * ----------
 * Sky, fog, sun, moon and stars — all of it a function of `SKY`, which
 * <Weather/> has already computed for this frame.
 *
 * Nothing here decides anything. `weather.ts` owns *when* it is dark and how
 * hard it is raining; this file owns only what that should look like, as a
 * set of colours interpolated by those signals. Adding a season or a
 * sandstorm means adding signals there and endpoints here, and no branches
 * in either place.
 *
 * One directional light does both the sun and the moon. It swings round to
 * the moon's side of the sky as the sun goes down and takes its colour and
 * intensity with it, which gets moonlit shadows for the cost of the shadow
 * map that was already being drawn. Two lights would mean two.
 *
 * The rig rides with the car, so the shadow frustum is always the 140 m
 * around the player rather than a huge blurry map covering the valley. The
 * light's target is an explicit object inside that rig: leaving it at its
 * default puts it at the world origin, and by Kathmandu the car is two
 * kilometres from there, so every shadow in town would be cast along the
 * wrong axis.
 */

// ------------------------------------------------------------- the palette

/** Clear air in the hills, and the dust bowl the valley sits under. */
const FOG_HILL_DAY = new THREE.Color("#bdd7ee");
const FOG_VALLEY_DAY = new THREE.Color("#cdc2ad");
/** After dark. The city end is warmer — that is the town's own light,
 *  thrown back down off the haze, which is why Kathmandu has no black sky. */
const FOG_HILL_NIGHT = new THREE.Color("#0a1018");
const FOG_VALLEY_NIGHT = new THREE.Color("#221a1c");
/** Rain flattens everything toward one grey. */
const FOG_RAIN = new THREE.Color("#8e9aa2");
/** Low sun pushes the whole air column orange. */
const FOG_GOLDEN = new THREE.Color("#e0a166");

const SUN_HIGH = new THREE.Color("#fff4e0");
const SUN_LOW = new THREE.Color("#ff9243");
const MOON_COLOR = new THREE.Color("#8fa8d4");

const AMBIENT_DAY = new THREE.Color("#dfeaf5");
const AMBIENT_NIGHT = new THREE.Color("#1b2740");
const AMBIENT_GOLDEN = new THREE.Color("#f0c092");

const HEMI_SKY_DAY = new THREE.Color("#cfe5ff");
const HEMI_SKY_NIGHT = new THREE.Color("#141c30");
const HEMI_GROUND_DAY = new THREE.Color("#7a8a5f");
const HEMI_GROUND_NIGHT = new THREE.Color("#0e1210");

/** How far out the sun sits from the car. Inside the shadow camera's far. */
const SUN_DISTANCE = 150;

export function Atmosphere() {
  const rig = useRef<THREE.Group>(null);
  const target = useRef<THREE.Object3D>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const skyRef = useRef<ComponentRef<typeof Sky>>(null);
  const moon = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Points>(null);

  const { scene, gl } = useThree();

  // Scratch colours, so the per-frame blending allocates nothing.
  const work = useMemo(
    () => ({ fog: new THREE.Color(), night: new THREE.Color(), day: new THREE.Color() }),
    []
  );

  /**
   * The night sky, once. Points on a sphere with a spread of brightnesses,
   * dimmer near the horizon where there is more air to look through.
   */
  const starField = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    // Fixed sequence — the constellations should not reshuffle on reload.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let i = 0; i < count; i++) {
      // Upper hemisphere only; nothing below the horizon is visible anyway.
      const u = rand();
      const theta = rand() * Math.PI * 2;
      const y = Math.pow(u, 0.65); // bias away from the horizon
      const r = Math.sqrt(1 - y * y);

      positions[i * 3] = Math.cos(theta) * r * 480;
      positions[i * 3 + 1] = y * 480;
      positions[i * 3 + 2] = Math.sin(theta) * r * 480;

      // A few bright ones, mostly faint. Slight colour spread so it is not
      // a field of identical white dots.
      const mag = 0.35 + Math.pow(rand(), 2.4) * 0.65;
      const warm = rand() * 0.18;
      colors[i * 3] = mag;
      colors[i * 3 + 1] = mag * (1 - warm * 0.4);
      colors[i * 3 + 2] = mag * (1 - warm);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, []);

  const starMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 2.4,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // Stars are outside the weather, so scene fog must not touch them.
        // Haze hides them instead, by opacity, below.
        fog: false,
      }),
    []
  );

  // Point the key light at the rig's own origin rather than the world's.
  useEffect(() => {
    if (key.current && target.current) key.current.target = target.current;
  }, []);

  useFrame(() => {
    const { position } = useGame.getState().vehicle;
    const urban = cityness(sFromZ(position.z));
    // Two different quantities, and they are not interchangeable. `lit` is
    // where the sun is and drives every colour; `day` is how much light is
    // getting through and drives every intensity. Blend the colours by
    // `day` instead and a wet midday goes the colour of dusk.
    const lit = SKY.sunlit;
    const day = SKY.daylight;
    const night = SKY.night;

    // ---- Move the whole rig with the car ----
    if (rig.current) rig.current.position.copy(position);

    // ---- Key light: the sun, swinging round to the moon after dark ----
    if (key.current) {
      const light = key.current;
      const sunUp = SKY.y > -0.02;
      const dx = sunUp ? SKY.x : SKY.moonX;
      const dy = sunUp ? SKY.y : SKY.moonY;
      const dz = sunUp ? SKY.z : SKY.moonZ;
      // Keep the source above the horizon even at the moment of crossover,
      // or the shadows rake out to infinity and then flip.
      light.position.set(
        dx * SUN_DISTANCE,
        Math.max(0.12, dy) * SUN_DISTANCE,
        dz * SUN_DISTANCE
      );

      light.color.copy(SUN_LOW).lerp(SUN_HIGH, 1 - SKY.golden);
      if (!sunUp) light.color.copy(MOON_COLOR);

      // Overcast does not just dim the sun, it removes it: under monsoon
      // cloud there is no disc and no direction, so the shadows go with it.
      const clouded = 1 - SKY.overcast * 0.85;
      light.intensity = (day * 1.5 * clouded + night * 0.16) * (1 - CLOCK.rain * 0.3);
      light.castShadow = light.intensity > 0.18;
    }

    // ---- Fill ----
    if (ambient.current) {
      const a = ambient.current;
      a.color.copy(AMBIENT_NIGHT).lerp(AMBIENT_DAY, lit);
      a.color.lerp(AMBIENT_GOLDEN, SKY.golden * 0.5);
      // Rain and haze scatter light into the shadows, so the fill *rises*
      // as the sun goes — an overcast day is flat, not dark.
      a.intensity = 0.1 + day * (0.4 + SKY.overcast * 0.22) + night * 0.06;
    }
    if (hemi.current) {
      const h = hemi.current;
      h.color.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, lit);
      h.groundColor.copy(HEMI_GROUND_NIGHT).lerp(HEMI_GROUND_DAY, lit);
      h.intensity = 0.08 + day * 0.34;
    }

    // ---- Sky dome ----
    const skyMesh = skyRef.current;
    if (skyMesh) {
      const u = (skyMesh.material as THREE.ShaderMaterial).uniforms;
      u.sunPosition.value.set(SKY.x, SKY.y, SKY.z);
      // Turbidity is haze made literal; rayleigh is what reddens a low sun,
      // and cloud takes it away along with the colour.
      u.turbidity.value = 2.5 + CLOCK.haze * 12 + CLOCK.rain * 6;
      u.rayleigh.value = 0.5 + SKY.golden * 2.6 - SKY.overcast * 0.3;
      u.mieCoefficient.value = 0.005 + CLOCK.haze * 0.02;
      u.mieDirectionalG.value = 0.8 - SKY.overcast * 0.25;
    }

    // ---- Moon and stars ----
    if (moon.current) {
      moon.current.position.set(
        SKY.moonX * 430,
        SKY.moonY * 430,
        SKY.moonZ * 430
      );
      // Only when it is up and there is dark to see it against.
      const up = THREE.MathUtils.clamp(SKY.moonY * 6, 0, 1);
      const m = moon.current.material as THREE.MeshBasicMaterial;
      m.opacity = up * night * (1 - SKY.overcast * 0.9);
      moon.current.visible = m.opacity > 0.01;
    }
    if (stars.current) {
      starMaterial.opacity = night * night * (1 - SKY.overcast) * 0.95;
      stars.current.visible = starMaterial.opacity > 0.01;
    }

    // ---- Fog ----
    // Two axes at once: where you are on the route (clear hills → valley
    // dust, the journey's own signal) and what time it is.
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      work.day.copy(FOG_HILL_DAY).lerp(FOG_VALLEY_DAY, urban);
      work.night.copy(FOG_HILL_NIGHT).lerp(FOG_VALLEY_NIGHT, urban);
      work.fog.copy(work.night).lerp(work.day, lit);
      work.fog.lerp(FOG_GOLDEN, SKY.golden * 0.4);
      work.fog.lerp(FOG_RAIN, CLOCK.rain * 0.5 * lit);
      fog.color.copy(work.fog);

      // Visibility. Haze and rain close it in hard; the dark closes it in
      // further, because the headlights only reach so far.
      const reach =
        (1 - CLOCK.haze * 0.55) * (1 - CLOCK.rain * 0.4) * (1 - night * 0.42);
      fog.near = (CONFIG.sky.fogNear - urban * 45) * Math.max(0.25, reach);
      fog.far = (CONFIG.sky.fogFar - urban * 150) * Math.max(0.22, reach);
    }

    // ---- Reflections ----
    // The car's paint is the one PBR surface in the game, and it is lit by
    // the little procedural cubemap <Experience/> bakes on the first frame —
    // a bright blue sky and a sun, forever. Nothing about the clock reaches
    // it, so left alone the roadster drives through midnight reflecting a
    // June afternoon. Turning the scene's environment contribution down is
    // the whole fix, and it is one number.
    scene.environmentIntensity = 0.06 + lit * 0.94;

    // ---- Exposure ----
    // One global stop on top, because dimming the lights alone leaves the
    // dark end of the range looking grey rather than black.
    gl.toneMappingExposure = THREE.MathUtils.lerp(0.42, 1, lit * lit);
  }, UPDATE_ORDER.road);

  const s = CONFIG.sky;

  return (
    <>
      <Sky ref={skyRef} sunPosition={s.sunPosition} turbidity={4} rayleigh={0.6} />

      <fog attach="fog" args={[s.fogColor, s.fogNear, s.fogFar]} />

      <ambientLight ref={ambient} intensity={0.5} color="#dfeaf5" />
      <hemisphereLight
        ref={hemi}
        intensity={0.4}
        color="#cfe5ff"
        groundColor="#7a8a5f"
      />

      {/* Everything that has to stay centred on the car */}
      <group ref={rig}>
        <object3D ref={target} />

        <directionalLight
          ref={key}
          intensity={1.5}
          color="#fff4e0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={10}
          shadow-camera-far={340}
          shadow-camera-left={-70}
          shadow-camera-right={70}
          shadow-camera-top={70}
          shadow-camera-bottom={-70}
          shadow-bias={-0.0004}
        />

        <points ref={stars} geometry={starField} material={starMaterial} />

        <mesh ref={moon}>
          <sphereGeometry args={[9, 16, 12]} />
          <meshBasicMaterial
            color="#eef2ff"
            transparent
            opacity={0}
            fog={false}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
}
