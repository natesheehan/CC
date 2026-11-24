import { json, error } from '@sveltejs/kit';
import { requireMapView } from '$lib/server/access';
import { rateLimitUserWrite } from '$lib/server/rateLimit';
import { deleteVersion, getVersion } from '$lib/server/versions';
import type { RequestHandler } from './$types';

/** The full snapshot, for previewing or downloading a version. */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await requireMapView(params.id, locals.user.id);
	const version = await getVersion(params.id, params.versionId);
	if (!version) throw error(404, 'Version not found');
	return json({ id: version.row.id, label: version.row.label, createdAt: version.row.createdAt.toISOString(), snapshot: version.snapshot });
};

/** Delete a version: whoever saved it, or the map's owner. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);
	const { access } = await requireMapView(params.id, locals.user.id);
	const version = await getVersion(params.id, params.versionId);
	if (!version) throw error(404, 'Version not found');
	if (version.row.createdBy !== locals.user.id && !access.canManage) {
		throw error(403, "Only whoever saved this version, or the map's owner, can delete it.");
	}
	await deleteVersion(params.id, params.versionId);
	return json({ ok: true });
};
