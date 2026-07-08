/** Published collect limits for desktop clients (Phase D). */
export const MAX_FACTS_PER_BATCH = 1000;
export const MAX_MODELS_PER_FACT = 100;

/** Rate limit: max successful/attempted push requests per user per window. */
export const DAILY_USAGE_PUSH_USER_MAX_ATTEMPTS = 60;
export const DAILY_USAGE_PUSH_USER_WINDOW_SECONDS = 15 * 60;
export const DAILY_USAGE_PUSH_USER_BLOCK_SECONDS = 15 * 60;
