#!/usr/bin/env node
// Load test for the live-collaboration heartbeat (POST /maps/:id/live).
//
// Simulates T browser tabs on one map, each following the same polling and
// write policy as src/lib/client/livePolicy.ts (mirrored below — keep in
// sync), and reports what that costs: requests, presence writes, 204s,
// latency, and server-side DB time (from the Server-Timing header), next to
// what the original fixed-rate design (one request + one write per tab every
// 1.5s) would have done over the same run.
//
// Usage (against a dev server pointed at a throwaway database!):
//   DATABASE_URL=file:/tmp/load.db npm run dev -- --port 5199
//   node scripts/live-load-test.mjs --base http://localhost:5199 --tabs 20 --concepts 200 --seconds 60
//
// Options:
//   --base URL          server to hit (default http://localhost:5173)
//   --tabs T            simulated tabs, one user each (default 10)
//   --concepts N        concepts to seed on the map (default 100)
//   --seconds S         run length (default 30)
//   --active F          fraction of tabs moving their cursor at any time (default 0.3)
//   --moves-per-min M   node drags per minute across all tabs (default 6)
//
// It creates users named "loadtest-<run>-<i>" and deletes its map at the end.
// Users can't be deleted through the app, so use a scratch database.

const args = Object.fromEntries(
	process.argv.slice(2).reduce((acc, cur, i, all) => {
		if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1]]);
		return acc;
	}, [])
);
const BASE = args.base ?? 'http://localhost:5173';
const TABS = Number(args.tabs ?? 10);
const CONCEPTS = Number(args.concepts ?? 100);
const SECONDS = Number(args.seconds ?? 30);
const ACTIVE = Number(args.active ?? 0.3);
const MOVES_PER_MIN = Number(args['moves-per-min'] ?? 6);
const RUN = Math.random().toString(36).slice(2, 7);

// --- mirror of src/lib/client/livePolicy.ts + src/lib/shared/live.ts -------
const ACTIVE_INTERVAL_MS = 1_500;
const IDLE_INTERVAL_MS = 3_000;
const SOLO_INTERVAL_MS = 6_000;
const IDLE_AFTER_MS = 30_000;
const CURSOR_DEADBAND = 8;
const KEEPALIVE_MS = 8_000;

const cursorMoved = (a, b) => (!a || !b ? a !== b : Math.hypot(b.x - a.x, b.y - a.y) >= CURSOR_DEADBAND);
function shouldWrite(lastSent, lastWriteAt, cur, now) {
	if (!lastSent) return true;
	if (lastSent.focusId !== cur.focusId || lastSent.editing !== cur.editing) return true;
	if (cursorMoved(lastSent.cursor, cur.cursor)) return true;
	return now - lastWriteAt >= KEEPALIVE_MS;
}
function nextDelay(peerCount, msSinceInput) {
	if (peerCount === 0) return SOLO_INTERVAL_MS;
	return msSinceInput < IDLE_AFTER_MS ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
}

// --- helpers ------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : NaN);
const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–');

async function login(name) {
	const res = await fetch(`${BASE}/login`, {
		method: 'POST',
		redirect: 'manual',
		headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ name })
	});
	const cookie = (res.headers.getSetCookie?.() ?? [])
		.map((c) => c.split(';')[0])
		.find((c) => c.startsWith('session_id='));
	if (!cookie) throw new Error(`login failed for ${name} (${res.status})`);
	return cookie;
}

async function api(cookie, path, init = {}) {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: { Origin: BASE, Cookie: cookie, 'Content-Type': 'application/json', ...init.headers }
	});
	return res;
}

// --- setup ------------------------------------------------------------------
console.log(`run ${RUN}: ${TABS} tabs, ${CONCEPTS} concepts, ${SECONDS}s against ${BASE}`);
const cookies = [];
for (let i = 0; i < TABS; i++) cookies.push(await login(`loadtest-${RUN}-${i}`));

const created = await api(cookies[0], '/maps?/createMap', {
	method: 'POST',
	headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-sveltekit-action': 'true', Accept: 'application/json' },
	body: new URLSearchParams({ name: `Load test ${RUN}` })
}).then((r) => r.json());
const mapId = created.location?.split('/').pop();
if (!mapId) throw new Error(`could not create map: ${JSON.stringify(created)}`);

// Spread concept creation across users to stay under the 60 writes/min/user limit.
const conceptIds = [];
for (let i = 0; i < CONCEPTS; i++) {
	for (;;) {
		const res = await api(cookies[i % TABS], `/maps/${mapId}/concepts`, {
			method: 'POST',
			body: JSON.stringify({ name: `Concept ${i}`, x: (i % 20) * 120, y: Math.floor(i / 20) * 120 })
		});
		if (res.status === 429) {
			// Write rate limit (60/min/user) — wait it out; fewer tabs seed slower.
			const wait = Number(/in (\d+)s/.exec(await res.text())?.[1] ?? 5);
			console.log(`  rate limited while seeding; waiting ${wait}s`);
			await sleep(wait * 1000);
			continue;
		}
		if (!res.ok) throw new Error(`seeding concept ${i} failed: ${res.status} ${await res.text()}`);
		conceptIds.push((await res.json()).id);
		break;
	}
}
console.log(`map ${mapId} seeded with ${conceptIds.length} concepts\n`);

// --- run ------------------------------------------------------------------
const stats = { requests: 0, writes: 0, s200: 0, s204: 0, other: 0, latency: [], db: [], bytes: 0, deliveredMoves: 0 };
const endAt = Date.now() + SECONDS * 1000;

async function tab(i) {
	const cookie = cookies[i];
	const clientId = `load-${RUN}-${i}`;
	let since = null;
	let sig = null;
	let peers = 0;
	let lastSent = null;
	let lastWriteAt = 0;
	let lastInput = Date.now();
	const state = { focusId: null, editing: null, cursor: { x: Math.random() * 2000, y: Math.random() * 1000 } };
	await sleep(Math.random() * ACTIVE_INTERVAL_MS); // de-synchronise tabs

	while (Date.now() < endAt) {
		if (Math.random() < ACTIVE) {
			// Random-walk the cursor, occasionally selecting a concept.
			state.cursor = { x: state.cursor.x + (Math.random() - 0.5) * 120, y: state.cursor.y + (Math.random() - 0.5) * 120 };
			if (Math.random() < 0.1) state.focusId = conceptIds[Math.floor(Math.random() * conceptIds.length)] ?? null;
			lastInput = Date.now();
		}
		const now = Date.now();
		const write = shouldWrite(lastSent, lastWriteAt, state, now);
		const beat = write
			? { clientId, ...state, since, sig, write: true }
			: { clientId, since, sig, write: false };

		const t0 = performance.now();
		const res = await api(cookie, `/maps/${mapId}/live`, { method: 'POST', body: JSON.stringify(beat) });
		const body = res.status === 200 ? await res.text() : '';
		stats.latency.push(performance.now() - t0);
		stats.requests++;
		stats.bytes += body.length;
		const dbDur = /db;dur=([\d.]+)/.exec(res.headers.get('server-timing') ?? '')?.[1];
		if (dbDur) stats.db.push(Number(dbDur));

		if (res.status === 200) {
			stats.s200++;
			const update = JSON.parse(body);
			since = update.now;
			sig = update.sig;
			peers = update.peers.length;
			stats.deliveredMoves += update.moves.length;
		} else if (res.status === 204) {
			stats.s204++;
			since = Number(res.headers.get('x-live-now')) || since;
		} else {
			stats.other++;
		}
		if (res.ok && write) {
			stats.writes++;
			lastSent = { ...state, cursor: state.cursor && { ...state.cursor } };
			lastWriteAt = now;
		}
		await sleep(nextDelay(peers, Date.now() - lastInput));
	}
}

// Background node drags, which other tabs must pick up as `moves`.
async function dragger() {
	if (MOVES_PER_MIN <= 0) return;
	while (Date.now() < endAt) {
		await sleep(60_000 / MOVES_PER_MIN);
		const id = conceptIds[Math.floor(Math.random() * conceptIds.length)];
		await api(cookies[0], `/maps/${mapId}/concepts/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ x: Math.round(Math.random() * 2000), y: Math.round(Math.random() * 1000) })
		});
	}
}

const started = Date.now();
await Promise.all([...Array.from({ length: TABS }, (_, i) => tab(i)), dragger()]);
const elapsed = (Date.now() - started) / 1000;

// --- report ------------------------------------------------------------------
await api(cookies[0], `/maps/${mapId}`, { method: 'DELETE' });
for (let i = 0; i < TABS; i++) {
	await api(cookies[i], `/maps/${mapId}/live`, { method: 'POST', body: JSON.stringify({ clientId: `load-${RUN}-${i}`, leave: true }) });
}

const lat = [...stats.latency].sort((a, b) => a - b);
const dbt = [...stats.db].sort((a, b) => a - b);
const naive = (TABS * elapsed) / 1.5; // old design: 1 request + 1 write per tab per 1.5s

console.log(`elapsed            ${fmt(elapsed)}s`);
console.log(`requests           ${stats.requests}  (${fmt(stats.requests / elapsed, 2)}/s)   naive fixed-rate: ${Math.round(naive)}  → ${fmt(naive / stats.requests, 2)}× fewer`);
console.log(`presence writes    ${stats.writes}  (${fmt(stats.writes / elapsed, 2)}/s)   naive always-write: ${Math.round(naive)}  → ${fmt(naive / Math.max(1, stats.writes), 2)}× fewer`);
console.log(`responses          200: ${stats.s200}   204 (unchanged): ${stats.s204} (${fmt((100 * stats.s204) / stats.requests)}%)   other: ${stats.other}`);
console.log(`response bytes     ${stats.bytes}  (${fmt(stats.bytes / Math.max(1, stats.requests), 0)} B/request avg)`);
console.log(`latency ms         p50 ${fmt(pct(lat, 50))}   p95 ${fmt(pct(lat, 95))}   p99 ${fmt(pct(lat, 99))}`);
console.log(`server db ms       p50 ${fmt(pct(dbt, 50), 2)}   p95 ${fmt(pct(dbt, 95), 2)}   p99 ${fmt(pct(dbt, 99), 2)}`);
console.log(`moves delivered    ${stats.deliveredMoves} (across all tabs)`);
if (stats.other > 0) process.exitCode = 1;
