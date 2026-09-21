import { json, error } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { conceptRelations, relationComments } from '$lib/server/db/schema';
import { getRelationComments } from '$lib/server/queries';
import { logActivity } from '$lib/server/activity';
import type { RequestHandler } from './$types';
import type { ClientRelationComment } from '$lib/shared/types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');

	const relation = await db
		.select()
		.from(conceptRelations)
		.where(and(eq(conceptRelations.id, params.relationId), eq(conceptRelations.mapId, params.id)))
		.get();
	if (!relation) throw error(404, 'Relation not found');

	const rows = await getRelationComments(params.relationId);
	const comments: ClientRelationComment[] = rows.map((r) => ({
		...r,
		createdAt: r.createdAt.toISOString()
	}));
	return json(comments);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);

	const relation = await db
		.select()
		.from(conceptRelations)
		.where(and(eq(conceptRelations.id, params.relationId), eq(conceptRelations.mapId, params.id)))
		.get();
	if (!relation) throw error(404, 'Relation not found');

	const body = (await request.json()) as { body?: string };
	const text = body.body?.trim() ?? '';
	if (!text) throw error(400, 'Comment cannot be empty.');
	if (text.length > 2000) throw error(400, 'Comment must be at most 2000 characters.');

	const id = nanoid();
	const now = new Date();

	await db
		.insert(relationComments)
		.values({ id, mapId: params.id, relationId: params.relationId, userId: locals.user.id, body: text, createdAt: now })
		.run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'commented_relation',
		entityType: 'relation',
		entityId: params.relationId,
		summary: `Commented on a relation`
	});

	const response: ClientRelationComment = {
		id,
		mapId: params.id,
		relationId: params.relationId,
		userId: locals.user.id,
		userName: locals.user.name,
		userColor: locals.user.color,
		body: text,
		createdAt: now.toISOString()
	};

	return json(response, { status: 201 });
};
