import { useEffect, useState } from "react";

/**
 * Touch and tilt input
 * ====================
 * A second way into the same two numbers the keyboard already produces.
 *
 * `<Vehicle/>` has always reduced the keys to `throttle` and `steering`,
 * both plain numbers, before doing anything with them — and the bicycle
 * model it feeds takes a continuous steer angle, not a direction. So the
 * keyboard was never actually a digital input; it was an analogue input
 * that happened only ever to be given -1, 0 or 1. Tilt and a dragged wheel
 * fill in the rest of the range and nothing downstream has to know.
 *
 * That is the whole design. There is no touch mode, no branch in the
 * physics, and no second code path to keep in step. `INPUT` is a mutable
 * singleton in the same idiom as `CONFIG` and `CLOCK`: written by the DOM
 * overlay, read once per frame inside useFrame, and reactive to nothing.
 */

export const INPUT = {
  /** -1..1. Positive is throttle, negative is brake then reverse. */
  throttle: 0,
  /** -1..1, positive steers left — the same sign the `A` key produces. */
  steer: 0,
  horn: false,
};

/** Which source is steering. Tilt where it works, the wheel otherwise. */
export type SteerMode = "tilt" | "wheel";

export const TOUCH = {
  /** Whether the device has a coarse pointer at all. */
  available: false,
  mode: "tilt" as SteerMode,
  /** The API exists. Says nothing about whether permission was given. */
  tiltSupported: false,
  /** Permission was granted, or was never required. */
  tiltGranted: false,
  /**
   * A reading with real numbers in it has actually arrived.
   *
   * This is the one that matters and it is not implied by the other two.
   * Android has no permission call to fail, so `addEventListener` there
   * always "succeeds" — and then sends nothing at all if the page is on an
   * insecure origin, or if the device has no gyroscope. Trusting permission
   * as proof of data is how tilt mode ends up silently steering nowhere.
   */
  tiltLive: false,
  /**
   * Neutral tilt, captured when the player starts. Nobody holds a phone
   * flat, and assuming they do puts the car in the barrier immediately.
   */
  zero: 0,
  /** Degrees either side of neutral for full lock. */
  range: 26,
  /** Degrees of slop around neutral, so a held phone tracks straight. */
  deadZone: 2.5,
  /**
   * Landscape tilt sign.
   *
   * `screen.orientation.angle` is reported consistently, but which way
   * round it maps to a physical roll is not something you can derive
   * reliably across devices — the convention differs, and getting it
   * backwards makes the game unplayable rather than slightly wrong. So
   * there is a flip button in the touch overlay, and it writes here.
   */
  invert: false,
};

const STORAGE_KEY = "driving-sim-touch";

// ---------------------------------------------------------------- detection

/**
 * A coarse pointer is the honest test. User-agent sniffing gets iPads on
 * desktop Safari wrong in both directions, and `ontouchstart` is present on
 * plenty of touch-capable laptops nobody wants to drive with a thumb.
 */
export function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  TOUCH.available = coarse;
  return coarse;
}

/** React's view of the same thing, for components that lay out differently. */
export function useIsTouch(): boolean {
  // Starts false so the server and the first client render agree; a touch
  // device corrects itself on mount, one frame before anything is visible.
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(detectTouch()), []);
  return touch;
}

/** True in portrait, so the overlay can ask for the phone to be turned. */
export function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return portrait;
}

// -------------------------------------------------------------------- tilt

/** Most recent raw tilt reading, in degrees, before the neutral offset. */
let rawTilt = 0;
let listening = false;

function screenAngle(): number {
  if (typeof window === "undefined") return 0;
  const angle =
    window.screen?.orientation?.angle ??
    (window as unknown as { orientation?: number }).orientation ??
    0;
  return ((angle % 360) + 360) % 360;
}

/**
 * Pull the steering axis out of a device orientation reading.
 *
 * Which axis that is depends on how the phone is being held, and it is not
 * the same one. Steering is a *roll* — one edge of the screen drops and the
 * other lifts — so the rotation axis is the one running up and down the
 * screen. In portrait that is the device's long axis, which is `gamma`.
 * Turn the phone on its side and the screen's vertical is now the device's
 * short axis, and the same physical motion shows up in `beta` instead.
 * Reading gamma in landscape gets you a car that steers when you tip the
 * screen away from your face.
 */
function steerAxis(e: DeviceOrientationEvent): number {
  const beta = e.beta ?? 0;
  const gamma = e.gamma ?? 0;

  switch (screenAngle()) {
    case 90:
      return beta;
    case 270:
      return -beta;
    case 180:
      return gamma;
    default:
      return -gamma;
  }
}

function onOrientation(e: DeviceOrientationEvent) {
  // A browser with no sensor behind it still fires this event, with nulls
  // in it. Listening and receiving are not the same thing.
  if (e.beta === null && e.gamma === null) return;
  TOUCH.tiltLive = true;

  rawTilt = steerAxis(e);
  if (TOUCH.mode !== "tilt") return;

  const offset = (rawTilt - TOUCH.zero) * (TOUCH.invert ? -1 : 1);
  const magnitude = Math.max(0, Math.abs(offset) - TOUCH.deadZone);
  const span = Math.max(1, TOUCH.range - TOUCH.deadZone);
  const normalized = Math.min(1, magnitude / span);

  // Squared-ish response. Full lock still needs the same tilt, but the
  // first few degrees do much less, which is what makes it possible to
  // hold a straight line on a road that is never quite straight.
  const shaped = Math.pow(normalized, 1.4);
  // Tilting the phone's left edge down steers left, and left is positive
  // here because that is the sign the `A` key has always produced.
  INPUT.steer = -Math.sign(offset) * shaped;
}

/**
 * Ask for the sensor and start listening.
 *
 * iOS 13 and later gate DeviceOrientation behind a permission that can only
 * be requested from a user gesture, so this has to be called from inside a
 * click handler — the start overlay's, which is the same gesture that
 * unblocks the AudioContext. It can be refused, which is the whole reason
 * there is a wheel.
 */
export async function requestTilt(): Promise<boolean> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    TOUCH.tiltSupported = false;
    TOUCH.mode = "wheel";
    return false;
  }
  TOUCH.tiltSupported = true;

  const ctor = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };

  if (typeof ctor.requestPermission === "function") {
    try {
      const result = await ctor.requestPermission();
      if (result !== "granted") {
        TOUCH.tiltGranted = false;
        TOUCH.mode = "wheel";
        return false;
      }
    } catch {
      TOUCH.tiltGranted = false;
      TOUCH.mode = "wheel";
      return false;
    }
  }

  if (!listening) {
    window.addEventListener("deviceorientation", onOrientation);
    listening = true;
  }
  TOUCH.tiltGranted = true;

  // Permission is not data. Wait for a reading to actually turn up before
  // claiming this works, because everything downstream — whether the wheel
  // takes drags, what the settings say — hangs off the answer, and the
  // failure this catches is silent by nature.
  if (!(await waitForReadings(1500))) {
    TOUCH.mode = "wheel";
    return false;
  }

  // Calibrate off a real attitude rather than a zero that would mean
  // "phone flat on the table".
  calibrateTilt();
  return true;
}

/** Resolve true as soon as a reading arrives, false if none does in `ms`. */
function waitForReadings(ms: number): Promise<boolean> {
  if (TOUCH.tiltLive) return Promise.resolve(true);
  return new Promise((resolve) => {
    const deadline = Date.now() + ms;
    const poll = () => {
      if (TOUCH.tiltLive) resolve(true);
      else if (Date.now() > deadline) resolve(false);
      else window.setTimeout(poll, 80);
    };
    poll();
  });
}

/** Take the current attitude as straight ahead. */
export function calibrateTilt() {
  TOUCH.zero = rawTilt;
  INPUT.steer = 0;
}

/**
 * Switch to tilt, negotiating for it first.
 *
 * The old version of this just assigned `TOUCH.mode = "tilt"`, which on a
 * device that had already refused — or never been asked, or been asked over
 * plain http — put the game into a mode with no input behind it and no way
 * to tell. Asking again is free, the button press is itself the user
 * gesture iOS requires, and the return value is the truth rather than a
 * hope. Callers are expected to say so when it comes back false.
 */
export async function enableTilt(): Promise<boolean> {
  const ok = await requestTilt();
  TOUCH.mode = ok ? "tilt" : "wheel";
  INPUT.steer = 0;
  save();
  return ok;
}

export function enableWheel() {
  TOUCH.mode = "wheel";
  INPUT.steer = 0;
  save();
}

export function toggleInvert() {
  TOUCH.invert = !TOUCH.invert;
  save();
}

// ------------------------------------------------------------------ pedals

/**
 * Pedals are on or off, exactly as the keys are.
 *
 * A travel-sensitive pedal sounds better than it plays: there is no
 * proprioception through glass, so what you actually get is a throttle that
 * wanders while your thumb rests. Every mobile racer worth playing uses a
 * button, and the arcade model already ramps speed rather than applying
 * torque instantly, so the feel is the keyboard's.
 */
export function setThrottle(value: number) {
  INPUT.throttle = value;
}

export function setWheelSteer(value: number) {
  INPUT.steer = value;
}

export function setHorn(down: boolean) {
  INPUT.horn = down;
}

/** Drop every held input — the page lost focus mid-corner. */
export function releaseAll() {
  INPUT.throttle = 0;
  INPUT.steer = 0;
  INPUT.horn = false;
}

// ------------------------------------------------------------- persistence

/** The two settings that are miserable to rediscover every reload. */
function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode: TOUCH.mode, invert: TOUCH.invert })
    );
  } catch {
    // Private browsing, or storage disabled. Not worth a word to the user.
  }
}

export function loadTouchSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { mode?: SteerMode; invert?: boolean };
    if (saved.mode === "tilt" || saved.mode === "wheel") TOUCH.mode = saved.mode;
    if (typeof saved.invert === "boolean") TOUCH.invert = saved.invert;
  } catch {
    // Corrupt or absent. Defaults are fine.
  }
}
