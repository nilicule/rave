// The local player: A/D and mouse-X both rotate the character (same effect,
// keyboard discrete + mouse continuous). W/S move along the character's
// forward vector. Mouse-Y tilts the camera up/down (no keyboard analog). The
// camera arm always sits directly behind the character. Predicted locally
// each frame; the network layer reads snapshots at its own cadence.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createAvatar } from './avatar.js';
import { getMovementIntent, consumeMouseDelta } from './input.js';
import { updateWalkAnimation } from './walkAnimation.js';

// Tunables. Kept here (not in CONFIG) because they're feel-of-controls knobs
// that I expect to fiddle with often during development.
const TURN_SPEED = 2.6;             // rad/s for A/D
const MOUSE_YAW_SENSITIVITY = 0.0025;
const MOUSE_PITCH_SENSITIVITY = 0.0025;
// Absolute pitch range. The effective upper bound on "look up" (lower pitch
// limit) is also clamped DYNAMICALLY each frame so the camera never dips
// below the ground (see _clampPitchToGround). Without that, looking too far
// up drops the orbit camera through the floor and exposes the below-ground
// portion of the searchlight cones.
const PITCH_MIN_ABSOLUTE = -Math.PI / 3; // ~60° upward, sanity floor only
const PITCH_MAX = 1.1;                   // ~63° downward (toward top-down)
const CAMERA_DISTANCE = 8.0;             // world units from character to camera
const CAMERA_LOOK_HEIGHT = 1.8;          // height on character the camera aims at
const CAMERA_MIN_Y = 0.4;                // minimum world Y the camera is allowed to reach

export class LocalPlayer {
    constructor(scene, camera, initialState) {
        this.id = initialState.id;
        this.colorSeed = initialState.color_seed;
        this.scene = scene;
        this.camera = camera;

        this.avatar = createAvatar(this.colorSeed);
        this.avatar.position.set(
            initialState.position.x,
            initialState.position.y,
            initialState.position.z,
        );
        this.avatar.rotation.y = initialState.rotation;
        scene.add(this.avatar);

        // Mouse pitch: tilts the camera up/down around the look-at point.
        // No keyboard analog, so it's a pure mouse-Y input.
        this._cameraPitch = 0.3; // slight downward angle by default

        this._smoothCameraPos = new THREE.Vector3();
        this._smoothLookAt = new THREE.Vector3();
        this._snapCameraToAvatar();
    }

    update(dt) {
        const mouse = consumeMouseDelta();
        const intent = getMovementIntent();

        // --- turn: mouse-X and A/D both feed character yaw ---
        // Three.js rotation.y follows the right-hand rule around +Y, so a
        // positive delta spins the character CCW from above — which the
        // viewer (sitting in the chase camera) perceives as the world
        // turning left. Subtract to make D / mouse-right read as "right".
        this.avatar.rotation.y -=
            intent.turn * TURN_SPEED * dt + mouse.dx * MOUSE_YAW_SENSITIVITY;

        // --- pitch: mouse-Y only; no keyboard analog ---
        // dy > 0 (mouse drifts down) -> look down -> camera lifts -> +pitch.
        this._cameraPitch += mouse.dy * MOUSE_PITCH_SENSITIVITY;
        if (this._cameraPitch > PITCH_MAX) this._cameraPitch = PITCH_MAX;
        if (this._cameraPitch < PITCH_MIN_ABSOLUTE) this._cameraPitch = PITCH_MIN_ABSOLUTE;
        this._clampPitchToGround();

        if (intent.forward !== 0) {
            const yaw = this.avatar.rotation.y;
            // Forward vector for yaw convention above: (sin yaw, 0, cos yaw).
            this.avatar.position.x +=
                Math.sin(yaw) * intent.forward * CONFIG.MOVEMENT_SPEED * dt;
            this.avatar.position.z +=
                Math.cos(yaw) * intent.forward * CONFIG.MOVEMENT_SPEED * dt;
        }

        updateWalkAnimation(this.avatar, intent.forward * CONFIG.MOVEMENT_SPEED, dt);

        this._followCamera(dt);

        // TODO: clamp to bounds / collide with stage and pedestals here.
    }

    /**
     * Clamp pitch so the orbit camera never dips below CAMERA_MIN_Y.
     *
     * The camera Y position is `avatar.y + sin(pitch) * r + LOOK_HEIGHT`.
     * Solving for the pitch that puts camera Y exactly at CAMERA_MIN_Y:
     *   sin(pitch) = (CAMERA_MIN_Y - avatar.y - LOOK_HEIGHT) / r
     * That value is the floor on pitch (more negative pitch = lower camera).
     * Clamping each frame instead of using a fixed PITCH_MIN means the user
     * can look further up when standing on raised geometry (e.g. the stage
     * deck) without sacrificing the ground guard at ground level.
     */
    _clampPitchToGround() {
        const sinNeeded =
            (CAMERA_MIN_Y - this.avatar.position.y - CAMERA_LOOK_HEIGHT) /
            CAMERA_DISTANCE;
        if (sinNeeded >= 1) return;          // camera can't reach min even at PI/2 — leave pitch alone
        if (sinNeeded <= -1) return;          // any pitch works; absolute floor is the only limit
        const groundPitchMin = Math.asin(sinNeeded);
        if (this._cameraPitch < groundPitchMin) this._cameraPitch = groundPitchMin;
    }

    /** Snapshot for the network layer (character yaw, not camera yaw). */
    snapshot() {
        return {
            position: {
                x: this.avatar.position.x,
                y: this.avatar.position.y,
                z: this.avatar.position.z,
            },
            rotation: this.avatar.rotation.y,
        };
    }

    /**
     * Compute the desired camera position in world space, given the current
     * character yaw, mouse-controlled yaw offset, and pitch.
     */
    _computeDesiredCamera(out) {
        // Camera always sits directly behind the character (adding PI flips
        // the forward direction to the back). No independent orbit offset —
        // mouse-X folds into character yaw above, so the camera follows.
        const armYaw = this.avatar.rotation.y + Math.PI;
        const pitch = this._cameraPitch;
        const cosP = Math.cos(pitch);
        const r = CAMERA_DISTANCE;
        out.set(
            this.avatar.position.x + Math.sin(armYaw) * cosP * r,
            this.avatar.position.y + Math.sin(pitch) * r + CAMERA_LOOK_HEIGHT,
            this.avatar.position.z + Math.cos(armYaw) * cosP * r,
        );
        return out;
    }

    _desiredLookAt(out) {
        out.set(
            this.avatar.position.x,
            this.avatar.position.y + CAMERA_LOOK_HEIGHT,
            this.avatar.position.z,
        );
        return out;
    }

    _snapCameraToAvatar() {
        this._computeDesiredCamera(this._smoothCameraPos);
        this.camera.position.copy(this._smoothCameraPos);
        this._desiredLookAt(this._smoothLookAt);
        this.camera.lookAt(this._smoothLookAt);
    }

    _followCamera(dt) {
        const desired = this._computeDesiredCamera(_tmpVec1);
        const desiredLook = this._desiredLookAt(_tmpVec2);

        // Frame-rate independent exponential smoothing.
        const alpha = 1 - Math.exp(-dt * 14);
        this._smoothCameraPos.lerp(desired, alpha);
        this._smoothLookAt.lerp(desiredLook, alpha);

        this.camera.position.copy(this._smoothCameraPos);
        this.camera.lookAt(this._smoothLookAt);
    }
}

// Reused per-frame to avoid allocating new vectors.
const _tmpVec1 = new THREE.Vector3();
const _tmpVec2 = new THREE.Vector3();
