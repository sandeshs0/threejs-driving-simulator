"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { AudioEngine } from "@/lib/audio/AudioEngine";
import { MusicEngine } from "@/lib/audio/MusicEngine";
import { Controls, UPDATE_ORDER } from "@/lib/controls";
import { stageAt } from "@/lib/journey";
import { STATIONS, trackById, trackForRegion } from "@/lib/music/tracks";
import { sFromZ } from "@/lib/road";
import { useGame } from "@/stores/useGame";
import { mediaUrlFor, useMedia } from "@/stores/useMedia";

/**
 * AudioSystem
 * -----------
 * Owns both synthesizers' lifecycles: the car — engine, tyres, wind, horn —
 * and the stereo. Browsers only allow audio to start from a user gesture,
 * so it waits for the `started` flag that the start overlay sets on click.
 *
 * The stereo hangs off the car's AudioContext rather than opening one of
 * its own, so the mute key silences everything and there is only ever one
 * clock and one output stream.
 *
 * This component also drives the region follow. It is the right home for
 * it despite being about audio: it already has a per-frame tick and the
 * player's position, and the alternative — putting it in the modal — would
 * mean the music only followed the route while the modal was open.
 */
export function AudioSystem() {
  const engineRef = useRef<AudioEngine | null>(null);
  const musicRef = useRef<MusicEngine | null>(null);
  const started = useGame((s) => s.started);
  const [, getKeys] = useKeyboardControls<Controls>();

  /** What the stereo is currently set to, so changes can be detected. */
  const applied = useRef({
    source: "",
    trackId: "",
    station: -1,
    volume: -1,
    /** The live stream URL in force, or "" for the synthesized path. */
    live: "",
  });

  useEffect(() => {
    if (!started) return;

    const engine = new AudioEngine();
    engineRef.current = engine;

    let cancelled = false;
    void engine.start().then(() => {
      const context = engine.context;
      const bus = engine.mediaBus;
      if (cancelled || !context || !bus) return;
      musicRef.current = new MusicEngine(context, bus);
    });

    // Suspending on tab-hide avoids an engine droning in a background tab.
    const onVisibility = () => {
      if (document.hidden) engine.update(useGame.getState().vehicle, 0, false, true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      musicRef.current?.dispose();
      musicRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, [started]);

  useFrame((_, dt) => {
    const engine = engineRef.current;
    if (!engine?.isRunning) return;

    const { vehicle, muted } = useGame.getState();
    engine.update(vehicle, dt, getKeys().horn, muted || document.hidden);

    const music = musicRef.current;
    if (!music) return;

    const media = useMedia.getState();

    // ---- Follow the route ----
    // Only while the library is playing and nothing has been chosen by
    // hand: a manual pick is an instruction, not a suggestion.
    if (media.autoRegion && media.source === "music") {
      const wanted = trackForRegion(stageAt(sFromZ(vehicle.position.z)));
      if (wanted.id !== media.trackId) {
        useMedia.setState({ trackId: wanted.id });
      }
    }

    // ---- Push any change down to the synthesizer ----
    // Anything with a real URL behind it — a live broadcast, a track file —
    // is handled by <MediaPlayer/>'s media element, so the synthesizer has
    // to stand down for it exactly the way it does for YouTube. Otherwise
    // the two play over each other.
    const url = mediaUrlFor(media);

    const state = applied.current;
    const changed =
      state.source !== media.source ||
      state.trackId !== media.trackId ||
      state.station !== media.station ||
      state.live !== (url ?? "");

    if (state.volume !== media.volume) {
      music.setVolume(media.volume);
      state.volume = media.volume;
    }
    if (!changed) return;

    const stationChanged = state.station !== media.station && state.station !== -1;
    state.source = media.source;
    state.trackId = media.trackId;
    state.station = media.station;
    state.live = url ?? "";

    if (media.source === "off" || media.source === "youtube") {
      // YouTube supplies its own audio; the synth gets out of the way.
      music.setRadio(false);
      music.stop();
      return;
    }

    if (url) {
      // A real broadcast or a real recording is playing. Keep the static
      // burst when the dial moves — it should still feel like a dial — but
      // nothing else.
      music.setRadio(false);
      music.stop();
      if (media.source === "radio" && stationChanged) music.tuningNoise(0.25);
      return;
    }

    // Nothing real to play: the synthesizer stands in.
    if (media.source === "radio") {
      const station = STATIONS[media.station];
      const track = trackById(station.playlist[0]);
      music.setRadio(true, station.character);
      if (stationChanged) music.tuningNoise();
      if (track) music.play(track);
      return;
    }

    music.setRadio(false);
    const track = trackById(media.trackId);
    if (track) music.play(track);
  }, UPDATE_ORDER.audio);

  return null;
}
