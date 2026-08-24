<script lang="ts">
	import type { ClientConcept } from '$lib/shared/types';

	let {
		concepts,
		onSelect
	}: {
		concepts: ClientConcept[];
		onSelect: (id: string) => void;
	} = $props();

	let query = $state('');
	let open = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();

	const results = $derived(
		query.trim().length === 0
			? []
			: concepts
					.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
					.slice(0, 8)
	);

	function choose(c: ClientConcept) {
		onSelect(c.id);
		query = '';
		open = false;
		inputEl?.blur();
	}
</script>

<div class="relative w-full max-w-xs">
	<input
		bind:this={inputEl}
		bind:value={query}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 120)}
		placeholder="Search concepts…"
		class="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
	/>
	<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>

	{#if open && query.trim().length > 0}
		<div class="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
			{#if results.length === 0}
				<p class="px-3 py-2 text-sm text-slate-400">No concepts match "{query}".</p>
			{:else}
				{#each results as c (c.id)}
					<button
						type="button"
						onclick={() => choose(c)}
						class="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
					>
						{c.name}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
