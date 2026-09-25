<script lang="ts">
	import { enhance } from '$app/forms';
	import { relativeTime } from '$lib/shared/format';
	import PageHero from '$lib/components/PageHero.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let submitting = $state(false);
	let query = $state('');

	type MapRow = PageData['myMaps'][number];

	const allMaps = $derived([...data.myMaps, ...data.otherMaps]);
	const totals = $derived({
		concepts: allMaps.reduce((n, m) => n + m.conceptCount, 0),
		links: allMaps.reduce((n, m) => n + m.relationCount, 0)
	});

	function matches(map: MapRow) {
		const q = query.trim().toLowerCase();
		return !q || map.name.toLowerCase().includes(q) || (map.description ?? '').toLowerCase().includes(q);
	}
	const myFiltered = $derived(data.myMaps.filter(matches));
	const otherFiltered = $derived(data.otherMaps.filter(matches));

	// A small, deterministic "constellation" per map — seeded by its id and
	// sized by its real concept/link counts — so each card has its own shape.
	const PALETTE = ['#ff3d81', '#ffd23f', '#00c2d1', '#7c3aed', '#10b981'];
	function constellation(id: string, concepts: number, links: number) {
		let seed = 0;
		for (const ch of id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
		const rand = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = seed;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const n = Math.min(Math.max(concepts, 0), 9);
		const nodes = Array.from({ length: n }, (_, i) => ({
			x: 24 + ((i + rand() * 0.8) / Math.max(n, 1)) * 232,
			y: 20 + rand() * 60,
			r: i === 0 ? 8 : 4.5 + rand() * 3,
			color: PALETTE[i % PALETTE.length]
		}));
		// Put the biggest ("hub") node near the middle.
		if (n > 2) [nodes[0], nodes[Math.floor(n / 2)]] = [nodes[Math.floor(n / 2)], nodes[0]];
		const edges: { a: number; b: number; dashed: boolean }[] = [];
		const edgeCount = Math.min(links, n * 2);
		for (let i = 1; i < n && edges.length < edgeCount; i++) {
			edges.push({ a: i, b: Math.floor(rand() * i), dashed: rand() < 0.25 });
		}
		while (edges.length < edgeCount && n > 2) {
			const a = Math.floor(rand() * n);
			const b = Math.floor(rand() * n);
			if (a !== b) edges.push({ a, b, dashed: rand() < 0.25 });
		}
		return { nodes, edges };
	}

	function initials(name: string | null | undefined) {
		return (name ?? '?')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]!.toUpperCase())
			.join('');
	}
</script>

<svelte:head>
	<title>Your maps · Concept Cartography</title>
</svelte:head>

<div class="flex-1">
	<PageHero
		eyebrow="Your atlas"
		title="Concept maps"
		description="Build networks of ideas, define how they relate, and keep the whole picture in view."
	>
		{#snippet actions()}
			<button onclick={() => (showCreate = true)} class="cc-btn cc-btn-primary">
				<Icon name="plus" /> New map
			</button>
		{/snippet}
		<div class="flex flex-wrap gap-3">
			<div class="cc-stat">
				<div>
					<p class="cc-stat-value">{allMaps.length}</p>
					<p class="cc-stat-label">maps</p>
				</div>
			</div>
			<div class="cc-stat">
				<div>
					<p class="cc-stat-value">{data.myMaps.length}</p>
					<p class="cc-stat-label">made by you</p>
				</div>
			</div>
			<div class="cc-stat">
				<span class="cc-dot" style="--dot: var(--memphis-pink)"></span>
				<div>
					<p class="cc-stat-value">{totals.concepts}</p>
					<p class="cc-stat-label">concepts</p>
				</div>
			</div>
			<div class="cc-stat">
				<span class="cc-dot" style="--dot: var(--memphis-cyan)"></span>
				<div>
					<p class="cc-stat-value">{totals.links}</p>
					<p class="cc-stat-label">links</p>
				</div>
			</div>
		</div>
	</PageHero>

	<div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-12">
		{#if allMaps.length === 0}
			<div class="cc-card flex flex-col items-center justify-center !border-dashed px-6 py-20 text-center">
				<p class="cc-display text-2xl text-slate-900">No maps yet</p>
				<p class="cc-muted mt-2 text-sm">Create the first one and start connecting ideas.</p>
				<button onclick={() => (showCreate = true)} class="cc-btn cc-btn-primary mt-6">
					<Icon name="plus" /> Create a map
				</button>
			</div>
		{:else}
			<label class="relative block max-w-md">
				<span class="sr-only">Filter maps</span>
				<input bind:value={query} placeholder="Filter maps by name or description…" class="cc-input !py-2.5 !pl-10" />
				<span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></span>
			</label>

			{@render section('Your maps', myFiltered, data.myMaps.length === 0
				? "You haven't created a map yet — start one, or explore the maps below."
				: `No maps of yours match "${query}".`)}
			{@render section('Other maps', otherFiltered, data.otherMaps.length === 0
				? 'No other maps have been created yet.'
				: `No other maps match "${query}".`)}
		{/if}
	</div>
</div>

{#snippet section(title: string, maps: MapRow[], emptyText: string)}
	<section class="mt-10">
		<div class="flex items-center gap-3">
			<h2 class="cc-display text-xl text-slate-900">{title}</h2>
			<span class="cc-chip">{maps.length}</span>
			<div class="h-0.5 flex-1 rounded bg-slate-200"></div>
		</div>
		{#if maps.length === 0}
			<p class="cc-muted mt-4 text-sm">{emptyText}</p>
		{:else}
			<div class="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each maps as map, i (map.id)}
					{@const shape = constellation(map.id, map.conceptCount, map.relationCount)}
					<a
						href="/maps/{map.id}"
						class="cc-card cc-card-link cc-rise group flex flex-col overflow-hidden"
						style="--delay: {Math.min(i, 8) * 50}ms"
					>
						<div class="map-card-preview relative h-28">
							<svg viewBox="0 0 280 100" class="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
								{#each shape.edges as e}
									<line
										x1={shape.nodes[e.a].x}
										y1={shape.nodes[e.a].y}
										x2={shape.nodes[e.b].x}
										y2={shape.nodes[e.b].y}
										class="map-card-edge"
										stroke-dasharray={e.dashed ? '5 4' : undefined}
									/>
								{/each}
								{#each shape.nodes as node}
									<circle cx={node.x + 2} cy={node.y + 2} r={node.r} class="map-card-shadow" />
									<circle cx={node.x} cy={node.y} r={node.r} fill={node.color} class="map-card-node" />
								{/each}
								{#if shape.nodes.length === 0}
									<circle cx="140" cy="50" r="18" class="map-card-empty" />
									<text x="140" y="55" text-anchor="middle" class="map-card-empty-text">+</text>
								{/if}
							</svg>
							<span class="cc-chip absolute right-3 top-3 !py-0.5 !text-[10px]">{relativeTime(map.updatedAt)}</span>
						</div>
						<div class="flex flex-1 flex-col p-5">
							<h3 class="cc-display text-lg leading-snug text-slate-900 group-hover:text-memphis-pinkDeep">{map.name}</h3>
							{#if map.description}
								<p class="cc-muted mt-1.5 line-clamp-2 text-sm">{map.description}</p>
							{:else}
								<p class="mt-1.5 text-sm italic text-slate-400">No description yet.</p>
							{/if}
							<div class="mt-auto flex items-center gap-4 pt-5 text-sm font-semibold text-slate-700">
								<span class="flex items-center gap-1.5"><span class="cc-dot" style="--dot: var(--memphis-pink)"></span>{map.conceptCount}</span>
								<span class="flex items-center gap-1.5"><span class="cc-dot" style="--dot: var(--memphis-cyan)"></span>{map.relationCount}</span>
								<span class="flex items-center gap-1.5"><Icon name="users" class="h-4 w-4 text-slate-400" />{map.contributorCount}</span>
								<span class="ml-auto flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-500">
									<span class="cc-avatar !h-6 !w-6 !text-[9px]">{initials(map.createdByName)}</span>
									<span class="truncate">{map.createdByName ?? 'unknown'}</span>
								</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>
{/snippet}

{#if showCreate}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
		<div class="cc-panel w-full max-w-md overflow-hidden">
			<div class="cc-stripe"></div>
			<div class="p-6">
				<p class="cc-eyebrow">Start mapping</p>
				<h2 class="mt-1 text-2xl text-slate-900">New concept map</h2>
				<form
					method="POST"
					action="?/createMap"
					class="mt-5 space-y-4"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
				>
					<div>
						<label for="map-name" class="mb-1.5 block text-sm font-bold text-slate-700">Name</label>
						<input id="map-name" name="name" required minlength="2" maxlength="120" placeholder="e.g. Cellular Respiration" />
					</div>
					<div>
						<label for="map-description" class="mb-1.5 block text-sm font-bold text-slate-700">Description</label>
						<textarea id="map-description" name="description" rows="3" placeholder="What is this map exploring?"></textarea>
					</div>

					{#if form?.error}
						<p class="text-sm text-red-600">{form.error}</p>
					{/if}

					<div class="flex justify-end gap-3 pt-2">
						<button type="button" onclick={() => (showCreate = false)} class="cc-btn cc-btn-plain">Cancel</button>
						<button type="submit" disabled={submitting} class="cc-btn cc-btn-primary">
							{submitting ? 'Creating…' : 'Create map'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<style>
	.map-card-preview {
		border-bottom: 2px solid var(--memphis-ink);
		background-color: var(--memphis-cream);
		background-image: radial-gradient(rgb(20 17 15 / 0.1) 1.1px, transparent 1.1px);
		background-size: 12px 12px;
	}
	.map-card-edge {
		stroke: var(--memphis-ink);
		stroke-width: 2;
		stroke-linecap: round;
		opacity: 0.55;
	}
	.map-card-shadow {
		fill: var(--memphis-ink);
	}
	.map-card-node {
		stroke: var(--memphis-ink);
		stroke-width: 2;
		transform-box: fill-box;
		transform-origin: center;
		transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	:global(.group:hover) .map-card-node {
		transform: scale(1.2);
	}
	.map-card-empty {
		fill: none;
		stroke: #94a3b8;
		stroke-width: 2;
		stroke-dasharray: 5 4;
	}
	.map-card-empty-text {
		fill: #94a3b8;
		font-size: 16px;
		font-weight: 700;
	}

	:global(.dark) .map-card-preview {
		border-color: #475569;
		background-color: #0f172a;
		background-image: radial-gradient(rgb(255 255 255 / 0.07) 1.1px, transparent 1.1px);
	}
	:global(.dark) .map-card-edge {
		stroke: #cbd5e1;
		opacity: 0.45;
	}
	:global(.dark) .map-card-shadow {
		fill: #000;
		opacity: 0.6;
	}
	:global(.dark) .map-card-node {
		stroke: #0f172a;
	}
</style>
