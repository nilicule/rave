// Stylized mannequin avatar: rounded capsule segments on a hierarchical rig
// (body → pelvis → spine → chest → neck → head, with arms off the chest and
// legs off the pelvis). animator.js drives the joints via userData.rig.
//
// Geometries are shared by every avatar (built once, flagged
// userData.shared so disposal skips them); materials are per avatar.

import * as THREE from 'three';
import { mulberry32 } from './style.js';

// Bright rave palette. Picked from a perceptual high-saturation set.
const SHIRT_PALETTE = [
    0xff3366, 0xff8800, 0xffd400, 0x33ff66, 0x00d9ff,
    0x6633ff, 0xff33cc, 0xffffff, 0xff5050, 0x66ff33,
];
const PANTS_PALETTE = [
    0x222222, 0x4422aa, 0x882244, 0x114488, 0x223344,
    0xaa3322, 0x335533, 0x553355, 0x444444, 0x222244,
];
const SKIN_PALETTE = [
    0xffd2a0, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524,
    0xffe0bd, 0xb07a48,
];
const SHOE_PALETTE = [0xffffff, 0x111111, 0xff3366, 0x00d9ff, 0xffd400];
const ACCESSORIES = ['none', 'cap', 'headband'];
// Accessories sit above the eyes (head-local y = 0.04) so they never hide them.
const CAP_Y = 0.1;
const HEADBAND_Y = 0.13;
const HEAD_SCALE = [0.9, 1, 0.95];

// Rig proportions (world units). Total height ≈ 2.55.
export const DIMS = Object.freeze({
    ankleHeight: 0.12,     // ankle joint above the floor
    shinLen: 0.48,
    thighLen: 0.5,
    hipOffsetX: 0.15,      // hip joints either side of the pelvis centre
    hipDropY: 0.06,        // hip joints below the pelvis pivot
    pelvisRestY: 1.15,     // leaves a slight knee bend (~16°) when standing
    shoulderX: 0.3,
    upperArmLen: 0.36,
    forearmLen: 0.34,
});

function pickColor(rand, palette) {
    return palette[Math.floor(rand() * palette.length)];
}

function mat(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
}

// A capsule hanging down from its pivot: spans +r above to -(len + r) below,
// so the rounded caps overlap the joints and hide gaps when they bend.
function limbGeo(radius, len) {
    return new THREE.CapsuleGeometry(radius, len, 4, 10).translate(0, -len / 2, 0);
}

let GEO = null;
function sharedGeometries() {
    if (GEO) return GEO;
    GEO = {
        pelvis: new THREE.CapsuleGeometry(0.16, 0.22, 4, 12).rotateZ(Math.PI / 2),
        abdomen: new THREE.CapsuleGeometry(0.17, 0.12, 4, 12),
        chest: new THREE.CapsuleGeometry(0.22, 0.2, 4, 12),
        neck: new THREE.CapsuleGeometry(0.07, 0.12, 2, 8),
        head: new THREE.SphereGeometry(0.25, 20, 14),
        eye: new THREE.SphereGeometry(0.035, 8, 6),
        upperArm: limbGeo(0.085, DIMS.upperArmLen),
        forearm: limbGeo(0.075, DIMS.forearmLen),
        hand: new THREE.SphereGeometry(0.08, 10, 8),
        thigh: limbGeo(0.12, DIMS.thighLen),
        shin: limbGeo(0.1, DIMS.shinLen),
        foot: new THREE.CapsuleGeometry(0.085, 0.16, 4, 10).rotateX(Math.PI / 2),
        // Spherical cap hugging the head from y = CAP_Y up (not a full
        // hemisphere, which would stand proud of the head once raised).
        capDome: new THREE.SphereGeometry(0.265, 20, 10, 0, Math.PI * 2, 0, Math.acos(CAP_Y / 0.265)),
        capBrim: new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20),
        headband: new THREE.TorusGeometry(0.24, 0.035, 8, 24).rotateX(Math.PI / 2),
    };
    for (const g of Object.values(GEO)) g.userData.shared = true;
    return GEO;
}

function pivot(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
}

function mesh(parent, geo, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
}

/**
 * Build an avatar group at origin. Caller positions/rotates it.
 * @param {number} colorSeed - integer used as deterministic palette seed.
 */
export function createAvatar(colorSeed) {
    const G = sharedGeometries();
    const rand = mulberry32(colorSeed);
    // Draw order matches the old avatar so players keep their colors.
    const shirtMat = mat(pickColor(rand, SHIRT_PALETTE));
    const pantsMat = mat(pickColor(rand, PANTS_PALETTE));
    const skinMat = mat(pickColor(rand, SKIN_PALETTE));
    const shoeMat = mat(pickColor(rand, SHOE_PALETTE));
    const accessory = ACCESSORIES[Math.floor(rand() * ACCESSORIES.length)];
    const accentMat = mat(pickColor(rand, SHIRT_PALETTE));
    const eyeMat = mat(0x111111);

    const group = new THREE.Group();
    const body = pivot(group, 0, 0, 0);

    const pelvis = pivot(body, 0, DIMS.pelvisRestY, 0);
    mesh(pelvis, G.pelvis, pantsMat, 0, 0, 0, 1, 1, 0.8);

    const spine = pivot(pelvis, 0, 0.08, 0);
    mesh(spine, G.abdomen, shirtMat, 0, 0.14, 0, 1.15, 1, 0.8);

    const chest = pivot(spine, 0, 0.32, 0);
    mesh(chest, G.chest, shirtMat, 0, 0.2, 0, 1.25, 1, 0.8);

    const neck = pivot(chest, 0, 0.45, 0);
    mesh(neck, G.neck, skinMat, 0, 0.08, 0);

    const head = pivot(neck, 0, 0.3, 0);
    mesh(head, G.head, skinMat, 0, 0, 0, ...HEAD_SCALE);
    mesh(head, G.eye, eyeMat, 0.08, 0.04, 0.22);
    mesh(head, G.eye, eyeMat, -0.08, 0.04, 0.22);
    if (accessory === 'cap') {
        // Dome shares the head's centre and squash so it sits snugly on top.
        mesh(head, G.capDome, accentMat, 0, 0, 0, ...HEAD_SCALE);
        // Brim tipped up slightly so it doesn't shade the eyes from a
        // raised chase camera.
        mesh(head, G.capBrim, accentMat, 0, CAP_Y, 0.17, 1, 1, 0.9).rotation.x = -0.2;
    } else if (accessory === 'headband') {
        // Scaled like the head so the band hugs it instead of floating.
        mesh(head, G.headband, accentMat, 0, HEADBAND_Y, 0, ...HEAD_SCALE);
    }

    // side: +1 = left (+X), -1 = right.
    function buildArm(side) {
        const shoulder = pivot(chest, side * DIMS.shoulderX, 0.3, 0);
        mesh(shoulder, G.upperArm, shirtMat);
        const elbow = pivot(shoulder, 0, -DIMS.upperArmLen, 0);
        mesh(elbow, G.forearm, skinMat);
        const wrist = pivot(elbow, 0, -DIMS.forearmLen, 0);
        mesh(wrist, G.hand, skinMat, 0, -0.08, 0, 0.9, 1.3, 0.6);
        return { shoulder, elbow, wrist };
    }

    function buildLeg(side) {
        const hip = pivot(pelvis, side * DIMS.hipOffsetX, -DIMS.hipDropY, 0);
        mesh(hip, G.thigh, pantsMat);
        const knee = pivot(hip, 0, -DIMS.thighLen, 0);
        mesh(knee, G.shin, pantsMat);
        const ankle = pivot(knee, 0, -DIMS.shinLen, 0);
        mesh(ankle, G.foot, shoeMat, 0, -0.06, 0.07, 1.1, 0.7, 1);
        return { hip, knee, ankle };
    }

    const lArm = buildArm(1), rArm = buildArm(-1);
    const lLeg = buildLeg(1), rLeg = buildLeg(-1);

    group.userData.rig = {
        body, pelvis, spine, chest, neck, head,
        lShoulder: lArm.shoulder, lElbow: lArm.elbow, lWrist: lArm.wrist,
        rShoulder: rArm.shoulder, rElbow: rArm.elbow, rWrist: rArm.wrist,
        lHip: lLeg.hip, lKnee: lLeg.knee, lAnkle: lLeg.ankle,
        rHip: rLeg.hip, rKnee: rLeg.knee, rAnkle: rLeg.ankle,
        dims: DIMS,
    };
    group.userData.colorSeed = colorSeed;

    return group;
}
