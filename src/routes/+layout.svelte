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

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<div class="flex min-h-screen flex-col">
	<header class="border-b border-slate-200 bg-white">
		<div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
			<a href="/" class="flex items-center gap-2 font-semibold text-slate-800">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" class="text-blue-600">
					<circle cx="6" cy="6" r="3" fill="currentColor" />
					<circle cx="18" cy="6" r="3" fill="currentColor" opacity="0.6" />
					<circle cx="12" cy="18" r="3" fill="currentColor" opacity="0.8" />
					<path d="M8.5 7.5L15.5 7.5M7.5 8.5L11 16M16.5 8.5L13 16" stroke="currentColor" stroke-width="1.5" />
				</svg>
				<span>Concept Cartography</span>
			</a>

			<nav class="hidden items-center gap-1 sm:flex" aria-label="Primary">
				{#each tabs as tab (tab.href)}
					<a
						href={tab.href}
						aria-current={isActive(tab.href) ? 'page' : undefined}
						class="rounded-md px-3 py-1.5 text-sm font-medium transition {isActive(tab.href)
							? 'bg-blue-50 text-blue-700'
							: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}"
					>
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
					<form method="POST" action="/logout">
						<button
							type="submit"
							class="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
						>
							Switch user
						</button>
					</form>
				{:else if page.url.pathname !== '/login'}
					<a
						href="/login"
						class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					>
						Sign in
					</a>
				{/if}
			</div>
		</div>

		<nav class="flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:hidden" aria-label="Primary">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					aria-current={isActive(tab.href) ? 'page' : undefined}
					class="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition {isActive(tab.href)
						? 'bg-blue-50 text-blue-700'
						: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}"
				>
					{tab.label}
				</a>
			{/each}
		</nav>
	</header>

	<main class="flex flex-1 flex-col">
		{@render children()}
	</main>

	<footer class="border-t border-slate-200 bg-white">
		<div class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
			<p>Concept Cartography</p>
			<nav class="flex items-center gap-4" aria-label="Footer">
				<a class="transition hover:text-blue-600" href="/docs">Docs</a>
				<a class="transition hover:text-blue-600" href="/maps">Maps</a>
				<a class="transition hover:text-blue-600" href="/concepts">Concepts</a>
				{#if data.user}
					<form method="POST" action="/logout">
						<button type="submit" class="transition hover:text-blue-600">Switch user</button>
					</form>
				{:else}
					<a class="transition hover:text-blue-600" href="/login">Sign in</a>
				{/if}
			</nav>
		</div>
	</footer>
</div>
