<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import { VISIBILITIES, VISIBILITY_META, type Visibility } from '$lib/shared/access';
	import type { ClientSharing } from '$lib/shared/types';

	let {
		mapId,
		currentUserId,
		onClose,
		onChanged,
		onLeft
	}: {
		mapId: string;
		currentUserId: string;
		onClose: () => void;
		/** Access changed — the page should reload its data. */
		onChanged: () => void;
		/** You removed yourself and can no longer see the map. */
		onLeft: () => void;
	} = $props();

	const VIS_ICON = { public_edit: 'globe', public_view: 'eye', private: 'lock' } as const;

	let sharing = $state<ClientSharing | null>(null);
	let loadError = $state('');
	let busy = $state(false);
	let actionError = $state('');
	let inviteName = $state('');
	let copied = $state<'map' | 'invite' | null>(null);

	const mapUrl = $derived(typeof window === 'undefined' ? '' : `${window.location.origin}/maps/${mapId}`);
	const inviteUrl = $derived(
		sharing?.invitePath && typeof window !== 'undefined' ? `${window.location.origin}${sharing.invitePath}` : null
	);

	async function call(method: string, body?: unknown, query = '') {
		const res = await fetch(`/maps/${mapId}/sharing${query}`, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.message ?? `Request failed (${res.status})`);
		}
		return res.json();
	}

	onMount(async () => {
		try {
			sharing = await call('GET');
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Could not load sharing settings.';
		}
	});

	async function run(fn: () => Promise<unknown>) {
		busy = true;
		actionError = '';
		try {
			const result = (await fn()) as ClientSharing | { left: true };
			if ('left' in result) {
				onLeft();
				return;
			}
			sharing = result;
			onChanged();
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Something went wrong.';
		}
		busy = false;
	}

	const setVisibility = (visibility: Visibility) => run(() => call('PATCH', { visibility }));
	const setInvite = (invite: 'enable' | 'rotate' | 'disable') => run(() => call('PATCH', { invite }));
	const removeMember = (userId: string) => run(() => call('DELETE', undefined, `?userId=${encodeURIComponent(userId)}`));

	async function invite(e: SubmitEvent) {
		e.preventDefault();
		const name = inviteName.trim();
		if (!name) return;
		await run(() => call('POST', { name }));
		if (!actionError) inviteName = '';
	}

	function copy(text: string, which: 'map' | 'invite') {
		navigator.clipboard?.writeText(text).then(() => {
			copied = which;
			setTimeout(() => (copied = null), 1800);
		});
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" role="presentation">
	<div
		class="cc-panel max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="share-title"
	>
		<div class="cc-stripe shrink-0"></div>
		<div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
			<h2 id="share-title" class="flex items-center gap-2 text-lg font-semibold text-slate-800">
				<Icon name="share" /> Share this map
			</h2>
			<button onclick={onClose} class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
				<Icon name="x" />
			</button>
		</div>

		{#if loadError}
			<p class="px-6 py-6 text-sm text-red-600">{loadError}</p>
		{:else if !sharing}
			<p class="px-6 py-6 text-sm text-slate-400">Loading…</p>
		{:else}
			<div class="space-y-6 px-6 py-5">
				<section>
					<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Who can access it</h3>
					{#if sharing.canManage}
						<div class="mt-2 space-y-1.5" role="radiogroup" aria-label="Map visibility">
							{#each VISIBILITIES as v (v)}
								{@const on = sharing.visibility === v}
								<button
									role="radio"
									aria-checked={on}
									disabled={busy}
									onclick={() => !on && setVisibility(v)}
									class="flex w-full items-start gap-3 rounded-lg border-2 px-3 py-2 text-left text-sm transition disabled:cursor-wait {on
										? 'border-memphis-pink bg-pink-50/60'
										: 'border-slate-200 hover:border-slate-300'}"
								>
									<Icon name={VIS_ICON[v]} class="mt-0.5 h-4 w-4 shrink-0 {on ? 'text-memphis-pink' : 'text-slate-400'}" />
									<span>
										<span class="block font-semibold text-slate-800">{VISIBILITY_META[v].label}</span>
										<span class="block text-xs text-slate-500">{VISIBILITY_META[v].description}</span>
									</span>
								</button>
							{/each}
						</div>
					{:else}
						<p class="mt-2 flex items-start gap-2 text-sm text-slate-600">
							<Icon name={VIS_ICON[sharing.visibility]} class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
							<span>
								<strong class="text-slate-800">{VISIBILITY_META[sharing.visibility].label}.</strong>
								{VISIBILITY_META[sharing.visibility].description} Only the owner can change this.
							</span>
						</p>
					{/if}
				</section>

				<section>
					<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">
						Invited to edit ({sharing.members.length})
					</h3>
					<ul class="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
						{#each sharing.members as m (m.userId)}
							<li class="flex items-center gap-2.5 px-3 py-2 text-sm">
								<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background: {m.color}" aria-hidden="true"></span>
								<span class="flex-1 truncate font-medium text-slate-700">
									{m.name}{m.userId === currentUserId ? ' (you)' : ''}
								</span>
								{#if m.isOwner}
									<span class="text-xs text-slate-400">owner</span>
								{:else if sharing.canManage}
									<button
										onclick={() => removeMember(m.userId)}
										disabled={busy}
										class="text-xs font-medium text-slate-400 hover:text-red-600">Remove</button
									>
								{:else if m.userId === currentUserId}
									<button
										onclick={() => removeMember(m.userId)}
										disabled={busy}
										class="text-xs font-medium text-slate-400 hover:text-red-600">Leave</button
									>
								{/if}
							</li>
						{/each}
					</ul>
					{#if sharing.visibility === 'public_edit'}
						<p class="mt-1.5 text-xs text-slate-400">
							While the map is open to everyone, invites only matter if you later restrict it.
						</p>
					{/if}

					{#if sharing.canManage}
						<form onsubmit={invite} class="mt-3 flex gap-2">
							<label class="sr-only" for="invite-name">Name to invite</label>
							<input
								id="invite-name"
								bind:value={inviteName}
								placeholder="Invite by sign-in name…"
								maxlength="40"
								autocomplete="off"
								class="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
							<button type="submit" disabled={busy || !inviteName.trim()} class="cc-btn cc-btn-primary cc-btn-sm">
								Invite
							</button>
						</form>
					{/if}
				</section>

				{#if sharing.canManage}
					<section>
						<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Invite link</h3>
						<p class="mt-1 text-xs text-slate-500">
							Anyone who opens this link while signed in is added as an editor — handy for people who haven't
							signed in before.
						</p>
						{#if inviteUrl}
							<div class="mt-2 flex gap-2">
								<input
									readonly
									value={inviteUrl}
									onfocus={(e) => (e.target as HTMLInputElement).select()}
									class="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-600"
									aria-label="Invite link"
								/>
								<button onclick={() => copy(inviteUrl!, 'invite')} class="cc-btn cc-btn-plain cc-btn-sm">
									<Icon name="copy" class="h-3.5 w-3.5" />{copied === 'invite' ? 'Copied' : 'Copy'}
								</button>
							</div>
							<div class="mt-2 flex gap-3 text-xs">
								<button onclick={() => setInvite('rotate')} disabled={busy} class="font-medium text-slate-500 hover:text-slate-800">
									Reset link
								</button>
								<button onclick={() => setInvite('disable')} disabled={busy} class="font-medium text-slate-500 hover:text-red-600">
									Turn off
								</button>
							</div>
						{:else}
							<button onclick={() => setInvite('enable')} disabled={busy} class="cc-btn cc-btn-plain cc-btn-sm mt-2">
								<Icon name="link" class="h-3.5 w-3.5" /> Create invite link
							</button>
						{/if}
					</section>
				{/if}

				{#if actionError}
					<p class="text-sm text-red-600">{actionError}</p>
				{/if}
			</div>
		{/if}

		<div class="flex items-center justify-between border-t border-slate-100 px-6 py-3">
			<button onclick={() => copy(mapUrl, 'map')} class="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline">
				<Icon name="link" class="h-3.5 w-3.5" />{copied === 'map' ? 'Link copied!' : 'Copy link to map'}
			</button>
			<button onclick={onClose} class="rounded-md px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Done</button>
		</div>
	</div>
</div>
