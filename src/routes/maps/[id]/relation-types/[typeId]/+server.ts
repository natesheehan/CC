import { json, error } from '@sveltejs/kit';
import { eq, and, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { relationTypes, conceptRelations } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/activity';
import type { RequestHandler } from './$types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);

	const existing = await db
		.select()
		.from(relationTypes)
		.where(and(eq(relationTypes.id, params.typeId), eq(relationTypes.mapId, params.id)))
		.get();
	if (!existing) throw error(404, 'Relation type not found');

	const body = (await request.json()) as {
		label?: string;
		phrase?: string;
		color?: string;
		directional?: boolean;
		description?: string | null;
	};

	const updates: Partial<typeof relationTypes.$inferInsert> = {};
	if ('label' in body) {
		const label = body.label?.trim();
		if (!label) throw error(400, 'label cannot be empty.');
		updates.label = label;
	}
	if ('phrase' in body) {
		const phrase = body.phrase?.trim();
		if (!phrase) throw error(400, 'phrase cannot be empty.');
		updates.phrase = phrase;
	}
	if ('color' in body) {
		if (!body.color || !/^#[0-9a-fA-F]{6}$/.test(body.color)) throw error(400, 'color must be a hex value.');
		updates.color = body.color;
	}
	if ('directional' in body) updates.directional = Boolean(body.directional);
	if ('description' in body) updates.description = body.description?.trim() || null;

	if (Object.keys(updates).length === 0) throw error(400, 'Nothing to update.');
	updates.updatedAt = new Date();

	await db.update(relationTypes).set(updates).where(eq(relationTypes.id, params.typeId)).run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'updated_relation_type',
		entityType: 'relation_type',
		entityId: params.typeId,
		summary: `Edited the relation type "${updates.label ?? existing.label}"`
	});

	const updated = (await db.select().from(relationTypes).where(eq(relationTypes.id, params.typeId)).get())!;
	return json({
		...updated,
		createdAt: updated.createdAt.toISOString(),
		updatedAt: updated.updatedAt.toISOString(),
		createdById: updated.createdBy
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);

	const existing = await db
		.select()
		.from(relationTypes)
		.where(and(eq(relationTypes.id, params.typeId), eq(relationTypes.mapId, params.id)))
		.get();
	if (!existing) throw error(404, 'Relation type not found');

	const inUse = await db
		.select({ n: count() })
		.from(conceptRelations)
		.where(and(eq(conceptRelations.mapId, params.id), eq(conceptRelations.type, existing.key)))
		.get();
	if (inUse && inUse.n > 0) {
		throw error(409, `This relation type is used by ${inUse.n} link(s). Remove or retype those links first.`);
	}

	await db.delete(relationTypes).where(eq(relationTypes.id, params.typeId)).run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'deleted_relation_type',
		entityType: 'relation_type',
		entityId: params.typeId,
		summary: `Deleted the relation type "${existing.label}"`
	});

	return json({ ok: true });
};
