import { sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from './db';
import { rateLimits } from './db/schema';

export interface RateLimitOptions {
	/** Max requests allowed within the window. */
	limit: number;
	/** Window length in milliseconds. */
	windowMs: number;
}

export interface RateLimitResult {
	allowed: boolean;
	/** Only meaningful when `allowed` is false. */
	retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter backed by the shared database rather than
 * in-memory state. This matters specifically because the app runs as
 * serverless functions on Vercel: an in-memory counter lives inside one
 * process, but consecutive requests from the same client can land on
 * different (or freshly cold) processes, so in-memory limiting would
 * silently do nothing in production even though it "works" in local dev.
 * Routing every check through Turso — which every request already talks
 * to anyway — makes the limit actually hold across instances.
 *
 * Implementation: one row per bucket key, upserted atomically via SQLite's
 * ON CONFLICT ... DO UPDATE with a RETURNING clause, so the whole
 * "read current count, decide whether to reset the window, increment,
 * return the new count" sequence is a single round trip with no race
 * condition between concurrent requests for the same key.
 *
 * Returns a result rather than throwing, so callers in different contexts
 * (REST endpoints vs. form actions) can each respond however fits best —
 * see `rateLimitUserWrite` and `checkLoginRateLimit` below for the two
 * flavors used elsewhere in this app.
 */
export async function checkRateLimit(
	key: string,
	{ limit, windowMs }: RateLimitOptions
): Promise<RateLimitResult> {
	const now = Date.now();
	const windowStart = Math.floor(now / windowMs) * windowMs;

	const result = await db
		.insert(rateLimits)
		.values({ key, windowStart, count: 1 })
		.onConflictDoUpdate({
			target: rateLimits.key,
			set: {
				windowStart: sql`excluded.window_start`,
				// If the stored window is still the current one, increment;
				// otherwise a new window has started, so reset to 1.
				count: sql`CASE WHEN ${rateLimits.windowStart} = excluded.window_start THEN ${rateLimits.count} + 1 ELSE 1 END`
			}
		})
		.returning({ count: rateLimits.count, windowStart: rateLimits.windowStart })
		.get();

	if (!result || result.count <= limit) {
		return { allowed: true, retryAfterSeconds: 0 };
	}

	const retryAfterSeconds = Math.max(1, Math.ceil((result.windowStart + windowMs - now) / 1000));
	return { allowed: false, retryAfterSeconds };
}

/**
 * For +server.ts endpoints and actions that already use SvelteKit's
 * `throw error(...)` for other validation failures (auth, bad input,
 * not-found, etc). Throws a 429 the same way, so it drops straight into
 * existing call sites with no special-case try/catch needed — e.g.:
 *
 *   if (!locals.user) throw error(401, 'Sign in required');
 *   await rateLimitUserWrite(locals.user.id);
 *
 * One shared bucket per user (`write:<userId>`) covers every mutating
 * endpoint (concepts, relations, maps) rather than a separate bucket per
 * route, since the goal is protecting against runaway scripts/bugs and
 * abuse in general — not fine-tuning per-endpoint quotas.
 */
export async function rateLimitUserWrite(userId: string): Promise<void> {
	const result = await checkRateLimit(`write:${userId}`, { limit: 60, windowMs: 60_000 });
	if (!result.allowed) {
		throw error(429, `Too many requests. Please try again in ${result.retryAfterSeconds}s.`);
	}
}

/**
 * For the login form action specifically, which prefers to show an inline
 * `fail()` error on the form (consistent with its other validation errors)
 * rather than replace the whole page with a generic error screen — so this
 * returns a message string instead of throwing. Rate limited by IP since
 * there's no authenticated user yet at sign-in time.
 */
export async function checkLoginRateLimit(ip: string): Promise<string | null> {
	const result = await checkRateLimit(`login:${ip}`, { limit: 20, windowMs: 5 * 60_000 });
	if (result.allowed) return null;
	return `Too many sign-in attempts. Please try again in ${result.retryAfterSeconds}s.`;
}