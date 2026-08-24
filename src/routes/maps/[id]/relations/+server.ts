import { json, error } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { concepts, conceptRelations, maps } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/activity';
import { RELATION_TYPES, relationLabel } from '$lib/shared/relations';
import type { RequestHandler } from './$types';
import type { ClientRelation } from '$lib/shared/types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id); 

	const body = (await request.json()) as { sourceId?: string; targetId?: string; type?: string };
	const { sourceId, targetId, type } = body;

	if (!sourceId || !targetId) throw error(400, 'sourceId and targetId are required.');
	if (sourceId === targetId) throw error(400, 'A concept cannot be related to itself.');
	if (!type || !RELATION_TYPES.includes(type as (typeof RELATION_TYPES)[number])) {
		throw error(400, `type must be one of: ${RELATION_TYPES.join(', ')}`);
	}

	const source = await db
		.select()
		.from(concepts)
		.where(and(eq(concepts.id, sourceId), eq(concepts.mapId, params.id)))
		.get();
	const target = await db
		.select()
		.from(concepts)
		.where(and(eq(concepts.id, targetId), eq(concepts.mapId, params.id)))
		.get();
	if (!source || !target) throw error(404, 'Both concepts must exist in this map.');

	const dup = await db
		.select()
		.from(conceptRelations)
		.where(
			and(
				eq(conceptRelations.mapId, params.id),
				eq(conceptRelations.sourceId, sourceId),
				eq(conceptRelations.targetId, targetId),
				eq(conceptRelations.type, type)
			)
		)
		.get();
	if (dup) throw error(409, 'This exact relation already exists.');

	const id = nanoid();
	const now = new Date();

	await db
		.insert(conceptRelations)
		.values({ id, mapId: params.id, sourceId, targetId, type, createdBy: locals.user.id, createdAt: now })
		.run();

	await db.update(maps).set({ updatedAt: now }).where(eq(maps.id, params.id)).run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'created_relation',
		entityType: 'relation',
		entityId: id,
		summary: `Linked "${source.name}" ${relationLabel(type).toLowerCase()} "${target.name}"`
	});

	const response: ClientRelation = {
		id,
		mapId: params.id,
		sourceId,
		targetId,
		type: type as ClientRelation['type'],
		createdById: locals.user.id,
		createdByName: locals.user.name,
		createdAt: now.toISOString()
	};

	return json(response, { status: 201 });
};
