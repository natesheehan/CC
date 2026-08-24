import { error, redirect } from '@sveltejs/kit';
import { getMap, getMapConcepts, getMapRelations } from '$lib/server/queries';
import { getMapActivity } from '$lib/server/activity';
import type { PageServerLoad } from './$types';
import type { ClientActivityEntry, ClientConcept, ClientRelation } from '$lib/shared/types';


export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	const map = await getMap(params.id);
	if (!map) throw error(404, 'Map not found');

	const [rawConcepts, rawRelations, rawActivity] = await Promise.all([
		getMapConcepts(params.id),
		getMapRelations(params.id),
		getMapActivity(params.id)
	]);

	const concepts: ClientConcept[] = rawConcepts.map((c) => ({
		...c,
		createdAt: c.createdAt.toISOString(),
		updatedAt: c.updatedAt.toISOString()
	}));

	const relations: ClientRelation[] = rawRelations.map((r) => ({
		...r,
		type: r.type as ClientRelation['type'],
		createdAt: r.createdAt.toISOString()
	}));

	const activity: ClientActivityEntry[] = rawActivity.map((a) => ({
		...a,
		createdAt: a.createdAt.toISOString()
	}));

	return {
		map: {
			...map,
			createdAt: map.createdAt.toISOString(),
			updatedAt: map.updatedAt.toISOString()
		},
		concepts,
		relations,
		activity
	};
};
