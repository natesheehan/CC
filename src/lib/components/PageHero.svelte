<script lang="ts">
	import type { Snippet } from 'svelte';

	// Shared page opener: stripe, eyebrow, display title, lede, then whatever
	// the page wants underneath (stats, actions) — with a small hand-drawn
	// concept graph on the right that echoes the map canvas.
	let {
		eyebrow,
		title,
		description,
		width = 'max-w-6xl',
		children,
		actions
	}: {
		eyebrow: string;
		title: string;
		description?: string;
		width?: string;
		children?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<section class="cc-hero">
	<div class="cc-stripe"></div>
	<div class="relative mx-auto {width} px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14">
		<svg
			class="cc-hero-art pointer-events-none absolute right-6 top-8 hidden h-44 w-56 lg:block"
			viewBox="0 0 220 170"
			aria-hidden="true"
		>
			<path d="M40 120 Q 85 40 140 62" class="cc-art-edge" stroke="#ff3d81" />
			<path d="M140 62 Q 190 100 158 140" class="cc-art-edge dashed" stroke="#00c2d1" />
			<path d="M40 120 Q 100 150 158 140" class="cc-art-edge" stroke="#7c3aed" style="animation-delay: 450ms" />
			<path d="M140 62 L 182 22" class="cc-art-edge" stroke="#ffd23f" style="animation-delay: 650ms" />
			<circle cx="44" cy="124" r="17" class="cc-art-shadow" />
			<circle cx="40" cy="120" r="17" class="cc-art-node" style="animation-delay: 100ms" />
			<circle cx="144" cy="66" r="22" class="cc-art-shadow" />
			<circle cx="140" cy="62" r="22" class="cc-art-node central" style="animation-delay: 250ms" />
			<circle cx="162" cy="144" r="13" class="cc-art-shadow" />
			<circle cx="158" cy="140" r="13" class="cc-art-node" style="animation-delay: 400ms" />
			<circle cx="185" cy="25" r="9" class="cc-art-shadow" />
			<circle cx="182" cy="22" r="9" class="cc-art-node" style="animation-delay: 550ms" />
		</svg>

		<div class="flex flex-wrap items-end justify-between gap-6">
			<div class="cc-rise max-w-2xl lg:max-w-xl xl:max-w-2xl">
				<p class="cc-eyebrow">{eyebrow}</p>
				<h1 class="cc-hero-title mt-3">{title}</h1>
				{#if description}
					<p class="cc-muted mt-4 max-w-xl text-lg leading-relaxed">{description}</p>
				{/if}
			</div>
			{#if actions}
				<div class="cc-rise flex flex-wrap items-center gap-3 lg:mr-64" style="--delay: 120ms">
					{@render actions()}
				</div>
			{/if}
		</div>

		{#if children}
			<div class="cc-rise mt-8" style="--delay: 180ms">
				{@render children()}
			</div>
		{/if}
	</div>
</section>
