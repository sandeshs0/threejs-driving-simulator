"use client";

import { useEffect, useState } from "react";
import { STATIONS, TRACKS, youtubeId, type Track } from "@/lib/music/tracks";
import {
  nowPlaying,
  stationLive,
  trackHasFile,
  useMedia,
  type MediaSource,
} from "@/stores/useMedia";
import { useGame } from "@/stores/useGame";
import { Icon, type IconName } from "./Icons";

/**
 * Infotainment
 * ============
 * The head unit, built to Android Auto's actual design language rather than
 * to a vague impression of it.
 *
 * What that means in practice, and why each part is the way it is:
 *
 *  Navigation rail   A Material 3 rail down the left: 56dp targets, an
 *                    active *indicator pill* behind the icon rather than a
 *                    coloured icon, label under each. Android Auto is
 *                    driven at arm's length while moving, so the hit area
 *                    matters more than the density.
 *  Surfaces          Three flat greys — rail, panel, card — separated by
 *                    tone, not by shadow or glow. Automotive interfaces are
 *                    matte because gloss reflects a windscreen.
 *  One accent        M3 dark primary (#A8C7FA) with its container tone,
 *                    used only for state: what is selected, what is
 *                    playing. Nothing decorative is coloured.
 *  Type              One family, four sizes, tabular numerals on every
 *                    frequency so the dial does not jitter between 96.1
 *                    and 100.0.
 *  Icons             Material vectors, never emoji — see ./Icons.
 *
 * Opened with `I`, by the screen in the centre console, or the tab on the
 * HUD. Closed with `I` or Escape.
 *
 * Why the whole screen stays mounted
 * ----------------------------------
 * A car stereo does not stop playing when you look away from it, and an
 * iframe stops the moment React unmounts it. So the modal is never
 * unmounted — when closed it collapses to a clipped one-pixel box. The
 * YouTube player sits outside the tab switch for the same reason.
 */

/** Material 3 dark tokens, named so the intent survives the hex codes. */
const C = {
  scrim: "bg-black/75",
  rail: "bg-[#0E1013]",
  panel: "bg-[#16181D]",
  card: "bg-[#1E2126]",
  cardHover: "hover:bg-[#252931]",
  bar: "bg-[#101216]",
  hairline: "border-white/[0.07]",
  primary: "#A8C7FA",
  onPrimary: "#0A2E58",
  primaryContainer: "#284777",
  onPrimaryContainer: "#D6E3FF",
  onSurface: "text-[#E3E3E3]",
  onSurfaceVariant: "text-[#9BA1A6]",
};

const APPS: { id: MediaSource; label: string; icon: IconName }[] = [
  { id: "radio", label: "Radio", icon: "radio" },
  { id: "music", label: "Library", icon: "library" },
  { id: "youtube", label: "Video", icon: "video" },
];

const TITLES: Record<string, { eyebrow: string; title: string }> = {
  radio: { eyebrow: "FM", title: "Live radio" },
  music: { eyebrow: "On this device", title: "Library" },
  youtube: { eyebrow: "Stream", title: "Video" },
};

export function Infotainment() {
  const media = useMedia();
  const started = useGame((s) => s.started);
  const playing = nowPlaying(media);
  const [tab, setTab] = useState<MediaSource>("radio");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Someone typing a URL is not asking to close the stereo.
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      const typing = tag === "input" || tag === "textarea";

      if (e.code === "KeyI" && !typing) {
        e.preventDefault();
        useMedia.getState().toggleOpen();
      } else if (e.code === "Escape") {
        useMedia.getState().setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!started) return null;

  const heading = TITLES[tab] ?? TITLES.radio;
  const stopped = media.source === "off";

  return (
    <div
      className={
        media.open
          ? `fixed inset-0 z-30 flex items-center justify-center ${C.scrim} backdrop-blur-md`
          : // Clipped to nothing rather than unmounted, so whatever is
            // playing carries on playing.
            "pointer-events-none fixed bottom-0 left-0 z-30 h-px w-px overflow-hidden opacity-0"
      }
      aria-hidden={!media.open}
    >
      <div
        className={`flex h-[min(680px,90vh)] w-[min(1120px,94vw)] overflow-hidden rounded-[28px] ${C.panel} ${C.onSurface} shadow-[0_24px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.06]`}
      >
        {/* ---------------- Navigation rail ---------------- */}
        <nav
          className={`flex w-[96px] shrink-0 flex-col items-center gap-1 ${C.rail} py-6`}
        >
          {APPS.map((app) => (
            <RailButton
              key={app.id}
              icon={app.icon}
              label={app.label}
              active={tab === app.id}
              onClick={() => setTab(app.id)}
            />
          ))}

          <div className="mt-auto flex flex-col items-center gap-1">
            <RailButton
              icon="power"
              label={stopped ? "On" : "Off"}
              onClick={() =>
                useMedia.getState().setSource(stopped ? tab : "off")
              }
            />
            <RailButton
              icon="close"
              label="Close"
              onClick={() => useMedia.getState().setOpen(false)}
            />
          </div>
        </nav>

        {/* ---------------- Content ---------------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="px-8 pb-5 pt-7">
            <div
              className={`text-[11px] font-medium uppercase tracking-[0.14em] ${C.onSurfaceVariant}`}
            >
              {heading.eyebrow}
            </div>
            <h1 className="mt-1 text-[26px] font-normal leading-tight tracking-[-0.01em]">
              {heading.title}
            </h1>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
            {tab === "radio" && <RadioPane />}
            {tab === "music" && <MusicPane />}
            {tab === "youtube" && <YoutubePane />}

            {/* Outside the tab switch: changing tab must not remount the
                player any more than closing the screen does. */}
            <YoutubeFrame visible={tab === "youtube"} />
          </div>

          {/* ---------------- Now playing ---------------- */}
          <div
            className={`flex h-[104px] shrink-0 items-center gap-6 border-t ${C.hairline} ${C.bar} px-8`}
          >
            <ArtTile track={playing.track} source={media.source} />

            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">
                {playing.title}
              </div>
              <div className={`truncate text-[13px] ${C.onSurfaceVariant}`}>
                {playing.subtitle || "Nothing playing"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <TransportButton
                icon="previous"
                label="Previous"
                onClick={() =>
                  media.source === "radio"
                    ? media.stepStation(-1)
                    : media.stepTrack(-1)
                }
              />
              <button
                onClick={() => media.setSource(stopped ? tab : "off")}
                aria-label={stopped ? "Play" : "Stop"}
                className="flex h-14 w-14 items-center justify-center rounded-full transition hover:brightness-110 active:scale-95"
                style={{ backgroundColor: C.primary, color: C.onPrimary }}
              >
                <Icon name={stopped ? "play" : "pause"} size={26} />
              </button>
              <TransportButton
                icon="next"
                label="Next"
                onClick={() =>
                  media.source === "radio"
                    ? media.stepStation(1)
                    : media.stepTrack(1)
                }
              />
            </div>

            <div className="flex w-[168px] items-center gap-3">
              <Icon
                name="volume"
                size={20}
                className="shrink-0 text-[#9BA1A6]"
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={media.volume}
                onChange={(e) => media.setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[#A8C7FA]"
                style={{ accentColor: C.primary }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- primitives

/**
 * A rail destination. The active state is an indicator pill behind the
 * icon, which is how Material 3 marks selection — recolouring the glyph
 * alone is not enough contrast to read while moving.
 */
function RailButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col items-center gap-1 py-2"
    >
      <span
        className={`flex h-8 w-14 items-center justify-center rounded-2xl transition ${
          active ? "" : "group-hover:bg-white/[0.07]"
        }`}
        style={
          active
            ? { backgroundColor: C.primaryContainer, color: C.onPrimaryContainer }
            : undefined
        }
      >
        <Icon
          name={icon}
          size={22}
          className={active ? "" : "text-[#9BA1A6] group-hover:text-[#E3E3E3]"}
        />
      </span>
      <span
        className={`text-[11px] leading-none ${
          active ? "text-[#D6E3FF]" : "text-[#9BA1A6]"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function TransportButton({
  icon,
  label,
  onClick,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full text-[#C7CBD1] transition hover:bg-white/[0.08] active:scale-95"
    >
      <Icon name={icon} size={24} />
    </button>
  );
}

/**
 * Album art stands in for a cover image there is no file for: a flat tile
 * in the track's own colour with the note glyph. Flat and tonal rather than
 * a gradient, so it reads as a placeholder rather than as decoration.
 */
function ArtTile({
  track,
  source,
}: {
  track: Track | null;
  source: MediaSource;
}) {
  const icon: IconName =
    source === "radio" ? "radio" : source === "youtube" ? "video" : "note";

  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: track ? track.from : "#2A2E35" }}
    >
      <Icon name={icon} size={22} className="text-white/85" />
    </div>
  );
}

// ------------------------------------------------------------- the panes

function RadioPane() {
  const media = useMedia();

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {STATIONS.map((s, i) => {
          const active = media.source === "radio" && media.station === i;
          const dead = !stationLive(media, i);
          const tuning = active && media.buffering && !dead;

          return (
            <button
              key={s.mhz}
              onClick={() => media.setStation(i)}
              className={`rounded-2xl px-5 py-4 text-left transition ${
                active ? "" : `${C.card} ${C.cardHover} ring-1 ring-white/[0.05]`
              }`}
              style={
                active
                  ? {
                      backgroundColor: C.primaryContainer,
                      color: C.onPrimaryContainer,
                    }
                  : undefined
              }
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-normal leading-none tabular-nums tracking-tight">
                  {s.mhz.toFixed(1)}
                </span>
                <span
                  className={`text-[12px] ${
                    active ? "text-[#D6E3FF]/60" : "text-[#9BA1A6]"
                  }`}
                >
                  MHz
                </span>
              </div>

              <div className="mt-2 truncate text-[15px] font-medium">
                {s.name}
              </div>
              <div
                className={`truncate text-[12px] ${
                  active ? "text-[#D6E3FF]/60" : "text-[#9BA1A6]"
                }`}
              >
                {s.place}
              </div>

              <div className="mt-3 flex h-4 items-center gap-1.5">
                {dead ? (
                  <span className="text-[11px] uppercase tracking-[0.1em] text-amber-300/80">
                    Unavailable
                  </span>
                ) : (
                  <>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        tuning ? "bg-amber-300" : "bg-[#7EE2A8]"
                      }`}
                    />
                    <span
                      className={`text-[11px] uppercase tracking-[0.1em] ${
                        active ? "text-[#D6E3FF]/75" : "text-[#9BA1A6]"
                      }`}
                    >
                      {tuning ? "Tuning" : "Live"}
                    </span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className={`mt-7 max-w-[62ch] text-[12px] leading-relaxed ${C.onSurfaceVariant}`}>
        Every station here is the real broadcast, taken from the station&apos;s
        own public stream. If one drops out the car falls back to a
        synthesized signal on that frequency rather than going silent.
      </p>
    </div>
  );
}

function MusicPane() {
  const media = useMedia();

  return (
    <div>
      <label className="mb-4 flex w-fit cursor-pointer items-center gap-3 rounded-full bg-white/[0.05] py-2 pl-3 pr-4 text-[13px] transition hover:bg-white/[0.09]">
        <input
          type="checkbox"
          checked={media.autoRegion}
          onChange={(e) => media.setAutoRegion(e.target.checked)}
          className="h-4 w-4 cursor-pointer"
          style={{ accentColor: C.primary }}
        />
        Follow the route
      </label>

      <div className="overflow-hidden rounded-2xl">
        {TRACKS.map((t, i) => {
          const active = media.source === "music" && media.trackId === t.id;
          // Unknown until it has been tried once, so an untouched library
          // does not claim every track is a recording.
          const real = trackHasFile(media, t.id);
          return (
            <button
              key={t.id}
              onClick={() => media.setTrack(t.id)}
              className={`flex w-full items-center gap-4 px-4 py-3 text-left transition ${
                active ? "" : "hover:bg-white/[0.05]"
              } ${i > 0 ? "border-t border-white/[0.04]" : ""}`}
              style={
                active
                  ? {
                      backgroundColor: C.primaryContainer,
                      color: C.onPrimaryContainer,
                    }
                  : undefined
              }
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: t.from }}
              >
                <Icon
                  name={active ? "signal" : "note"}
                  size={20}
                  className="text-white/85"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">
                  {t.title}
                </span>
                <span
                  className={`block truncate text-[12px] ${
                    active ? "text-[#D6E3FF]/65" : "text-[#9BA1A6]"
                  }`}
                >
                  {t.artist} · {real ? t.note : "Synthesized — no audio file"}
                </span>
              </span>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] ${
                  active ? "bg-black/20 text-[#D6E3FF]/80" : "bg-white/[0.06] text-[#9BA1A6]"
                }`}
              >
                {t.region === "any" ? "Anywhere" : t.region}
              </span>
            </button>
          );
        })}
      </div>

      <div className={`mt-7 max-w-[64ch] space-y-2 text-[12px] leading-relaxed ${C.onSurfaceVariant}`}>
        <p>
          With <span className="text-[#E3E3E3]">Follow the route</span> on,
          the stereo changes with the journey; choosing a track by hand turns
          that off.
        </p>
        <p>
          A track plays its real recording when there is an audio file in{" "}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-[#C7CBD1]">
            public/music
          </code>
          . Without one it falls back to the car&apos;s synthesizer — an
          arrangement in the right idiom, not a transcription.
        </p>
      </div>
    </div>
  );
}

function YoutubePane() {
  const media = useMedia();
  const [draft, setDraft] = useState(media.youtubeUrl);
  const [error, setError] = useState("");

  const load = () => {
    const id = youtubeId(draft);
    if (!id) {
      setError("That does not look like a YouTube link.");
      return;
    }
    setError("");
    media.setYoutube(draft, id);
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // The game listens on window for the driving keys; stop the car
            // pulling away because someone typed a URL with a "w" in it.
            e.stopPropagation();
            if (e.key === "Enter") load();
          }}
          placeholder="Paste a YouTube link"
          className={`min-w-0 flex-1 rounded-xl ${C.card} px-4 py-3.5 text-[14px] outline-none ring-1 ring-white/[0.07] placeholder:text-[#6B7076] focus:ring-2`}
          style={{ ["--tw-ring-color" as string]: C.primary }}
        />
        <button
          onClick={load}
          className="rounded-xl px-6 text-[14px] font-medium transition hover:brightness-110 active:scale-[0.98]"
          style={{ backgroundColor: C.primary, color: C.onPrimary }}
        >
          Play
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] text-[#F2B8B5]">{error}</p>}

      {!media.youtubeId && (
        <p className={`mt-6 max-w-[62ch] text-[12px] leading-relaxed ${C.onSurfaceVariant}`}>
          A watch link, a youtu.be short link or a bare video id. Playback
          continues when this screen is closed. YouTube&apos;s own volume
          applies — the stereo slider does not reach inside the player.
        </p>
      )}
    </div>
  );
}

/**
 * The one and only YouTube element. Mounted as soon as a video is loaded
 * and never taken down — only resized out of the way.
 */
function YoutubeFrame({ visible }: { visible: boolean }) {
  const id = useMedia((s) => s.youtubeId);
  const source = useMedia((s) => s.source);
  if (!id || source !== "youtube") return null;

  return (
    <div
      className={
        visible
          ? "mt-5 overflow-hidden rounded-2xl ring-1 ring-white/[0.07]"
          : "h-px w-px overflow-hidden opacity-0"
      }
    >
      <iframe
        title="YouTube"
        className={visible ? "aspect-video w-full" : "h-px w-px"}
        src={`https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1`}
        allow="autoplay; encrypted-media"
        allowFullScreen
      />
    </div>
  );
}
