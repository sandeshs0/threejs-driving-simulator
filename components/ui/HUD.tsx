"use client";

import { useEffect } from "react";
import { CAMERA_MODE_NAMES } from "@/lib/controls";
import { ROUTE_END, WAYPOINTS } from "@/lib/journey";
import { useGame } from "@/stores/useGame";

/** R / N / 1..5 for the gear readout. */
const gearLabel = (gear: number) =>
  gear === -1 ? "R" : gear === 0 ? "N" : String(gear);

/** Distances read as metres until they stop being useful that way. */
const distanceLabel = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;

/**
 * HUD
 * ---
 * DOM overlay: speed, gear, FPS, distance, biome, the journey progress bar
 * and the damage readout. It re-renders only when the reactive `hud` slice
 * changes (~5×/second, pushed by <HudBridge/> from inside the canvas),
 * never per frame.
 *
 * The bottom-right corner belongs to the radar, so the control reminders
 * live top-right instead.
 */
export function HUD() {
  const hud = useGame((s) => s.hud);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const cameraMode = useGame((s) => s.cameraMode);
  const mapExpanded = useGame((s) => s.mapExpanded);

  // M toggles audio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyM") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute]);

  // With the full map open the overlay would just be noise on top of it.
  if (mapExpanded) return null;

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

        {/* Damage. Hidden until there is some — a clean run should not have
            an empty gauge nagging at it. */}
        {hud.damage > 0.01 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-[width] duration-300"
                style={{ width: `${Math.round(hud.damage * 100)}%` }}
              />
            </div>
            <span className="text-xs text-white/60 tabular-nums">
              damage · {hud.crashes} hit{hud.crashes === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      {/* Where you are on the route, and the current viewpoint */}
      <div className="pointer-events-none fixed top-6 left-6 select-none [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        <div className="text-lg font-medium text-white/90">{hud.place}</div>
        <div className="mt-0.5 text-sm text-white/55">
          {CAMERA_MODE_NAMES[cameraMode]} view
        </div>
      </div>

      <RouteProgress
        progress={hud.progress}
        nextName={hud.nextName}
        nextDistanceM={hud.nextDistanceM}
      />

      {/* Keep left. The whole point of driving here. */}
      {hud.wrongLane && (
        <div className="pointer-events-none fixed left-1/2 top-28 -translate-x-1/2 select-none rounded-full bg-red-600/85 px-4 py-1.5 text-sm font-semibold tracking-wide text-white shadow-lg">
          Keep left
        </div>
      )}

      <div className="pointer-events-none fixed top-6 right-6 select-none text-right text-[13px] leading-relaxed text-white/60 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        W accelerate · S brake / reverse · A / D steer
        <br />C camera · H horn · M mute · Tab map · mouse to look
      </div>
    </>
  );
}

/**
 * The journey bar: the whole route as a line, every waypoint as a tick, and
 * the next one named with the distance still to go. It is the thing that
 * turns an endless road into a drive that is going somewhere.
 */
function RouteProgress({
  progress,
  nextName,
  nextDistanceM,
}: {
  progress: number;
  nextName: string;
  nextDistanceM: number;
}) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-6 w-[min(460px,60vw)] -translate-x-1/2 select-none">
      <div className="flex items-baseline justify-between text-xs text-white/60 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        <span className="uppercase tracking-widest">Journey</span>
        {nextName ? (
          <span className="text-white/80">
            {nextName}
            <span className="ml-2 tabular-nums text-white/50">
              {distanceLabel(Math.max(0, nextDistanceM))}
            </span>
          </span>
        ) : (
          <span className="text-emerald-300">Arrived · Kathmandu</span>
        )}
      </div>

      <div className="relative mt-1.5 h-1.5 rounded-full bg-black/40">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-amber-300/90"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
        {/* One tick per waypoint, at its true position along the route */}
        {WAYPOINTS.map((w) => (
          <span
            key={w.s}
            className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded-full bg-white/45"
            style={{ left: `${(w.s / ROUTE_END) * 100}%` }}
          />
        ))}
        {/* Where you are */}
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow"
          style={{ left: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
