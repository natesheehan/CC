// Map layouts. Pure functions: given the concepts and links, return a
// position for every concept. The canvas animates nodes to these positions
// and saves them like any other move. (The two "organic" layouts are run by
// the canvas's force simulation instead, so they return null here.)

export type LayoutId =
	| 'organic'
	| 'circle'
	| 'sunflower'
	| 'grid'
	| 'alphabetical'
	| 'clusters'
	| 'flow-down'
	| 'flow-up'
	| 'flow-right'
	| 'radial-tree'
	| 'rings'
	| 'center-tree'
	| 'orbit';

export interface LayoutInfo {
	id: LayoutId;
	label: string;
	description: string;
	/** Needs a concept to put in the middle. */
	centered: boolean;
}

export const LAYOUTS: LayoutInfo[] = [
	{ id: 'organic', label: 'Organic', description: 'Physics-based: linked concepts pull together, the rest spread out.', centered: false },
	{ id: 'circle', label: 'Circle', description: 'Everything on one ring, linked concepts side by side.', centered: false },
	{ id: 'sunflower', label: 'Sunflower', description: 'Spiral outwards: the most connected concepts in the middle.', centered: false },
	{ id: 'grid', label: 'Grid · most linked', description: 'Tidy rows, most connected concepts first.', centered: false },
	{ id: 'alphabetical', label: 'Grid · A–Z', description: 'Tidy rows in alphabetical order.', centered: false },
	{ id: 'clusters', label: 'Clusters', description: 'Each group of linked concepts in its own island.', centered: false },
	{ id: 'flow-down', label: 'Flow ↓', description: 'Layers following the arrows, top to bottom.', centered: false },
	{ id: 'flow-up', label: 'Flow ↑', description: 'Arrows point up, so "Type of" / "Part of" put the general idea on top.', centered: false },
	{ id: 'flow-right', label: 'Flow →', description: 'Layers following the arrows, left to right.', centered: false },
	{ id: 'radial-tree', label: 'Radial tree', description: 'Branches fan out from the center, each in its own slice.', centered: true },
	{ id: 'rings', label: 'Rings', description: 'Concentric rings by how many links away from the center.', centered: true },
	{ id: 'center-tree', label: 'Tree', description: 'A family tree hanging from the center concept.', centered: true },
	{ id: 'orbit', label: 'Orbit', description: 'Organic, but held in rings around the center.', centered: true }
];

export const LAYOUT_BY_ID = Object.fromEntries(LAYOUTS.map((l) => [l.id, l])) as Record<LayoutId, LayoutInfo>;

export interface LayoutNode {
	id: string;
	name: string;
	x?: number | null;
	y?: number | null;
}

export interface LayoutLink {
	source: string;
	target: string;
	/** True when the link has a direction (an arrow source → target only). */
	directed: boolean;
}

export type Positions = Map<string, { x: number; y: number }>;

/** Gap between neighbouring nodes. Nodes are ~100px wide labels. */
const GAP = 140;
const ROW = 130;
const COL = 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface Graph {
	ids: string[];
	names: Map<string, string>;
	adj: Map<string, Set<string>>;
	out: Map<string, Set<string>>;
	degree: Map<string, number>;
}

function buildGraph(nodes: LayoutNode[], links: LayoutLink[]): Graph {
	const ids = nodes.map((n) => n.id);
	const known = new Set(ids);
	const adj = new Map(ids.map((id) => [id, new Set<string>()]));
	const out = new Map(ids.map((id) => [id, new Set<string>()]));
	for (const l of links) {
		if (!known.has(l.source) || !known.has(l.target) || l.source === l.target) continue;
		adj.get(l.source)!.add(l.target);
		adj.get(l.target)!.add(l.source);
		if (l.directed) out.get(l.source)!.add(l.target);
	}
	return {
		ids,
		names: new Map(nodes.map((n) => [n.id, n.name])),
		adj,
		out,
		degree: new Map(ids.map((id) => [id, adj.get(id)!.size]))
	};
}

const byName = (g: Graph) => (a: string, b: string) =>
	g.names.get(a)!.localeCompare(g.names.get(b)!, undefined, { sensitivity: 'base' });
const byDegree = (g: Graph) => (a: string, b: string) => g.degree.get(b)! - g.degree.get(a)! || byName(g)(a, b);

/** Connected components, largest first; nodes in each in traversal order from its hub. */
function components(g: Graph): string[][] {
	const seen = new Set<string>();
	const result: string[][] = [];
	for (const start of [...g.ids].sort(byDegree(g))) {
		if (seen.has(start)) continue;
		const order: string[] = [];
		// DFS keeps chains of neighbours next to each other (good for rings).
		const stack = [start];
		while (stack.length) {
			const id = stack.pop()!;
			if (seen.has(id)) continue;
			seen.add(id);
			order.push(id);
			const next = [...g.adj.get(id)!].filter((n) => !seen.has(n)).sort(byDegree(g)).reverse();
			stack.push(...next);
		}
		result.push(order);
	}
	return result.sort((a, b) => b.length - a.length);
}

/** Breadth-first distances (and BFS parent) from `root`, ignoring direction. */
function bfs(g: Graph, root: string) {
	const depth = new Map<string, number>([[root, 0]]);
	const parent = new Map<string, string>();
	const children = new Map<string, string[]>(g.ids.map((id) => [id, []]));
	const queue = [root];
	while (queue.length) {
		const id = queue.shift()!;
		for (const n of [...g.adj.get(id)!].sort(byDegree(g))) {
			if (depth.has(n)) continue;
			depth.set(n, depth.get(id)! + 1);
			parent.set(n, id);
			children.get(id)!.push(n);
			queue.push(n);
		}
	}
	return { depth, parent, children };
}

function centroid(nodes: LayoutNode[]): { x: number; y: number } {
	const placed = nodes.filter((n) => n.x != null && n.y != null);
	if (placed.length === 0) return { x: 0, y: 0 };
	return {
		x: placed.reduce((s, n) => s + n.x!, 0) / placed.length,
		y: placed.reduce((s, n) => s + n.y!, 0) / placed.length
	};
}

/** Shift a layout so its bounding box is centred on `origin`, or so `anchor` lands on it. */
function place(pos: Positions, origin: { x: number; y: number }, anchor?: string): Positions {
	if (pos.size === 0) return pos;
	let cx: number;
	let cy: number;
	if (anchor && pos.has(anchor)) {
		({ x: cx, y: cy } = pos.get(anchor)!);
	} else {
		const xs = [...pos.values()].map((p) => p.x);
		const ys = [...pos.values()].map((p) => p.y);
		cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		cy = (Math.min(...ys) + Math.max(...ys)) / 2;
	}
	const out: Positions = new Map();
	for (const [id, p] of pos) out.set(id, { x: Math.round(p.x - cx + origin.x), y: Math.round(p.y - cy + origin.y) });
	return out;
}

// --- whole-map layouts ---------------------------------------------------------

function ring(ids: string[], cx = 0, cy = 0, minRadius = 0): Positions {
	const pos: Positions = new Map();
	if (ids.length === 1) {
		pos.set(ids[0], { x: cx, y: cy });
		return pos;
	}
	const r = Math.max(minRadius, (ids.length * GAP) / (2 * Math.PI), 120);
	ids.forEach((id, i) => {
		const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
		pos.set(id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
	});
	return pos;
}

function circle(g: Graph): Positions {
	return ring(components(g).flat());
}

function sunflower(ids: string[], cx = 0, cy = 0): Positions {
	const pos: Positions = new Map();
	const c = GAP * 0.62;
	ids.forEach((id, i) => {
		const r = c * Math.sqrt(i);
		const a = i * GOLDEN_ANGLE;
		pos.set(id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
	});
	return pos;
}

function grid(ids: string[]): Positions {
	const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length * 1.6)));
	const pos: Positions = new Map();
	ids.forEach((id, i) => pos.set(id, { x: (i % cols) * COL, y: Math.floor(i / cols) * ROW }));
	return pos;
}

function clusters(g: Graph): Positions {
	const comps = components(g);
	const singles = comps.filter((c) => c.length === 1).flat().sort(byName(g));
	const groups = comps.filter((c) => c.length > 1);

	// Lay out each island on its own (hub-centred sunflower), then shelf-pack.
	const islands = groups.map((ids) => {
		const local = sunflower([...ids].sort(byDegree(g)));
		const xs = [...local.values()].map((p) => p.x);
		const ys = [...local.values()].map((p) => p.y);
		const minX = Math.min(...xs), minY = Math.min(...ys);
		return { local, w: Math.max(...xs) - minX + COL, h: Math.max(...ys) - minY + ROW, minX, minY };
	});
	if (singles.length) {
		const local = grid(singles);
		const xs = [...local.values()].map((p) => p.x);
		const ys = [...local.values()].map((p) => p.y);
		islands.push({ local, w: Math.max(...xs) + COL, h: Math.max(...ys) + ROW, minX: 0, minY: 0 });
	}

	const area = islands.reduce((s, i) => s + i.w * i.h, 0);
	const maxWidth = Math.max(Math.sqrt(area) * 1.4, ...islands.map((i) => i.w));
	const pos: Positions = new Map();
	let x = 0, y = 0, rowH = 0;
	for (const island of islands) {
		if (x > 0 && x + island.w > maxWidth) {
			x = 0;
			y += rowH + GAP * 0.5;
			rowH = 0;
		}
		for (const [id, p] of island.local) pos.set(id, { x: x + p.x - island.minX, y: y + p.y - island.minY });
		x += island.w + GAP * 0.5;
		rowH = Math.max(rowH, island.h);
	}
	return pos;
}

/**
 * Layered ("Sugiyama-style") layout along the arrows: cycles are broken,
 * each concept goes one layer below everything pointing at it, then layers
 * are re-ordered a few times so linked concepts line up (fewer crossings).
 * Concepts with no links at all get a row of their own at the end.
 */
function layered(g: Graph, orientation: 'down' | 'up' | 'right'): Positions {
	const linked = g.ids.filter((id) => g.degree.get(id)! > 0);
	const isolated = g.ids.filter((id) => g.degree.get(id)! === 0).sort(byName(g));

	// Break cycles: DFS, dropping edges back into the current path.
	const state = new Map<string, 1 | 2>();
	const dag = new Map(linked.map((id) => [id, [] as string[]]));
	const visit = (id: string) => {
		state.set(id, 1);
		for (const n of g.out.get(id)!) {
			if (state.get(n) === 1) continue; // back edge
			dag.get(id)!.push(n);
			if (!state.has(n)) visit(n);
		}
		state.set(id, 2);
	};
	const indeg = new Map(linked.map((id) => [id, 0]));
	for (const id of linked) for (const n of g.out.get(id)!) indeg.set(n, indeg.get(n)! + 1);
	for (const id of [...linked].sort((a, b) => indeg.get(a)! - indeg.get(b)! || byDegree(g)(a, b))) {
		if (!state.has(id)) visit(id);
	}

	// Longest-path layering over the DAG (topological order via Kahn).
	const layer = new Map(linked.map((id) => [id, 0]));
	const inCount = new Map(linked.map((id) => [id, 0]));
	for (const id of linked) for (const n of dag.get(id)!) inCount.set(n, inCount.get(n)! + 1);
	const queue = linked.filter((id) => inCount.get(id) === 0);
	while (queue.length) {
		const id = queue.shift()!;
		for (const n of dag.get(id)!) {
			layer.set(n, Math.max(layer.get(n)!, layer.get(id)! + 1));
			inCount.set(n, inCount.get(n)! - 1);
			if (inCount.get(n) === 0) queue.push(n);
		}
	}
	// Concepts joined only by undirected links sit next to a neighbour's layer.
	for (const id of linked) {
		if (g.out.get(id)!.size === 0 && [...g.adj.get(id)!].every((n) => !g.out.get(n)!.has(id))) {
			const near = [...g.adj.get(id)!].map((n) => layer.get(n)!);
			layer.set(id, Math.min(...near));
		}
	}

	const layers: string[][] = [];
	for (const id of linked) (layers[layer.get(id)!] ??= []).push(id);
	for (let i = 0; i < layers.length; i++) layers[i] = (layers[i] ?? []).sort(byDegree(g));

	// Barycentre sweeps, down then up, against all neighbours.
	const index = new Map<string, number>();
	const reindex = () => layers.forEach((l) => l.forEach((id, i) => index.set(id, i)));
	reindex();
	for (let sweep = 0; sweep < 6; sweep++) {
		const order = sweep % 2 === 0 ? layers.map((_, i) => i) : layers.map((_, i) => layers.length - 1 - i);
		for (const li of order) {
			const ref = sweep % 2 === 0 ? li - 1 : li + 1;
			if (ref < 0 || ref >= layers.length) continue;
			const bary = (id: string) => {
				const ns = [...g.adj.get(id)!].filter((n) => layer.get(n) === ref);
				return ns.length ? ns.reduce((s, n) => s + index.get(n)!, 0) / ns.length : index.get(id)!;
			};
			layers[li].sort((a, b) => bary(a) - bary(b));
			reindex();
		}
	}

	if (isolated.length) {
		// Unlinked concepts wrap onto their own rows after the hierarchy.
		const width = Math.max(4, ...layers.map((l) => l.length));
		for (let i = 0; i < isolated.length; i += width) layers.push(isolated.slice(i, i + width));
	}

	// Very wide layers (a bushy tree's leaves) fold into staggered sub-rows,
	// like brickwork, so the map doesn't become one long thin strip. Order is
	// kept: neighbours alternate between sub-rows.
	const maxPerRow = Math.max(6, Math.ceil(Math.sqrt(g.ids.length) * 1.6));
	const pos: Positions = new Map();
	const along = orientation === 'right' ? ROW : COL;
	const across = orientation === 'right' ? COL + 40 : ROW + 30;
	const subGap = orientation === 'right' ? COL * 0.65 : ROW * 0.6;
	let offset = 0;
	for (const ids of layers) {
		const folds = Math.ceil(ids.length / maxPerRow);
		const step = along / folds;
		ids.forEach((id, i) => {
			const a = (i - (ids.length - 1) / 2) * step;
			const b = offset + (i % folds) * subGap;
			const signed = orientation === 'up' ? -b : b;
			pos.set(id, orientation === 'right' ? { x: signed, y: a } : { x: a, y: signed });
		});
		offset += across + (folds - 1) * subGap;
	}
	return pos;
}

// --- centered layouts ----------------------------------------------------------

/** Concepts not connected to the center, in an outer ring of their own. */
function outskirts(g: Graph, depth: Map<string, number>, radius: number): Positions {
	const rest = g.ids.filter((id) => !depth.has(id)).sort(byName(g));
	return rest.length ? ring(rest, 0, 0, radius) : new Map();
}

/** Each branch gets an angular slice proportional to its size. */
function radialTree(g: Graph, center: string): Positions {
	const { depth, children } = bfs(g, center);
	const leaves = new Map<string, number>();
	const countLeaves = (id: string): number => {
		const kids = children.get(id)!;
		const n = kids.length ? kids.reduce((s, k) => s + countLeaves(k), 0) : 1;
		leaves.set(id, n);
		return n;
	};
	countLeaves(center);

	// Ring radii: far enough apart, and big enough for that ring's crowd.
	const perDepth = new Map<number, number>();
	for (const d of depth.values()) perDepth.set(d, (perDepth.get(d) ?? 0) + 1);
	const maxDepth = Math.max(0, ...depth.values());
	const radius: number[] = [0];
	for (let d = 1; d <= maxDepth; d++) {
		radius[d] = Math.max(radius[d - 1] + GAP * 1.25, ((perDepth.get(d) ?? 0) * GAP) / (2 * Math.PI));
	}

	const pos: Positions = new Map([[center, { x: 0, y: 0 }]]);
	const assign = (id: string, start: number, end: number) => {
		let a = start;
		for (const k of children.get(id)!) {
			const span = ((end - start) * leaves.get(k)!) / leaves.get(id)!;
			const mid = a + span / 2;
			const r = radius[depth.get(k)!];
			pos.set(k, { x: Math.cos(mid) * r, y: Math.sin(mid) * r });
			assign(k, a, a + span);
			a += span;
		}
	};
	assign(center, -Math.PI / 2, (Math.PI * 3) / 2);
	for (const [id, p] of outskirts(g, depth, radius[maxDepth] + GAP * 1.5)) pos.set(id, p);
	return pos;
}

/** Plain concentric rings by distance, each ring ordered to follow its parents. */
function rings(g: Graph, center: string): Positions {
	const { depth, parent } = bfs(g, center);
	const maxDepth = Math.max(0, ...depth.values());
	const pos: Positions = new Map([[center, { x: 0, y: 0 }]]);
	const angle = new Map<string, number>([[center, 0]]);
	let r = 0;
	for (let d = 1; d <= maxDepth; d++) {
		const ids = g.ids
			.filter((id) => depth.get(id) === d)
			.sort((a, b) => angle.get(parent.get(a)!)! - angle.get(parent.get(b)!)! || byDegree(g)(a, b));
		r = Math.max(r + GAP * 1.2, (ids.length * GAP) / (2 * Math.PI));
		ids.forEach((id, i) => {
			const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
			angle.set(id, a);
			pos.set(id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
		});
	}
	for (const [id, p] of outskirts(g, depth, r + GAP * 1.5)) pos.set(id, p);
	return pos;
}

/** Tidy top-down tree from the center (BFS spanning tree). */
function centerTree(g: Graph, center: string): Positions {
	const { depth, children } = bfs(g, center);
	const pos: Positions = new Map();
	// Lots of leaves: pack them at half spacing, alternating up and down a
	// half row, so the tree stays roughly as wide as it is tall.
	const leafCount = [...children.values()].filter((k) => k.length === 0).length;
	const stagger = leafCount > 12;
	const level = ROW + 30;
	let slot = 0;
	const walk = (id: string): number => {
		const kids = children.get(id)!;
		let x: number;
		let y = depth.get(id)! * level;
		if (kids.length) {
			x = kids.map(walk).reduce((s, v, _, all) => s + v / all.length, 0);
		} else {
			x = slot * (stagger ? COL * 0.55 : COL);
			if (stagger && slot % 2 === 1) y += level * 0.5;
			slot++;
		}
		pos.set(id, { x, y });
		return x;
	};
	walk(center);
	const maxDepth = Math.max(0, ...depth.values());
	const rest = g.ids.filter((id) => !depth.has(id)).sort(byName(g));
	const restGrid = grid(rest);
	const offsetY = (maxDepth + (stagger ? 2 : 1.5)) * level;
	const width = Math.max(0, ...[...pos.values()].map((p) => p.x));
	const restWidth = Math.max(0, ...[...restGrid.values()].map((p) => p.x));
	for (const [id, p] of restGrid) pos.set(id, { x: p.x + (width - restWidth) / 2, y: p.y + offsetY });
	return pos;
}

/** BFS depth from `center` for every node (unreachable ones one ring further out). */
export function depthsFrom(nodes: LayoutNode[], links: LayoutLink[], center: string): Map<string, number> {
	const g = buildGraph(nodes, links);
	if (!g.adj.has(center)) return new Map();
	const { depth } = bfs(g, center);
	const outer = Math.max(0, ...depth.values()) + 1;
	return new Map(g.ids.map((id) => [id, depth.get(id) ?? outer]));
}

/**
 * Target positions for a layout, centred where the map already is (or on
 * the center concept's current spot). Null for simulation-driven layouts
 * ('organic', 'orbit') and when a centered layout has no valid center.
 */
export function computeLayout(
	id: LayoutId,
	nodes: LayoutNode[],
	links: LayoutLink[],
	opts: { center?: string | null } = {}
): Positions | null {
	if (nodes.length === 0) return new Map();
	const g = buildGraph(nodes, links);
	const center = opts.center && g.adj.has(opts.center) ? opts.center : null;
	const centerNode = center ? nodes.find((n) => n.id === center) : null;
	const origin = centerNode?.x != null && centerNode?.y != null ? { x: centerNode.x, y: centerNode.y } : centroid(nodes);

	switch (id) {
		case 'organic':
		case 'orbit':
			return null;
		case 'circle':
			return place(circle(g), origin);
		case 'sunflower':
			return place(sunflower([...g.ids].sort(byDegree(g))), origin);
		case 'grid':
			return place(grid([...g.ids].sort(byDegree(g))), origin);
		case 'alphabetical':
			return place(grid([...g.ids].sort(byName(g))), origin);
		case 'clusters':
			return place(clusters(g), origin);
		case 'flow-down':
			return place(layered(g, 'down'), origin);
		case 'flow-up':
			return place(layered(g, 'up'), origin);
		case 'flow-right':
			return place(layered(g, 'right'), origin);
		case 'radial-tree':
			return center ? place(radialTree(g, center), origin, center) : null;
		case 'rings':
			return center ? place(rings(g, center), origin, center) : null;
		case 'center-tree':
			return center ? place(centerTree(g, center), origin, center) : null;
	}
}
