import { fail, redirect } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import { maps } from '$lib/server/db/schema';
import { listMapsWithStats } from '$lib/server/queries';
import { logActivity } from '$lib/server/activity';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	return {
		maps: await listMapsWithStats()
	};
};

export const actions: Actions = {
	createMap: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Sign in first.' });

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const description = String(form.get('description') ?? '').trim();

		if (name.length < 2 || name.length > 120) {
			return fail(400, { error: 'Map name must be between 2 and 120 characters.' });
		}

		const id = nanoid();
		const now = new Date();

		await db
			.insert(maps)
			.values({
				id,
				name,
				description: description || null,
				createdBy: locals.user.id,
				createdAt: now,
				updatedAt: now
			})
			.run();

		await logActivity({
			mapId: id,
			userId: locals.user.id,
			action: 'created_map',
			entityType: 'map',
			entityId: id,
			summary: `Created the map "${name}"`
		});

		throw redirect(303, `/maps/${id}`);
	}
};
