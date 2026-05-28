"""Server-side player record.

Kept distinct from the wire model (``protocol.PlayerState``) so server-only
state (e.g. last-seen timestamps, rate-limit counters) can be added without
leaking through the protocol.
"""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field

from .protocol import PlayerState, Vec3

# Players spawn somewhere inside this square, centered on the origin.
# (Stage sits along +Z; players face it from -Z toward +Z.)
SPAWN_RADIUS = 8.0


@dataclass(slots=True)
class Player:
    """In-memory player record. Trivially extended with new fields.

    TODO: add ``animation_state: str = "idle"`` when dancing lands and
    ``last_chat: str | None = None`` when chat lands. The to-wire conversion
    in ``to_state()`` will need a matching field per addition.
    """

    id: str
    position: Vec3
    rotation: float
    color_seed: int
    # joined_at, last_move_at, etc. could live here without touching the wire.

    @classmethod
    def spawn(cls) -> "Player":
        """Create a fresh player with a random id, spawn point and color."""
        return cls(
            id=uuid.uuid4().hex,
            position=Vec3(
                x=random.uniform(-SPAWN_RADIUS, SPAWN_RADIUS),
                y=0.0,
                z=random.uniform(-SPAWN_RADIUS, SPAWN_RADIUS),
            ),
            rotation=random.uniform(0.0, 6.283185),
            color_seed=random.randint(0, 2**31 - 1),
        )

    def to_state(self) -> PlayerState:
        return PlayerState(
            id=self.id,
            position=self.position,
            rotation=self.rotation,
            color_seed=self.color_seed,
        )
