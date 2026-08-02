"use client";

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

/**
 * Effects
 * -------
 * Deliberately subtle post-processing: a touch of bloom for the sky and
 * white road markings, and a soft vignette to focus the view. Heavy
 * effects are avoided to keep frame rate high.
 */
export function Effects() {
  return (
    <EffectComposer>
      <Bloom intensity={0.12} luminanceThreshold={0.85} mipmapBlur />
      <Vignette offset={0.25} darkness={0.5} />
    </EffectComposer>
  );
}
