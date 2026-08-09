"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  INPUT,
  TOUCH,
  calibrateTilt,
  enableTilt,
  enableWheel,
  releaseAll,
  setHorn,
  setThrottle,
  setWheelSteer,
  toggleInvert,
  useIsPortrait,
  useIsTouch,
  type SteerMode,
} from "@/lib/input";
import { useGame } from "@/stores/useGame";
import { useMedia } from "@/stores/useMedia";
import { Icon } from "./Icons";

/**
 * TouchControls
 * -------------
 * The pedals, the wheel and the horn — laid out the way they are in the car
 * rather than the way that is easiest to build.
 *
 * The wheel is on the right because this is a right-hand-drive car in a
 * keep-left country, which is the same reason the driver's eye in
 * `CONFIG.camera.eyeOffset` has a positive x. The pedals are on the left,
 * brake inboard of the accelerator, which is where they are in every car
 * ever built. And the horn is the middle of the wheel, because that is what
 * a horn is — not a button in a row of buttons.
 *
 * All of it is DOM rather than anything in the canvas: these are interface,
 * they need real hit targets and real labels, and putting them in the scene
 * would mean raycasting against a viewport moving at fifty metres a second.
 *
 * Nothing here re-renders while driving. Every control writes straight into
 * the `INPUT` singleton on pointerdown and pointerup, and `<Vehicle/>` reads
 * it once a frame. The React state in this file is which steering mode is
 * showing and whether the settings flyout is open — both of which change
 * when a button is pressed and at no other time.
 *
 * Pointer events, not touch events. One code path for finger, stylus and
 * mouse, and `setPointerCapture` is what makes a thumb sliding off the edge
 * of the throttle keep the throttle held rather than silently dropping it
 * mid-overtake.
 */

export function TouchControls() {
  const isTouch = useIsTouch();
  const portrait = useIsPortrait();
  const started = useGame((s) => s.started);
  const mapExpanded = useGame((s) => s.mapExpanded);
  const [mode, setMode] = useState<SteerMode>(TOUCH.mode);
  const [invert, setInvert] = useState(TOUCH.invert);
  const [settings, setSettings] = useState(false);
  /** Why tilt is unavailable, when it is. Empty when there is nothing to say. */
  const [tiltNote, setTiltNote] = useState("");
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const openStereo = useMedia((s) => s.setOpen);
  const stereoSource = useMedia((s) => s.source);

  // The overlay is mounted for the session; it must not hold a pedal down
  // through a tab switch or an incoming call.
  useEffect(() => {
    const drop = () => releaseAll();
    window.addEventListener("blur", drop);
    document.addEventListener("visibilitychange", drop);
    return () => {
      window.removeEventListener("blur", drop);
      document.removeEventListener("visibilitychange", drop);
      releaseAll();
    };
  }, []);

  // Whatever the start overlay negotiated with the sensor is settled by the
  // time this runs, so the initial mode comes from there rather than from a
  // guess made before the permission dialog was answered.
  useEffect(() => setMode(TOUCH.mode), [started]);

  if (!isTouch) return null;
  // Above the start overlay on purpose: there is no point reading the
  // controls list in an aspect ratio the game will not be played in.
  if (portrait) return <RotatePrompt />;
  if (!started || mapExpanded) return null;

  return (
    <>
      {/* ---------------- Left foot: the pedals ---------------- */}
      <div className="safe-bottom safe-left fixed z-30 flex items-end gap-3 select-none">
        <Pedal kind="brake" />
        <Pedal kind="gas" />
      </div>

      {/* ---------------- Right hand: the wheel ---------------- */}
      <div className="safe-bottom safe-right fixed z-30 select-none">
        <Wheel follow={mode === "tilt"} />
      </div>

      {/*
        What is left of the keyboard.

        Mute and the stereo used to be a column under the radar. On a
        320-point-tall screen — an iPhone SE on its side, once the browser
        chrome has taken its share — that column reached down into the top
        of the wheel and the wheel drew over both of them. Laid out here
        they cost no vertical space at all, and the middle of the screen is
        the one region neither the pedals nor the wheel wants.

        Four 40s and a 6-gap is 178 wide. On the narrowest phone in
        landscape the pedals end at 162 and the wheel starts at 410, so it
        fits with room either side rather than only just.
      */}
      <div className="safe-bottom fixed left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 select-none">
        <TapButton
          label="Camera"
          onTap={() => useGame.getState().cycleCamera()}
          className="h-10 w-10 rounded-full bg-black/45 ring-white/15"
        >
          <span className="text-[13px] font-semibold">C</span>
        </TapButton>

        <TapButton
          label={muted ? "Unmute" : "Mute"}
          onTap={toggleMute}
          className={`h-10 w-10 rounded-full bg-black/45 ring-white/15 ${
            muted ? "text-amber-300" : ""
          }`}
        >
          <Icon name={muted ? "volumeOff" : "volume"} size={17} />
        </TapButton>

        <TapButton
          label="Infotainment"
          onTap={() => openStereo(true)}
          className="h-10 w-10 rounded-full bg-black/45 ring-white/15"
        >
          <Icon name={stereoSource === "radio" ? "radio" : "note"} size={17} />
        </TapButton>

        <TapButton
          label="Steering settings"
          onTap={() => setSettings((open) => !open)}
          className={`h-10 w-10 rounded-full ring-white/15 ${
            settings ? "bg-white/30" : "bg-black/45"
          }`}
        >
          <span className="text-[15px] leading-none">⚙</span>
        </TapButton>
      </div>

      {settings && (
        <div className="safe-bottom fixed left-1/2 z-30 mb-14 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-black/75 p-2 ring-1 ring-white/15 backdrop-blur-sm select-none">
          <TapButton
            label="Switch steering method"
            onTap={() => {
              if (TOUCH.mode === "tilt") {
                enableWheel();
                setMode("wheel");
                setTiltNote("");
                return;
              }
              // Asking again rather than just assigning the mode: the first
              // attempt may have been refused, or made before the page was
              // on a secure origin. This press is itself the gesture iOS
              // wants, and the answer is reported rather than assumed.
              setTiltNote("Checking…");
              void enableTilt().then((ok) => {
                setMode(TOUCH.mode);
                setTiltNote(ok ? "" : "No motion data — needs HTTPS or a gyroscope");
              });
            }}
            className="h-10 rounded-xl bg-white/10 px-3.5 ring-white/20"
          >
            <span className="text-[12px] font-medium">
              {mode === "tilt" ? "Use wheel" : "Use tilt"}
            </span>
          </TapButton>

          {/* Tilt needs two things a wheel does not: somewhere to re-zero
              when you shift in your seat, and a way out when the axis comes
              back the wrong way round on this particular device. */}
          {mode === "tilt" && (
            <>
              <TapButton
                label="Centre the steering"
                onTap={calibrateTilt}
                className="h-10 rounded-xl bg-white/10 px-3.5 ring-white/20"
              >
                <span className="text-[12px] font-medium">Centre</span>
              </TapButton>
              <TapButton
                label="Reverse the tilt direction"
                onTap={() => {
                  toggleInvert();
                  setInvert(TOUCH.invert);
                }}
                className={`h-10 rounded-xl px-3.5 ring-white/20 ${
                  invert ? "bg-amber-300/30" : "bg-white/10"
                }`}
              >
                <span className="text-[12px] font-medium">Flip</span>
              </TapButton>
            </>
          )}
        </div>
      )}

      {settings && tiltNote && (
        <div className="safe-bottom pointer-events-none fixed left-1/2 z-30 mb-28 -translate-x-1/2 rounded-lg bg-black/80 px-3 py-1.5 text-[11px] text-amber-200/90 ring-1 ring-white/10">
          {tiltNote}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------- orientation

/**
 * Portrait gate.
 *
 * Not a nicety. The cabin view is framed for a wide aspect, and in portrait
 * the wheel and the pedals have to share one edge with each other and with
 * the speed. Every driving game on a phone does this, for this reason.
 */
function RotatePrompt() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center">
      <div className="h-16 w-24 animate-pulse rounded-lg border-2 border-white/50" />
      <p className="text-lg font-medium text-white/90">Turn your phone sideways</p>
      <p className="max-w-xs text-sm text-white/50">
        The drive is framed for landscape — the wheel and the pedals need an
        edge each.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ pedals

/**
 * A car pedal.
 *
 * Ribbed rubber pad in a chrome surround, hinged at the top and tipped away
 * from the viewer, sitting on the arm it is welded to. The brake is the
 * wide one and it is inboard of the accelerator, which is narrow and taller
 * — that is the real layout, and it is also the reason nobody needs the
 * labels after the first thirty seconds.
 *
 * Pressing it rotates the pad further away and drops it down its arm rather
 * than fading a background colour, because the thing being simulated is
 * travel. The shadow shortens at the same time, which is most of what sells
 * it.
 */
const PEDALS = {
  brake: { width: 78, height: 88, label: "Brake", rest: 16, pressed: 30 },
  gas: { width: 52, height: 104, label: "Gas", rest: 14, pressed: 27 },
} as const;

function Pedal({ kind }: { kind: keyof typeof PEDALS }) {
  const spec = PEDALS[kind];
  const pad = useRef<HTMLSpanElement>(null);

  const press = useCallback(
    (down: boolean) => {
      setThrottle(down ? (kind === "gas" ? 1 : -1) : 0);
      if (!pad.current) return;
      const tilt = down ? spec.pressed : spec.rest;
      pad.current.style.transform =
        `perspective(340px) rotateX(${tilt}deg) translateY(${down ? 4 : 0}px)`;
      pad.current.style.boxShadow = down
        ? "inset 0 0 0 2px #6f757c, 0 2px 4px rgba(0,0,0,0.55)"
        : "inset 0 0 0 2px #9aa2ab, 0 8px 14px rgba(0,0,0,0.5)";
    },
    [kind, spec]
  );

  return (
    <div className="flex flex-col items-center gap-1.5">
      <HoldButton bare label={spec.label} onChange={press} className="block">
        <span
          ref={pad}
          className="block rounded-md"
          style={{
            width: spec.width,
            height: spec.height,
            transformOrigin: "top center",
            transform: `perspective(340px) rotateX(${spec.rest}deg)`,
            boxShadow: "inset 0 0 0 2px #9aa2ab, 0 8px 14px rgba(0,0,0,0.5)",
            // Ribbed rubber. Real pedal pads are moulded with ridges for
            // grip, and the ridges are what stop this reading as a tile.
            backgroundImage:
              "repeating-linear-gradient(to bottom, #35383d 0 5px, #1c1e21 5px 11px)",
            transition: "transform 60ms ease-out, box-shadow 60ms ease-out",
          }}
        />
      </HoldButton>
      <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
        {spec.label}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ shared

/**
 * A button that reports being held rather than being clicked.
 *
 * `touch-none` is load-bearing: without it the browser spends a moment
 * deciding whether a press on the throttle was the start of a scroll, and
 * every input in the game arrives late.
 */
function HoldButton({
  label,
  className,
  children,
  onChange,
  stopPropagation = false,
  bare = false,
}: {
  label: string;
  className: string;
  children: React.ReactNode;
  onChange: (down: boolean) => void;
  stopPropagation?: boolean;
  /**
   * Skip the chrome. The pedals and the horn draw themselves completely and
   * would otherwise be fighting this component's ring and backdrop blur
   * with `ring-0` overrides — and which of two conflicting Tailwind
   * utilities wins depends on their order in the generated stylesheet, not
   * on the order they are written in the class attribute. Not a fight worth
   * having when the button can simply not add them.
   */
  bare?: boolean;
}) {
  const held = useRef(false);

  const press = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (stopPropagation) e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      held.current = true;
      onChange(true);
    },
    [onChange, stopPropagation]
  );

  const release = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    onChange(false);
  }, [onChange]);

  return (
    <button
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className={
        bare
          ? `touch-none ${className}`
          : `flex touch-none items-center justify-center text-white/90 ring-1 backdrop-blur-sm ${className}`
      }
    >
      {children}
    </button>
  );
}

function TapButton({
  label,
  onTap,
  className,
  children,
}: {
  label: string;
  onTap: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onTap();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex touch-none items-center justify-center text-white/90 ring-1 backdrop-blur-sm ${className}`}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------- wheel

const WHEEL_SIZE = 138;
/** Degrees of wheel rotation for full lock. */
const WHEEL_LOCK = 110;

/**
 * The wheel.
 *
 * **It always takes drags.** For a while it did not — in tilt mode it was an
 * instrument that mirrored the sensor and nothing else — and that turned a
 * silent sensor into a car with no steering at all, which is the worst
 * failure this interface can have. There is no reason the two have to be
 * exclusive: grab it and your hand owns the steering, let go and the tilt
 * takes it back. Whatever else is wrong, the wheel on the screen turns the
 * car.
 *
 * `follow` therefore says what happens when *nobody is holding it*: mirror
 * `INPUT.steer` so the tilt has an instrument to read on, or unwind to
 * centre so the wheel is the only source.
 *
 * The angle comes from the pointer's position *around* the centre, so a
 * thumb anywhere on the rim arcs it, and the grab point is wherever the
 * thumb landed. A horizontal-drag slider is easier to write and immediately
 * reads as a different control from the one drawn on the screen.
 *
 * Self-centring takes a few frames rather than snapping — a wheel that
 * returned instantly makes every corner exit a flick — and it clamps at the
 * stops instead of winding past them, because dead travel that has to be
 * unwound before the car responds feels exactly as broken as it sounds.
 */
function Wheel({ follow }: { follow: boolean }) {
  const rim = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  /** Pointer angle when the press started, less the wheel's angle then. */
  const grab = useRef(0);
  const angle = useRef(0);

  const paint = useCallback(() => {
    if (rim.current) rim.current.style.transform = `rotate(${angle.current}deg)`;
  }, []);

  useEffect(() => {
    let frame = 0;

    const tick = () => {
      frame = requestAnimationFrame(tick);

      // Held: the hand owns both the wheel and the steering.
      if (active.current !== null) return;

      // Let go, tilt driving: the wheel becomes the instrument again.
      if (follow) {
        angle.current = -INPUT.steer * WHEEL_LOCK;
        paint();
        return;
      }

      // Let go, wheel driving: unwind, still reporting on the way back.
      if (Math.abs(angle.current) < 0.4) {
        if (angle.current !== 0) {
          angle.current = 0;
          setWheelSteer(0);
          paint();
        }
        return;
      }
      angle.current *= 0.82;
      setWheelSteer(-clamp(angle.current / WHEEL_LOCK));
      paint();
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [follow, paint]);

  // Changing steering method must not strand a half-turn of lock.
  useEffect(() => {
    active.current = null;
    setWheelSteer(0);
  }, [follow]);

  const pointerAngle = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  };

  const release = () => {
    if (active.current === null) return;
    active.current = null;
    // Hand the steering straight back to the sensor rather than leaving the
    // last dragged value standing until the next reading lands.
    if (follow) setWheelSteer(0);
  };

  return (
    <div
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        grab.current = pointerAngle(e) - angle.current;
      }}
      onPointerMove={(e) => {
        if (active.current !== e.pointerId) return;
        const next = pointerAngle(e) - grab.current;
        angle.current = Math.max(-WHEEL_LOCK, Math.min(WHEEL_LOCK, next));
        setWheelSteer(-clamp(angle.current / WHEEL_LOCK));
        paint();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className="relative touch-none"
      style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
    >
      <div
        ref={rim}
        className="h-full w-full"
        style={{ willChange: "transform" }}
      >
        <WheelFace />
        {/* The horn is the hub, and it turns with the wheel like the real
            one does. Its press must not also start a steering drag, hence
            the stopped propagation. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <HoldButton
            bare
            stopPropagation
            label="Horn"
            onChange={setHorn}
            className="flex h-11 w-11 items-center justify-center rounded-full active:brightness-150"
          >
            <Star />
          </HoldButton>
        </div>
      </div>
    </div>
  );
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Three-spoke wheel: a leather rim with the light falling on the top of it,
 * spokes swept down from the horizontal, and a hub. SVG rather than stacked
 * divs because the rim is a stroked circle with a gradient along it, which
 * is one element here and about six there.
 */
function WheelFace() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <defs>
        <linearGradient id="wheel-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#54585e" />
          <stop offset="0.42" stopColor="#26282c" />
          <stop offset="1" stopColor="#111214" />
        </linearGradient>
        <linearGradient id="wheel-hub" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3d42" />
          <stop offset="1" stopColor="#17181b" />
        </linearGradient>
      </defs>

      {/* Rim */}
      <circle cx="50" cy="50" r="43" fill="none" stroke="url(#wheel-rim)" strokeWidth="10" />
      <circle cx="50" cy="50" r="47.6" fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth="1.4" />
      <circle cx="50" cy="50" r="38.4" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" />
      {/* The stitched seam that says leather rather than plastic */}
      <circle
        cx="50" cy="50" r="43" fill="none"
        stroke="rgba(226,214,190,0.35)" strokeWidth="0.8"
        strokeDasharray="2 3.4"
      />

      {/* Spokes, swept down off the horizontal */}
      <path d="M18 56 H82" stroke="url(#wheel-rim)" strokeWidth="8" strokeLinecap="round" />
      <path d="M50 58 V82" stroke="url(#wheel-rim)" strokeWidth="8" strokeLinecap="round" />

      {/* Hub */}
      <circle cx="50" cy="50" r="16" fill="url(#wheel-hub)" />
      <circle cx="50" cy="50" r="16" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />

      {/* Twelve o'clock marker. Without it a turning ring reads as static. */}
      <rect x="48.6" y="4.6" width="2.8" height="7" rx="1.2" fill="#e8b52c" />
    </svg>
  );
}

/** The three-pointed star, the same one that is in the car's grille. */
function Star() {
  return (
    <svg viewBox="0 0 40 40" className="h-7 w-7">
      <circle cx="20" cy="20" r="15" fill="none" stroke="#c9ced6" strokeWidth="2" />
      {[90, 210, 330].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1="20"
            y1="20"
            x2={20 + Math.cos(a) * 14}
            y2={20 - Math.sin(a) * 14}
            stroke="#c9ced6"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
