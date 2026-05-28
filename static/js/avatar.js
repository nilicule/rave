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

    // Arms (pivot from shoulder so future code can rotate at the shoulder joint)
    const armGeo = new THREE.BoxGeometry(0.22, 0.9, 0.22);
    armGeo.translate(0, -0.45, 0); // pivot at top of arm
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.51, 2.0, 0);
    leftArmPivot.add(new THREE.Mesh(armGeo, shirtMat));
    group.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.51, 2.0, 0);
    rightArmPivot.add(new THREE.Mesh(armGeo, shirtMat));
    group.add(rightArmPivot);

    // Legs (pivot from hip)
    const legGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
    legGeo.translate(0, -0.5, 0); // pivot at top of leg
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.22, 1.0, 0);
    leftLegPivot.add(new THREE.Mesh(legGeo, pantsMat));
    group.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.22, 1.0, 0);
    rightLegPivot.add(new THREE.Mesh(legGeo, pantsMat));
    group.add(rightLegPivot);

    // TODO (dancing): drive these pivot rotations from animation state.
    group.userData.limbs = {
        leftArm: leftArmPivot,
        rightArm: rightArmPivot,
        leftLeg: leftLegPivot,
        rightLeg: rightLegPivot,
        head,
        torso,
    };

    return group;
}
