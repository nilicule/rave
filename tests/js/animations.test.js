import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSE_SHAPE, neutralPose } from '../../static/js/poses.js';
import { dancePose, isDanceMove } from '../../static/js/danceAnimation.js';
import { walkPose } from '../../static/js/walkAnimation.js';
import { idlePose } from '../../static/js/idleAnimation.js';
import { styleFromSeed } from '../../static/js/style.js';

const MOVES = ['fist_pump', 'hands_air', 'two_step', 'big_fish', 'disco_point', 'running_man'];

function assertFinitePose(pose, label) {
    for (const [part, keys] of Object.entries(POSE_SHAPE)) {
        for (const k of keys) {
            assert.ok(Number.isFinite(pose[part][k]), `${label}: ${part}.${k} = ${pose[part][k]}`);
        }
    }
}

test('every dance move produces a finite pose for any beat', () => {
    const out = neutralPose();
    for (const seed of [1, 2, 3]) {
        const style = styleFromSeed(seed);
        for (const move of MOVES) {
            assert.ok(isDanceMove(move));
            for (let beats = -3; beats < 64; beats += 0.13) {
                dancePose(move, beats, style, out);
                assertFinitePose(out, `${move}@${beats}`);
            }
        }
    }
});

test('idle and unknown ids are not dance moves', () => {
    assert.equal(isDanceMove('idle'), false);
    assert.equal(isDanceMove('toString'), false);
    assert.equal(isDanceMove('nope'), false);
});

test('dance moves are continuous frame to frame (no pops)', () => {
    const style = styleFromSeed(5);
    const a = neutralPose();
    const b = neutralPose();
    const step = 1 / 60 * (128 / 60);   // one 60 fps frame, in beats
    for (const move of MOVES) {
        for (let beats = 0; beats < 16; beats += step) {
            dancePose(move, beats, style, a);
            dancePose(move, beats + step, style, b);
            for (const [part, keys] of Object.entries(POSE_SHAPE)) {
                for (const k of keys) {
                    const jump = Math.abs(a[part][k] - b[part][k]);
                    assert.ok(jump < 0.35, `${move} ${part}.${k} jumps ${jump} at ${beats}`);
                }
            }
        }
    }
});

test('walk and idle produce finite poses', () => {
    const out = neutralPose();
    const style = styleFromSeed(11);
    for (let p = 0; p < 20; p += 0.1) {
        walkPose(p, 1, out); assertFinitePose(out, `walk+ ${p}`);
        walkPose(p, -1, out); assertFinitePose(out, `walk- ${p}`);
        idlePose(p, style, out); assertFinitePose(out, `idle ${p}`);
    }
});

test('walk pelvis twist and shoulder rotation correspond to foot position', () => {
    const out = neutralPose();
    // At phase = π/2, sin(phase) = 1, so s = 1
    const phase = Math.PI / 2;

    // Forward walk: direction = 1
    walkPose(phase, 1, out);
    assert.ok(out.lFoot.z > 0, 'at phase=π/2, direction=1: left foot forward (lFoot.z > 0)');
    assert.ok(out.pelvis.ry < 0, 'at phase=π/2, direction=1: pelvis rotates back (pelvis.ry < 0)');
    assert.ok(out.chest.ry > 0, 'at phase=π/2, direction=1: shoulders counter-rotate (chest.ry > 0)');

    // Backward walk: direction = -1
    walkPose(phase, -1, out);
    assert.ok(out.lFoot.z < 0, 'at phase=π/2, direction=-1: left foot backward (lFoot.z < 0)');
    assert.ok(out.pelvis.ry > 0, 'at phase=π/2, direction=-1: pelvis rotates forward (pelvis.ry > 0)');
    assert.ok(out.chest.ry < 0, 'at phase=π/2, direction=-1: shoulders counter-rotate (chest.ry < 0)');
});
