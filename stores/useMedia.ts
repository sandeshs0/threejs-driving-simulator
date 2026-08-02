import { create } from "zustand";
import {
  STATIONS,
  TRACKS,
  trackById,
  trackFile,
  type Track,
} from "@/lib/music/tracks";

/**
 * Infotainment state
 * ==================
 * Kept out of `useGame` on purpose. Everything in there is either mutated
 * per frame and deliberately non-reactive, or a tiny flag; this is the
 * opposite — reactive, changed by clicks, and read by React rather than by
 * useFrame. Mixing the two would mean the HUD re-rendering whenever someone
 * nudged the volume slider.
 *
 * `source` is what the head unit is currently doing. Only one at a time,
 * the way a car radio works:
 *
 *   off      silence
 *   radio    a station, played through the FM colouring
 *   music    a track from the library, clean
 *   youtube  an embedded player — the synthesizer stands down entirely,
 *            since the audio is coming from the iframe
 */
export type MediaSource = "off" | "radio" | "music" | "youtube";

interface MediaStore {
  open: boolean;
  source: MediaSource;
  /** Index into STATIONS. */
  station: number;
  trackId: string;
  /**
   * Follow the route: swap to the track written for wherever you are.
   * Coming through Dhading puts the Dhading song on by itself.
   */
  autoRegion: boolean;
  volume: number;
  youtubeUrl: string;
  youtubeId: string | null;
  youtubeTitle: string;

  /**
   * URLs that have failed this session — a station whose stream is down, a
   * track with no audio file on disk. Both fall back to the synthesizer,
   * and both are remembered so the browser is not asked twice.
   *
   * There is no manual switch for the fallback: it is a parachute, not a
   * feature, and choosing to fake a station you could hear for real is not
   * something anyone wants.
   */
  unavailable: string[];
  /** True while the browser is buffering. */
  buffering: boolean;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setSource: (source: MediaSource) => void;
  setStation: (index: number) => void;
  stepStation: (delta: number) => void;
  setTrack: (id: string) => void;
  stepTrack: (delta: number) => void;
  setAutoRegion: (on: boolean) => void;
  setVolume: (v: number) => void;
  setYoutube: (url: string, id: string | null) => void;
  markUnavailable: (url: string) => void;
  setBuffering: (on: boolean) => void;
}

export const useMedia = create<MediaStore>((set, get) => ({
  open: false,
  source: "music",
  station: 1, // Radio Nepal
  trackId: TRACKS[0].id,
  autoRegion: false,
  volume: 0.7,
  youtubeUrl: "",
  youtubeId: null,
  youtubeTitle: "",
  unavailable: [],
  buffering: false,

  toggleOpen: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),

  setSource: (source) => set({ source }),

  setStation: (index) =>
    set({
      station: ((index % STATIONS.length) + STATIONS.length) % STATIONS.length,
      source: "radio",
      buffering: false,
    }),
  stepStation: (delta) => get().setStation(get().station + delta),

  // Choosing a track by hand is an override: it turns off the automatic
  // region follow, or the next district would immediately undo the choice.
  setTrack: (id) => set({ trackId: id, source: "music", autoRegion: false }),
  stepTrack: (delta) => {
    const index = TRACKS.findIndex((t) => t.id === get().trackId);
    const next = (((index + delta) % TRACKS.length) + TRACKS.length) % TRACKS.length;
    get().setTrack(TRACKS[next].id);
  },

  setAutoRegion: (on) => set({ autoRegion: on }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  setYoutube: (url, id) =>
    set({
      youtubeUrl: url,
      youtubeId: id,
      youtubeTitle: id ? `YouTube · ${id}` : "",
      source: id ? "youtube" : get().source,
    }),

  markUnavailable: (url) =>
    set((s) =>
      s.unavailable.includes(url)
        ? s
        : { unavailable: [...s.unavailable, url], buffering: false }
    ),
  setBuffering: (on) => set({ buffering: on }),
}));

/**
 * The URL the media element should be playing, or null when the
 * synthesizer should take over.
 *
 * One function for both sources because only one thing plays at a time, and
 * because a station whose stream is down and a track with no file on disk
 * are the same situation wearing different clothes.
 */
export function mediaUrlFor(state: MediaStore): string | null {
  const url =
    state.source === "radio"
      ? STATIONS[state.station]?.stream
      : state.source === "music"
      ? trackFile(state.trackId)
      : null;

  if (!url) return null;
  return state.unavailable.includes(url) ? null : url;
}

/** Whether a station is currently reachable, for the station list. */
export const stationLive = (state: MediaStore, index: number) =>
  !state.unavailable.includes(STATIONS[index]?.stream ?? "");

/** Whether a track has a real recording on disk, for the library list. */
export const trackHasFile = (state: MediaStore, id: string) =>
  !state.unavailable.includes(trackFile(id));

/** What is playing right now, for the now-playing bar and the dash screen. */
export function nowPlaying(state: MediaStore): {
  title: string;
  subtitle: string;
  track: Track | null;
} {
  if (state.source === "off") {
    return { title: "Stereo off", subtitle: "", track: null };
  }
  if (state.source === "youtube") {
    return {
      title: state.youtubeId ? "YouTube" : "No link",
      subtitle: state.youtubeId ?? "Paste a link to play",
      track: null,
    };
  }
  if (state.source === "radio") {
    const station = STATIONS[state.station];
    const live = stationLive(state, state.station);
    const track = trackById(station.playlist[0]) ?? null;
    return {
      title: station.name,
      subtitle: live
        ? `${station.mhz.toFixed(1)} MHz · ${state.buffering ? "Tuning in" : "Live"}`
        : `${station.mhz.toFixed(1)} MHz${track ? ` · ${track.title}` : ""}`,
      track,
    };
  }

  const track = trackById(state.trackId) ?? null;
  return {
    title: track?.title ?? "—",
    subtitle: track
      ? `${track.artist}${trackHasFile(state, track.id) ? "" : " · Synthesized"}`
      : "",
    track,
  };
}
