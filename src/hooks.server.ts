import type { Handle } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import { ensureSchema } from '$lib/server/db';

/**
 * Routes that authenticate themselves inside their own batched query, so
 * the per-request session lookup here would be a wasted round trip. They
 * read the session cookie directly and must not rely on `locals.user`.
 */
const SELF_AUTHENTICATING_ROUTES = new Set(['/maps/[id]/live']);

export const handle: Handle = async ({ event, resolve }) => {
	await ensureSchema();
	event.locals.user = SELF_AUTHENTICATING_ROUTES.has(event.route.id ?? '')
		? null
		: await getUserFromSession(event.cookies);
	return resolve(event);
};
