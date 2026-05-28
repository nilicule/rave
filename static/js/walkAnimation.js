// Cartoony walk cycle: limbs swing opposite to each other (left leg + right
// arm forward together), torso/head bob with |sin(phase)| so the body hops
// twice per stride. Per-avatar state lives on avatar.userData.walkAnim so
// the same animator drives both the local and remote player paths without
// any class wrapping the Three.js group.

import { CONFIG } from './config.js';

const SWING_AMP = 0.7;   // peak limb rotation at full intensity (radians)
const BOB_AMP = 0.08;    // peak vertical hop of torso/head (world units)
const CYCLE_HZ = 1.6;    // full gait cycles per second at MOVEMENT_SPEED
const EASE_RATE = 12;    // exponential smoothing rate toward target intensity
const TWO_PI = Math.PI * 2;

/**
 * Drive a blocky humanoid avatar's limbs through a walk cycle.
 *
 * @param {THREE.Group} avatar - the group returned by createAvatar
 * @param {number} signedSpeed - world units/sec along the avatar's facing.
 *     Positive = forward, negative = backward, ~0 = idle.
 * @param {number} dt - delta seconds since the previous call
 */
export function updateWalkAnimation(avatar, signedSpeed, dt) {
    const limbs = avatar.userData.limbs;
    let state = avatar.userData.walkAnim;
    if (!state) {
        state = {
            phase: 0,
            intensity: 0,
            torsoRestY: limbs.torso.position.y,
            headRestY: limbs.head.position.y,
        };
        avatar.userData.walkAnim = state;
    }

    const speedFrac = Math.min(Math.abs(signedSpeed) / CONFIG.MOVEMENT_SPEED, 1);

    // Frame-rate independent exponential smoothing — same form used for
    // the camera follow in localPlayer.js. Prevents a snap when starting
    // or stopping movement.
    const alpha = 1 - Math.exp(-dt * EASE_RATE);
    state.intensity += (speedFrac - state.intensity) * alpha;

    // Phase advance freezes at idle (speedFrac == 0).
    state.phase += dt * CYCLE_HZ * TWO_PI * speedFrac;
    if (state.phase > TWO_PI) state.phase -= TWO_PI;

    const sign = signedSpeed >= 0 ? 1 : -1;
    const swing = Math.sin(state.phase) * SWING_AMP * state.intensity * sign;
    // |sin| → two bobs per gait cycle (one per footfall).
    const bob = Math.abs(Math.sin(state.phase)) * BOB_AMP * state.intensity;

    limbs.leftLeg.rotation.x = swing;
    limbs.rightLeg.rotation.x = -swing;
    limbs.leftArm.rotation.x = -swing;        // contralateral
    limbs.rightArm.rotation.x = swing;
    limbs.torso.position.y = state.torsoRestY + bob;
    limbs.head.position.y = state.headRestY + bob;
}
