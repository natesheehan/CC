import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { concepts, conceptRelations, maps } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/activity';
import { relationLabel } from '$lib/shared/relations';
import type { RequestHandler } from './$types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

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
