<script lang="ts">
	import { page } from '$app/state';
	import { marked } from 'marked';
	import howItWorksMarkdown from '$lib/content/docs/how-it-works.md?raw';
	import pedagogyMarkdown from '$lib/content/docs/pedagogy.md?raw';
	import governanceMarkdown from '$lib/content/docs/governance.md?raw';
	import contributingMarkdown from '$lib/content/docs/contributing.md?raw';
	import citeMarkdown from '$lib/content/docs/cite.md?raw';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const articles = [
		{ slug: 'get-started', title: 'Get started', eyebrow: 'Using the atlas', description: 'Build your first map and learn the core workflow.', markdown: howItWorksMarkdown },
		{ slug: 'philosophy', title: 'Philosophy of concept cartography', eyebrow: 'Why maps work', description: 'The thinking behind making relationships visible.', markdown: pedagogyMarkdown },
		{ slug: 'governance', title: 'Governance', eyebrow: 'Shared practice', description: 'Principles for caring for a collaborative knowledge space.', markdown: governanceMarkdown },
		{ slug: 'contributing', title: 'How to contribute', eyebrow: 'Join the work', description: 'Practical ways to add clarity and context to a map.', markdown: contributingMarkdown },
		{ slug: 'cite', title: 'Citing the atlas', eyebrow: 'Give credit', description: 'How to properly cite maps created with the atlas.', markdown: citeMarkdown }
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
	<div class="cc-hero !border-b-2">
		<div class="cc-stripe"></div>
		<div class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
			<a href="/docs" class="cc-chip hover:bg-memphis-yellow"><Icon name="chevronLeft" class="h-3 w-3" /> All guides</a>
			<p class="cc-eyebrow mt-5">{article.eyebrow} · Guide {articleIndex + 1} of {articles.length}</p>
			<h1 class="cc-hero-title mt-2 !text-[clamp(1.75rem,1.3rem+2vw,3rem)]">{article.title}</h1>
			<p class="cc-muted mt-3 max-w-2xl text-lg">{article.description}</p>
			<!-- Reading progress through the guide series -->
			<div class="mt-6 flex max-w-xs gap-1.5" aria-hidden="true">
				{#each articles as item, i (item.slug)}
					<span class="docs-progress {i <= articleIndex ? 'done' : ''}"></span>
				{/each}
			</div>
		</div>
	</div>

	<div class="docs-article-page mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-12">
		<aside class="lg:sticky lg:top-20 lg:self-start">
			<p class="cc-stat-label">In this series</p>
			<nav class="mt-3" aria-label="Documentation sections">
				<ol class="space-y-1.5">
					{#each articles as item, i (item.slug)}
						<li>
							<a
								href="/docs/{item.slug}"
								aria-current={item.slug === article.slug ? 'page' : undefined}
								class="docs-nav-item"
							>
								<span class="docs-nav-num">{String(i + 1).padStart(2, '0')}</span>
								<span class="min-w-0 flex-1 truncate">{item.title}</span>
							</a>
						</li>
					{/each}
				</ol>
			</nav>

			<div class="cc-card mt-6 p-4 text-xs">
				{#if data.edited}
					<p class="cc-muted leading-relaxed">
						Last edited {new Date(data.edited.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} by
						{#if data.edited.profileUrl}
							<a href={data.edited.profileUrl} target="_blank" rel="noreferrer" class="font-bold text-slate-700 hover:underline">{data.edited.name}</a>
						{:else}<span class="font-bold text-slate-700">{data.edited.name}</span>{/if}
						· <a href={data.edited.commitUrl} target="_blank" rel="noreferrer" class="font-semibold underline">commit</a>
					</p>
				{:else}
					<p class="cc-muted">Edit history is maintained on GitHub.</p>
				{/if}
				<a href={data.historyUrl} target="_blank" rel="noreferrer" class="mt-2 inline-flex items-center gap-1 font-bold text-slate-800 hover:underline">
					History on GitHub <Icon name="chevronRight" class="h-3 w-3" />
				</a>
			</div>
		</aside>

		<main class="min-w-0">
			<article class="docs-prose docs-article-content">
				{@html renderMarkdown(article.markdown)}
			</article>
			<div class="mt-12 grid gap-4 sm:grid-cols-2">
				{#if articleIndex > 0}
					<a href="/docs/{articles[articleIndex - 1].slug}" class="cc-card cc-card-link p-4">
						<span class="cc-stat-label flex items-center gap-1"><Icon name="chevronLeft" class="h-3 w-3" /> Previous</span>
						<span class="cc-display mt-1 block text-slate-900">{articles[articleIndex - 1].title}</span>
					</a>
				{:else}<span></span>{/if}
				{#if articleIndex < articles.length - 1}
					<a href="/docs/{articles[articleIndex + 1].slug}" class="cc-card cc-card-link p-4 text-right">
						<span class="cc-stat-label flex items-center justify-end gap-1">Next <Icon name="chevronRight" class="h-3 w-3" /></span>
						<span class="cc-display mt-1 block text-slate-900">{articles[articleIndex + 1].title}</span>
					</a>
				{/if}
			</div>
		</main>
	</div>
{:else}
	<div class="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
		<p class="cc-eyebrow">404</p>
		<h1 class="cc-display mt-2 text-3xl text-slate-900">Documentation page not found</h1>
		<a href="/docs" class="cc-btn cc-btn-yellow mt-6">Back to docs</a>
	</div>
{/if}

<style>
	.docs-progress {
		height: 0.45rem;
		flex: 1;
		border: 1.5px solid var(--memphis-ink);
		border-radius: 9999px;
		background: white;
	}
	.docs-progress.done {
		background: var(--memphis-pink);
	}
	.docs-nav-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		border: 2px solid transparent;
		border-radius: 0.6rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #475569;
		transition:
			border-color 150ms ease,
			background-color 150ms ease,
			transform 150ms ease;
	}
	.docs-nav-item:hover {
		border-color: var(--memphis-ink);
		transform: translateX(2px);
	}
	.docs-nav-item[aria-current='page'] {
		border-color: var(--memphis-ink);
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
		box-shadow: 3px 3px 0 var(--memphis-ink);
	}
	.docs-nav-num {
		font-family: 'Archivo Black', Inter, sans-serif;
		font-size: 0.75rem;
		opacity: 0.6;
	}
	:global(.dark) .docs-progress {
		border-color: #475569;
		background: #0f172a;
	}
	:global(.dark) .docs-nav-item {
		color: #cbd5e1;
	}
	:global(.dark) .docs-nav-item:hover {
		border-color: #64748b;
	}
	:global(.dark) .docs-nav-item[aria-current='page'] {
		border-color: var(--memphis-yellow);
		background: rgb(255 210 63 / 0.15);
		color: #fde68a;
		box-shadow: 3px 3px 0 var(--memphis-yellow);
	}
</style>
