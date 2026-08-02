"use client";

import { useGame } from "@/stores/useGame";

/**
 * StartOverlay
 * ------------
 * Title card shown until the player clicks. The click doubles as the user
 * gesture browsers require before an AudioContext may start, so this is
 * what unblocks the engine sound.
 */
export function StartOverlay() {
  const started = useGame((s) => s.started);
  const start = useGame((s) => s.start);

  if (started) return null;

  return (
    <div
      onClick={() => {
        start();
        const audio = document.getElementById("main-media-player") as HTMLAudioElement;
        if (audio) {
          audio.play().catch(() => {});
        }
      }}
      className="fixed inset-0 z-20 flex cursor-pointer flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <h1 className="text-5xl font-semibold tracking-tight text-white">
        Driving Simulator
      </h1>
      <p className="mt-3 text-white/60">Click anywhere to start the engine</p>

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
        <span className="font-mono text-white/90">Mouse</span>
        <span>Look around the cabin</span>
      </div>
    </div>
  );
}
