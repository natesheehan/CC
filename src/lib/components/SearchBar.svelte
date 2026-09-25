<script lang="ts">
	import type { ClientConcept } from '$lib/shared/types';
	import Icon from './Icon.svelte';

	let {
		concepts,
		onSelect
	}: {
		concepts: ClientConcept[];
		onSelect: (id: string) => void;
	} = $props();

	let query = $state('');
	let open = $state(false);
	let active = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();

	// Name matches rank above definition-only matches; prefix matches first.
	const results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return concepts
			.map((c) => {
				const name = c.name.toLowerCase();
				const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : c.definition?.toLowerCase().includes(q) ? 2 : -1;
				return { c, score };
			})
			.filter((r) => r.score >= 0)
			.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name))
			.slice(0, 8)
			.map((r) => r.c);
	});

	$effect(() => {
		results;
		active = 0;
	});

	export function focus() {
		inputEl?.focus();
		inputEl?.select();
	}

	function choose(c: ClientConcept) {
		onSelect(c.id);
		query = '';
		open = false;
		inputEl?.blur();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(results.length - 1, active + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(0, active - 1);
		} else if (e.key === 'Enter' && results[active]) {
			e.preventDefault();
			choose(results[active]);
		} else if (e.key === 'Escape') {
			query = '';
			inputEl?.blur();
		}
	}
</script>

<div class="map-search relative w-full">
	<input
		bind:this={inputEl}
		bind:value={query}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 120)}
		onkeydown={onKeydown}
		placeholder="Search concepts…"
		aria-label="Search concepts"
		role="combobox"
		aria-expanded={open && results.length > 0}
		aria-controls="map-search-results"
		class="h-10 w-full rounded-xl border border-slate-200 bg-white/95 py-2 pl-9 pr-10 text-sm text-slate-700 shadow-sm backdrop-blur placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
	/>
	<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
		<Icon name="search" />
	</span>
	<kbd
		class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 px-1.5 text-[10px] font-semibold text-slate-400"
		>/</kbd
	>

	{#if open && query.trim().length > 0}
		<div
			id="map-search-results"
			role="listbox"
			class="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
		>
			{#if results.length === 0}
				<p class="px-3 py-2 text-sm text-slate-400">No concepts match "{query}".</p>
			{:else}
				{#each results as c, i (c.id)}
					<button
						type="button"
						role="option"
						aria-selected={i === active}
						onmouseenter={() => (active = i)}
						onclick={() => choose(c)}
						class="block w-full rounded-lg px-3 py-2 text-left {i === active ? 'bg-slate-100' : ''}"
					>
						<span class="block truncate text-sm font-semibold text-slate-800">{c.name}</span>
						{#if c.definition}
							<span class="block truncate text-xs text-slate-500">{c.definition}</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
