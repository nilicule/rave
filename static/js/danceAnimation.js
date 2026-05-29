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
const STEP_GROOVE_KNEE = 0.5;    // knee flex during the alternating step
const RUNNING_MAN_KNEE = 1.2;    // pronounced bend on the high-knee jog
const FIST_PUMP_ELBOW = 1.2;     // forearm bend on the down-phase of the pump
const HANDS_AIR_ELBOW = 0.2;     // slight constant bend so arms aren't rigid sticks
const DISCO_POINT_ELBOW = 0.15;  // slight bend so arms don't look like rifles

const TWO_PI = Math.PI * 2;

/**
 * easeInOutSine. t in [0, 1]: starts at 0 with zero velocity, ends at 1
 * with zero velocity. The zero-velocity endpoints make pose-boundary
 * direction changes continuous (no sudden flick).
 */
function smoothEase(t) {
    return 0.5 - 0.5 * Math.cos(t * Math.PI);
}

// Axes only the dance animator writes. Reset on dance->idle transitions and
// at the start of every dance frame so cycling between moves doesn't leave
// ghost .z values.
function resetDanceExclusiveAxes(limbs) {
    limbs.leftArm.rotation.z = 0;
    limbs.rightArm.rotation.z = 0;
    limbs.torso.rotation.z = 0;
    limbs.leftElbow.rotation.x = 0;
    limbs.rightElbow.rotation.x = 0;
    limbs.leftKnee.rotation.x = 0;
    limbs.rightKnee.rotation.x = 0;
}

/**
 * Baseline rave-step groove for the legs. Alternating foot lift driven by
 * sin(phase). Called from every dance move whose primary motion is in the
 * upper body so the avatar still looks like it's dancing on its feet.
 */
function addStepGroove(limbs, phase) {
    const s = Math.sin(phase);
    limbs.leftLeg.rotation.x  = Math.max(0,  s) * TWO_STEP_LEG_LIFT;
    limbs.rightLeg.rotation.x = Math.max(0, -s) * TWO_STEP_LEG_LIFT;
    limbs.leftKnee.rotation.x  = Math.max(0,  s) * STEP_GROOVE_KNEE;
    limbs.rightKnee.rotation.x = Math.max(0, -s) * STEP_GROOVE_KNEE;
}

function fistPump(limbs, phase, _beats, _state) {
    addStepGroove(limbs, phase);
    const pumpHigh = Math.sin(phase * 2);
    limbs.rightArm.rotation.x = -Math.PI + pumpHigh * FIST_PUMP_AMP;
    limbs.rightElbow.rotation.x = Math.max(0, -pumpHigh) * FIST_PUMP_ELBOW;
}

function handsInAir(limbs, phase, _beats, _state) {
    addStepGroove(limbs, phase);
    const s = Math.sin(phase);
    limbs.leftArm.rotation.x = -Math.PI;
    limbs.leftArm.rotation.z = HANDS_AIR_SWAY * s;
    limbs.rightArm.rotation.x = -Math.PI;
    limbs.rightArm.rotation.z = -HANDS_AIR_SWAY * s;
    limbs.torso.rotation.z = HANDS_AIR_LEAN * s;
    limbs.leftElbow.rotation.x  = HANDS_AIR_ELBOW;
    limbs.rightElbow.rotation.x = HANDS_AIR_ELBOW;
}

function twoStep(limbs, phase, _beats, _state) {
    addStepGroove(limbs, phase);
    const s = Math.sin(phase);
    limbs.torso.rotation.z = TWO_STEP_LEAN * s;
    limbs.leftArm.rotation.x = -s * TWO_STEP_ARM_SWING;
    limbs.rightArm.rotation.x = s * TWO_STEP_ARM_SWING;
}

// Per-pose target values for each axis the move writes. Index matches
// the integer pose number (0 = big fish, 1 = little fish, 2 = cardboard box).
const BIG_FISH_POSES = [
    // Pose 0: big fish — left arm extended out flat with bent forearm
    { lax: BIG_FISH_OUT_X, laz: BIG_FISH_LEFT_Z,  rax: 0,              raz: 0,
      lex: 0.3, rex: 0 },
    // Pose 1: little fish — right arm flat across body with bent forearm
    { lax: 0,              laz: 0,                rax: BIG_FISH_OUT_X, raz: BIG_FISH_RIGHT_Z,
      lex: 0, rex: 0.3 },
    // Pose 2: cardboard box — both forearms angled forward (mimicking holding a box)
    { lax: BIG_FISH_OUT_X, laz: 0,                rax: BIG_FISH_OUT_X, raz: 0,
      lex: 0.6, rex: 0.6 },
];

function bigFishLittleFishCardboardBox(limbs, phase, beats, _state) {
    addStepGroove(limbs, phase);
    // One pose per beat, three-beat loop. Continuously interpolates from
    // the previous pose to the current pose across the full beat using
    // easeInOutSine — zero velocity at the boundary so the direction
    // reversal at each pose change is smooth, never a snap.
    const cur = Math.floor(beats) % 3;
    const prev = (cur + 2) % 3;
    const beatFrac = beats % 1;
    const t = smoothEase(beatFrac);

    const a = BIG_FISH_POSES[prev];
    const b = BIG_FISH_POSES[cur];

    limbs.leftArm.rotation.x  = a.lax + (b.lax - a.lax) * t;
    limbs.leftArm.rotation.z  = a.laz + (b.laz - a.laz) * t;
    limbs.rightArm.rotation.x = a.rax + (b.rax - a.rax) * t;
    limbs.rightArm.rotation.z = a.raz + (b.raz - a.raz) * t;
    limbs.leftElbow.rotation.x  = a.lex + (b.lex - a.lex) * t;
    limbs.rightElbow.rotation.x = a.rex + (b.rex - a.rex) * t;
}

// Per-configuration target values. Index 0 = right arm up-diagonal
// (sin(phase) >= 0 in the original implementation); index 1 = mirror.
const DISCO_POINT_CONFIGS = [
    // Config 0: sin(phase) >= 0 — right arm up-diagonal
    {
        lax: DISCO_POINT_LO_X,  laz: -DISCO_POINT_LO_Z,
        rax: DISCO_POINT_HI_X,  raz: DISCO_POINT_HI_Z,
        lex: DISCO_POINT_ELBOW, rex: DISCO_POINT_ELBOW,
    },
    // Config 1: sin(phase) < 0 — left arm up-diagonal (mirror)
    {
        lax: DISCO_POINT_HI_X,  laz: -DISCO_POINT_HI_Z,
        rax: DISCO_POINT_LO_X,  raz: DISCO_POINT_LO_Z,
        lex: DISCO_POINT_ELBOW, rex: DISCO_POINT_ELBOW,
    },
];

function discoPoint(limbs, phase, beats, _state) {
    addStepGroove(limbs, phase);
    // Alternates each half-beat. Continuously interpolates between the
    // two configurations across each half-beat using easeInOutSine — no
    // held pose, smooth direction reversal at the boundary.
    const cur = Math.floor(beats * 2) % 2;
    const prev = 1 - cur;
    const halfBeatFrac = (beats * 2) % 1;
    const t = smoothEase(halfBeatFrac);

    const a = DISCO_POINT_CONFIGS[prev];
    const b = DISCO_POINT_CONFIGS[cur];

    limbs.leftArm.rotation.x  = a.lax + (b.lax - a.lax) * t;
    limbs.leftArm.rotation.z  = a.laz + (b.laz - a.laz) * t;
    limbs.rightArm.rotation.x = a.rax + (b.rax - a.rax) * t;
    limbs.rightArm.rotation.z = a.raz + (b.raz - a.raz) * t;
    limbs.leftElbow.rotation.x  = a.lex + (b.lex - a.lex) * t;
    limbs.rightElbow.rotation.x = a.rex + (b.rex - a.rex) * t;
}

function runningMan(limbs, phase, _beats, state) {
    const s = Math.sin(phase);
    limbs.leftArm.rotation.x = s * RUNNING_MAN_ARM;
    limbs.rightArm.rotation.x = -s * RUNNING_MAN_ARM;
    limbs.leftLeg.rotation.x = -Math.max(0, s) * RUNNING_MAN_LEG;
    limbs.rightLeg.rotation.x = -Math.max(0, -s) * RUNNING_MAN_LEG;
    limbs.leftKnee.rotation.x  = Math.max(0,  s) * RUNNING_MAN_KNEE;
    limbs.rightKnee.rotation.x = Math.max(0, -s) * RUNNING_MAN_KNEE;
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
