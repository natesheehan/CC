import type { ClientActivityEntry, LiveHeartbeat, LivePeer, LiveUpdate } from '$lib/shared/types';
import { nextDelay, shouldWrite, type PresenceState } from './livePolicy';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface LiveCallbacks {
	/** New activity entries (never seen before by this tab), oldest first. */
	onActivity?: (entries: ClientActivityEntry[]) => void;
	/** Concepts repositioned by someone (or something) since the last poll. */
	onMoves?: (moves: LiveUpdate['moves']) => void;
	/** The map no longer exists (deleted by its owner). */
	onGone?: () => void;
}

function newClientId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return Math.random().toString(36).slice(2) + Date.now().toString(36);
	}
}

/**
 * One live collaboration session for one map in one browser tab.
 *
 * Transport is a paced heartbeat POST (see `/maps/[id]/live`): each call
 * reports what this tab is doing and receives who else is here plus what
 * changed. Polling keeps it working on serverless hosting. Costs track
 * activity, not wall-clock time (policy in ./livePolicy.ts):
 *  - the interval adapts to visibility, idleness and whether anyone else
 *    is here (alone → slow);
 *  - presence is only written when it changed (cursor beyond a dead-band)
 *    or as a keep-alive before it would expire;
 *  - unchanged polls come back as an empty 204.
 */
export class LiveSession {
	readonly clientId = newClientId();
	peers = $state<LivePeer[]>([]);
	status = $state<LiveStatus>('connecting');

	#mapId: string;
	#callbacks: LiveCallbacks;
	#since: number | null = null;
	#seenActivity = new Set<string>();
	#timer: ReturnType<typeof setTimeout> | undefined;
	#inFlight = false;
	#stopped = true;
	#failures = 0;
	#lastInput = Date.now();
	/** True when focus/editing changed and should be sent promptly. */
	#dirty = false;
	/** Presence as last successfully written, and when. */
	#lastSent: PresenceState | null = null;
	#lastWriteAt = 0;
	/** Peer fingerprint from the last full response. */
	#sig: string | null = null;

	focusId: string | null = null;
	editing: string | null = null;
	cursor: { x: number; y: number } | null = null;

	constructor(mapId: string, knownActivityIds: Iterable<string>, callbacks: LiveCallbacks = {}) {
		this.#mapId = mapId;
		this.#callbacks = callbacks;
		for (const id of knownActivityIds) this.#seenActivity.add(id);
	}

	start() {
		if (!this.#stopped) return;
		this.#stopped = false;
		document.addEventListener('visibilitychange', this.#onVisibility);
		window.addEventListener('pagehide', this.#onPageHide);
		this.#tick();
	}

	stop() {
		if (this.#stopped) return;
		this.#stopped = true;
		clearTimeout(this.#timer);
		document.removeEventListener('visibilitychange', this.#onVisibility);
		window.removeEventListener('pagehide', this.#onPageHide);
		this.#sendLeave();
	}

	/** Mark ids as already known (e.g. after our own writes reload the page data). */
	markSeen(ids: Iterable<string>) {
		for (const id of ids) this.#seenActivity.add(id);
	}

	setFocus(id: string | null) {
		if (id === this.focusId) return;
		this.focusId = id;
		this.#poke();
	}

	setEditing(value: string | null) {
		if (value === this.editing) return;
		this.editing = value;
		this.#poke();
	}

	/** Cursor moves are frequent; they ride along on the next scheduled poll. */
	setCursor(point: { x: number; y: number } | null) {
		this.cursor = point;
		this.#lastInput = Date.now();
	}

	/** Note local activity so polling runs at the fast rate. */
	touch() {
		this.#lastInput = Date.now();
	}

	/** Send soon rather than waiting for the next scheduled poll. */
	#poke() {
		this.#lastInput = Date.now();
		this.#dirty = true;
		if (this.#stopped || this.#inFlight) return;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.#tick(), 120);
	}

	#nextDelay(): number {
		return nextDelay({
			failures: this.#failures,
			hidden: document.visibilityState === 'hidden',
			peerCount: this.peers.length,
			msSinceInput: Date.now() - this.#lastInput
		});
	}

	#schedule() {
		if (this.#stopped) return;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.#tick(), this.#nextDelay());
	}

	#onVisibility = () => {
		if (document.visibilityState === 'visible') {
			this.#lastInput = Date.now();
			this.#poke();
		}
	};

	#onPageHide = () => this.#sendLeave();

	#sendLeave() {
		const body = JSON.stringify({ clientId: this.clientId, leave: true } satisfies LiveHeartbeat);
		try {
			if (navigator.sendBeacon?.(`/maps/${this.#mapId}/live`, body)) return;
		} catch {
			// fall through
		}
		fetch(`/maps/${this.#mapId}/live`, { method: 'POST', body, keepalive: true }).catch(() => {});
	}

	async #tick() {
		if (this.#stopped || this.#inFlight) return;
		this.#inFlight = true;
		this.#dirty = false;
		const state: PresenceState = {
			focusId: this.focusId,
			editing: this.editing,
			cursor: document.visibilityState === 'hidden' ? null : this.cursor
		};
		const startedAt = Date.now();
		const write = shouldWrite(this.#lastSent, this.#lastWriteAt, state, startedAt);
		const beat: LiveHeartbeat = write
			? { clientId: this.clientId, ...state, since: this.#since, sig: this.#sig, write: true }
			: { clientId: this.clientId, since: this.#since, sig: this.#sig, write: false };
		try {
			const res = await fetch(`/maps/${this.#mapId}/live`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(beat)
			});
			if (res.status === 404) {
				this.#callbacks.onGone?.();
				this.stop();
				return;
			}
			if (!res.ok) throw new Error(`Live update failed (${res.status})`);
			if (write) {
				this.#lastSent = state;
				this.#lastWriteAt = startedAt;
			}
			this.#failures = 0;
			this.status = 'live';
			if (res.status === 204) {
				// Nothing changed; just advance the change cursor.
				const now = Number(res.headers.get('X-Live-Now'));
				if (Number.isFinite(now) && now > 0) this.#since = now;
			} else {
				this.#apply((await res.json()) as LiveUpdate);
			}
		} catch {
			this.#failures++;
			this.status = this.#failures >= 3 ? 'offline' : 'reconnecting';
		} finally {
			this.#inFlight = false;
			if (this.#dirty) this.#poke();
			else this.#schedule();
		}
	}

	#apply(update: LiveUpdate) {
		const firstPoll = this.#since == null;
		this.#since = update.now;
		this.#sig = update.sig;
		this.peers = update.peers;

		const fresh = update.activity.filter((a) => !this.#seenActivity.has(a.id));
		for (const a of fresh) this.#seenActivity.add(a.id);
		if (fresh.length > 0 && !firstPoll) {
			this.#callbacks.onActivity?.(fresh.slice().reverse());
		}
		if (update.moves.length > 0 && !firstPoll) this.#callbacks.onMoves?.(update.moves);
	}
}

/** Short human description of what a peer is doing. */
export function describePeer(
	peer: LivePeer,
	conceptName: (id: string) => string | undefined,
	relationName: (id: string) => string | undefined
): string {
	if (peer.editing === 'map') return 'editing the map details';
	if (peer.editing?.startsWith('concept:')) {
		const name = conceptName(peer.editing.slice(8));
		return name ? `editing “${name}”` : 'editing a concept';
	}
	if (peer.editing?.startsWith('relation:')) {
		const name = relationName(peer.editing.slice(9));
		return name ? `editing the link ${name}` : 'editing a link';
	}
	if (peer.focusId) {
		const name = conceptName(peer.focusId);
		if (name) return `looking at “${name}”`;
	}
	return 'browsing the map';
}

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	return name.slice(0, 2).toUpperCase();
}
