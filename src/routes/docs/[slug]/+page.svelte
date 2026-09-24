<script lang="ts">
	import { page } from '$app/state';
	import { marked } from 'marked';
	import howItWorksMarkdown from '$lib/content/docs/how-it-works.md?raw';
	import pedagogyMarkdown from '$lib/content/docs/pedagogy.md?raw';
	import governanceMarkdown from '$lib/content/docs/governance.md?raw';
	import contributingMarkdown from '$lib/content/docs/contributing.md?raw';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const articles = [
		{ slug: 'get-started', title: 'Get started', eyebrow: 'Using the atlas', description: 'Build your first map and learn the core workflow.', markdown: howItWorksMarkdown },
		{ slug: 'philosophy', title: 'Philosophy of concept cartography', eyebrow: 'Why maps work', description: 'The thinking behind making relationships visible.', markdown: pedagogyMarkdown },
		{ slug: 'governance', title: 'Governance', eyebrow: 'Shared practice', description: 'Principles for caring for a collaborative knowledge space.', markdown: governanceMarkdown },
		{ slug: 'contributing', title: 'How to contribute', eyebrow: 'Join the work', description: 'Practical ways to add clarity and context to a map.', markdown: contributingMarkdown }
	];

	const article = $derived(articles.find((item) => item.slug === page.params.slug));
	const articleIndex = $derived(Math.max(0, articles.findIndex((item) => item.slug === page.params.slug)));

	function renderMarkdown(markdown: string): string {
		return marked.parse(markdown, { async: false });
	}
</script>

<svelte:head>
	<title>{article ? `${article.title} · Docs` : 'Documentation · Concept Cartography'}</title>
</svelte:head>

{#if article}
	<div class="docs-article-page mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-14">
		<aside class="docs-sidebar lg:sticky lg:top-6 lg:self-start">
			<a href="/docs" class="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Documentation</a>
			<nav class="mt-5" aria-label="Documentation sections">
				<ul class="space-y-1">
					{#each articles as item (item.slug)}
						<li>
							<a href="/docs/{item.slug}" class="docs-nav-link {item.slug === article.slug ? 'active' : ''}">
								<span>{item.title}</span>
								{#if item.slug === article.slug}<span aria-hidden="true">→</span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		</aside>

		<main class="min-w-0">
			<div class="docs-article-header">
				<p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">{article.eyebrow}</p>
				<p class="mt-3 text-sm text-slate-500">Guide {articleIndex + 1} of {articles.length}</p>
				{#if data.edited}
					<p class="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
						<span>Last edited {new Date(data.edited.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} by</span>
						{#if data.edited.profileUrl}
							<a href={data.edited.profileUrl} target="_blank" rel="noreferrer" class="font-medium text-slate-600 hover:text-blue-600">{data.edited.name}</a>
						{:else}<span class="font-medium text-slate-600">{data.edited.name}</span>{/if}
						<a href={data.edited.commitUrl} target="_blank" rel="noreferrer" class="text-blue-600 hover:text-blue-700">on GitHub</a>
					</p>
				{/if}
			</div>
			<article class="docs-prose docs-article-content mt-8">
				{@html renderMarkdown(article.markdown)}
			</article>
			<div class="mt-12 flex items-center justify-between border-t border-slate-200 pt-5 text-sm">
				{#if articleIndex > 0}
					<a href="/docs/{articles[articleIndex - 1].slug}" class="text-slate-500 hover:text-blue-600">← {articles[articleIndex - 1].title}</a>
				{:else}<span></span>{/if}
				{#if articleIndex < articles.length - 1}
					<a href="/docs/{articles[articleIndex + 1].slug}" class="font-medium text-blue-600 hover:text-blue-700">{articles[articleIndex + 1].title} →</a>
				{/if}
			</div>
		</main>
	</div>
{:else}
	<div class="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
		<h1 class="text-2xl font-semibold text-slate-900">Documentation page not found</h1>
		<a href="/docs" class="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">Back to docs</a>
	</div>
{/if}
