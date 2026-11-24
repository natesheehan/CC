<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { relativeTime } from '$lib/shared/format';
	import type { ClientMapVersion } from '$lib/shared/types';

	let {
		mapId,
		currentUserId,
		canEdit,
		canManage,
		previewingId = null,
		refreshKey = 0,
		onPreview,
		onRestore,
		onDownload,
		onClose
	}: {
		mapId: string;
		currentUserId: string;
		canEdit: boolean;
		canManage: boolean;
		/** Version currently shown on the canvas, if any. */
		previewingId?: string | null;
		/** Bump to re-fetch (e.g. someone saved or restored a version live). */
		refreshKey?: number;
		onPreview: (version: ClientMapVersion | null) => void;
		onRestore: (version: ClientMapVersion) => Promise<void>;
		onDownload: (version: ClientMapVersion) => Promise<void>;
		onClose: () => void;
	} = $props();

	let versions = $state<ClientMapVersion[]>([]);
	let loading = $state(true);
	let error = $state('');
	let label = $state('');
	let saving = $state(false);
	let confirmRestoreId = $state<string | null>(null);
	let busyId = $state<string | null>(null);

	async function api(url: string, init: RequestInit = {}) {
		const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message ?? `Request failed (${res.status})`);
		}
		return res.json();
	}

	async function load(quiet = false) {
		if (!quiet) loading = true;
		try {
			versions = await api(`/maps/${mapId}/versions`);
			error = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load versions.';
		}
		loading = false;
	}

	$effect(() => {
		const key = refreshKey;
		untrack(() => load(key > 0));
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const text = label.trim();
		if (!text) return;
		saving = true;
		error = '';
		try {
			const created: ClientMapVersion = await api(`/maps/${mapId}/versions`, {
				method: 'POST',
				body: JSON.stringify({ label: text })
			});
			versions = [created, ...versions];
			label = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save a version.';
		}
		saving = false;
	}

	async function withBusy(id: string, fn: () => Promise<void>) {
		busyId = id;
		error = '';
		try {
			await fn();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong.';
		}
		busyId = null;
	}

	const restore = (v: ClientMapVersion) =>
		withBusy(v.id, async () => {
			await onRestore(v);
			confirmRestoreId = null;
			await load(true);
		});

	const remove = (v: ClientMapVersion) =>
		withBusy(v.id, async () => {
			if (!confirm(`Delete the version "${v.label}"? This can't be undone.`)) return;
			await api(`/maps/${mapId}/versions/${v.id}`, { method: 'DELETE' });
			if (previewingId === v.id) onPreview(null);
			versions = versions.filter((x) => x.id !== v.id);
		});

	const download = (v: ClientMapVersion) => withBusy(v.id, () => onDownload(v));
</script>

<aside class="cc-panel cc-panel-flat flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white">
	<div class="cc-stripe shrink-0"></div>
	<div class="flex items-center justify-between border-b border-slate-100 p-4">
		<h2 class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
			<Icon name="history" class="h-4 w-4" /> Versions
		</h2>
		<button onclick={onClose} class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
			<Icon name="x" />
		</button>
	</div>

	{#if canEdit}
		<form onsubmit={save} class="border-b border-slate-100 p-4">
			<label for="version-label" class="text-xs font-semibold text-slate-500">Save the map as it is now</label>
			<div class="mt-1.5 flex gap-2">
				<input
					id="version-label"
					bind:value={label}
					maxlength="120"
					placeholder="e.g. Draft for seminar"
					autocomplete="off"
					class="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
				<button type="submit" disabled={saving || !label.trim()} class="cc-btn cc-btn-primary cc-btn-sm">
					<Icon name="save" class="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}
				</button>
			</div>
		</form>
	{/if}

	{#if error}
		<p class="px-4 pt-3 text-sm text-red-600">{error}</p>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if loading}
			<p class="p-4 text-sm text-slate-400">Loading versions…</p>
		{:else if versions.length === 0}
			<p class="p-4 text-sm text-slate-400">
				No saved versions yet.{canEdit ? ' Save one before a big change so you can always get back to it.' : ''}
			</p>
		{:else}
			<ul class="divide-y divide-slate-50">
				{#each versions as v (v.id)}
					{@const previewing = previewingId === v.id}
					<li class="px-4 py-3 {previewing ? 'bg-amber-50/70' : ''}">
						<div class="flex items-start gap-2">
							<div class="min-w-0 flex-1">
								<p class="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
									<span class="truncate">{v.label}</span>
									{#if v.kind === 'auto'}<span class="cc-chip shrink-0 !py-0 !text-[10px]">auto</span>{/if}
								</p>
								<p class="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
									<span class="h-2 w-2 shrink-0 rounded-full" style="background: {v.createdByColor ?? '#94a3b8'}"></span>
									<span class="truncate">{v.createdByName ?? 'Someone'} · {relativeTime(v.createdAt)}</span>
								</p>
								<p class="mt-0.5 text-xs text-slate-400">
									{v.conceptCount} concept{v.conceptCount === 1 ? '' : 's'} · {v.relationCount} link{v.relationCount === 1 ? '' : 's'}
								</p>
							</div>
						</div>

						{#if confirmRestoreId === v.id}
							<div class="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
								<p>
									Replace the map's current content with this version? The current state is saved as an automatic
									version first, so you can undo this.
								</p>
								<div class="mt-2 flex gap-2">
									<button
										onclick={() => restore(v)}
										disabled={busyId === v.id}
										class="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
									>
										{busyId === v.id ? 'Restoring…' : 'Restore'}
									</button>
									<button onclick={() => (confirmRestoreId = null)} class="rounded-md px-2.5 py-1 hover:bg-amber-100">
										Cancel
									</button>
								</div>
							</div>
						{:else}
							<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
								<button
									onclick={() => onPreview(previewing ? null : v)}
									class={previewing ? 'text-amber-700' : 'text-blue-600 hover:underline'}
									aria-pressed={previewing}
								>
									{previewing ? 'Stop preview' : 'Preview'}
								</button>
								{#if canEdit}
									<button onclick={() => (confirmRestoreId = v.id)} class="text-slate-500 hover:text-slate-800">Restore…</button>
								{/if}
								<button onclick={() => download(v)} disabled={busyId === v.id} class="text-slate-500 hover:text-slate-800">
									Download
								</button>
								{#if v.createdById === currentUserId || canManage}
									<button onclick={() => remove(v)} disabled={busyId === v.id} class="text-slate-400 hover:text-red-600">
										Delete
									</button>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</aside>
