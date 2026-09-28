<script lang="ts" module>
	export type ConceptEntryData = {
		id: string;
		mapId: string;
		mapName: string;
		name: string;
		definition: string | null;
		literatureLink: string | null;
		example: string | null;
		quizQuestion: string | null;
	};
</script>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	let {
		concept,
		matchingMaps,
		onclose
	}: {
		concept: ConceptEntryData;
		matchingMaps: ConceptEntryData[];
		/** When set, a close button is shown (modal usage). */
		onclose?: () => void;
	} = $props();

	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyLink() {
		const url = new URL(`/concepts/${concept.id}`, window.location.origin).toString();
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), 1800);
		} catch {
			window.prompt('Copy this link', url);
		}
	}
</script>

<div class="entry-head shrink-0 px-6 py-5 sm:px-8">
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0">
			<p class="cc-eyebrow">Dictionary entry</p>
			<h2 id="concept-detail-title" class="mt-1.5 text-3xl text-slate-900">{concept.name}</h2>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<button type="button" onclick={copyLink} class="cc-btn cc-btn-plain cc-btn-sm" aria-live="polite">
				{copied ? 'Link copied' : 'Copy link'}
			</button>
			{#if onclose}
				<button type="button" onclick={onclose} class="cc-btn cc-btn-plain cc-btn-sm !px-2" aria-label="Close concept details">
					<Icon name="x" />
				</button>
			{/if}
		</div>
	</div>
</div>

<div class="min-h-0 space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
	{#if concept.definition}
		<div>
			<h3 class="cc-stat-label">Definition</h3>
			<p class="mt-2 whitespace-pre-wrap text-base leading-7 text-slate-700">{concept.definition}</p>
		</div>
	{:else}
		<p class="cc-card !border-dashed p-4 text-sm italic text-slate-500">No definition has been added yet.</p>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2">
		{#if concept.example}
			<div class="entry-note" style="--accent: var(--memphis-cyan)">
				<h3 class="cc-stat-label">Example</h3>
				<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{concept.example}</p>
			</div>
		{/if}
		{#if concept.quizQuestion}
			<div class="entry-note" style="--accent: var(--memphis-yellow)">
				<h3 class="cc-stat-label">Quiz prompt</h3>
				<p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{concept.quizQuestion}</p>
			</div>
		{/if}
	</div>

	{#if concept.literatureLink}
		<div>
			<h3 class="cc-stat-label">Source</h3>
			<a href={concept.literatureLink} target="_blank" rel="noreferrer" class="mt-2 block truncate text-sm font-semibold text-memphis-pinkDeep underline decoration-2 underline-offset-2">{concept.literatureLink}</a>
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

<style>
	.entry-note {
		border: 2px solid var(--memphis-ink);
		border-left: 6px solid var(--accent);
		border-radius: 0.75rem;
		padding: 1rem;
	}
	.entry-head {
		border-bottom: 2px solid rgb(20 17 15 / 0.12);
	}
	:global(.dark) .entry-note {
		border-color: #475569;
		border-left-color: var(--accent);
	}
	:global(.dark) .entry-head {
		border-color: #334155;
	}
</style>
