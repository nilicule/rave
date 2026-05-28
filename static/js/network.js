// WebSocket client. Handles connect, message dispatch, and the throttled
// position-send loop. Exposes a tiny event surface (onWelcome, onJoin,
// onLeave, onStateUpdate) so main.js can wire the rest of the app.

import { CONFIG, getWebSocketUrl } from './config.js';
import { MessageType } from './protocol.js';

export class Network {
    constructor({ onWelcome, onJoin, onLeave, onStateUpdate, onStatus }) {
        this.onWelcome = onWelcome;
        this.onJoin = onJoin;
        this.onLeave = onLeave;
        this.onStateUpdate = onStateUpdate;
        this.onStatus = onStatus || (() => {});

        this.ws = null;
        this._sendTimer = null;
        this._snapshotProvider = null;
    }

    connect() {
        this.onStatus('connecting…');
        const ws = new WebSocket(getWebSocketUrl());
        this.ws = ws;

        ws.addEventListener('open', () => this.onStatus('connected'));
        ws.addEventListener('close', () => {
            this.onStatus('disconnected');
            this._stopSendLoop();
            // TODO: reconnect with backoff.
        });
        ws.addEventListener('error', () => this.onStatus('error'));
        ws.addEventListener('message', (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            this._dispatch(msg);
        });
    }

    /**
     * Wire up the function the network uses to grab the local player's
     * position+rotation each send tick. Called once we have a local player.
     */
    startSending(getSnapshot) {
        this._snapshotProvider = getSnapshot;
        if (this._sendTimer) return;
        const period = 1000 / CONFIG.NETWORK_SEND_HZ;
        this._sendTimer = setInterval(() => this._sendMove(), period);
    }

    _stopSendLoop() {
        if (this._sendTimer) {
            clearInterval(this._sendTimer);
            this._sendTimer = null;
        }
    }

    _sendMove() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!this._snapshotProvider) return;
        const snap = this._snapshotProvider();
        this.ws.send(JSON.stringify({
            type: MessageType.PLAYER_MOVE,
            position: snap.position,
            rotation: snap.rotation,
        }));
    }

    _dispatch(msg) {
        switch (msg.type) {
            case MessageType.WELCOME:
                this.onWelcome(msg);
                break;
            case MessageType.JOIN:
                this.onJoin(msg);
                break;
            case MessageType.LEAVE:
                this.onLeave(msg);
                break;
            case MessageType.STATE_UPDATE:
                this.onStateUpdate(msg);
                break;
            // TODO: chat messages dispatch here.
        }
    }
}
