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
		class="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-slate-100"
		aria-haspopup="true"
		aria-expanded={open}
	>
		<span
			class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
			style="background-color: {color}"
		>
			{name.slice(0, 2).toUpperCase()}
		</span>
		<span class="text-sm text-slate-600">{name}</span>
	</button>

	{#if open}
		<div
			class="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
		>
			<div class="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
					style="background-color: {color}"
				>
					{name.slice(0, 2).toUpperCase()}
				</span>
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold text-slate-800">{name}</p>
					<p class="text-xs text-slate-400">
						{#if memberSince}Member since {new Date(memberSince).toLocaleDateString(undefined, {
								month: 'short',
								year: 'numeric'
							})}{:else}&nbsp;{/if}
					</p>
				</div>
			</div>

			<div class="p-4">
				{#if loading}
					<p class="py-4 text-center text-sm text-slate-400">Loading activity…</p>
				{:else if loadError}
					<p class="py-4 text-center text-sm text-red-500">{loadError}</p>
				{:else if stats}
					<div class="grid grid-cols-2 gap-2.5">
						{#each tiles as tile (tile.label)}
							<div class="rounded-lg bg-slate-50 px-3 py-2">
								<p class="text-lg font-semibold leading-none text-slate-800">{tile.value}</p>
								<p class="mt-1 text-[11px] leading-tight text-slate-500">{tile.label}</p>
							</div>
						{/each}
					</div>

					{#if stats.topRelationType || stats.lastActiveAt}
						<div class="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
							{#if stats.topRelationType}
								<p>
									Favorite relation: <span class="font-medium text-slate-700"
										>{relationLabel(stats.topRelationType)}</span
									>
								</p>
							{/if}
							{#if stats.lastActiveAt}
								<p>Last active {relativeTime(stats.lastActiveAt)}</p>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>
