import { getCommunityStats } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
		return { community: await getCommunityStats() };
};