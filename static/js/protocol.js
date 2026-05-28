// Mirror of server/protocol.py MessageType and AnimationState. Keep in sync.

export const MessageType = Object.freeze({
    WELCOME: 'welcome',
    JOIN: 'join',
    LEAVE: 'leave',
    PLAYER_MOVE: 'player_move',
    STATE_UPDATE: 'state_update',
});

// Cycle order for T (next) / Y (previous). Includes 'idle' as the first slot.
// Mirrors server/protocol.py AnimationState.
export const DANCE_MOVES = Object.freeze([
    'idle',
    'fist_pump',
    'hands_air',
    'two_step',
    'big_fish',
    'disco_point',
    'running_man',
]);
