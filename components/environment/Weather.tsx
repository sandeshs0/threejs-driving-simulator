"use client";

import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { UPDATE_ORDER } from "@/lib/controls";
import { updateLitMaterials } from "@/lib/litMaterials";
import { advance, cycleLights, cycleTime, cycleWeather } from "@/lib/weather";

/**
 * Weather
 * -------
 * Owns the clock. Runs first every frame — before traffic, before the car,
 * before the camera — so that `SKY` is already current by the time anything
 * reads it, and every system sees the same sky on the same frame.
 *
 * It also owns the three keys that change it. Those are plain keydown
 * listeners rather than drei's `KeyboardControls` because they are toggles
 * and drei's map is for *held* keys: it reports the state of a key each
 * frame, which is exactly right for the throttle and exactly wrong for
 * anything that should fire once per press. `M` for mute is handled the same
 * way over in the HUD, for the same reason.
 *
 *   T  step forward to the next time of day
 *   K  cycle the weather
 *   L  headlights: auto → on → off
 */
export function Weather() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal a keystroke from the stereo's YouTube URL box.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.repeat) return;

      if (e.code === "KeyT") cycleTime();
      else if (e.code === "KeyK") cycleWeather();
      else if (e.code === "KeyL") cycleLights();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useFrame((_, dt) => {
    // Clamp the step. A tab that has been in the background comes back with
    // a delta of several seconds, and without this the sky lurches an hour
    // on the frame you return to it.
    advance(Math.min(dt, 0.1));
    updateLitMaterials();
  }, UPDATE_ORDER.weather);

  return null;
}
