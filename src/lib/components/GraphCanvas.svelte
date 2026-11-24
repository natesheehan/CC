<script lang="ts">
	import { untrack } from 'svelte';
	import {
		forceSimulation,
		forceManyBody,
		forceLink,
		forceCollide,
		forceX,
		forceY,
		forceRadial,
		type Simulation,
		type SimulationNodeDatum,
		type SimulationLinkDatum
	} from 'd3-force';
	import { RELATION_META, type RelationType } from '$lib/shared/relations';
	import Icon from './Icon.svelte';
	import { computeLayout, depthsFrom, type LayoutId, type LayoutLink, type Positions } from '$lib/shared/layouts';
	import type { ClientConcept, ClientRelation, LivePeer } from '$lib/shared/types';

	interface SimNode extends SimulationNodeDatum {
		id: string;
		name: string;
	}
	interface SimLink extends SimulationLinkDatum<SimNode> {
		id: string;
		type: RelationType | string;
		direction: 'forward' | 'both';
		description: string | null;
	}

	let {
		concepts,
		relations,
		selectedId = null,
		selectedRelationId = null,
		relationMeta = RELATION_META,
		centralId = null,
		onSelect,
		onSelectRelation,
		onNodeMoved,
		onContextMenu,
		onOpen,
		onBackgroundClick,
		fullscreen = false,
		onToggleFullscreen,
		onRandomConcept,
		peers = [],
		onCursorMove
	}: {
		concepts: ClientConcept[];
		relations: ClientRelation[];
		selectedId?: string | null;
		selectedRelationId?: string | null;
		relationMeta?: Record<string, { label: string; phrase: string; color: string; directional: boolean }>;
		centralId?: string | null;
		onSelect: (id: string) => void;
		onSelectRelation?: (id: string) => void;
		onNodeMoved: (id: string, x: number, y: number) => void;
		/** Right-click on a node, an edge, or empty canvas. */
		onContextMenu?: (target: { kind: 'node' | 'edge' | 'background'; id?: string }, clientX: number, clientY: number) => void;
		/** Double-click (or Enter) on a node: open its details. */
		onOpen?: (id: string) => void;
		/** Click on empty canvas (not a pan). */
		onBackgroundClick?: () => void;
		fullscreen?: boolean;
		onToggleFullscreen?: () => void;
		/** Shows a "go to a random concept" button in the bottom toolbar. */
		onRandomConcept?: () => void;
		/** Other people live on this map: drawn as cursors and rings on what they're on. */
		peers?: LivePeer[];
		/** Local pointer position in graph space (null when it leaves the canvas). */
		onCursorMove?: (point: { x: number; y: number } | null) => void;
	} = $props();

	// --- live collaborators ---------------------------------------------------
	// Peers grouped by the node they're on, so each node can draw one ring per
	// person (solid while they're editing it, dashed while just looking).
	const peersByNode = $derived.by(() => {
		const byNode = new Map<string, { peer: LivePeer; editing: boolean }[]>();
		for (const peer of peers) {
			const editingId = peer.editing?.startsWith('concept:') ? peer.editing.slice(8) : null;
			const nodeId = editingId ?? peer.focusId;
			if (!nodeId) continue;
			const list = byNode.get(nodeId) ?? [];
			list.push({ peer, editing: editingId === nodeId });
			byNode.set(nodeId, list);
		}
		return byNode;
	});

	// Remote cursors arrive every poll (~1.5s); ease each displayed cursor
	// toward its latest reported point so they glide instead of jumping. Kept
	// in graph space so panning/zooming locally stays instantly correct.
	let cursorShown: Record<string, { x: number; y: number }> = $state({});
	let cursorFrame = 0;

	function stepCursors() {
		cursorFrame = 0;
		const next: Record<string, { x: number; y: number }> = {};
		let moving = false;
		for (const peer of peers) {
			if (!peer.cursor) continue;
			const prev = cursorShown[peer.clientId];
			if (!prev) {
				next[peer.clientId] = { ...peer.cursor };
				continue;
			}
			const dx = peer.cursor.x - prev.x;
			const dy = peer.cursor.y - prev.y;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
				next[peer.clientId] = { ...peer.cursor };
			} else {
				next[peer.clientId] = { x: prev.x + dx * 0.12, y: prev.y + dy * 0.12 };
				moving = true;
			}
		}
		cursorShown = next;
		if (moving) cursorFrame = requestAnimationFrame(stepCursors);
	}

	$effect(() => {
		void peers; // re-run whenever a new set of peer positions arrives
		untrack(() => {
			if (!cursorFrame && typeof requestAnimationFrame !== 'undefined') cursorFrame = requestAnimationFrame(stepCursors);
		});
		return () => {
			if (cursorFrame) cancelAnimationFrame(cursorFrame);
			cursorFrame = 0;
		};
	});

	const visibleCursors = $derived(
		peers
			.filter((p) => p.cursor && cursorShown[p.clientId])
			.map((p) => ({ peer: p, local: graphToLocal(cursorShown[p.clientId].x, cursorShown[p.clientId].y) }))
			.filter(({ local }) => local.x > -40 && local.y > -40 && local.x < width + 40 && local.y < height + 40)
	);

	let lastCursorSent = 0;
	function reportCursor(e: PointerEvent) {
		if (!onCursorMove || e.pointerType === 'touch') return;
		const now = performance.now();
		if (now - lastCursorSent < 50) return;
		lastCursorSent = now;
		const g = screenToGraph(e.clientX, e.clientY);
		onCursorMove({ x: Math.round(g.x), y: Math.round(g.y) });
	}

	/**
	 * Apply node positions changed by someone else. Eases nodes to their new
	 * spots rather than snapping, and never fights a node being dragged here.
	 */
	export function applyRemoteMoves(moves: { id: string; x: number | null; y: number | null }[]) {
		const tweens: { node: SimNode; fromX: number; fromY: number; toX: number; toY: number }[] = [];
		for (const m of moves) {
			if (m.x == null || m.y == null || m.id === draggingId) continue;
			const node = nodesById.get(m.id);
			if (!node) continue;
			// Our own drags/layout come back too — ignore anything already there.
			const curX = node.fx ?? node.x;
			const curY = node.fy ?? node.y;
			if (curX != null && curY != null && Math.abs(curX - m.x) < 1 && Math.abs(curY - m.y) < 1) continue;
			tweens.push({ node, fromX: node.x ?? m.x, fromY: node.y ?? m.y, toX: m.x, toY: m.y });
		}
		if (tweens.length === 0) return;
		const start = performance.now();
		const duration = 450;
		const frame = (t: number) => {
			const k = Math.min(1, (t - start) / duration);
			const ease = 1 - Math.pow(1 - k, 3);
			for (const tw of tweens) {
				if (tw.node.id === draggingId) continue;
				tw.node.x = tw.node.fx = tw.fromX + (tw.toX - tw.fromX) * ease;
				tw.node.y = tw.node.fy = tw.fromY + (tw.toY - tw.fromY) * ease;
			}
			simNodes = [...simNodes];
			if (k < 1) requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	}

	/** Pan (without changing zoom) so a graph-space point sits in the middle. */
	export function focusPoint(x: number, y: number) {
		const { x: rx, y: ry } = rotateAndScale(x, y, zoom);
		pan = { x: width / 2 - rx, y: height / 2 - ry };
	}

	// A brief pulsing ring used to point out a node (e.g. a search result).
	let flashingId: string | null = $state(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	export function flashNode(id: string) {
		clearTimeout(flashTimer);
		flashingId = null;
		requestAnimationFrame(() => {
			flashingId = id;
			flashTimer = setTimeout(() => (flashingId = null), 2200);
		});
	}

	// Hover state drives focus+context highlighting: hovering a node lifts
	// its own links and fades the rest; hovering a link shows its label.
	let hoveredNodeId: string | null = $state(null);
	let hoveredLinkId: string | null = $state(null);

	function linkTouches(link: SimLink, nodeId: string) {
		return resolveEnd(link.source)?.id === nodeId || resolveEnd(link.target)?.id === nodeId;
	}

	function openContextMenu(e: MouseEvent, kind: 'node' | 'edge' | 'background', id?: string) {
		if (!onContextMenu) return;
		e.preventDefault();
		e.stopPropagation();
		onContextMenu({ kind, id }, e.clientX, e.clientY);
	}

	function metaFor(type: string) {
		return relationMeta[type] ?? { label: type, phrase: type, color: '#64748b', directional: true };
	}

	function isCentralConnection(link: SimLink): boolean {
		if (!centralId) return true;
		const source = resolveEnd(link.source);
		const target = resolveEnd(link.target);
		return source?.id === centralId || target?.id === centralId;
	}

	const allTypes = $derived(Array.from(new Set([...Object.keys(RELATION_META), ...relations.map((r) => r.type)])));

	let container: HTMLDivElement | undefined = $state();
	let width = $state(900);
	let height = $state(620);

	let simNodes: SimNode[] = $state([]);
	let simLinks: SimLink[] = $state([]);

	let pan = $state({ x: 0, y: 0 });
	let zoom = $state(1);
	let rotation = $state(0); // degrees, clockwise

	const nodesById = $derived(new Map(simNodes.map((n) => [n.id, n])));

	function resolveEnd(end: SimLink['source']): SimNode | undefined {
		if (typeof end === 'object') return end as SimNode;
		return nodesById.get(end as string);
	}

	function linkEndpoints(link: SimLink) {
		const source = resolveEnd(link.source);
		const target = resolveEnd(link.target);
		if (!source || !target || source.x == null || source.y == null || target.x == null || target.y == null) {
			return null;
		}

		const pairLinks = simLinks
			.filter((candidate) => {
				const candidateSource = resolveEnd(candidate.source);
				const candidateTarget = resolveEnd(candidate.target);
				return (
					candidateSource &&
					candidateTarget &&
					((candidateSource.id === source.id && candidateTarget.id === target.id) ||
						(candidateSource.id === target.id && candidateTarget.id === source.id))
				);
			})
			.sort((a, b) => a.id.localeCompare(b.id));
		const index = pairLinks.findIndex((candidate) => candidate.id === link.id);
		const offset = (index - (pairLinks.length - 1) / 2) * 32;

		// Base the perpendicular direction on a canonical (direction-independent)
		// ordering of the two node ids, not this link's own source/target order.
		// Two relations between the same pair can be stored in opposite
		// directions (A->B and B->A) — using each link's own order would flip
		// the sign of the offset in lockstep with the reversed endpoints,
		// producing the exact same curve traced backwards instead of a
		// separate, visibly offset one.
		const [a, b] = source.id < target.id ? [source, target] : [target, source];
		const dx = b.x! - a.x!;
		const dy = b.y! - a.y!;
		const distance = Math.hypot(dx, dy) || 1;
		const perpendicularX = (-dy / distance) * offset;
		const perpendicularY = (dx / distance) * offset;
		const midX = (source.x + target.x) / 2 + perpendicularX;
		const midY = (source.y + target.y) / 2 + perpendicularY;

		// Anchor both ends at the actual node centers (so links visibly meet at
		// each node) but bow the middle out via a quadratic curve — with more
		// than one relation between the same pair, each one arcs a different
		// amount instead of drawing an identical, indistinguishable line.
		return {
			source,
			target,
			x1: source.x,
			y1: source.y,
			x2: target.x,
			y2: target.y,
			cx: midX,
			cy: midY,
			path: `M ${source.x} ${source.y} Q ${midX} ${midY} ${target.x} ${target.y}`
		};
	}

	// --- minimap ---------------------------------------------------------------
	const MINIMAP_WIDTH = 160;
	const MINIMAP_HEIGHT = 110;
	const MINIMAP_PADDING = 60;

	const graphBounds = $derived.by(() => {
		const placed = simNodes.filter((n) => n.x != null && n.y != null);
		if (placed.length === 0) return null;
		const xs = placed.map((n) => n.x!);
		const ys = placed.map((n) => n.y!);
		const minX = Math.min(...xs) - MINIMAP_PADDING;
		const minY = Math.min(...ys) - MINIMAP_PADDING;
		const maxX = Math.max(...xs) + MINIMAP_PADDING;
		const maxY = Math.max(...ys) + MINIMAP_PADDING;
		return {
			minX,
			minY,
			w: Math.max(maxX - minX, 80),
			h: Math.max(maxY - minY, 80)
		};
	});

	// The polygon (not just a rectangle) of the currently visible area, in
	// graph space — computed from the four container corners so it stays
	// accurate even when the view is rotated.
	const viewportPolygon = $derived.by(() => {
		if (!container) return '';
		const corners = [
			localToGraph(0, 0),
			localToGraph(width, 0),
			localToGraph(width, height),
			localToGraph(0, height)
		];
		return corners.map((p) => `${p.x},${p.y}`).join(' ');
	});

	function onMinimapPointerDown(e: PointerEvent) {
		e.stopPropagation();
		if (!graphBounds) return;
		const svg = e.currentTarget as SVGSVGElement;
		const pt = svg.createSVGPoint();
		pt.x = e.clientX;
		pt.y = e.clientY;
		const ctm = svg.getScreenCTM();
		if (!ctm) return;
		const graphPt = pt.matrixTransform(ctm.inverse());
		// Recenter the main view on the clicked graph point, keeping the
		// current zoom and rotation.
		const { x: rx, y: ry } = rotateAndScale(graphPt.x, graphPt.y, zoom);
		pan = { x: width / 2 - rx, y: height / 2 - ry };
	}

	// --- simulation setup (created once) ------------------------------------
	const linkForce = forceLink<SimNode, SimLink>([])
		.id((d) => d.id)
		.distance(150)
		.strength(0.45);

	const simulation: Simulation<SimNode, SimLink> = forceSimulation<SimNode>([])
		.force('charge', forceManyBody().strength(-320))
		.force('link', linkForce)
		.force('collide', forceCollide<SimNode>().radius(50))
		.force(
			'x',
			forceX<SimNode>(() => width / 2).strength(0.025)
		)
		.force(
			'y',
			forceY<SimNode>(() => height / 2).strength(0.025)
		)
		.on('tick', () => {
			simNodes = [...simNodes];
		})
		.on('end', () => {
			// A layout's temporary pull (e.g. Orbit's rings) only shapes that one run.
			if (simulation.force('layout')) simulation.force('layout', null);
			for (const n of simNodes) {
				if (n.fx == null && n.x != null && n.y != null) {
					onNodeMoved(n.id, Math.round(n.x), Math.round(n.y));
				}
			}
		});

	simulation.stop();

	$effect(() => {
		return () => simulation.stop();
	});

	// --- reconcile server data into the live simulation ----------------------
	// IMPORTANT: this effect must only re-run when `concepts`/`relations` (or
	// the container size) change — never when `simNodes` itself changes.
	// The d3 tick handler below reassigns `simNodes` every animation frame to
	// drive re-rendering; if this effect also *read* `simNodes` reactively,
	// that reassignment would re-trigger this effect, which calls
	// `simulation.restart()`, which ticks again, which reassigns `simNodes`
	// again — an infinite loop. `untrack` lets us read the current node list
	// to reconcile against, without subscribing to its changes.
	$effect(() => {
		// Reactive dependencies: concepts, relations, width, height — and
		// nothing else. Everything below runs untracked.
		const liveConcepts = concepts;
		const liveRelations = relations;
		const w = width;
		const h = height;
		// Untracked as a whole, not piecemeal: after the first run, simNodes
		// holds $state proxies, and both this code (existing.fx) and d3's
		// simulation.nodes() (x, y, vx, vy) read their fields. Tracked, those
		// reads subscribed this effect to values d3 rewrites on every tick, so
		// any second reconcile (new data, a resize) restarted the simulation
		// forever: it never settled, burned CPU every frame, and never fired
		// 'end' to persist auto-layout positions.
		untrack(() => reconcile(liveConcepts, liveRelations, w, h));
	});

	function reconcile(liveConcepts: ClientConcept[], liveRelations: ClientRelation[], w: number, h: number) {
		const currentNodes = simNodes;
		const existingById = new Map(currentNodes.map((n) => [n.id, n]));
		const nextNodes: SimNode[] = [];
		let hasNewUnpinned = false;

		for (const c of liveConcepts) {
			const existing = existingById.get(c.id);
			if (existing) {
				existing.name = c.name;
				if (c.x != null && c.y != null && existing.fx == null) {
					existing.fx = c.x;
					existing.fy = c.y;
				}
				nextNodes.push(existing);
			} else {
				const hasPersisted = c.x != null && c.y != null;
				const node: SimNode = {
					id: c.id,
					name: c.name,
					x: c.x ?? w / 2 + (Math.random() - 0.5) * 160,
					y: c.y ?? h / 2 + (Math.random() - 0.5) * 160,
					fx: hasPersisted ? c.x : null,
					fy: hasPersisted ? c.y : null
				};
				if (!hasPersisted) hasNewUnpinned = true;
				nextNodes.push(node);
			}
		}

		simNodes = nextNodes;

		const ids = new Set(nextNodes.map((n) => n.id));
		const nextLinks: SimLink[] = liveRelations
			.filter((r) => ids.has(r.sourceId) && ids.has(r.targetId))
			.map((r) => ({
				id: r.id,
				type: r.type,
				direction: r.direction,
				description: r.description,
				source: r.sourceId,
				target: r.targetId
			}));
		simLinks = nextLinks;

		// Use the local `nextNodes`/`nextLinks` variables here, NOT the
		// `simNodes`/`simLinks` state we just assigned above — reading the
		// state back in would re-subscribe this effect to it, and the tick
		// handler's `simNodes = [...simNodes]` would then re-trigger this
		// whole effect on every animation frame (the same infinite-loop
		// hazard `untrack` above is guarding against).
		simulation.nodes(nextNodes);
		linkForce.links(nextLinks);
		simulation.alpha(hasNewUnpinned ? 0.8 : 0.2).restart();
	}

	// --- coordinate helpers ---------------------------------------------------
	// The graph content is drawn under `translate(pan) rotate(rotation) scale(zoom)`,
	// so converting a point back to graph space means undoing those in reverse
	// order: subtract the pan, un-rotate, then un-scale. `localToGraph` takes
	// coordinates already relative to the container's top-left corner;
	// `screenToGraph` additionally converts from page (client) coordinates.
	function localToGraph(localX: number, localY: number) {
		const dx = localX - pan.x;
		const dy = localY - pan.y;
		const rad = (-rotation * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		return {
			x: (dx * cos - dy * sin) / zoom,
			y: (dx * sin + dy * cos) / zoom
		};
	}

	/** Applies just the rotate+scale part of the view transform (no pan). */
	function rotateAndScale(graphX: number, graphY: number, z: number) {
		const rad = (rotation * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		return {
			x: graphX * z * cos - graphY * z * sin,
			y: graphX * z * sin + graphY * z * cos
		};
	}

	function graphToLocal(graphX: number, graphY: number) {
		const { x, y } = rotateAndScale(graphX, graphY, zoom);
		return { x: pan.x + x, y: pan.y + y };
	}

	function screenToGraph(clientX: number, clientY: number) {
		if (!container) return { x: 0, y: 0 };
		const rect = container.getBoundingClientRect();
		return localToGraph(clientX - rect.left, clientY - rect.top);
	}

	// --- node dragging ---------------------------------------------------------
	let draggingId: string | null = null;
	// Where the dragged node was pinned before the drag, so a drag that turns
	// into a pinch can be put back.
	let dragOrigin: { fx: number | null | undefined; fy: number | null | undefined } | null = null;

	function onNodePointerDown(e: PointerEvent, node: SimNode) {
		e.stopPropagation();
		if (e.button !== 0 || pinching) return;
		draggingId = node.id;
		(e.target as Element).setPointerCapture(e.pointerId);
		dragOrigin = { fx: node.fx, fy: node.fy };
		node.fx = node.x;
		node.fy = node.y;
		simulation.alphaTarget(0.3).restart();
	}

	function onNodePointerMove(e: PointerEvent, node: SimNode) {
		if (draggingId !== node.id) return;
		const g = screenToGraph(e.clientX, e.clientY);
		node.fx = g.x;
		node.fy = g.y;
	}

	function onNodePointerUp(e: PointerEvent, node: SimNode) {
		if (draggingId !== node.id) return;
		draggingId = null;
		simulation.alphaTarget(0);
		onSelect(node.id);
		if (node.fx != null && node.fy != null) {
			onNodeMoved(node.id, Math.round(node.fx), Math.round(node.fy));
		}
	}

	// --- background pan ----------------------------------------------------
	let panning = false;
	let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

	let panMoved = false;

	function onBackgroundPointerDown(e: PointerEvent) {
		if (e.button === 2 || pinching) return;
		panning = true;
		panMoved = false;
		panStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onBackgroundPointerMove(e: PointerEvent) {
		if (!panning || pinching) return;
		if (Math.hypot(e.clientX - panStart.x, e.clientY - panStart.y) > 4) panMoved = true;
		pan = {
			x: panStart.panX + (e.clientX - panStart.x),
			y: panStart.panY + (e.clientY - panStart.y)
		};
	}

	function onBackgroundPointerUp(e: PointerEvent) {
		if (panning && !panMoved && !pinched && e.type === 'pointerup') onBackgroundClick?.();
		panning = false;
	}

	// --- touch pinch-zoom ----------------------------------------------------
	// Tracked in the capture phase on the container so touches that land on a
	// node or edge (which stop propagation) still count toward the gesture.
	// Two fingers zoom around their midpoint and pan as the midpoint moves.
	const touches = new Map<number, { x: number; y: number }>();
	let pinching = false;
	/** True once a pinch happened in the current gesture, until all fingers lift. */
	let pinched = false;
	let pinchStart = { dist: 1, zoom: 1, graphX: 0, graphY: 0 };

	function touchPair() {
		const [a, b] = [...touches.values()];
		return {
			dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
			midX: (a.x + b.x) / 2,
			midY: (a.y + b.y) / 2
		};
	}

	function onTouchPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		if (touches.size === 0) pinched = false;
		touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (touches.size !== 2) return;

		// Second finger down: abandon any pan or node drag and start pinching.
		pinching = true;
		pinched = true;
		panning = false;
		if (draggingId) {
			const node = nodesById.get(draggingId);
			if (node && dragOrigin) {
				node.fx = dragOrigin.fx;
				node.fy = dragOrigin.fy;
			}
			draggingId = null;
			dragOrigin = null;
			simulation.alphaTarget(0);
		}
		const { dist, midX, midY } = touchPair();
		const g = screenToGraph(midX, midY);
		pinchStart = { dist, zoom, graphX: g.x, graphY: g.y };
	}

	function onTouchPointerMove(e: PointerEvent) {
		if (!touches.has(e.pointerId)) return;
		touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (!pinching || touches.size < 2 || !container) return;

		const { dist, midX, midY } = touchPair();
		const rect = container.getBoundingClientRect();
		const next = Math.min(3, Math.max(0.25, pinchStart.zoom * (dist / pinchStart.dist)));
		// Keep the graph point that started under the fingers' midpoint pinned
		// beneath the (possibly moved) midpoint.
		const { x: rx, y: ry } = rotateAndScale(pinchStart.graphX, pinchStart.graphY, next);
		pan = { x: midX - rect.left - rx, y: midY - rect.top - ry };
		zoom = next;
	}

	function onTouchPointerUp(e: PointerEvent) {
		if (!touches.delete(e.pointerId)) return;
		// Stay in pinch mode until every finger lifts, so the remaining finger
		// doesn't suddenly start panning from a stale position.
		if (touches.size === 0) pinching = false;
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const sx = e.clientX - rect.left;
		const sy = e.clientY - rect.top;
		const { x: gx, y: gy } = screenToGraph(e.clientX, e.clientY);
		const next = Math.min(3, Math.max(0.25, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
		// Re-derive where (gx, gy) would land on screen at the new zoom, and
		// shift pan so that point stays fixed under the cursor.
		const { x: rx, y: ry } = rotateAndScale(gx, gy, next);
		pan = { x: sx - rx, y: sy - ry };
		zoom = next;
	}

	function zoomAroundCenter(next: number) {
		const clamped = Math.min(3, Math.max(0.25, next));
		const { x: gx, y: gy } = localToGraph(width / 2, height / 2);
		const { x: rx, y: ry } = rotateAndScale(gx, gy, clamped);
		pan = { x: width / 2 - rx, y: height / 2 - ry };
		zoom = clamped;
	}

	export function zoomIn() {
		zoomAroundCenter(zoom * 1.2);
	}

	export function zoomOut() {
		zoomAroundCenter(zoom / 1.2);
	}

	/** Zoom and pan so every node is in view. */
	export function fitView() {
		const placed = simNodes.filter((n) => n.x != null && n.y != null);
		if (placed.length === 0) return;
		const pad = 70;
		const xs = placed.map((n) => n.x!);
		const ys = placed.map((n) => n.y!);
		const minX = Math.min(...xs) - pad;
		const maxX = Math.max(...xs) + pad;
		const minY = Math.min(...ys) - pad;
		const maxY = Math.max(...ys) + pad;
		const sideways = rotation % 180 !== 0;
		const w = sideways ? maxY - minY : maxX - minX;
		const h = sideways ? maxX - minX : maxY - minY;
		const next = Math.min(1.6, Math.max(0.25, Math.min(width / w, height / h)));
		const { x: rx, y: ry } = rotateAndScale((minX + maxX) / 2, (minY + maxY) / 2, next);
		pan = { x: width / 2 - rx, y: height / 2 - ry };
		zoom = next;
	}

	/** Pan (without changing zoom) so the given node sits in the middle. */
	export function focusNode(id: string) {
		const node = nodesById.get(id);
		if (!node || node.x == null || node.y == null) return;
		const { x: rx, y: ry } = rotateAndScale(node.x, node.y, zoom);
		pan = { x: width / 2 - rx, y: height / 2 - ry };
	}

	/** Graph-space coordinates under a screen point (e.g. where a menu was opened). */
	export function graphPointAt(clientX: number, clientY: number) {
		return screenToGraph(clientX, clientY);
	}

	export function resetView() {
		pan = { x: 0, y: 0 };
		zoom = 1;
		rotation = 0;
	}

	export function rotateView() {
		rotation = (rotation + 90) % 360;
	}

	// --- layouts ---------------------------------------------------------------
	// See $lib/shared/layouts. Fixed layouts tween every node to its target and
	// pin it there; 'organic' and 'orbit' let the force simulation settle.
	// Either way the final positions go out through onNodeMoved (and so are
	// saved for everyone). Each returns the previous positions, for undo.

	let layoutFrame = 0;

	/** Where every node is right now. */
	export function currentPositions(): Positions {
		const pos: Positions = new Map();
		for (const n of simNodes) {
			const x = n.fx ?? n.x;
			const y = n.fy ?? n.y;
			if (x != null && y != null) pos.set(n.id, { x: Math.round(x), y: Math.round(y) });
		}
		return pos;
	}

	function layoutLinks(): LayoutLink[] {
		return simLinks.flatMap((l) => {
			const source = resolveEnd(l.source)?.id;
			const target = resolveEnd(l.target)?.id;
			if (!source || !target) return [];
			return [{ source, target, directed: l.direction !== 'both' && metaFor(l.type).directional !== false }];
		});
	}

	/** Animate nodes to `positions`, pin them, save them, then frame the result. */
	export function applyPositions(positions: Positions, opts: { fit?: boolean } = {}) {
		cancelAnimationFrame(layoutFrame);
		simulation.stop();
		const tweens = simNodes
			.filter((n) => positions.has(n.id))
			.map((n) => ({ node: n, fromX: n.x ?? 0, fromY: n.y ?? 0, to: positions.get(n.id)! }));
		const start = performance.now();
		const duration = tweens.length > 400 ? 0 : 650;
		const frame = (t: number) => {
			const k = duration === 0 ? 1 : Math.min(1, (t - start) / duration);
			const ease = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
			for (const tw of tweens) {
				tw.node.x = tw.node.fx = tw.fromX + (tw.to.x - tw.fromX) * ease;
				tw.node.y = tw.node.fy = tw.fromY + (tw.to.y - tw.fromY) * ease;
				tw.node.vx = tw.node.vy = 0;
			}
			simNodes = [...simNodes];
			if (k < 1) {
				layoutFrame = requestAnimationFrame(frame);
				return;
			}
			for (const tw of tweens) onNodeMoved(tw.node.id, tw.to.x, tw.to.y);
			if (opts.fit !== false) fitView();
		};
		layoutFrame = requestAnimationFrame(frame);
	}

	/**
	 * Arrange the map. `centerId` is required by the centered layouts
	 * (returns null without one). Returns the positions before the change.
	 */
	export function runLayout(id: LayoutId, centerId?: string | null): Positions | null {
		const before = currentPositions();
		if (id === 'organic') {
			reArrange();
			return before;
		}
		if (id === 'orbit') {
			if (!centerId || !nodesById.has(centerId)) return null;
			orbit(centerId);
			return before;
		}
		const nodes = simNodes.map((n) => ({ id: n.id, name: n.name, x: n.fx ?? n.x, y: n.fy ?? n.y }));
		const target = computeLayout(id, nodes, layoutLinks(), { center: centerId });
		if (!target) return null;
		applyPositions(target);
		return before;
	}

	export function reArrange() {
		cancelAnimationFrame(layoutFrame);
		for (const n of simNodes) {
			n.fx = null;
			n.fy = null;
		}
		simulation.alpha(1).restart();
		setTimeout(fitView, 1200);
	}

	/** Organic layout held in rings by distance from the (pinned) center. */
	function orbit(centerId: string) {
		cancelAnimationFrame(layoutFrame);
		const center = nodesById.get(centerId)!;
		const cx = center.fx ?? center.x ?? width / 2;
		const cy = center.fy ?? center.y ?? height / 2;
		const nodes = simNodes.map((n) => ({ id: n.id, name: n.name }));
		const depth = depthsFrom(nodes, layoutLinks(), centerId);
		for (const n of simNodes) {
			n.fx = null;
			n.fy = null;
		}
		center.x = center.fx = cx;
		center.y = center.fy = cy;
		onNodeMoved(centerId, Math.round(cx), Math.round(cy));
		simulation.force(
			'layout',
			forceRadial<SimNode>((n) => (depth.get(n.id) ?? 1) * 190, cx, cy).strength(0.9)
		);
		simulation.alpha(1).restart();
		setTimeout(fitView, 1400);
	}

	/** Kept for older callers: the "Rings" layout around a concept. */
	export function reArrangeAround(nodeId: string) {
		runLayout('rings', nodeId);
	}

	// --- image export -----------------------------------------------------------
	// Built independently from the live interactive SVG (which uses
	// <foreignObject> for node labels) because rasterizing foreignObject
	// content to a canvas is unreliable across browsers. Plain <text>/<tspan>
	// elements are used instead, so both the SVG and PNG exports are exact,
	// portable snapshots of the current layout.

	function escapeXml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	// Greedy word wrap using an approximate average glyph width; good enough
	// for headline/dek layout without a DOM to measure against.
	function wrapText(text: string, maxWidth: number, fontSize: number, charWidth = 0.5): string[] {
		const maxChars = Math.max(8, Math.floor(maxWidth / (fontSize * charWidth)));
		const lines: string[] = [];
		let line = '';
		for (const word of text.split(/\s+/).filter(Boolean)) {
			if (line && (line + ' ' + word).length > maxChars) {
				lines.push(line);
				line = word;
			} else {
				line = line ? line + ' ' + word : word;
			}
		}
		if (line) lines.push(line);
		return lines;
	}

	type ExportInfo = { title?: string; description?: string | null };

	const SERIF = "Georgia, 'Times New Roman', Times, serif";
	const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
	const INK = '#121212';
	const MUTED = '#727272';
	const RULE = '#dcdcdc';

	// An editorial, newspaper-graphic style snapshot of the current layout:
	// headline and dek, a key to the relation types in use, circles sized by
	// connections, haloed labels, and a source line.
	function buildExportSvg(info: ExportInfo = {}): string {
		const nodes = simNodes.filter((n) => n.x != null && n.y != null);
		if (nodes.length === 0) {
			return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="white"/></svg>';
		}

		const degree = new Map<string, number>();
		for (const link of simLinks) {
			for (const end of [resolveEnd(link.source), resolveEnd(link.target)]) {
				if (end) degree.set(end.id, (degree.get(end.id) ?? 0) + 1);
			}
		}
		const maxDegree = Math.max(1, ...degree.values());
		const radiusOf = (id: string) => 4.5 + Math.sqrt((degree.get(id) ?? 0) / maxDegree) * 9;
		const hubCutoff = maxDegree >= 3 ? Math.ceil(maxDegree * 0.6) : Infinity;

		// Graph bounds, with room for labels beneath each circle.
		const pad = 70;
		const xs = nodes.map((n) => n.x!);
		const ys = nodes.map((n) => n.y!);
		const gMinX = Math.min(...xs) - pad;
		const gMinY = Math.min(...ys) - pad / 2;
		const gW = Math.max(Math.max(...xs) + pad - gMinX, 200);
		const gH = Math.max(Math.max(...ys) + pad - gMinY, 160);

		const margin = 48;
		const contentW = Math.max(gW, 640);
		const W = contentW + margin * 2;

		// --- header ---
		let y = margin;
		const header: string[] = [];
		header.push(`<rect x="${margin}" y="${y}" width="${contentW}" height="2" fill="${INK}" />`);
		y += 30;
		header.push(
			`<text x="${margin}" y="${y}" font-family="${SANS}" font-size="11" font-weight="700" letter-spacing="1.6" fill="${MUTED}">CONCEPT MAP</text>`
		);
		y += 14;
		const titleLines = wrapText(info.title?.trim() || 'Concept map', contentW, 34, 0.52);
		for (const line of titleLines) {
			y += 40;
			header.push(
				`<text x="${margin}" y="${y}" font-family="${SERIF}" font-size="34" font-weight="700" fill="${INK}">${escapeXml(line)}</text>`
			);
		}
		const dek = info.description?.trim();
		if (dek) {
			y += 10;
			for (const line of wrapText(dek, Math.min(contentW, 680), 17, 0.47)) {
				y += 25;
				header.push(`<text x="${margin}" y="${y}" font-family="${SERIF}" font-size="17" fill="#363636">${escapeXml(line)}</text>`);
			}
		}

		// --- key ---
		const typesInUse = allTypes.filter((t) => simLinks.some((l) => l.type === t));
		y += 30;
		header.push(`<rect x="${margin}" y="${y}" width="${contentW}" height="1" fill="${RULE}" />`);
		y += 24;
		let kx = margin;
		const keyItems: string[] = [];
		for (const type of typesInUse) {
			const meta = metaFor(type);
			const label = escapeXml(meta.label);
			const itemW = 30 + meta.label.length * 6.6 + 20;
			if (kx + itemW > margin + contentW && kx > margin) {
				kx = margin;
				y += 22;
			}
			const dash = meta.directional ? '' : ' stroke-dasharray="4 3"';
			keyItems.push(
				`<line x1="${kx}" y1="${y - 4}" x2="${kx + 22}" y2="${y - 4}" stroke="${meta.color}" stroke-width="2.5"${dash} /><text x="${kx + 30}" y="${y}" font-family="${SANS}" font-size="12" fill="#333">${label}</text>`
			);
			kx += itemW;
		}
		const sizeNote = `Circle size shows number of connections`;
		if (kx + 260 > margin + contentW && kx > margin) {
			kx = margin;
			y += 22;
		}
		keyItems.push(
			`<circle cx="${kx + 4}" cy="${y - 4}" r="3.5" fill="${INK}" /><circle cx="${kx + 18}" cy="${y - 4}" r="7" fill="${INK}" /><text x="${kx + 32}" y="${y}" font-family="${SANS}" font-size="12" fill="#333">${sizeNote}</text>`
		);
		header.push(...keyItems);
		y += 20;

		// --- graph ---
		const graphTop = y;
		const offX = margin + (contentW - gW) / 2 - gMinX;
		const offY = graphTop - gMinY;

		const defs = typesInUse
			.map(
				(type) =>
					`<marker id="export-arrow-${type}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="${metaFor(type).color}" /></marker>`
			)
			.join('');

		// Pull each curve's ends back to the circle's edge so arrowheads show.
		const trim = (px: number, py: number, cx: number, cy: number, r: number) => {
			const dx = px - cx;
			const dy = py - cy;
			const d = Math.hypot(dx, dy) || 1;
			return [px - (dx / d) * r, py - (dy / d) * r];
		};

		const linksSvg = simLinks
			.map((link) => {
				const e = linkEndpoints(link);
				if (!e) return '';
				const meta = metaFor(link.type);
				const [x1, y1] = trim(e.x1, e.y1, e.cx, e.cy, radiusOf(e.source.id) + 3);
				const [x2, y2] = trim(e.x2, e.y2, e.cx, e.cy, radiusOf(e.target.id) + 3);
				const path = `M ${x1} ${y1} Q ${e.cx} ${e.cy} ${x2} ${y2}`;
				const markerEnd =
					meta.directional || link.direction === 'both' ? ` marker-end="url(#export-arrow-${link.type})"` : '';
				const markerStart = link.direction === 'both' ? ` marker-start="url(#export-arrow-${link.type})"` : '';
				const dash = meta.directional ? '' : ' stroke-dasharray="5 4"';
				return `<path d="${path}" fill="none" stroke="${meta.color}" stroke-width="1.6" stroke-opacity="0.9" stroke-linecap="round"${dash}${markerEnd}${markerStart} />`;
			})
			.join('');

		const nodesSvg = nodes
			.map((n) => {
				const r = radiusOf(n.id);
				const isHub = (degree.get(n.id) ?? 0) >= hubCutoff;
				const lines = wrapText(n.name, 130, 12, 0.55).slice(0, 3);
				const tspans = lines
					.map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 14}">${escapeXml(line)}</tspan>`)
					.join('');
				const weight = isHub ? 700 : 400;
				return `<g transform="translate(${n.x} ${n.y})"><circle r="${r}" fill="${INK}" stroke="white" stroke-width="1.5" /><text y="${r + 14}" text-anchor="middle" font-family="${SANS}" font-size="12" font-weight="${weight}" fill="${INK}" stroke="white" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke">${tspans}</text></g>`;
			})
			.join('');

		y = graphTop + gH;

		// --- footer ---
		y += 16;
		const footer: string[] = [];
		footer.push(`<rect x="${margin}" y="${y}" width="${contentW}" height="1" fill="${RULE}" />`);
		y += 22;
		const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
		footer.push(
			`<text x="${margin}" y="${y}" font-family="${SANS}" font-size="11" fill="${MUTED}">${nodes.length} concepts · ${simLinks.length} relations</text>`,
			`<text x="${margin + contentW}" y="${y}" text-anchor="end" font-family="${SANS}" font-size="11" fill="${MUTED}">Source: Concept Cartography · ${escapeXml(date)}</text>`
		);
		const H = y + margin - 8;

		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="white" />${header.join('')}<g transform="translate(${offX} ${offY})">${linksSvg}${nodesSvg}</g>${footer.join('')}</svg>`;
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	export function exportSVG(filename = 'concept-map.svg', info: ExportInfo = {}) {
		const svgString = buildExportSvg(info);
		downloadBlob(new Blob([svgString], { type: 'image/svg+xml' }), filename);
	}

	export async function exportPNG(filename = 'concept-map.png', info: ExportInfo = {}) {
		const svgString = buildExportSvg(info);
		const svgUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
		try {
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('Could not render the map for export.'));
				img.src = svgUrl;
			});

			// Up to 3x for a crisp, print-friendly image, capped so huge maps
			// stay within browser canvas limits.
			const scale = Math.min(3, 12000 / Math.max(img.width, img.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(img.width * scale));
			canvas.height = Math.max(1, Math.round(img.height * scale));
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas is not supported in this browser.');
			ctx.fillStyle = 'white';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.scale(scale, scale);
			ctx.drawImage(img, 0, 0);

			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
			if (!blob) throw new Error('Could not create the PNG image.');
			downloadBlob(blob, filename);
		} finally {
			URL.revokeObjectURL(svgUrl);
		}
	}
</script>

<div
	bind:this={container}
	bind:clientWidth={width}
	bind:clientHeight={height}
	class="graph-canvas relative h-full w-full touch-none overflow-hidden"
	onpointerdown={onBackgroundPointerDown}
	onpointermove={(e) => {
		onBackgroundPointerMove(e);
		reportCursor(e);
	}}
	onpointerleave={() => onCursorMove?.(null)}
	onpointerup={onBackgroundPointerUp}
	onpointercancel={onBackgroundPointerUp}
	onpointerdowncapture={onTouchPointerDown}
	onpointermovecapture={onTouchPointerMove}
	onpointerupcapture={onTouchPointerUp}
	onpointercancelcapture={onTouchPointerUp}
	onwheel={onWheel}
	oncontextmenu={(e) => openContextMenu(e, 'background')}
	role="application"
	aria-label="Concept map graph"
>
	<svg width="100%" height="100%">
		<defs>
			{#each allTypes as type (type)}
				{@const meta = metaFor(type)}
				<marker
					id="arrow-{type}"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" class="edge-marker" style="--edge: {meta.color}" />
				</marker>
			{/each}
		</defs>

		<g transform="translate({pan.x} {pan.y}) rotate({rotation}) scale({zoom})">
			{#each simLinks as link (link.id)}
				{@const endpoints = linkEndpoints(link)}
				{#if endpoints}
					{@const meta = metaFor(link.type)}
					{@const active = selectedRelationId === link.id || hoveredLinkId === link.id || (hoveredNodeId != null && linkTouches(link, hoveredNodeId))}
					{@const faded = centralId != null && !isCentralConnection(link)}
					{@const hoverFaded = hoveredNodeId != null && !linkTouches(link, hoveredNodeId)}
					<g
						role="button"
						tabindex="0"
						aria-label="{endpoints.source.name} {meta.phrase} {endpoints.target.name}"
						class="edge cursor-pointer {faded ? 'map-dimmed' : hoverFaded ? 'hover-dimmed' : ''} {active ? 'edge-active' : ''}"
						style="--edge: {meta.color}"
						onpointerdown={(e) => e.stopPropagation()}
						onpointerenter={() => (hoveredLinkId = link.id)}
						onpointerleave={() => (hoveredLinkId = null)}
						oncontextmenu={(e) => openContextMenu(e, 'edge', link.id)}
						onclick={(e) => {
							e.stopPropagation();
							onSelectRelation?.(link.id);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') onSelectRelation?.(link.id);
						}}
					>
						<!-- Wide, invisible hit-area so thin lines are still easy to click. -->
						<path d={endpoints.path} fill="none" stroke="transparent" stroke-width="16" />
						<!-- Halo in the canvas colour keeps every relation colour legible where it crosses other links. -->
						<path d={endpoints.path} class="edge-halo" fill="none" />
						<path
							d={endpoints.path}
							class="edge-line"
							fill="none"
							stroke-dasharray={meta.directional ? undefined : '7 5'}
							marker-end={meta.directional || link.direction === 'both' ? `url(#arrow-${link.type})` : undefined}
							marker-start={link.direction === 'both' ? `url(#arrow-${link.type})` : undefined}
						>
							<title
								>{endpoints.source.name} — {meta.label.toLowerCase()} — {endpoints.target
									.name}{link.direction === 'both' ? ' (both ways)' : ''}{link.description
									? `: ${link.description}`
									: ''}</title
							>
						</path>
					</g>
				{/if}
			{/each}

			{#each simNodes as node (node.id)}
				{#if node.x != null && node.y != null}
					{@const isCentral = centralId === node.id}
					{@const isSelected = selectedId === node.id}
					{@const faded =
						centralId != null && !isCentral && !simLinks.some((link) => linkTouches(link, centralId!) && linkTouches(link, node.id))}
					{@const hoverFaded =
						hoveredNodeId != null && hoveredNodeId !== node.id && !simLinks.some((link) => linkTouches(link, hoveredNodeId!) && linkTouches(link, node.id))}
					<g
						transform="translate({node.x} {node.y})"
						class="node cursor-grab active:cursor-grabbing {faded ? 'map-dimmed' : hoverFaded ? 'hover-dimmed' : ''}"
						onpointerdown={(e) => onNodePointerDown(e, node)}
						onpointermove={(e) => onNodePointerMove(e, node)}
						onpointerup={(e) => onNodePointerUp(e, node)}
						onpointercancel={(e) => onNodePointerUp(e, node)}
						onpointerenter={() => (hoveredNodeId = node.id)}
						onpointerleave={() => (hoveredNodeId = null)}
						oncontextmenu={(e) => openContextMenu(e, 'node', node.id)}
						ondblclick={(e) => {
							e.stopPropagation();
							onOpen?.(node.id);
						}}
						role="button"
						tabindex="0"
						aria-label="{node.name} — double-click for details"
						onkeydown={(e) => {
							if (e.key === 'Enter') (onOpen ?? onSelect)(node.id);
						}}
					>
						{#if flashingId === node.id}
							<circle r={isCentral ? 48 : 40} class="flash-ring" />
						{/if}
						{#each peersByNode.get(node.id) ?? [] as { peer, editing }, i (peer.clientId)}
							<circle
								r={(isCentral ? 52 : 44) + i * 5}
								class="peer-ring {editing ? 'editing' : ''}"
								style="--peer: {peer.color}"
							>
								<title>{peer.name} is {editing ? 'editing' : 'looking at'} this</title>
							</circle>
						{/each}
						<circle
							r={isCentral ? 48 : isSelected ? 40 : 36}
							class="concept-node {isSelected ? 'selected' : ''} {isCentral ? 'central' : ''} {hoveredNodeId === node.id ? 'hovered' : ''}"
						/>
						<foreignObject x="-40" y="-40" width="80" height="80" class="pointer-events-none">
							<div class="node-label flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-bold leading-tight">
								{node.name}
							</div>
						</foreignObject>
						<title>{node.name}</title>
					</g>
				{/if}
			{/each}

			<!-- Name tags for collaborators on a node, upright and constant-size. -->
			{#each [...peersByNode] as [nodeId, onNode] (nodeId)}
				{@const node = nodesById.get(nodeId)}
				{#if node && node.x != null && node.y != null}
					<g
						transform="translate({node.x} {node.y}) rotate({-rotation}) scale({1 / zoom}) translate(0 {-(centralId === nodeId ? 52 : 44) * zoom - 6 - (onNode.length - 1) * 5 * zoom})"
						class="pointer-events-none"
					>
						<foreignObject x="-110" y="-22" width="220" height="22">
							<div class="flex h-full items-end justify-center gap-1">
								{#each onNode.slice(0, 3) as { peer, editing } (peer.clientId)}
									<span class="peer-tag" style="--peer: {peer.color}">
										{#if editing}<span aria-hidden="true">✎</span>{/if}{peer.name}
									</span>
								{/each}
								{#if onNode.length > 3}<span class="peer-tag more">+{onNode.length - 3}</span>{/if}
							</div>
						</foreignObject>
					</g>
				{/if}
			{/each}

			<!-- Relation labels, drawn above nodes and kept upright and at a
			     constant on-screen size regardless of zoom/rotation. -->
			{#each simLinks as link (link.id)}
				{#if selectedRelationId === link.id || hoveredLinkId === link.id}
					{@const endpoints = linkEndpoints(link)}
					{#if endpoints}
						{@const meta = metaFor(link.type)}
						{@const mx = 0.25 * endpoints.x1 + 0.5 * endpoints.cx + 0.25 * endpoints.x2}
						{@const my = 0.25 * endpoints.y1 + 0.5 * endpoints.cy + 0.25 * endpoints.y2}
						<g transform="translate({mx} {my}) rotate({-rotation}) scale({1 / zoom})" class="pointer-events-none">
							<foreignObject x="-110" y="-14" width="220" height="28">
								<div class="flex h-full items-center justify-center">
									<span class="edge-label" style="--edge: {meta.color}">{meta.phrase}</span>
								</div>
							</foreignObject>
						</g>
					{/if}
				{/if}
			{/each}
		</g>
	</svg>

	<!-- Live cursors of other people on this map. -->
	{#each visibleCursors as { peer, local } (peer.clientId)}
		<div class="peer-cursor pointer-events-none absolute left-0 top-0 z-[25]" style="transform: translate({local.x}px, {local.y}px); --peer: {peer.color}">
			<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<path d="M2 1.5 L15 8.5 L9 10 L6.5 16 Z" />
			</svg>
			<span>{peer.name}</span>
		</div>
	{/each}

	<!-- Zoom / rotate controls. `onpointerdown|stopPropagation` here is what
	     makes these buttons clickable at all: without it, a pointerdown on a
	     button first bubbles up to the background div's own onpointerdown,
	     which calls setPointerCapture() on itself for panning — and once a
	     container captures the pointer, the browser redirects that pointer's
	     entire event sequence (including the click) away from the button
	     that was actually pressed. Stopping propagation here keeps that pan
	     handler from ever engaging for clicks that start on the controls. -->
	<div
		class="map-view-controls absolute bottom-4 right-4 flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur"
		role="toolbar"
		aria-label="Map view controls"
		tabindex="-1"
		onpointerdown={(e) => e.stopPropagation()}
		oncontextmenu={(e) => e.stopPropagation()}
	>
		<button type="button" class="map-view-btn" onclick={zoomIn} aria-label="Zoom in" title="Zoom in (+)">
			<Icon name="zoomIn" />
		</button>
		<button type="button" class="map-view-btn" onclick={zoomOut} aria-label="Zoom out" title="Zoom out (−)">
			<Icon name="zoomOut" />
		</button>
		<button type="button" class="map-view-btn" onclick={fitView} aria-label="Fit map to view" title="Fit to view (0)">
			<Icon name="fit" />
		</button>
		<button type="button" class="map-view-btn" onclick={rotateView} aria-label="Rotate view 90°" title="Rotate 90°">
			<Icon name="rotate" />
		</button>
		<button type="button" class="map-view-btn" onclick={resetView} aria-label="Reset view" title="Reset view">
			<Icon name="reset" />
		</button>
		{#if onRandomConcept}
			<div class="mx-0.5 h-5 w-px bg-slate-200"></div>
			<button
				type="button"
				class="map-view-btn"
				onclick={onRandomConcept}
				aria-label="Go to a random concept"
				title="Go to a random concept (R)"
			>
				<Icon name="dice" />
			</button>
		{/if}
		{#if onToggleFullscreen}
			<div class="mx-0.5 h-5 w-px bg-slate-200"></div>
			<button
				type="button"
				class="map-view-btn"
				onclick={onToggleFullscreen}
				aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
				title={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
			>
				<Icon name={fullscreen ? 'minimize' : 'maximize'} />
			</button>
		{/if}
	</div>

	<!-- Minimap: overview of every node's position with a polygon showing the
	     current viewport (accurate even when rotated), click to jump there. -->
	{#if graphBounds && simNodes.length > 1}
		<div
			class="absolute bottom-4 left-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-sm sm:block"
			style="width: {MINIMAP_WIDTH}px; height: {MINIMAP_HEIGHT}px"
			oncontextmenu={(e) => e.stopPropagation()}
			role="presentation"
		>
			<svg
				width={MINIMAP_WIDTH}
				height={MINIMAP_HEIGHT}
				viewBox="{graphBounds.minX} {graphBounds.minY} {graphBounds.w} {graphBounds.h}"
				class="cursor-pointer"
				onpointerdown={onMinimapPointerDown}
				role="img"
				aria-label="Map overview — click to jump to that area"
			>
				{#each simNodes as node (node.id)}
					{#if node.x != null && node.y != null}
						{@const markerSize = Math.max(3, Math.min(graphBounds.w, graphBounds.h) / 40)}
						<rect
							x={node.x - markerSize}
							y={node.y - markerSize}
							width={markerSize * 2}
							height={markerSize * 2}
							rx={markerSize}
							class="minimap-node {node.id === selectedId ? 'selected' : ''}"
						/>
					{/if}
				{/each}
				{#if viewportPolygon}
					<polygon
						points={viewportPolygon}
						class="minimap-viewport"
						stroke-width={Math.max(1, Math.min(graphBounds.w, graphBounds.h) / 200)}
					/>
				{/if}
			</svg>
		</div>
	{/if}
</div>

