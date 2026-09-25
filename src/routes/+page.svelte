<script lang="ts">
	import { page } from '$app/state';
	import NetworkAnimation from '$lib/components/NetworkAnimation.svelte';

	const HEADLINE_LEAD = ['Unpack', 'the', 'pleasures', 'and', 'problems', 'of'];
	const MARQUEE = [
		'Concept', 'Konzept', '概念', 'Concepto', 'مفهوم', 'Понятие',
		'Idea', 'अवधारणा', '개념', 'Ιδέα', 'Begrip', 'Wazo'
	];

	// Pointer-driven parallax for the decorative shapes, exposed as CSS vars.
	let heroEl: HTMLElement | undefined = $state();
	function onPointerMove(e: PointerEvent) {
		if (!heroEl) return;
		const rect = heroEl.getBoundingClientRect();
		heroEl.style.setProperty('--mx', `${(e.clientX - rect.left) / rect.width - 0.5}`);
		heroEl.style.setProperty('--my', `${(e.clientY - rect.top) / rect.height - 0.5}`);
	}
</script>

<svelte:window onpointermove={onPointerMove} />

<svelte:head>
	<title>Concept Cartography</title>
</svelte:head>

<div class="flex flex-1 flex-col">
	<!-- Hero -->
	<section
		bind:this={heroEl}
		class="hero relative flex min-h-[calc(100svh-7rem)] flex-col overflow-hidden bg-slate-900 sm:min-h-[calc(100svh-4rem)]"
	>
		<div class="hero-glow pointer-events-none absolute inset-0" aria-hidden="true"></div>
		<div class="hero-dots pointer-events-none absolute inset-0" aria-hidden="true"></div>

		<!-- Parallax Memphis shapes -->
		<div class="hero-shape hero-shape-circle" style="--depth: 30px" aria-hidden="true"></div>
		<div class="hero-shape hero-shape-triangle" style="--depth: -40px" aria-hidden="true"></div>
		<svg class="hero-shape hero-shape-squiggle" style="--depth: 22px" viewBox="0 0 120 30" aria-hidden="true">
			<path d="M4 15 Q 16 2 28 15 T 52 15 T 76 15 T 100 15 T 124 15" />
		</svg>
		<svg class="hero-shape hero-shape-zigzag" style="--depth: -26px" viewBox="0 0 100 24" aria-hidden="true">
			<path d="M2 20 L14 4 L26 20 L38 4 L50 20 L62 4 L74 20 L86 4 L98 20" />
		</svg>
		<div class="hero-shape hero-shape-ring" style="--depth: 18px" aria-hidden="true"></div>

		<div class="pointer-events-none absolute inset-0 opacity-50 lg:opacity-100">
			<NetworkAnimation />
		</div>
		<div
			class="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#14110f]/80 via-[#14110f]/20 to-transparent max-lg:bg-gradient-to-b max-lg:from-transparent max-lg:via-[#14110f]/30 max-lg:to-[#14110f]/80"
			aria-hidden="true"
		></div>

		<div class="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-16 sm:px-6 sm:py-20">
			<div class="mx-auto max-w-2xl text-center lg:mx-0 lg:max-w-xl lg:text-left">
				<p class="memphis-badge hero-rise" style="--i: 0">Free & open source</p>

				<h1 class="mt-6 text-4xl leading-[1.08] text-white sm:text-6xl">
					{#each HEADLINE_LEAD as word, i}
						<span class="hero-word" style="--i: {i + 1}">{word}</span>{' '}
					{/each}
					<span class="hero-layered" data-text="layered meaning." style="--i: 8">layered meaning.</span>
				</h1>

				<p class="hero-rise mx-auto mt-6 max-w-lg text-lg leading-relaxed text-memphis-cream/75 lg:mx-0" style="--i: 10">
					Collaborative concept maps for teams and classrooms — trace how one idea
					branches, stacks and shifts across people, languages and disciplines.
				</p>

				<div class="hero-rise mt-9 flex flex-wrap items-center justify-center gap-4 lg:justify-start" style="--i: 11">
					<a href={page.data.user ? '/maps' : '/login'} class="hero-btn hero-btn-primary">
						{page.data.user ? 'Go to your maps' : 'Sign in to get started'}
						<span class="hero-btn-arrow" aria-hidden="true">→</span>
					</a>
					<a href="/docs" class="hero-btn hero-btn-docs">
						<svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
							<path
								d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linejoin="round"
							/>
						</svg>
						Read the docs
					</a>
					<a href="/concepts" class="hero-btn hero-btn-ghost">Browse the concept directory</a>
				</div>

				<p class="hero-rise mt-8 hidden text-xs font-semibold uppercase tracking-[0.2em] text-memphis-cream/40 lg:block" style="--i: 12">
					Hover the orbit to unpack a concept
				</p>
			</div>
		</div>

		<!-- Multilingual marquee -->
		<div class="hero-marquee relative z-10" aria-hidden="true">
			<div class="hero-marquee-track">
				{#each [0, 1] as _}
					{#each MARQUEE as word}
						<span>{word}</span><span class="hero-marquee-star">✦</span>
					{/each}
				{/each}
			</div>
		</div>
	</section>
</div>

<style>
	.hero {
		--mx: 0;
		--my: 0;
	}

	.hero-glow {
		background:
			radial-gradient(ellipse 45% 55% at 72% 50%, rgb(255 61 129 / 0.22), transparent 70%),
			radial-gradient(ellipse 35% 40% at 15% 85%, rgb(0 194 209 / 0.14), transparent 70%),
			radial-gradient(ellipse 30% 30% at 10% 10%, rgb(124 58 237 / 0.18), transparent 70%);
		animation: hero-glow-shift 14s ease-in-out infinite alternate;
	}

	.hero-dots {
		background-image: radial-gradient(rgb(255 246 233 / 0.09) 1.5px, transparent 1.5px);
		background-size: 22px 22px;
		mask-image: radial-gradient(ellipse at 70% 50%, black 10%, transparent 75%);
	}

	/* ---- Parallax shapes ---- */
	.hero-shape {
		position: absolute;
		pointer-events: none;
		translate: calc(var(--mx) * var(--depth)) calc(var(--my) * var(--depth));
		transition: translate 400ms cubic-bezier(0.22, 1, 0.36, 1);
		animation: hero-pop 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
	}
	.hero-shape-circle {
		left: -3rem;
		top: 3.5rem;
		height: 9rem;
		width: 9rem;
		border: 3px solid var(--memphis-ink);
		border-radius: 9999px;
		background: var(--memphis-cyan);
		box-shadow: 6px 6px 0 var(--memphis-yellow);
		animation-delay: 150ms;
	}
	.hero-shape-triangle {
		right: 4%;
		bottom: 5.5rem;
		height: 6rem;
		width: 6rem;
		clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
		background: var(--memphis-pink);
		animation:
			hero-pop 700ms 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both,
			hero-spin 22s linear infinite;
	}
	.hero-shape-squiggle {
		left: 44%;
		top: 2.5rem;
		width: 7rem;
		fill: none;
		stroke: var(--memphis-yellow);
		stroke-width: 4;
		stroke-linecap: round;
		stroke-dasharray: 200;
		animation: hero-draw 1.6s 500ms ease-out both;
	}
	.hero-shape-zigzag {
		left: 6%;
		bottom: 6.5rem;
		width: 6rem;
		fill: none;
		stroke: var(--memphis-pink);
		stroke-width: 4;
		stroke-linejoin: round;
		stroke-linecap: round;
		stroke-dasharray: 200;
		animation: hero-draw 1.6s 700ms ease-out both;
	}
	.hero-shape-ring {
		right: 38%;
		bottom: 4.5rem;
		height: 2.5rem;
		width: 2.5rem;
		border: 5px solid var(--memphis-yellow);
		border-radius: 9999px;
		animation-delay: 450ms;
	}

	/* ---- Headline ---- */
	.hero-word,
	.hero-rise {
		animation: hero-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: calc(var(--i) * 70ms);
	}
	.hero-word {
		display: inline-block;
	}
	.memphis-badge.hero-rise {
		animation-name: hero-badge;
	}

	.hero-layered {
		position: relative;
		display: inline-block;
		color: var(--memphis-cream);
		animation:
			hero-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both,
			hero-layers 1s 900ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
		animation-delay: calc(var(--i) * 70ms), 900ms;
	}
	.hero-layered::after {
		/* marker-style underline that swipes in */
		content: '';
		position: absolute;
		left: 0;
		right: 0.3em;
		bottom: 0.02em;
		z-index: -1;
		height: 0.2em;
		background: var(--memphis-yellow);
		transform-origin: left;
		animation: hero-underline 700ms 1.5s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	/* ---- Buttons ---- */
	.hero-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		border: 2px solid var(--memphis-ink);
		border-radius: 0.5rem;
		padding: 0.7rem 1.2rem;
		font-size: 0.9rem;
		font-weight: 700;
		transition:
			transform 160ms ease,
			box-shadow 160ms ease,
			background-color 160ms ease,
			color 160ms ease;
	}
	.hero-btn:hover {
		transform: translate(-2px, -2px);
	}
	.hero-btn:active {
		transform: translate(2px, 2px);
		box-shadow: 0 0 0 var(--memphis-ink);
	}
	.hero-btn:focus-visible {
		outline: 3px solid var(--memphis-cyan);
		outline-offset: 3px;
	}
	.hero-btn-primary {
		background: var(--memphis-pink);
		color: white;
		box-shadow: 4px 4px 0 var(--memphis-yellow);
	}
	.hero-btn-primary:hover {
		box-shadow: 6px 6px 0 var(--memphis-yellow);
	}
	.hero-btn-arrow {
		transition: transform 160ms ease;
	}
	.hero-btn-primary:hover .hero-btn-arrow {
		transform: translateX(4px);
	}
	.hero-btn-docs {
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
		box-shadow: 4px 4px 0 var(--memphis-cyan);
	}
	.hero-btn-docs:hover {
		box-shadow: 6px 6px 0 var(--memphis-cyan);
	}
	.hero-btn-ghost {
		border-color: rgb(255 246 233 / 0.35);
		border-radius: 9999px;
		color: var(--memphis-cream);
	}
	.hero-btn-ghost:hover {
		border-color: var(--memphis-cream);
		background: rgb(255 246 233 / 0.08);
	}

	/* ---- Marquee ---- */
	.hero-marquee {
		overflow: hidden;
		margin: 0 -1rem -0.5rem;
		transform: rotate(-1.2deg);
		border-block: 3px solid var(--memphis-ink);
		background: var(--memphis-yellow);
		padding-block: 0.6rem;
		animation: hero-rise 700ms 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.hero-marquee-track {
		display: flex;
		width: max-content;
		gap: 1.25rem;
		font-family: 'Archivo Black', Inter, ui-sans-serif, sans-serif;
		font-size: 1.1rem;
		text-transform: uppercase;
		color: var(--memphis-ink);
		white-space: nowrap;
		animation: hero-marquee 40s linear infinite;
	}
	.hero-marquee-star {
		color: var(--memphis-pink);
	}

	/* ---- Keyframes ---- */
	@keyframes hero-rise {
		from {
			opacity: 0;
			transform: translateY(0.6em);
			filter: blur(6px);
		}
		to {
			opacity: 1;
			transform: none;
			filter: none;
		}
	}
	@keyframes hero-badge {
		from {
			opacity: 0;
			transform: rotate(-14deg) scale(0.6);
		}
		to {
			opacity: 1;
			transform: rotate(-2deg) scale(1);
		}
	}
	@keyframes hero-layers {
		from {
			text-shadow:
				0 0 0 var(--memphis-pink),
				0 0 0 var(--memphis-cyan),
				0 0 0 var(--memphis-purple);
		}
		to {
			text-shadow:
				3px 3px 0 var(--memphis-pink),
				6px 6px 0 var(--memphis-cyan),
				9px 9px 0 var(--memphis-purple);
		}
	}
	@keyframes hero-underline {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}
	@keyframes hero-pop {
		from {
			opacity: 0;
			scale: 0.3;
		}
		to {
			opacity: 0.9;
			scale: 1;
		}
	}
	@keyframes hero-spin {
		to {
			rotate: 360deg;
		}
	}
	@keyframes hero-draw {
		from {
			stroke-dashoffset: 200;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes hero-glow-shift {
		to {
			transform: translate(-3%, 2%) scale(1.05);
		}
	}
	@keyframes hero-marquee {
		to {
			transform: translateX(-50%);
		}
	}

	@media (max-width: 640px) {
		.hero-shape-squiggle,
		.hero-shape-ring {
			display: none;
		}
	}
</style>
