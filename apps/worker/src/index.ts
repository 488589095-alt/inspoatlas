/**
 * The Beta deployment uses D1 plus synchronous, persisted BYOK analysis.
 * This legacy PostgreSQL worker is intentionally disabled so it can never
 * manufacture demo results or create a second source of truth.
 */
throw new Error("Legacy pg-boss worker disabled: use POST /api/analyses with a tested BYOK credential.");
