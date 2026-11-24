import { json, error } from '@sveltejs/kit';
import { requireMapEdit, requireMapView } from '$lib/server/access';
import { logActivity } from '$lib/server/activity';
import { rateLimitUserWrite } from '$lib/server/rateLimit';
import { MAX_VERSION_LABEL, createVersion, listVersions } from '$lib/server/versions';
import type { RequestHandler } from './$types';

/** Anyone who can view a map can browse its saved versions. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await requireMapView(params.id, locals.user.id);
	return json(await listVersions(params.id));
};

/** Save the map as it is now: { label } */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);
	await requireMapEdit(params.id, locals.user.id);

	const body = (await request.json().catch(() => ({}))) as { label?: unknown };
	const label = typeof body.label === 'string' ? body.label.trim() : '';
	if (label.length < 1 || label.length > MAX_VERSION_LABEL) {
		throw error(400, `Give the version a name (1-${MAX_VERSION_LABEL} characters).`);
	}

	const version = await createVersion({ mapId: params.id, userId: locals.user.id, label });
	if (!version) throw error(404, 'Map not found');
	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'saved_version',
		entityType: 'version',
		entityId: version.id,
		summary: `Saved a version "${label}"`
	});
	return json(version, { status: 201 });
};
