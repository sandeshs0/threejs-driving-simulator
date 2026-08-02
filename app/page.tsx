"use client";

import dynamic from "next/dynamic";

/**
 * The whole experience is client-only (WebGL, WASM physics, window events),
 * so it is loaded dynamically with SSR disabled.
 */
const Experience = dynamic(() => import("@/components/Experience"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-white/60">
      Loading simulator…
    </div>
  ),
});

export default function Home() {
  return (
    <main className="h-dvh w-full">
      <Experience />
    </main>
  );
}
