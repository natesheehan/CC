import { and, eq, gt, lt, ne, desc, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from './db';
import { activityLog, concepts, mapMembers, mapPresence, maps, sessions, users } from './db/schema';
import { resolveAccess } from '$lib/shared/access';
import { MAX_PEERS, PRESENCE_TTL_MS, peersSignature } from '$lib/shared/live';
import type { ClientActivityEntry, LiveHeartbeat, LivePeer, LiveUpdate } from '$lib/shared/types';

export { PRESENCE_TTL_MS };

/**
 * How far back each poll re-reads changes. Writes that commit while a poll
 * is in flight can carry a timestamp just before that poll's `now`; reading
 * with this much overlap (the client de-dupes by id) means none are missed
 * as long as commit lag < CHANGE_OVERLAP_MS. Property-tested in
 * tests/server/live.test.ts.
 */
export const CHANGE_OVERLAP_MS = 5_000;
/** Max activity rows per poll. Bursts beyond this lose toasts, not data: any fresh row triggers a full reload. */
export const MAX_ACTIVITY = 50;
/** Probability that a heartbeat also sweeps long-dead presence rows. */
const SWEEP_PROBABILITY = 0.01;
const SWEEP_AGE_MS = 60 * 60_000;

const MAX_ID_LENGTH = 64;
const COORD_LIMIT = 1_000_000;

function cleanId(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH ? value : null;
}

function cleanEditing(value: unknown): string | null {
	if (value === 'map') return 'map';
	if (typeof value !== 'string') return null;
	return /^(concept|relation):[\w-]{1,64}$/.test(value) ? value : null;
}

function cleanCoord(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) && Math.abs(n) < COORD_LIMIT ? Math.round(n) : null;
}

export function parseHeartbeat(raw: unknown): LiveHeartbeat | null {
	if (!raw || typeof raw !== 'object') return null;
	const body = raw as Record<string, unknown>;
	const clientId = cleanId(body.clientId);
	if (!clientId) return null;
	const cursorRaw = body.cursor as { x?: unknown; y?: unknown } | null | undefined;
	const cx = cursorRaw ? cleanCoord(cursorRaw.x) : null;
	const cy = cursorRaw ? cleanCoord(cursorRaw.y) : null;
	return {
		clientId,
		focusId: cleanId(body.focusId),
		editing: cleanEditing(body.editing),
		cursor: cx != null && cy != null ? { x: cx, y: cy } : null,
		since: typeof body.since === 'number' && Number.isFinite(body.since) ? body.since : null,
		leave: body.leave === true,
		// Older clients don't send `write`; treat that as "always write".
		write: body.write !== false,
		sig: typeof body.sig === 'string' && body.sig.length <= 16 ? body.sig : null
	};
}

/** The signed-in user for a session id, as a scalar subquery (NULL if none). */
function sessionUser(sessionId: string, now: number) {
	return sql`(SELECT ${sessions.userId} FROM ${sessions} WHERE ${sessions.id} = ${sessionId} AND ${sessions.expiresAt} > ${now})`;
}

/** Remove a tab's presence. Authorised inline: only deletes the caller's own row. */
export async function leaveMap(clientId: string, sessionId: string, now = Date.now()): Promise<void> {
	await db
		.delete(mapPresence)
		.where(and(eq(mapPresence.clientId, clientId), eq(mapPresence.userId, sessionUser(sessionId, now))))
		.run();
}

/**
 * The read queries behind one heartbeat, as un-executed builders so tests
 * can EXPLAIN them and assert every one is an index seek, never a scan.
 */
export function liveReadQueries(mapId: string, sessionId: string, now: number, since: number | null) {
	return {
		// Authentication happens inside the batch rather than in a separate
		// hooks round trip: one primary-key read of the session.
		session: db
			.select({ userId: sessions.userId })
			.from(sessions)
			.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date(now))))
			.limit(1),
		// The map and whether the caller is invited to it — private maps are
		// only live for their owner and members.
		mapAccess: db
			.select({
				visibility: maps.visibility,
				createdBy: maps.createdBy,
				isMember: sql<number>`exists (select 1 from ${mapMembers} where ${mapMembers.mapId} = ${maps.id} and ${mapMembers.userId} = ${sessionUser(sessionId, now)})`
			})
			.from(maps)
			.where(eq(maps.id, mapId))
			.limit(1),
		peers: db
			.select({
				clientId: mapPresence.clientId,
				userId: mapPresence.userId,
				name: users.name,
				color: users.color,
				focusId: mapPresence.focusId,
				editing: mapPresence.editing,
				cursorX: mapPresence.cursorX,
				cursorY: mapPresence.cursorY,
				lastSeen: mapPresence.lastSeen
			})
			.from(mapPresence)
			.innerJoin(users, eq(mapPresence.userId, users.id))
			.where(
				and(
					eq(mapPresence.mapId, mapId),
					gt(mapPresence.lastSeen, now - PRESENCE_TTL_MS),
					// Your own other tabs aren't "someone else here".
					ne(mapPresence.userId, sessionUser(sessionId, now))
				)
			)
			.orderBy(desc(mapPresence.lastSeen))
			.limit(MAX_PEERS),
		activity:
			since == null
				? null
				: db
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
						.where(and(eq(activityLog.mapId, mapId), gt(activityLog.createdAt, new Date(since))))
						.orderBy(desc(activityLog.createdAt))
						.limit(MAX_ACTIVITY),
		moves:
			since == null
				? null
				: db
						.select({ id: concepts.id, x: concepts.x, y: concepts.y })
						.from(concepts)
						.where(and(eq(concepts.mapId, mapId), gt(concepts.movedAt, since)))
	};
}

/**
 * Upsert this tab's presence, taking user_id from the session row in the
 * same statement — so it writes nothing at all for a missing or expired
 * session, and needs no prior auth round trip. The conflict clause also
 * refuses to take over a row owned by a different user.
 */
export function presenceUpsert(mapId: string, sessionId: string, beat: LiveHeartbeat, now: number) {
	return db.run(sql`
		INSERT INTO map_presence (client_id, map_id, user_id, focus_id, editing, cursor_x, cursor_y, last_seen)
		SELECT ${beat.clientId}, ${mapId}, s.user_id, ${beat.focusId ?? null}, ${beat.editing ?? null},
			${beat.cursor?.x ?? null}, ${beat.cursor?.y ?? null}, ${now}
		FROM sessions s
		WHERE s.id = ${sessionId} AND s.expires_at > ${now}
			-- Never announce someone on a private map they aren't invited to.
			AND NOT EXISTS (
				SELECT 1 FROM maps m WHERE m.id = ${mapId} AND m.visibility = 'private'
					AND m.created_by <> s.user_id
					AND NOT EXISTS (SELECT 1 FROM map_members mm WHERE mm.map_id = m.id AND mm.user_id = s.user_id)
			)
		ON CONFLICT(client_id) DO UPDATE SET
			map_id = excluded.map_id,
			focus_id = excluded.focus_id,
			editing = excluded.editing,
			cursor_x = excluded.cursor_x,
			cursor_y = excluded.cursor_y,
			last_seen = excluded.last_seen
		WHERE map_presence.user_id = excluded.user_id`);
}

export function presenceSweep(now: number) {
	return db.delete(mapPresence).where(lt(mapPresence.lastSeen, now - SWEEP_AGE_MS));
}

export type HeartbeatResult =
	| { status: 'unauthorized' }
	| { status: 'gone' }
	| { status: 'unchanged'; now: number }
	| { status: 'ok'; update: LiveUpdate };

/**
 * One heartbeat = one database round trip, total. The session check, the
 * optional presence write, the occasional sweep and all reads go out
 * together as a single libSQL batch (hooks.server.ts skips its own session
 * lookup for this route), so a remote Turso database costs one network RTT
 * per heartbeat.
 */
export async function heartbeat(
	mapId: string,
	sessionId: string,
	beat: LiveHeartbeat,
	opts: { now?: number; sweep?: boolean } = {}
): Promise<HeartbeatResult> {
	const now = opts.now ?? Date.now();
	const since = beat.since != null ? Math.min(beat.since, now) - CHANGE_OVERLAP_MS : null;
	const reads = liveReadQueries(mapId, sessionId, now, since);

	// Batch items are positional; remember where each read lands.
	const items: BatchItem<'sqlite'>[] = [];
	if (beat.write !== false) items.push(presenceUpsert(mapId, sessionId, beat, now));
	if (opts.sweep ?? Math.random() < SWEEP_PROBABILITY) items.push(presenceSweep(now));
	const at = {
		session: items.push(reads.session) - 1,
		mapAccess: items.push(reads.mapAccess) - 1,
		peers: items.push(reads.peers) - 1,
		activity: reads.activity ? items.push(reads.activity) - 1 : -1,
		moves: reads.moves ? items.push(reads.moves) - 1 : -1
	};

	const results = (await db.batch(items as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])) as unknown[];
	const rows = <T>(i: number) => (i < 0 ? [] : (results[i] as T[]));

	const session = rows<{ userId: string }>(at.session)[0];
	if (!session) return { status: 'unauthorized' };
	const mapRow = rows<{ visibility: string; createdBy: string; isMember: number }>(at.mapAccess)[0];
	// A private map you aren't invited to looks exactly like a missing one.
	if (!mapRow || !resolveAccess(mapRow, session.userId, Boolean(mapRow.isMember)).canView) return { status: 'gone' };

	type PeerRow = {
		clientId: string;
		userId: string;
		name: string;
		color: string;
		focusId: string | null;
		editing: string | null;
		cursorX: number | null;
		cursorY: number | null;
		lastSeen: number;
	};
	const peers: LivePeer[] = rows<PeerRow>(at.peers).map((p) => ({
		clientId: p.clientId,
		userId: p.userId,
		name: p.name,
		color: p.color,
		focusId: p.focusId,
		editing: p.editing,
		cursor: p.cursorX != null && p.cursorY != null ? { x: p.cursorX, y: p.cursorY } : null,
		lastSeen: p.lastSeen
	}));

	// db.batch returns raw-mapped rows; timestamp_ms columns arrive as Date.
	type ActivityRow = Omit<ClientActivityEntry, 'createdAt'> & { createdAt: Date | number };
	const activity: ClientActivityEntry[] = rows<ActivityRow>(at.activity).map((a) => ({
		...a,
		createdAt: new Date(a.createdAt).toISOString()
	}));
	const moves = rows<LiveUpdate['moves'][number]>(at.moves);
	const sig = peersSignature(peers);

	if (beat.sig === sig && activity.length === 0 && moves.length === 0) {
		return { status: 'unchanged', now };
	}
	return { status: 'ok', update: { now, peers, activity, moves, sig } };
}
