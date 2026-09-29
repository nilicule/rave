import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driftTarget, DRIFT_RADIUS, DRIFT_MAX_YAW } from '../../static/js/drift.js';
import { styleFromSeed } from '../../static/js/style.js';

test('drift stays within radius and yaw bounds', () => {
    for (const seed of [0, 1, 42, 123456, 0xffffffff]) {
        const style = styleFromSeed(seed);
        const out = {};
        for (let beats = 0; beats < 2000; beats += 0.37) {
            driftTarget(beats, style, out);
            assert.ok(Math.hypot(out.x, out.z) <= DRIFT_RADIUS + 1e-9);
            assert.ok(Math.abs(out.yaw) <= DRIFT_MAX_YAW);
            assert.ok(out.liftL >= 0 && out.liftR >= 0);
            assert.ok(!(out.liftL > 0 && out.liftR > 0), 'one foot at a time');
        }
    }
});

test('drift is continuous across phrase boundaries', () => {
    const style = styleFromSeed(7);
    const a = driftTarget(15.9999, style, {});
    const b = driftTarget(16.0001, style, {});
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-3);
});

test('same seed gives the same drift on every client', () => {
    const a = driftTarget(123.4, styleFromSeed(99), {});
    const b = driftTarget(123.4, styleFromSeed(99), {});
    assert.deepEqual(a, b);
});
