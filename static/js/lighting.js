// Moving-head searchlights mounted along the top truss. Each fixture combines:
//   - a SpotLight that actually illuminates the scene (avatars, ground, etc.)
//   - a transparent additive cone mesh that fakes a visible volumetric beam
//   - a small box "fixture" hanging from the truss for visual grounding
//
// Three "personalities" of head, chosen by index:
//   - WASH      (corners, i=0 and i=COUNT-1): wide ~20° cone, gentle drift
//                aimed in front of the stage so the crowd stays lit.
//   - SKY BEAM  (central ~40%): narrow ~13° cone aimed straight up at the
//                night sky with a small lateral sweep. Adds vertical drama
//                without dumping cones across the screen plane.
//   - SCANNER   (the rest, between washes and sky beams): narrow ~13° cone,
//                fast sine sweeps across the dance floor, full hue cycle.
// Keeping the central group pointing up (rather than at the floor) keeps the
// scanner cones from piling up additively in front of the screen.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const BEAM_LENGTH = 16;                  // visual length of the volumetric cone (pre-scale)
const SCANNER_HALF_ANGLE = Math.PI / 14; // ~13°
const WASH_HALF_ANGLE = Math.PI / 9;     // ~20°
const BEAM_RADIUS = BEAM_LENGTH * Math.tan(SCANNER_HALF_ANGLE);

// Non-uniform scale factor that widens a scanner-sized cone into a wash cone
// without needing a second geometry.
const WASH_RADIUS_FACTOR =
    Math.tan(WASH_HALF_ANGLE) / Math.tan(SCANNER_HALF_ANGLE);

const FIXTURE_DROP = 0.6;  // how far the light bulb hangs below the truss beam
const SKY_AIM_Y = 26;      // aim height for sky beams (above the truss, into starfield)
// Floor-aimed beams target a point a few units BELOW the ground so the cone
// axis crosses y=0 partway along its length and the walls visibly intersect
// the ground regardless of how far away the beam is aimed. For shallow
// (long) sweeps a fixed-distance overshoot dips too little under the floor.
const FLOOR_AIM_Y = -3;
// Additional reach in cone-direction past the aim point — gives a bit of
// safety margin and lets sky beams extend further into the dark sky.
const BEAM_OVERSHOOT = 4;

function classifyHead(i, total) {
    if (i === 0 || i === total - 1) return 'wash';
    // Middle ~40% of lights point at the sky. For COUNT=10 this is i in [3..6].
    const skyStart = Math.floor(total * 0.3);
    const skyEnd = Math.ceil(total * 0.7);
    if (i >= skyStart && i < skyEnd) return 'sky';
    return 'scanner';
}

export function createClubLights(scene) {
    const fixtureMat = new THREE.MeshStandardMaterial({
        color: 0x080808, roughness: 0.5, metalness: 0.7, flatShading: true,
    });

    // Single shared cone geometry. Apex at local origin, base extending along
    // +Z so Object3D.lookAt() (which points local +Z at the target for meshes
    // — opposite of cameras/lights) aims the cone correctly.
    const beamGeo = new THREE.ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 32, 1, true);
    beamGeo.translate(0, -BEAM_LENGTH / 2, 0);
    beamGeo.rotateX(-Math.PI / 2);

    // Must match the truss Z used in stage.js (in front of the screen so
    // cones stay clear of the hole-punch plane).
    const trussZ = CONFIG.STAGE_Z - 2.0;
    const heads = [];

    for (let i = 0; i < CONFIG.SEARCHLIGHT_COUNT; i++) {
        const kind = classifyHead(i, CONFIG.SEARCHLIGHT_COUNT);
        const isWash = kind === 'wash';
        const isSky = kind === 'sky';

        // Distribute evenly along the top truss.
        const t = CONFIG.SEARCHLIGHT_COUNT === 1
            ? 0.5
            : i / (CONFIG.SEARCHLIGHT_COUNT - 1);
        const fixtureX = (t - 0.5) * (CONFIG.TRUSS_HALF_SPAN * 2 - 1.5);
        const fixtureY = CONFIG.TRUSS_Y - FIXTURE_DROP;

        // Fixture body.
        const fixture = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.6, 0.45),
            fixtureMat,
        );
        fixture.position.set(fixtureX, fixtureY + 0.1, trussZ);
        scene.add(fixture);

        // Yoke (the small ring above the bulb that the moving head pivots on).
        const yoke = new THREE.Mesh(
            new THREE.TorusGeometry(0.25, 0.05, 8, 16),
            fixtureMat,
        );
        yoke.position.set(fixtureX, fixtureY + 0.45, trussZ);
        yoke.rotation.x = Math.PI / 2;
        scene.add(yoke);

        const halfAngle = isWash ? WASH_HALF_ANGLE : SCANNER_HALF_ANGLE;

        const spot = new THREE.SpotLight(
            0xffffff,
            isWash ? 8 : 10,
            BEAM_LENGTH + 14,        // distance: cover the full reach incl. overshoot
            halfAngle * 1.05,
            isWash ? 0.55 : 0.45,
            1.0,                     // decay: lower so the light actually reaches the floor
        );
        spot.position.set(fixtureX, fixtureY, trussZ);
        scene.add(spot);

        const target = new THREE.Object3D();
        scene.add(target);
        spot.target = target;

        const beamMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.10,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false,
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(fixtureX, fixtureY, trussZ);
        scene.add(beam);

        heads.push({
            spot,
            target,
            beam,
            beamMat,
            kind,
            fixturePos: new THREE.Vector3(fixtureX, fixtureY, trussZ),
            radialFactor: isWash ? WASH_RADIUS_FACTOR : 1,
            // Sweep params per kind. Scanners get prime-ish per-index values
            // so they don't sync up; washes and sky beams move noticeably
            // slower but still lively.
            sweepSpeedX: isWash ? 0.40 : isSky ? 0.45 : (0.50 + (i % 4) * 0.13),
            sweepSpeedZ: isWash ? 0.28 : isSky ? 0.32 : (0.38 + (i % 5) * 0.11),
            phaseX: i * 0.73,
            phaseZ: i * 1.21,
            ampX: isWash ? 4.0 : isSky ? 4.0 : (9 + (i % 3) * 2),
            ampZ: isWash ? 2.5 : isSky ? 3.0 : (3.5 + (i % 4) * 0.8),
            // Scanners orbit around centerZ; sky beams sweep around their own
            // fixture position; washes focus a bit in front of the crowd.
            centerZ: isWash ? 2.0 : (2 + ((i * 1.7) % 4)),
            aimY: isSky ? SKY_AIM_Y : FLOOR_AIM_Y,
            hueOffset: i / CONFIG.SEARCHLIGHT_COUNT,
            hueSpeed: isWash ? 0.08 : 0.12,
            pulseSpeed: isWash ? 2.6 : (3.4 + (i % 3) * 0.8),
            pulsePhase: i * 1.9,
            // Intensity / opacity ranges, scanner cones reduced so multiple
            // overlapping cones don't wash out the screen behind them.
            intensityBase: isWash ? 5 : isSky ? 6 : 6,
            intensityPulse: isWash ? 5 : isSky ? 8 : 9,
            opacityBase: isWash ? 0.10 : isSky ? 0.10 : 0.05,
            opacityPulse: isWash ? 0.07 : isSky ? 0.09 : 0.07,
        });
    }

    return {
        update(elapsed) {
            for (const h of heads) {
                // Aim point. Scanners and washes aim at world X/Z; sky beams
                // sweep around their own fixture column.
                let aimX, aimZ;
                if (h.kind === 'sky') {
                    aimX = h.fixturePos.x + Math.sin(elapsed * h.sweepSpeedX + h.phaseX) * h.ampX;
                    aimZ = h.fixturePos.z + Math.cos(elapsed * h.sweepSpeedZ + h.phaseZ) * h.ampZ;
                } else {
                    aimX = Math.sin(elapsed * h.sweepSpeedX + h.phaseX) * h.ampX;
                    aimZ = h.centerZ + Math.cos(elapsed * h.sweepSpeedZ + h.phaseZ) * h.ampZ;
                }
                h.target.position.set(aimX, h.aimY, aimZ);

                // Aim and stretch the volumetric cone so the base OVERSHOOTS
                // the aim point by BEAM_OVERSHOOT. Floor cones get clipped by
                // the ground (depth test), so they appear to land cleanly on
                // it; sky cones extend past their aim into the dark sky.
                h.beam.lookAt(aimX, h.aimY, aimZ);
                const dx = aimX - h.fixturePos.x;
                const dy = h.aimY - h.fixturePos.y;
                const dz = aimZ - h.fixturePos.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const reach = distance + BEAM_OVERSHOOT;
                const lengthScale = reach / BEAM_LENGTH;
                const radialScale = lengthScale * h.radialFactor;
                h.beam.scale.set(radialScale, radialScale, lengthScale);

                // Hue rotates slowly per light, offset per index so the rig
                // is colourful at any instant. Washes cycle slower.
                const hue = (elapsed * h.hueSpeed + h.hueOffset) % 1;
                h.spot.color.setHSL(hue, 1.0, 0.6);
                h.beamMat.color.setHSL(hue, 1.0, 0.55);

                const pulse = 0.5 + 0.5 * Math.sin(elapsed * h.pulseSpeed + h.pulsePhase);
                h.spot.intensity = h.intensityBase + h.intensityPulse * pulse;
                h.beamMat.opacity = h.opacityBase + h.opacityPulse * pulse;
            }
        },
    };
}
