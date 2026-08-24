<script lang="ts">
	import { untrack } from 'svelte';
	import type { ConceptInput, ClientConcept } from '$lib/shared/types';

	let {
		mode,
		initial,
		onSubmit,
		onClose
	}: {
		mode: 'create' | 'edit';
		initial?: ClientConcept;
		onSubmit: (data: ConceptInput) => Promise<void> | void;
		onClose: () => void;
	} = $props();

	let name = $state(untrack(() => initial?.name ?? ''));
	let definition = $state(untrack(() => initial?.definition ?? ''));
	let literatureLink = $state(untrack(() => initial?.literatureLink ?? ''));
	let example = $state(untrack(() => initial?.example ?? ''));
	let quizQuestion = $state(untrack(() => initial?.quizQuestion ?? ''));

	let submitting = $state(false);
	let error = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (name.trim().length < 1) {
			error = 'Give the concept a name.';
			return;
		}
		if (definition.trim().length < 1) {
			error = 'A definition is required.';
			return;
		}

		submitting = true;
		try {
			await onSubmit({
				name: name.trim(),
				definition: definition.trim(),
				literatureLink: literatureLink.trim() || null,
				example: example.trim() || null,
				quizQuestion: quizQuestion.trim() || null
			});
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong.';
			submitting = false;
			return;
		}
		submitting = false;
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
	<div class="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
		<div class="border-b border-slate-100 px-6 py-4">
			<h2 class="text-lg font-semibold text-slate-800">
				{mode === 'create' ? 'Add a concept' : 'Edit concept'}
			</h2>
		</div>

		<form id="concept-form" onsubmit={handleSubmit} class="flex-1 space-y-4 overflow-y-auto px-6 py-4">
			<div>
				<label for="c-name" class="mb-1 block text-sm font-medium text-slate-700">Concept name</label>
				<input
					id="c-name"
					bind:value={name}
					required
					maxlength="200"
					placeholder="e.g. Homeostasis"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="c-def" class="mb-1 block text-sm font-medium text-slate-700">Definition</label>
				<textarea
					id="c-def"
					bind:value={definition}
					required
					rows="3"
					placeholder="A precise, sourced definition of this concept…"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				></textarea>
			</div>

			<div>
				<label for="c-lit" class="mb-1 block text-sm font-medium text-slate-700">
					Literature link <span class="font-normal text-slate-400">(where the definition is from)</span>
				</label>
				<input
					id="c-lit"
					bind:value={literatureLink}
					type="url"
					placeholder="https://doi.org/…"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="c-example" class="mb-1 block text-sm font-medium text-slate-700">
					Example <span class="font-normal text-slate-400">(optional)</span>
				</label>
				<textarea
					id="c-example"
					bind:value={example}
					rows="2"
					placeholder="A concrete example that illustrates the concept…"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				></textarea>
			</div>

			<div>
				<label for="c-quiz" class="mb-1 block text-sm font-medium text-slate-700">
					Quiz question <span class="font-normal text-slate-400">(optional)</span>
				</label>
				<textarea
					id="c-quiz"
					bind:value={quizQuestion}
					rows="2"
					placeholder="A question someone could use to test their understanding of this concept…"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				></textarea>
			</div>

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
				form="concept-form"
				disabled={submitting}
				class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
			>
				{submitting ? 'Saving…' : mode === 'create' ? 'Add concept' : 'Save changes'}
			</button>
		</div>
	</div>
</div>
