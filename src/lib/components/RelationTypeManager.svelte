<script lang="ts">
	import { RELATION_TYPES, RELATION_META, type CustomRelationType } from '$lib/shared/relations';

	let {
		mapId,
		customTypes,
		onClose,
		onCreate,
		onUpdate,
		onDelete
	}: {
		mapId: string;
		customTypes: CustomRelationType[];
		onClose: () => void;
		onCreate: (data: {
			label: string;
			phrase: string;
			color: string;
			directional: boolean;
			description: string;
		}) => Promise<void> | void;
		onUpdate: (
			id: string,
			data: { label: string; phrase: string; color: string; directional: boolean; description: string }
		) => Promise<void> | void;
		onDelete: (id: string) => Promise<void> | void;
	} = $props();

	let label = $state('');
	let phrase = $state('');
	let color = $state('#2563eb');
	let directional = $state(true);
	let description = $state('');
	let creating = $state(false);
	let error = $state('');

	let editingId: string | null = $state(null);
	let editDraft = $state({ label: '', phrase: '', color: '#2563eb', directional: true, description: '' });
	let savingEditId: string | null = $state(null);
	let deletingId: string | null = $state(null);
	let deleteError = $state('');

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!label.trim() || !phrase.trim()) {
			error = 'Label and phrase are required.';
			return;
		}
		creating = true;
		try {
			await onCreate({ label: label.trim(), phrase: phrase.trim(), color, directional, description: description.trim() });
			label = '';
			phrase = '';
			color = '#2563eb';
			directional = true;
			description = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not create the relation type.';
		}
		creating = false;
	}

	function startEdit(t: CustomRelationType) {
		editingId = t.id;
		editDraft = {
			label: t.label,
			phrase: t.phrase,
			color: t.color,
			directional: t.directional,
			description: t.description ?? ''
		};
	}

	async function saveEdit(id: string) {
		savingEditId = id;
		error = '';
		try {
			await onUpdate(id, editDraft);
			editingId = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save changes.';
		}
		savingEditId = null;
	}

	async function handleDelete(id: string) {
		deletingId = id;
		deleteError = '';
		try {
			await onDelete(id);
		} catch (err) {
			deleteError = err instanceof Error ? err.message : 'Could not delete this relation type.';
		}
		deletingId = null;
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
	<div class="cc-panel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
		<div class="cc-stripe shrink-0"></div>
		<div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
			<h2 class="text-lg font-semibold text-slate-800">Relation types</h2>
			<button onclick={onClose} class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
				✕
			</button>
		</div>

		<div class="space-y-4 px-6 py-4">
			<section>
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Built-in types</h3>
				<ul class="mt-2 space-y-1">
					{#each RELATION_TYPES as key (key)}
						{@const meta = RELATION_META[key]}
						<li class="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm text-slate-600">
							<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {meta.color}"></span>
							<span class="font-medium text-slate-700">{meta.label}</span>
							<span class="text-slate-400">— {meta.phrase}</span>
							<span class="ml-auto text-xs text-slate-300">built-in</span>
						</li>
					{/each}
				</ul>
			</section>

			<section>
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Custom types for this map</h3>
				{#if deleteError}
					<p class="mt-1 text-sm text-red-600">{deleteError}</p>
				{/if}
				{#if customTypes.length === 0}
					<p class="mt-2 text-sm text-slate-400">No custom relation types yet.</p>
				{:else}
					<ul class="mt-2 space-y-1.5">
						{#each customTypes as t (t.id)}
							{#if editingId === t.id}
								<li class="space-y-2 rounded-md border border-blue-200 bg-blue-50/40 p-2">
									<div class="flex gap-2">
										<input bind:value={editDraft.label} placeholder="Label" class="w-1/2 rounded-md border border-slate-300 px-2 py-1 text-sm" />
										<input bind:value={editDraft.phrase} placeholder="Phrase" class="w-1/2 rounded-md border border-slate-300 px-2 py-1 text-sm" />
									</div>
									<div class="flex items-center gap-2">
										<input type="color" bind:value={editDraft.color} class="h-8 w-10 rounded border border-slate-300" />
										<label class="flex items-center gap-1.5 text-xs text-slate-600">
											<input type="checkbox" bind:checked={editDraft.directional} />
											Directional by default
										</label>
									</div>
									<textarea
										bind:value={editDraft.description}
										placeholder="Description (optional)"
										rows="2"
										class="w-full resize-y rounded-md border border-slate-300 px-2 py-1 text-sm"
									></textarea>
									<div class="flex justify-end gap-2">
										<button onclick={() => (editingId = null)} class="rounded-md px-3 py-1 text-xs text-slate-500 hover:bg-slate-100">
											Cancel
										</button>
										<button
											onclick={() => saveEdit(t.id)}
											disabled={savingEditId === t.id}
											class="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
										>
											{savingEditId === t.id ? 'Saving…' : 'Save'}
										</button>
									</div>
								</li>
							{:else}
								<li class="group flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm">
									<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {t.color}"></span>
									<div class="min-w-0 flex-1">
										<span class="font-medium text-slate-700">{t.label}</span>
										<span class="text-slate-400">— {t.phrase}</span>
										{#if t.createdByName}<span class="ml-1 text-xs text-slate-300">by {t.createdByName}</span>{/if}
									</div>
									<button onclick={() => startEdit(t)} class="text-xs text-blue-600 hover:underline">Edit</button>
									<button
										onclick={() => handleDelete(t.id)}
										disabled={deletingId === t.id}
										class="text-slate-300 hover:text-red-600"
										aria-label="Delete relation type"
									>
										✕
									</button>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
			</section>

			<section class="border-t border-slate-100 pt-4">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Add a custom relation type</h3>
				<form onsubmit={handleCreate} class="mt-2 space-y-2">
					<div class="flex gap-2">
						<input
							bind:value={label}
							placeholder="Label (e.g. Contrasts with)"
							class="w-1/2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
						/>
						<input
							bind:value={phrase}
							placeholder="Phrase (e.g. contrasts with)"
							class="w-1/2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
						/>
					</div>
					<div class="flex items-center gap-3">
						<input type="color" bind:value={color} class="h-8 w-10 rounded border border-slate-300" />
						<label class="flex items-center gap-1.5 text-xs text-slate-600">
							<input type="checkbox" bind:checked={directional} />
							Directional by default (single arrow)
						</label>
					</div>
					<textarea
						bind:value={description}
						placeholder="Description (optional)"
						rows="2"
						class="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm"
					></textarea>
					{#if error}<p class="text-sm text-red-600">{error}</p>{/if}
					<button
						type="submit"
						disabled={creating}
						class="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
					>
						{creating ? 'Adding…' : 'Add relation type'}
					</button>
				</form>
			</section>
		</div>

		<div class="flex justify-end border-t border-slate-100 px-6 py-4">
			<button onclick={onClose} class="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Done</button>
		</div>
	</div>
</div>
