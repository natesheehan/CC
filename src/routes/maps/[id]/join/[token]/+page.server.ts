import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { maps } from '$lib/server/db/schema';
import { addMember, getMapWithAccess } from '$lib/server/access';
import { logActivity } from '$lib/server/activity';
import type { PageServerLoad } from './$types';

// Opening a map's invite link makes you a member (can view + edit),
// whatever the map's visibility. Links can be rotated or turned off by the
// owner, which invalidates old ones.
export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const valid = await db
		.select({ id: maps.id, name: maps.name })
		.from(maps)
		.where(and(eq(maps.id, params.id), eq(maps.inviteToken, params.token)))
		.get();
	if (!valid) return { invalid: true as const };

	const found = await getMapWithAccess(params.id, locals.user.id);
	if (found && !found.access.isMember) {
		await addMember(params.id, locals.user.id, found.map.createdBy);
		await logActivity({
			mapId: params.id,
			userId: locals.user.id,
			action: 'joined_map',
			entityType: 'member',
			entityId: locals.user.id,
			summary: 'Joined the map via its invite link'
		});
	}
	throw redirect(303, `/maps/${params.id}`);
};
