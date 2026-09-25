<script lang="ts">
	import PageHero from '$lib/components/PageHero.svelte';
	import Icon from '$lib/components/Icon.svelte';

	const guides = [
		{ slug: 'get-started', number: '01', title: 'Get started', eyebrow: 'Using the atlas', description: 'Create your first map, add concepts, and connect ideas with meaningful relations.', accent: 'var(--memphis-pink)' },
		{ slug: 'philosophy', number: '02', title: 'Philosophy of concept cartography', eyebrow: 'Why maps work', description: 'Explore the pedagogy behind making relationships visible and learning relationally.', accent: 'var(--memphis-purple)' },
		{ slug: 'governance', number: '03', title: 'Governance', eyebrow: 'Shared practice', description: 'Principles for stewardship, attribution, discussion, and care in a shared knowledge space.', accent: 'var(--memphis-cyan)' },
		{ slug: 'contributing', number: '04', title: 'How to contribute', eyebrow: 'Join the work', description: 'Practical guidance for adding precise concepts, thoughtful relations, and useful context.', accent: 'var(--memphis-yellow)' },
		{ slug: 'cite', number: '05', title: 'Citing the atlas', eyebrow: 'Give credit', description: 'Learn how to properly cite the Concept Cartography atlas in your work.', accent: 'var(--memphis-pink)' }
	];
</script>

<svelte:head>
	<title>Docs · Concept Cartography</title>
	<meta name="description" content="Guides to using, understanding, and contributing to Concept Cartography." />
</svelte:head>

<div class="flex-1">
	<PageHero
		eyebrow="The field guide"
		title="Make the invisible visible."
		description="Learn how to use Concept Cartography, why relational thinking matters, and how to help a shared atlas grow."
	>
		{#snippet actions()}
			<a href="/docs/{guides[0].slug}" class="cc-btn cc-btn-yellow"><Icon name="book" /> Start with the basics</a>
		{/snippet}
	</PageHero>

	<section class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-12" aria-labelledby="guides-heading">
		<div class="flex items-center gap-3">
			<h2 id="guides-heading" class="cc-display text-xl text-slate-900">Explore the docs</h2>
			<span class="cc-chip">{guides.length} guides</span>
			<div class="h-0.5 flex-1 rounded bg-slate-200"></div>
		</div>

		<div class="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each guides as guide, index (guide.slug)}
				<a
					href="/docs/{guide.slug}"
					class="docs-card cc-card cc-card-link cc-rise group flex flex-col p-6 {index === 0 ? 'lg:col-span-2' : ''}"
					style="--delay: {index * 70}ms; --accent: {guide.accent}"
				>
					<div class="flex items-start justify-between gap-4">
						<span class="docs-card-number cc-display">{guide.number}</span>
						<span class="text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-700">
							<Icon name="chevronRight" class="h-5 w-5" />
						</span>
					</div>
					<p class="cc-eyebrow mt-8 !text-slate-500">{guide.eyebrow}</p>
					<h3 class="cc-display mt-1.5 text-xl leading-snug text-slate-900">{guide.title}</h3>
					<p class="cc-muted mt-2 max-w-md text-sm leading-relaxed">{guide.description}</p>
					<span class="mt-auto pt-6 text-sm font-bold text-slate-900 underline decoration-[var(--accent)] decoration-[3px] underline-offset-4">Read guide</span>
				</a>
			{/each}
		</div>
	</section>
</div>

<style>
	.docs-card {
		position: relative;
		overflow: hidden;
		min-height: 15rem;
	}
	.docs-card::after {
		content: '';
		position: absolute;
		right: -2.5rem;
		bottom: -2.5rem;
		height: 7rem;
		width: 7rem;
		border: 2px solid var(--memphis-ink);
		border-radius: 9999px;
		background: var(--accent);
		opacity: 0.9;
		transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.docs-card:hover::after {
		transform: scale(1.15);
	}
	.docs-card-number {
		display: flex;
		height: 2.75rem;
		min-width: 2.75rem;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--memphis-ink);
		border-radius: 0.75rem;
		background: var(--accent);
		padding: 0 0.4rem;
		font-size: 1.1rem;
		color: var(--memphis-ink);
		box-shadow: 3px 3px 0 var(--memphis-ink);
		transform: rotate(-4deg);
	}
	:global(.dark) .docs-card::after {
		border-color: #0f172a;
		opacity: 0.55;
	}
</style>
