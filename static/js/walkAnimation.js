// Walk cycle as a Pose. Feet follow elliptical targets (stance: slide back
// along the floor; swing: lift and return forward), IK bends the knees, arms
// swing contralaterally, and the pelvis twists and bobs. No Three.js imports.

import { resetPose } from './poses.js';

export const WALK_CYCLE_HZ = 2.6;   // full gait cycles/sec at MOVEMENT_SPEED
const STRIDE = 0.32;                 // foot travel either side of centre
const LIFT = 0.15;                   // swing-foot lift
const ARM_SWING = 0.5;

function walkFoot(foot, p, direction) {
    foot.z = STRIDE * Math.sin(p) * direction;
    // The swing foot is the one moving in the travel direction:
    // d/dp sin(p) = cos(p) > 0, for either walking direction.
    const swing = Math.max(0, Math.cos(p));
    foot.y = LIFT * swing;
    foot.pitch = -0.3 * swing * direction;   // toe up while swinging
}

/**
 * @param {number} phase      gait phase in radians
 * @param {number} direction  +1 walking forward, -1 backward
 * @param {object} out        Pose to overwrite
 */
export function walkPose(phase, direction, out) {
    resetPose(out);
    const s = Math.sin(phase);
    walkFoot(out.lFoot, phase, direction);
    walkFoot(out.rFoot, phase + Math.PI, direction);
    // Left leg forward (s > 0) → right arm forward (negative sx).
    out.lArm.sx = ARM_SWING * s * direction;
    out.rArm.sx = -ARM_SWING * s * direction;
    out.lArm.e = out.rArm.e = 0.35;
    out.pelvis.y = -0.05 + 0.025 * Math.cos(2 * phase);
    out.pelvis.ry = -0.12 * s * direction;
    out.chest.ry = 0.1 * s * direction;   // counter-rotate shoulders
    out.spine.rx = 0.05 * direction;
    return out;
}
