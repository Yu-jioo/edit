/**
 * Mulberry32 deterministic seeded PRNG.
 * Returns a function that yields floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Combines two integer seeds deterministically.
 */
export function combineSeed(seedA: number, seedB: number): number {
  let h = (seedA ^ (seedB * 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Deterministic smooth 1D noise for subtle gate weave or exposure flicker at time t.
 */
export function deterministicWave(t: number, seed: number, freq: number = 1.0): number {
  const s1 = (seed % 997) * 0.13;
  const s2 = ((seed * 31) % 991) * 0.29;
  return (
    Math.sin(t * freq * 2.1 + s1) * 0.5 +
    Math.cos(t * freq * 3.7 + s2) * 0.3 +
    Math.sin(t * freq * 7.3 + s1 * 1.7) * 0.2
  );
}
