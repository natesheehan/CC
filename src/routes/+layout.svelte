<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import UserStatsPopover from '$lib/components/UserStatsPopover.svelte';

	let { data, children } = $props();
	let isDark = $state(false);

	function applyTheme(dark: boolean) {
		isDark = dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem('concept-cartography-theme', dark ? 'dark' : 'light');
	}

	function toggleTheme() {
		applyTheme(!isDark);
	}

	onMount(() => {
		isDark = document.documentElement.classList.contains('dark');
	});

	const tabs = [
		{ href: '/', label: 'Home' },
		{ href: '/docs', label: 'Docs' },
		{ href: '/maps', label: 'Maps' },
		{ href: '/concepts', label: 'Concepts' }
	];

	const footerLinks = [
		{ href: '/docs', label: 'Docs' },
		{ href: '/community', label: 'Community' },
		{ href: '/maps', label: 'Maps' },
		{ href: '/concepts', label: 'Concepts' }
	];

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<div class="flex min-h-screen flex-col">
	<header class="site-header sticky top-0 z-40 bg-white">
		<div class="cc-stripe"></div>
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
			<a href="/" class="site-logo group flex items-center gap-2.5">
				<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" class="shrink-0">
					<path d="M9 10 L25 10 M9 10 L17 25 M25 10 L17 25" stroke-width="2.5" class="site-logo-edges" />
					<circle cx="9" cy="10" r="5.5" fill="#ff3d81" stroke="#14110f" stroke-width="2" class="site-logo-node" />
					<circle cx="25" cy="10" r="5.5" fill="#ffd23f" stroke="#14110f" stroke-width="2" class="site-logo-node" style="animation-delay: 80ms" />
					<circle cx="17" cy="25" r="5.5" fill="#00c2d1" stroke="#14110f" stroke-width="2" class="site-logo-node" style="animation-delay: 160ms" />
				</svg>
				<span class="cc-display text-[1.05rem] leading-none text-slate-900">Concept<br class="sm:hidden" /><span class="hidden sm:inline"> </span>Cartography</span>
			</a>

			<nav class="hidden items-center gap-1.5 sm:flex" aria-label="Primary">
				{#each tabs as tab (tab.href)}
					<a href={tab.href} aria-current={isActive(tab.href) ? 'page' : undefined} class="site-tab">
						{tab.label}
					</a>
				{/each}
			</nav>

			<div class="flex items-center gap-2 sm:gap-3">
				<button
					type="button"
					class="theme-toggle group"
					role="switch"
					aria-checked={isDark}
					aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
					title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
					onclick={toggleTheme}
				>
					<span class="theme-toggle-track">
						<svg class="theme-icon theme-sun" viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="3.5" />
							<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
						</svg>
						<svg class="theme-icon theme-moon" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M20.5 15.3A8.5 8.5 0 0 1 8.7 3.5 8.5 8.5 0 1 0 20.5 15.3Z" />
						</svg>
						<span class="theme-toggle-thumb"></span>
					</span>
				</button>

				{#if data.user}
					<UserStatsPopover userId={data.user.id} name={data.user.name} color={data.user.color} />
					<form method="POST" action="/logout" class="hidden md:block">
						<button type="submit" class="site-tab">Switch user</button>
					</form>
				{:else if page.url.pathname !== '/login'}
					<a href="/login" class="cc-btn cc-btn-primary cc-btn-sm">Sign in</a>
				{/if}
			</div>
		</div>

		<nav class="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5 sm:hidden" aria-label="Primary">
			{#each tabs as tab (tab.href)}
				<a href={tab.href} aria-current={isActive(tab.href) ? 'page' : undefined} class="site-tab shrink-0">
					{tab.label}
				</a>
			{/each}
		</nav>
	</header>

	<main class="flex flex-1 flex-col">
		{@render children()}
	</main>

	<footer class="site-footer bg-white">
		<div class="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-[1fr_auto] sm:items-end sm:px-6">
			<div>
				<p class="cc-display text-lg text-slate-900">Concept Cartography</p>
				<p class="cc-muted mt-1 max-w-sm text-sm">
					A free, open-source atlas for mapping how ideas connect — built together.
				</p>
			</div>
			<nav class="flex flex-wrap items-center gap-1.5" aria-label="Footer">
				{#each footerLinks as link (link.href)}
					<a class="site-tab" href={link.href}>{link.label}</a>
				{/each}
				{#if data.user}
					<form method="POST" action="/logout">
						<button type="submit" class="site-tab">Switch user</button>
					</form>
				{:else}
					<a class="site-tab" href="/login">Sign in</a>
				{/if}
			</nav>
		</div>
		<div class="cc-stripe"></div>
	</footer>
</div>

<style>
	.site-header {
		border-bottom: 2px solid var(--memphis-ink);
	}
	.site-footer {
		border-top: 2px solid var(--memphis-ink);
	}
	:global(.dark) .site-header,
	:global(.dark) .site-footer {
		border-color: #334155;
	}

	.site-tab {
		display: inline-flex;
		align-items: center;
		border: 2px solid transparent;
		border-radius: 9999px;
		padding: 0.3rem 0.85rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #475569;
		transition:
			background-color 150ms ease,
			color 150ms ease,
			border-color 150ms ease,
			transform 150ms ease;
	}
	.site-tab:hover {
		border-color: var(--memphis-ink);
		color: var(--memphis-ink);
	}
	.site-tab[aria-current='page'] {
		border-color: var(--memphis-ink);
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
		box-shadow: 2px 2px 0 var(--memphis-ink);
	}
	:global(.dark) .site-tab {
		color: #cbd5e1;
	}
	:global(.dark) .site-tab:hover {
		border-color: #64748b;
		color: #f8fafc;
	}
	:global(.dark) .site-tab[aria-current='page'] {
		border-color: var(--memphis-yellow);
		background: rgb(255 210 63 / 0.15);
		color: #fde68a;
		box-shadow: 2px 2px 0 var(--memphis-yellow);
	}

	.site-logo-edges {
		stroke: var(--memphis-ink);
	}
	:global(.dark) .site-logo-edges {
		stroke: #cbd5e1;
	}
	.site-logo-node {
		transform-box: fill-box;
		transform-origin: center;
	}
	.site-logo:hover .site-logo-node {
		animation: site-logo-bounce 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes site-logo-bounce {
		40% {
			transform: scale(1.3);
		}
	}
</style>
