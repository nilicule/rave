// Keeps planted feet planted while the body drifts. animator.js moves the
// avatar's `body` node (drift x, z, yaw) but the leg IK targets live in body
// space, so without help a planted foot would ride along and skate across the
// floor. Per foot we keep an avatar-space compensation offset `c` that cancels
// the drift's motion of a planted foot; a lifted foot lets `c` decay so it
// catches up in the air, and a planted foot that falls too far behind takes a
// short re-step (c eases through zero while the foot is up). Pose-driven foot
// motion (running man, two-step) is never cancelled: only the change in drift moves `c`.
//
// Rotations follow Three.js about +Y: R(θ)·(x, z) = (x cosθ + z sinθ, −x sinθ + z cosθ).
// No Three.js imports — unit-testable.

import { smoothEase } from './poses.js';

export const PLANT_LIFT_MAX = 0.01;    // pose foot lift below this counts as planted
export const PLANT_WALK_MAX = 0.05;    // walk intensity at/above this: walk re-plants feet
export const CATCH_UP_RATE = 12;       // 1/s decay of c while a foot is in the air
export const RESTEP_DIST = 0.07;       // |c| that triggers a re-step
export const RESTEP_S = 0.2;           // re-step duration
// A re-step lands this fraction of its catch-up distance PAST the drift
// target (c ends at −overshoot·c0), i.e. ahead in the direction the body is
// travelling, so the foot can stay planted longer before the next re-step.
// Must stay < 1 or the landed foot would immediately re-trigger.
export const RESTEP_OVERSHOOT = 0.5;
export const RESTEP_LIFT = 0.06;       // re-step peak lift

export function createFootPlant() {
    return {
        l: { x: 0, z: 0 },
        r: { x: 0, z: 0 },
        stepFoot: -1,   // -1 none, 0 left, 1 right
        stepT: 0,
        stepX0: 0,      // c of the stepping foot when the step began
        stepZ0: 0,
    };
}

// Per-frame drift change, shared by both feet (module scratch, no allocation).
// A body-space point b sits at R(yaw)·b + d in avatar space, so its motion
// from prev to cur drift is R(yaw_cur)·b + d_cur − (R(yaw_prev)·b + d_prev).
const _dd = { cos: 0, sin: 0, x: 0, z: 0 };   // prev − cur

function updateFoot(c, foot, side, planted, stepping, fp, hipOffsetX, decay) {
    if (stepping) {
        // Re-step: ease c from c0 to −overshoot·c0 over the step, so the
        // foot leaves and meets the floor with no catch-up velocity (only
        // the body's drift).
        const k = 1 - (1 + RESTEP_OVERSHOOT) * smoothEase(Math.min(1, fp.stepT / RESTEP_S));
        c.x = fp.stepX0 * k;
        c.z = fp.stepZ0 * k;
    } else if (planted) {
        // Cancel only the drift's motion of this foot's (current) target.
        const bx = side * (hipOffsetX + foot.x), bz = foot.z;
        c.x += bx * _dd.cos + bz * _dd.sin + _dd.x;
        c.z += -bx * _dd.sin + bz * _dd.cos + _dd.z;
    } else {
        c.x *= decay;
        c.z *= decay;
    }
}

/**
 * Update the compensation for this frame and apply it (plus any re-step
 * lift) to `pose.lFoot` / `pose.rFoot` in place.
 * @param {object} fp            from createFootPlant
 * @param {object} pose          final Pose, before IK
 * @param {{x,z,yaw}} prev       drift applied last frame
 * @param {{x,z,yaw}} cur        drift applied this frame
 * @param {number} walkIntensity 0..1
 * @param {number} hipOffsetX    rig hip offset (body-space target = side*(hip+foot.x))
 * @param {number} dt            seconds
 */
export function plantFeet(fp, pose, prev, cur, walkIntensity, hipOffsetX, dt) {
    // Advance an in-progress re-step.
    let stepLift = 0;
    if (fp.stepFoot >= 0) {
        fp.stepT += dt;
        // Epsilon: accumulated frame times land a hair short of RESTEP_S, and
        // the touchdown frame must count as planted, not as a zero-lift step.
        if (fp.stepT >= RESTEP_S - 1e-6) fp.stepFoot = -1;
        else stepLift = Math.sin(Math.PI * fp.stepT / RESTEP_S) * RESTEP_LIFT;
    }

    _dd.cos = Math.cos(prev.yaw) - Math.cos(cur.yaw);
    _dd.sin = Math.sin(prev.yaw) - Math.sin(cur.yaw);
    _dd.x = prev.x - cur.x;
    _dd.z = prev.z - cur.z;

    const walking = walkIntensity >= PLANT_WALK_MAX;
    const plantL = !walking && fp.stepFoot !== 0 && pose.lFoot.y < PLANT_LIFT_MAX;
    const plantR = !walking && fp.stepFoot !== 1 && pose.rFoot.y < PLANT_LIFT_MAX;
    const decay = Math.exp(-dt * CATCH_UP_RATE);
    updateFoot(fp.l, pose.lFoot, 1, plantL, fp.stepFoot === 0, fp, hipOffsetX, decay);
    updateFoot(fp.r, pose.rFoot, -1, plantR, fp.stepFoot === 1, fp, hipOffsetX, decay);

    // Start a re-step for the planted foot furthest behind (one at a time).
    if (fp.stepFoot < 0) {
        const dl = plantL ? Math.hypot(fp.l.x, fp.l.z) : 0;
        const dr = plantR ? Math.hypot(fp.r.x, fp.r.z) : 0;
        if (Math.max(dl, dr) > RESTEP_DIST) {
            fp.stepFoot = dl >= dr ? 0 : 1;
            fp.stepT = 0;
            const c = fp.stepFoot === 0 ? fp.l : fp.r;
            fp.stepX0 = c.x;
            fp.stepZ0 = c.z;
        }
    }

    if (fp.stepFoot === 0) pose.lFoot.y += stepLift;
    else if (fp.stepFoot === 1) pose.rFoot.y += stepLift;

    // c is avatar space; the IK target is body space: rotate by −yaw.
    const cs = Math.cos(cur.yaw), sn = Math.sin(cur.yaw);
    pose.lFoot.x += fp.l.x * cs - fp.l.z * sn;
    pose.lFoot.z += fp.l.x * sn + fp.l.z * cs;
    pose.rFoot.x -= fp.r.x * cs - fp.r.z * sn;   // right foot x is mirrored
    pose.rFoot.z += fp.r.x * sn + fp.r.z * cs;
}
