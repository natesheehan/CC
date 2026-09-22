import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { getUserStats } from '$lib/server/queries';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');

	const user = await db.select().from(users).where(eq(users.id, params.id)).get();
	if (!user) throw error(404, 'User not found');

	const stats = await getUserStats(user.id);
	return json({
		user: { id: user.id, name: user.name, color: user.color, createdAt: user.createdAt },
		stats
	});
};
