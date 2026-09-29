import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSE_SHAPE, neutralPose, blendPose, copyPose } from '../../static/js/poses.js';

function randomPose(seed) {
    const pose = neutralPose();
    let i = seed;
    for (const [part, keys] of Object.entries(POSE_SHAPE)) {
        for (const k of keys) pose[part][k] = Math.sin(i++ * 12.9898) * 2;
    }
    return pose;
}

test('blendPose endpoints return the inputs', () => {
    const a = randomPose(1);
    const b = randomPose(100);
    assert.deepEqual(blendPose(a, b, 0, neutralPose()), a);
    assert.deepEqual(blendPose(a, b, 1, neutralPose()), b);
});

test('blendPose midpoint averages every field and may alias its input', () => {
    const a = randomPose(1);
    const b = randomPose(100);
    const expected = neutralPose();
    for (const [part, keys] of Object.entries(POSE_SHAPE)) {
        for (const k of keys) expected[part][k] = (a[part][k] + b[part][k]) / 2;
    }
    const out = copyPose(a, neutralPose());
    blendPose(out, b, 0.5, out);
    for (const [part, keys] of Object.entries(POSE_SHAPE)) {
        for (const k of keys) assert.ok(Math.abs(out[part][k] - expected[part][k]) < 1e-12);
    }
});
