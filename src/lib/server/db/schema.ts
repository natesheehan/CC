import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Users are identified by a chosen display name only (no password) per the
// "simple named login" requirement. A cookie-backed session ties a browser
// to a user row so all edits can be attributed to someone.
// ---------------------------------------------------------------------------
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	color: text('color').notNull(), // stable avatar color, derived at creation
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

export const maps = sqliteTable('maps', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const concepts = sqliteTable('concepts', {
	id: text('id').primaryKey(),
	mapId: text('map_id')
		.notNull()
		.references(() => maps.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	definition: text('definition'),
	literatureLink: text('literature_link'),
	example: text('example'),
	quizQuestion: text('quiz_question'),
	// Persisted graph position so layout is stable between visits/editors.
	x: integer('x'),
	y: integer('y'),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id),
	updatedBy: text('updated_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const conceptRelations = sqliteTable('concept_relations', {
	id: text('id').primaryKey(),
	mapId: text('map_id')
		.notNull()
		.references(() => maps.id, { onDelete: 'cascade' }),
	sourceId: text('source_id')
		.notNull()
		.references(() => concepts.id, { onDelete: 'cascade' }),
	targetId: text('target_id')
		.notNull()
		.references(() => concepts.id, { onDelete: 'cascade' }),
	type: text('type').notNull(), // one of RELATION_TYPES, or a custom relation_types.key for this map
	// 'forward' draws a single arrow source -> target; 'both' draws arrowheads
	// at both ends (multi-directional). Defaults from the type's metadata but
	// is editable per-relation-instance.
	direction: text('direction').notNull().default('forward'),
	description: text('description'),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedBy: text('updated_by').references(() => users.id),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
});

// Custom relation types defined per-map, in addition to the built-in
// RELATION_TYPES. A relation's `type` column can reference either.
export const relationTypes = sqliteTable('relation_types', {
	id: text('id').primaryKey(),
	mapId: text('map_id')
		.notNull()
		.references(() => maps.id, { onDelete: 'cascade' }),
	key: text('key').notNull(), // slug used as ConceptRelation.type
	label: text('label').notNull(),
	phrase: text('phrase').notNull(),
	color: text('color').notNull(),
	directional: integer('directional', { mode: 'boolean' }).notNull().default(true),
	description: text('description'),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

// Flat, chronological comment thread attached to a single relation.
export const relationComments = sqliteTable('relation_comments', {
	id: text('id').primaryKey(),
	mapId: text('map_id')
		.notNull()
		.references(() => maps.id, { onDelete: 'cascade' }),
	relationId: text('relation_id')
		.notNull()
		.references(() => conceptRelations.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	body: text('body').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
});

// Append-only audit trail. Every create/update/delete of a map, concept or
// relation writes a row here so "who did the editing/suggesting" is always
// answerable.
export const activityLog = sqliteTable('activity_log', {
	id: text('id').primaryKey(),
	mapId: text('map_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	action: text('action').notNull(), // e.g. 'created_concept', 'updated_relation'
	entityType: text('entity_type').notNull(), // 'map' | 'concept' | 'relation'
	entityId: text('entity_id').notNull(),
	summary: text('summary').notNull(), // human-readable description
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
});

// Fixed-window rate limiting, backed by the database rather than in-memory
// state. Necessary because the app runs as serverless functions (Vercel) —
// a request can land on a different, freshly-cold process each time, so an
// in-memory counter would silently fail to limit anything in production.
// One row per (bucket key), reused/reset every window via upsert.
export const rateLimits = sqliteTable('rate_limits', {
	key: text('key').primaryKey(), // e.g. "write:<userId>" or "login:<ip>"
	windowStart: integer('window_start').notNull(),
	count: integer('count').notNull()
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type MapRow = typeof maps.$inferSelect;
export type Concept = typeof concepts.$inferSelect;
export type ConceptRelation = typeof conceptRelations.$inferSelect;
export type RelationTypeRow = typeof relationTypes.$inferSelect;
export type RelationComment = typeof relationComments.$inferSelect;
export type RateLimit = typeof rateLimits.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
