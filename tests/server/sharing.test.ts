import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Fresh temporary database, set before anything imports the db module.
const dir = mkdtempSync(path.join(tmpdir(), 'cc-share-'));
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`;

const { db, ensureSchema } = await import('$lib/server/db');
const schema = await import('$lib/server/db/schema');
const access = await import('$lib/server/access');
const queries = await import('$lib/server/queries');
const positions = await import('$lib/server/positions');
const presence = await import('$lib/server/presence');
const versions = await import('$lib/server/versions');
const { resolveAccess } = await import('$lib/shared/access');
const { eq, sql } = await import('drizzle-orm');

const OWNER = 'u-owner';
const MEMBER = 'u-member';
const STRANGER = 'u-stranger';
const T0 = 1_800_000_000_000;
const now = new Date(T0);

async function makeMap(id: string, visibility?: string) {
	await db
		.insert(schema.maps)
		.values({ id, name: `Map ${id}`, createdBy: OWNER, createdAt: now, updatedAt: now, ...(visibility ? { visibility } : {}) })
		.run();
	await db
		.insert(schema.concepts)
		.values({ id: `${id}-c1`, mapId: id, name: `Concept in ${id}`, x: 0, y: 0, createdBy: OWNER, updatedBy: OWNER, createdAt: now, updatedAt: now })
		.run();
	await access.addMember(id, MEMBER, OWNER);
}

beforeAll(async () => {
	await ensureSchema();
	await db
		.insert(schema.users)
		.values([OWNER, MEMBER, STRANGER].map((id) => ({ id, name: id, color: '#000', createdAt: now })))
		.run();
	await db
		.insert(schema.sessions)
		.values([OWNER, MEMBER, STRANGER].map((id) => ({ id: `s-${id}`, userId: id, createdAt: now, expiresAt: new Date(T0 + 1e9) })))
		.run();
	await makeMap('legacy'); // no visibility given → column default
	await makeMap('pub-view', 'public_view');
	await makeMap('priv', 'private');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('resolveAccess', () => {
	const map = (visibility: string) => ({ visibility, createdBy: OWNER });
	it.each([
		// visibility, user, member, canView, canEdit
		['public_edit', STRANGER, false, true, true],
		['public_view', STRANGER, false, true, false],
		['public_view', MEMBER, true, true, true],
		['private', STRANGER, false, false, false],
		['private', MEMBER, true, true, true],
		['private', OWNER, false, true, true]
	])('%s for %s (member=%s) → view=%s edit=%s', (vis, user, member, canView, canEdit) => {
		const a = resolveAccess(map(vis as string), user as string, member as boolean);
		expect([a.canView, a.canEdit]).toEqual([canView, canEdit]);
		expect(a.canManage).toBe(user === OWNER);
	});

	it('treats unknown visibility as anyone-can-edit', () => {
		expect(resolveAccess(map('bogus'), STRANGER, false).canEdit).toBe(true);
	});
});

describe('existing maps', () => {
	it('default to anyone-can-edit', async () => {
		const found = await access.getMapWithAccess('legacy', STRANGER);
		expect(found?.map.visibility).toBe('public_edit');
		expect(found?.access.canEdit).toBe(true);
	});
});

describe('private maps stay hidden', () => {
	it('from the dashboard list', async () => {
		const ids = (u: string) => queries.listMapsWithStats(u).then((r) => r.map((m) => m.id).sort());
		expect(await ids(STRANGER)).toEqual(['legacy', 'pub-view']);
		expect(await ids(MEMBER)).toEqual(['legacy', 'priv', 'pub-view']);
		expect(await ids(OWNER)).toEqual(['legacy', 'priv', 'pub-view']);
	});

	it('from the concept dictionary and permalinks', async () => {
		const names = (await queries.getAllConcepts(STRANGER)).map((c) => c.mapId);
		expect(names).not.toContain('priv');
		expect(await queries.getConceptEntry('priv-c1', STRANGER)).toBeNull();
		expect(await queries.getConceptEntry('priv-c1', MEMBER)).not.toBeNull();
	});

	it('from requireMapView (404, not 403)', async () => {
		await expect(access.requireMapView('priv', STRANGER)).rejects.toMatchObject({ status: 404 });
		await expect(access.requireMapView('priv', MEMBER)).resolves.toBeTruthy();
	});

	it('from the live heartbeat, which also writes no presence for outsiders', async () => {
		const beat = { clientId: 'tab-stranger', write: true, since: null, sig: null } as const;
		const res = await presence.heartbeat('priv', 's-' + STRANGER, beat, { now: T0, sweep: false });
		expect(res.status).toBe('gone');
		const rows = await db.select().from(schema.mapPresence).where(eq(schema.mapPresence.clientId, 'tab-stranger')).all();
		expect(rows).toHaveLength(0);

		const ok = await presence.heartbeat('priv', 's-' + MEMBER, { ...beat, clientId: 'tab-member' }, { now: T0, sweep: false });
		expect(ok.status).toBe('ok');
	});
});

describe('view-only maps', () => {
	it('refuse edits from people who are not invited', async () => {
		await expect(access.requireMapEdit('pub-view', STRANGER)).rejects.toMatchObject({ status: 403 });
		await expect(access.requireMapEdit('pub-view', MEMBER)).resolves.toBeTruthy();
	});

	it('do not persist node positions from viewers', async () => {
		const res = await positions.savePositions('pub-view', STRANGER, [{ id: 'pub-view-c1', x: 50, y: 50 }], T0);
		expect(res).toEqual({ status: 'ok', written: 0 });
		const res2 = await positions.savePositions('pub-view', MEMBER, [{ id: 'pub-view-c1', x: 50, y: 50 }], T0);
		expect(res2).toEqual({ status: 'ok', written: 1 });
	});
});

describe('versions', () => {
	const MAP = 'versioned';

	beforeAll(async () => {
		await makeMap(MAP);
		await db
			.insert(schema.concepts)
			.values({ id: 'v-c2', mapId: MAP, name: 'Second', x: 10, y: 20, createdBy: OWNER, updatedBy: OWNER, createdAt: now, updatedAt: now })
			.run();
		await db
			.insert(schema.relationTypes)
			.values({ id: 'v-t1', mapId: MAP, key: 'custom', label: 'Custom', phrase: 'customs', color: '#123456', directional: false, createdBy: OWNER, createdAt: now, updatedAt: now })
			.run();
		await db
			.insert(schema.conceptRelations)
			.values({ id: 'v-r1', mapId: MAP, sourceId: `${MAP}-c1`, targetId: 'v-c2', type: 'custom', direction: 'both', createdBy: OWNER, createdAt: now })
			.run();
		await db
			.insert(schema.relationComments)
			.values({ id: 'v-cm1', mapId: MAP, relationId: 'v-r1', userId: OWNER, body: 'keep me', createdAt: now })
			.run();
	});

	it('snapshot and restore round-trips content, ids and discussion threads', async () => {
		const saved = await versions.createVersion({ mapId: MAP, userId: OWNER, label: 'v1' });
		expect(saved).toMatchObject({ label: 'v1', conceptCount: 2, relationCount: 1, kind: 'manual' });
		const before = await versions.snapshotMap(MAP);

		// Change everything after the snapshot.
		await db.update(schema.maps).set({ name: 'Renamed' }).where(eq(schema.maps.id, MAP)).run();
		await db.update(schema.concepts).set({ name: 'Edited', x: 999 }).where(eq(schema.concepts.id, 'v-c2')).run();
		await db.delete(schema.conceptRelations).where(eq(schema.conceptRelations.id, 'v-r1')).run();
		await db.delete(schema.concepts).where(eq(schema.concepts.id, `${MAP}-c1`)).run();
		await db.delete(schema.relationTypes).where(eq(schema.relationTypes.id, 'v-t1')).run();
		await db
			.insert(schema.concepts)
			.values({ id: 'v-new', mapId: MAP, name: 'Added later', createdBy: MEMBER, updatedBy: MEMBER, createdAt: now, updatedAt: now })
			.run();

		const stored = await versions.getVersion(MAP, saved!.id);
		await versions.restoreSnapshot(MAP, stored!.snapshot, T0 + 1);

		const after = await versions.snapshotMap(MAP);
		const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
		expect(after!.name).toBe('Map versioned');
		expect(sortById(after!.concepts)).toEqual(sortById(before!.concepts));
		expect(after!.relations).toEqual(before!.relations);
		expect(after!.relationTypes).toEqual(before!.relationTypes);
	});

	it('keeps comments on links that survive a restore', async () => {
		await db
			.insert(schema.relationComments)
			.values({ id: 'v-cm2', mapId: MAP, relationId: 'v-r1', userId: OWNER, body: 'still here', createdAt: now })
			.run();
		const v = await versions.createVersion({ mapId: MAP, userId: OWNER, label: 'v2' });
		await versions.restoreSnapshot(MAP, (await versions.getVersion(MAP, v!.id))!.snapshot);
		const comments = await db.select().from(schema.relationComments).where(eq(schema.relationComments.id, 'v-cm2')).all();
		expect(comments).toHaveLength(1);
	});

	it('never touches rows belonging to another map', async () => {
		const v = await versions.getVersion(MAP, (await versions.listVersions(MAP))[0].id);
		const tampered = { ...v!.snapshot, concepts: [...v!.snapshot.concepts, { ...v!.snapshot.concepts[0], id: 'legacy-c1', name: 'hijacked' }] };
		await versions.restoreSnapshot(MAP, tampered);
		const other = await db.select().from(schema.concepts).where(eq(schema.concepts.id, 'legacy-c1')).get();
		expect(other).toMatchObject({ mapId: 'legacy', name: 'Concept in legacy' });
	});

	it('lists newest first and prunes old automatic versions', async () => {
		for (let i = 0; i < versions.MAX_AUTO_VERSIONS + 3; i++) {
			await versions.createVersion({ mapId: MAP, userId: OWNER, label: `auto ${i}`, kind: 'auto' });
		}
		const list = await versions.listVersions(MAP);
		expect(list.filter((v) => v.kind === 'auto')).toHaveLength(versions.MAX_AUTO_VERSIONS);
		expect(list.filter((v) => v.kind === 'manual').map((v) => v.label).sort()).toEqual(['v1', 'v2']);
		const [{ n }] = await db.all<{ n: number }>(sql`select count(*) as n from map_versions where map_id = ${MAP}`);
		expect(n).toBe(versions.MAX_AUTO_VERSIONS + 2);
	});
});
