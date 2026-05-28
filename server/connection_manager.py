"""WebSocket registry + fixed-rate broadcast loop.

The manager owns the source of truth for who's connected and where they are.
Movement updates from clients mutate the in-memory ``Player`` records; a
background task ticks at ``BROADCAST_HZ`` and pushes a snapshot to everyone.

Connect/disconnect emit dedicated ``join`` / ``leave`` messages immediately so
new avatars appear without waiting for the next snapshot.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import WebSocket
from pydantic import BaseModel

from .player import Player
from .protocol import (
    AnimationState,
    JoinMessage,
    LeaveMessage,
    StateUpdateMessage,
    Vec3,
    WelcomeMessage,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Server tick: how often a full state snapshot goes out. 20 Hz is comfortable
# for ~dozens of players on localhost and matches the client's send rate.
BROADCAST_HZ = 20


class ConnectionManager:
    """Owns the WebSocket set and the authoritative player roster."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}
        self._players: dict[str, Player] = {}
        # One lock guards both maps so connect/disconnect/broadcast can't race.
        self._lock = asyncio.Lock()

    # --- lifecycle ---------------------------------------------------------

    async def connect(self, websocket: WebSocket) -> Player:
        """Accept a new client, spawn its player, notify everyone."""
        await websocket.accept()
        player = Player.spawn()

        async with self._lock:
            # Snapshot of everyone *else* for the welcome payload.
            others = [p.to_state() for p in self._players.values()]
            self._connections[player.id] = websocket
            self._players[player.id] = player

        # Tell the new client who they are and who else is here.
        await self._send(
            websocket,
            WelcomeMessage(your_id=player.id, you=player.to_state(), players=others),
        )

        # Tell everyone else the new player joined.
        await self._broadcast(JoinMessage(player=player.to_state()), exclude=player.id)

        logger.info("player %s connected (%d total)", player.id, len(self._players))
        return player

    async def disconnect(self, player_id: str) -> None:
        async with self._lock:
            self._connections.pop(player_id, None)
            removed = self._players.pop(player_id, None)
        if removed is None:
            return
        await self._broadcast(LeaveMessage(player_id=player_id))
        logger.info("player %s disconnected (%d total)", player_id, len(self._players))

    # --- mutations from inbound messages -----------------------------------

    def update_player_position(
        self,
        player_id: str,
        position: Vec3,
        rotation: float,
        animation_state: AnimationState,
    ) -> None:
        """Apply a PLAYER_MOVE update. No-op if the player has vanished."""
        player = self._players.get(player_id)
        if player is None:
            return
        player.position = position
        player.rotation = rotation
        player.animation_state = animation_state

    # --- broadcast loop ----------------------------------------------------

    async def run_broadcast_loop(self) -> None:
        """Background task: push a STATE_UPDATE to all clients at BROADCAST_HZ."""
        period = 1.0 / BROADCAST_HZ
        try:
            while True:
                await asyncio.sleep(period)
                if not self._players:
                    continue
                snapshot = StateUpdateMessage(
                    players=[p.to_state() for p in self._players.values()],
                )
                await self._broadcast(snapshot)
        except asyncio.CancelledError:
            logger.info("broadcast loop cancelled")
            raise

    # --- internals ---------------------------------------------------------

    async def _send(self, websocket: WebSocket, message: BaseModel) -> None:
        # model_dump_json handles enum serialization cleanly.
        await websocket.send_text(message.model_dump_json())

    async def _broadcast(
        self, message: BaseModel, exclude: str | None = None
    ) -> None:
        """Fan out a message to every connection. Drop dead sockets silently."""
        payload = message.model_dump_json()
        # Snapshot the targets so we don't hold the lock across awaits.
        async with self._lock:
            targets = [
                (pid, ws)
                for pid, ws in self._connections.items()
                if pid != exclude
            ]

        dead: list[str] = []
        for pid, ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                # Anything raised here means the socket is gone — schedule cleanup.
                dead.append(pid)

        for pid in dead:
            await self.disconnect(pid)
