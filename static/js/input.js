// Input: WASD for movement intent (W/S = forward/back, A/D = turn), plus
// pointer-lock mouse deltas for camera orbit. Mouse deltas are accumulated as
// long as the pointer is locked and consumed by the local player each frame.

const state = {
    forward: false,   // W / ArrowUp
    back: false,      // S / ArrowDown
    turnLeft: false,  // A / ArrowLeft  (rotates character yaw)
    turnRight: false, // D / ArrowRight (rotates character yaw)
};

const KEY_MAP = {
    KeyW: 'forward',
    KeyS: 'back',
    KeyA: 'turnLeft',
    KeyD: 'turnRight',
    ArrowUp: 'forward',
    ArrowDown: 'back',
    ArrowLeft: 'turnLeft',
    ArrowRight: 'turnRight',
};

let tPresses = 0;
let yPresses = 0;

let mouseDx = 0;
let mouseDy = 0;
let pointerLocked = false;

const pointerLockListeners = new Set();

/**
 * Wire keyboard + pointer lock. Pass the element that should capture pointer
 * lock on click (typically the WebGL canvas).
 */
export function installInput(lockTarget) {
    window.addEventListener('keydown', (e) => {
        const action = KEY_MAP[e.code];
        if (action) {
            state[action] = true;
            if (e.code.startsWith('Arrow')) e.preventDefault();
            return;
        }
        if (e.repeat) return;
        if (e.code === 'KeyT') tPresses++;
        else if (e.code === 'KeyY') yPresses++;
    });
    window.addEventListener('keyup', (e) => {
        const action = KEY_MAP[e.code];
        if (action) state[action] = false;
    });
    // Drop all held keys on blur so alt-tab mid-press doesn't strand a key.
    window.addEventListener('blur', () => {
        for (const k of Object.keys(state)) state[k] = false;
        tPresses = 0;
        yPresses = 0;
    });

    // Click anywhere on the canvas to engage mouselook. Esc releases.
    lockTarget.addEventListener('click', () => {
        if (!pointerLocked) lockTarget.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        pointerLocked = document.pointerLockElement === lockTarget;
        if (!pointerLocked) {
            // Discard any pending delta so we don't lurch on next lock.
            mouseDx = 0;
            mouseDy = 0;
        }
        for (const fn of pointerLockListeners) fn(pointerLocked);
    });

    document.addEventListener('mousemove', (e) => {
        if (!pointerLocked) return;
        mouseDx += e.movementX;
        mouseDy += e.movementY;
    });
}

/** Subscribe to pointer-lock state changes (e.g. to update a HUD). */
export function onPointerLockChange(fn) {
    pointerLockListeners.add(fn);
    return () => pointerLockListeners.delete(fn);
}

export function isPointerLocked() {
    return pointerLocked;
}

/**
 * Movement intent from the keyboard.
 *   forward in [-1, 1]: +1 = W (toward character facing), -1 = S
 *   turn    in [-1, 1]: +1 = D (turn right), -1 = A (turn left)
 */
export function getMovementIntent() {
    const forward = (state.forward ? 1 : 0) - (state.back ? 1 : 0);
    const turn = (state.turnRight ? 1 : 0) - (state.turnLeft ? 1 : 0);
    return { forward, turn };
}

/** Read and reset the accumulated mouse delta (in CSS pixels). */
export function consumeMouseDelta() {
    const dx = mouseDx;
    const dy = mouseDy;
    mouseDx = 0;
    mouseDy = 0;
    return { dx, dy };
}

/**
 * Read and reset T/Y key-press counts since the last call. Returns raw press
 * counts so multiple presses in one frame can each advance the cycle.
 */
export function consumeDanceCycle() {
    const forwardPresses = tPresses;
    const backPresses = yPresses;
    tPresses = 0;
    yPresses = 0;
    return { forwardPresses, backPresses };
}
