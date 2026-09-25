<script lang="ts">
	import { onMount } from 'svelte';
	import { RELATION_META, type RelationType } from '$lib/shared/relations';

	// A small concept map that draws itself one relationship at a time, using
	// the same visual language as the real map canvas (ink-outlined nodes,
	// relation-coloured links, arrows for direction, dashes for mutual links).
	// It cycles through a few academic subjects.

	type TopicNode = { id: string; label: string; x: number; y: number; central?: boolean };
	type TopicEdge = { from: string; to: string; type: RelationType };
	type Topic = { subject: string; title: string; nodes: TopicNode[]; edges: TopicEdge[] };

	const TOPICS: Topic[] = [
		{
			subject: 'Biology',
			title: 'Photosynthesis',
			nodes: [
				{ id: 'p', label: 'Photosynthesis', x: 280, y: 200, central: true },
				{ id: 'l', label: 'Light energy', x: 95, y: 95 },
				{ id: 'c', label: 'Chlorophyll', x: 105, y: 300 },
				{ id: 'k', label: 'Chloroplast', x: 250, y: 355 },
				{ id: 'g', label: 'Glucose', x: 465, y: 95 },
				{ id: 'o', label: 'Oxygen', x: 470, y: 290 }
			],
			edges: [
				{ from: 'p', to: 'l', type: 'depends_on' },
				{ from: 'p', to: 'g', type: 'produces' },
				{ from: 'p', to: 'o', type: 'produces' },
				{ from: 'p', to: 'c', type: 'depends_on' },
				{ from: 'c', to: 'k', type: 'part_of' }
			]
		},
		{
			subject: 'Education',
			title: 'Cognitive load',
			nodes: [
				{ id: 'cl', label: 'Cognitive load', x: 280, y: 190, central: true },
				{ id: 'wm', label: 'Working memory', x: 95, y: 90 },
				{ id: 'il', label: 'Intrinsic load', x: 110, y: 305 },
				{ id: 'el', label: 'Extraneous load', x: 440, y: 310 },
				{ id: 'we', label: 'Worked examples', x: 470, y: 95 },
				{ id: 'sc', label: 'Schema building', x: 275, y: 365 }
			],
			edges: [
				{ from: 'cl', to: 'wm', type: 'depends_on' },
				{ from: 'il', to: 'cl', type: 'type_of' },
				{ from: 'el', to: 'cl', type: 'type_of' },
				{ from: 'we', to: 'el', type: 'counteracts' },
				{ from: 'sc', to: 'il', type: 'counteracts' }
			]
		},
		{
			subject: 'Philosophy',
			title: 'Knowledge',
			nodes: [
				{ id: 'k', label: 'Knowledge', x: 280, y: 195, central: true },
				{ id: 'b', label: 'Belief', x: 100, y: 95 },
				{ id: 't', label: 'Truth', x: 95, y: 300 },
				{ id: 'j', label: 'Justification', x: 460, y: 100 },
				{ id: 'o', label: 'Opinion', x: 470, y: 305 },
				{ id: 'g', label: 'Gettier problem', x: 300, y: 370 }
			],
			edges: [
				{ from: 'b', to: 'k', type: 'part_of' },
				{ from: 'j', to: 'k', type: 'part_of' },
				{ from: 't', to: 'k', type: 'part_of' },
				{ from: 'o', to: 'k', type: 'distinct_from' },
				{ from: 'g', to: 'j', type: 'counteracts' }
			]
		}
	];

	const NODE_R = 38;
	const CENTRAL_R = 46;
	const STEP_MS = 850;
	const HOLD_MS = 4200;

	let topicIndex = $state(0);
	let step = $state(0);
	let fading = $state(false);
	let reduceMotion = $state(false);

	const topic = $derived(TOPICS[topicIndex]);
	const nodeById = $derived(new Map(topic.nodes.map((n) => [n.id, n])));

	// Build-up order: the central concept, then for each link, whichever end
	// isn't on the map yet, followed by the link itself.
	type Beat = { kind: 'node'; id: string } | { kind: 'edge'; index: number };
	const beats = $derived.by((): Beat[] => {
		const shown = new Set<string>();
		const out: Beat[] = [];
		const central = topic.nodes.find((n) => n.central)!;
		out.push({ kind: 'node', id: central.id });
		shown.add(central.id);
		topic.edges.forEach((e, index) => {
			for (const id of [e.from, e.to]) {
				if (!shown.has(id)) {
					out.push({ kind: 'node', id });
					shown.add(id);
				}
			}
			out.push({ kind: 'edge', index });
		});
		return out;
	});

	const visibleNodes = $derived(
		new Set(beats.slice(0, step).flatMap((b) => (b.kind === 'node' ? [b.id] : [])))
	);
	const visibleEdges = $derived(
		new Set(beats.slice(0, step).flatMap((b) => (b.kind === 'edge' ? [b.index] : [])))
	);
	const latestEdge = $derived.by(() => {
		for (let i = Math.min(step, beats.length) - 1; i >= 0; i--) {
			const b = beats[i];
			if (b.kind === 'edge') return b.index;
		}
		return -1;
	});

	function edgeGeometry(e: TopicEdge) {
		const a = nodeById.get(e.from)!;
		const b = nodeById.get(e.to)!;
		const ra = a.central ? CENTRAL_R : NODE_R;
		const rb = b.central ? CENTRAL_R : NODE_R;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const ux = dx / len;
		const uy = dy / len;
		const x1 = a.x + ux * (ra + 4);
		const y1 = a.y + uy * (ra + 4);
		const x2 = b.x - ux * (rb + 6);
		const y2 = b.y - uy * (rb + 6);
		return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
	}

	function lines(label: string): string[] {
		const words = label.split(' ');
		if (words.length === 1) return [label];
		const mid = Math.ceil(words.length / 2);
		return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
	}

	function sentence(e: TopicEdge) {
		const a = nodeById.get(e.from)!.label;
		const b = nodeById.get(e.to)!.label;
		return { a, phrase: RELATION_META[e.type].phrase, b: b.charAt(0).toLowerCase() + b.slice(1) };
	}

	const typesInTopic = $derived([...new Set(topic.edges.map((e) => e.type))]);

	let timer: ReturnType<typeof setTimeout> | undefined;

	function schedule() {
		clearTimeout(timer);
		if (reduceMotion) return;
		if (step < beats.length) {
			timer = setTimeout(() => {
				step++;
				schedule();
			}, step === 0 ? 400 : STEP_MS);
		} else {
			timer = setTimeout(() => {
				fading = true;
				timer = setTimeout(() => showTopic((topicIndex + 1) % TOPICS.length), 500);
			}, HOLD_MS);
		}
	}

	function showTopic(i: number) {
		topicIndex = i;
		fading = false;
		step = reduceMotion ? Infinity : 0;
		schedule();
	}

	onMount(() => {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		showTopic(0);
		return () => clearTimeout(timer);
	});
</script>

<div class="hero-map cc-card flex flex-col overflow-hidden">
	<!-- Canvas-style toolbar: subject tabs -->
	<div class="hero-map-bar flex items-center gap-2 px-3 py-2.5">
		<span class="flex gap-1" aria-hidden="true">
			<span class="cc-dot !h-2.5 !w-2.5" style="--dot: var(--memphis-pink)"></span>
			<span class="cc-dot !h-2.5 !w-2.5" style="--dot: var(--memphis-yellow)"></span>
			<span class="cc-dot !h-2.5 !w-2.5" style="--dot: var(--memphis-cyan)"></span>
		</span>
		<div class="ml-auto flex flex-wrap justify-end gap-1.5" role="tablist" aria-label="Example subjects">
			{#each TOPICS as t, i (t.title)}
				<button
					type="button"
					role="tab"
					aria-selected={i === topicIndex}
					class="hero-map-tab"
					onclick={() => showTopic(i)}
				>
					{t.subject}
				</button>
			{/each}
		</div>
	</div>

	<div class="hero-map-canvas relative">
		<svg
			viewBox="0 0 560 430"
			class="block h-auto w-full transition-opacity duration-500 {fading ? 'opacity-0' : 'opacity-100'}"
			role="img"
			aria-label="Example concept map: {topic.title}"
		>
			{#key topicIndex}
				{#each topic.edges as e, i}
					{#if visibleEdges.has(i)}
						{@const g = edgeGeometry(e)}
						{@const meta = RELATION_META[e.type]}
						<g class="hero-edge {i === latestEdge ? 'latest' : ''}" style="--edge: {meta.color}">
							<line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} class="hero-edge-halo" />
							<line
								x1={g.x1}
								y1={g.y1}
								x2={g.x2}
								y2={g.y2}
								pathLength="1"
								class="hero-edge-line {meta.directional ? 'draw' : 'mutual'}"
							/>
							{#if meta.directional}
								<path
									d="M -9 -6 L 2 0 L -9 6 Z"
									transform="translate({g.x2} {g.y2}) rotate({g.angle})"
									class="hero-edge-arrow"
								/>
							{/if}
							<g transform="translate({g.mx} {g.my})" class="hero-edge-label">
								<rect
									x={-(meta.phrase.length * 3.3 + 9)}
									y="-10"
									width={meta.phrase.length * 6.6 + 18}
									height="20"
									rx="10"
								/>
								<text y="4" text-anchor="middle">{meta.phrase}</text>
							</g>
						</g>
					{/if}
				{/each}

				{#each topic.nodes as n (n.id)}
					{#if visibleNodes.has(n.id)}
						{@const r = n.central ? CENTRAL_R : NODE_R}
						{@const ls = lines(n.label)}
						<g transform="translate({n.x} {n.y})">
							<g class="hero-node {n.central ? 'central' : ''}">
								<circle r={r} />
								<text text-anchor="middle" y={ls.length === 1 ? 4 : -3}>
									{#each ls as line, li}
										<tspan x="0" dy={li === 0 ? 0 : 14}>{line}</tspan>
									{/each}
								</text>
							</g>
						</g>
					{/if}
				{/each}
			{/key}
		</svg>
	</div>

	<!-- The newest link, read aloud as a sentence -->
	<div class="hero-map-caption flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5" aria-live="polite">
		{#if latestEdge >= 0}
			{@const e = topic.edges[latestEdge]}
			{@const s = sentence(e)}
			{#key `${topicIndex}-${latestEdge}`}
				<p class="hero-caption-text text-sm text-slate-700">
					<strong class="text-slate-900">{s.a}</strong>
					<span class="hero-caption-phrase" style="--edge: {RELATION_META[e.type].color}">{s.phrase}</span>
					<strong class="text-slate-900">{s.b}</strong>.
				</p>
			{/key}
		{:else}
			<p class="text-sm text-slate-400">Mapping <strong class="text-slate-600">{topic.title}</strong>…</p>
		{/if}
		<div class="ml-auto hidden shrink-0 items-center gap-2.5 sm:flex" aria-hidden="true">
			{#each typesInTopic as t (t)}
				<span class="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
					<svg viewBox="0 0 18 6" class="h-1.5 w-4"><line x1="1" y1="3" x2="17" y2="3" class="hero-legend-line {RELATION_META[t].directional ? '' : 'mutual'}" style="--edge: {RELATION_META[t].color}" /></svg>
					{RELATION_META[t].label}
				</span>
			{/each}
		</div>
	</div>
</div>

<style>
	.hero-map {
		--canvas-bg: #ffffff;
		--node-fill: #ffffff;
		--node-stroke: #14110f;
		--node-text: #14110f;
		--node-shadow: #14110f;
		--edge-mix: black;
		--edge-mix-amount: 18%;
		box-shadow: 6px 6px 0 var(--memphis-ink);
	}
	:global(.dark) .hero-map {
		--canvas-bg: #111827;
		--node-fill: #1e293b;
		--node-stroke: #e2e8f0;
		--node-text: #f8fafc;
		--node-shadow: rgb(0 194 209 / 0.85);
		--edge-mix: white;
		--edge-mix-amount: 35%;
		box-shadow: 6px 6px 0 var(--memphis-cyan);
	}

	.hero-map-bar {
		border-bottom: 2px solid var(--memphis-ink);
	}
	.hero-map-caption {
		border-top: 2px solid var(--memphis-ink);
	}
	:global(.dark) .hero-map-bar,
	:global(.dark) .hero-map-caption {
		border-color: #475569;
	}
	.hero-map-canvas {
		background-color: var(--canvas-bg);
		background-image: radial-gradient(rgb(20 17 15 / 0.12) 1px, transparent 1px);
		background-size: 20px 20px;
	}
	:global(.dark) .hero-map-canvas {
		background-image: radial-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px);
	}

	.hero-map-tab {
		border: 1.5px solid transparent;
		border-radius: 9999px;
		padding: 0.15rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #64748b;
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}
	.hero-map-tab:hover {
		border-color: var(--memphis-ink);
	}
	.hero-map-tab[aria-selected='true'] {
		border-color: var(--memphis-ink);
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
	}
	:global(.dark) .hero-map-tab {
		color: #94a3b8;
	}
	:global(.dark) .hero-map-tab[aria-selected='true'] {
		border-color: var(--memphis-yellow);
		background: rgb(255 210 63 / 0.15);
		color: #fde68a;
	}

	/* Nodes */
	.hero-node {
		transform-box: fill-box;
		transform-origin: center;
		animation: hero-node-in 450ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
	}
	.hero-node circle {
		fill: var(--node-fill);
		stroke: var(--node-stroke);
		stroke-width: 2;
		filter: drop-shadow(3px 3px 0 var(--node-shadow));
	}
	.hero-node.central circle {
		fill: #fff7e0;
		stroke: #f59e0b;
		stroke-width: 4;
	}
	:global(.dark) .hero-node.central circle {
		fill: #3b2a12;
		stroke: #fbbf24;
	}
	.hero-node text {
		fill: var(--node-text);
		font-size: 12px;
		font-weight: 700;
		font-family: Inter, system-ui, sans-serif;
	}

	/* Links */
	.hero-edge {
		--edge-color: color-mix(in oklab, var(--edge), var(--edge-mix) var(--edge-mix-amount));
	}
	.hero-edge-halo {
		stroke: var(--canvas-bg);
		stroke-width: 7;
	}
	.hero-edge-line {
		stroke: var(--edge-color);
		stroke-width: 2.5;
		stroke-linecap: round;
		transition: stroke-width 300ms ease;
	}
	.hero-edge-line.draw {
		stroke-dasharray: 1;
		animation: hero-draw 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.hero-edge-line.mutual {
		stroke-dasharray: 0.03 0.022;
		animation: hero-fade 600ms ease both;
	}
	.hero-edge.latest .hero-edge-line {
		stroke-width: 3.5;
	}
	.hero-edge-arrow {
		fill: var(--edge-color);
		animation: hero-fade 200ms 450ms ease both;
	}
	.hero-edge-label {
		animation: hero-fade 300ms 450ms ease both;
	}
	.hero-edge-label rect {
		fill: var(--canvas-bg);
		stroke: var(--edge-color);
		stroke-width: 1.5;
	}
	.hero-edge-label text {
		fill: var(--node-text);
		font-size: 10.5px;
		font-weight: 700;
		font-family: Inter, system-ui, sans-serif;
	}

	.hero-caption-text {
		animation: hero-caption-in 350ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.hero-caption-phrase {
		margin: 0 0.15rem;
		border-bottom: 3px solid var(--edge);
		font-weight: 600;
	}
	.hero-legend-line {
		stroke: var(--edge);
		stroke-width: 3;
		stroke-linecap: round;
	}
	.hero-legend-line.mutual {
		stroke-dasharray: 3 3;
	}

	@keyframes hero-node-in {
		from {
			opacity: 0;
			transform: scale(0.4);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	@keyframes hero-draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes hero-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes hero-caption-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
</style>
