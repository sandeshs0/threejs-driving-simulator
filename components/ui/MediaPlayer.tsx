"use client";

import { useEffect, useRef } from "react";
import { useGame } from "@/stores/useGame";
import { mediaUrlFor, useMedia } from "@/stores/useMedia";

/**
 * MediaPlayer
 * -----------
 * The one media element in the car. It plays two things that turn out to be
 * the same thing:
 *
 *  a live FM stream — the station's own public broadcast URL
 *  a track file     — an audio file the player has dropped into
 *                     `public/music/<id>.mp3`
 *
 * Both are a URL handed to an <audio> element, both fall back to the
 * synthesizer when they fail, and only one can play at a time. Two
 * components would have meant two elements, two sets of failure handling
 * and a way for both to play at once.
 *
 * Why an element and not the AudioContext
 * ---------------------------------------
 * Routing through Web Audio needs `createMediaElementSource`, which needs
 * CORS headers broadcast servers do not send. A media element has no such
 * requirement, so volume and mute are applied to the element directly
 * rather than through the engine's master gain.
 *
 * Failure is routine, not exceptional. A stream endpoint moves; an mp3 is
 * simply not there because the player never added one. Either way the URL
 * is marked unavailable for the session and the synthesizer takes over —
 * which is why a fresh clone of this repo with an empty `public/music`
 * still has a working stereo.
 *
 * The element is mounted for the life of the session and only its `src`
 * changes. Remounting per track would restart buffering every time, which
 * on a live stream is a two-second hole in the audio.
 */
export function MediaPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const started = useGame((s) => s.started);
  const muted = useGame((s) => s.muted);

  // Subscribed individually so the effect below re-runs on exactly the
  // changes that alter which URL should be playing.
  const source = useMedia((s) => s.source);
  const station = useMedia((s) => s.station);
  const trackId = useMedia((s) => s.trackId);
  const unavailable = useMedia((s) => s.unavailable);
  const volume = useMedia((s) => s.volume);

  const url = mediaUrlFor({
    ...useMedia.getState(),
    source,
    station,
    trackId,
    unavailable,
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!url) {
      audio.removeAttribute("src");
      audio.load();
      useMedia.getState().setBuffering(false);
      return;
    }

    // Assigning the same src again would restart it mid-song.
    if (audio.getAttribute("src") === url) return;
    audio.setAttribute("src", url);
    audio.load();
    useMedia.getState().setBuffering(true);

    // Autoplay is allowed here: the player clicked to start the engine and
    // clicked again to choose this.
    void audio.play().catch((err) => {
      if (err.name !== "NotAllowedError") {
        useMedia.getState().markUnavailable(url);
      }
    });
  }, [url]);

  // Volume and mute live on the element, since this never reaches the
  // AudioContext where the master gain is.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  return (
    <audio
      id="main-media-player"
      ref={audioRef}
      preload="auto"
      autoPlay
      // A broadcast never ends; a track does, and then the library moves on.
      onEnded={() => {
        const state = useMedia.getState();
        if (state.source === "music") {
          if (state.trackId === "deuralidada") {
            state.setStation(1);
          } else {
            state.stepTrack(1);
          }
        }
      }}
      onPlaying={() => useMedia.getState().setBuffering(false)}
      onWaiting={() => useMedia.getState().setBuffering(true)}
      onStalled={() => useMedia.getState().setBuffering(true)}
      onError={() => {
        if (url) useMedia.getState().markUnavailable(url);
      }}
      className="hidden"
    />
  );
}
