// Dance poses. Every dance = groove layer (shared whole-body bounce, weight
// shift and follow-through) + a move layer (arms, footwork, extra body
// accents). Driven by a shared wall-clock beat so dancers on different
// clients stay roughly in time. Writes into a Pose (see poses.js); the
// animator blends and applies it. No Three.js imports.

import { resetPose, smoothEase } from './poses.js';

export const BPM_HZ = 128 / 60;   // beats per second at 128 BPM techno

const TWO_PI = Math.PI * 2;

/** Beat-fraction bounce: 0 on the beat, dips to 1 at a quarter beat, eases back. */
function bounceCurve(f) {
    return f < 0.25
        ? Math.sin((f / 0.25) * Math.PI / 2)
        : Math.cos(((f - 0.25) / 0.75) * Math.PI / 2);
}

function frac(v) {
    return v - Math.floor(v);
}

/** Always-positive modulo, so negative beat clocks index correctly. */
function mod(v, n) {
    return ((v % n) + n) % n;
}

function groove(pose, beats, style) {
    const en = style.energy;
    const f = frac(beats);
    const bar = Math.sin(Math.PI * beats);          // 2-beat weight shift

    // Knee-driven bounce: IK turns the pelvis drop into knee bend.
    pose.pelvis.y = -0.07 * en * bounceCurve(f);
    // Weight over the left foot, then the right; loaded hip rises.
    pose.pelvis.x = 0.06 * en * bar;
    pose.pelvis.rz = 0.06 * en * bar;
    pose.pelvis.ry = 0.05 * en * bar;
    pose.spine.rz = -0.08 * en * bar;               // counter-tilt
    pose.chest.rz = -0.03 * en * bar;
    // Follow-through: chest and head lag the pelvis bounce.
    pose.chest.rx = 0.05 * en * bounceCurve(frac(f - 0.12));
    pose.neck.rx = 0.12 * en * bounceCurve(frac(f - 0.2));
    // Slightly wider dance stance.
    pose.lFoot.x = 0.05;
    pose.rFoot.x = 0.05;
    // Loose arms that ride the bounce.
    const armBob = 0.1 * bounceCurve(frac(f - 0.1));
    looseArm(pose.lArm, armBob);
    looseArm(pose.rArm, armBob);
}

function looseArm(arm, bob) {
    arm.sx = -0.15 - bob;
    arm.sz = 0.15;
    arm.e = 0.5 + bob;
}

/** The style's dominant arm, and the other one (no per-frame allocation). */
function dominantArm(pose, style) {
    return style.hand === 'l' ? pose.lArm : pose.rArm;
}
function otherArm(pose, style) {
    return style.hand === 'l' ? pose.rArm : pose.lArm;
}

function fistPump(pose, beats, style) {
    const f = frac(beats);
    const strong = mod(Math.floor(beats), 4) === 3;
    // Double pump on every 4th beat: two punches in one beat.
    const pf = strong ? frac(f * 2) : f;
    const u = pf < 0.35 ? smoothEase(pf / 0.35) : 1 - smoothEase((pf - 0.35) / 0.65);
    const D = dominantArm(pose, style);
    const O = otherArm(pose, style);
    D.sx = -2.6 - 0.4 * u;
    D.sz = 0.25;
    D.e = 0.15 + 1.0 * (1 - u);
    O.sx = -0.3;
    O.sz = 0.4;
    O.e = 1.6;                      // hand near the hip, elbow out
    pose.chest.rx += 0.06 + 0.04 * u;
    pose.pelvis.y += 0.03 * u;      // chest lifts into the punch
}

function handsInAir(pose, beats, _style) {
    const s = Math.sin(Math.PI * beats);
    pose.lArm.sx = -2.9;
    pose.rArm.sx = -2.9;
    // Both arms sway the same way in body space (sz is mirrored).
    pose.lArm.sz = 0.35 + 0.15 * s;
    pose.rArm.sz = 0.35 - 0.15 * s;
    pose.lArm.e = pose.rArm.e = 0.25;
    pose.lArm.wz = pose.rArm.wz = 0.3 * Math.sin(TWO_PI * beats);
    pose.pelvis.x += 0.05 * s;
    // Body wave rolling up the spine.
    pose.spine.rx += 0.06 * Math.sin(Math.PI * beats);
    pose.chest.rx += 0.08 * Math.sin(Math.PI * beats - 0.8);
    pose.neck.rx += 0.1 * Math.sin(Math.PI * beats - 1.6);
}

// Step-touch over 4 beats, in body-space X (+X = left):
//   beat 0→1 left foot steps out, 1→2 right closes,
//   2→3 right steps back out, 3→4 left closes back to centre.
function twoStep(pose, beats, _style) {
    const b4 = mod(beats, 4);
    const W = 0.2;
    let lx, rx, liftL = 0, liftR = 0;
    if (b4 < 1)      { lx = W * smoothEase(b4);           rx = 0; liftL = Math.sin(Math.PI * b4); }
    else if (b4 < 2) { lx = W; rx = W * smoothEase(b4 - 1);        liftR = Math.sin(Math.PI * (b4 - 1)); }
    else if (b4 < 3) { lx = W; rx = W * (1 - smoothEase(b4 - 2));  liftR = Math.sin(Math.PI * (b4 - 2)); }
    else             { lx = W * (1 - smoothEase(b4 - 3)); rx = 0; liftL = Math.sin(Math.PI * (b4 - 3)); }

    pose.lFoot.x += lx;             // left outward = +X
    pose.rFoot.x -= rx;             // right outward = -X, so +X travel is inward
    pose.lFoot.y += 0.08 * liftL;
    pose.rFoot.y += 0.08 * liftR;
    pose.pelvis.x += (lx + rx) / 2;  // body follows the feet

    const s = Math.sin(Math.PI * beats);
    pose.chest.ry += 0.15 * s;
    pose.lArm.sx = 0.35 * s;
    pose.rArm.sx = -0.35 * s;
    pose.lArm.e = pose.rArm.e = 0.6;
}

const RELAXED_ARM = { sx: 0.05, sz: 0.12, e: 0.3 };
// Pose 0 big fish, 1 little fish, 2 cardboard box.
const BIG_FISH_POSES = [
    { l: { sx: 0, sz: 1.5, e: 0.3 }, r: RELAXED_ARM, chestRy: 0.2 },
    { l: RELAXED_ARM, r: { sx: -1.4, sz: -0.2, e: 1.2 }, chestRy: -0.2 },
    { l: { sx: -1.3, sz: 0.1, e: 0.9 }, r: { sx: -1.3, sz: 0.1, e: 0.9 }, chestRy: 0 },
];

function lerpArm(arm, a, b, t) {
    arm.sx = a.sx + (b.sx - a.sx) * t;
    arm.sz = a.sz + (b.sz - a.sz) * t;
    arm.e = a.e + (b.e - a.e) * t;
}

function bigFish(pose, beats, _style) {
    const cur = mod(Math.floor(beats), 3);
    const prev = (cur + 2) % 3;
    const f = frac(beats);
    // Snap into each pose in the first quarter beat, then hold.
    const t = smoothEase(Math.min(1, f / 0.25));
    const a = BIG_FISH_POSES[prev], b = BIG_FISH_POSES[cur];
    lerpArm(pose.lArm, a.l, b.l, t);
    lerpArm(pose.rArm, a.r, b.r, t);
    pose.chest.ry += a.chestRy + (b.chestRy - a.chestRy) * t;
    // Body hit on the snap.
    const hit = t < 1 ? Math.sin(Math.PI * t) : 0;
    pose.chest.rx += 0.1 * hit;
    pose.pelvis.y -= 0.03 * hit;
}

const POINT_UP = { sx: -2.5, sz: 0.7, e: 0.05 };
const POINT_CROSS = { sx: -0.6, sz: -0.3, e: 0.3 };

function discoPoint(pose, beats, _style) {
    const cur = mod(Math.floor(beats), 2);  // 0: left points up, 1: right
    const f = frac(beats);
    const t = smoothEase(Math.min(1, f / 0.35));
    // side: +1 when the left arm points up, -1 when the right does.
    const sidePrev = cur === 0 ? -1 : 1;
    const sideCur = -sidePrev;
    const side = sidePrev + (sideCur - sidePrev) * t;
    const leftUp = (side + 1) / 2;         // 0..1
    lerpArm(pose.lArm, POINT_CROSS, POINT_UP, leftUp);
    lerpArm(pose.rArm, POINT_UP, POINT_CROSS, leftUp);
    // Hip pops out on the pointing side; head follows the finger.
    pose.pelvis.x += 0.06 * side;
    pose.pelvis.rz += 0.08 * side;
    pose.chest.rz -= 0.08 * side;
    pose.neck.ry += 0.35 * side;
    pose.neck.rx -= 0.25;
}

// One foot's running-man cycle over 2 beats. p in [0, 2).
function runningFoot(foot, p) {
    if (p < 1) {                     // planted: slides back
        foot.z += 0.15 - 0.4 * p;
    } else {                         // knee lifts, foot returns forward
        const u = p - 1;
        foot.z += -0.25 + 0.4 * smoothEase(u);
        foot.y += 0.4 * Math.sin(Math.PI * u);
        foot.pitch += 0.4 * Math.sin(Math.PI * u);
    }
}

function runningMan(pose, beats, _style) {
    runningFoot(pose.lFoot, mod(beats, 2));
    runningFoot(pose.rFoot, mod(beats + 1, 2));
    pose.pelvis.y -= 0.04;
    pose.pelvis.x *= 0.3;            // keep the hips fairly level/centred
    pose.pelvis.rz *= 0.3;
    pose.chest.rx += 0.1;
    const s = Math.sin(Math.PI * beats);
    pose.lArm.sx = -0.3 - 0.7 * s;
    pose.rArm.sx = -0.3 + 0.7 * s;
    pose.lArm.e = pose.rArm.e = 1.3;
}

const MOVES = {
    fist_pump: fistPump,
    hands_air: handsInAir,
    two_step: twoStep,
    big_fish: bigFish,
    disco_point: discoPoint,
    running_man: runningMan,
};

export function isDanceMove(moveId) {
    return Object.hasOwn(MOVES, moveId);
}

/**
 * Write the pose for `moveId` at `beats` into `out`.
 * @param {string} moveId  one of the MOVES keys
 * @param {number} beats   beat clock, already including style.timing
 * @param {object} style   from styleFromSeed
 * @param {object} out     Pose to overwrite
 */
export function dancePose(moveId, beats, style, out) {
    resetPose(out);
    groove(out, beats, style);
    MOVES[moveId](out, beats, style);
    return out;
}
