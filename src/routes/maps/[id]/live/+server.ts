import { json, error } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import { SESSION_COOKIE } from '$lib/server/auth';
import { heartbeat, leaveMap, parseHeartbeat } from '$lib/server/presence';
import { LIGHT_FUNCTION_CONFIG } from '$lib/server/functionConfig';
import type { RequestHandler } from './$types';

export const config: Config = LIGHT_FUNCTION_CONFIG;

// Live collaboration heartbeat. Each open map tab POSTs here on an adaptive
// cadence (see $lib/client/livePolicy) with what it's looking at; the
// response carries who else is on the map and anything that changed since
// the last poll. Plain polling (rather than WebSockets/SSE) because the app
// runs as short-lived serverless functions.
//
// Cost per call: exactly one batched database round trip. Authentication is
// part of that batch — hooks.server.ts deliberately skips its session lookup
// for this route — and every query is an index seek. Calls where nothing
// changed answer 204 with no body.
//
// Deliberately not counted against the per-user write rate limit — it's at
// most one bounded upsert per call, and the client paces it.
export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const sessionId = cookies.get(SESSION_COOKIE);
	if (!sessionId) throw error(401, 'Sign in required');

	// sendBeacon (used on tab close) posts as text/plain, so parse manually.
	let raw: unknown;
	try {
		raw = JSON.parse(await request.text());
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const beat = parseHeartbeat(raw);
	if (!beat) throw error(400, 'Invalid heartbeat');

	if (beat.leave) {
		await leaveMap(beat.clientId, sessionId);
		return new Response(null, { status: 204 });
	}

	const started = performance.now();
	const result = await heartbeat(params.id, sessionId, beat);
	const timing = `db;dur=${(performance.now() - started).toFixed(1)}`;

	if (result.status === 'unauthorized') throw error(401, 'Sign in required');
	if (result.status === 'gone') throw error(404, 'Map not found');
	if (result.status === 'unchanged') {
		return new Response(null, {
			status: 204,
			headers: { 'Cache-Control': 'no-store', 'X-Live-Now': String(result.now), 'Server-Timing': timing }
		});
	}
	return json(result.update, { headers: { 'Cache-Control': 'no-store', 'Server-Timing': timing } });
};
