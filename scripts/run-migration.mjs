// One-off runner for scripts/migrate-relation-features.sql against a remote
// libSQL/Turso database. Safe to re-run: already-applied statements
// (duplicate column / table exists) are reported and skipped, not fatal.
//
// Usage:
//   DATABASE_URL="libsql://...turso.io" DATABASE_AUTH_TOKEN="..." node scripts/run-migration.mjs
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url) {
	console.error('Set DATABASE_URL (and DATABASE_AUTH_TOKEN) before running this script.');
	process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, 'migrate-relation-features.sql'), 'utf8');
// Strip full-line comments first — otherwise a leading comment block with no
// semicolons merges into (and swallows) the first real statement below it.
const sqlWithoutComments = sql
	.split('\n')
	.filter((line) => !line.trim().startsWith('--'))
	.join('\n');
const statements = sqlWithoutComments
	.split(';')
	.map((s) => s.trim())
	.filter((s) => s.length > 0);

const client = createClient(authToken ? { url, authToken } : { url });

for (const statement of statements) {
	try {
		await client.execute(statement);
		console.log('✓ ran:', statement.slice(0, 70).replace(/\s+/g, ' '));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (/duplicate column|already exists/i.test(message)) {
			console.log('… already applied, skipping:', statement.slice(0, 70).replace(/\s+/g, ' '));
		} else {
			console.error('✗ failed:', statement.slice(0, 70).replace(/\s+/g, ' '));
			throw err;
		}
	}
}

console.log('Migration complete.');
