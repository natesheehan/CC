import { json, error } from '@sveltejs/kit';
import { requireMapEdit } from '$lib/server/access';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { concepts, maps, users } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/activity';
import type { RequestHandler } from './$types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';
import { parsePositions, savePositions } from '$lib/server/positions';
import { LIGHT_FUNCTION_CONFIG } from '$lib/server/functionConfig';
import type { Config } from '@sveltejs/adapter-vercel';

export const config: Config = LIGHT_FUNCTION_CONFIG;

const CONTENT_FIELDS = ['name', 'definition', 'literatureLink', 'example', 'quizQuestion'] as const;

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await requireMapEdit(params.id, locals.user.id);

	const body = (await request.json()) as Record<string, unknown>;

	// Fast path: a position-only update (numeric x and y, nothing else) is one
	// batched round trip with no response body, instead of the full
	// read-modify-read-back below. The map page now uses PATCH /positions,
	// but this keeps older clients cheap too.
	const keys = Object.keys(body);
	if (keys.length === 2 && 'x' in body && 'y' in body && body.x !== null && body.y !== null) {
		const positions = parsePositions({ positions: [{ id: params.conceptId, x: body.x, y: body.y }] });
		if (!positions) throw error(400, 'Invalid position');
		const result = await savePositions(params.id, locals.user.id, positions);
		if (result.status === 'rate_limited') {
			throw error(429, `Too many requests. Please try again in ${result.retryAfterSeconds}s.`);
		}
		return new Response(null, { status: 204 });
	}

	await rateLimitUserWrite(locals.user.id);

	const existing = await db
		.select()
		.from(concepts)
		.where(and(eq(concepts.id, params.conceptId), eq(concepts.mapId, params.id)))
		.get();
	if (!existing) throw error(404, 'Concept not found');

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
		updates.definition = definition || null;
	}
	if ('literatureLink' in body) {
		const literatureLink = String(body.literatureLink ?? '').trim();
		updates.literatureLink = literatureLink || null;
	}
	if ('example' in body) updates.example = (body.example as string)?.trim() || null;
	if ('quizQuestion' in body) updates.quizQuestion = (body.quizQuestion as string)?.trim() || null;
	if ('x' in body) updates.x = body.x === null ? null : Number(body.x);
	if ('y' in body) updates.y = body.y === null ? null : Number(body.y);
	if ('x' in body || 'y' in body) updates.movedAt = now.getTime();

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
	await requireMapEdit(params.id, locals.user.id);

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
