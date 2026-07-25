/** Default page size for GET /v1/leaderboard. */
export const LEADERBOARD_DEFAULT_LIMIT = 50;

/** Max page size for GET /v1/leaderboard. */
export const LEADERBOARD_MAX_LIMIT = 100;

/** Top tools / models per row. */
export const LEADERBOARD_TOP_N = 5;

/** Public list IP rate limit (stricter than private usage reads). */
export const LEADERBOARD_IP_MAX_ATTEMPTS = 60;
export const LEADERBOARD_IP_WINDOW_SECONDS = 60;
export const LEADERBOARD_IP_BLOCK_SECONDS = 60;
