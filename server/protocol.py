"""Wire protocol shared between server and clients.

All messages are JSON objects with a discriminating ``type`` field. The client
mirrors these constants in ``static/js/protocol.js``; keep the two in sync.

Direction conventions (per message class):
    S->C: server emits to one or more clients.
    C->S: client emits to the server.

TODO: add ``animation_state`` and ``chat`` message kinds when those features
land. The discriminated-union pattern below extends without touching existing
handlers — add a new class and append it to ``ClientMessage``.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter


class MessageType(StrEnum):
    """All message kinds on the wire. Mirrored in static/js/protocol.js."""

    WELCOME = "welcome"            # S->C, on connect: assigned id + current roster
    JOIN = "join"                  # S->C, broadcast: a new player appeared
    LEAVE = "leave"                # S->C, broadcast: a player disconnected
    PLAYER_MOVE = "player_move"    # C->S: local player position/rotation update
    STATE_UPDATE = "state_update"  # S->C, broadcast: periodic full-state snapshot


class Vec3(BaseModel):
    x: float
    y: float
    z: float


class PlayerState(BaseModel):
    """A single player's networked state.

    TODO: extend with ``animation_state`` (idle / dancing / etc.) when limb
    animation lands, and ``chat`` (last-message + timestamp) for the chat slot.
    """

    id: str
    position: Vec3
    rotation: float  # yaw in radians
    color_seed: int  # client-side palette index for deterministic colors


# --- Server -> Client -------------------------------------------------------

class WelcomeMessage(BaseModel):
    type: Literal[MessageType.WELCOME] = MessageType.WELCOME
    your_id: str
    you: PlayerState
    players: list[PlayerState]  # everyone already connected (excluding you)


class JoinMessage(BaseModel):
    type: Literal[MessageType.JOIN] = MessageType.JOIN
    player: PlayerState


class LeaveMessage(BaseModel):
    type: Literal[MessageType.LEAVE] = MessageType.LEAVE
    player_id: str


class StateUpdateMessage(BaseModel):
    type: Literal[MessageType.STATE_UPDATE] = MessageType.STATE_UPDATE
    players: list[PlayerState]


# --- Client -> Server -------------------------------------------------------

class PlayerMoveMessage(BaseModel):
    type: Literal[MessageType.PLAYER_MOVE] = MessageType.PLAYER_MOVE
    position: Vec3
    rotation: float


# Discriminated union for parsing inbound (client->server) messages.
# Adding a new C->S message kind: define the class above, append to this union.
ClientMessage = Annotated[
    Union[PlayerMoveMessage],
    Field(discriminator="type"),
]

CLIENT_MESSAGE_ADAPTER: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)
