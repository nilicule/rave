import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveLeg } from '../../static/js/ik.js';

const THIGH = 0.45;
const SHIN = 0.45;

// Direction of a bone hanging along -Y after Rz(roll) * Rx(angle).
function boneDir(angle, roll) {
    const c = Math.cos(angle);
    return {
        x: c * Math.sin(roll),
        y: -c * Math.cos(roll),
        z: -Math.sin(angle),
    };
}

// Forward kinematics matching the convention documented in ik.js.
function ankleFrom(hip, { pitch, roll, knee }) {
    const t = boneDir(pitch, roll);
    const s = boneDir(pitch + knee, roll);
    return {
        x: hip.x + THIGH * t.x + SHIN * s.x,
        y: hip.y + THIGH * t.y + SHIN * s.y,
        z: hip.z + THIGH * t.z + SHIN * s.z,
    };
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const HIP = { x: 0.17, y: 1.0, z: 0 };

test('reaches targets within reach', () => {
    const targets = [
        { x: 0.17, y: 0.12, z: 0 },      // straight below
        { x: 0.22, y: 0.2, z: 0.3 },     // forward and out
        { x: 0.05, y: 0.3, z: -0.25 },   // back and in, lifted
        { x: 0.17, y: 0.6, z: 0.2 },     // high knee
    ];
    for (const target of targets) {
        const sol = solveLeg(HIP, target, THIGH, SHIN);
        assert.ok(dist(ankleFrom(HIP, sol), target) < 1e-6,
            `missed ${JSON.stringify(target)}`);
    }
});

test('knee always bends forward, never backward', () => {
    for (let z = -0.4; z <= 0.4; z += 0.1) {
        for (let y = 0.1; y <= 0.8; y += 0.1) {
            const sol = solveLeg(HIP, { x: 0.17, y, z }, THIGH, SHIN);
            assert.ok(sol.knee >= 0, `knee ${sol.knee} at y=${y} z=${z}`);
            // Knee joint sits in front of the hip→ankle line.
            const kneePos = boneDir(sol.pitch, sol.roll);
            const ankle = ankleFrom(HIP, sol);
            const midZ = (ankle.z - HIP.z) / 2;
            assert.ok(THIGH * kneePos.z >= midZ - 1e-9);
        }
    }
});

test('unreachable target clamps along the target direction', () => {
    const target = { x: 0.17, y: -1.0, z: 0.5 };
    const sol = solveLeg(HIP, target, THIGH, SHIN);
    for (const v of Object.values(sol)) assert.ok(Number.isFinite(v));
    const ankle = ankleFrom(HIP, sol);
    const reach = dist(ankle, HIP);
    assert.ok(Math.abs(reach - (THIGH + SHIN) * 0.999) < 1e-6);
    // Same direction as the requested target.
    const want = { x: target.x - HIP.x, y: target.y - HIP.y, z: target.z - HIP.z };
    const wl = Math.hypot(want.x, want.y, want.z);
    const dot = ((ankle.x - HIP.x) * want.x + (ankle.y - HIP.y) * want.y
        + (ankle.z - HIP.z) * want.z) / (reach * wl);
    assert.ok(dot > 0.9999);
});

test('target at or above the hip stays finite and does not flip the leg', () => {
    for (const target of [{ ...HIP }, { x: 0.17, y: 1.4, z: 0.1 }]) {
        const sol = solveLeg(HIP, target, THIGH, SHIN);
        for (const v of Object.values(sol)) assert.ok(Number.isFinite(v));
        assert.ok(Math.abs(sol.roll) < Math.PI / 2, `roll ${sol.roll}`);
        assert.ok(ankleFrom(HIP, sol).y < HIP.y);
    }
});
