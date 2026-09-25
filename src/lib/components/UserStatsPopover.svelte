<script lang="ts">
	import { relativeTime } from '$lib/shared/format';
	import { relationLabel } from '$lib/shared/relations';

	let { userId, name, color }: { userId: string; name: string; color: string } = $props();

	type Stats = {
		mapsCreated: number;
		conceptsCreated: number;
		relationsCreated: number;
		commentsPosted: number;
		totalActions: number;
		mapsContributedTo: number;
		lastActiveAt: number | null;
		topRelationType: string | null;
	};

	let open = $state(false);
	let stats: Stats | null = $state(null);
	let memberSince: number | null = $state(null);
	let loading = $state(false);
	let loadError = $state('');
	let containerEl: HTMLDivElement | undefined = $state();

	let loadedForUserId: string | null = null;

	$effect(() => {
		if (!open) return;
		if (loadedForUserId === userId) return;
		loading = true;
		loadError = '';
		fetch(`/users/${userId}/stats`)
			.then(async (res) => {
				if (!res.ok) throw new Error('Could not load stats.');
				return res.json();
			})
			.then((data) => {
				stats = data.stats;
				memberSince = data.user.createdAt;
				loadedForUserId = userId;
			})
			.catch((err) => {
				loadError = err instanceof Error ? err.message : 'Could not load stats.';
			})
			.finally(() => {
				loading = false;
			});
	});

	// Guard against the classic "outside click also closes the menu that just
	// opened it" bug: the trigger button lives inside `containerEl` alongside
	// the popover, so a click on the button itself is never treated as
	// "outside" — checking only the popover's own DOM (excluding the button)
	// would immediately re-close it on the very click that opened it.
	function onWindowClick(e: MouseEvent) {
		if (open && containerEl && !containerEl.contains(e.target as Node)) open = false;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}

	const tiles = $derived.by(() => {
		if (!stats) return [];
		const s = stats;
		return [
			{ label: 'Maps created', value: s.mapsCreated },
			{ label: 'Concepts added', value: s.conceptsCreated },
			{ label: 'Relations linked', value: s.relationsCreated },
			{ label: 'Comments posted', value: s.commentsPosted },
			{ label: 'Maps contributed to', value: s.mapsContributedTo },
			{ label: 'Total edits', value: s.totalActions }
		];
	});
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="relative" bind:this={containerEl}>
	<button
		type="button"
		onclick={() => (open = !open)}
		class="user-trigger flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-3 {open ? 'is-open' : ''}"
		aria-haspopup="true"
		aria-expanded={open}
		title="Your profile"
	>
		<span class="cc-avatar !h-7 !w-7 !text-[10px]" style="--avatar: {color}">{name.slice(0, 2).toUpperCase()}</span>
		<span class="hidden max-w-[8rem] truncate text-sm font-semibold text-slate-700 sm:inline">{name}</span>
	</button>

	{#if open}
		<div class="cc-panel absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl bg-white">
			<div class="cc-stripe"></div>
			<div class="flex items-center gap-3 px-4 py-3.5">
				<span class="cc-avatar !h-10 !w-10 !text-sm" style="--avatar: {color}">{name.slice(0, 2).toUpperCase()}</span>
				<div class="min-w-0">
					<p class="cc-display truncate text-base text-slate-900">{name}</p>
					<p class="text-xs text-slate-400">
						{#if memberSince}Member since {new Date(memberSince).toLocaleDateString(undefined, {
								month: 'short',
								year: 'numeric'
							})}{:else}&nbsp;{/if}
					</p>
				</div>
			</div>

			<div class="px-4 pb-4">
				{#if loading}
					<p class="py-4 text-center text-sm text-slate-400">Loading activity…</p>
				{:else if loadError}
					<p class="py-4 text-center text-sm text-red-500">{loadError}</p>
				{:else if stats}
					<div class="grid grid-cols-2 gap-2">
						{#each tiles as tile (tile.label)}
							<div class="cc-stat !block !px-3 !py-2">
								<p class="cc-stat-value !text-lg">{tile.value}</p>
								<p class="cc-stat-label mt-0.5 !text-[10px] leading-tight">{tile.label}</p>
							</div>
						{/each}
					</div>

					{#if stats.topRelationType || stats.lastActiveAt}
						<div class="mt-3 space-y-1 text-xs text-slate-500">
							{#if stats.topRelationType}
								<p>Favourite relation: <span class="font-bold text-slate-700">{relationLabel(stats.topRelationType)}</span></p>
							{/if}
							{#if stats.lastActiveAt}
								<p>Last active {relativeTime(stats.lastActiveAt)}</p>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			<form method="POST" action="/logout" class="user-logout px-4 py-3">
				<button type="submit" class="cc-btn cc-btn-plain cc-btn-sm w-full">Log out</button>
			</form>
		</div>
	{/if}
</div>

<style>
	.user-trigger {
		border: 2px solid transparent;
		transition: border-color 150ms ease;
	}
	.user-trigger:hover,
	.user-trigger.is-open {
		border-color: var(--memphis-ink);
	}
	.user-logout {
		border-top: 2px solid rgb(20 17 15 / 0.1);
		background: #f8fafc;
	}
	:global(.dark) .user-trigger:hover,
	:global(.dark) .user-trigger.is-open {
		border-color: #64748b;
	}
	:global(.dark) .user-logout {
		border-color: #334155;
		background: #0f172a;
	}
</style>
