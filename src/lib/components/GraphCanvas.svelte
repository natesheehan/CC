<script lang="ts">
	import { untrack } from 'svelte';
	import {
		forceSimulation,
		forceManyBody,
		forceLink,
		forceCollide,
		forceX,
		forceY,
		type Simulation,
		type SimulationNodeDatum,
		type SimulationLinkDatum
	} from 'd3-force';
	import { RELATION_META, type RelationType } from '$lib/shared/relations';
	import Icon from './Icon.svelte';
	import type { ClientConcept, ClientRelation } from '$lib/shared/types';

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
		onToggleFullscreen
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
	} = $props();

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
		// Reactive dependencies: concepts, relations, width, height.
		const liveConcepts = concepts;
		const liveRelations = relations;
		const w = width;
		const h = height;

		const currentNodes = untrack(() => simNodes);
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
	});

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

	function onNodePointerDown(e: PointerEvent, node: SimNode) {
		e.stopPropagation();
		if (e.button !== 0) return;
		draggingId = node.id;
		(e.target as Element).setPointerCapture(e.pointerId);
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
		if (e.button === 2) return;
		panning = true;
		panMoved = false;
		panStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onBackgroundPointerMove(e: PointerEvent) {
		if (!panning) return;
		if (Math.hypot(e.clientX - panStart.x, e.clientY - panStart.y) > 4) panMoved = true;
		pan = {
			x: panStart.panX + (e.clientX - panStart.x),
			y: panStart.panY + (e.clientY - panStart.y)
		};
	}

	function onBackgroundPointerUp(e: PointerEvent) {
		if (panning && !panMoved && e.type === 'pointerup') onBackgroundClick?.();
		panning = false;
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

	export function reArrange() {
		for (const n of simNodes) {
			n.fx = null;
			n.fy = null;
		}
		simulation.alpha(1).restart();
	}

	export function reArrangeAround(nodeId: string) {
		const center = simNodes.find((node) => node.id === nodeId);
		if (!center) return;

		const distances = new Map<string, number>([[nodeId, 0]]);
		const queue = [nodeId];
		while (queue.length > 0) {
			const current = queue.shift()!;
			const nextDistance = distances.get(current)! + 1;
			for (const link of simLinks) {
				const source = resolveEnd(link.source)?.id;
				const target = resolveEnd(link.target)?.id;
				const next = source === current ? target : target === current ? source : undefined;
				if (next && !distances.has(next)) {
					distances.set(next, nextDistance);
					queue.push(next);
				}
			}
		}

		const layers = new Map<number, SimNode[]>();
		for (const node of simNodes) {
			const distance = distances.get(node.id) ?? Math.max(2, distances.size);
			const layer = layers.get(distance) ?? [];
			layer.push(node);
			layers.set(distance, layer);
		}

		const centerX = width / 2;
		const centerY = height / 2;
		center.x = center.fx = centerX;
		center.y = center.fy = centerY;
		for (const [distance, nodes] of layers) {
			if (distance === 0) continue;
			const radius = Math.min(width, height) * (distance === 1 ? 0.24 : 0.2 + distance * 0.1);
			nodes.forEach((node, index) => {
				const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
				node.x = node.fx = centerX + Math.cos(angle) * radius;
				node.y = node.fy = centerY + Math.sin(angle) * radius;
			});
		}
		simNodes = [...simNodes];
		simulation.alpha(0.35).restart();
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

	function wrapLabel(name: string, maxLineLen = 14): string[] {
		if (name.length <= maxLineLen) return [name];
		const mid = Math.floor(name.length / 2);
		let splitAt = name.lastIndexOf(' ', mid);
		if (splitAt <= 0) splitAt = name.indexOf(' ', mid);
		if (splitAt <= 0) return [name.length > maxLineLen ? name.slice(0, maxLineLen - 1) + '…' : name];
		const line1 = name.slice(0, splitAt);
		const line2 = name.slice(splitAt + 1);
		return [line1, line2.length > maxLineLen ? line2.slice(0, maxLineLen - 1) + '…' : line2];
	}

	function buildExportSvg(): string {
		const nodes = simNodes.filter((n) => n.x != null && n.y != null);
		if (nodes.length === 0) {
			return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="white"/></svg>';
		}

		const pad = 60;
		const xs = nodes.map((n) => n.x!);
		const ys = nodes.map((n) => n.y!);
		const minX = Math.min(...xs) - pad;
		const minY = Math.min(...ys) - pad;
		const w = Math.max(Math.max(...xs) - minX + pad, 200);
		const h = Math.max(Math.max(...ys) - minY + pad, 200);

		const defs = allTypes
			.map(
				(type) =>
					`<marker id="export-arrow-${type}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${metaFor(type).color}" /></marker>`
			)
			.join('');

		const linksSvg = simLinks
			.map((link) => {
				const endpoints = linkEndpoints(link);
				if (!endpoints) return '';
				const meta = metaFor(link.type);
				const markerEnd =
					meta.directional || link.direction === 'both' ? ` marker-end="url(#export-arrow-${link.type})"` : '';
				const markerStart = link.direction === 'both' ? ` marker-start="url(#export-arrow-${link.type})"` : '';
				const dash = meta.directional ? '' : ' stroke-dasharray="7 5"';
				return `<path d="${endpoints.path}" fill="none" stroke="white" stroke-width="6" /><path d="${endpoints.path}" fill="none" stroke="${meta.color}" stroke-width="2.5"${dash}${markerEnd}${markerStart} />`;
			})
			.join('');

		const nodesSvg = nodes
			.map((n) => {
				const lines = wrapLabel(n.name);
				const lineHeight = 12;
				const startDy = -((lines.length - 1) * lineHeight) / 2;
				const tspans = lines
					.map((line, i) => `<tspan x="0" dy="${i === 0 ? startDy : lineHeight}">${escapeXml(line)}</tspan>`)
					.join('');
				return `<g transform="translate(${n.x} ${n.y})"><circle r="36" fill="white" stroke="#14110f" stroke-width="2" /><text text-anchor="middle" font-size="11" font-weight="700" font-family="Inter, system-ui, sans-serif" fill="#14110f">${tspans}</text></g>`;
			})
			.join('');

		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs><rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="white" />${linksSvg}${nodesSvg}</svg>`;
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

	export function exportSVG(filename = 'concept-map.svg') {
		const svgString = buildExportSvg();
		downloadBlob(new Blob([svgString], { type: 'image/svg+xml' }), filename);
	}

	export async function exportPNG(filename = 'concept-map.png') {
		const svgString = buildExportSvg();
		const svgUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
		try {
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('Could not render the map for export.'));
				img.src = svgUrl;
			});

			const scale = 2; // export at 2x for a crisp, print-friendly image
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
	onpointermove={onBackgroundPointerMove}
	onpointerup={onBackgroundPointerUp}
	onpointercancel={onBackgroundPointerUp}
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

