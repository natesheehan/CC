import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { maps } from '$lib/server/db/schema';
import { logActivity } from '$lib/server/activity';
import type { RequestHandler } from './$types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);  

	const existing = await db.select().from(maps).where(eq(maps.id, params.id)).get();
	if (!existing) throw error(404, 'Map not found');

	const body = (await request.json()) as { name?: string; description?: string | null };
	const now = new Date();
	const updates: Partial<typeof maps.$inferInsert> = { updatedAt: now };

	if (typeof body.name === 'string') {
		const name = body.name.trim();
		if (name.length < 2 || name.length > 120) throw error(400, 'Map name must be 2-120 characters.');
		updates.name = name;
	}
	if ('description' in body) {
		updates.description = body.description?.trim() || null;
	}

	await db.update(maps).set(updates).where(eq(maps.id, params.id)).run();

	if (updates.name && updates.name !== existing.name) {
		await logActivity({
			mapId: params.id,
			userId: locals.user.id,
			action: 'renamed_map',
			entityType: 'map',
			entityId: params.id,
			summary: `Renamed the map to "${updates.name}"`
		});
	}

	const updated = (await db.select().from(maps).where(eq(maps.id, params.id)).get())!;
	return json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);  

	const existing = await db.select().from(maps).where(eq(maps.id, params.id)).get();
	if (!existing) throw error(404, 'Map not found');

	await db.delete(maps).where(eq(maps.id, params.id)).run();
	return json({ ok: true });
};
