import type { LivePeer } from './types';

/** A tab that hasn't written presence for this long is considered gone. */
export const PRESENCE_TTL_MS = 20_000;
/**
 * Clients re-write their presence at least this often even when nothing
 * changed. Worst-case row age is KEEPALIVE_MS + the longest poll interval +
 * latency, which must stay under PRESENCE_TTL_MS (asserted in livePolicy).
 */
export const KEEPALIVE_MS = 8_000;
/** Max peers returned per poll; bounds the O(T) per-request (O(T²) total) term. */
export const MAX_PEERS = 50;

/** 32-bit FNV-1a, base36. Non-cryptographic; used only for change detection. */
export function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

/**
 * Fingerprint of everything a viewer renders about peers. Deliberately
 * excludes `lastSeen`, which changes on every keep-alive and would otherwise
 * defeat the 304-style "nothing changed" short-circuit.
 */
export function peersSignature(peers: LivePeer[]): string {
	const parts = peers
		.map((p) => `${p.clientId}|${p.userId}|${p.focusId ?? ''}|${p.editing ?? ''}|${p.cursor ? `${p.cursor.x},${p.cursor.y}` : ''}`)
		.sort();
	return fnv1a(parts.join('\n'));
}
