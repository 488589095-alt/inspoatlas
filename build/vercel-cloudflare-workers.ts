/**
 * Minimal compatibility surface for Vercel builds.
 *
 * String-based Cloudflare bindings (for example AI credentials) can be
 * supplied as ordinary Vercel environment variables. D1 and R2 are runtime
 * objects, so database and asset APIs continue to report their existing 503
 * errors until a Vercel-native persistence adapter is configured.
 */
export const env = process.env;
