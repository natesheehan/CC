<script lang="ts">
	const guides = [
		{ slug: 'get-started', number: '01', title: 'Get started', eyebrow: 'Using the atlas', description: 'Create your first map, add concepts, and connect ideas with meaningful relations.', accent: 'blue' },
		{ slug: 'philosophy', number: '02', title: 'Philosophy of concept cartography', eyebrow: 'Why maps work', description: 'Explore the pedagogy behind making relationships visible and learning relationally.', accent: 'violet' },
		{ slug: 'governance', number: '03', title: 'Governance', eyebrow: 'Shared practice', description: 'Principles for stewardship, attribution, discussion, and care in a shared knowledge space.', accent: 'cyan' },
		{ slug: 'contributing', number: '04', title: 'How to contribute', eyebrow: 'Join the work', description: 'Practical guidance for adding precise concepts, thoughtful relations, and useful context.', accent: 'amber' }
	];
</script>

<svelte:head>
	<title>Docs · Concept Cartography</title>
	<meta name="description" content="Guides to using, understanding, and contributing to Concept Cartography." />
</svelte:head>


<div class="docs-hub-page flex-1">
	<section class="shared-page-hero relative overflow-hidden border-b border-slate-200 bg-white">
		<div class="community-grid absolute inset-0" aria-hidden="true"></div>
		<div class="community-orbit community-orbit-one absolute" aria-hidden="true"></div>
		<div class="community-orbit community-orbit-two absolute" aria-hidden="true"></div>
		<div class="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
			<div class="max-w-2xl community-reveal">
				<p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">The field guide</p>
				<h1 class="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">Make the invisible visible.</h1>
				<p class="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
				Learn how to use Concept Cartography, why relational thinking matters, and how to help a shared atlas grow.
				</p>
			</div>
		</div>
	</section>

	<section class="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-14" aria-labelledby="guides-heading">
		<div class="flex items-end justify-between gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Four ways in</p>
				<h2 id="guides-heading" class="mt-2 text-2xl font-semibold text-slate-900">Explore the docs</h2>
			</div>
			<span class="text-sm text-slate-400">{guides.length} guides</span>
		</div>

		<div class="mt-6 grid gap-4 sm:grid-cols-2">
			{#each guides as guide, index (guide.slug)}
				<a href="/docs/{guide.slug}" class="docs-guide-card docs-guide-{guide.accent}" style={`--delay: ${index * 80}ms`}>
					<div class="flex items-start justify-between gap-4">
						<span class="docs-guide-number">{guide.number}</span>
						<span class="text-lg text-slate-400 transition group-hover:text-blue-500" aria-hidden="true">↗</span>
					</div>
					<p class="mt-10 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{guide.eyebrow}</p>
					<h3 class="mt-2 text-xl font-semibold text-slate-900">{guide.title}</h3>
					<p class="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">{guide.description}</p>
					<span class="mt-6 inline-block text-sm font-semibold text-blue-600">Read guide <span aria-hidden="true">→</span></span>
				</a>
			{/each}
		</div>
	</section>
</div>
