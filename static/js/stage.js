// Stage: a backing plane in the WebGL scene + a YouTube iframe wrapped in a
// CSS3DObject so it tracks the camera in 3D.
//
// Source selection:
//   pickStageSource() returns one entry at random across CONFIG.VIDEOS and
//   CONFIG.PLAYLISTS. For playlists we use the IFrame Player API to enable
//   shuffle and start at a random index in the list.
//
// Sound:
//   Browsers block autoplay-with-audio without a user gesture, so the player
//   starts muted (mute=1). Call unmuteStage() from a click handler to flip
//   it on; main.js wires that to the first canvas click (the same gesture
//   that engages pointer lock).
//
// Z-ordering vs. WebGL geometry:
//   The CSS3D layer sits BEHIND the (alpha-aware) WebGL canvas. A
//   depth-only "hole punch" plane sits at the iframe's world position with
//   colorWrite=false and renderOrder=-1: it writes to the depth buffer but
//   not the color buffer, so anywhere it draws first the canvas stays
//   transparent and the iframe shows through — UNLESS something closer
//   (e.g. an avatar in front of the stage) draws color over it. The result:
//   avatars in front of the stage occlude the video; avatars behind appear
//   correctly hidden by it. Trade-off: YouTube's own controls are now
//   unreachable because the WebGL canvas captures all clicks.
//
// Why CSS3DRenderer + iframe instead of a Three.js VideoTexture:
//   YouTube blocks cross-origin <video> element access, so its actual <video>
//   tag cannot be sampled as a WebGL texture. The iframe embed is the only
//   sanctioned playback path. CSS3DRenderer gives that iframe the same
//   perspective transform as the WebGL camera, so it stays anchored to its
//   world-space position even as the player walks around.

import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { CONFIG, pickStageSource } from './config.js';

const PIXELS_PER_UNIT = 100;

// YT.Player singleton + ready state. unmuteStage() can be called before the
// player is ready; the request is queued and applied in onReady.
let _player = null;
let _playerReady = false;
let _unmuteRequested = false;

export function createStage(scene, cssScene, cssRenderer) {
    buildStageRig(scene);

    // Hole-punch plane: same dimensions and world position as the iframe.
    // Writes depth, no color. Renders before everything else so its depth is
    // in place by the time other objects (sky sphere, avatars, frame) are
    // depth-tested. Result: avatars closer than the stage occlude the iframe;
    // anything further away (sky sphere, the frame, distant avatars) doesn't
    // overwrite those pixels, so the alpha-0 clear shows through to the CSS3D
    // layer below — i.e. the iframe.
    const hole = new THREE.Mesh(
        new THREE.PlaneGeometry(CONFIG.STAGE_WIDTH, CONFIG.STAGE_HEIGHT),
        new THREE.MeshBasicMaterial({
            colorWrite: false,
            side: THREE.DoubleSide,
        }),
    );
    hole.position.set(0, CONFIG.STAGE_Y_CENTER, CONFIG.STAGE_Z - 0.2);
    hole.renderOrder = -1;
    scene.add(hole);

    // The placeholder is a child of `wrapper`. YT.Player replaces the
    // placeholder with the actual iframe; the wrapper persists so the
    // CSS3DObject still has a valid DOM element to transform.
    const iframePxWidth = CONFIG.STAGE_WIDTH * PIXELS_PER_UNIT;
    const iframePxHeight = CONFIG.STAGE_HEIGHT * PIXELS_PER_UNIT;

    const wrapper = document.createElement('div');
    wrapper.style.width = `${iframePxWidth}px`;
    wrapper.style.height = `${iframePxHeight}px`;
    wrapper.style.background = '#000';

    const placeholder = document.createElement('div');
    placeholder.id = 'yt-player';
    wrapper.appendChild(placeholder);

    const cssObject = new CSS3DObject(wrapper);
    cssObject.position.set(0, CONFIG.STAGE_Y_CENTER, CONFIG.STAGE_Z - 0.2);
    cssObject.rotation.y = Math.PI;
    cssObject.scale.set(1 / PIXELS_PER_UNIT, 1 / PIXELS_PER_UNIT, 1 / PIXELS_PER_UNIT);
    cssScene.add(cssObject);

    // Force the wrapper into the live DOM NOW. CSS3DRenderer would otherwise
    // only attach it on its first render() call, but the YT IFrame API can
    // call onYouTubeIframeAPIReady before then; without #yt-player in the DOM,
    // YT.Player silently no-ops and we see a blank, sound-less stage.
    cssRenderer.domElement.appendChild(wrapper);

    const source = pickStageSource();
    console.log(`[stage] picked ${source.kind}: ${source.label} (${source.id})`);

    const startPlayer = () => initPlayer(source, iframePxWidth, iframePxHeight);
    if (window.YT && window.YT.Player) {
        console.log('[stage] YT API already loaded, init immediately');
        startPlayer();
    } else {
        console.log('[stage] waiting for YT IFrame API to load...');
        // YT IFrame API calls this global when the script finishes loading.
        // Chain any existing handler so we don't clobber another consumer.
        const existing = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            console.log('[stage] YT API ready');
            if (existing) existing();
            startPlayer();
        };
    }
}

/** Build the physical stage: platform, screen frame, speaker stacks, truss. */
function buildStageRig(scene) {
    const matDarkMetal = new THREE.MeshStandardMaterial({
        color: 0x1a1a1d, roughness: 0.45, metalness: 0.7, flatShading: true,
    });
    const matMatteBlack = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a, roughness: 0.9, metalness: 0.1, flatShading: true,
    });
    const matStagedeck = new THREE.MeshStandardMaterial({
        color: 0x141416, roughness: 0.85, metalness: 0.05, flatShading: true,
    });
    const matBoothFace = new THREE.MeshStandardMaterial({
        color: 0x232328, roughness: 0.6, metalness: 0.2, flatShading: true,
    });

    // --- Stage platform: extends in front of the screen so the DJ has a deck.
    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(
            CONFIG.STAGE_PLATFORM_WIDTH,
            CONFIG.STAGE_PLATFORM_HEIGHT,
            CONFIG.STAGE_PLATFORM_DEPTH,
        ),
        matStagedeck,
    );
    // Centered on the screen, depth-shifted so the platform sits both in front
    // of and slightly behind the screen plane (real stages have a "back of
    // house" margin behind the front-facing surfaces).
    platform.position.set(
        0,
        CONFIG.STAGE_PLATFORM_HEIGHT / 2,
        CONFIG.STAGE_Z + 0.5,
    );
    scene.add(platform);

    // Stage skirt: a thin front panel that hides the underside.
    const skirt = new THREE.Mesh(
        new THREE.BoxGeometry(CONFIG.STAGE_PLATFORM_WIDTH, CONFIG.STAGE_PLATFORM_HEIGHT, 0.1),
        matMatteBlack,
    );
    skirt.position.set(
        0,
        CONFIG.STAGE_PLATFORM_HEIGHT / 2,
        CONFIG.STAGE_Z + 0.5 - CONFIG.STAGE_PLATFORM_DEPTH / 2,
    );
    scene.add(skirt);

    // --- Screen frame: thin bezel around the iframe (CSS3D layer sits in front).
    const frameThickness = 0.35;
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(
            CONFIG.STAGE_WIDTH + frameThickness * 2,
            CONFIG.STAGE_HEIGHT + frameThickness * 2,
            0.3,
        ),
        matDarkMetal,
    );
    frame.position.set(0, CONFIG.STAGE_Y_CENTER, CONFIG.STAGE_Z);
    frame.rotation.y = Math.PI;
    scene.add(frame);

    // --- DJ booth: on the platform, in front of the screen.
    const boothGroup = new THREE.Group();
    const boothFront = new THREE.Mesh(
        new THREE.BoxGeometry(5, 1.3, 0.15),
        matBoothFace,
    );
    boothFront.position.set(0, 0.65, -1.0);
    boothGroup.add(boothFront);
    const boothTop = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.15, 1.6),
        matDarkMetal,
    );
    boothTop.position.set(0, 1.35, -0.2);
    boothGroup.add(boothTop);
    const boothSide = (sign) => {
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 1.3, 1.4),
            matMatteBlack,
        );
        m.position.set(sign * 2.5, 0.65, -0.2);
        boothGroup.add(m);
    };
    boothSide(-1);
    boothSide(+1);
    boothGroup.position.set(
        0,
        CONFIG.STAGE_PLATFORM_HEIGHT,
        CONFIG.STAGE_Z - CONFIG.STAGE_PLATFORM_DEPTH / 2 + 1.5,
    );
    scene.add(boothGroup);

    // --- Speaker stacks: left and right sides of the stage platform.
    const buildSpeakerStack = (x) => {
        const stack = new THREE.Group();
        // Sub (bottom, biggest cab)
        const sub = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 2.0), matMatteBlack);
        sub.position.y = 1.0;
        stack.add(sub);
        // Mid
        const mid = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.4, 1.7), matMatteBlack);
        mid.position.y = 2.0 + 0.7;
        stack.add(mid);
        // Top — tilted forward like a real line array hang.
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.5), matMatteBlack);
        top.position.y = 2.0 + 1.4 + 0.55;
        top.rotation.x = -0.12;
        stack.add(top);
        // Speaker face accents (slight blue glow rings).
        const cone = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55, 0.55, 0.05, 18),
            new THREE.MeshStandardMaterial({
                color: 0x222233, roughness: 0.9, flatShading: true,
                emissive: 0x101830, emissiveIntensity: 0.4,
            }),
        );
        cone.rotation.x = Math.PI / 2;
        cone.position.set(0, 1.0, -1.01);
        stack.add(cone);
        stack.position.set(
            x,
            CONFIG.STAGE_PLATFORM_HEIGHT,
            CONFIG.STAGE_Z - CONFIG.STAGE_PLATFORM_DEPTH / 2 + 1.5,
        );
        return stack;
    };
    scene.add(buildSpeakerStack(-CONFIG.STAGE_PLATFORM_WIDTH / 2 + 1.5));
    scene.add(buildSpeakerStack(+CONFIG.STAGE_PLATFORM_WIDTH / 2 - 1.5));

    // --- Truss: two vertical columns + a horizontal top beam. The truss
    // sits IN FRONT of the screen so the searchlight beams (mounted on it)
    // stay entirely in front of the hole-punch plane — otherwise the upper
    // part of each cone would get z-clipped where it crosses the screen.
    const trussZ = CONFIG.STAGE_Z - 2.0;
    const columnHeight = CONFIG.TRUSS_Y + 0.5;
    const buildTrussColumn = (x) => {
        // Compose with three thin verticals + cross-braces to suggest a
        // lattice without the cost of a real truss mesh.
        const grp = new THREE.Group();
        const chord = (dx) => {
            const m = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, columnHeight, 0.18),
                matDarkMetal,
            );
            m.position.set(dx, columnHeight / 2, 0);
            return m;
        };
        grp.add(chord(-0.3));
        grp.add(chord(0.3));
        // Cross braces at a few heights.
        for (let h = 1; h < columnHeight - 1; h += 1.4) {
            const brace = new THREE.Mesh(
                new THREE.BoxGeometry(0.7, 0.12, 0.12),
                matDarkMetal,
            );
            brace.position.set(0, h, 0);
            brace.rotation.z = (h % 2.8 < 1.4) ? 0.45 : -0.45;
            grp.add(brace);
        }
        grp.position.set(x, 0, trussZ);
        return grp;
    };
    scene.add(buildTrussColumn(-CONFIG.TRUSS_HALF_SPAN));
    scene.add(buildTrussColumn(+CONFIG.TRUSS_HALF_SPAN));

    // Top horizontal truss — two chords with cross braces.
    const topBeamGroup = new THREE.Group();
    const beamLen = CONFIG.TRUSS_HALF_SPAN * 2 + 0.6;
    const beamChord = (dy) => {
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(beamLen, 0.18, 0.18),
            matDarkMetal,
        );
        m.position.set(0, dy, 0);
        return m;
    };
    topBeamGroup.add(beamChord(-0.25));
    topBeamGroup.add(beamChord(+0.25));
    for (let x = -beamLen / 2 + 1; x < beamLen / 2 - 1; x += 1.4) {
        const brace = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.55, 0.12),
            matDarkMetal,
        );
        brace.position.set(x, 0, 0);
        brace.rotation.z = (x % 2.8 < 1.4) ? 0.45 : -0.45;
        topBeamGroup.add(brace);
    }
    topBeamGroup.position.set(0, CONFIG.TRUSS_Y, trussZ);
    scene.add(topBeamGroup);
}

function initPlayer(source, width, height) {
    const playerVars = {
        autoplay: 1,
        mute: 1, // required by browser autoplay policy; unmuteStage() flips it
        controls: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
    };

    if (source.kind === 'video') {
        // YouTube loops a single video only when `playlist=<videoId>` is set.
        playerVars.loop = 1;
        playerVars.playlist = source.id;
    } else {
        playerVars.listType = 'playlist';
        playerVars.list = source.id;
        playerVars.loop = 1;
    }

    const config = {
        width,
        height,
        playerVars,
        events: {
            onReady: (e) => {
                console.log('[stage] YT player ready');
                _playerReady = true;
                if (source.kind === 'playlist') {
                    try {
                        e.target.setShuffle(true);
                        // Jump to a random index so the playlist doesn't always
                        // open on the same first video.
                        const list = e.target.getPlaylist();
                        console.log('[stage] playlist length:', list ? list.length : '?');
                        if (list && list.length > 1) {
                            const idx = Math.floor(Math.random() * list.length);
                            e.target.playVideoAt(idx);
                        }
                    } catch (err) {
                        console.warn('[stage] playlist init failed:', err);
                    }
                }
                // Defensive: autoplay can be deferred until the player is visible;
                // explicitly kick playback once we're ready.
                try { e.target.playVideo(); } catch (_) {}
                if (_unmuteRequested) applyUnmute();
            },
            onError: (e) => {
                // Error codes: 2 invalid param, 5 HTML5 player error,
                // 100 video not found, 101/150 embed not allowed by uploader.
                console.error('[stage] YT player error code:', e.data);
            },
            onStateChange: (e) => {
                const states = {
                    '-1': 'unstarted', 0: 'ended', 1: 'playing',
                    2: 'paused', 3: 'buffering', 5: 'cued',
                };
                console.log('[stage] state:', states[e.data] ?? e.data);
            },
        },
    };
    if (source.kind === 'video') config.videoId = source.id;

    try {
        _player = new YT.Player('yt-player', config);
    } catch (err) {
        console.error('[stage] YT.Player constructor threw:', err);
    }
}

/**
 * Call from a user-gesture handler (e.g. the canvas click that engages
 * pointer lock). Unmutes the YT player and (re)starts playback.
 *
 * Safe to call before the player is ready: the request is queued and
 * applied in onReady.
 */
export function unmuteStage() {
    if (_playerReady) applyUnmute();
    else _unmuteRequested = true;
}

function applyUnmute() {
    if (!_player) return;
    try {
        _player.unMute();
        _player.setVolume(80);
        _player.playVideo();
    } catch (err) {
        console.warn('[stage] unmute failed', err);
    }
}
