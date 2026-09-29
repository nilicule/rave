// Pose: a plain-object description of every animated degree of freedom.
// Animation sources (walk, dance, idle) write poses; animator.js blends them
// and applies the result to the rig. No Three.js imports — unit-testable.
//
// Conventions (avatar faces +Z, +X is the avatar's left, +Y is up):
//   pelvis.x/y/z   offset from rest position (world units, body space)
//   *.rx           positive tilts the segment's top forward (toward +Z)
//   *.ry           positive turns toward +X (the avatar's left)
//   *.rz           positive raises the +X side
//   arms: sx/sy/sz shoulder rotation; sz/sy are MIRRORED so positive sz
//         always lifts the arm outward (away from the body) on either side.
//         sx negative raises the arm forward/up (-PI = straight up).
//         e = elbow flex (>= 0, forearm bends forward). wx/wz = wrist.
//   feet:  x = outward offset (mirrored), y = lift above floor,
//          z = forward offset, pitch = toe-down rotation.

export const POSE_SHAPE = Object.freeze({
    pelvis: ['x', 'y', 'z', 'rx', 'ry', 'rz'],
    spine: ['rx', 'ry', 'rz'],
    chest: ['rx', 'ry', 'rz'],
    neck: ['rx', 'ry', 'rz'],
    lArm: ['sx', 'sy', 'sz', 'e', 'wx', 'wz'],
    rArm: ['sx', 'sy', 'sz', 'e', 'wx', 'wz'],
    lFoot: ['x', 'y', 'z', 'pitch'],
    rFoot: ['x', 'y', 'z', 'pitch'],
});

// Relaxed standing: arms hang slightly away from the body with soft elbows.
const REST_ARM = { sx: 0.05, sy: 0, sz: 0.1, e: 0.2, wx: 0, wz: 0 };

export function neutralPose() {
    const pose = {};
    for (const [part, keys] of Object.entries(POSE_SHAPE)) {
        pose[part] = {};
        for (const k of keys) pose[part][k] = 0;
    }
    Object.assign(pose.lArm, REST_ARM);
    Object.assign(pose.rArm, REST_ARM);
    return pose;
}

const NEUTRAL = neutralPose();

/** Overwrite `out` with the neutral pose (allocation-free per frame). */
export function resetPose(out) {
    return copyPose(NEUTRAL, out);
}

export function copyPose(src, out) {
    for (const [part, keys] of Object.entries(POSE_SHAPE)) {
        for (const k of keys) out[part][k] = src[part][k];
    }
    return out;
}

/** Component-wise lerp: w=0 -> a, w=1 -> b. `out` may alias a or b. */
export function blendPose(a, b, w, out) {
    for (const [part, keys] of Object.entries(POSE_SHAPE)) {
        const pa = a[part], pb = b[part], po = out[part];
        for (const k of keys) po[k] = pa[k] * (1 - w) + pb[k] * w;
    }
    return out;
}

/** easeInOutSine on [0, 1]; zero velocity at both ends. */
export function smoothEase(t) {
    return 0.5 - 0.5 * Math.cos(t * Math.PI);
}

export function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}
