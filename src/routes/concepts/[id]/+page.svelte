<script lang="ts">
	import ConceptEntry from '$lib/components/ConceptEntry.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.concept.name} · Concept dictionary</title>
	{#if data.concept.definition}
		<meta name="description" content={data.concept.definition.slice(0, 160)} />
	{/if}
</svelte:head>

<div class="flex-1">
	<div class="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-12">
		<a href="/concepts" class="cc-chip hover:bg-memphis-yellow"><Icon name="chevronLeft" class="h-3 w-3" /> Concept dictionary</a>
		<article class="cc-panel mt-5 flex flex-col overflow-hidden" aria-labelledby="concept-detail-title">
			<div class="cc-stripe shrink-0"></div>
			<ConceptEntry concept={data.concept} matchingMaps={data.matchingMaps} />
		</article>
	</div>
</div>
