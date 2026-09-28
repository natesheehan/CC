<script lang="ts">
	import { marked } from 'marked';
	import { INFO_PAGES, type InfoPage } from '$lib/content/legal';

	// Shared shell for About and the legal pages: hero, sibling nav, prose body.
	let { info }: { info: InfoPage } = $props();

	const html = $derived(marked.parse(info.markdown, { async: false }));
	const updated = $derived(
		info.updated
			? new Date(`${info.updated}T00:00:00Z`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
			: null
	);
</script>

<svelte:head>
	<title>{info.title} · Concept Cartography</title>
	<meta name="description" content={info.description} />
</svelte:head>

<div class="cc-hero !border-b-2">
	<div class="cc-stripe"></div>
	<div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
		<p class="cc-eyebrow">{info.eyebrow}</p>
		<h1 class="cc-hero-title mt-2 !text-[clamp(1.75rem,1.3rem+2vw,3rem)]">{info.title}</h1>
		<p class="cc-muted mt-3 max-w-2xl text-lg">{info.description}</p>
		{#if updated}
			<p class="cc-chip mt-5">Last updated {updated}</p>
		{/if}
	</div>
</div>

<div class="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10 lg:py-12">
	<aside class="lg:sticky lg:top-20 lg:self-start">
		<nav aria-label="About and legal">
			<ul class="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
				{#each INFO_PAGES as item (item.href)}
					<li class="shrink-0">
						<a href={item.href} class="info-nav-item" aria-current={item.href === info.href ? 'page' : undefined}>
							{item.title.replace('About Concept Cartography', 'About')}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</aside>

	<article class="docs-prose info-prose min-w-0">
		{@html html}
	</article>
</div>

<style>
	.info-nav-item {
		display: block;
		border: 2px solid transparent;
		border-radius: 0.6rem;
		padding: 0.45rem 0.7rem;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		color: #475569;
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}
	.info-nav-item:hover {
		border-color: var(--memphis-ink);
	}
	.info-nav-item[aria-current='page'] {
		border-color: var(--memphis-ink);
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
		box-shadow: 3px 3px 0 var(--memphis-ink);
	}
	:global(.dark) .info-nav-item {
		color: #cbd5e1;
	}
	:global(.dark) .info-nav-item:hover {
		border-color: #64748b;
	}
	:global(.dark) .info-nav-item[aria-current='page'] {
		border-color: var(--memphis-yellow);
		background: rgb(255 210 63 / 0.15);
		color: #fde68a;
		box-shadow: 3px 3px 0 var(--memphis-yellow);
	}

	.info-prose > :global(:first-child) {
		margin-top: 0;
	}
	/* Tables scroll sideways on narrow screens rather than squashing. */
	.info-prose :global(table) {
		display: block;
		margin-top: 1.25rem;
		max-width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.info-prose :global(th),
	.info-prose :global(td) {
		border: 1.5px solid rgb(20 17 15 / 0.15);
		padding: 0.55rem 0.75rem;
		text-align: left;
		vertical-align: top;
	}
	.info-prose :global(th) {
		background: var(--memphis-cream);
		font-weight: 700;
		color: var(--memphis-ink);
	}
	:global(.dark) .info-prose :global(th),
	:global(.dark) .info-prose :global(td) {
		border-color: #334155;
	}
	:global(.dark) .info-prose :global(th) {
		background: #172033;
		color: #f8fafc;
	}
</style>
