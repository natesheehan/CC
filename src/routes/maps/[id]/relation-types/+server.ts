import { json, error } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { relationTypes } from '$lib/server/db/schema';
import { RELATION_TYPES } from '$lib/shared/relations';
import { logActivity } from '$lib/server/activity';
import type { RequestHandler } from './$types';
import type { CustomRelationType } from '$lib/shared/relations';
import { rateLimitUserWrite } from '$lib/server/rateLimit';

function slugify(label: string): string {
	return (
		label
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'relation'
	);
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);

	const body = (await request.json()) as {
		label?: string;
		phrase?: string;
		color?: string;
		directional?: boolean;
		description?: string | null;
	};

	const label = body.label?.trim();
	const phrase = body.phrase?.trim();
	const color = body.color?.trim();
	if (!label) throw error(400, 'label is required.');
	if (!phrase) throw error(400, 'phrase is required.');
	if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) throw error(400, 'color must be a hex value like #2563eb.');

	let key = slugify(label);
	if (RELATION_TYPES.includes(key as (typeof RELATION_TYPES)[number])) key = `${key}_custom`;

	const existingWithKey = await db
		.select()
		.from(relationTypes)
		.where(and(eq(relationTypes.mapId, params.id), eq(relationTypes.key, key)))
		.get();
	if (existingWithKey) {
		key = `${key}_${nanoid(4).toLowerCase()}`;
	}

	const id = nanoid();
	const now = new Date();

	await db
		.insert(relationTypes)
		.values({
			id,
			mapId: params.id,
			key,
			label,
			phrase,
			color,
			directional: body.directional ?? true,
			description: body.description?.trim() || null,
			createdBy: locals.user.id,
			createdAt: now,
			updatedAt: now
		})
		.run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'created_relation_type',
		entityType: 'relation_type',
		entityId: id,
		summary: `Created the relation type "${label}"`
	});

	const response: CustomRelationType = {
		id,
		mapId: params.id,
		key,
		label,
		phrase,
		color,
		directional: body.directional ?? true,
		description: body.description?.trim() || null,
		createdById: locals.user.id,
		createdByName: locals.user.name,
		createdAt: now.toISOString()
	};

	return json(response, { status: 201 });
};
