"use client";

import { useEffect } from "react";
import { CAMERA_MODE_NAMES } from "@/lib/controls";
import { useIsTouch } from "@/lib/input";
import { ROUTE_END, WAYPOINTS } from "@/lib/journey";
import { useGame, type HudState } from "@/stores/useGame";
import { nowPlaying, useMedia } from "@/stores/useMedia";
import { Icon } from "./Icons";

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
  /**
   * On a phone the bottom of the screen belongs to the pedals and the
   * wheel, so everything that lived down there moves up. The speed goes
   * under the place name rather than into the middle, because the middle
   * is where you are looking and a number parked in it is in the way.
   */
  const isTouch = useIsTouch();

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

  if (isTouch) return <TouchHud hud={hud} muted={muted} />;

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
        <DamageBar damage={hud.damage} crashes={hud.crashes} />
      </div>

      {/* Where you are. In the city that means the street you are on and
          the next one crossing it — the district alone is no use once you
          can turn off the main road. */}
      <div className="pointer-events-none fixed top-6 left-6 select-none [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {hud.street ? (
          <>
            <div className="text-lg font-medium text-white/90">{hud.street}</div>
            <div className="mt-0.5 text-sm text-white/55">
              {hud.place}
              {hud.junction && (
                <>
                  {" · "}
                  <span className="text-white/75">{hud.junction}</span>{" "}
                  <span className="tabular-nums">
                    {distanceLabel(hud.junctionDistance)}
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="text-lg font-medium text-white/90">{hud.place}</div>
        )}
        <div className="mt-0.5 text-sm text-white/55">
          {CAMERA_MODE_NAMES[cameraMode]} view
        </div>

        {/* The sky, in one line: the time, what it is doing, and whether
            the lights are on. The stalk is only worth mentioning when it
            has been taken off auto — that is the whole point of auto. */}
        <div className="mt-2 flex items-center gap-2 text-sm text-white/70 [font-variant-numeric:tabular-nums]">
          <span className="rounded bg-black/35 px-1.5 py-0.5 font-medium tracking-wide">
            {hud.clock}
          </span>
          <span className="text-white/50">{hud.weather}</span>
          {hud.lights !== "auto" && (
            <span className="text-amber-200/80">lights {hud.lights}</span>
          )}
        </div>
      </div>

      <RouteProgress
        progress={hud.progress}
        nextName={hud.nextName}
        nextDistanceM={hud.nextDistanceM}
        compact={false}
      />

      <KeepLeft show={hud.wrongLane} />

      <div className="pointer-events-none fixed top-6 right-6 select-none text-right text-[13px] leading-relaxed text-white/60 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        W accelerate · S brake / reverse · A / D steer
        <br />C camera · H horn · M mute · Tab map · I stereo · mouse to look
        <br />T time of day · K weather · L headlights
      </div>

      <StereoButton />
    </>
  );
}

/**
 * The phone HUD.
 *
 * A separate component rather than a dozen ternaries in the desktop one,
 * because this is not the same layout with smaller text — it is a different
 * arrangement of a smaller set of things, and interleaving the two makes
 * both hard to read and neither safe to change.
 *
 * What goes is everything you would not look at while driving on a screen
 * the size of a hand: the frame rate, the odometer, the biome, the name of
 * the camera angle, and the word "Journey" over a bar that is obviously a
 * journey. The place, the speed and the clock stack into one corner block;
 * the radar in the other corner is now also the button that opens the map.
 */
function TouchHud({ hud, muted }: { hud: HudState; muted: boolean }) {
  return (
    <>
      {/* One block, top left — below the route bar rather than beside it.
          Sharing that row meant fighting a centred element for width on
          every screen size; giving it its own line means the street name can
          stay long enough to be a street name. */}
      <div className="safe-left pointer-events-none fixed top-12 max-w-[42vw] select-none text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        <div className="truncate text-[13px] font-medium text-white/85">
          {hud.street || hud.place}
        </div>

        <div className="mt-0.5 flex items-end gap-2">
          <span className="text-[2.6rem] font-bold leading-none tabular-nums">
            {Math.round(hud.speedKmh)}
          </span>
          <span className="pb-1 text-sm opacity-70">km/h</span>
          <span className="pb-1 text-lg font-semibold text-emerald-300">
            {gearLabel(hud.gear)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/55 [font-variant-numeric:tabular-nums]">
          <span className="font-medium text-white/75">{hud.clock}</span>
          <span>{hud.weather}</span>
          {hud.lights !== "auto" && (
            <span className="text-amber-200/80">lights {hud.lights}</span>
          )}
          {muted && <span className="text-amber-300">muted</span>}
        </div>

        <DamageBar damage={hud.damage} crashes={hud.crashes} />
      </div>

      <RouteProgress
        progress={hud.progress}
        nextName={hud.nextName}
        nextDistanceM={hud.nextDistanceM}
        compact
      />

      <KeepLeft show={hud.wrongLane} />
      <TouchButtonStrip muted={muted} />
    </>
  );
}

/** Hidden until there is damage — a clean run should not have an empty
 *  gauge nagging at it. */
function DamageBar({ damage, crashes }: { damage: number; crashes: number }) {
  if (damage <= 0.01) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-[width] duration-300"
          style={{ width: `${Math.round(damage * 100)}%` }}
        />
      </div>
      <span className="text-[11px] text-white/60 tabular-nums">
        damage · {crashes} hit{crashes === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/** Keep left. The whole point of driving here. */
function KeepLeft({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-20 -translate-x-1/2 select-none rounded-full bg-red-600/85 px-4 py-1.5 text-sm font-semibold tracking-wide text-white shadow-lg">
      Keep left
    </div>
  );
}

/**
 * The two keys with no key on a phone: mute, and the stereo.
 *
 * There was a Map button here too, sitting directly under a radar showing
 * the same world at a different zoom — two controls for one idea, in the
 * corner with the least room. The radar opens the map itself now (see
 * <Minimap/>), which is what everyone tries first anyway.
 *
 * Under the radar rather than beside the pedals, because both of these are
 * things you press while stopped or on a straight, and the bottom edge is
 * committed to things you press while driving.
 */
function TouchButtonStrip({ muted }: { muted: boolean }) {
  const toggleMute = useGame((s) => s.toggleMute);
  const setOpen = useMedia((s) => s.setOpen);
  const source = useMedia((s) => s.source);

  const button =
    "flex h-10 w-10 touch-none items-center justify-center rounded-full bg-black/45 text-white/85 ring-1 ring-white/15 backdrop-blur-sm";

  return (
    /* A row, not a column. Stacked, these two reached down to y=236 on a
       375-point screen and the wheel starts at 217 — laid out sideways they
       are 88 wide instead of 88 tall, and they sit above it cleanly. */
    <div className="safe-right fixed top-[9.25rem] z-10 flex gap-2 select-none">
      <button
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={toggleMute}
        className={`${button} ${muted ? "text-amber-300" : ""}`}
      >
        <Icon name={muted ? "volumeOff" : "volume"} size={17} />
      </button>
      <button
        aria-label="Infotainment"
        onClick={() => setOpen(true)}
        className={button}
      >
        <Icon name={source === "radio" ? "radio" : "note"} size={17} />
      </button>
    </div>
  );
}

/**
 * The stereo tab: what is playing, and a way in for anyone who has not read
 * the key list. Sits above the speed readout so it is out of the way of
 * both the radar and the gauges.
 */
function StereoButton() {
  const source = useMedia((s) => s.source);
  const playing = nowPlaying(useMedia());
  const setOpen = useMedia((s) => s.setOpen);

  return (
    <button
      onClick={() => setOpen(true)}
      title="Infotainment (I)"
      className="fixed bottom-40 left-6 flex max-w-[230px] items-center gap-2.5 rounded-full bg-black/50 py-2 pl-2.5 pr-4 text-left text-white/85 ring-1 ring-white/[0.12] backdrop-blur-sm transition hover:bg-black/70"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: "#A8C7FA", color: "#0A2E58" }}
      >
        <Icon name={source === "radio" ? "radio" : "note"} size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] leading-tight">
          {source === "off" ? "Stereo" : playing.title}
        </span>
        <span className="block truncate text-[11px] leading-tight text-white/45">
          {source === "off" ? "Press I" : playing.subtitle || "Playing"}
        </span>
      </span>
    </button>
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
  compact,
}: {
  progress: number;
  nextName: string;
  nextDistanceM: number;
  compact: boolean;
}) {
  return (
    <div
      className={`pointer-events-none fixed left-1/2 -translate-x-1/2 select-none ${
        // Narrower on a phone, and higher, so it clears the radar that has
        // moved up into the top-right corner.
        compact ? "top-3 w-[min(250px,38vw)]" : "top-6 w-[min(460px,60vw)]"
      }`}
    >
      <div
        className={`flex items-baseline text-white/60 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)] ${
          compact ? "justify-center text-[11px]" : "justify-between text-xs"
        }`}
      >
        {/* The word "Journey" over a bar with a route on it says nothing the
            bar does not. It is the first thing to go when the screen is a
            hand wide, and the destination stays. */}
        {!compact && <span className="uppercase tracking-widest">Journey</span>}
        {nextName ? (
          <span className="truncate text-white/80">
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
