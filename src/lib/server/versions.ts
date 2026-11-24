import { nanoid } from 'nanoid';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from './db';
import { conceptRelations, concepts, mapVersions, maps, relationTypes, users } from './db/schema';
import type { MapSnapshot, ClientMapVersion } from '$lib/shared/types';

export const MAX_VERSION_LABEL = 120;
/** Old automatic versions beyond this many are pruned; manual ones are kept. */
export const MAX_AUTO_VERSIONS = 20;

/** Capture a map's current content. Positions included so layout restores too. */
export async function snapshotMap(mapId: string): Promise<MapSnapshot | null> {
	const [map, conceptRows, relationRows, typeRows] = await db.batch([
		db.select({ name: maps.name, description: maps.description }).from(maps).where(eq(maps.id, mapId)),
		db.select().from(concepts).where(eq(concepts.mapId, mapId)),
		db.select().from(conceptRelations).where(eq(conceptRelations.mapId, mapId)),
		db.select().from(relationTypes).where(eq(relationTypes.mapId, mapId))
	]);
	if (!map[0]) return null;
	const ms = (d: Date | number | null | undefined) => (d == null ? null : new Date(d).getTime());
	return {
		format: 1,
		name: map[0].name,
		description: map[0].description,
		concepts: conceptRows.map((c) => ({
			id: c.id,
			name: c.name,
			definition: c.definition,
			literatureLink: c.literatureLink,
			example: c.example,
			quizQuestion: c.quizQuestion,
			x: c.x,
			y: c.y,
			createdBy: c.createdBy,
			updatedBy: c.updatedBy,
			createdAt: ms(c.createdAt)!,
			updatedAt: ms(c.updatedAt)!
		})),
		relations: relationRows.map((r) => ({
			id: r.id,
			sourceId: r.sourceId,
			targetId: r.targetId,
			type: r.type,
			direction: r.direction,
			description: r.description,
			createdBy: r.createdBy,
			createdAt: ms(r.createdAt)!,
			updatedBy: r.updatedBy,
			updatedAt: ms(r.updatedAt)
		})),
		relationTypes: typeRows.map((t) => ({
			id: t.id,
			key: t.key,
			label: t.label,
			phrase: t.phrase,
			color: t.color,
			directional: t.directional,
			description: t.description,
			createdBy: t.createdBy,
			createdAt: ms(t.createdAt)!,
			updatedAt: ms(t.updatedAt)!
		}))
	};
}

export async function createVersion(params: {
	mapId: string;
	userId: string;
	label: string;
	kind?: 'manual' | 'auto';
}): Promise<ClientMapVersion | null> {
	const snapshot = await snapshotMap(params.mapId);
	if (!snapshot) return null;
	const row = {
		id: nanoid(),
		mapId: params.mapId,
		label: params.label.slice(0, MAX_VERSION_LABEL),
		kind: params.kind ?? 'manual',
		conceptCount: snapshot.concepts.length,
		relationCount: snapshot.relations.length,
		snapshot: JSON.stringify(snapshot),
		createdBy: params.userId,
		createdAt: new Date()
	};
	await db.insert(mapVersions).values(row).run();
	if (row.kind === 'auto') await pruneAutoVersions(params.mapId);
	const author = await db.select({ name: users.name, color: users.color }).from(users).where(eq(users.id, params.userId)).get();
	return toClient({ ...row, createdByName: author?.name ?? null, createdByColor: author?.color ?? null });
}

async function pruneAutoVersions(mapId: string) {
	await db.run(sql`
		DELETE FROM map_versions WHERE map_id = ${mapId} AND kind = 'auto' AND id NOT IN (
			SELECT id FROM map_versions WHERE map_id = ${mapId} AND kind = 'auto'
			ORDER BY created_at DESC LIMIT ${MAX_AUTO_VERSIONS}
		)`);
}

function toClient(v: {
	id: string;
	mapId: string;
	label: string;
	kind: string;
	conceptCount: number;
	relationCount: number;
	createdBy: string;
	createdByName: string | null;
	createdByColor: string | null;
	createdAt: Date;
}): ClientMapVersion {
	return {
		id: v.id,
		mapId: v.mapId,
		label: v.label,
		kind: v.kind === 'auto' ? 'auto' : 'manual',
		conceptCount: v.conceptCount,
		relationCount: v.relationCount,
		createdById: v.createdBy,
		createdByName: v.createdByName,
		createdByColor: v.createdByColor,
		createdAt: v.createdAt.toISOString()
	};
}

/** Version list, newest first, without the (large) snapshot payloads. */
export async function listVersions(mapId: string): Promise<ClientMapVersion[]> {
	const rows = await db
		.select({
			id: mapVersions.id,
			mapId: mapVersions.mapId,
			label: mapVersions.label,
			kind: mapVersions.kind,
			conceptCount: mapVersions.conceptCount,
			relationCount: mapVersions.relationCount,
			createdBy: mapVersions.createdBy,
			createdByName: users.name,
			createdByColor: users.color,
			createdAt: mapVersions.createdAt
		})
		.from(mapVersions)
		.leftJoin(users, eq(mapVersions.createdBy, users.id))
		.where(eq(mapVersions.mapId, mapId))
		.orderBy(desc(mapVersions.createdAt))
		.all();
	return rows.map(toClient);
}

export async function getVersion(mapId: string, versionId: string) {
	const row = await db
		.select()
		.from(mapVersions)
		.where(and(eq(mapVersions.id, versionId), eq(mapVersions.mapId, mapId)))
		.get();
	if (!row) return null;
	return { row, snapshot: JSON.parse(row.snapshot) as MapSnapshot };
}

export async function deleteVersion(mapId: string, versionId: string) {
	await db
		.delete(mapVersions)
		.where(and(eq(mapVersions.id, versionId), eq(mapVersions.mapId, mapId)))
		.run();
}

/**
 * Make the map's content match `snapshot`, atomically (one libSQL batch =
 * one transaction). Rows keep their ids, so concepts and links that exist
 * in both keep their discussion threads; anything added since the snapshot
 * is removed (with its links/comments, via ON DELETE CASCADE), and anything
 * deleted since is recreated.
 *
 * Bulk statements read the snapshot through json_each, so the number of
 * statements is constant however big the map is.
 */
export async function restoreSnapshot(mapId: string, snapshot: MapSnapshot, now = Date.now()) {
	const conceptIds = JSON.stringify(snapshot.concepts.map((c) => c.id));
	const relationIds = JSON.stringify(snapshot.relations.map((r) => r.id));
	const typeIds = JSON.stringify(snapshot.relationTypes.map((t) => t.id));
	const conceptsJson = JSON.stringify(snapshot.concepts);
	const relationsJson = JSON.stringify(snapshot.relations);
	const typesJson = JSON.stringify(snapshot.relationTypes);
	const j = (field: string) => sql.raw(`json_extract(value, '$.${field}')`);

	const statements: BatchItem<'sqlite'>[] = [
		// 1. Drop what didn't exist then (relations first, then the rest).
		db.run(sql`DELETE FROM concept_relations WHERE map_id = ${mapId}
			AND id NOT IN (SELECT value FROM json_each(${relationIds}))`),
		db.run(sql`DELETE FROM concepts WHERE map_id = ${mapId}
			AND id NOT IN (SELECT value FROM json_each(${conceptIds}))`),
		db.run(sql`DELETE FROM relation_types WHERE map_id = ${mapId}
			AND id NOT IN (SELECT value FROM json_each(${typeIds}))`),
		// 2. Upsert the snapshot's rows. `WHERE true` disambiguates the upsert
		//    clause from a join; the DO UPDATE guard never touches another map.
		db.run(sql`INSERT INTO relation_types (id, map_id, key, label, phrase, color, directional, description, created_by, created_at, updated_at)
			SELECT ${j('id')}, ${mapId}, ${j('key')}, ${j('label')}, ${j('phrase')}, ${j('color')},
				CASE WHEN ${j('directional')} THEN 1 ELSE 0 END, ${j('description')}, ${j('createdBy')}, ${j('createdAt')}, ${j('updatedAt')}
			FROM json_each(${typesJson}) WHERE true
			ON CONFLICT(id) DO UPDATE SET key = excluded.key, label = excluded.label, phrase = excluded.phrase,
				color = excluded.color, directional = excluded.directional, description = excluded.description,
				updated_at = excluded.updated_at
			WHERE relation_types.map_id = ${mapId}`),
		db.run(sql`INSERT INTO concepts (id, map_id, name, definition, literature_link, example, quiz_question, x, y, created_by, updated_by, created_at, updated_at, moved_at)
			SELECT ${j('id')}, ${mapId}, ${j('name')}, ${j('definition')}, ${j('literatureLink')}, ${j('example')}, ${j('quizQuestion')},
				${j('x')}, ${j('y')}, ${j('createdBy')}, ${j('updatedBy')}, ${j('createdAt')}, ${j('updatedAt')}, ${now}
			FROM json_each(${conceptsJson}) WHERE true
			ON CONFLICT(id) DO UPDATE SET name = excluded.name, definition = excluded.definition,
				literature_link = excluded.literature_link, example = excluded.example, quiz_question = excluded.quiz_question,
				x = excluded.x, y = excluded.y, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
				moved_at = excluded.moved_at
			WHERE concepts.map_id = ${mapId}`),
		db.run(sql`INSERT INTO concept_relations (id, map_id, source_id, target_id, type, direction, description, created_by, created_at, updated_by, updated_at)
			SELECT ${j('id')}, ${mapId}, ${j('sourceId')}, ${j('targetId')}, ${j('type')}, coalesce(${j('direction')}, 'forward'), ${j('description')},
				${j('createdBy')}, ${j('createdAt')}, ${j('updatedBy')}, ${j('updatedAt')}
			FROM json_each(${relationsJson}) WHERE true
			ON CONFLICT(id) DO UPDATE SET source_id = excluded.source_id, target_id = excluded.target_id, type = excluded.type,
				direction = excluded.direction, description = excluded.description,
				updated_by = excluded.updated_by, updated_at = excluded.updated_at
			WHERE concept_relations.map_id = ${mapId}`),
		db
			.update(maps)
			.set({ name: snapshot.name, description: snapshot.description, updatedAt: new Date(now) })
			.where(eq(maps.id, mapId))
	];
	await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}
