import { redirect } from '@sveltejs/kit';
import { getAllConcepts } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const rawConcepts = await getAllConcepts();

	return {
		concepts: rawConcepts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))
	};
};
