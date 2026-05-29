// Blocky humanoid avatar built from box geometries. Limb references are stored
// on the returned group's userData so future dancing animation code can grab
// and rotate them without searching the hierarchy.

import * as THREE from 'three';

// Deterministic pseudo-random from the player's color_seed.
function mulberry32(seed) {
    let t = seed >>> 0;
    return function next() {
        t = (t + 0x6d2b79f5) >>> 0;
        let r = t;
        r = Math.imul(r ^ (r >>> 15), r | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

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

function pickColor(rand, palette) {
    return palette[Math.floor(rand() * palette.length)];
}

function flatMat(color) {
    return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.0,
        flatShading: true,
    });
}

/**
 * Build an avatar group at origin. Caller positions/rotates it.
 * @param {number} colorSeed - integer used as deterministic palette seed.
 */
export function createAvatar(colorSeed) {
    const rand = mulberry32(colorSeed);
    const shirtMat = flatMat(pickColor(rand, SHIRT_PALETTE));
    const pantsMat = flatMat(pickColor(rand, PANTS_PALETTE));
    const skinMat = flatMat(pickColor(rand, SKIN_PALETTE));

    const group = new THREE.Group();

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.4), shirtMat);
    torso.position.y = 1.5;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skinMat);
    head.position.y = 2.3;
    group.add(head);

    // Arms: shoulder pivot → upper arm + elbow pivot → forearm.
    // Hip/shoulder rotations swing the whole limb; elbow/knee rotations bend it.
    const armSegGeo = new THREE.BoxGeometry(0.22, 0.45, 0.22);
    armSegGeo.translate(0, -0.225, 0); // pivot at top of each segment

    function buildArm(xPos) {
        const shoulder = new THREE.Group();
        shoulder.position.set(xPos, 2.0, 0);
        shoulder.add(new THREE.Mesh(armSegGeo, shirtMat));   // upper arm
        const elbow = new THREE.Group();
        elbow.position.set(0, -0.45, 0);
        elbow.add(new THREE.Mesh(armSegGeo, shirtMat));      // forearm
        shoulder.add(elbow);
        return { shoulder, elbow };
    }

    const leftArmJoints = buildArm(-0.51);
    const rightArmJoints = buildArm(0.51);
    group.add(leftArmJoints.shoulder);
    group.add(rightArmJoints.shoulder);

    // Legs: hip pivot → thigh + knee pivot → shin.
    const legSegGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
    legSegGeo.translate(0, -0.25, 0);

    function buildLeg(xPos) {
        const hip = new THREE.Group();
        hip.position.set(xPos, 1.0, 0);
        hip.add(new THREE.Mesh(legSegGeo, pantsMat));         // thigh
        const knee = new THREE.Group();
        knee.position.set(0, -0.5, 0);
        knee.add(new THREE.Mesh(legSegGeo, pantsMat));        // shin
        hip.add(knee);
        return { hip, knee };
    }

    const leftLegJoints = buildLeg(-0.22);
    const rightLegJoints = buildLeg(0.22);
    group.add(leftLegJoints.hip);
    group.add(rightLegJoints.hip);

    group.userData.limbs = {
        leftArm: leftArmJoints.shoulder,
        rightArm: rightArmJoints.shoulder,
        leftLeg: leftLegJoints.hip,
        rightLeg: rightLegJoints.hip,
        leftElbow: leftArmJoints.elbow,
        rightElbow: rightArmJoints.elbow,
        leftKnee: leftLegJoints.knee,
        rightKnee: rightLegJoints.knee,
        head,
        torso,
    };

    return group;
}
