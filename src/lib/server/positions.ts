import { and, eq, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from './db';
import { concepts } from './db/schema';
import { canEditMapSql } from './access';
import { USER_WRITE_LIMIT, rateLimitUpsert, retryAfterSeconds, userWriteKey, withinRateLimit } from './rateLimit';

export const MAX_POSITIONS_PER_REQUEST = 1000;
const COORD_LIMIT = 1_000_000;
const MAX_ID_LENGTH = 64;

export interface Position {
	id: string;
	x: number;
	y: number;
}

/** Validate and round untrusted input; null if anything is malformed. */
export function parsePositions(raw: unknown): Position[] | null {
	const list = (raw as { positions?: unknown } | null)?.positions;
	if (!Array.isArray(list) || list.length === 0 || list.length > MAX_POSITIONS_PER_REQUEST) return null;
	const out = new Map<string, Position>(); // last write per id wins
	for (const item of list) {
		const { id, x, y } = (item ?? {}) as Record<string, unknown>;
		if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) return null;
		const nx = Number(x);
		const ny = Number(y);
		if (!Number.isFinite(nx) || !Number.isFinite(ny) || Math.abs(nx) >= COORD_LIMIT || Math.abs(ny) >= COORD_LIMIT) {
			return null;
		}
		out.set(id, { id, x: Math.round(nx), y: Math.round(ny) });
	}
	return [...out.values()];
}

/** One conditional UPDATE: no-op (no row written, moved_at untouched) if unchanged. */
export function positionUpdate(mapId: string, p: Position, now: number, userId: string) {
	return db
		.update(concepts)
		.set({ x: p.x, y: p.y, movedAt: now })
		.where(
			and(
				eq(concepts.id, p.id),
				eq(concepts.mapId, mapId),
				or(sql`${concepts.x} IS NOT ${p.x}`, sql`${concepts.y} IS NOT ${p.y}`),
				withinRateLimit(userWriteKey(userId), USER_WRITE_LIMIT.limit),
				// View-only visitors can rearrange their own screen, but it isn't saved.
				canEditMapSql(mapId, userId)
			)
		);
}

export type SavePositionsResult = { status: 'ok'; written: number } | { status: 'rate_limited'; retryAfterSeconds: number };

/**
 * Save many node positions in one database round trip.
 *
 * Previously each moved node was its own PATCH request costing ~7 round
 * trips (rate-limit write, read, update, three reads to build a response the
 * client discarded). Now: one request per batch of moves, one round trip,
 * one rate-limit hit, and rows are only written when a position actually
 * changed — so echoes and re-sends of an unchanged layout write nothing and
 * don't wake other viewers with spurious `moves`.
 *
 * Moving nodes is not a content edit: not logged to activity, and does not
 * touch updated_at / updated_by.
 */
export async function savePositions(
	mapId: string,
	userId: string,
	positions: Position[],
	now = Date.now()
): Promise<SavePositionsResult> {
	const items: BatchItem<'sqlite'>[] = [rateLimitUpsert(userWriteKey(userId), USER_WRITE_LIMIT, now)];
	for (const p of positions) items.push(positionUpdate(mapId, p, now, userId));

	const results = (await db.batch(items as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])) as unknown[];
	const bucket = (results[0] as { count: number; windowStart: number }[])[0];
	if (bucket && bucket.count > USER_WRITE_LIMIT.limit) {
		return { status: 'rate_limited', retryAfterSeconds: retryAfterSeconds(bucket.windowStart, USER_WRITE_LIMIT.windowMs, now) };
	}
	const written = results
		.slice(1)
		.reduce<number>((sum, r) => sum + ((r as { rowsAffected?: number }).rowsAffected ?? 0), 0);
	return { status: 'ok', written };
}
