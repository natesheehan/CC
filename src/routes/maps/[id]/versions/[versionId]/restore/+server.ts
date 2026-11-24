import { json, error } from '@sveltejs/kit';
import { requireMapEdit } from '$lib/server/access';
import { logActivity } from '$lib/server/activity';
import { rateLimitUserWrite } from '$lib/server/rateLimit';
import { createVersion, getVersion, restoreSnapshot } from '$lib/server/versions';
import type { RequestHandler } from './$types';

/**
 * Roll the map back to a saved version. The current state is saved first as
 * an automatic version, so a restore can itself be undone.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);
	await requireMapEdit(params.id, locals.user.id);

	const version = await getVersion(params.id, params.versionId);
	if (!version) throw error(404, 'Version not found');

	const backup = await createVersion({
		mapId: params.id,
		userId: locals.user.id,
		label: `Before restoring "${version.row.label}"`,
		kind: 'auto'
	});
	await restoreSnapshot(params.id, version.snapshot);
	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'restored_version',
		entityType: 'version',
		entityId: version.row.id,
		summary: `Restored the map to version "${version.row.label}"`
	});
	return json({ ok: true, backupId: backup?.id ?? null });
};
