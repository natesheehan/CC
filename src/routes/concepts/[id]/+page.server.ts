import { error, redirect } from '@sveltejs/kit';
import { getConceptEntry } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const entry = await getConceptEntry(params.id);
	if (!entry) throw error(404, 'Concept not found');

	const serialize = <T extends { createdAt: Date }>(c: T) => ({ ...c, createdAt: c.createdAt.toISOString() });
	return {
		concept: serialize(entry.concept),
		matchingMaps: entry.matches.map(serialize)
	};
};
