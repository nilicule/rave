"""FastAPI entry point.

Serves the static frontend AND the WebSocket endpoint from a single ASGI app,
so ``uv run uvicorn main:app --reload`` is the only command needed.

TODO (deployment): when moving off localhost:
    - bind to ``0.0.0.0`` (uvicorn ``--host 0.0.0.0``) instead of the default
      127.0.0.1 so the container/host is reachable.
    - terminate TLS in front (nginx / Caddy / a load balancer) and let the
      client derive ``wss://`` from ``window.location`` — the frontend already
      does this, so no code change is needed.
    - read host / port / log level / YouTube video id from environment
      variables instead of the in-file constants.
    - serve static assets through the CDN / reverse proxy, not FastAPI's
      ``StaticFiles`` — fine for dev, not for production.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from server.connection_manager import ConnectionManager
from server.protocol import CLIENT_MESSAGE_ADAPTER, MessageType

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("raveworld")

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start and cancel the broadcast loop alongside the app lifecycle."""
    manager = ConnectionManager()
    app.state.manager = manager
    task = asyncio.create_task(manager.run_broadcast_loop(), name="broadcast-loop")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(lifespan=lifespan)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    manager: ConnectionManager = websocket.app.state.manager
    player = await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = CLIENT_MESSAGE_ADAPTER.validate_json(raw)
            except ValidationError as exc:
                logger.warning("invalid message from %s: %s", player.id, exc)
                continue

            # Match on the wire ``type``. New C->S kinds get a new branch here.
            if message.type == MessageType.PLAYER_MOVE:
                manager.update_player_position(
                    player.id,
                    message.position,
                    message.rotation,
                    message.animation_state,
                )
            # TODO: handle chat messages here once the protocol gains them.
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(player.id)


# Mount static last so the /ws route wins. ``html=True`` lets / serve index.html.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
