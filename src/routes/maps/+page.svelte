<script lang="ts">
	import { enhance } from '$app/forms';
	import { relativeTime } from '$lib/shared/format';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let submitting = $state(false);

	function previewPosition(index: number, total: number, x: number | null, y: number | null) {
		if (x != null && y != null) {
			return { x: 24 + ((x + 500) / 1000) * 272, y: 22 + ((y + 350) / 700) * 106 };
		}
		const columns = Math.max(1, Math.ceil(Math.sqrt(total * 1.6)));
		const rows = Math.max(1, Math.ceil(total / columns));
		return {
			x: 28 + (index % columns) * (264 / Math.max(1, columns - 1)),
			y: 24 + Math.floor(index / columns) * (100 / Math.max(1, rows - 1))
		};
	}
</script>

<svelte:head>
	<title>Your maps · Concept Cartography</title>
</svelte:head>


<div class="maps-directory mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
	<div class="maps-intro flex flex-wrap items-end justify-between gap-6">
		<div>
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Your atlas</p>
			<h1 class="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Concept maps</h1>
			<p class="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
				Build networks of ideas, define how they relate, and keep the whole picture in view.
			</p>
			<div class="mt-5 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
				<span class="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">{data.myMaps.length + data.otherMaps.length} maps</span>
				<span class="rounded-full bg-slate-100 px-3 py-1.5">{data.myMaps.length} created by you</span>
			</div>
		</div>
		<button
			onclick={() => (showCreate = true)}
			class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700"
		>
			<span class="text-lg leading-none">+</span> New map
		</button>
	</div>

	{#if data.myMaps.length === 0 && data.otherMaps.length === 0}
		<div class="mt-16 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
			<p class="text-slate-500">No maps yet. Create the first one to get started.</p>
			<button
				onclick={() => (showCreate = true)}
				class="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>
				Create a map
			</button>
		</div>
	{:else}
		<section class="mt-12">
			<h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
				Your maps ({data.myMaps.length})
			</h2>
			{#if data.myMaps.length === 0}
				<p class="mt-3 text-sm text-slate-400">
					You haven't created a map yet — start one, or explore the maps below.
				</p>
			{:else}
				{@render mapGrid(data.myMaps)}
			{/if}
		</section>

		<section class="mt-14">
			<h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
				Other maps ({data.otherMaps.length})
			</h2>
			{#if data.otherMaps.length === 0}
				<p class="mt-3 text-sm text-slate-400">No other maps have been created yet.</p>
			{:else}
				{@render mapGrid(data.otherMaps)}
			{/if}
		</section>
	{/if}
</div>

{#snippet mapGrid(maps: PageData['myMaps'])}
	<div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each maps as map (map.id)}
			{@const preview = data.previews[map.id]}
			<a
				href="/maps/{map.id}"
				class="map-directory-card group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition"
			>
				<div class="map-preview relative h-40 overflow-hidden bg-slate-900">
					<div class="map-preview-grid absolute inset-0" aria-hidden="true"></div>
					{#if preview}
						<svg viewBox="0 0 320 150" class="relative h-full w-full" aria-label="Preview of {map.name}" role="img">
							{#each preview.relations as relation (relation.sourceId + relation.targetId)}
								{@const sourceIndex = preview.concepts.findIndex((concept) => concept.id === relation.sourceId)}
								{@const targetIndex = preview.concepts.findIndex((concept) => concept.id === relation.targetId)}
								{#if sourceIndex >= 0 && targetIndex >= 0}
									{@const source = previewPosition(sourceIndex, preview.concepts.length, preview.concepts[sourceIndex].x, preview.concepts[sourceIndex].y)}
									{@const target = previewPosition(targetIndex, preview.concepts.length, preview.concepts[targetIndex].x, preview.concepts[targetIndex].y)}
									<line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#60a5fa" stroke-opacity="0.42" stroke-width="1.2" />
								{/if}
							{/each}
							{#each preview.concepts as concept, index (concept.id)}
								{@const position = previewPosition(index, preview.concepts.length, concept.x, concept.y)}
								<g transform="translate({position.x} {position.y})">
									<circle r="5" fill="#1e3a8a" stroke="#93c5fd" stroke-width="1.2" />
									<text y="-8" text-anchor="middle" fill="#dbeafe" font-size="6" font-weight="600">{concept.name.slice(0, 18)}</text>
								</g>
							{/each}
						</svg>
					{:else}
						<div class="flex h-full items-center justify-center text-xs text-blue-200">Empty map</div>
					{/if}
					<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent px-4 pb-3 pt-8">
						<span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-200">Map preview</span>
					</div>
				</div>
				<div class="flex flex-1 flex-col p-5">
					<h3 class="font-semibold text-slate-800 group-hover:text-blue-600">{map.name}</h3>
					{#if map.description}
						<p class="mt-1 line-clamp-2 text-sm text-slate-500">{map.description}</p>
					{:else}
						<p class="mt-1 text-sm italic text-slate-400">No description yet.</p>
					{/if}
					<div class="mt-5 grid grid-cols-3 gap-2 text-center">
						<div class="rounded-lg bg-slate-50 px-2 py-2"><p class="font-semibold text-slate-800">{map.conceptCount}</p><p class="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">concepts</p></div>
						<div class="rounded-lg bg-slate-50 px-2 py-2"><p class="font-semibold text-slate-800">{map.relationCount}</p><p class="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">links</p></div>
						<div class="rounded-lg bg-slate-50 px-2 py-2"><p class="font-semibold text-slate-800">{map.contributorCount}</p><p class="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">people</p></div>
					</div>
					<div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
						<span>by {map.createdByName ?? 'unknown'}</span>
						<span>updated {relativeTime(map.updatedAt)}</span>
					</div>
				</div>
			</a>
		{/each}
	</div>
{/snippet}

{#if showCreate}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
		<div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
			<h2 class="text-lg font-semibold text-slate-800">New concept map</h2>
			<form
				method="POST"
				action="?/createMap"
				class="mt-4 space-y-3"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<div>
					<label for="map-name" class="mb-1 block text-sm font-medium text-slate-700">Name</label>
					<input
						id="map-name"
						name="name"
						required
						minlength="2"
						maxlength="120"
						placeholder="e.g. Cellular Respiration"
						class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="map-description" class="mb-1 block text-sm font-medium text-slate-700">
						Description
					</label>
					<textarea
						id="map-description"
						name="description"
						rows="2"
						placeholder="What is this map about?"
						class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					></textarea>
				</div>

				{#if form?.error}
					<p class="text-sm text-red-600">{form.error}</p>
				{/if}

				<div class="flex justify-end gap-2 pt-2">
					<button
						type="button"
						onclick={() => (showCreate = false)}
						class="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={submitting}
						class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
					>
						{submitting ? 'Creating…' : 'Create map'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
