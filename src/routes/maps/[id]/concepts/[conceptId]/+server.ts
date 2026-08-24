import { json, error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { concepts, maps, users } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/activity';
import type { RequestHandler } from './$types';

const CONTENT_FIELDS = ['name', 'definition', 'literatureLink', 'example', 'quizQuestion'] as const;

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');

	const existing = await db
		.select()
		.from(concepts)
		.where(and(eq(concepts.id, params.conceptId), eq(concepts.mapId, params.id)))
		.get();
	if (!existing) throw error(404, 'Concept not found');

	const body = (await request.json()) as Record<string, unknown>;
	const now = new Date();

	const isContentEdit = CONTENT_FIELDS.some((f) => f in body);

	const updates: Partial<typeof concepts.$inferInsert> = {};

	if ('name' in body) {
		const name = String(body.name ?? '').trim();
		if (name.length < 1 || name.length > 200) throw error(400, 'Concept name must be 1-200 characters.');
		updates.name = name;
	}
	if ('definition' in body) {
		const definition = String(body.definition ?? '').trim();
		if (definition.length < 1) throw error(400, 'A definition is required.');
		updates.definition = definition;
	}
	if ('literatureLink' in body) updates.literatureLink = (body.literatureLink as string)?.trim() || null;
	if ('example' in body) updates.example = (body.example as string)?.trim() || null;
	if ('quizQuestion' in body) updates.quizQuestion = (body.quizQuestion as string)?.trim() || null;
	if ('x' in body) updates.x = body.x === null ? null : Number(body.x);
	if ('y' in body) updates.y = body.y === null ? null : Number(body.y);

	if (isContentEdit) {
		updates.updatedBy = locals.user.id;
		updates.updatedAt = now;
	}

	await db.update(concepts).set(updates).where(eq(concepts.id, params.conceptId)).run();

	if (isContentEdit) {
		await db.update(maps).set({ updatedAt: now }).where(eq(maps.id, params.id)).run();
		await logActivity({
			mapId: params.id,
			userId: locals.user.id,
			action: 'updated_concept',
			entityType: 'concept',
			entityId: params.conceptId,
			summary: `Edited the concept "${updates.name ?? existing.name}"`
		});
	}

	const updated = (await db.select().from(concepts).where(eq(concepts.id, params.conceptId)).get())!;
	const creatorRow = await db.select().from(users).where(eq(users.id, updated.createdBy)).get();
	const editorRow = await db.select().from(users).where(eq(users.id, updated.updatedBy)).get();

	return json({
		...updated,
		createdAt: updated.createdAt.toISOString(),
		updatedAt: updated.updatedAt.toISOString(),
		createdById: updated.createdBy,
		createdByName: creatorRow?.name ?? null,
		createdByColor: creatorRow?.color ?? null,
		updatedById: updated.updatedBy,
		updatedByName: editorRow?.name ?? null,
		updatedByColor: editorRow?.color ?? null
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');

	const existing = await db
		.select()
		.from(concepts)
		.where(and(eq(concepts.id, params.conceptId), eq(concepts.mapId, params.id)))
		.get();
	if (!existing) throw error(404, 'Concept not found');

	await db.delete(concepts).where(eq(concepts.id, params.conceptId)).run();
	await db.update(maps).set({ updatedAt: new Date() }).where(eq(maps.id, params.id)).run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'deleted_concept',
		entityType: 'concept',
		entityId: params.conceptId,
		summary: `Deleted the concept "${existing.name}"`
	});

	return json({ ok: true });
};
