import { useCallback, useEffect, useState } from "react";

/**
 * Full screen
 * ===========
 * A thin wrapper over an API that is less uniform than it looks, plus the
 * one thing worth doing while you are in there: locking the orientation.
 *
 * Three things it has to cope with.
 *
 * **Prefixes.** Older WebKit exposes `webkitRequestFullscreen` and
 * `webkitfullscreenchange` and nothing else. Cheap to support and still
 * common enough on the phones this is aimed at.
 *
 * **Safari on iPhone does not implement it at all.** Not prefixed, not
 * partially — the Fullscreen API on iOS applies to `<video>` elements and
 * that is the whole story; iPadOS gained the real thing in 16.4 and the
 * phone still has not. So this reports honestly rather than throwing, and
 * the interface offers Add to Home Screen instead, which is the route that
 * does work there — hence `app/manifest.ts` declaring `fullscreen`.
 *
 * **It needs a user gesture.** Calling it on load, on a timer, or after an
 * `await` that yields long enough, all fail. Every call site here is inside
 * a pointer handler.
 */

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/** Orientation lock is newer than the type definitions in use here. */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
};

export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FullscreenElement;
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FullscreenDocument;
  return Boolean(document.fullscreenElement || doc.webkitFullscreenElement);
}

/**
 * Already running without browser chrome — launched from the home screen.
 *
 * Worth knowing separately from `isFullscreen`, because on an iPhone it is
 * the *only* way to get here, and offering a full-screen button to someone
 * who is already full screen is the kind of detail that makes an interface
 * feel like it is not paying attention.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean })
    .standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    iosStandalone === true
  );
}

/**
 * Toggle, and lock to landscape on the way in.
 *
 * The lock is best-effort and deliberately unreported: it is only permitted
 * while full screen, only on some platforms, and rejects rather than
 * throwing on the rest. Getting it is a bonus — it makes the portrait gate
 * something most players never see — and not getting it changes nothing,
 * because the gate is still there.
 */
export async function toggleFullscreen(lockLandscape = false): Promise<boolean> {
  const doc = document as FullscreenDocument;

  try {
    if (isFullscreen()) {
      await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return false;
    }

    const el = document.documentElement as FullscreenElement;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
  } catch {
    // Refused, or not called from a gesture the browser accepted.
    return isFullscreen();
  }

  if (lockLandscape) {
    try {
      await (screen.orientation as LockableOrientation).lock?.("landscape");
    } catch {
      // Not permitted here. The portrait prompt covers it.
    }
  }
  return true;
}

/**
 * React's view of it.
 *
 * `active` tracks the browser rather than the button, because full screen
 * can be left in ways this code never sees — Escape, the system back
 * gesture, a swipe down from the top — and a toggle that only updates when
 * pressed goes out of step the first time any of those happen.
 */
export function useFullscreen() {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setSupported(fullscreenSupported());
    setStandalone(isStandalone());

    const sync = () => setActive(isFullscreen());
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggle = useCallback((lockLandscape = false) => {
    void toggleFullscreen(lockLandscape);
  }, []);

  return { active, supported, standalone, toggle };
}
