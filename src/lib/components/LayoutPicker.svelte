<script lang="ts">
	import Icon from './Icon.svelte';
	import { LAYOUTS, computeLayout, type LayoutId, type LayoutInfo, type LayoutLink } from '$lib/shared/layouts';
	import type { ClientConcept } from '$lib/shared/types';

	let {
		concepts,
		centerId = null,
		readOnly = false,
		onPick,
		onClose
	}: {
		concepts: ClientConcept[];
		/** Preselected center (the map's center, or the selected concept). */
		centerId?: string | null;
		/** View-only visitors: layouts only rearrange their own screen. */
		readOnly?: boolean;
		onPick: (id: LayoutId, centerId: string | null) => void;
		onClose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let center = $state<string>(centerId ?? '');
	const sortedConcepts = $derived([...concepts].sort((a, b) => a.name.localeCompare(b.name)));

	// --- previews: each layout run on a small sample graph -------------------
	const SAMPLE_N = 11;
	const sampleNodes = Array.from({ length: SAMPLE_N }, (_, i) => ({ id: `n${i}`, name: String.fromCharCode(65 + ((i * 7) % 26)), x: 0, y: 0 }));
	const sampleLinks: LayoutLink[] = [
		[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 6], [3, 7], [7, 8], [9, 10]
	].map(([a, b]) => ({ source: `n${a}`, target: `n${b}`, directed: true }));

	function seeded(i: number) {
		const v = Math.sin(i * 12.9898) * 43758.5453;
		return v - Math.floor(v);
	}

	function previewFor(layout: LayoutInfo) {
		let pos = computeLayout(layout.id, sampleNodes, sampleLinks, { center: 'n0' });
		if (!pos) {
			// Simulated layouts: show a representative, slightly jittered shape.
			const base = computeLayout(layout.id === 'orbit' ? 'rings' : 'sunflower', sampleNodes, sampleLinks, { center: 'n0' })!;
			pos = new Map([...base].map(([id, p], i) => [id, { x: p.x + (seeded(i) - 0.5) * 90, y: p.y + (seeded(i + 50) - 0.5) * 90 }]));
		}
		const xs = [...pos.values()].map((p) => p.x);
		const ys = [...pos.values()].map((p) => p.y);
		const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
		const W = 72, H = 52, pad = 6;
		const k = Math.min((W - pad * 2) / Math.max(1, maxX - minX), (H - pad * 2) / Math.max(1, maxY - minY));
		const ox = (W - (maxX - minX) * k) / 2;
		const oy = (H - (maxY - minY) * k) / 2;
		const at = (id: string) => {
			const p = pos!.get(id)!;
			return { x: ox + (p.x - minX) * k, y: oy + (p.y - minY) * k };
		};
		return {
			nodes: sampleNodes.map((n) => ({ ...at(n.id), hub: layout.centered && n.id === 'n0' })),
			links: sampleLinks.map((l) => ({ a: at(l.source), b: at(l.target) }))
		};
	}

	const previews = new Map(LAYOUTS.map((l) => [l.id, previewFor(l)]));
	const wholeMap = LAYOUTS.filter((l) => !l.centered);
	const centered = LAYOUTS.filter((l) => l.centered);

	function pick(layout: LayoutInfo) {
		if (layout.centered && !center) return;
		onPick(layout.id, layout.centered ? center : null);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet card(layout: LayoutInfo)}
	{@const pv = previews.get(layout.id)!}
	{@const disabled = layout.centered && !center}
	<button
		type="button"
		onclick={() => pick(layout)}
		{disabled}
		class="layout-card group flex items-start gap-3 rounded-xl p-2.5 text-left"
		title={disabled ? 'Choose a center concept first' : layout.description}
	>
		<svg viewBox="0 0 72 52" class="layout-preview h-[52px] w-[72px] shrink-0 rounded-lg" aria-hidden="true">
			{#each pv.links as l}
				<line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} />
			{/each}
			{#each pv.nodes as n}
				<circle cx={n.x} cy={n.y} r={n.hub ? 4.2 : 2.8} class={n.hub ? 'hub' : ''} />
			{/each}
		</svg>
		<span class="min-w-0">
			<span class="block text-sm font-semibold text-slate-800">{layout.label}</span>
			<span class="block text-xs leading-snug text-slate-500">{layout.description}</span>
		</span>
	</button>
{/snippet}

<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
	<div class="cc-panel flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="layout-title">
		<div class="cc-stripe shrink-0"></div>
		<div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
			<h2 id="layout-title" class="flex items-center gap-2 text-lg font-semibold text-slate-800">
				<Icon name="orbit" /> Arrange the map
			</h2>
			<button onclick={onClose} class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
				<Icon name="x" />
			</button>
		</div>

		<div class="min-h-0 space-y-6 overflow-y-auto px-6 py-5">
			{#if readOnly}
				<p class="rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
					You can view this map but not edit it, so a new layout only changes your own screen.
				</p>
			{:else}
				<p class="text-xs text-slate-500">
					Layouts move every concept for everyone on the map. You can undo straight after.
				</p>
			{/if}

			<section>
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Whole map</h3>
				<div class="mt-2 grid gap-1.5 sm:grid-cols-2">
					{#each wholeMap as layout (layout.id)}
						{@render card(layout)}
					{/each}
				</div>
			</section>

			<section>
				<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Around a center concept</h3>
					<label class="ml-auto flex min-w-0 items-center gap-2 text-sm text-slate-600">
						<Icon name="target" class="h-4 w-4 shrink-0 text-amber-500" />
						<span class="sr-only">Center concept</span>
						<select
							bind:value={center}
							class="min-w-0 max-w-[16rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						>
							<option value="" disabled>Choose a center…</option>
							{#each sortedConcepts as c (c.id)}
								<option value={c.id}>{c.name}</option>
							{/each}
						</select>
					</label>
				</div>
				<div class="mt-2 grid gap-1.5 sm:grid-cols-2">
					{#each centered as layout (layout.id)}
						{@render card(layout)}
					{/each}
				</div>
			</section>
		</div>
	</div>
</div>

<style>
	.layout-card {
		border: 2px solid transparent;
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}
	.layout-card:hover:not(:disabled) {
		border-color: var(--memphis-ink);
		background: #fffaf0;
	}
	.layout-card:focus-visible {
		outline: 2px solid var(--memphis-pink);
		outline-offset: 1px;
	}
	.layout-card:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.layout-preview {
		background: var(--memphis-cream, #fbf7ef);
		border: 1.5px solid rgb(20 17 15 / 0.15);
	}
	.layout-preview line {
		stroke: #94a3b8;
		stroke-width: 1;
	}
	.layout-preview circle {
		fill: var(--memphis-pink, #ff3d81);
	}
	.layout-preview circle.hub {
		fill: var(--memphis-yellow, #ffd23f);
		stroke: var(--memphis-ink, #14110f);
		stroke-width: 1.2;
	}
	:global(.dark) .layout-card:hover:not(:disabled) {
		border-color: #475569;
		background: #1e293b;
	}
	:global(.dark) .layout-preview {
		background: #0f172a;
		border-color: #334155;
	}
	:global(.dark) .layout-preview line {
		stroke: #475569;
	}
</style>
