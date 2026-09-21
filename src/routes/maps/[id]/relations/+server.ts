import { json, error } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { concepts, conceptRelations, relationTypes, maps } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/activity';
import { RELATION_TYPES, relationLabel } from '$lib/shared/relations';
import type { RequestHandler } from './$types';
import type { ClientRelation } from '$lib/shared/types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id); 

	const body = (await request.json()) as {
		sourceId?: string;
		targetId?: string;
		type?: string;
		direction?: string;
		description?: string | null;
	};
	const { sourceId, targetId, type } = body;
	const description = body.description?.trim() || null;

	if (!sourceId || !targetId) throw error(400, 'sourceId and targetId are required.');
	if (sourceId === targetId) throw error(400, 'A concept cannot be related to itself.');

	let directionalDefault = true;
	let typeLabel: string | undefined;
	if (type && RELATION_TYPES.includes(type as (typeof RELATION_TYPES)[number])) {
		directionalDefault = true; // built-ins vary; relationLabel handles display, default arrow shown per meta below
	} else if (type) {
		const customType = await db
			.select()
			.from(relationTypes)
			.where(and(eq(relationTypes.key, type), eq(relationTypes.mapId, params.id)))
			.get();
		if (!customType) throw error(400, `Unknown relation type: ${type}`);
		directionalDefault = customType.directional;
		typeLabel = customType.label;
	} else {
		throw error(400, `type is required.`);
	}

	const direction = body.direction === 'both' || body.direction === 'forward' ? body.direction : directionalDefault ? 'forward' : 'both';

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

	const id = nanoid();
	const now = new Date();

	await db
		.insert(conceptRelations)
		.values({
			id,
			mapId: params.id,
			sourceId,
			targetId,
			type: type!,
			direction,
			description,
			createdBy: locals.user.id,
			createdAt: now
		})
		.run();

	await db.update(maps).set({ updatedAt: now }).where(eq(maps.id, params.id)).run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'created_relation',
		entityType: 'relation',
		entityId: id,
		summary: `Linked "${source.name}" ${(typeLabel ?? relationLabel(type!)).toLowerCase()} "${target.name}"`
	});

	const response: ClientRelation = {
		id,
		mapId: params.id,
		sourceId,
		targetId,
		type: type as ClientRelation['type'],
		direction: direction as ClientRelation['direction'],
		description,
		createdById: locals.user.id,
		createdByName: locals.user.name,
		createdAt: now.toISOString()
	};

	return json(response, { status: 201 });
};
