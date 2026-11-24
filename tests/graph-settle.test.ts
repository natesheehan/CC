import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Harness from './Harness.svelte';

// Regression test: the force simulation must come to rest (and fire 'end',
// which persists auto-layout positions) even after the data changes while
// nodes already exist. Previously the second reconcile handed d3 Svelte
// state proxies; d3's reads of x/y/vx/vy subscribed the reconcile effect to
// values d3 rewrites every tick, so the simulation restarted forever.
describe('GraphCanvas simulation', () => {
	let target: HTMLDivElement | null = null;
	let app: ReturnType<typeof mount> | null = null;

	afterEach(() => {
		if (app) unmount(app);
		target?.remove();
		app = null;
		target = null;
		vi.useRealTimers();
	});

	it('settles and persists positions again after a later data change', async () => {
		vi.useFakeTimers();
		target = document.createElement('div');
		document.body.appendChild(target);
		const moved = vi.fn();
		const h = mount(Harness, { target, props: { onNodeMoved: moved } }) as ReturnType<typeof mount> & {
			addConcept: (id: string, name: string) => void;
			addRelation: (id: string, s: string, t: string) => void;
			renameConcept: (id: string, name: string) => void;
		};
		app = h;
		flushSync();

		h.addConcept('a', 'A');
		h.addConcept('b', 'B');
		h.addConcept('c', 'C');
		h.addRelation('r1', 'a', 'b');
		flushSync();
		await vi.advanceTimersByTimeAsync(20_000); // far longer than one full alpha decay
		expect(moved).toHaveBeenCalled(); // first layout settled → 'end' fired
		const firstSettle = moved.mock.calls.length;

		// A second reconcile with existing nodes — the case that used to loop.
		h.renameConcept('b', 'B renamed');
		flushSync();
		await vi.advanceTimersByTimeAsync(20_000);
		expect(moved.mock.calls.length).toBeGreaterThan(firstSettle); // settled again

		// And once settled, it stays settled: no further work scheduled.
		const settled = moved.mock.calls.length;
		await vi.advanceTimersByTimeAsync(20_000);
		expect(moved.mock.calls.length).toBe(settled);
	});
});
