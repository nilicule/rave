// All client-side tunables in one place. Edit here.

export const CONFIG = Object.freeze({
    // Stage screen sources. On load, the client picks ONE entry at random
    // from VIDEOS + PLAYLISTS combined. No cross-client sync; every tab
    // independently picks its own.
    //
    // VIDEOS: bare YouTube video IDs. Looped on their own.
    // PLAYLISTS: { 'Human-readable label': 'PLAYLIST_ID' }. Shuffled and
    //            started at a random index via the YT IFrame Player API.
    VIDEOS: [
        // 'oavMtUWDBTM',  // example single video
    ],
    PLAYLISTS: {
        'Drumcode Streams': 'PLhkZrfli9PCrVtlDxynDixY2frHBq_MYW',
        'Adam Beyer Live':  'PLhkZrfli9PCqFDIT3_jSAsOVYRhfrVNXF',
    },

    // Movement (world units per second).
    MOVEMENT_SPEED: 4.5,

    // How often the client pushes its position to the server (Hz). Independent
    // of the render frame rate; the server tick is set on its side (20 Hz).
    NETWORK_SEND_HZ: 15,

    // Remote-player interpolation: how far behind the latest received state
    // remote avatars are rendered. Trades latency for smoothness.
    INTERP_DELAY_MS: 120,

    // Stage screen dimensions (world units). 16:9.
    STAGE_WIDTH: 14,
    STAGE_HEIGHT: 7.875,
    // Stage Z position. Players spawn around the origin and look toward +Z.
    STAGE_Z: 12,
    STAGE_Y_CENTER: 5.5, // raised so the screen sits above the stage platform

    // Stage build (a platform people can read as a real club stage).
    STAGE_PLATFORM_WIDTH: 22,
    STAGE_PLATFORM_DEPTH: 7,
    STAGE_PLATFORM_HEIGHT: 1.0,

    // Lighting truss above the stage that holds the moving heads.
    TRUSS_Y: 12.0,       // height of the top horizontal beam
    TRUSS_HALF_SPAN: 11, // x-distance from center to each vertical column
    SEARCHLIGHT_COUNT: 10,
});

// Derive the WebSocket URL from the current page so the same code works on
// localhost:8000, localhost:8080, or any deployed host without changes.
// TODO (deployment): once served over HTTPS this automatically upgrades to wss://.
export function getWebSocketUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
}

/**
 * Pick one stage source uniformly at random across VIDEOS + PLAYLISTS.
 * Each entry is one weight — a single video and a single playlist count
 * equally regardless of how many videos the playlist contains.
 */
export function pickStageSource() {
    const pool = [
        ...CONFIG.VIDEOS.map((id) => ({ kind: 'video', id, label: id })),
        ...Object.entries(CONFIG.PLAYLISTS).map(([label, id]) => ({
            kind: 'playlist', id, label,
        })),
    ];
    if (pool.length === 0) {
        throw new Error(
            'No stage sources configured — add at least one entry to CONFIG.VIDEOS or CONFIG.PLAYLISTS.',
        );
    }
    return pool[Math.floor(Math.random() * pool.length)];
}
