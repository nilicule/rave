// Visual-only wander while dancing: real dancers never stay on exactly the
// same spot. Deterministic from the shared beat clock + the player's style,
// so every client computes (nearly) the same drift with no network traffic.
// The result is an offset for the avatar's `body` node; the networked
// position is never touched.

import { smoothEase } from './poses.js';

export const DRIFT_RADIUS = 0.4;     // max offset from the anchor (world units)
export const DRIFT_MAX_YAW = 0.43;   // ~25 degrees
const PHRASE_BEATS = 8;              // side-step on every 8-beat phrase
const STEP_BEATS = 1;                // the side-step takes one beat
const STEP_SIZE = 0.12;              // max side-step offset per axis
const STEP_LIFT = 0.07;              // foot lift during a side-step
const TWO_PI = Math.PI * 2;

// Output of a mulberry32 generator whose state has just advanced to `t`.
// Same numbers as style.js's mulberry32, without a closure per call.
function mulberryOut(t) {
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

const MULBERRY_INC = 0x6d2b79f5;
const _prev = { x: 0, z: 0 };   // scratch: no per-frame allocation
const _cur = { x: 0, z: 0 };

/** Seeded side-step for `phrase`: the first two mulberry32 draws. */
function phraseStep(seed, phrase, out) {
    const s = (seed ^ Math.imul(phrase, 2654435761)) >>> 0;
    out.x = (mulberryOut((s + MULBERRY_INC) >>> 0) * 2 - 1) * STEP_SIZE;
    out.z = (mulberryOut((s + 2 * MULBERRY_INC) >>> 0) * 2 - 1) * STEP_SIZE;
    return out;
}

/**
 * @param {number} beats  beat clock (fractional beats)
 * @param {object} style  from styleFromSeed
 * @param {object} out    reused result object {x, z, yaw, liftL, liftR}
 */
export function driftTarget(beats, style, out = {}) {
    const { phaseA, phaseB, phaseC, seed } = style;

    // Slow Lissajous wander (periods of several bars).
    let x = 0.2 * Math.sin(TWO_PI * beats / 32 + phaseA)
          + 0.08 * Math.sin(TWO_PI * beats / 13 + phaseB);
    let z = 0.16 * Math.sin(TWO_PI * beats / 27 + phaseB)
          + 0.08 * Math.sin(TWO_PI * beats / 11 + phaseC);

    // Phrase-boundary side-step: ease from the previous phrase's step to
    // this one over the first beat of the phrase.
    const phrase = Math.floor(beats / PHRASE_BEATS);
    const inPhrase = beats - phrase * PHRASE_BEATS;
    const prev = phraseStep(seed, phrase - 1, _prev);
    const cur = phraseStep(seed, phrase, _cur);
    const t = Math.min(1, inPhrase / STEP_BEATS);
    const e = smoothEase(t);
    x += prev.x + (cur.x - prev.x) * e;
    z += prev.z + (cur.z - prev.z) * e;

    const r = Math.hypot(x, z);
    if (r > DRIFT_RADIUS) {
        x *= DRIFT_RADIUS / r;
        z *= DRIFT_RADIUS / r;
    }

    // Lift the leading foot in the first half of the step, the trailing foot
    // in the second half, so the side-step reads as a step, not a slide.
    let liftL = 0, liftR = 0;
    if (t < 1) {
        const leadIsLeft = cur.x - prev.x >= 0;   // +X is the avatar's left
        const half = t < 0.5 ? t * 2 : t * 2 - 1;
        const lift = Math.sin(Math.PI * half) * STEP_LIFT;
        const liftLead = t < 0.5;
        if (liftLead === leadIsLeft) liftL = lift; else liftR = lift;
    }

    out.x = x;
    out.z = z;
    out.yaw = 0.34 * Math.sin(TWO_PI * beats / 40 + phaseC)
            + 0.08 * Math.sin(TWO_PI * beats / 11 + phaseA);
    out.liftL = liftL;
    out.liftR = liftR;
    return out;
}
