import { describe, it, expect } from 'vitest';
import {
	ACTIVE_INTERVAL_MS,
	CURSOR_DEADBAND,
	HIDDEN_INTERVAL_MS,
	IDLE_AFTER_MS,
	IDLE_INTERVAL_MS,
	MAX_BACKOFF_MS,
	SOLO_INTERVAL_MS,
	cursorMoved,
	nextDelay,
	shouldWrite,
	type PresenceState
} from '../src/lib/client/livePolicy';
import { KEEPALIVE_MS, PRESENCE_TTL_MS, fnv1a, peersSignature } from '../src/lib/shared/live';
import type { LivePeer } from '../src/lib/shared/types';

const idle: PresenceState = { focusId: null, editing: null, cursor: { x: 0, y: 0 } };

describe('live policy: when to write presence', () => {
	it('always writes the first heartbeat', () => {
		expect(shouldWrite(null, 0, idle, 1)).toBe(true);
	});

	it('writes when focus or editing changes, immediately', () => {
		expect(shouldWrite(idle, 1000, { ...idle, focusId: 'c1' }, 1001)).toBe(true);
		expect(shouldWrite(idle, 1000, { ...idle, editing: 'concept:c1' }, 1001)).toBe(true);
	});

	it('ignores cursor jitter inside the dead-band but not beyond it', () => {
		const just = CURSOR_DEADBAND - 0.01;
		expect(shouldWrite(idle, 1000, { ...idle, cursor: { x: just, y: 0 } }, 1001)).toBe(false);
		expect(shouldWrite(idle, 1000, { ...idle, cursor: { x: CURSOR_DEADBAND, y: 0 } }, 1001)).toBe(true);
	});

	it('accumulates slow drift: compares against the last *sent* cursor', () => {
		// Moving 3 units per poll never exceeds the dead-band step-to-step, but
		// must still be written once the total drift does.
		let writes = 0;
		let lastSent = idle;
		for (let i = 1; i <= 10; i++) {
			const cur = { ...idle, cursor: { x: i * 3, y: 0 } };
			if (shouldWrite(lastSent, 1000, cur, 1001)) {
				writes++;
				lastSent = cur;
			}
		}
		expect(writes).toBe(3); // at x=9, 18, 27
	});

	it('treats a cursor appearing or leaving the canvas as a change', () => {
		expect(cursorMoved(null, { x: 0, y: 0 })).toBe(true);
		expect(cursorMoved({ x: 0, y: 0 }, null)).toBe(true);
		expect(cursorMoved(null, null)).toBe(false);
	});

	it('sends a keep-alive once KEEPALIVE_MS has passed without a write', () => {
		expect(shouldWrite(idle, 0, idle, KEEPALIVE_MS - 1)).toBe(false);
		expect(shouldWrite(idle, 0, idle, KEEPALIVE_MS)).toBe(true);
	});
});

describe('live policy: poll interval', () => {
	const base = { failures: 0, hidden: false, peerCount: 1, msSinceInput: 0 };

	it('is fast only when someone else is here and you are active', () => {
		expect(nextDelay(base)).toBe(ACTIVE_INTERVAL_MS);
		expect(nextDelay({ ...base, msSinceInput: IDLE_AFTER_MS })).toBe(IDLE_INTERVAL_MS);
		expect(nextDelay({ ...base, peerCount: 0 })).toBe(SOLO_INTERVAL_MS);
		expect(nextDelay({ ...base, hidden: true })).toBe(HIDDEN_INTERVAL_MS);
	});

	it('backs off exponentially on failure, capped', () => {
		expect(nextDelay({ ...base, failures: 1 })).toBe(ACTIVE_INTERVAL_MS * 2);
		expect(nextDelay({ ...base, failures: 2 })).toBe(ACTIVE_INTERVAL_MS * 4);
		expect(nextDelay({ ...base, failures: 20 })).toBe(MAX_BACKOFF_MS);
	});

	it('can never let an idle tab expire: keep-alive + slowest interval < TTL', () => {
		// Exhaustive over every non-failure state: a keep-alive becomes due at
		// most one interval after KEEPALIVE_MS, so the stored row's age when the
		// next write lands is bounded by KEEPALIVE_MS + max interval.
		let worst = 0;
		for (const hidden of [false, true])
			for (const peerCount of [0, 1, 5])
				for (const msSinceInput of [0, IDLE_AFTER_MS])
					worst = Math.max(worst, nextDelay({ failures: 0, hidden, peerCount, msSinceInput }));
		expect(KEEPALIVE_MS + worst).toBeLessThan(PRESENCE_TTL_MS - 1000);
	});

	it('simulated cost: an idle solo tab polls 4× and writes 8× less than the old fixed 1.5s/always-write loop', () => {
		const horizon = 10 * 60_000; // ten minutes
		let t = 0;
		let requests = 0;
		let writes = 0;
		let lastWrite = 0;
		let lastSent: PresenceState | null = null;
		while (t < horizon) {
			requests++;
			if (shouldWrite(lastSent, lastWrite, idle, t)) {
				writes++;
				lastSent = idle;
				lastWrite = t;
			}
			t += nextDelay({ failures: 0, hidden: false, peerCount: 0, msSinceInput: t });
		}
		const old = horizon / 1500; // previous design: one request and one write every 1.5s
		expect(requests).toBeLessThanOrEqual(Math.ceil(old / 4));
		expect(writes).toBeLessThanOrEqual(Math.ceil(old / 8));
	});
});

describe('peer signature', () => {
	const peer = (over: Partial<LivePeer> = {}): LivePeer => ({
		clientId: 'a',
		userId: 'u',
		name: 'A',
		color: '#000',
		focusId: null,
		editing: null,
		cursor: { x: 1, y: 2 },
		lastSeen: 1,
		...over
	});

	it('ignores lastSeen and ordering, but not anything a viewer renders', () => {
		const a = peer();
		const b = peer({ clientId: 'b' });
		expect(peersSignature([a, b])).toBe(peersSignature([{ ...b, lastSeen: 99 }, { ...a, lastSeen: 42 }]));
		expect(peersSignature([a])).not.toBe(peersSignature([peer({ cursor: { x: 1, y: 3 } })]));
		expect(peersSignature([a])).not.toBe(peersSignature([peer({ focusId: 'c' })]));
		expect(peersSignature([a])).not.toBe(peersSignature([peer({ editing: 'map' })]));
		expect(peersSignature([a])).not.toBe(peersSignature([]));
	});

	it('fnv1a matches the reference vectors', () => {
		// Published FNV-1a 32-bit test vectors.
		expect(fnv1a('')).toBe((0x811c9dc5).toString(36));
		expect(fnv1a('a')).toBe((0xe40c292c).toString(36));
		expect(fnv1a('foobar')).toBe((0xbf9cf968).toString(36));
	});
});
