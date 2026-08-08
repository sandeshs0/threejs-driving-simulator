import * as THREE from "three";
import { CLOCK, SKY } from "./weather";

/**
 * Lit materials
 * =============
 * The handful of materials that have to change when the sun goes down, as
 * module-level singletons rather than per-component instances.
 *
 * That is the whole trick. City chunks mount and unmount constantly, there
 * are thousands of windows and lamp heads across the ones that are up at any
 * moment, and none of them can afford a subscription or a per-frame walk of
 * the scene graph. Because every chunk points at the *same* material object,
 * `update()` writes one colour and every window in Kathmandu lights up — and
 * a chunk that mounts at midnight is already lit before its first frame,
 * with nothing to catch up.
 *
 * It is the same reasoning as CONFIG: one mutable object, written in one
 * place, read everywhere, and no React involved.
 *
 * The cost is that everything sharing a material changes together, so
 * anything that should vary building-to-building has to be a *different*
 * material — which is why the windows come in a lit set and a dark set and
 * the city picks between them per floor.
 */

/** Warm interior light, seen through glass from the street. */
const WINDOW_WARM = new THREE.Color("#ffcf87");
/** Unlit glass by day: dark, and slightly blue from the sky it reflects. */
const WINDOW_COLD = new THREE.Color("#2b3138");

/**
 * Windows in occupied rooms. Emissive rather than just bright, so the bloom
 * pass catches them and they read as light sources at distance.
 */
export const WINDOW_LIT = new THREE.MeshLambertMaterial({
  color: WINDOW_COLD.clone(),
  emissive: WINDOW_WARM.clone(),
  emissiveIntensity: 0,
});

/** Windows in rooms nobody is in. Never lights up — that is the point. */
export const WINDOW_DARK = new THREE.MeshLambertMaterial({
  color: WINDOW_COLD.clone(),
});

/** Carved timber windows of the older houses: smaller, dimmer, warmer. */
export const TIMBER_WINDOW = new THREE.MeshLambertMaterial({
  color: "#3a2617",
  emissive: new THREE.Color("#c98a3a"),
  emissiveIntensity: 0,
});

/** Street lamp heads. Sodium — the orange that lights Kathmandu at night. */
export const LAMP_HEAD = new THREE.MeshBasicMaterial({ color: "#cfd6d8" });
const LAMP_OFF = new THREE.Color("#cfd6d8");
const LAMP_ON = new THREE.Color("#ffd9a0");

/**
 * The pool of light a lamp throws on the pavement.
 *
 * Additive, so it brightens what is under it instead of painting over it,
 * and depth-written off so overlapping pools do not fight. This is what
 * actually sells street lighting: real point lights would be correct and
 * there would be sixty of them in view.
 */
export const LAMP_POOL = new THREE.MeshBasicMaterial({
  color: "#ffb765",
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: true,
});

/** Traffic headlamps and tail lamps, shared by every vehicle in the pool. */
export const TRAFFIC_HEADLAMP = new THREE.MeshBasicMaterial({ color: "#3d4148" });
export const TRAFFIC_TAILLAMP = new THREE.MeshBasicMaterial({ color: "#5e1512" });

const HEADLAMP_OFF = new THREE.Color("#3d4148");
const HEADLAMP_ON = new THREE.Color("#fff6dd");
const TAILLAMP_OFF = new THREE.Color("#5e1512");
const TAILLAMP_ON = new THREE.Color("#ff2a20");

/** The player's own headlight lenses and daytime running strip. */
export const HEADLAMP_LENS = new THREE.MeshBasicMaterial({ color: "#c6d2e0" });
const LENS_OFF = new THREE.Color("#8b96a4");
const LENS_ON = new THREE.Color("#fffaf0");

/**
 * Beam cones. Drawn only when the headlights are on and the air has
 * something in it to scatter — a beam is invisible in clean air, and
 * drawing one anyway is the single most common way night lighting in a game
 * announces itself as fake.
 */
export const BEAM = new THREE.MeshBasicMaterial({
  color: "#fff3d6",
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/**
 * Called once per frame by <Weather/>, after `advance()`, before anything
 * that draws. Everything here is a write to a shared object — no allocation,
 * no traversal, no renders.
 */
export function updateLitMaterials() {
  const lamps = SKY.lamps;

  // Windows come up over the same ramp as the lamps but reach further into
  // the evening — people turn a light on before the street does.
  WINDOW_LIT.emissiveIntensity = lamps * 0.9;
  TIMBER_WINDOW.emissiveIntensity = lamps * 0.55;

  LAMP_HEAD.color.copy(LAMP_OFF).lerp(LAMP_ON, lamps);
  // Pools are worth drawing only once there is dark for them to sit in.
  LAMP_POOL.opacity = lamps * SKY.night * 0.36;
  LAMP_POOL.visible = LAMP_POOL.opacity > 0.01;

  TRAFFIC_HEADLAMP.color.copy(HEADLAMP_OFF).lerp(HEADLAMP_ON, SKY.headlights);
  TRAFFIC_TAILLAMP.color.copy(TAILLAMP_OFF).lerp(TAILLAMP_ON, SKY.headlights);
  HEADLAMP_LENS.color.copy(LENS_OFF).lerp(LENS_ON, SKY.headlights);

  // Haze, rain and darkness are what make a beam visible. In clear daylight
  // this is zero and the cones are not drawn at all.
  const scatter = Math.min(1, CLOCK.haze * 0.7 + CLOCK.rain * 0.9);
  BEAM.opacity = SKY.headlights * SKY.night * (0.05 + scatter * 0.16);
  BEAM.visible = BEAM.opacity > 0.005;
}
