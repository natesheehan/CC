import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

// Same client works two ways, controlled entirely by env vars:
//  - Local dev (default): DATABASE_URL unset -> a local file, e.g. file:./data/conceptmap.db
//  - Production (Turso):  DATABASE_URL=libsql://<db>.turso.io  DATABASE_AUTH_TOKEN=<token>
const DATABASE_URL = process.env.DATABASE_URL ?? 'file:./data/conceptmap.db';
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

if (DATABASE_URL.startsWith('file:')) {
	const filePath = DATABASE_URL.slice('file:'.length);
	const dir = dirname(filePath);
	if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const client: Client = createClient(
	DATABASE_AUTH_TOKEN ? { url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN } : { url: DATABASE_URL }
);

export const db = drizzle(client, { schema });

// --- schema bootstrap ------------------------------------------------------
// libSQL (unlike better-sqlite3) doesn't support executing a multi-statement
// SQL string in one call, so each statement is run individually via batch().
// This is idempotent (CREATE TABLE IF NOT EXISTS) and cheap, but we still
// only want to pay for it once per warm serverless instance.
let schemaReady: Promise<void> | null = null;

const STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL UNIQUE,
		color TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		created_at INTEGER NOT NULL,
		expires_at INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS maps (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT,
		created_by TEXT NOT NULL REFERENCES users(id),
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS concepts (
		id TEXT PRIMARY KEY,
		map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		definition TEXT NOT NULL,
		literature_link TEXT,
		example TEXT,
		quiz_question TEXT,
		x INTEGER,
		y INTEGER,
		created_by TEXT NOT NULL REFERENCES users(id),
		updated_by TEXT NOT NULL REFERENCES users(id),
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS concept_relations (
		id TEXT PRIMARY KEY,
		map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
		source_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
		target_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
		type TEXT NOT NULL,
		created_by TEXT NOT NULL REFERENCES users(id),
		created_at INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS activity_log (
		id TEXT PRIMARY KEY,
		map_id TEXT NOT NULL,
		user_id TEXT NOT NULL REFERENCES users(id),
		action TEXT NOT NULL,
		entity_type TEXT NOT NULL,
		entity_id TEXT NOT NULL,
		summary TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_concepts_map ON concepts(map_id)`,
	`CREATE INDEX IF NOT EXISTS idx_relations_map ON concept_relations(map_id)`,
	`CREATE INDEX IF NOT EXISTS idx_relations_source ON concept_relations(source_id)`,
	`CREATE INDEX IF NOT EXISTS idx_relations_target ON concept_relations(target_id)`,
	`CREATE INDEX IF NOT EXISTS idx_activity_map ON activity_log(map_id)`
];

/**
 * Ensures tables/indexes exist. Safe to call on every request — after the
 * first successful run in a given process it resolves immediately.
 */
export function ensureSchema(): Promise<void> {
	if (!schemaReady) {
		schemaReady = client.batch(STATEMENTS, 'write').then(
			() => undefined,
			(err) => {
				schemaReady = null; // allow retry on next request if it failed
				throw err;
			}
		);
	}
	return schemaReady;
}
