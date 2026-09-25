<script lang="ts">
	import { page } from '$app/state';
	import HeroConceptMap from '$lib/components/HeroConceptMap.svelte';
	import Icon from '$lib/components/Icon.svelte';

	const STEPS = [
		{ n: '01', title: 'Define concepts', text: 'Each idea gets a definition, examples, sources and a quiz prompt.', accent: 'var(--memphis-pink)' },
		{ n: '02', title: 'Name the relation', text: 'Say exactly how two ideas connect: part of, depends on, counteracts…', accent: 'var(--memphis-yellow)' },
		{ n: '03', title: 'Discuss the links', text: 'Every relation has its own thread, so disagreements become learning.', accent: 'var(--memphis-cyan)' }
	];
</script>

<svelte:head>
	<title>Concept Cartography</title>
</svelte:head>

<div class="flex flex-1 flex-col">
	<section class="cc-hero flex flex-1 flex-col">
		<div class="cc-stripe"></div>
		<div class="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-16">
			<div class="cc-rise">
				<p class="memphis-badge">Free & open source</p>
				<h1 class="cc-hero-title mt-6">
					Unpack the pleasures and problems of <span class="home-mark">layered meaning.</span>
				</h1>
				<p class="cc-muted mt-5 max-w-lg text-lg leading-relaxed">
					Collaborative concept maps for classrooms and research groups — define ideas precisely, name how they
					relate, and argue about the connections together.
				</p>

				<div class="mt-8 flex flex-wrap items-center gap-3">
					<a href={page.data.user ? '/maps' : '/login'} class="cc-btn cc-btn-primary">
						{page.data.user ? 'Go to your maps' : 'Sign in to get started'}
						<Icon name="chevronRight" />
					</a>
					<a href="/docs" class="cc-btn cc-btn-yellow"><Icon name="book" /> Read the docs</a>
					<a href="/concepts" class="cc-btn cc-btn-plain">Browse concepts</a>
				</div>
			</div>

			<div class="cc-rise" style="--delay: 150ms">
				<HeroConceptMap />
			</div>
		</div>

		<div class="home-steps">
			<div class="mx-auto grid max-w-6xl gap-5 px-4 py-8 sm:grid-cols-3 sm:px-6">
				{#each STEPS as step, i (step.n)}
					<div class="cc-rise flex gap-3" style="--delay: {250 + i * 80}ms">
						<span class="home-step-num cc-display" style="--accent: {step.accent}">{step.n}</span>
						<div>
							<p class="font-bold text-slate-900">{step.title}</p>
							<p class="cc-muted mt-0.5 text-sm leading-relaxed">{step.text}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>
</div>

<style>
	.home-mark {
		background-image: linear-gradient(transparent 62%, var(--memphis-yellow) 62%, var(--memphis-yellow) 92%, transparent 92%);
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}
	:global(.dark) .home-mark {
		background-image: linear-gradient(transparent 62%, rgb(255 210 63 / 0.35) 62%, rgb(255 210 63 / 0.35) 92%, transparent 92%);
	}

	.home-steps {
		border-top: 2px solid var(--memphis-ink);
		background: white;
	}
	:global(.dark) .home-steps {
		border-color: #334155;
		background: #111827;
	}
	.home-step-num {
		display: flex;
		height: 2.4rem;
		min-width: 2.4rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--memphis-ink);
		border-radius: 0.6rem;
		background: var(--accent);
		font-size: 0.85rem;
		color: var(--memphis-ink);
		box-shadow: 2px 2px 0 var(--memphis-ink);
	}
</style>
