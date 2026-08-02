/**
 * Deterministic PRNG (mulberry32).
 *
 * Road chunks seed a generator with their chunk index, so the scenery for
 * a given stretch of road is stable — driving backwards shows the same
 * trees you already passed, even after the chunk was unmounted.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable, positive seed for any (possibly negative) chunk index. */
export function chunkSeed(index: number): number {
  return ((index % 100000) + 100000) * 7919 + 17;
}
