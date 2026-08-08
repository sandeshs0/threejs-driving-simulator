"use client";

import { useEffect, useState } from "react";
import { TOUCH, detectTouch, loadTouchSettings, requestTilt, useIsTouch } from "@/lib/input";
import { useGame } from "@/stores/useGame";

/**
 * StartOverlay
 * ------------
 * Title card shown until the player taps.
 *
 * That tap is the only user gesture the game is guaranteed to get, and two
 * different browser permissions hang off it. An AudioContext may not start
 * without one — that was always true here. And on iOS 13 and later,
 * DeviceOrientation may not be *requested* without one either, so if the
 * sensor is not asked for from inside this handler there is no second
 * chance and the phone can never steer.
 *
 * Which is why `start()` is called last rather than first. The permission
 * dialog is modal and can sit there for several seconds; dropping the
 * player into the driving seat behind it would mean a car rolling down a
 * hill they cannot see, let alone steer.
 */
export function StartOverlay() {
  const started = useGame((s) => s.started);
  const start = useGame((s) => s.start);
  const isTouch = useIsTouch();
  const [asking, setAsking] = useState(false);

  // Before anything is drawn, so the card shows the right control list.
  useEffect(() => {
    detectTouch();
    loadTouchSettings();
  }, []);

  if (started) return null;

  const begin = async () => {
    if (asking) return;
    setAsking(true);

    const audio = document.getElementById("main-media-player") as HTMLAudioElement;
    audio?.play().catch(() => {});

    // Refused, unsupported, or simply not a phone — `requestTilt` falls
    // back to the wheel on every one of those paths, so there is nothing
    // to handle here beyond waiting for the answer.
    if (TOUCH.available) await requestTilt();

    start();
  };

  return (
    <div
      onClick={begin}
      className="fixed inset-0 z-20 flex cursor-pointer flex-col items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
    >
      <h1 className="text-center text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Driving Simulator
      </h1>
      <p className="mt-3 text-center text-white/60">
        {asking
          ? "Allow motion access to steer by tilting…"
          : isTouch
            ? "Tap anywhere to start the engine"
            : "Click anywhere to start the engine"}
      </p>

      {isTouch ? (
        <div className="mt-8 grid grid-cols-[auto_auto] gap-x-5 gap-y-2 text-sm text-white/70">
          <span className="text-white/90">Tilt</span>
          <span>Steer — or switch to the on-screen wheel</span>
          <span className="text-white/90">Gas / Brake</span>
          <span>Bottom right</span>
          <span className="text-white/90">Centre</span>
          <span>Re-zero the tilt to how you are holding it</span>
          <span className="text-white/90">Flip</span>
          <span>If tilting left steers right</span>
          <span className="text-white/90">Drag</span>
          <span>Look around the cabin</span>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-[auto_auto] gap-x-6 gap-y-2 text-sm text-white/70">
          <span className="font-mono text-white/90">W</span>
          <span>Accelerate</span>
          <span className="font-mono text-white/90">S</span>
          <span>Brake / reverse</span>
          <span className="font-mono text-white/90">A / D</span>
          <span>Steer</span>
          <span className="font-mono text-white/90">C</span>
          <span>Camera: driver → chase → cinematic</span>
          <span className="font-mono text-white/90">H</span>
          <span>Horn</span>
          <span className="font-mono text-white/90">M</span>
          <span>Mute</span>
          <span className="font-mono text-white/90">Tab</span>
          <span>Map</span>
          <span className="font-mono text-white/90">I</span>
          <span>Infotainment — radio, music, YouTube</span>
          <span className="font-mono text-white/90">T / K / L</span>
          <span>Time of day · weather · headlights</span>
          <span className="font-mono text-white/90">Mouse</span>
          <span>Look around the cabin</span>
        </div>
      )}
    </div>
  );
}
