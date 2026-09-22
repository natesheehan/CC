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
		onSelect,
		onSelectRelation,
		onNodeMoved
	}: {
		concepts: ClientConcept[];
		relations: ClientRelation[];
		selectedId?: string | null;
		selectedRelationId?: string | null;
		relationMeta?: Record<string, { label: string; phrase: string; color: string; directional: boolean }>;
		onSelect: (id: string) => void;
		onSelectRelation?: (id: string) => void;
		onNodeMoved: (id: string, x: number, y: number) => void;
	} = $props();

	function metaFor(type: string) {
		return relationMeta[type] ?? { label: type, phrase: type, color: '#64748b', directional: true };
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

	function onBackgroundPointerDown(e: PointerEvent) {
		panning = true;
		panStart = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onBackgroundPointerMove(e: PointerEvent) {
		if (!panning) return;
		pan = {
			x: panStart.panX + (e.clientX - panStart.x),
			y: panStart.panY + (e.clientY - panStart.y)
		};
	}

	function onBackgroundPointerUp() {
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
				const markerEnd = ` marker-end="url(#export-arrow-${link.type})"`;
				const markerStart = link.direction === 'both' ? ` marker-start="url(#export-arrow-${link.type})"` : '';
				return `<path d="${endpoints.path}" fill="none" stroke="${meta.color}" stroke-width="2" stroke-opacity="0.8"${markerEnd}${markerStart} />`;
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
				return `<g transform="translate(${n.x} ${n.y})"><circle r="36" fill="white" stroke="#cbd5e1" stroke-width="1.5" /><text text-anchor="middle" font-size="11" font-family="Inter, system-ui, sans-serif" fill="#334155">${tspans}</text></g>`;
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
	class="relative h-full w-full touch-none overflow-hidden bg-[radial-gradient(circle,theme(colors.slate.200)_1px,transparent_1px)] bg-[length:22px_22px]"
	onpointerdown={onBackgroundPointerDown}
	onpointermove={onBackgroundPointerMove}
	onpointerup={onBackgroundPointerUp}
	onpointercancel={onBackgroundPointerUp}
	onwheel={onWheel}
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
					markerWidth="7"
					markerHeight="7"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" fill={meta.color} />
				</marker>
			{/each}
		</defs>

		<g transform="translate({pan.x} {pan.y}) rotate({rotation}) scale({zoom})">
			{#each simLinks as link (link.id)}
				{@const endpoints = linkEndpoints(link)}
				{#if endpoints}
					{@const meta = metaFor(link.type)}
					<g
						role="button"
						tabindex="0"
						class="cursor-pointer"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={(e) => {
							e.stopPropagation();
							onSelectRelation?.(link.id);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') onSelectRelation?.(link.id);
						}}
					>
						<!-- Wide, invisible hit-area so thin lines are still easy to click. -->
						<path d={endpoints.path} fill="none" stroke="transparent" stroke-width="14" />
						<path
							d={endpoints.path}
							fill="none"
							stroke={meta.color}
							stroke-width={selectedRelationId === link.id ? 3.5 : 2}
							stroke-opacity={selectedRelationId === link.id ? 1 : 0.75}
							marker-end="url(#arrow-{link.type})"
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
					<g
						transform="translate({node.x} {node.y})"
						class="cursor-grab active:cursor-grabbing"
						onpointerdown={(e) => onNodePointerDown(e, node)}
						onpointermove={(e) => onNodePointerMove(e, node)}
						onpointerup={(e) => onNodePointerUp(e, node)}
						onpointercancel={(e) => onNodePointerUp(e, node)}
						role="button"
						tabindex="0"
						onkeydown={(e) => {
							if (e.key === 'Enter') onSelect(node.id);
						}}
					>
						<circle
							r={selectedId === node.id ? 40 : 36}
							fill="white"
							stroke={selectedId === node.id ? '#2563eb' : '#cbd5e1'}
							stroke-width={selectedId === node.id ? 3 : 1.5}
							class="drop-shadow-sm transition-[r,stroke]"
						/>
						<foreignObject x="-34" y="-34" width="68" height="68" class="pointer-events-none">
							<div
								class="flex h-full w-full items-center justify-center px-1 text-center text-[10px] font-medium leading-tight text-slate-700"
							>
								{node.name}
							</div>
						</foreignObject>
						<title>{node.name}</title>
					</g>
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
		class="absolute bottom-4 right-4 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
		role="toolbar"
		aria-label="Map view controls"
		tabindex="-1"
		onpointerdown={(e) => e.stopPropagation()}
	>
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center rounded text-lg text-slate-600 hover:bg-slate-100"
			onclick={() => (zoom = Math.min(3, zoom * 1.2))}
			aria-label="Zoom in">+</button
		>
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center rounded text-lg text-slate-600 hover:bg-slate-100"
			onclick={() => (zoom = Math.max(0.25, zoom * 0.8))}
			aria-label="Zoom out">−</button
		>
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center rounded text-lg text-slate-600 hover:bg-slate-100"
			onclick={rotateView}
			aria-label="Rotate view 90°">⟳</button
		>
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center rounded text-lg text-slate-600 hover:bg-slate-100"
			onclick={resetView}
			aria-label="Reset view">⤾</button
		>
	</div>

	<!-- Minimap: overview of every node's position with a polygon showing the
	     current viewport (accurate even when rotated), click to jump there. -->
	{#if graphBounds && simNodes.length > 1}
		<div
			class="absolute bottom-4 left-4 overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-sm"
			style="width: {MINIMAP_WIDTH}px; height: {MINIMAP_HEIGHT}px"
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
							fill="#94a3b8"
						/>
					{/if}
				{/each}
				{#if viewportPolygon}
					<polygon
						points={viewportPolygon}
						fill="#2563eb"
						fill-opacity="0.12"
						stroke="#2563eb"
						stroke-width={Math.max(1, Math.min(graphBounds.w, graphBounds.h) / 200)}
					/>
				{/if}
			</svg>
		</div>
	{/if}
</div>