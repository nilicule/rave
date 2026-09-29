// Standing-still pose: breathing and slow weight shifts so idle players
// aren't frozen statues. No bounce — that's reserved for dancing.

import { resetPose } from './poses.js';

const TWO_PI = Math.PI * 2;

/**
 * @param {number} time  seconds (wall clock)
 * @param {object} style from styleFromSeed
 * @param {object} out   Pose to overwrite
 */
export function idlePose(time, style, out) {
    resetPose(out);
    const breath = Math.sin(TWO_PI * time / 4);
    const shift = Math.sin(TWO_PI * time / 7 + style.phaseA);
    out.chest.rx = -0.02 * breath;
    out.pelvis.y = -0.01 + 0.005 * breath;
    out.pelvis.x = 0.03 * shift;
    out.pelvis.rz = 0.03 * shift;
    out.spine.rz = -0.03 * shift;
    out.neck.ry = 0.15 * Math.sin(TWO_PI * time / 11 + style.phaseB);
    out.lArm.sz = out.rArm.sz = 0.1 + 0.02 * breath;
    return out;
}
