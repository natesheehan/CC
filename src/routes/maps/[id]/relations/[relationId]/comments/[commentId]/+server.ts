import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { relationComments } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);

	const existing = await db
		.select()
		.from(relationComments)
		.where(
			and(
				eq(relationComments.id, params.commentId),
				eq(relationComments.relationId, params.relationId),
				eq(relationComments.mapId, params.id)
			)
		)
		.get();
	if (!existing) throw error(404, 'Comment not found');
	if (existing.userId !== locals.user.id) throw error(403, 'You can only delete your own comments.');

	await db.delete(relationComments).where(eq(relationComments.id, params.commentId)).run();

	return json({ ok: true });
};
