// Dance animations. A shared wall-clock beat phase drives every per-move
// function so dancers on a client stay in time with each other (and roughly
// with other clients — wall clocks differ by <1s in typical environments).
//
// Composition rule (mirrored in localPlayer.js and remotePlayers.js):
//   1. updateWalkAnimation runs first.
//   2. updateDanceAnimation runs second.
// Walk owns the .x rotations and Y positions; dance owns those plus .z
// rotations on arms and torso. Walk re-writes its territory every frame
// (writing 0s when intensity is 0), so dance overwriting on top is safe.
// When dance transitions from non-idle to idle, this module resets the
// dance-exclusive axes once so leftover .z rotations don't ghost.

const BPM_HZ = 128 / 60;   // ~2.13 Hz at 128 BPM techno

const FIST_PUMP_AMP = 0.4;
const HANDS_AIR_SWAY = 0.15;
const HANDS_AIR_LEAN = 0.1;
const TWO_STEP_LEAN = 0.08;
const TWO_STEP_LEG_LIFT = 0.3;
const TWO_STEP_ARM_SWING = 0.15;
const BIG_FISH_OUT_X = -Math.PI / 2;
const BIG_FISH_LEFT_Z = Math.PI / 4;
const BIG_FISH_RIGHT_Z = -Math.PI / 2;
const DISCO_POINT_HI_X = -Math.PI * 0.7;
const DISCO_POINT_HI_Z = 0.6;
const DISCO_POINT_LO_X = -0.5;
const DISCO_POINT_LO_Z = 0.4;
const RUNNING_MAN_ARM = 1.0;
const RUNNING_MAN_LEG = 0.8;
const RUNNING_MAN_BOB = 0.12;

const TWO_PI = Math.PI * 2;

// Axes only the dance animator writes. Reset on dance->idle transitions and
// at the start of every dance frame so cycling between moves doesn't leave
// ghost .z values.
function resetDanceExclusiveAxes(limbs) {
    limbs.leftArm.rotation.z = 0;
    limbs.rightArm.rotation.z = 0;
    limbs.torso.rotation.z = 0;
}

function fistPump(limbs, phase, _beats, _state) {
    limbs.rightArm.rotation.x = -Math.PI + Math.sin(phase * 2) * FIST_PUMP_AMP;
}

function handsInAir(limbs, phase, _beats, _state) {
    const s = Math.sin(phase);
    limbs.leftArm.rotation.x = -Math.PI;
    limbs.leftArm.rotation.z = HANDS_AIR_SWAY * s;
    limbs.rightArm.rotation.x = -Math.PI;
    limbs.rightArm.rotation.z = -HANDS_AIR_SWAY * s;
    limbs.torso.rotation.z = HANDS_AIR_LEAN * s;
}

function twoStep(limbs, phase, _beats, _state) {
    const s = Math.sin(phase);
    limbs.torso.rotation.z = TWO_STEP_LEAN * s;
    limbs.leftLeg.rotation.x = Math.max(0, s) * TWO_STEP_LEG_LIFT;
    limbs.rightLeg.rotation.x = Math.max(0, -s) * TWO_STEP_LEG_LIFT;
    limbs.leftArm.rotation.x = -s * TWO_STEP_ARM_SWING;
    limbs.rightArm.rotation.x = s * TWO_STEP_ARM_SWING;
}

function bigFishLittleFishCardboardBox(limbs, _phase, beats, _state) {
    // One pose per beat, three-beat loop. Snap between poses; no easing.
    const pose = Math.floor(beats) % 3;
    if (pose === 0) {
        // big fish: left arm extended out flat
        limbs.leftArm.rotation.x = BIG_FISH_OUT_X;
        limbs.leftArm.rotation.z = BIG_FISH_LEFT_Z;
    } else if (pose === 1) {
        // little fish: right arm flat across the body
        limbs.rightArm.rotation.x = BIG_FISH_OUT_X;
        limbs.rightArm.rotation.z = BIG_FISH_RIGHT_Z;
    } else {
        // cardboard box: both arms pushed forward
        limbs.leftArm.rotation.x = BIG_FISH_OUT_X;
        limbs.rightArm.rotation.x = BIG_FISH_OUT_X;
    }
}

function discoPoint(limbs, phase, _beats, _state) {
    if (Math.sin(phase) >= 0) {
        limbs.rightArm.rotation.x = DISCO_POINT_HI_X;
        limbs.rightArm.rotation.z = DISCO_POINT_HI_Z;
        limbs.leftArm.rotation.x = DISCO_POINT_LO_X;
        limbs.leftArm.rotation.z = -DISCO_POINT_LO_Z;
    } else {
        limbs.leftArm.rotation.x = DISCO_POINT_HI_X;
        limbs.leftArm.rotation.z = -DISCO_POINT_HI_Z;
        limbs.rightArm.rotation.x = DISCO_POINT_LO_X;
        limbs.rightArm.rotation.z = DISCO_POINT_LO_Z;
    }
}

function runningMan(limbs, phase, _beats, state) {
    const s = Math.sin(phase);
    limbs.leftArm.rotation.x = s * RUNNING_MAN_ARM;
    limbs.rightArm.rotation.x = -s * RUNNING_MAN_ARM;
    limbs.leftLeg.rotation.x = -Math.max(0, s) * RUNNING_MAN_LEG;
    limbs.rightLeg.rotation.x = -Math.max(0, -s) * RUNNING_MAN_LEG;
    limbs.torso.position.y = state.torsoRestY + Math.abs(s) * RUNNING_MAN_BOB;
}

const DISPATCH = {
    fist_pump: fistPump,
    hands_air: handsInAir,
    two_step: twoStep,
    big_fish: bigFishLittleFishCardboardBox,
    disco_point: discoPoint,
    running_man: runningMan,
};

/**
 * Drive a dance pose for the given move id. Must be called every frame —
 * the function tracks transitions out of a dance and resets dance-exclusive
 * axes (.z rotations) on the way to idle so they don't ghost.
 *
 * @param {THREE.Group} avatar - group returned by createAvatar
 * @param {string} moveId - one of DANCE_MOVES; 'idle' (or unknown) returns
 *     to neutral with the transition-aware reset
 */
export function updateDanceAnimation(avatar, moveId) {
    const limbs = avatar.userData.limbs;
    let state = avatar.userData.danceAnim;
    if (!state) {
        state = {
            torsoRestY: limbs.torso.position.y,
            headRestY: limbs.head.position.y,
            lastMoveId: 'idle',
        };
        avatar.userData.danceAnim = state;
    }

    const fn = DISPATCH[moveId];
    if (!fn) {
        // 'idle' or unknown — reset the dance-only axes once if we just left
        // a dance, then do nothing. Walk handles .x rotations and Y heights.
        if (state.lastMoveId !== 'idle') {
            resetDanceExclusiveAxes(limbs);
        }
        state.lastMoveId = 'idle';
        return;
    }

    // Every dance frame starts by clearing .z axes so cycling between moves
    // (some of which don't touch .z) doesn't leave stale rotations.
    resetDanceExclusiveAxes(limbs);

    const beats = performance.now() / 1000 * BPM_HZ;
    const phase = (beats % 1) * TWO_PI;
    fn(limbs, phase, beats, state);
    state.lastMoveId = moveId;
}
