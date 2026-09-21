import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { concepts, conceptRelations, relationTypes, maps, users } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/activity';
import { RELATION_TYPES, relationLabel } from '$lib/shared/relations';
import type { RequestHandler } from './$types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);

	const existing = await db
		.select()
		.from(conceptRelations)
		.where(and(eq(conceptRelations.id, params.relationId), eq(conceptRelations.mapId, params.id)))
		.get();
	if (!existing) throw error(404, 'Relation not found');

	const body = (await request.json()) as {
		type?: string;
		direction?: string;
		description?: string | null;
	};

	const updates: Partial<typeof conceptRelations.$inferInsert> = {};

	if ('type' in body && body.type) {
		const isBuiltIn = RELATION_TYPES.includes(body.type as (typeof RELATION_TYPES)[number]);
		if (!isBuiltIn) {
			const customType = await db
				.select()
				.from(relationTypes)
				.where(and(eq(relationTypes.key, body.type), eq(relationTypes.mapId, params.id)))
				.get();
			if (!customType) throw error(400, `Unknown relation type: ${body.type}`);
		}
		updates.type = body.type;
	}
	if ('direction' in body) {
		if (body.direction !== 'forward' && body.direction !== 'both') {
			throw error(400, "direction must be 'forward' or 'both'.");
		}
		updates.direction = body.direction;
	}
	if ('description' in body) {
		updates.description = body.description?.trim() || null;
	}

	if (Object.keys(updates).length === 0) {
		throw error(400, 'Nothing to update.');
	}

	updates.updatedBy = locals.user.id;
	updates.updatedAt = new Date();

	await db.update(conceptRelations).set(updates).where(eq(conceptRelations.id, params.relationId)).run();
	await db.update(maps).set({ updatedAt: new Date() }).where(eq(maps.id, params.id)).run();

	const source = await db.select().from(concepts).where(eq(concepts.id, existing.sourceId)).get();
	const target = await db.select().from(concepts).where(eq(concepts.id, existing.targetId)).get();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'updated_relation',
		entityType: 'relation',
		entityId: params.relationId,
		summary: `Edited the link between "${source?.name ?? '?'}" and "${target?.name ?? '?'}"`
	});

	const updated = (await db.select().from(conceptRelations).where(eq(conceptRelations.id, params.relationId)).get())!;
	const creatorRow = await db.select().from(users).where(eq(users.id, updated.createdBy)).get();
	const editorRow = updated.updatedBy
		? await db.select().from(users).where(eq(users.id, updated.updatedBy)).get()
		: null;

	return json({
		...updated,
		createdAt: updated.createdAt.toISOString(),
		updatedAt: updated.updatedAt?.toISOString() ?? null,
		createdById: updated.createdBy,
		createdByName: creatorRow?.name ?? null,
		updatedById: updated.updatedBy,
		updatedByName: editorRow?.name ?? null
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id); 

	const existing = await db
		.select()
		.from(conceptRelations)
		.where(and(eq(conceptRelations.id, params.relationId), eq(conceptRelations.mapId, params.id)))
		.get();
	if (!existing) throw error(404, 'Relation not found');

	const source = await db.select().from(concepts).where(eq(concepts.id, existing.sourceId)).get();
	const target = await db.select().from(concepts).where(eq(concepts.id, existing.targetId)).get();

	await db.delete(conceptRelations).where(eq(conceptRelations.id, params.relationId)).run();
	await db.update(maps).set({ updatedAt: new Date() }).where(eq(maps.id, params.id)).run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'deleted_relation',
		entityType: 'relation',
		entityId: params.relationId,
		summary: `Removed link "${source?.name ?? '?'}" ${relationLabel(existing.type).toLowerCase()} "${target?.name ?? '?'}"`
	});

	return json({ ok: true });
};
