<script lang="ts">
	import { enhance } from '$app/forms';
	import { relativeTime } from '$lib/shared/format';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Your maps · Concept Cartography</title>
</svelte:head>

<div class="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold text-slate-900">Concept maps</h1>
			<p class="mt-1 text-sm text-slate-500">
				Build networks of concepts, define how they relate, and see the whole picture.
			</p>
		</div>
		<button
			onclick={() => (showCreate = true)}
			class="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
		>
			<span class="text-lg leading-none">+</span> New map
		</button>
	</div>

	{#if data.myMaps.length === 0 && data.otherMaps.length === 0}
		<div class="mt-16 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-20 text-center">
			<p class="text-slate-500">No maps yet. Create the first one to get started.</p>
			<button
				onclick={() => (showCreate = true)}
				class="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
			>
				Create a map
			</button>
		</div>
	{:else}
		<section class="mt-8">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
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

		<section class="mt-10">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
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
			<a
				href="/maps/{map.id}"
				class="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
			>
				<h3 class="font-semibold text-slate-800 group-hover:text-blue-600">{map.name}</h3>
				{#if map.description}
					<p class="mt-1 line-clamp-2 text-sm text-slate-500">{map.description}</p>
				{/if}
				<div class="mt-4 flex items-center gap-4 text-xs text-slate-500">
					<span>{map.conceptCount} concept{map.conceptCount === 1 ? '' : 's'}</span>
					<span>{map.relationCount} link{map.relationCount === 1 ? '' : 's'}</span>
				</div>
				<div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
					<span>by {map.createdByName ?? 'unknown'}</span>
					<span>updated {relativeTime(map.updatedAt)}</span>
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