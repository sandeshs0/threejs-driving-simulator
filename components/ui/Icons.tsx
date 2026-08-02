"use client";

/**
 * Icons
 * -----
 * Material Symbols path data, drawn inline.
 *
 * Emoji would be quicker and would look like emoji: they inherit the
 * platform's own glyph set, so the same interface renders as flat vectors
 * on one machine and glossy 3D blobs on another, at sizes and baselines
 * nobody controls. A car interface has to be legible at a glance and
 * consistent everywhere, which means real vectors on a 24px grid.
 *
 * Every path here is standard Material geometry so the set is visually
 * coherent — same optical weight, same corner treatment, same grid.
 */

export type IconName =
  | "radio"
  | "library"
  | "video"
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "close"
  | "power"
  | "volume"
  | "signal"
  | "note";

const PATHS: Record<IconName, string> = {
  radio:
    "M3.24 6.15C2.51 6.43 2 7.17 2 8v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2H8.3l8.26-3.34L15.88 1 3.24 6.15zM7 20c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-8h-2v-2h-2v2H4V8h16v4z",
  library:
    "M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 4h-3v5.5c0 1.38-1.12 2.5-2.5 2.5S10 12.88 10 11.5s1.12-2.5 2.5-2.5c.57 0 1.08.19 1.5.51V5h4v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z",
  video:
    "M10 15.5l6-3.5-6-3.5v7zM21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z",
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
  previous: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
  close:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  power:
    "M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z",
  volume:
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  signal:
    "M7 18h2V6H7v12zm4 4h2V2h-2v20zm-8-8h2v-4H3v4zm12 4h2V6h-2v12zm4-8v4h2v-4h-2z",
  note: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z",
};

export function Icon({
  name,
  size = 24,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
