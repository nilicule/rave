// Seeded randomness shared by the avatar builder and the animators. Kept free
// of Three.js imports so the animation math can be unit-tested in plain Node.

/** Deterministic PRNG. Returns a function yielding floats in [0, 1). */
export function mulberry32(seed) {
    let t = seed >>> 0;
    return function next() {
        t = (t + 0x6d2b79f5) >>> 0;
        let r = t;
        r = Math.imul(r ^ (r >>> 15), r | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Per-player dance personality, derived from color_seed so every client
 * computes the same style for the same player without any network traffic.
 */
export function styleFromSeed(seed) {
    // Offset the seed so style isn't correlated with the avatar's colors.
    const rand = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    return {
        seed: seed >>> 0,
        energy: 0.8 + rand() * 0.4,           // amplitude multiplier, 0.8–1.2
        timing: (rand() - 0.5) * 0.1,         // beat offset, ±0.05 beat
        hand: rand() < 0.5 ? 'l' : 'r',       // dominant hand for one-arm moves
        phaseA: rand() * Math.PI * 2,         // drift / idle phase offsets
        phaseB: rand() * Math.PI * 2,
        phaseC: rand() * Math.PI * 2,
    };
}
