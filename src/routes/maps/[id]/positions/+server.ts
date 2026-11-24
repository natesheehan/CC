import { error } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import { parsePositions, savePositions } from '$lib/server/positions';
import { LIGHT_FUNCTION_CONFIG } from '$lib/server/functionConfig';
import type { RequestHandler } from './$types';

export const config: Config = LIGHT_FUNCTION_CONFIG;

// Batched node positions: { positions: [{ id, x, y }, ...] }. The map page
// queues drags and auto-layout results and flushes them here in one request.
// Responds 204; the client doesn't need anything back. Concepts that don't
// belong to this map are ignored.
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const positions = parsePositions(raw);
	if (!positions) throw error(400, 'Invalid positions');

	const result = await savePositions(params.id, locals.user.id, positions);
	if (result.status === 'rate_limited') {
		throw error(429, `Too many requests. Please try again in ${result.retryAfterSeconds}s.`);
	}
	return new Response(null, { status: 204 });
};
