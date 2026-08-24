<script lang="ts">
	import { untrack } from 'svelte';
	import { RELATION_TYPES, RELATION_META } from '$lib/shared/relations';
	import type { ClientConcept } from '$lib/shared/types';

	let {
		concepts,
		defaultSourceId,
		onSubmit,
		onClose
	}: {
		concepts: ClientConcept[];
		defaultSourceId?: string;
		onSubmit: (data: { sourceId: string; targetId: string; type: string }) => Promise<void> | void;
		onClose: () => void;
	} = $props();

	let sourceId = $state(untrack(() => defaultSourceId ?? concepts[0]?.id ?? ''));
	let targetQuery = $state('');
	let targetId = $state('');
	let type = $state<(typeof RELATION_TYPES)[number]>('type_of');

	let submitting = $state(false);
	let error = $state('');

	const filteredTargets = $derived(
		concepts
			.filter((c) => c.id !== sourceId)
			.filter((c) => c.name.toLowerCase().includes(targetQuery.trim().toLowerCase()))
			.slice(0, 8)
	);

	const sourceConcept = $derived(concepts.find((c) => c.id === sourceId));
	const targetConcept = $derived(concepts.find((c) => c.id === targetId));

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (!sourceId || !targetId) {
			error = 'Choose both a source and a target concept.';
			return;
		}
		if (sourceId === targetId) {
			error = 'A concept cannot be related to itself.';
			return;
		}

		submitting = true;
		try {
			await onSubmit({ sourceId, targetId, type });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong.';
			submitting = false;
			return;
		}
		submitting = false;
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
	<div class="w-full max-w-lg rounded-xl bg-white shadow-xl">
		<div class="border-b border-slate-100 px-6 py-4">
			<h2 class="text-lg font-semibold text-slate-800">Link two concepts</h2>
		</div>

		<form id="relation-form" onsubmit={handleSubmit} class="space-y-4 px-6 py-4">
			<div>
				<label for="r-source" class="mb-1 block text-sm font-medium text-slate-700">From</label>
				<select
					id="r-source"
					bind:value={sourceId}
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				>
					{#each concepts as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="r-type" class="mb-1 block text-sm font-medium text-slate-700">Relation</label>
				<select
					id="r-type"
					bind:value={type}
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				>
					{#each RELATION_TYPES as rt (rt)}
						<option value={rt}>{RELATION_META[rt].label}</option>
					{/each}
				</select>
				<p class="mt-1 text-xs text-slate-400">{RELATION_META[type].description}</p>
			</div>

			<div>
				<label for="r-target" class="mb-1 block text-sm font-medium text-slate-700">To</label>
				<input
					id="r-target"
					bind:value={targetQuery}
					placeholder="Search for a concept…"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
				<div class="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
					{#each filteredTargets as c (c.id)}
						<button
							type="button"
							onclick={() => {
								targetId = c.id;
								targetQuery = c.name;
							}}
							class="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 {targetId === c.id
								? 'bg-blue-50 text-blue-700'
								: 'text-slate-700'}"
						>
							{c.name}
						</button>
					{:else}
						<p class="px-2 py-1.5 text-sm text-slate-400">No matching concepts.</p>
					{/each}
				</div>
			</div>

			{#if sourceConcept && targetConcept}
				<p class="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
					<strong>{sourceConcept.name}</strong>
					{RELATION_META[type].phrase}
					<strong>{targetConcept.name}</strong>
				</p>
			{/if}

			{#if error}
				<p class="text-sm text-red-600">{error}</p>
			{/if}
		</form>

		<div class="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
			<button type="button" onclick={onClose} class="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
				Cancel
			</button>
			<button
				type="submit"
				form="relation-form"
				disabled={submitting || !targetId}
				class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
			>
				{submitting ? 'Linking…' : 'Create link'}
			</button>
		</div>
	</div>
</div>
