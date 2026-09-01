import { json, error } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { concepts, maps } from '$lib/server/db/schema';
import { getMap } from '$lib/server/queries';
import { logActivity } from '$lib/server/activity';
import type { RequestHandler } from './$types';
import type { ConceptInput, ClientConcept } from '$lib/shared/types';
import { rateLimitUserWrite } from '$lib/server/rateLimit';


export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id); 

	const map = await getMap(params.id);
	if (!map) throw error(404, 'Map not found');

	const body = (await request.json()) as ConceptInput;
	const name = (body.name ?? '').trim();
	const definition = (body.definition ?? '').trim();
	const literatureLink = (body.literatureLink ?? '').trim();

	if (name.length < 1 || name.length > 200) {
		throw error(400, 'Concept name must be 1-200 characters.');
	}

	const id = nanoid();
	const now = new Date();

	await db
		.insert(concepts)
		.values({
			id,
			mapId: params.id,
			name,
			definition: definition || null,
			literatureLink: literatureLink || null,
			example: body.example?.trim() || null,
			quizQuestion: body.quizQuestion?.trim() || null,
			x: body.x ?? null,
			y: body.y ?? null,
			createdBy: locals.user.id,
			updatedBy: locals.user.id,
			createdAt: now,
			updatedAt: now
		})
		.run();

	await db.update(maps).set({ updatedAt: now }).where(eq(maps.id, params.id)).run();

	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'created_concept',
		entityType: 'concept',
		entityId: id,
		summary: `Added the concept "${name}"`
	});

	const response: ClientConcept = {
		id,
		mapId: params.id,
		name,
		definition: definition || null,
		literatureLink: literatureLink || null,
		example: body.example?.trim() || null,
		quizQuestion: body.quizQuestion?.trim() || null,
		x: body.x ?? null,
		y: body.y ?? null,
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
		createdById: locals.user.id,
		createdByName: locals.user.name,
		createdByColor: locals.user.color,
		updatedById: locals.user.id,
		updatedByName: locals.user.name,
		updatedByColor: locals.user.color
	};

	return json(response, { status: 201 });
};
