// Registry of other players' avatars + buffered interpolation. The server
// sends snapshots at BROADCAST_HZ; rendering at ~60 fps means we'd see
// stair-stepping if we just snapped on each tick. Instead we buffer recent
// states and render the world ~INTERP_DELAY_MS in the past, lerping between
// the two surrounding snapshots.
//
// This is the classic Quake-style entity interpolation. Simple and smooth.

import { CONFIG } from './config.js';
import { createAvatar } from './avatar.js';
import { updateWalkAnimation } from './walkAnimation.js';

const MAX_BUFFER = 8;

// Below this absolute projected speed (world units/sec) we treat a remote
// player as idle. Interpolation jitter near rest otherwise twitches the
// animation between walk and idle every frame.
const DEADBAND = 0.05;

class RemoteAvatar {
    constructor(scene, state) {
        this.id = state.id;
        this.colorSeed = state.color_seed;
        this.avatar = createAvatar(this.colorSeed);
        this.avatar.position.set(state.position.x, state.position.y, state.position.z);
        this.avatar.rotation.y = state.rotation;
        scene.add(this.avatar);

        // Ring buffer of {time, position, rotation}.
        this.buffer = [{
            time: performance.now(),
            position: { ...state.position },
            rotation: state.rotation,
        }];
    }

    pushState(state, now) {
        this.buffer.push({
            time: now,
            position: { ...state.position },
            rotation: state.rotation,
        });
        if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    }

    render(renderTime, dt) {
        const target = renderTime - CONFIG.INTERP_DELAY_MS;
        const buf = this.buffer;
        let signedSpeed = 0;

        if (buf.length === 1 || target <= buf[0].time) {
            const s = buf[0];
            this.avatar.position.set(s.position.x, s.position.y, s.position.z);
            this.avatar.rotation.y = s.rotation;
        } else {
            let bracketed = false;
            for (let i = buf.length - 1; i >= 1; i--) {
                const b = buf[i];
                const a = buf[i - 1];
                if (target >= a.time && target <= b.time) {
                    const span = b.time - a.time || 1;
                    const t = (target - a.time) / span;
                    this.avatar.position.set(
                        a.position.x + (b.position.x - a.position.x) * t,
                        a.position.y + (b.position.y - a.position.y) * t,
                        a.position.z + (b.position.z - a.position.z) * t,
                    );
                    this.avatar.rotation.y = lerpAngle(a.rotation, b.rotation, t);

                    // Project the buffer-sample velocity onto the avatar's
                    // forward vector to get a signed speed. Same convention
                    // as localPlayer.js: forward = (sin yaw, cos yaw).
                    const dtBuf = span / 1000;
                    const vx = (b.position.x - a.position.x) / dtBuf;
                    const vz = (b.position.z - a.position.z) / dtBuf;
                    const yaw = this.avatar.rotation.y;
                    const proj = vx * Math.sin(yaw) + vz * Math.cos(yaw);
                    if (Math.abs(proj) >= DEADBAND) signedSpeed = proj;

                    bracketed = true;
                    break;
                }
            }
            if (!bracketed) {
                const s = buf[buf.length - 1];
                this.avatar.position.set(s.position.x, s.position.y, s.position.z);
                this.avatar.rotation.y = s.rotation;
            }
        }

        updateWalkAnimation(this.avatar, signedSpeed, dt);
    }

    dispose(scene) {
        scene.remove(this.avatar);
        this.avatar.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }
}

function lerpAngle(a, b, t) {
    let diff = b - a;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return a + diff * t;
}

export class RemotePlayers {
    constructor(scene) {
        this.scene = scene;
        this.players = new Map(); // id -> RemoteAvatar
        this._lastNow = null;
    }

    add(state) {
        if (this.players.has(state.id)) return;
        this.players.set(state.id, new RemoteAvatar(this.scene, state));
    }

    remove(id) {
        const p = this.players.get(id);
        if (!p) return;
        p.dispose(this.scene);
        this.players.delete(id);
    }

    /** Apply a STATE_UPDATE snapshot. Adds new players, drops missing ones. */
    applySnapshot(states, localPlayerId) {
        const now = performance.now();
        const seen = new Set();
        for (const s of states) {
            if (s.id === localPlayerId) continue;
            seen.add(s.id);
            const existing = this.players.get(s.id);
            if (existing) {
                existing.pushState(s, now);
            } else {
                // Server told us about a player we haven't seen via JOIN yet;
                // tolerate the race by creating them here.
                this.add(s);
            }
        }
        // Drop any player the server didn't mention.
        for (const id of this.players.keys()) {
            if (!seen.has(id)) this.remove(id);
        }
    }

    /** Apply a single-player update from a JOIN message. */
    upsertSingle(state) {
        const existing = this.players.get(state.id);
        if (existing) {
            existing.pushState(state, performance.now());
        } else {
            this.add(state);
        }
    }

    render() {
        const now = performance.now();
        const dt = this._lastNow == null ? 0 : (now - this._lastNow) / 1000;
        this._lastNow = now;
        for (const p of this.players.values()) p.render(now, dt);
    }
}
