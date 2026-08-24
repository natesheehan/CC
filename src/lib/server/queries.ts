import { eq, desc, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from './db';
import { maps, concepts, conceptRelations, users } from './db/schema';

const creator = alias(users, 'creator');
const editor = alias(users, 'editor');

export async function listMapsWithStats() {
	return await db
		.select({
			id: maps.id,
			name: maps.name,
			description: maps.description,
			createdAt: maps.createdAt,
			updatedAt: maps.updatedAt,
			createdById: maps.createdBy,
			createdByName: users.name,
			conceptCount: sql<number>`(select count(*) from concepts where concepts.map_id = maps.id)`,
			relationCount: sql<number>`(select count(*) from concept_relations where concept_relations.map_id = maps.id)`
		})
		.from(maps)
		.leftJoin(users, eq(maps.createdBy, users.id))
		.orderBy(desc(maps.updatedAt))
		.all();
}

export async function getMap(mapId: string) {
	return await db.select().from(maps).where(eq(maps.id, mapId)).get();
}

export async function getMapConcepts(mapId: string) {
	return await db
		.select({
			id: concepts.id,
			mapId: concepts.mapId,
			name: concepts.name,
			definition: concepts.definition,
			literatureLink: concepts.literatureLink,
			example: concepts.example,
			quizQuestion: concepts.quizQuestion,
			x: concepts.x,
			y: concepts.y,
			createdAt: concepts.createdAt,
			updatedAt: concepts.updatedAt,
			createdById: concepts.createdBy,
			createdByName: creator.name,
			createdByColor: creator.color,
			updatedById: concepts.updatedBy,
			updatedByName: editor.name,
			updatedByColor: editor.color
		})
		.from(concepts)
		.leftJoin(creator, eq(concepts.createdBy, creator.id))
		.leftJoin(editor, eq(concepts.updatedBy, editor.id))
		.where(eq(concepts.mapId, mapId))
		.all();
}

export async function getMapRelations(mapId: string) {
	return await db
		.select({
			id: conceptRelations.id,
			mapId: conceptRelations.mapId,
			sourceId: conceptRelations.sourceId,
			targetId: conceptRelations.targetId,
			type: conceptRelations.type,
			createdAt: conceptRelations.createdAt,
			createdById: conceptRelations.createdBy,
			createdByName: users.name
		})
		.from(conceptRelations)
		.leftJoin(users, eq(conceptRelations.createdBy, users.id))
		.where(eq(conceptRelations.mapId, mapId))
		.all();
}