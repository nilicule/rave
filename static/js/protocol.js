// Mirror of server/protocol.py MessageType. Keep both in sync.

export const MessageType = Object.freeze({
    WELCOME: 'welcome',
    JOIN: 'join',
    LEAVE: 'leave',
    PLAYER_MOVE: 'player_move',
    STATE_UPDATE: 'state_update',
});
