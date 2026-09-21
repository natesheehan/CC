<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');

	const filtered = $derived(
		data.concepts.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
	);

	// Grouped by first letter for a dictionary-style browse experience.
	const grouped = $derived.by(() => {
		const groups = new Map<string, typeof filtered>();
		for (const concept of filtered) {
			const letter = /[a-z]/i.test(concept.name[0] ?? '') ? concept.name[0]!.toUpperCase() : '#';
			const list = groups.get(letter) ?? [];
			list.push(concept);
			groups.set(letter, list);
		}
		return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
	});
</script>

<svelte:head>
	<title>Concept directory · Concept Cartography</title>
</svelte:head>

<div class="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
	<div>
		<h1 class="text-2xl font-semibold text-slate-900">Concept directory</h1>
		<p class="mt-1 text-sm text-slate-500">
			Every concept across every map, in one searchable dictionary — {data.concepts.length}
			concept{data.concepts.length === 1 ? '' : 's'} total.
		</p>
	</div>

	<div class="relative mt-6 max-w-sm">
		<input
			bind:value={query}
			placeholder="Search concepts…"
			class="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
		/>
		<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
	</div>

	{#if filtered.length === 0}
		<p class="mt-10 text-sm text-slate-400">
			{data.concepts.length === 0 ? 'No concepts have been created yet.' : `No concepts match "${query}".`}
		</p>
	{:else}
		<div class="mt-8 space-y-8">
			{#each grouped as [letter, concepts] (letter)}
				<section>
					<h2 class="text-sm font-semibold text-blue-600">{letter}</h2>
					<ul class="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
						{#each concepts as concept (concept.id)}
							<li>
								<a
									href="/maps/{concept.mapId}?concept={concept.id}"
									class="group flex flex-col gap-1 px-4 py-3 hover:bg-slate-50"
								>
									<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
										<span class="font-medium text-slate-800 group-hover:text-blue-600">{concept.name}</span>
										<span class="text-xs text-slate-400">in {concept.mapName}</span>
									</div>
									{#if concept.definition}
										<p class="line-clamp-1 text-sm text-slate-500">{concept.definition}</p>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</div>
