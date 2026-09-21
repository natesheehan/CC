-- One-time migration to bring a production Turso/libSQL database up to date
-- with the relation direction/custom-types/comments schema (schema.ts).
-- Safe to run once against a database that predates those features.
--
-- Usage:
--   turso db shell <your-db-name> < scripts/migrate-relation-features.sql
--
-- (Run this from your own terminal with your own Turso login — it needs
-- credentials this assistant does not have access to.)

ALTER TABLE concept_relations ADD COLUMN direction TEXT NOT NULL DEFAULT 'forward';
ALTER TABLE concept_relations ADD COLUMN updated_by TEXT REFERENCES users(id);
ALTER TABLE concept_relations ADD COLUMN updated_at INTEGER;

CREATE TABLE IF NOT EXISTS relation_types (
	id TEXT PRIMARY KEY NOT NULL,
	map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
	key TEXT NOT NULL,
	label TEXT NOT NULL,
	phrase TEXT NOT NULL,
	color TEXT NOT NULL,
	directional INTEGER NOT NULL DEFAULT 1,
	description TEXT,
	created_by TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS relation_comments (
	id TEXT PRIMARY KEY NOT NULL,
	map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
	relation_id TEXT NOT NULL REFERENCES concept_relations(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id),
	body TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
