"use client";

import { useEffect } from "react";
import { CAMERA_MODE_NAMES } from "@/lib/controls";
import { useGame } from "@/stores/useGame";

/** R / N / 1..5 for the gear readout. */
const gearLabel = (gear: number) =>
  gear === -1 ? "R" : gear === 0 ? "N" : String(gear);

/**
 * HUD
 * ---
 * Minimal DOM overlay: speed, gear, FPS, distance and the current biome.
 * It re-renders only when the reactive `hud` slice changes (~5×/second,
 * pushed by <HudBridge/> from inside the canvas), never per frame.
 */
export function HUD() {
  const hud = useGame((s) => s.hud);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const cameraMode = useGame((s) => s.cameraMode);

  // M toggles audio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute]);

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 left-6 select-none text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        <div className="flex items-end gap-3">
          <div className="text-5xl font-bold leading-none tabular-nums">
            {Math.round(hud.speedKmh)}
          </div>
          <div className="pb-1 text-lg font-normal opacity-80">km/h</div>
          <div className="ml-2 pb-1 text-2xl font-semibold text-emerald-300">
            {gearLabel(hud.gear)}
          </div>
        </div>
        <div className="mt-1.5 text-sm opacity-75 tabular-nums">
          {hud.fps} FPS &nbsp;·&nbsp; {hud.distanceKm.toFixed(2)} km &nbsp;·&nbsp;{" "}
          <span className="capitalize">{hud.biome}</span>
          {muted && <span className="ml-2 text-amber-300">muted</span>}
        </div>
      </div>

      {/* Where you are on the route, and the current viewpoint */}
      <div className="pointer-events-none fixed top-6 left-6 select-none [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        <div className="text-lg font-medium text-white/90">{hud.place}</div>
        <div className="mt-0.5 text-sm text-white/55">
          {CAMERA_MODE_NAMES[cameraMode]} view
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-6 right-6 select-none text-right text-[13px] leading-relaxed text-white/60 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        W accelerate · S brake / reverse · A / D steer
        <br />C camera · H horn · M mute · mouse to look around
      </div>
    </>
  );
}
