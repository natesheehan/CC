<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');
	let selectedConcept = $state<PageData['concepts'][number] | null>(null);

	function conceptKey(name: string): string {
		return name.trim().toLocaleLowerCase();
	}

	const filtered = $derived(
		data.concepts.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
	);
	const matchingMaps = $derived.by(() => {
		if (!selectedConcept) return [];
		const key = conceptKey(selectedConcept.name);
		return data.concepts.filter((concept) => conceptKey(concept.name) === key);
	});

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

	const letters = $derived(grouped.map(([letter]) => letter));

	function closeDetails() {
		selectedConcept = null;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeDetails();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<svelte:head>
	<title>Concept directory · Concept Cartography</title>
</svelte:head>


<div class="dictionary-page flex-1">
	<section class="shared-page-hero relative overflow-hidden border-b border-slate-200 bg-white">
		<div class="community-grid absolute inset-0" aria-hidden="true"></div>
		<div class="community-orbit community-orbit-one absolute" aria-hidden="true"></div>
		<div class="community-orbit community-orbit-two absolute" aria-hidden="true"></div>
		<div class="relative mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
			<div class="dictionary-intro max-w-2xl community-reveal">
				<p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">The shared lexicon</p>
				<h1 class="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">Concept dictionary</h1>
				<p class="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
			Browse the ideas that make up every map. Select an entry to read its definition and see where
			it appears across the community.
				</p>
				<div class="mt-5 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
			<span class="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">{data.concepts.length} entries</span>
			<span class="rounded-full bg-slate-100 px-3 py-1.5">{grouped.length} letter groups</span>
				</div>
			</div>
		</div>
	</section>

	<div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
	<div class="dictionary-tools flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<label class="relative block w-full sm:max-w-md">
			<span class="sr-only">Search concepts</span>
			<input
				bind:value={query}
				placeholder="Search the dictionary…"
				class="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-sm shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
			/>
			<span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
			{#if query}
				<button type="button" onclick={() => (query = '')} class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-blue-600" aria-label="Clear search">Clear</button>
			{/if}
		</label>
		{#if letters.length > 0}
			<nav class="flex flex-wrap gap-1" aria-label="Jump to letter">
				{#each letters as letter (letter)}
					<a href="#letter-{letter}" class="flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-semibold text-slate-500 transition hover:bg-blue-50 hover:text-blue-700">{letter}</a>
				{/each}
			</nav>
		{/if}
	</div>

	{#if filtered.length === 0}
		<p class="mt-10 text-sm text-slate-400">
			{data.concepts.length === 0 ? 'No concepts have been created yet.' : `No concepts match "${query}".`}
		</p>
	{:else}
		<div class="mt-10 space-y-10">
			{#each grouped as [letter, concepts] (letter)}
				<section id="letter-{letter}" class="scroll-mt-6">
					<div class="flex items-center gap-3">
						<h2 class="text-sm font-bold text-blue-600">{letter}</h2>
						<div class="h-px flex-1 bg-slate-200"></div>
						<span class="text-xs text-slate-400">{concepts.length}</span>
					</div>
					<ul class="mt-3 grid gap-3 sm:grid-cols-2">
						{#each concepts as concept (concept.id)}
							<li class="dictionary-entry">
								<button type="button" onclick={() => (selectedConcept = concept)} class="group flex w-full flex-col gap-2 text-left">
									<div class="flex items-start justify-between gap-3">
										<span class="font-semibold text-slate-800 transition group-hover:text-blue-600">{concept.name}</span>
										<span class="shrink-0 text-xs text-slate-400">View entry →</span>
									</div>
									{#if concept.definition}
										<p class="line-clamp-2 text-sm leading-relaxed text-slate-500">{concept.definition}</p>
									{:else}
										<p class="text-sm italic text-slate-400">No definition yet.</p>
									{/if}
									<div class="flex items-center gap-2 text-xs text-slate-400">
										<span class="dictionary-dot"></span>
										<span>{concept.mapName}</span>
									</div>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
	</div>
</div>

{#if selectedConcept}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && closeDetails()}
	>
		<div
			class="dictionary-modal max-h-[min(760px,90vh)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="concept-detail-title"
		>
			<div class="border-b border-slate-100 px-6 py-5 sm:px-8">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Dictionary entry</p>
						<h2 id="concept-detail-title" class="mt-2 text-3xl font-bold tracking-tight text-slate-900">{selectedConcept.name}</h2>
					</div>
					<button type="button" onclick={closeDetails} class="rounded-lg p-2 text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close concept details">×</button>
				</div>
			</div>

			<div class="space-y-6 px-6 py-6 sm:px-8">
				{#if selectedConcept.definition}
					<div>
						<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Definition</h3>
						<p class="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-700">{selectedConcept.definition}</p>
					</div>
				{:else}
					<p class="rounded-xl bg-slate-50 p-4 text-sm italic text-slate-500">No definition has been added yet.</p>
				{/if}

				<div class="grid gap-5 sm:grid-cols-2">
					{#if selectedConcept.example}
						<div class="rounded-xl bg-slate-50 p-4">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Example</h3>
							<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedConcept.example}</p>
						</div>
					{/if}
					{#if selectedConcept.quizQuestion}
						<div class="rounded-xl bg-blue-50 p-4">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-blue-600">Quiz prompt</h3>
							<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedConcept.quizQuestion}</p>
						</div>
					{/if}
				</div>

				{#if selectedConcept.literatureLink}
					<div>
						<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Source</h3>
						<a href={selectedConcept.literatureLink} target="_blank" rel="noreferrer" class="mt-2 block truncate text-sm font-medium text-blue-600 hover:text-blue-700">{selectedConcept.literatureLink}</a>
					</div>
				{/if}

				<div>
					<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Appears across maps</h3>
					<p class="mt-1 text-sm text-slate-500">This idea is present in {matchingMaps.length} map{matchingMaps.length === 1 ? '' : 's'}.</p>
					<div class="mt-3 space-y-2">
						{#each matchingMaps as mapConcept (mapConcept.id)}
							<a href="/maps/{mapConcept.mapId}?concept={mapConcept.id}" class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50">
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold text-slate-800">{mapConcept.mapName}</p>
									<p class="mt-0.5 text-xs text-slate-400">{mapConcept.definition ? 'Has a definition' : 'No definition yet'}</p>
								</div>
								<span class="shrink-0 text-sm text-blue-600">Open map →</span>
							</a>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
