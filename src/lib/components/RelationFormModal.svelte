<script lang="ts">
	import { untrack } from 'svelte';
	import { RELATION_TYPES, type CustomRelationType } from '$lib/shared/relations';
	import type { ClientConcept, ClientRelation } from '$lib/shared/types';

	let {
		mode = 'create',
		initial,
		concepts,
		customTypes,
		relationMeta,
		defaultSourceId,
		onSubmit,
		onClose,
		onManageTypes
	}: {
		mode?: 'create' | 'edit';
		initial?: ClientRelation;
		concepts: ClientConcept[];
		customTypes: CustomRelationType[];
		relationMeta: Record<
			string,
			{ label: string; phrase: string; color: string; directional: boolean; description: string }
		>;
		defaultSourceId?: string;
		onSubmit: (data: {
			sourceId: string;
			targetId: string;
			type: string;
			direction: 'forward' | 'both';
			description: string;
		}) => Promise<void> | void;
		onClose: () => void;
		onManageTypes?: () => void;
	} = $props();

	let sourceId = $state(untrack(() => initial?.sourceId ?? defaultSourceId ?? concepts[0]?.id ?? ''));
	let targetQuery = $state(
		untrack(() => (initial ? (concepts.find((c) => c.id === initial.targetId)?.name ?? '') : ''))
	);
	let targetId = $state(untrack(() => initial?.targetId ?? ''));
	let type = $state(untrack(() => initial?.type ?? RELATION_TYPES[0]));
	let direction = $state<'forward' | 'both'>(untrack(() => initial?.direction ?? 'forward'));
	let directionTouched = $state(false);
	let description = $state(untrack(() => initial?.description ?? ''));

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
	const currentMeta = $derived(
		relationMeta[type] ?? { label: type, phrase: type, color: '#64748b', directional: true, description: '' }
	);

	// Default the direction toggle from the selected type's metadata, unless
	// the user has explicitly overridden it for this relation.
	$effect(() => {
		if (!directionTouched && mode === 'create') {
			direction = currentMeta.directional ? 'forward' : 'both';
		}
	});

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
			await onSubmit({ sourceId, targetId, type, direction, description: description.trim() });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong.';
			submitting = false;
			return;
		}
		submitting = false;
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
	<div class="cc-panel w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
		<div class="cc-stripe shrink-0"></div>
		<div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
			<h2 class="text-lg font-semibold text-slate-800">{mode === 'edit' ? 'Edit link' : 'Link two concepts'}</h2>
			{#if onManageTypes}
				<button type="button" onclick={onManageTypes} class="text-xs font-medium text-violet-600 hover:underline">
					Manage relation types
				</button>
			{/if}
		</div>

		<form id="relation-form" onsubmit={handleSubmit} class="space-y-4 px-6 py-4">
			<div>
				<label for="r-source" class="mb-1 block text-sm font-medium text-slate-700">From</label>
				<select
					id="r-source"
					bind:value={sourceId}
					disabled={mode === 'edit'}
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
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
					<optgroup label="Built-in">
						{#each RELATION_TYPES as rt (rt)}
							<option value={rt}>{relationMeta[rt]?.label ?? rt}</option>
						{/each}
					</optgroup>
					{#if customTypes.length > 0}
						<optgroup label="Custom for this map">
							{#each customTypes as ct (ct.key)}
								<option value={ct.key}>{ct.label}</option>
							{/each}
						</optgroup>
					{/if}
				</select>
				{#if currentMeta.description}<p class="mt-1 text-xs text-slate-400">{currentMeta.description}</p>{/if}
			</div>

			<fieldset>
				<legend class="mb-1 block text-sm font-medium text-slate-700">Direction</legend>
				<div class="flex gap-4 text-sm text-slate-600">
					<label class="flex items-center gap-1.5">
						<input
							type="radio"
							name="direction"
							checked={direction === 'forward'}
							onchange={() => {
								direction = 'forward';
								directionTouched = true;
							}}
						/>
						One-directional (→)
					</label>
					<label class="flex items-center gap-1.5">
						<input
							type="radio"
							name="direction"
							checked={direction === 'both'}
							onchange={() => {
								direction = 'both';
								directionTouched = true;
							}}
						/>
						Multi-directional (↔)
					</label>
				</div>
			</fieldset>

			<div>
				<label for="r-target" class="mb-1 block text-sm font-medium text-slate-700">To</label>
				<input
					id="r-target"
					bind:value={targetQuery}
					disabled={mode === 'edit'}
					placeholder="Search for a concept…"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
				/>
				{#if mode !== 'edit'}
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
				{/if}
			</div>

			{#if sourceConcept && targetConcept}
				<p class="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
					<strong>{sourceConcept.name}</strong>
					{currentMeta.phrase}
					<strong>{targetConcept.name}</strong>
					{#if direction === 'both'}<span class="text-slate-400">(both ways)</span>{/if}
				</p>
			{/if}

			{#if error}
				<p class="text-sm text-red-600">{error}</p>
			{/if}


			<div>
				<label for="r-description" class="mb-1 block text-sm font-medium text-slate-700"> Description of relation <span class="font-normal text-slate-400">(optional)</span></label>
				<textarea
					id="r-description"
					bind:value={description}
					maxlength="1000"
					rows="3"
					placeholder="What does this link represent?"
					class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				></textarea>
			</div>

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
				{submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create link'}
			</button>
		</div>
	</div>
</div>

