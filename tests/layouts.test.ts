import { describe, it, expect } from 'vitest';
import { LAYOUTS, computeLayout, depthsFrom, type LayoutLink } from '$lib/shared/layouts';

// A small tree (0 → 1..3, 1 → 4,5), a cycle (6 → 7 → 8 → 6), a pair and a loner.
const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, name: `Concept ${String.fromCharCode(76 - i)}`, x: i * 10, y: 0 }));
const pairs: [number, number, boolean?][] = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [6, 7], [7, 8], [8, 6], [9, 10, false]];
const links: LayoutLink[] = pairs.map(([a, b, directed = true]) => ({ source: `n${a}`, target: `n${b}`, directed }));

const fixed = LAYOUTS.filter((l) => l.id !== 'organic' && l.id !== 'orbit');

describe('computeLayout', () => {
	it.each(fixed.map((l) => [l.id]))('%s places every concept, with no two on top of each other', (id) => {
		const pos = computeLayout(id, nodes, links, { center: 'n0' })!;
		expect(pos.size).toBe(nodes.length);
		const pts = [...pos.values()];
		for (const p of pts) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
		for (let i = 0; i < pts.length; i++)
			for (let j = i + 1; j < pts.length; j++) {
				expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(60);
			}
	});

	it('keeps the center concept where it was', () => {
		for (const id of ['radial-tree', 'rings', 'center-tree'] as const) {
			expect(computeLayout(id, nodes, links, { center: 'n3' })!.get('n3')).toEqual({ x: 30, y: 0 });
		}
	});

	it('centered layouts need a center; simulated ones return null', () => {
		expect(computeLayout('rings', nodes, links)).toBeNull();
		expect(computeLayout('rings', nodes, links, { center: 'missing' })).toBeNull();
		expect(computeLayout('organic', nodes, links)).toBeNull();
	});

	it('flow layouts follow the arrows, even through a cycle', () => {
		const down = computeLayout('flow-down', nodes, links)!;
		expect(down.get('n1')!.y).toBeGreaterThan(down.get('n0')!.y);
		expect(down.get('n4')!.y).toBeGreaterThan(down.get('n1')!.y);
		const up = computeLayout('flow-up', nodes, links)!;
		expect(up.get('n1')!.y).toBeLessThan(up.get('n0')!.y);
		const right = computeLayout('flow-right', nodes, links)!;
		expect(right.get('n1')!.x).toBeGreaterThan(right.get('n0')!.x);
	});

	it('alphabetical grid reads in name order', () => {
		const pos = computeLayout('alphabetical', nodes, links)!;
		const order = [...nodes].sort((a, b) => a.name.localeCompare(b.name)).map((n) => pos.get(n.id)!);
		for (let i = 1; i < order.length; i++) {
			const [a, b] = [order[i - 1], order[i]];
			expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true);
		}
	});

	it('rings put neighbours closer to the center than their neighbours', () => {
		const pos = computeLayout('rings', nodes, links, { center: 'n0' })!;
		const c = pos.get('n0')!;
		const r = (id: string) => Math.hypot(pos.get(id)!.x - c.x, pos.get(id)!.y - c.y);
		expect(r('n1')).toBeLessThan(r('n4'));
		expect(r('n4')).toBeLessThan(r('n11')); // unconnected → outskirts
	});

	it('handles an empty map and a single concept', () => {
		expect(computeLayout('circle', [], [])!.size).toBe(0);
		expect(computeLayout('flow-down', [nodes[0]], [])!.size).toBe(1);
	});

	it('copes with a large map quickly', () => {
		const big = Array.from({ length: 1500 }, (_, i) => ({ id: `b${i}`, name: `B${i}` }));
		const bigLinks = big.slice(1).map((n, i) => ({ source: `b${Math.floor(i / 3)}`, target: n.id, directed: true }));
		const t = performance.now();
		for (const l of fixed) computeLayout(l.id, big, bigLinks, { center: 'b0' });
		expect(performance.now() - t).toBeLessThan(3000);
	});
});

describe('depthsFrom', () => {
	it('gives unreachable concepts the outermost ring', () => {
		const d = depthsFrom(nodes, links, 'n0');
		expect(d.get('n0')).toBe(0);
		expect(d.get('n4')).toBe(2);
		expect(d.get('n11')).toBe(3);
	});
});
