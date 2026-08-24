import type { Handle } from '@sveltejs/kit';
import { getUserFromSession } from '$lib/server/auth';
import { ensureSchema } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
	await ensureSchema();
	event.locals.user = await getUserFromSession(event.cookies);
	return resolve(event);
};
