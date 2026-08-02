"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { AudioEngine } from "@/lib/audio/AudioEngine";
import { Controls, UPDATE_ORDER } from "@/lib/controls";
import { useGame } from "@/stores/useGame";

/**
 * AudioSystem
 * -----------
 * Owns the synthesizer's lifecycle and feeds it the vehicle state once per
 * frame. Browsers only allow audio to start from a user gesture, so it
 * waits for the `started` flag that the start overlay sets on click.
 */
export function AudioSystem() {
  const engineRef = useRef<AudioEngine | null>(null);
  const started = useGame((s) => s.started);
  const [, getKeys] = useKeyboardControls<Controls>();

  useEffect(() => {
    if (!started) return;

    const engine = new AudioEngine();
    engineRef.current = engine;
    void engine.start();

    // Suspending on tab-hide avoids an engine droning in a background tab.
    const onVisibility = () => {
      if (document.hidden) engine.update(useGame.getState().vehicle, 0, false, true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      engine.dispose();
      engineRef.current = null;
    };
  }, [started]);

  useFrame((_, dt) => {
    const engine = engineRef.current;
    if (!engine?.isRunning) return;

    const { vehicle, muted } = useGame.getState();
    engine.update(vehicle, dt, getKeys().horn, muted || document.hidden);
  }, UPDATE_ORDER.audio);

  return null;
}
