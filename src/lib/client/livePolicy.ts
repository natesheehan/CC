// Pure decision logic for the live heartbeat, kept free of DOM/runtime state
// so it can be unit-tested exhaustively. Cost model (T tabs, poll interval Δ):
// requests/s = Σ 1/Δ_i, writes/s = Σ (state changes + keep-alives)_i.
// These functions are what make both of those track *activity* rather than
// wall-clock time.
import { KEEPALIVE_MS, PRESENCE_TTL_MS } from '$lib/shared/live';

/** Someone else is here and you've been active recently: near-real-time. */
export const ACTIVE_INTERVAL_MS = 1_500;
/** Someone else is here but you've been idle for IDLE_AFTER_MS. */
export const IDLE_INTERVAL_MS = 3_000;
/**
 * You're alone on the map. Nobody to sync with and your own edits already
 * reload your view, so the only thing to notice is someone arriving.
 */
export const SOLO_INTERVAL_MS = 6_000;
/** Tab in the background — just keep presence alive. */
export const HIDDEN_INTERVAL_MS = 10_000;
export const IDLE_AFTER_MS = 30_000;
export const MAX_BACKOFF_MS = 30_000;
/** Cursor movement (graph units) below which we don't bother writing. */
export const CURSOR_DEADBAND = 8;

// Worst-case presence age = KEEPALIVE_MS + the longest regular interval
// (a keep-alive becomes due just after a poll, and is sent on the next one)
// plus request latency. Keep that comfortably under the TTL.
const WORST_CASE_AGE = KEEPALIVE_MS + HIDDEN_INTERVAL_MS;
if (WORST_CASE_AGE > PRESENCE_TTL_MS - 1_000) {
	throw new Error('live policy: keep-alive + hidden interval must stay under the presence TTL');
}

export interface PresenceState {
	focusId: string | null;
	editing: string | null;
	cursor: { x: number; y: number } | null;
}

export function cursorMoved(
	prev: PresenceState['cursor'],
	next: PresenceState['cursor'],
	deadband = CURSOR_DEADBAND
): boolean {
	if (!prev || !next) return prev !== next; // appeared or disappeared
	return Math.hypot(next.x - prev.x, next.y - prev.y) >= deadband;
}

/**
 * Should this heartbeat persist presence? Yes on the first call, whenever
 * something peers render has changed, or when the stored row is close
 * enough to expiry that waiting for the next poll could let it lapse.
 */
export function shouldWrite(
	lastSent: PresenceState | null,
	lastWriteAt: number,
	current: PresenceState,
	now: number,
	keepaliveMs = KEEPALIVE_MS
): boolean {
	if (!lastSent) return true;
	if (lastSent.focusId !== current.focusId || lastSent.editing !== current.editing) return true;
	if (cursorMoved(lastSent.cursor, current.cursor)) return true;
	return now - lastWriteAt >= keepaliveMs;
}

export function nextDelay(opts: {
	failures: number;
	hidden: boolean;
	peerCount: number;
	msSinceInput: number;
}): number {
	if (opts.failures > 0) return Math.min(MAX_BACKOFF_MS, ACTIVE_INTERVAL_MS * 2 ** opts.failures);
	if (opts.hidden) return HIDDEN_INTERVAL_MS;
	if (opts.peerCount === 0) return SOLO_INTERVAL_MS;
	return opts.msSinceInput < IDLE_AFTER_MS ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
}
