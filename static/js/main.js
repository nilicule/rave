// Entry point: build the scene, wire up modules, run the animation loop.

import { createScene } from './scene.js';
import { createStage, unmuteStage } from './stage.js';
import { createClubLights } from './lighting.js';
import { installInput, onPointerLockChange } from './input.js';
import { LocalPlayer } from './localPlayer.js';
import { RemotePlayers } from './remotePlayers.js';
import { Network } from './network.js';
import * as THREE from 'three';

const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');

const { scene, camera, renderer, cssRenderer } = createScene();

// CSS3DRenderer needs its own scene; it shares the camera with WebGL so the
// projections line up.
const cssScene = new THREE.Scene();

createStage(scene, cssScene, cssRenderer);
const clubLights = createClubLights(scene);

installInput(renderer.domElement);
const HINT_UNLOCKED = 'click to look · W/S move · A/D turn';
const HINT_LOCKED = 'mouse to look · W/S move · A/D turn · Esc to release';
hintEl.textContent = HINT_UNLOCKED;
onPointerLockChange((locked) => {
    hintEl.textContent = locked ? HINT_LOCKED : HINT_UNLOCKED;
});

// First user gesture also unmutes the stage. Browser autoplay policy blocks
// audio without a gesture, so the YT player starts muted; this flips it on.
renderer.domElement.addEventListener('click', () => unmuteStage(), { once: true });

const remotePlayers = new RemotePlayers(scene);
let localPlayer = null;

const network = new Network({
    onStatus: (status) => { statusEl.textContent = status; },
    onWelcome: (msg) => {
        localPlayer = new LocalPlayer(scene, camera, msg.you);
        for (const peer of msg.players) {
            remotePlayers.add(peer);
        }
        network.startSending(() => localPlayer.snapshot());
        statusEl.textContent = `connected · ${msg.players.length + 1} online`;
    },
    onJoin: (msg) => remotePlayers.upsertSingle(msg.player),
    onLeave: (msg) => remotePlayers.remove(msg.player_id),
    onStateUpdate: (msg) => {
        if (!localPlayer) return;
        remotePlayers.applySnapshot(msg.players, localPlayer.id);
        statusEl.textContent = `connected · ${msg.players.length} online`;
    },
});
network.connect();

const clock = new THREE.Clock();
function animate() {
    const dt = Math.min(clock.getDelta(), 0.1); // clamp to avoid huge jumps after tab-switch
    const elapsed = clock.elapsedTime;

    clubLights.update(elapsed);
    if (localPlayer) localPlayer.update(dt);
    remotePlayers.render();

    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);

    requestAnimationFrame(animate);
}
animate();
