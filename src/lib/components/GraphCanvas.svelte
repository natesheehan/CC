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
		type: RelationType;
	}

	let {
		concepts,
		relations,
		selectedId = null,
		onSelect,
		onNodeMoved
	}: {
		concepts: ClientConcept[];
		relations: ClientRelation[];
		selectedId?: string | null;
		onSelect: (id: string) => void;
		onNodeMoved: (id: string, x: number, y: number) => void;
	} = $props();

	let container: HTMLDivElement | undefined = $state();
	let width = $state(900);
	let height = $state(620);

	let simNodes: SimNode[] = $state([]);
	let simLinks: SimLink[] = $state([]);

	let pan = $state({ x: 0, y: 0 });
	let zoom = $state(1);

	const nodesById = $derived(new Map(simNodes.map((n) => [n.id, n])));

	function resolveEnd(end: SimLink['source']): SimNode | undefined {
		if (typeof end === 'object') return end as SimNode;
		return nodesById.get(end as string);
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
			.map((r) => ({ id: r.id, type: r.type, source: r.sourceId, target: r.targetId }));
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
	function screenToGraph(clientX: number, clientY: number) {
		if (!container) return { x: 0, y: 0 };
		const rect = container.getBoundingClientRect();
		return {
			x: (clientX - rect.left - pan.x) / zoom,
			y: (clientY - rect.top - pan.y) / zoom
		};
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
		const gx = (sx - pan.x) / zoom;
		const gy = (sy - pan.y) / zoom;
		const next = Math.min(3, Math.max(0.25, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
		pan = { x: sx - gx * next, y: sy - gy * next };
		zoom = next;
	}

	export function resetView() {
		pan = { x: 0, y: 0 };
		zoom = 1;
	}

	export function reArrange() {
		for (const n of simNodes) {
			n.fx = null;
			n.fy = null;
		}
		simulation.alpha(1).restart();
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
			{#each Object.entries(RELATION_META) as [type, meta] (type)}
				{#if meta.directional}
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
				{/if}
			{/each}
		</defs>

		<g transform="translate({pan.x} {pan.y}) scale({zoom})">
			{#each simLinks as link (link.id)}
				{@const s = resolveEnd(link.source)}
				{@const t = resolveEnd(link.target)}
				{#if s && t && s.x != null && s.y != null && t.x != null && t.y != null}
					{@const meta = RELATION_META[link.type]}
					<line
						x1={s.x}
						y1={s.y}
						x2={t.x}
						y2={t.y}
						stroke={meta.color}
						stroke-width="2"
						stroke-opacity="0.75"
						marker-end={meta.directional ? `url(#arrow-${link.type})` : undefined}
					>
						<title>{s.name} — {meta.label.toLowerCase()} — {t.name}</title>
					</line>
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

	<!-- Zoom controls -->
	<div class="absolute bottom-4 right-4 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
		<button
			class="flex h-8 w-8 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
			onclick={() => (zoom = Math.min(3, zoom * 1.2))}
			aria-label="Zoom in">+</button
		>
		<button
			class="flex h-8 w-8 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
			onclick={() => (zoom = Math.max(0.25, zoom * 0.8))}
			aria-label="Zoom out">−</button
		>
		<button
			class="flex h-8 w-8 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
			onclick={resetView}
			aria-label="Reset view">⤾</button
		>
	</div>
</div>
