import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';
import { fnv1a } from '$lib/shared/live';

// Same client works two ways, controlled entirely by env vars:
//  - Local dev (default): DATABASE_URL unset -> a local file, e.g. file:./data/conceptmap.db
//  - Production (Turso):  DATABASE_URL=libsql://<db>.turso.io  DATABASE_AUTH_TOKEN=<token>
//
// Also accepts TURSO_DATABASE_URL / TURSO_AUTH_TOKEN as a fallback, since
// that's what Vercel's own "Turso" Marketplace integration names them —
// so this works whether you wired up the env vars by hand or via that
// integration, without needing to rename anything.
const DATABASE_URL =
	process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL ?? 'file:./data/conceptmap.db';
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
const explicitUrlProvided = Boolean(process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL);

// Vercel (and most serverless platforms) set one of these automatically.
// Their filesystem is read-only outside of /tmp, so a local SQLite file can
// never be created there. If DATABASE_URL hasn't been configured in this
// environment, fail immediately with a clear message instead of letting the
// local-file fallback crash later with a cryptic ENOENT/EROFS from mkdir.
const isServerless = Boolean(
	process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
);

if (isServerless && !explicitUrlProvided) {
	throw new Error(
		'DATABASE_URL is not set. On Vercel (or any serverless platform) this app needs a ' +
			'hosted libSQL database — a local SQLite file cannot be written to a serverless ' +
			"filesystem. In your Vercel project, go to Settings → Environment Variables and " +
			'add DATABASE_URL and DATABASE_AUTH_TOKEN (or TURSO_DATABASE_URL / TURSO_AUTH_TOKEN ' +
			'if you used the Vercel Turso Marketplace integration) — see the README\'s ' +
			'"Deploying to Vercel" section. Make sure the variables are enabled for the ' +
			'environment you\'re deploying to (Production and/or Preview), then redeploy — ' +
			'env var changes only take effect on new deployments, not automatically on ' +
			'existing ones.'
	);
}

if (DATABASE_URL.startsWith('file:') && !isServerless) {
	const filePath = DATABASE_URL.slice('file:'.length);
	const dir = dirname(filePath);
	if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const client: Client = createClient(
	DATABASE_AUTH_TOKEN ? { url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN } : { url: DATABASE_URL }
);

export const db = drizzle(client, { schema });

async function migrateLegacyConceptSchema() {
	try {
		const conceptsInfo = await client.execute('PRAGMA table_info(concepts)');
		const definitionColumn = conceptsInfo.rows.find((row) => row.name === 'definition');
		const legacyConceptsExists = await client
			.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'concepts_legacy'")
			.then((result) => result.rows.length > 0)
			.catch(() => false);
		const relationsNeedFix = await client
			.execute("PRAGMA foreign_key_list('concept_relations')")
			.then((result) => result.rows.some((row) => row.table === 'concepts_legacy'))
			.catch(() => false);

		if (!definitionColumn || definitionColumn.notnull !== 1) {
			if (!legacyConceptsExists && !relationsNeedFix) return;
		}

		if (legacyConceptsExists) {
			await client.batch(
				[
					'ALTER TABLE concepts RENAME TO concepts_legacy',
					`CREATE TABLE concepts (
						id TEXT PRIMARY KEY,
						map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
						name TEXT NOT NULL,
						definition TEXT,
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
					`INSERT INTO concepts (id, map_id, name, definition, literature_link, example, quiz_question, x, y, created_by, updated_by, created_at, updated_at)
					 SELECT id, map_id, name, definition, literature_link, example, quiz_question, x, y, created_by, updated_by, created_at, updated_at
					 FROM concepts_legacy`,
					'DROP TABLE concepts_legacy'
				],
				'write'
			);
		}

		if (relationsNeedFix) {
			await client.batch(
				[
					'ALTER TABLE concept_relations RENAME TO concept_relations_legacy',
					`CREATE TABLE concept_relations (
						id TEXT PRIMARY KEY,
						map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
						source_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
						target_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
						type TEXT NOT NULL,
						created_by TEXT NOT NULL REFERENCES users(id),
						created_at INTEGER NOT NULL
					)`,
					`INSERT INTO concept_relations (id, map_id, source_id, target_id, type, created_by, created_at)
					 SELECT id, map_id, source_id, target_id, type, created_by, created_at
					 FROM concept_relations_legacy`,
					'DROP TABLE concept_relations_legacy',
					'CREATE INDEX IF NOT EXISTS idx_relations_map ON concept_relations(map_id)',
					'CREATE INDEX IF NOT EXISTS idx_relations_source ON concept_relations(source_id)',
					'CREATE INDEX IF NOT EXISTS idx_relations_target ON concept_relations(target_id)'
				],
				'write'
			);
		}
	} catch {
		// Ignore if the legacy tables do not exist or the database has already been migrated.
	}
}

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
		definition TEXT,
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
	`CREATE TABLE IF NOT EXISTS rate_limits (
	key TEXT PRIMARY KEY,
	window_start INTEGER NOT NULL,
	count INTEGER NOT NULL
)`,
	`CREATE TABLE IF NOT EXISTS relation_types (
		id TEXT PRIMARY KEY,
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
	)`,
	`CREATE TABLE IF NOT EXISTS relation_comments (
		id TEXT PRIMARY KEY,
		map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
		relation_id TEXT NOT NULL REFERENCES concept_relations(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id),
		body TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS map_presence (
		client_id TEXT PRIMARY KEY,
		map_id TEXT NOT NULL,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		focus_id TEXT,
		editing TEXT,
		cursor_x INTEGER,
		cursor_y INTEGER,
		last_seen INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_presence_map ON map_presence(map_id, last_seen)`,
	// Lets the stale-row sweep seek instead of scanning the whole table.
	`CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON map_presence(last_seen)`,
	`CREATE INDEX IF NOT EXISTS idx_activity_map_time ON activity_log(map_id, created_at)`,
	`CREATE INDEX IF NOT EXISTS idx_relations_map ON concept_relations(map_id)`,
	`CREATE INDEX IF NOT EXISTS idx_relations_source ON concept_relations(source_id)`,
	`CREATE INDEX IF NOT EXISTS idx_relations_target ON concept_relations(target_id)`,
	`CREATE INDEX IF NOT EXISTS idx_activity_map ON activity_log(map_id)`,
	`CREATE INDEX IF NOT EXISTS idx_relation_types_map ON relation_types(map_id)`,
	`CREATE INDEX IF NOT EXISTS idx_relation_comments_relation ON relation_comments(relation_id)`
];

/**
 * Ensures tables/indexes exist. Safe to call on every request — after the
 * first successful run in a given process it resolves immediately.
 */
// Additive column migrations. Each is expected to fail harmlessly once
// applied ("duplicate column"), so they run one by one, outside a batch.
const COLUMN_MIGRATIONS = [
	'ALTER TABLE concept_relations ADD COLUMN description TEXT',
	"ALTER TABLE concept_relations ADD COLUMN direction TEXT NOT NULL DEFAULT 'forward'",
	'ALTER TABLE concept_relations ADD COLUMN updated_by TEXT REFERENCES users(id)',
	'ALTER TABLE concept_relations ADD COLUMN updated_at INTEGER',
	'ALTER TABLE concepts ADD COLUMN moved_at INTEGER'
];

// Statements that depend on the migrated columns.
const POST_MIGRATION = [
	// Turns the live "what moved since T" query from a scan of every concept on
	// the map (O(N) rows read per poll) into an index range seek (O(moved)).
	'CREATE INDEX IF NOT EXISTS idx_concepts_map_moved ON concepts(map_id, moved_at)',
	// (map_id, moved_at) serves every map_id-prefix lookup the old
	// single-column index did, so drop that one: it was redundant, cost an
	// extra B-tree update on every concept write, and could steer the planner
	// away from the composite for the moves query.
	'DROP INDEX IF EXISTS idx_concepts_map'
];

/**
 * Fingerprint of everything the setup below does. Stored in the database
 * once setup succeeds; any edit to the schema SQL changes it, so setup
 * re-runs automatically on the next cold start — no version number to
 * remember to bump. (Bump the tag if you change migrateLegacyConceptSchema's
 * logic, since that's code rather than SQL.)
 */
export const SCHEMA_FINGERPRINT = fnv1a(
	['legacy-concepts-migration:v1', ...STATEMENTS, ...COLUMN_MIGRATIONS, ...POST_MIGRATION].join('\n;\n')
);

async function storedFingerprint(): Promise<string | null> {
	try {
		const res = await client.execute('SELECT fingerprint FROM schema_meta WHERE id = 1');
		return (res.rows[0]?.fingerprint as string | undefined) ?? null;
	} catch {
		return null; // table doesn't exist yet → never set up
	}
}

async function runSchemaSetup(): Promise<void> {
	await migrateLegacyConceptSchema();
	await client.batch(STATEMENTS, 'write');
	for (const statement of COLUMN_MIGRATIONS) await client.execute(statement).catch(() => undefined);
	await client.batch(POST_MIGRATION, 'write');
	await client.batch(
		[
			`CREATE TABLE IF NOT EXISTS schema_meta (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				fingerprint TEXT NOT NULL,
				applied_at INTEGER NOT NULL
			)`,
			{
				sql: `INSERT INTO schema_meta (id, fingerprint, applied_at) VALUES (1, ?, ?)
					ON CONFLICT(id) DO UPDATE SET fingerprint = excluded.fingerprint, applied_at = excluded.applied_at`,
				args: [SCHEMA_FINGERPRINT, Date.now()]
			}
		],
		'write'
	);
}

/**
 * Ensures tables/indexes exist. Safe to call on every request.
 *
 * Cost: once per process (i.e. per serverless cold start) it reads one row
 * to compare the stored schema fingerprint; only if that differs does the
 * full setup run (~11 sequential statements). Previously every cold start
 * paid for the full setup.
 */
export function ensureSchema(): Promise<void> {
	if (!schemaReady) {
		schemaReady = storedFingerprint()
			.then((stored) => (stored === SCHEMA_FINGERPRINT ? undefined : runSchemaSetup()))
			.then(
				() => undefined,
				(err) => {
					schemaReady = null; // allow retry on next request if it failed
					throw err;
				}
			);
	}
	return schemaReady;
}

/** Test hook: forget this process's "schema is ready" memo, simulating a cold start. */
export function resetSchemaMemoForTests(): void {
	schemaReady = null;
}
