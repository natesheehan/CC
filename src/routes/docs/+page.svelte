<script lang="ts">
	import { marked } from 'marked';
	import pedagogyMarkdown from '$lib/content/docs/pedagogy.md?raw';
	import howItWorksMarkdown from '$lib/content/docs/how-it-works.md?raw';

	const articles = [
		{ slug: 'pedagogy', markdown: pedagogyMarkdown },
		{ slug: 'how-it-works', markdown: howItWorksMarkdown }
	];

	function renderMarkdown(markdown: string): string {
		return marked.parse(markdown, { async: false });
	}
</script>

<svelte:head>
	<title>Docs · Concept Cartography</title>
	<meta
		name="description"
		content="Learn the ideas behind concept maps and how to use Concept Cartography."
	/>
</svelte:head>

<div class="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
	<header class="max-w-2xl">
		<p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Documentation</p>
		<h1 class="mt-3 text-4xl font-bold tracking-tight text-slate-900">Think in connections.</h1>
		<p class="mt-4 text-lg leading-relaxed text-slate-600">
			A short guide to the thinking behind concept maps and the tools in Concept Cartography.
		</p>
	</header>

	<div class="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
		<div class="space-y-16">
			{#each articles as article (article.slug)}
				<article class="docs-prose" aria-labelledby={article.slug}>
					{@html renderMarkdown(article.markdown)}
				</article>
			{/each}
		</div>

		<aside class="lg:sticky lg:top-6 lg:self-start">
			<nav class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Documentation">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">On this page</h2>
				<ul class="mt-4 space-y-3 text-sm">
					<li><a class="text-slate-600 hover:text-blue-600" href="#the-pedagogy-behind-concept-cartography">The pedagogy behind concept cartography</a></li>
					<li><a class="text-slate-600 hover:text-blue-600" href="#how-it-works">How it works</a></li>
				</ul>
			</nav>
		</aside>
	</div>
</div>
