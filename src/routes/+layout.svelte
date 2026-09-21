<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { data, children } = $props();

	const tabs = [
		{ href: '/', label: 'How to' },
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

			{#if data.user}
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2">
						<span
							class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
							style="background-color: {data.user.color}"
						>
							{data.user.name.slice(0, 2).toUpperCase()}
						</span>
						<span class="text-sm text-slate-600">{data.user.name}</span>
					</div>
					<form method="POST" action="/logout">
						<button
							type="submit"
							class="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
						>
							Switch user
						</button>
					</form>
				</div>
			{:else if page.url.pathname !== '/login'}
				<a
					href="/login"
					class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
				>
					Sign in
				</a>
			{/if}
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
</div>
