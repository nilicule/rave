// Static scene setup: renderer, camera, ground, sky, stars, moon, base lights.
// Animated club lights live in lighting.js; the stage screen in stage.js.

import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

export function createScene() {
    const scene = new THREE.Scene();
    // Intentionally no scene.background: we need the WebGL canvas pixels
    // to remain transparent where the stage hole-punch plane lives so the
    // CSS3D iframe behind shows through. A sky-dome sphere (see addSky)
    // provides the night-sky look everywhere else.
    scene.fog = new THREE.Fog(0x000010, 30, 90);

    const camera = new THREE.PerspectiveCamera(
        65,
        window.innerWidth / window.innerHeight,
        0.1,
        500,
    );
    camera.position.set(0, 6, -10);
    camera.lookAt(0, 1.5, 0);

    // alpha=true + clearColor(_, 0) gives the canvas a real alpha channel,
    // letting the CSS3D layer beneath show through transparent pixels.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false; // shadows are expensive; skip for now
    document.getElementById('webgl').appendChild(renderer.domElement);

    // CSS3DRenderer hosts the YouTube iframe (see stage.js). Its DOM lives in
    // the #css3d host so it can sit above the WebGL canvas.
    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('css3d').appendChild(cssRenderer.domElement);

    addSky(scene);
    addGround(scene);
    addStars(scene);
    addMoon(scene);
    addAmbientLights(scene);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        cssRenderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, cssRenderer };
}

function addSky(scene) {
    // Inside-facing dark sphere — replaces scene.background so the canvas
    // can stay alpha-aware. The hole-punch plane in stage.js writes depth at
    // the iframe location, so the sphere fails the depth test there and
    // leaves those pixels transparent (iframe shows through).
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(220, 24, 24),
        new THREE.MeshBasicMaterial({
            color: 0x000008,
            side: THREE.BackSide,
            fog: false,
            depthWrite: false, // don't fight foreground geometry
        }),
    );
    scene.add(sky);
}

function addGround(scene) {
    const geo = new THREE.PlaneGeometry(200, 200);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x1f6b2a, // grass green
        roughness: 1.0,
        metalness: 0.0,
        flatShading: true,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);
}

function addStars(scene) {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // Random points on a large hemisphere above the ground.
        const r = 180;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random()); // upper hemisphere only
        positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.6,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
    });
    scene.add(new THREE.Points(geo, mat));
}

function addMoon(scene) {
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(4, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff2cc }),
    );
    moon.position.set(-30, 35, -40);
    scene.add(moon);

    // Soft fill from the moon's direction.
    const moonLight = new THREE.DirectionalLight(0xaab8ff, 0.35);
    moonLight.position.copy(moon.position);
    scene.add(moonLight);
}

function addAmbientLights(scene) {
    // Keep ambient low so club lights pop. Hemisphere gives a colored floor bounce.
    scene.add(new THREE.HemisphereLight(0x2233ff, 0x101010, 0.25));
    scene.add(new THREE.AmbientLight(0xffffff, 0.08));
}
