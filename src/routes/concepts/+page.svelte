<script lang="ts">
	import PageHero from '$lib/components/PageHero.svelte';
	import Icon from '$lib/components/Icon.svelte';
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
	const mapCount = $derived(new Set(data.concepts.map((c) => c.mapId)).size);
	const definedPct = $derived(
		data.concepts.length === 0
			? 0
			: Math.round((data.concepts.filter((c) => c.definition?.trim()).length / data.concepts.length) * 100)
	);

	// Each letter group gets its own accent from the palette.
	const ACCENTS = ['var(--memphis-pink)', 'var(--memphis-cyan)', 'var(--memphis-yellow)', 'var(--memphis-purple)'];
	const accentFor = (i: number) => ACCENTS[i % ACCENTS.length];

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


<div class="flex-1">
	<PageHero
		eyebrow="The shared lexicon"
		title="Concept dictionary"
		description="Browse the ideas that make up every map. Open an entry to read its definition and see where it appears across the community."
		width="max-w-5xl"
	>
		<div class="flex flex-wrap gap-3">
			<div class="cc-stat">
				<span class="cc-dot" style="--dot: var(--memphis-pink)"></span>
				<div>
					<p class="cc-stat-value">{data.concepts.length}</p>
					<p class="cc-stat-label">entries</p>
				</div>
			</div>
			<div class="cc-stat">
				<span class="cc-dot" style="--dot: var(--memphis-cyan)"></span>
				<div>
					<p class="cc-stat-value">{mapCount}</p>
					<p class="cc-stat-label">maps</p>
				</div>
			</div>
			<div class="cc-stat">
				<span class="cc-dot" style="--dot: var(--memphis-yellow)"></span>
				<div>
					<p class="cc-stat-value">{definedPct}%</p>
					<p class="cc-stat-label">defined</p>
				</div>
			</div>
		</div>
	</PageHero>

	<div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-12">
		<div class="dictionary-tools z-10 sm:sticky sm:top-[3.9rem] -mx-4 flex flex-col gap-3 px-4 py-3 sm:-mx-6 sm:px-6 md:flex-row md:items-center md:justify-between">
			<label class="relative block w-full md:max-w-sm">
				<span class="sr-only">Search concepts</span>
				<input bind:value={query} placeholder="Search the dictionary…" class="cc-input !py-2.5 !pl-10 !pr-16" />
				<span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true"><Icon name="search" /></span>
				{#if query}
					<button type="button" onclick={() => (query = '')} class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700" aria-label="Clear search">Clear</button>
				{/if}
			</label>
			{#if letters.length > 0}
				<nav class="flex flex-wrap gap-1" aria-label="Jump to letter">
					{#each letters as letter (letter)}
						<a href="#letter-{letter}" class="dictionary-letter">{letter}</a>
					{/each}
				</nav>
			{/if}
		</div>

		{#if filtered.length === 0}
			<div class="cc-card mt-8 !border-dashed px-6 py-14 text-center">
				<p class="cc-display text-xl text-slate-900">{data.concepts.length === 0 ? 'Nothing here yet' : 'No matches'}</p>
				<p class="cc-muted mt-2 text-sm">
					{data.concepts.length === 0 ? 'No concepts have been created yet.' : `No concepts match "${query}".`}
				</p>
			</div>
		{:else}
			<div class="mt-8 space-y-12">
				{#each grouped as [letter, concepts], gi (letter)}
					<section id="letter-{letter}" class="scroll-mt-40" style="--accent: {accentFor(gi)}">
						<div class="flex items-center gap-3">
							<h2 class="dictionary-letter-badge cc-display">{letter}</h2>
							<div class="h-0.5 flex-1 rounded bg-slate-200"></div>
							<span class="cc-chip">{concepts.length}</span>
						</div>
						<ul class="mt-4 grid gap-4 sm:grid-cols-2">
							{#each concepts as concept, ci (concept.id)}
								<li class="cc-rise" style="--delay: {Math.min(ci, 6) * 40}ms">
									<button
										type="button"
										onclick={() => (selectedConcept = concept)}
										class="dictionary-card cc-card cc-card-link group flex h-full w-full flex-col gap-2 p-4 pl-5 text-left"
									>
										<div class="flex items-start justify-between gap-3">
											<span class="cc-display text-[1.05rem] leading-snug text-slate-900">{concept.name}</span>
											<span class="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600"><Icon name="chevronRight" /></span>
										</div>
										{#if concept.definition}
											<p class="cc-muted line-clamp-2 text-sm leading-relaxed">{concept.definition}</p>
										{:else}
											<p class="text-sm italic text-slate-400">No definition yet.</p>
										{/if}
										<span class="cc-chip mt-auto self-start !text-[11px]">
											<span class="cc-dot !h-2 !w-2" style="--dot: var(--accent)"></span>{concept.mapName}
										</span>
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
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && closeDetails()}
	>
		<div
			class="cc-panel flex max-h-[min(760px,90vh)] w-full max-w-2xl flex-col overflow-hidden"
			role="dialog"
			aria-modal="true"
			aria-labelledby="concept-detail-title"
		>
			<div class="cc-stripe shrink-0"></div>
			<div class="dictionary-modal-head shrink-0 px-6 py-5 sm:px-8">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<p class="cc-eyebrow">Dictionary entry</p>
						<h2 id="concept-detail-title" class="mt-1.5 text-3xl text-slate-900">{selectedConcept.name}</h2>
					</div>
					<button type="button" onclick={closeDetails} class="cc-btn cc-btn-plain cc-btn-sm !px-2" aria-label="Close concept details">
						<Icon name="x" />
					</button>
				</div>
			</div>

			<div class="min-h-0 space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
				{#if selectedConcept.definition}
					<div>
						<h3 class="cc-stat-label">Definition</h3>
						<p class="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-700">{selectedConcept.definition}</p>
					</div>
				{:else}
					<p class="cc-card !border-dashed p-4 text-sm italic text-slate-500">No definition has been added yet.</p>
				{/if}

				<div class="grid gap-4 sm:grid-cols-2">
					{#if selectedConcept.example}
						<div class="dictionary-note" style="--accent: var(--memphis-cyan)">
							<h3 class="cc-stat-label">Example</h3>
							<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedConcept.example}</p>
						</div>
					{/if}
					{#if selectedConcept.quizQuestion}
						<div class="dictionary-note" style="--accent: var(--memphis-yellow)">
							<h3 class="cc-stat-label">Quiz prompt</h3>
							<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedConcept.quizQuestion}</p>
						</div>
					{/if}
				</div>

				{#if selectedConcept.literatureLink}
					<div>
						<h3 class="cc-stat-label">Source</h3>
						<a href={selectedConcept.literatureLink} target="_blank" rel="noreferrer" class="mt-2 block truncate text-sm font-semibold text-memphis-pinkDeep underline decoration-2 underline-offset-2">{selectedConcept.literatureLink}</a>
					</div>
				{/if}

				<div>
					<h3 class="cc-stat-label">Appears across maps</h3>
					<p class="cc-muted mt-1 text-sm">This idea is present in {matchingMaps.length} map{matchingMaps.length === 1 ? '' : 's'}.</p>
					<div class="mt-3 space-y-2.5">
						{#each matchingMaps as mapConcept (mapConcept.id)}
							<a href="/maps/{mapConcept.mapId}?concept={mapConcept.id}" class="cc-card cc-card-link flex items-center justify-between gap-3 px-4 py-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-bold text-slate-800">{mapConcept.mapName}</p>
									<p class="mt-0.5 text-xs text-slate-400">{mapConcept.definition ? 'Has a definition' : 'No definition yet'}</p>
								</div>
								<span class="cc-chip cc-chip-yellow shrink-0">Open map <Icon name="chevronRight" class="h-3 w-3" /></span>
							</a>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.dictionary-tools {
		background: rgb(255 246 233 / 0.92);
		backdrop-filter: blur(6px);
	}
	:global(.dark) .dictionary-tools {
		background: rgb(15 23 42 / 0.9);
	}
	.dictionary-letter {
		display: flex;
		height: 1.9rem;
		min-width: 1.9rem;
		align-items: center;
		justify-content: center;
		border: 1.5px solid transparent;
		border-radius: 0.5rem;
		padding: 0 0.4rem;
		font-size: 0.8rem;
		font-weight: 800;
		color: #475569;
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}
	.dictionary-letter:hover {
		border-color: var(--memphis-ink);
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
	}
	:global(.dark) .dictionary-letter {
		color: #cbd5e1;
	}
	.dictionary-letter-badge {
		display: flex;
		height: 2.75rem;
		width: 2.75rem;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--memphis-ink);
		border-radius: 0.75rem;
		background: var(--accent);
		font-size: 1.4rem;
		color: var(--memphis-ink);
		box-shadow: 3px 3px 0 var(--memphis-ink);
		transform: rotate(-4deg);
	}
	.dictionary-card {
		position: relative;
		overflow: hidden;
	}
	.dictionary-card::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 5px;
		background: var(--accent);
	}
	.dictionary-note {
		border: 2px solid var(--memphis-ink);
		border-left: 6px solid var(--accent);
		border-radius: 0.75rem;
		padding: 1rem;
	}
	.dictionary-modal-head {
		border-bottom: 2px solid rgb(20 17 15 / 0.12);
	}
	:global(.dark) .dictionary-note {
		border-color: #475569;
		border-left-color: var(--accent);
	}
	:global(.dark) .dictionary-modal-head {
		border-color: #334155;
	}
</style>
