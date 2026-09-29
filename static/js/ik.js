// Analytic two-bone leg IK. Pure math, no Three.js, so it runs under
// `node --test`. Coordinates are body space: +Y up, +Z forward, +X left.
//
// The returned angles describe the thigh's orientation in body space as the
// Euler rotation Rz(roll) * Rx(pitch) (Three.js order 'ZXY' with y = 0),
// applied to a thigh that hangs straight down (-Y) at rest. The knee bends
// by `knee` radians about the same local X axis (positive = shin swings
// back), so the knee always points forward and never hyperextends.

const REACH_FRACTION = 0.999;   // never fully straight: avoids knee pop
const MIN_BELOW_HIP = 0.05;     // feet may not rise above the hip

/**
 * @param {{x:number,y:number,z:number}} hip    hip joint position
 * @param {{x:number,y:number,z:number}} target desired ankle position
 * @param {number} thighLen
 * @param {number} shinLen
 * @returns {{pitch:number, roll:number, knee:number}}
 */
export function solveLeg(hip, target, thighLen, shinLen) {
    let dx = target.x - hip.x;
    let dy = Math.min(target.y - hip.y, -MIN_BELOW_HIP);
    let dz = target.z - hip.z;
    let d = Math.hypot(dx, dy, dz);

    const maxReach = (thighLen + shinLen) * REACH_FRACTION;
    const minReach = Math.abs(thighLen - shinLen) + 1e-3;
    const clamped = Math.min(maxReach, Math.max(minReach, d));
    if (clamped !== d) {
        const k = clamped / d;
        dx *= k; dy *= k; dz *= k;
        d = clamped;
    }

    // Roll swings the leg sideways toward the target; pitch then aims it
    // forward/back within that rolled plane.
    const h = Math.hypot(dx, dy);
    const roll = Math.atan2(dx, -dy);
    const phi = Math.atan2(dz, h);   // positive = target in front of the hip

    // Law of cosines. `a` = angle between the thigh and the hip→ankle line.
    const cosA = clampUnit((thighLen * thighLen + d * d - shinLen * shinLen) / (2 * thighLen * d));
    const cosK = clampUnit((thighLen * thighLen + shinLen * shinLen - d * d) / (2 * thighLen * shinLen));

    return {
        pitch: -phi - Math.acos(cosA), // negative rx swings the thigh forward
        roll,
        knee: Math.PI - Math.acos(cosK),
    };
}

function clampUnit(v) {
    return v < -1 ? -1 : v > 1 ? 1 : v;
}
