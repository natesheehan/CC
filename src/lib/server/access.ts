import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { mapMembers, maps, type MapRow } from './db/schema';
import { resolveAccess, type MapAccess } from '$lib/shared/access';

export type { MapAccess };

/** The map plus what `userId` may do with it, in one query. Null if the map doesn't exist. */
export async function getMapWithAccess(
	mapId: string,
	userId: string | null | undefined
): Promise<{ map: MapRow; access: MapAccess } | null> {
	const row = await db
		.select({
			map: maps,
			isMember: sql<number>`exists (select 1 from ${mapMembers} where ${mapMembers.mapId} = ${maps.id} and ${mapMembers.userId} = ${userId ?? ''})`
		})
		.from(maps)
		.where(eq(maps.id, mapId))
		.get();
	if (!row) return null;
	return { map: row.map, access: resolveAccess(row.map, userId, Boolean(row.isMember)) };
}

/**
 * Throws unless the user can view the map. Private maps answer 404 rather
 * than 403 to people who aren't invited, so their existence isn't revealed.
 */
export async function requireMapView(mapId: string, userId: string) {
	const found = await getMapWithAccess(mapId, userId);
	if (!found || !found.access.canView) throw error(404, 'Map not found');
	return found;
}

/** Throws unless the user can edit the map's content. */
export async function requireMapEdit(mapId: string, userId: string) {
	const found = await requireMapView(mapId, userId);
	if (!found.access.canEdit) throw error(403, 'You can view this map but not edit it. Ask its owner for an invite.');
	return found;
}

/** Throws unless the user may manage sharing (the map's creator). */
export async function requireMapManage(mapId: string, userId: string) {
	const found = await requireMapView(mapId, userId);
	if (!found.access.canManage) throw error(403, "Only the map's owner can change who has access.");
	return found;
}

/**
 * SQL condition: `userId` can see the `maps` row in scope. Use in queries
 * that select from (or join) `maps`, to filter lists (dashboard,
 * dictionary, community) without a lookup per map.
 */
export function canViewMapRowSql(userId: string | null | undefined) {
	if (!userId) return sql`${maps.visibility} <> 'private'`;
	return sql`(${maps.visibility} <> 'private' or ${maps.createdBy} = ${userId} or exists (select 1 from ${mapMembers} where ${mapMembers.mapId} = ${maps.id} and ${mapMembers.userId} = ${userId}))`;
}

/**
 * SQL condition: `userId` can edit map `mapId` (bound as a parameter, so it
 * is safe inside queries on any table). Lets batched writes guard themselves.
 */
export function canEditMapSql(mapId: string, userId: string) {
	return sql`exists (select 1 from ${maps} m where m.id = ${mapId} and (
		m.visibility = 'public_edit' or m.created_by = ${userId}
		or exists (select 1 from ${mapMembers} mm where mm.map_id = m.id and mm.user_id = ${userId})
	))`;
}

/** Add a member (no-op if already one). */
export async function addMember(mapId: string, userId: string, addedBy: string) {
	await db
		.insert(mapMembers)
		.values({ mapId, userId, addedBy, createdAt: new Date() })
		.onConflictDoNothing()
		.run();
}

export async function removeMember(mapId: string, userId: string) {
	await db
		.delete(mapMembers)
		.where(and(eq(mapMembers.mapId, mapId), eq(mapMembers.userId, userId)))
		.run();
}
