import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// The db module reads DATABASE_URL at import time, so point it at a fresh
// temporary file *before* importing anything that touches the database.
const dir = mkdtempSync(path.join(tmpdir(), 'cc-live-'));
const DB_FILE = path.join(dir, 'test.db');
process.env.DATABASE_URL = `file:${DB_FILE}`;

const { db, ensureSchema, resetSchemaMemoForTests, SCHEMA_FINGERPRINT } = await import('$lib/server/db');
const positions = await import('$lib/server/positions');
const schema = await import('$lib/server/db/schema');
const presence = await import('$lib/server/presence');
const { getUserFromSession } = await import('$lib/server/auth');
const { eq } = await import('drizzle-orm');

const MAP = 'map-1';
const ALICE = 'u-alice';
const BOB = 'u-bob';
/** Session ids: the live endpoint authenticates by session, inside its batch. */
const SA = 's-alice';
const SB = 's-bob';
const N_CONCEPTS = 300;
const T0 = 1_800_000_000_000;

/** Deterministic PRNG (mulberry32) so property tests are reproducible. */
function rng(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// EXPLAIN goes through a separate native connection with .all(), which steps
// the statement to completion. (@libsql/client's execute() treats EXPLAIN as
// a non-reader and only run()s it, leaving it open — which then blocks the
// main connection's next commit with SQLITE_BUSY.)
let planDb: { prepare(sql: string): { all(...args: unknown[]): { detail: string }[] }; close(): void } | null = null;
type Explainable = { toSQL(): { sql: string; params: unknown[] } } | { getQuery(): { sql: string; params: unknown[] } };
async function explain(query: Explainable): Promise<string[]> {
	const { sql, params } = 'toSQL' in query ? query.toSQL() : query.getQuery();
	if (!planDb) {
		const { default: Database } = await import('libsql');
		planDb = new Database(DB_FILE, { readonly: true }) as never;
	}
	return planDb!.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((r) => r.detail);
}

let activitySeq = 0;
async function addActivity(at: number) {
	const id = `act-${++activitySeq}`;
	await db
		.insert(schema.activityLog)
		.values({
			id,
			mapId: MAP,
			userId: BOB,
			action: 'updated_concept',
			entityType: 'concept',
			entityId: 'c-0',
			summary: 'Edited',
			createdAt: new Date(at)
		})
		.run();
	return id;
}

beforeAll(async () => {
	await ensureSchema();
	const now = new Date(T0);
	await db
		.insert(schema.users)
		.values([
			{ id: ALICE, name: 'Alice', color: '#111', createdAt: now },
			{ id: BOB, name: 'Bob', color: '#222', createdAt: now }
		])
		.run();
	await db.insert(schema.maps).values({ id: MAP, name: 'Map', createdBy: ALICE, createdAt: now, updatedAt: now }).run();
	const farFuture = new Date(T0 + 1e11);
	await db
		.insert(schema.sessions)
		.values([
			{ id: SA, userId: ALICE, createdAt: now, expiresAt: farFuture },
			{ id: SB, userId: BOB, createdAt: now, expiresAt: farFuture },
			{ id: 's-expired', userId: BOB, createdAt: now, expiresAt: new Date(T0 - 1) }
		])
		.run();
	await db
		.insert(schema.concepts)
		.values(
			Array.from({ length: N_CONCEPTS }, (_, i) => ({
				id: `c-${i}`,
				mapId: MAP,
				name: `C${i}`,
				x: i,
				y: i,
				createdBy: ALICE,
				updatedBy: ALICE,
				createdAt: now,
				updatedAt: now
			}))
		)
		.run();

	// Production-shaped cardinalities, so ANALYZE gives the cost-based planner
	// realistic statistics. With toy tables (2 users) SQLite correctly decides
	// a full scan is cheapest, which would make plan assertions meaningless.
	const r = rng(42);
	const chunk = async <T>(rows: T[], insert: (part: T[]) => Promise<unknown>) => {
		for (let i = 0; i < rows.length; i += 500) await insert(rows.slice(i, i + 500));
	};
	await chunk(
		Array.from({ length: 2000 }, (_, i) => ({ id: `bg-u-${i}`, name: `bg${i}`, color: '#333', createdAt: now })),
		(part) => db.insert(schema.users).values(part).run()
	);
	await chunk(
		Array.from({ length: 2000 }, (_, i) => ({
			id: `bg-s-${i}`,
			userId: `bg-u-${i}`,
			createdAt: now,
			expiresAt: new Date(T0 + 1e9)
		})),
		(part) => db.insert(schema.sessions).values(part).run()
	);
	await chunk(
		Array.from({ length: 50 }, (_, i) => ({ id: `bg-m-${i}`, name: `M${i}`, createdBy: ALICE, createdAt: now, updatedAt: now })),
		(part) => db.insert(schema.maps).values(part).run()
	);
	await chunk(
		Array.from({ length: 5000 }, (_, i) => ({
			id: `bg-c-${i}`,
			mapId: `bg-m-${i % 50}`,
			name: `B${i}`,
			x: 0,
			y: 0,
			createdBy: ALICE,
			updatedBy: ALICE,
			createdAt: now,
			updatedAt: now,
			movedAt: r() < 0.3 ? T0 - Math.floor(r() * 1e9) : null
		})),
		(part) => db.insert(schema.concepts).values(part).run()
	);
	await chunk(
		Array.from({ length: 600 }, (_, i) => ({
			clientId: `bg-tab-${i}`,
			mapId: `bg-m-${i % 50}`,
			userId: `bg-u-${i}`,
			lastSeen: T0 - Math.floor(r() * 3_600_000)
		})),
		(part) => db.insert(schema.mapPresence).values(part).run()
	);
	await chunk(
		Array.from({ length: 20000 }, (_, i) => ({
			id: `bg-a-${i}`,
			mapId: `bg-m-${i % 50}`,
			userId: `bg-u-${i % 2000}`,
			action: 'updated_concept',
			entityType: 'concept',
			entityId: 'x',
			summary: 's',
			createdAt: new Date(T0 - Math.floor(r() * 1e10))
		})),
		(part) => db.insert(schema.activityLog).values(part).run()
	);
	await db.$client.execute('ANALYZE');
});

afterAll(() => {
	planDb?.close();
	db.$client.close();
	rmSync(dir, { recursive: true, force: true });
});

describe('live heartbeat: query plans (cost is O(changes), never O(map size))', () => {
	it('every read is an index SEARCH, never a full SCAN', async () => {
		const q = presence.liveReadQueries(MAP, SA, T0, T0 - 5000);
		for (const [name, query] of Object.entries(q)) {
			if (!query) continue;
			const plan = await explain(query);
			if (process.env.SHOW_PLANS) console.log(name, plan);
			expect(plan.join('\n'), `${name} plan`).not.toMatch(/^SCAN (concepts|map_presence|activity_log|maps|users)\b/m);
			expect(plan.join('\n'), `${name} plan`).not.toMatch(/USE TEMP B-TREE/);
		}
	});

	it('the moves query seeks the (map_id, moved_at) index', async () => {
		const plan = await explain(presence.liveReadQueries(MAP, SA, T0, T0 - 5000).moves!);
		expect(plan.join('\n')).toMatch(/idx_concepts_map_moved \(map_id=\? AND moved_at>\?\)/);
	});

	it('the stale-presence sweep seeks the last_seen index', async () => {
		expect((await explain(presence.presenceSweep(T0))).join('\n')).toMatch(/idx_presence_last_seen/);
	});

	it('the presence upsert is a primary-key write', async () => {
		const beat = { clientId: 'x', write: true };
		const plan = await explain(presence.presenceUpsert(MAP, SA, beat, T0));
		expect(plan.join('\n')).not.toMatch(/^SCAN/m);
	});
});

describe('live heartbeat: behaviour', () => {
	it('returns only concepts moved since the cursor, regardless of map size', async () => {
		const first = await presence.heartbeat(MAP, SA, { clientId: 'tab-a', since: null }, { now: T0, sweep: false });
		expect(first.status).toBe('ok');
		await db.update(schema.concepts).set({ x: 999, y: 999, movedAt: T0 + 1000 }).where(eq(schema.concepts.id, 'c-7')).run();
		const r = await presence.heartbeat(MAP, SA, { clientId: 'tab-a', since: T0 }, { now: T0 + 1500, sweep: false });
		expect(r.status).toBe('ok');
		if (r.status === 'ok') expect(r.update.moves).toEqual([{ id: 'c-7', x: 999, y: 999 }]);
	});

	it('read-only beats do not touch the presence row; writes do', async () => {
		const row = () =>
			db.select().from(schema.mapPresence).where(eq(schema.mapPresence.clientId, 'tab-w')).get();
		await presence.heartbeat(MAP, SA, { clientId: 'tab-w', write: true, focusId: 'c-1' }, { now: T0, sweep: false });
		expect((await row())?.lastSeen).toBe(T0);
		await presence.heartbeat(MAP, SA, { clientId: 'tab-w', write: false }, { now: T0 + 3000, sweep: false });
		const after = await row();
		expect(after?.lastSeen).toBe(T0);
		expect(after?.focusId).toBe('c-1'); // a read-only beat must not clear state
		await presence.heartbeat(MAP, SA, { clientId: 'tab-w', write: true, focusId: null }, { now: T0 + 6000, sweep: false });
		expect((await row())?.lastSeen).toBe(T0 + 6000);
	});

	it('answers "unchanged" only when peers, activity and moves are all unchanged', async () => {
		const now = T0 + 100_000;
		await presence.heartbeat(MAP, SB, { clientId: 'tab-bob', write: true, cursor: { x: 1, y: 1 } }, { now, sweep: false });
		const full = await presence.heartbeat(MAP, SA, { clientId: 'tab-a2', since: now - 60_000 }, { now: now + 10, sweep: false });
		expect(full.status).toBe('ok');
		const sig = full.status === 'ok' ? full.update.sig : '';
		const same = await presence.heartbeat(MAP, SA, { clientId: 'tab-a2', since: now + 10, sig, write: false }, { now: now + 20, sweep: false });
		expect(same.status).toBe('unchanged');
		// Bob moves his cursor → the signature changes → full response.
		await presence.heartbeat(MAP, SB, { clientId: 'tab-bob', write: true, cursor: { x: 50, y: 1 } }, { now: now + 30, sweep: false });
		const changed = await presence.heartbeat(MAP, SA, { clientId: 'tab-a2', since: now + 20, sig, write: false }, { now: now + 40, sweep: false });
		expect(changed.status).toBe('ok');
	});

	it('expired peers drop out after the TTL', async () => {
		const now = T0 + 200_000;
		await presence.heartbeat(MAP, SB, { clientId: 'tab-bob2', write: true }, { now, sweep: false });
		const seen = async (at: number) => {
			const r = await presence.heartbeat(MAP, SA, { clientId: 'tab-a3', write: false }, { now: at, sweep: false });
			return r.status === 'ok' && r.update.peers.some((p) => p.clientId === 'tab-bob2');
		};
		expect(await seen(now + presence.PRESENCE_TTL_MS - 1)).toBe(true);
		expect(await seen(now + presence.PRESENCE_TTL_MS)).toBe(false);
	});

	it('reports a deleted map as gone', async () => {
		const r = await presence.heartbeat('no-such-map', SA, { clientId: 'tab-x', write: false }, { now: T0, sweep: false });
		expect(r.status).toBe('gone');
	});

	it('looks up a session and its user in one query, and rejects expired sessions', async () => {
		await db
			.insert(schema.sessions)
			.values([
				{ id: 's-live', userId: ALICE, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
				{ id: 's-dead', userId: ALICE, createdAt: new Date(), expiresAt: new Date(Date.now() - 1) }
			])
			.run();
		const cookies = (id: string) => ({ get: () => id, delete: () => {} }) as never;
		expect((await getUserFromSession(cookies('s-live')))?.name).toBe('Alice');
		expect(await getUserFromSession(cookies('s-dead'))).toBeNull();
		expect(await getUserFromSession(cookies('s-missing'))).toBeNull();
	});
});

describe('live heartbeat: delivery property', () => {
	// Property: with client-side de-duplication by id, every activity row
	// whose commit lags its timestamp by < CHANGE_OVERLAP_MS is delivered
	// exactly once, for any interleaving of polls and writes — provided fewer
	// than MAX_ACTIVITY rows land within one overlap window (beyond that the
	// client still reloads, but individual toasts may be skipped).
	it('delivers every activity row exactly once under random interleavings', async () => {
		for (let seed = 1; seed <= 25; seed++) {
			const rand = rng(seed);
			let clock = T0 + seed * 10_000_000;
			let since: number | null = null;
			const seen = new Set<string>();
			const inserted: string[] = [];
			const deliveries = new Map<string, number>();
			const clientId = `prop-${seed}`;

			// Prime the cursor like a real client's first poll.
			const first = await presence.heartbeat(MAP, SA, { clientId, since, write: false }, { now: clock, sweep: false });
			since = first.status === 'ok' ? first.update.now : clock;

			for (let step = 0; step < 60; step++) {
				clock += Math.floor(rand() * 2000);
				if (rand() < 0.6) {
					// A write stamped up to (overlap − 1) ms in the past: a commit
					// that landed late relative to its own timestamp.
					const lag = Math.floor(rand() * (presence.CHANGE_OVERLAP_MS - 1));
					inserted.push(await addActivity(clock - lag));
				} else {
					const r = await presence.heartbeat(MAP, SA, { clientId, since, write: false }, { now: clock, sweep: false });
					if (r.status === 'ok') {
						since = r.update.now;
						for (const a of r.update.activity) {
							if (seen.has(a.id)) continue;
							seen.add(a.id);
							deliveries.set(a.id, (deliveries.get(a.id) ?? 0) + 1);
						}
					} else if (r.status === 'unchanged') {
						since = r.now;
					}
				}
			}
			// Final drain after everything has settled.
			clock += presence.CHANGE_OVERLAP_MS;
			const last = await presence.heartbeat(MAP, SA, { clientId, since, write: false }, { now: clock, sweep: false });
			if (last.status === 'ok') for (const a of last.update.activity) if (!seen.has(a.id)) { seen.add(a.id); deliveries.set(a.id, 1); }

			for (const id of inserted) expect(deliveries.get(id), `seed ${seed}: ${id}`).toBe(1);
		}
	});
});

describe('live heartbeat: authentication inside the batch', () => {
	it('makes exactly one database round trip per heartbeat', async () => {
		const client = db.$client;
		const calls = { batch: 0, execute: 0 };
		const origBatch = client.batch.bind(client);
		const origExecute = client.execute.bind(client);
		client.batch = ((...a: Parameters<typeof client.batch>) => (calls.batch++, origBatch(...a))) as typeof client.batch;
		client.execute = ((...a: Parameters<typeof client.execute>) => (calls.execute++, origExecute(...a))) as typeof client.execute;
		try {
			await presence.heartbeat(MAP, SA, { clientId: 'rt-1', write: true, since: T0 }, { now: T0 + 1, sweep: true });
		} finally {
			client.batch = origBatch;
			client.execute = origExecute;
		}
		expect(calls).toEqual({ batch: 1, execute: 0 });
	});

	it('rejects missing and expired sessions without writing presence', async () => {
		const row = (id: string) => db.select().from(schema.mapPresence).where(eq(schema.mapPresence.clientId, id)).get();
		const missing = await presence.heartbeat(MAP, 's-nope', { clientId: 'auth-1', write: true }, { now: T0, sweep: false });
		expect(missing.status).toBe('unauthorized');
		expect(await row('auth-1')).toBeUndefined();
		const expired = await presence.heartbeat(MAP, 's-expired', { clientId: 'auth-2', write: true }, { now: T0, sweep: false });
		expect(expired.status).toBe('unauthorized');
		expect(await row('auth-2')).toBeUndefined();
	});

	it("can't take over another user's presence row by reusing its client id", async () => {
		await presence.heartbeat(MAP, SB, { clientId: 'owned-by-bob', write: true, focusId: 'c-2' }, { now: T0, sweep: false });
		await presence.heartbeat(MAP, SA, { clientId: 'owned-by-bob', write: true, focusId: 'c-9' }, { now: T0 + 1, sweep: false });
		const row = await db.select().from(schema.mapPresence).where(eq(schema.mapPresence.clientId, 'owned-by-bob')).get();
		expect(row?.userId).toBe(BOB);
		expect(row?.focusId).toBe('c-2');
	});

	it('leaving only removes your own row', async () => {
		await presence.heartbeat(MAP, SB, { clientId: 'leave-bob', write: true }, { now: T0, sweep: false });
		await presence.leaveMap('leave-bob', SA, T0); // Alice can't remove Bob
		expect(await db.select().from(schema.mapPresence).where(eq(schema.mapPresence.clientId, 'leave-bob')).get()).toBeDefined();
		await presence.leaveMap('leave-bob', SB, T0);
		expect(await db.select().from(schema.mapPresence).where(eq(schema.mapPresence.clientId, 'leave-bob')).get()).toBeUndefined();
	});

	it('session and own-user subqueries are primary-key seeks', async () => {
		const q = presence.liveReadQueries(MAP, SA, T0, null);
		expect((await explain(q.session)).join('\n')).toMatch(/SEARCH sessions USING INDEX sqlite_autoindex_sessions_1 \(id=\?\)/);
		const upsert = (await explain(presence.presenceUpsert(MAP, SA, { clientId: 'x' }, T0))).join('\n');
		expect(upsert).toMatch(/SEARCH s USING INDEX sqlite_autoindex_sessions_1 \(id=\?\)/);
		expect(upsert).not.toMatch(/^SCAN/m);
	});
});

describe('batched node positions', () => {
	const pos = (id: string) => db.select().from(schema.concepts).where(eq(schema.concepts.id, id)).get();

	it('saves many positions in one round trip, writing only rows that changed', async () => {
		await db.update(schema.concepts).set({ x: 10, y: 10, movedAt: null }).where(eq(schema.concepts.id, 'c-20')).run();
		await db.update(schema.concepts).set({ x: 11, y: 11, movedAt: null }).where(eq(schema.concepts.id, 'c-21')).run();
		const client = db.$client;
		let batches = 0;
		const orig = client.batch.bind(client);
		client.batch = ((...a: Parameters<typeof client.batch>) => (batches++, orig(...a))) as typeof client.batch;
		let result;
		try {
			result = await positions.savePositions(
				MAP,
				ALICE,
				[
					{ id: 'c-20', x: 10, y: 10 }, // unchanged → no write, moved_at untouched
					{ id: 'c-21', x: 50, y: 60 }, // changed
					{ id: 'bg-c-0', x: 1, y: 1 } // another map's concept → ignored
				],
				T0 + 5
			);
		} finally {
			client.batch = orig;
		}
		expect(batches).toBe(1);
		expect(result).toEqual({ status: 'ok', written: 1 });
		expect(await pos('c-20')).toMatchObject({ x: 10, y: 10, movedAt: null });
		expect(await pos('c-21')).toMatchObject({ x: 50, y: 60, movedAt: T0 + 5 });
		expect((await pos('bg-c-0'))?.x).toBe(0);
	});

	it('enforces the write rate limit in the same batch: over-limit writes never apply', async () => {
		const user = 'bg-u-7';
		const now = T0 + 7 * 60_000;
		for (let i = 0; i < 60; i++) {
			expect((await positions.savePositions(MAP, user, [{ id: 'c-30', x: i, y: i }], now)).status).toBe('ok');
		}
		const over = await positions.savePositions(MAP, user, [{ id: 'c-30', x: 999, y: 999 }], now);
		expect(over.status).toBe('rate_limited');
		expect((await pos('c-30'))?.x).toBe(59);
	});

	it('position updates are primary-key writes', async () => {
		const plan = (await explain(positions.positionUpdate(MAP, { id: 'c-1', x: 1, y: 1 }, T0, ALICE))).join('\n');
		expect(plan).toMatch(/SEARCH concepts USING INDEX sqlite_autoindex_concepts_1 \(id=\?\)/);
		expect(plan).not.toMatch(/^SCAN/m);
	});

	it('validates untrusted input', () => {
		expect(positions.parsePositions({ positions: [{ id: 'a', x: 1.4, y: 2.6 }] })).toEqual([{ id: 'a', x: 1, y: 3 }]);
		expect(positions.parsePositions({ positions: [{ id: 'a', x: 1, y: 1 }, { id: 'a', x: 2, y: 2 }] })).toEqual([{ id: 'a', x: 2, y: 2 }]);
		for (const bad of [null, {}, { positions: [] }, { positions: [{ id: 'a', x: 'nan', y: 1 }] }, { positions: [{ id: '', x: 1, y: 1 }] }, { positions: [{ id: 'a', x: 1e7, y: 1 }] }]) {
			expect(positions.parsePositions(bad)).toBeNull();
		}
	});
});

describe('schema bootstrap on cold start', () => {
	it('stores a fingerprint, and a cold start with a current schema runs one read instead of the full setup', async () => {
		const meta = () => db.$client.execute('SELECT fingerprint, applied_at FROM schema_meta WHERE id = 1').then((r) => r.rows[0]);
		const before = await meta();
		expect(before?.fingerprint).toBe(SCHEMA_FINGERPRINT);

		const client = db.$client;
		const calls = { batch: 0, execute: 0 };
		const origBatch = client.batch.bind(client);
		const origExecute = client.execute.bind(client);
		client.batch = ((...a: Parameters<typeof client.batch>) => (calls.batch++, origBatch(...a))) as typeof client.batch;
		client.execute = ((...a: Parameters<typeof client.execute>) => (calls.execute++, origExecute(...a))) as typeof client.execute;
		try {
			resetSchemaMemoForTests(); // simulate a new serverless instance
			await ensureSchema();
			await ensureSchema(); // memoised within the instance
		} finally {
			client.batch = origBatch;
			client.execute = origExecute;
		}
		expect(calls).toEqual({ batch: 0, execute: 1 });
		expect((await meta())?.applied_at).toBe(before?.applied_at);
	});

	it('re-runs the full setup when the stored fingerprint is stale', async () => {
		await db.$client.execute("UPDATE schema_meta SET fingerprint = 'old' WHERE id = 1");
		resetSchemaMemoForTests();
		await ensureSchema();
		const row = (await db.$client.execute('SELECT fingerprint FROM schema_meta WHERE id = 1')).rows[0];
		expect(row?.fingerprint).toBe(SCHEMA_FINGERPRINT);
		// and the migrated schema is intact
		const idx = await db.$client.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_concepts_map%'");
		expect(idx.rows.map((r) => r.name)).toEqual(['idx_concepts_map_moved']);
	});
});
