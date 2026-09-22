<script lang="ts">
	import { relativeTime } from '$lib/shared/format';
	import type { ClientActivityEntry } from '$lib/shared/types';

	let { activity, onClose }: { activity: ClientActivityEntry[]; onClose: () => void } = $props();

	const ICONS: Record<string, string> = {
		created_map: '🗺️',
		renamed_map: '✏️',
		created_concept: '➕',
		updated_concept: '✏️',
		deleted_concept: '🗑️',
		created_relation: '🔗',
		deleted_relation: '✂️'
	};
</script>

<aside class="flex h-full w-full flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
	<div class="flex items-center justify-between border-b border-slate-100 p-4">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
		<button onclick={onClose} class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
			✕
		</button>
	</div>

	{#if activity.length === 0}
		<p class="p-4 text-sm text-slate-400">No activity yet — changes to this map will show up here.</p>
	{:else}
		<ul class="divide-y divide-slate-50">
			{#each activity as entry (entry.id)}
				<li class="flex gap-3 p-3">
					<span
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
						style="background-color: {entry.userColor ?? '#94a3b8'}"
					>
						{(entry.userName ?? '?').slice(0, 2).toUpperCase()}
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm text-slate-700">
							<span class="font-medium">{entry.userName ?? 'Someone'}</span>
							{entry.summary.replace(/^(Added|Edited|Deleted|Linked|Removed|Created|Renamed) /, (m) => m.toLowerCase())}
						</p>
						<p class="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
							<span>{ICONS[entry.action] ?? '•'}</span>
							{relativeTime(entry.createdAt)}
						</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</aside>
