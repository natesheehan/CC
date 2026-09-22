import { eq, desc, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from './db';
import { maps, concepts, conceptRelations, relationTypes, relationComments, activityLog, users } from './db/schema';

const creator = alias(users, 'creator');
const editor = alias(users, 'editor');
const relationEditor = alias(users, 'relationEditor');

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
			relationCount: sql<number>`(select count(*) from concept_relations where concept_relations.map_id = maps.id)`,
			contributorCount: sql<number>`(
				select count(distinct uid) from (
					select ${maps.createdBy} as uid
					union select created_by as uid from concepts where concepts.map_id = maps.id
					union select updated_by as uid from concepts where concepts.map_id = maps.id
					union select created_by as uid from concept_relations where concept_relations.map_id = maps.id
				)
			)`
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

// A global, cross-map directory of every concept — used by the /concepts
// dictionary page rather than a single map's canvas.
export async function getAllConcepts() {
	return await db
		.select({
			id: concepts.id,
			mapId: concepts.mapId,
			mapName: maps.name,
			name: concepts.name,
			definition: concepts.definition,
			literatureLink: concepts.literatureLink,
			example: concepts.example,
			createdAt: concepts.createdAt,
			createdByName: creator.name
		})
		.from(concepts)
		.innerJoin(maps, eq(concepts.mapId, maps.id))
		.leftJoin(creator, eq(concepts.createdBy, creator.id))
		.orderBy(concepts.name)
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
			direction: conceptRelations.direction,
			description: conceptRelations.description,
			createdAt: conceptRelations.createdAt,
			createdById: conceptRelations.createdBy,
			createdByName: users.name,
			updatedById: conceptRelations.updatedBy,
			updatedByName: relationEditor.name,
			updatedAt: conceptRelations.updatedAt,
			commentCount: sql<number>`(select count(*) from relation_comments where relation_comments.relation_id = concept_relations.id)`
		})
		.from(conceptRelations)
		.leftJoin(users, eq(conceptRelations.createdBy, users.id))
		.leftJoin(relationEditor, eq(conceptRelations.updatedBy, relationEditor.id))
		.where(eq(conceptRelations.mapId, mapId))
		.all();
}

export async function getMapRelationTypes(mapId: string) {
	return await db
		.select({
			id: relationTypes.id,
			mapId: relationTypes.mapId,
			key: relationTypes.key,
			label: relationTypes.label,
			phrase: relationTypes.phrase,
			color: relationTypes.color,
			directional: relationTypes.directional,
			description: relationTypes.description,
			createdAt: relationTypes.createdAt,
			createdById: relationTypes.createdBy,
			createdByName: users.name
		})
		.from(relationTypes)
		.leftJoin(users, eq(relationTypes.createdBy, users.id))
		.where(eq(relationTypes.mapId, mapId))
		.all();
}

export async function getRelationComments(relationId: string) {
	return await db
		.select({
			id: relationComments.id,
			mapId: relationComments.mapId,
			relationId: relationComments.relationId,
			userId: relationComments.userId,
			userName: users.name,
			userColor: users.color,
			body: relationComments.body,
			createdAt: relationComments.createdAt
		})
		.from(relationComments)
		.leftJoin(users, eq(relationComments.userId, users.id))
		.where(eq(relationComments.relationId, relationId))
		.orderBy(relationComments.createdAt)
		.all();
}

// Lightweight cross-map profile stats for the "click your name" popover —
// counts, not full rows, so this stays cheap even for a prolific user.
export async function getUserStats(userId: string) {
	const [
		mapsCreated,
		conceptsCreated,
		relationsCreated,
		commentsPosted,
		totalActions,
		mapsContributedTo,
		lastActive,
		topRelationType
	] = await Promise.all([
		db.select({ count: sql<number>`count(*)` }).from(maps).where(eq(maps.createdBy, userId)).get(),
		db.select({ count: sql<number>`count(*)` }).from(concepts).where(eq(concepts.createdBy, userId)).get(),
		db
			.select({ count: sql<number>`count(*)` })
			.from(conceptRelations)
			.where(eq(conceptRelations.createdBy, userId))
			.get(),
		db.select({ count: sql<number>`count(*)` }).from(relationComments).where(eq(relationComments.userId, userId)).get(),
		db.select({ count: sql<number>`count(*)` }).from(activityLog).where(eq(activityLog.userId, userId)).get(),
		db
			.select({ count: sql<number>`count(distinct ${activityLog.mapId})` })
			.from(activityLog)
			.where(eq(activityLog.userId, userId))
			.get(),
		db.select({ at: sql<number | null>`max(${activityLog.createdAt})` }).from(activityLog).where(eq(activityLog.userId, userId)).get(),
		db
			.select({ type: conceptRelations.type, count: sql<number>`count(*)` })
			.from(conceptRelations)
			.where(eq(conceptRelations.createdBy, userId))
			.groupBy(conceptRelations.type)
			.orderBy(sql`count(*) desc`)
			.limit(1)
			.get()
	]);

	return {
		mapsCreated: mapsCreated?.count ?? 0,
		conceptsCreated: conceptsCreated?.count ?? 0,
		relationsCreated: relationsCreated?.count ?? 0,
		commentsPosted: commentsPosted?.count ?? 0,
		totalActions: totalActions?.count ?? 0,
		mapsContributedTo: mapsContributedTo?.count ?? 0,
		lastActiveAt: lastActive?.at ?? null,
		topRelationType: topRelationType?.type ?? null
	};
}