// Per-frame avatar animation: picks the pose sources (idle, dance, walk),
// crossfades between them, applies the result to the rig, solves leg IK so
// the feet stay planted, and drifts the body around while dancing.
//
// Single entry point for both the local player and remote players:
//   updateAnimator(avatar, { signedSpeed, moveId, dt })

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { neutralPose, copyPose, blendPose, smoothEase } from './poses.js';
import { dancePose, isDanceMove, BPM_HZ } from './danceAnimation.js';
import { walkPose, WALK_CYCLE_HZ } from './walkAnimation.js';
import { idlePose } from './idleAnimation.js';
import { driftTarget } from './drift.js';
import { styleFromSeed } from './style.js';
import { solveLeg } from './ik.js';

const MAX_DT = 0.1;          // cap so a backgrounded tab doesn't spike poses
const CROSSFADE_S = 0.3;     // between dance moves / idle
const WALK_EASE_RATE = 10;   // exponential smoothing toward walk intensity
const DRIFT_EASE_RATE = 3;   // body follows the drift target
const DRIFT_RETURN_RATE = 8; // body snaps back faster when walking starts
const TWO_PI = Math.PI * 2;

function initState(avatar) {
    return {
        style: styleFromSeed(avatar.userData.colorSeed ?? 0),
        moveId: 'idle',
        fade: 1,
        fromPose: neutralPose(),     // snapshot at the last move change
        livePose: neutralPose(),     // current source (dance or idle)
        stationary: neutralPose(),   // fromPose → livePose crossfade
        walk: neutralPose(),
        final: neutralPose(),
        walkPhase: 0,
        walkIntensity: 0,
        danceWeight: 0,
        drift: { x: 0, z: 0, yaw: 0, liftL: 0, liftR: 0 },
        driftTarget: { x: 0, z: 0, yaw: 0, liftL: 0, liftR: 0 },
    };
}

/**
 * @param {THREE.Group} avatar - from createAvatar
 * @param {{signedSpeed:number, moveId:string, dt:number}} input
 *     signedSpeed: world units/sec along the facing (negative = backward)
 */
export function updateAnimator(avatar, { signedSpeed, moveId, dt }) {
    const rig = avatar.userData.rig;
    let s = avatar.userData.anim;
    if (!s) s = avatar.userData.anim = initState(avatar);
    dt = Math.min(Math.max(dt, 0), MAX_DT);

    const nowS = performance.now() / 1000;
    const beats = nowS * BPM_HZ + s.style.timing;

    // --- walk intensity + gait phase ---
    const speedFrac = Math.min(Math.abs(signedSpeed) / CONFIG.MOVEMENT_SPEED, 1);
    s.walkIntensity += (speedFrac - s.walkIntensity) * (1 - Math.exp(-dt * WALK_EASE_RATE));
    s.walkPhase = (s.walkPhase + dt * WALK_CYCLE_HZ * TWO_PI * speedFrac) % TWO_PI;

    // --- stationary source with crossfade on move change ---
    const dancing = isDanceMove(moveId);
    const id = dancing ? moveId : 'idle';
    if (id !== s.moveId) {
        copyPose(s.stationary, s.fromPose);   // freeze what we're showing now
        s.moveId = id;
        s.fade = 0;
    }
    s.fade = Math.min(1, s.fade + dt / CROSSFADE_S);
    if (dancing) dancePose(id, beats, s.style, s.livePose);
    else idlePose(nowS, s.style, s.livePose);
    blendPose(s.fromPose, s.livePose, smoothEase(s.fade), s.stationary);

    // --- walk on top ---
    walkPose(s.walkPhase, signedSpeed >= 0 ? 1 : -1, s.walk);
    blendPose(s.stationary, s.walk, s.walkIntensity, s.final);

    // --- drift (visual only; the networked position never moves) ---
    const danceTarget = dancing ? 1 : 0;
    s.danceWeight += (danceTarget - s.danceWeight) * (1 - Math.exp(-dt * 4));
    const w = s.danceWeight * (1 - s.walkIntensity);
    driftTarget(beats, s.style, s.driftTarget);
    const rate = s.walkIntensity > 0.05 ? DRIFT_RETURN_RATE : DRIFT_EASE_RATE;
    const a = 1 - Math.exp(-dt * rate);
    s.drift.x += (s.driftTarget.x * w - s.drift.x) * a;
    s.drift.z += (s.driftTarget.z * w - s.drift.z) * a;
    s.drift.yaw += (s.driftTarget.yaw * w - s.drift.yaw) * a;
    s.final.lFoot.y += s.driftTarget.liftL * w;
    s.final.rFoot.y += s.driftTarget.liftR * w;
    rig.body.position.set(s.drift.x, 0, s.drift.z);
    rig.body.rotation.set(0, s.drift.yaw, 0);

    applyPose(rig, s.final);
}

// Reused scratch objects (no per-frame allocation).
const _hipPos = new THREE.Vector3();
const _target = { x: 0, y: 0, z: 0 };
const _euler = new THREE.Euler();
const _qBody = new THREE.Quaternion();
const _qPelvisInv = new THREE.Quaternion();
const _qShin = new THREE.Quaternion();
const _qFoot = new THREE.Quaternion();
const _qKnee = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);

function applyArm(shoulder, elbow, wrist, arm, side) {
    // sy/sz/wz are mirrored so positive always means "outward".
    shoulder.rotation.set(arm.sx, side * arm.sy, side * arm.sz);
    elbow.rotation.set(-arm.e, 0, 0);
    wrist.rotation.set(arm.wx, 0, side * arm.wz);
}

function applyLeg(rig, hip, knee, ankle, foot, side) {
    const d = rig.dims;
    _hipPos.copy(hip.position).applyMatrix4(rig.pelvis.matrix);   // body space
    _target.x = side * (d.hipOffsetX + foot.x);
    _target.y = d.ankleHeight + foot.y;
    _target.z = foot.z;
    const sol = solveLeg(_hipPos, _target, d.thighLen, d.shinLen);

    // Thigh orientation in body space, then expressed relative to the pelvis.
    _qBody.setFromEuler(_euler.set(sol.pitch, 0, sol.roll, 'ZXY'));
    _qPelvisInv.copy(rig.pelvis.quaternion).invert();
    hip.quaternion.copy(_qPelvisInv).multiply(_qBody);
    knee.rotation.set(sol.knee, 0, 0);

    // Keep the sole level (plus any requested toe pitch) regardless of leg angle.
    _qKnee.setFromAxisAngle(_xAxis, sol.knee);
    _qShin.copy(_qBody).multiply(_qKnee).invert();
    _qFoot.setFromAxisAngle(_xAxis, foot.pitch);
    ankle.quaternion.copy(_qShin).multiply(_qFoot);
}

function applyPose(rig, pose) {
    const d = rig.dims;
    const p = pose.pelvis;
    rig.pelvis.position.set(p.x, d.pelvisRestY + p.y, p.z);
    rig.pelvis.rotation.set(p.rx, p.ry, p.rz);
    rig.pelvis.updateMatrix();
    rig.spine.rotation.set(pose.spine.rx, pose.spine.ry, pose.spine.rz);
    rig.chest.rotation.set(pose.chest.rx, pose.chest.ry, pose.chest.rz);
    rig.neck.rotation.set(pose.neck.rx, pose.neck.ry, pose.neck.rz);
    applyArm(rig.lShoulder, rig.lElbow, rig.lWrist, pose.lArm, 1);
    applyArm(rig.rShoulder, rig.rElbow, rig.rWrist, pose.rArm, -1);
    applyLeg(rig, rig.lHip, rig.lKnee, rig.lAnkle, pose.lFoot, 1);
    applyLeg(rig, rig.rHip, rig.rKnee, rig.rAnkle, pose.rFoot, -1);
}
