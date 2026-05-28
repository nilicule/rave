# raveWorld

A tiny web-based, massively-multiplayer online rave. Three.js in the browser, FastAPI WebSockets on the server, no build step.

## Run it

Prereqs: `uv` (https://docs.astral.sh/uv/) and Python 3.13+.

```bash
uv sync
uv run uvicorn main:app --reload
```

Open http://localhost:8000 in a browser. Open more tabs to see multiplayer.

**Controls**

- **W / S** — walk forward / backward (in the direction your character is facing)
- **A / D** — turn the character left / right
- **Click** the scene — engage mouselook (pointer lock). Mouse then orbits the camera around your character (yaw + pitch).
- **Esc** — release the mouse (so you can click the YouTube controls or another tab)

## Config

### Server

| Constant | Where | Default | Notes |
|---|---|---|---|
| `BROADCAST_HZ` | `server/connection_manager.py` | `20` | State snapshot rate to all clients |
| `SPAWN_RADIUS` | `server/player.py` | `8.0` | Players spawn inside this square around origin |
| host / port | passed to `uvicorn` | `127.0.0.1:8000` | `--host 0.0.0.0 --port 8000` to expose on the network |

### Client

All in `static/js/config.js`:

| Constant | Default | Notes |
|---|---|---|
| `VIDEOS` | `[]` | List of bare YouTube video IDs. Looped individually. |
| `PLAYLISTS` | three Drumcode playlists | `{ 'Label': 'PL...id' }`. Shuffled and started at a random index. |
| `MOVEMENT_SPEED` | `4.5` | World units per second |
| `NETWORK_SEND_HZ` | `15` | How often the client pushes its position |
| `INTERP_DELAY_MS` | `120` | Render-behind window for remote-player smoothing |
| `STAGE_WIDTH` / `STAGE_HEIGHT` / `STAGE_Z` / `STAGE_Y_CENTER` | 14 / 7.875 / 12 / 4.5 | Stage screen geometry |

On load, each tab picks **one** entry uniformly at random across `VIDEOS + PLAYLISTS` — no cross-client sync. A single video and a single playlist count equally regardless of how many videos the playlist contains.

**Sound:** the stage iframe is muted at load (browsers block autoplay-with-audio without a user gesture). The first click on the scene (the same one that engages pointer lock) calls `unMute()` on the player.

The WebSocket URL is derived from `window.location` (`ws://` or `wss://` automatically), so changing the host/port doesn't need code changes.

## Architecture

```
main.py                       FastAPI app + WS endpoint + static mount
server/
  protocol.py                 Pydantic message models, MessageType enum
  player.py                   Player dataclass (server-side state)
  connection_manager.py       WS registry + broadcast loop
static/
  index.html                  Importmap for Three.js, WebGL + CSS3D hosts
  js/
    config.js                 All tunables
    protocol.js               Mirrors server MessageType
    scene.js                  Renderers, ground, sky, stars, moon
    avatar.js                 Blocky humanoid factory (limb refs on userData)
    stage.js                  Stage backing + CSS3D iframe overlay
    lighting.js               Animated club spotlights / point lights
    input.js                  WASD keyboard state
    localPlayer.js            Client-side movement + camera follow
    remotePlayers.js          Registry + buffered interpolation
    network.js                WebSocket client + throttled send loop
    main.js                   Entry point: wires it all up
```

### Message protocol (wire)

All messages are JSON with a `type` field. See `server/protocol.py` for canonical models; `static/js/protocol.js` mirrors the constants.

- **S→C `welcome`** — sent once per connect. `{ your_id, you, players }`
- **S→C `join`** — broadcast when someone connects. `{ player }`
- **S→C `leave`** — broadcast when someone disconnects. `{ player_id }`
- **S→C `state_update`** — broadcast at `BROADCAST_HZ`. `{ players: [...] }`
- **C→S `player_move`** — sent at `NETWORK_SEND_HZ`. `{ position, rotation }`

Adding a new C→S message kind: define a Pydantic class in `protocol.py`, append it to the `ClientMessage` discriminated union, mirror its `type` value in `static/js/protocol.js`, and add a branch in `main.py`'s `websocket_endpoint` loop.

### Movement model

Client owns its position. Each frame, `localPlayer.js` reads keyboard + mouse intent:

- **A/D** and **mouse-X** both feed character yaw. A/D integrates at `TURN_SPEED` rad/s; mouse-X applies `dx * MOUSE_YAW_SENSITIVITY` directly. Same effect, two input modes.
- **W/S** moves along the character's forward vector (`(sin yaw, 0, cos yaw)`) at `MOVEMENT_SPEED`.
- **Mouse-Y** tilts the camera pitch (`PITCH_MIN..PITCH_MAX`). No keyboard analog.

The camera arm is always directly behind the character (`characterYaw + π`); pitch tilts it up/down. The look-at point sits at chest height on the character. Camera position lerps with frame-rate-independent exponential smoothing.

The network layer reads a snapshot at `NETWORK_SEND_HZ` and emits `player_move` — independent of the render frame rate. Only the character yaw goes over the wire; camera pitch is purely local.

Remote players are rendered `INTERP_DELAY_MS` behind the latest server snapshot, interpolating between the two surrounding samples. This trades a bit of latency for smooth motion at any frame rate.

## Design choices

### FastAPI (not raw `websockets`)

FastAPI gives us one ASGI app for both `/ws` and the static frontend, served on one port by one `uvicorn` command. Pydantic models are native and the discriminated-union protocol "just works" via `TypeAdapter`. The raw `websockets` library would need a separate HTTP server (or hand-rolled one) for the static files, splitting the runtime and URL space — not worth it for this scope.

### YouTube via CSS3DRenderer + iframe (not `VideoTexture`)

YouTube blocks cross-origin access to its `<video>` element, so a Three.js `VideoTexture` of a YouTube embed isn't possible — you'd need a self-hosted MP4 to use that path. The robust alternative is Three.js's `CSS3DRenderer` addon: an iframe is wrapped in a `CSS3DObject`, placed in the same world-space coordinates as the stage plane, and renders with the same camera projection as the WebGL scene. The stage iframe stays anchored to its 3D position as the player walks around.

The trade-off: CSS3D content always layers above the WebGL canvas. A player walking between the camera and the stage would appear *behind* the iframe. Acceptable here — the camera stays behind the player facing the stage.

### Unified turning: A/D and mouse-X both rotate the character

A/D rotates the character (not strafe), W/S moves along its facing vector. Mouse-X feeds into the same character yaw, so dragging right is "turn right" exactly like holding D — just continuous instead of discrete. The camera sits directly behind the character and inherits any turning automatically. Mouse-Y is the only thing that's camera-only: it tilts pitch. Remote players only see `position` and `rotation` (character yaw); camera pitch stays client-side.

The iframe inside the CSS3D layer captures clicks once pointer lock is released — Esc, then click the YouTube embed if you want to use its native controls.

## Deployment notes (for later)

The code is local-only right now. `main.py` and the frontend both carry `TODO` markers near things that need to change:

- Bind uvicorn to `0.0.0.0` (or run it behind a reverse proxy).
- Terminate TLS in front; the frontend already auto-upgrades to `wss://` when served from `https://`.
- Move host / port / `YOUTUBE_VIDEO_ID` / log level to environment variables.
- Serve static assets through a CDN / reverse proxy instead of FastAPI's `StaticFiles`.
- Add reconnect-with-backoff in `network.js`.
- Add bounds / collision in `localPlayer.js`.

## Next features (architectural seams)

- **Dancing.** `avatar.js` exposes limb pivot groups on `userData.limbs`. Add an `animation_state` field to `PlayerState` (server + client mirrors), drive limb rotations from it in a per-frame update. The seam exists; no rewiring needed.
- **Chat.** Add `ChatMessage` to `protocol.py`, append to `ClientMessage`, mirror in `protocol.js`, dispatch in `network.js`. Render bubbles above avatars in `remotePlayers.js` / `localPlayer.js`.
