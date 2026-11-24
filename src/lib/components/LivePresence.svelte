<script lang="ts">
	import { fly } from 'svelte/transition';
	import Icon from './Icon.svelte';
	import { initials, type LiveStatus } from '$lib/client/live.svelte';
	import type { LivePeer } from '$lib/shared/types';

	let {
		peers,
		status,
		me,
		followingId = null,
		describe,
		onGoTo,
		onFollow
	}: {
		peers: LivePeer[];
		status: LiveStatus;
		me: { name: string; color: string } | null;
		/** clientId of the peer whose view is being followed. */
		followingId?: string | null;
		describe: (peer: LivePeer) => string;
		onGoTo: (peer: LivePeer) => void;
		onFollow: (peer: LivePeer | null) => void;
	} = $props();

	let open = $state(false);
	let rootEl: HTMLDivElement | undefined = $state();

	// One avatar per person even if they have the map open in several tabs;
	// keep the most recently active tab as their representative.
	const people = $derived.by(() => {
		const byUser = new Map<string, LivePeer>();
		for (const p of peers) {
			const prev = byUser.get(p.userId);
			if (!prev || p.lastSeen > prev.lastSeen || (p.editing && !prev.editing)) byUser.set(p.userId, p);
		}
		return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

	const shown = $derived(people.slice(0, 4));
	const overflow = $derived(Math.max(0, people.length - shown.length));

	const statusLabel = $derived(
		status === 'live'
			? people.length === 0
				? 'Only you here'
				: `${people.length + 1} people here`
			: status === 'connecting'
				? 'Connecting…'
				: status === 'reconnecting'
					? 'Reconnecting…'
					: 'Offline — changes from others paused'
	);

	function onWindowPointerDown(e: PointerEvent) {
		if (open && rootEl && !rootEl.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="relative" bind:this={rootEl}>
	<button
		type="button"
		onclick={() => (open = !open)}
		class="live-trigger flex h-9 items-center gap-2 rounded-lg pl-2 pr-2.5"
		aria-expanded={open}
		aria-haspopup="dialog"
		title={statusLabel}
	>
		<span class="relative flex h-2.5 w-2.5" aria-hidden="true">
			{#if status === 'live'}
				<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
			{/if}
			<span
				class="relative inline-flex h-2.5 w-2.5 rounded-full {status === 'live'
					? 'bg-emerald-500'
					: status === 'offline'
						? 'bg-red-500'
						: 'bg-amber-400'}"
			></span>
		</span>
		{#if people.length > 0}
			<span class="flex -space-x-2">
				{#each shown as p (p.userId)}
					<span
						class="live-avatar {followingId === p.clientId ? 'following' : ''}"
						style="--peer: {p.color}"
						title="{p.name} — {describe(p)}"
					>
						{initials(p.name)}
						{#if p.editing}<span class="live-avatar-badge" aria-hidden="true">✎</span>{/if}
					</span>
				{/each}
				{#if overflow > 0}
					<span class="live-avatar" style="--peer: #64748b">+{overflow}</span>
				{/if}
			</span>
		{/if}
		<span class="text-xs font-semibold {people.length === 0 ? 'text-slate-500' : 'text-slate-700'}">
			{#if status !== 'live'}{statusLabel}{:else if people.length === 0}Live{:else}{people.length + 1} live{/if}
		</span>
	</button>

	{#if open}
		<div
			class="live-popover absolute left-0 top-full xl:left-auto xl:right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-white"
			role="dialog"
			aria-label="People on this map"
			transition:fly={{ y: -6, duration: 150 }}
		>
			<div class="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
				<Icon name="users" class="h-4 w-4 text-slate-400" />
				<span class="flex-1 text-sm font-semibold text-slate-700">On this map now</span>
				<span class="text-xs text-slate-400">{statusLabel}</span>
			</div>
			<ul class="max-h-80 overflow-y-auto py-1">
				{#if me}
					<li class="flex items-center gap-3 px-4 py-2">
						<span class="live-avatar" style="--peer: {me.color}">{initials(me.name)}</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-slate-700">{me.name} <span class="text-slate-400">(you)</span></p>
						</div>
					</li>
				{/if}
				{#each people as p (p.userId)}
					{@const following = followingId === p.clientId}
					<li class="flex items-center gap-3 px-4 py-2">
						<span class="live-avatar" style="--peer: {p.color}">{initials(p.name)}</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-slate-700">{p.name}</p>
							<p class="truncate text-xs text-slate-400">{describe(p)}</p>
						</div>
						<button
							type="button"
							class="live-action"
							onclick={() => {
								onGoTo(p);
								open = false;
							}}
							disabled={!p.focusId && !p.cursor && !p.editing?.startsWith('concept:')}
							title="Jump to where {p.name} is"
						>
							<Icon name="target" class="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							class="live-action {following ? 'active' : ''}"
							onclick={() => {
								onFollow(following ? null : p);
								open = false;
							}}
							aria-pressed={following}
							title={following ? `Stop following ${p.name}` : `Follow ${p.name}'s view`}
						>
							<Icon name="eye" class="h-3.5 w-3.5" />
						</button>
					</li>
				{:else}
					<li class="px-4 py-4 text-sm text-slate-400">
						Nobody else is here right now. Share the link — anyone who opens this map will appear here, with
						their cursor and what they're working on.
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.live-trigger {
		border: 2px solid transparent;
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}
	.live-trigger:hover,
	.live-trigger[aria-expanded='true'] {
		background: #f1f5f9;
	}
	:global(.dark) .live-trigger:hover,
	:global(.dark) .live-trigger[aria-expanded='true'] {
		background: #273449;
	}
	.live-avatar {
		position: relative;
		display: inline-flex;
		height: 1.75rem;
		width: 1.75rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		border: 2px solid white;
		background: var(--peer);
		font-size: 10px;
		font-weight: 700;
		color: white;
	}
	:global(.dark) .live-avatar {
		border-color: #172033;
	}
	.live-avatar.following {
		box-shadow: 0 0 0 2px var(--peer);
	}
	.live-avatar-badge {
		position: absolute;
		right: -4px;
		bottom: -4px;
		display: flex;
		height: 0.9rem;
		width: 0.9rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
		font-size: 8px;
	}
	.live-popover {
		border: 2px solid var(--memphis-ink);
		box-shadow: 4px 4px 0 var(--memphis-ink);
	}
	:global(.dark) .live-popover {
		border-color: #475569;
		box-shadow: 4px 4px 0 #0b1220;
	}
	.live-action {
		display: flex;
		height: 1.75rem;
		width: 1.75rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		color: #64748b;
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}
	.live-action:hover:not(:disabled) {
		background: #f1f5f9;
		color: #0f172a;
	}
	.live-action:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.live-action.active {
		background: #ffe3ef;
		color: var(--memphis-pink-deep);
	}
	:global(.dark) .live-action:hover:not(:disabled) {
		background: #273449;
		color: #f8fafc;
	}
	:global(.dark) .live-action.active {
		background: rgb(255 61 129 / 0.18);
		color: #ff8fb8;
	}
</style>
