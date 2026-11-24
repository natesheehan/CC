import { getCommunityStats } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return { community: await getCommunityStats(locals.user?.id ?? null) };
};
