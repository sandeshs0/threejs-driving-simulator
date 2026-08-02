import type { Stage } from "../journey";

/**
 * The music library
 * =================
 *
 * Nothing in this project is a recording, and the stereo is no exception.
 * These are *arrangements as data* — a melody line, a bass line, a taal —
 * played live by the synthesizer in `MusicEngine`. That keeps the promise
 * the rest of the project makes (no asset downloads, everything responds to
 * state) and it is the only way to ship music with a game that has no
 * licence to ship music.
 *
 * Be clear about what that means: the traditional tunes below are written
 * in the right idiom — the right scale, the right taal, a melodic shape
 * that goes where the song goes — but they are *my arrangements from
 * memory, not transcriptions*, and a Nepali listener will hear the
 * difference immediately. That is exactly why the infotainment has a
 * YouTube tab: for the actual recording, paste the actual recording.
 *
 * Scales are semitone offsets from the track root. Most of the folk
 * material sits on a pentatonic frame, which is why the melodies read as
 * Nepali rather than as generic synth noodling.
 */

/** [semitone offset from root, length in beats]. null is a rest. */
export type Phrase = [number | null, number][];

/**
 * Taal — what the madal plays underneath.
 *
 *  jhyaure  the 6/8 lilt of most hill folk song; the thing that makes
 *           "Resham Firiri" sound like Resham Firiri
 *  khyali   a steady 4/4
 *  sparse   almost nothing, for the ambient pieces
 */
export type Taal = "jhyaure" | "khyali" | "sparse";

export interface Track {
  id: string;
  title: string;
  artist: string;
  /** Where on the route this belongs, for the auto-by-region mode. */
  region: Stage | "any";
  /** MIDI note of the tonic. */
  root: number;
  bpm: number;
  taal: Taal;
  melody: Phrase;
  bass: Phrase;
  /** Card gradient in the UI. */
  from: string;
  to: string;
  /** Shown under the title. Honesty, in the interface rather than a README. */
  note: string;
  /**
   * Filename in `public/music`, when it is not the default `<id>.mp3` —
   * an `.m4a`, or anything else the browser can decode.
   */
  file?: string;
}

export const TRACKS: Track[] = [
  {
    id: "dhading",
    title: "Dhading Jilla Baireni Ghar",
    artist: "Traditional · Dhading",
    region: "hills",
    root: 62, // D
    bpm: 104,
    taal: "jhyaure",
    melody: [
      [7, 0.5], [9, 0.5], [7, 0.5], [4, 0.5], [2, 1], [0, 1],
      [4, 0.5], [7, 0.5], [9, 1], [7, 0.5], [4, 0.5], [2, 1],
      [0, 0.5], [2, 0.5], [4, 1], [7, 1], [9, 1.5], [null, 0.5],
      [7, 0.5], [9, 0.5], [11, 1], [9, 0.5], [7, 0.5], [4, 1],
      [2, 0.5], [4, 0.5], [2, 1], [0, 2], [null, 1],
    ],
    bass: [
      [0, 2], [7, 1], [0, 1], [5, 2], [7, 2],
      [0, 2], [4, 1], [7, 1], [0, 3], [null, 1],
    ],
    from: "#2f6f5e",
    to: "#1d4a3e",
    note: "Traditional folk · Dhading",
    file: "dhading.m4a",
  },
  {
    id: "deuralidada",
    title: "Deurali Dada",
    artist: "Traditional · hills",
    region: "descent",
    root: 59, // B
    bpm: 96,
    taal: "jhyaure",
    // Only ever heard if the recording goes missing.
    melody: [
      [0, 1], [4, 0.5], [7, 0.5], [9, 1], [7, 1],
      [4, 0.5], [2, 0.5], [0, 2], [null, 1],
      [7, 0.5], [9, 0.5], [11, 1], [9, 0.5], [7, 0.5], [4, 1],
      [2, 0.5], [4, 0.5], [7, 1.5], [4, 0.5], [2, 1], [0, 2], [null, 1],
    ],
    bass: [[0, 3], [7, 3], [5, 2], [7, 1], [0, 3], [4, 1], [7, 2]],
    from: "#7c5a2c",
    to: "#402d13",
    note: "Traditional folk · the ridge road",
    file: "deuralidada.m4a",
  },
];

export const trackById = (id: string) => TRACKS.find((t) => t.id === id);

/**
 * Where a track's real recording lives.
 *
 * Convention first — `public/music/<id>.mp3` plays with no code change —
 * with `file` as the override for anything that is not an mp3. The
 * alternative, a JSON manifest kept in step with the folder by hand,
 * drifts the first time someone renames something and then you have a
 * silent track with no obvious cause.
 *
 * A track with no file on disk simply 404s once, is remembered, and falls
 * back to the synthesized arrangement.
 */
export function trackFile(id: string): string {
  const track = trackById(id);
  return `/music/${track?.file ?? `${id}.mp3`}`;
}

/**
 * FM stations.
 *
 * Real frequencies for real Nepali stations, because the dial is half the
 * pleasure of a radio and inventing them would make it a toy.
 *
 * Where a station publishes a live stream over HTTPS, `stream` holds the
 * verified endpoint and the radio plays **the actual broadcast** — an
 * ordinary <audio> element pointed at the same URL the station's own web
 * player uses. Where it does not, the synthesized playlist stands in.
 *
 * Three things to know about the live path, all of which the UI surfaces
 * rather than hiding:
 *
 *  - It must be HTTPS or a browser on an HTTPS page blocks it as mixed
 *    content. Every URL below was checked and returns audio over TLS.
 *  - It cannot go through the AudioContext. `createMediaElementSource`
 *    needs CORS headers that broadcast servers do not send, so volume and
 *    mute are applied to the media element directly instead of through the
 *    master gain.
 *  - Endpoints rot. When one fails the station falls back to its
 *    synthesized playlist and says so, rather than going silent.
 */
export interface Station {
  mhz: number;
  name: string;
  /** Where the station broadcasts from, for the station list. */
  place: string;
  /** Verified live stream. Every station in the list has one. */
  stream: string;
  /**
   * Synthesized stand-in, used only when the live stream fails. Not a
   * feature — a parachute, so a dead endpoint is quiet static rather than
   * a dead radio.
   */
  playlist: string[];
  /** Colouring for that fallback: `talk` gets a narrower, rougher band. */
  character: "music" | "talk";
}

/**
 * Every station here streams live over HTTPS and was checked to return
 * audio. Stations that publish no public stream are not listed at all —
 * a dial full of frequencies that only play synthesized filler is a toy,
 * and worse, it is a toy that pretends to be a radio.
 */
export const STATIONS: Station[] = [
  {
    mhz: 96.1,
    name: "Kantipur FM",
    place: "Kathmandu",
    stream: "https://radio-broadcast.ekantipur.com/stream",
    playlist: ["dhading", "deuralidada"],
    character: "music",
  },
  {
    mhz: 100.0,
    name: "Radio Nepal",
    place: "National service",
    stream: "https://stream1.radionepal.gov.np/live",
    playlist: ["dhading", "deuralidada"],
    character: "talk",
  },
  {
    mhz: 103.0,
    name: "Radio Nepal Bagmati",
    place: "Bagmati province",
    stream: "https://stream1.radionepal.gov.np/live/?station=pradesh3",
    playlist: ["dhading", "deuralidada"],
    character: "talk",
  },
  {
    mhz: 104.6,
    name: "Radio Nepal Gandaki",
    place: "Gandaki province",
    stream: "https://stream1.radionepal.gov.np/live/?station=pradesh4",
    playlist: ["dhading", "deuralidada"],
    character: "talk",
  },
];

/**
 * The track this stretch of the route wants.
 *
 * Region-specific first — coming down the Prithvi Highway through Dhading
 * should put the Dhading song on — then anything marked `any`.
 */
export function trackForRegion(region: Stage): Track {
  return (
    TRACKS.find((t) => t.region === region) ??
    TRACKS.find((t) => t.region === "any") ??
    TRACKS[0]
  );
}

/**
 * Pull a YouTube video id out of whatever the user pasted.
 *
 * Handles the four shapes people actually paste: a full watch URL, a
 * youtu.be short link, an /embed/ URL, and a bare id.
 */
export function youtubeId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^[\w-]{11}$/.test(text)) return text;

  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}
