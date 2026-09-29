import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFootPlant, plantFeet, RESTEP_DIST, RESTEP_S } from '../../static/js/footPlant.js';
import { neutralPose, copyPose } from '../../static/js/poses.js';

const HIP = 0.15;
const DT = 1 / 60;

// Avatar-space foot position, as the rig would place it: R(yaw)·b + d, where
// b is the body-space IK target (Three.js rotation about +Y).
function footWorld(pose, side, d) {
    const f = side === 1 ? pose.lFoot : pose.rFoot;
    const bx = side * (HIP + f.x), bz = f.z;
    return {
        x: bx * Math.cos(d.yaw) + bz * Math.sin(d.yaw) + d.x,
        z: -bx * Math.sin(d.yaw) + bz * Math.cos(d.yaw) + d.z,
    };
}

test('planted feet stay fixed in avatar space while the body drifts', () => {
    const fp = createFootPlant();
    const base = neutralPose();
    const pose = neutralPose();
    const prev = { x: 0, z: 0, yaw: 0 };
    const cur = { x: 0, z: 0, yaw: 0 };
    copyPose(base, pose);
    plantFeet(fp, pose, prev, cur, 0, HIP, DT);
    const startL = footWorld(pose, 1, cur), startR = footWorld(pose, -1, cur);
    // Small drift, well under the re-step distance.
    for (let i = 1; i <= 20; i++) {
        Object.assign(prev, cur);
        cur.x = 0.002 * i; cur.z = -0.001 * i; cur.yaw = 0.01 * i;
        copyPose(base, pose);
        plantFeet(fp, pose, prev, cur, 0, HIP, DT);
        const l = footWorld(pose, 1, cur), r = footWorld(pose, -1, cur);
        assert.ok(Math.hypot(l.x - startL.x, l.z - startL.z) < 1e-9);
        assert.ok(Math.hypot(r.x - startR.x, r.z - startR.z) < 1e-9);
    }
    assert.equal(fp.stepFoot, -1);
});

test('pose-driven foot motion is not cancelled', () => {
    const fp = createFootPlant();
    const pose = neutralPose();
    const d = { x: 0.1, z: 0.05, yaw: 0.3 };   // drift not changing
    pose.lFoot.z = 0.1;
    plantFeet(fp, pose, d, d, 0, HIP, DT);
    const a = footWorld(pose, 1, d);
    const p2 = neutralPose();
    p2.lFoot.z = 0.2;
    plantFeet(fp, p2, d, d, 0, HIP, DT);
    const b = footWorld(p2, 1, d);
    // The 0.1 body-space slide shows up in full, rotated by yaw.
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 0.1) < 1e-9);
});

test('lifted and walking feet let the compensation decay', () => {
    const fp = createFootPlant();
    fp.l.x = 0.05; fp.r.x = 0.05;
    const d = { x: 0, z: 0, yaw: 0 };
    const pose = neutralPose();
    pose.lFoot.y = 0.1;                         // left lifted by the pose
    plantFeet(fp, pose, d, d, 0, HIP, DT);
    assert.ok(fp.l.x < 0.05 && fp.l.x > 0);
    assert.equal(fp.r.x, 0.05);                 // right still planted
    plantFeet(fp, neutralPose(), d, d, 1, HIP, DT);   // walking
    assert.ok(fp.r.x < 0.05);
});

test('a planted foot far behind re-steps, one foot at a time', () => {
    const fp = createFootPlant();
    fp.l.x = RESTEP_DIST + 0.01;
    fp.r.x = RESTEP_DIST + 0.005;
    const d = { x: 0, z: 0, yaw: 0 };
    plantFeet(fp, neutralPose(), d, d, 0, HIP, DT);
    assert.equal(fp.stepFoot, 0);               // the further-behind foot first
    let maxLift = 0;
    for (let t = 0; t < RESTEP_S - 1e-9; t += DT) {
        const pose = neutralPose();
        plantFeet(fp, pose, d, d, 0, HIP, DT);
        if (fp.stepFoot === 0) {
            maxLift = Math.max(maxLift, pose.lFoot.y);
            assert.equal(pose.rFoot.y, 0);      // other foot waits on the floor
        }
    }
    assert.ok(maxLift > 0.04);
    assert.ok(Math.abs(fp.l.x) < RESTEP_DIST);  // caught up (slightly past)
    assert.equal(fp.stepFoot, 1);               // right foot's turn now
});
