import { nanoid } from 'nanoid';
import { eq, desc } from 'drizzle-orm';
import { db } from './db';
import { activityLog, users } from './db/schema';

export type ActivityAction =
	| 'created_map'
	| 'renamed_map'
	| 'created_concept'
	| 'updated_concept'
	| 'deleted_concept'
	| 'moved_concept'
	| 'created_relation'
	| 'updated_relation'
	| 'deleted_relation'
	| 'commented_relation'
	| 'created_relation_type'
	| 'updated_relation_type'
	| 'deleted_relation_type';

export async function logActivity(params: {
	mapId: string;
	userId: string;
	action: ActivityAction;
	entityType: 'map' | 'concept' | 'relation' | 'relation_type' | 'comment';
	entityId: string;
	summary: string;
}): Promise<void> {
	await db
		.insert(activityLog)
		.values({
			id: nanoid(),
			mapId: params.mapId,
			userId: params.userId,
			action: params.action,
			entityType: params.entityType,
			entityId: params.entityId,
			summary: params.summary,
			createdAt: new Date()
		})
		.run();
}

export async function getMapActivity(mapId: string, limit = 50) {
	return await db
		.select({
			id: activityLog.id,
			mapId: activityLog.mapId,
			userId: activityLog.userId,
			userName: users.name,
			userColor: users.color,
			action: activityLog.action,
			entityType: activityLog.entityType,
			entityId: activityLog.entityId,
			summary: activityLog.summary,
			createdAt: activityLog.createdAt
		})
		.from(activityLog)
		.leftJoin(users, eq(activityLog.userId, users.id))
		.where(eq(activityLog.mapId, mapId))
		.orderBy(desc(activityLog.createdAt))
		.limit(limit)
		.all();
}
