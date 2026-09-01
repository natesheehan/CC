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
	let definitions = $state<string[]>(
		untrack(() => {
			const parsed = initial?.definition ? initial.definition.split(/\n\s*---\s*\n|\r?\n\r?\n/) : [''];
			return parsed.length > 0 ? parsed : [''];
		})
	);
	let sourceLinks = $state<string[]>(
		untrack(() => {
			const parsed = initial?.literatureLink
				? initial.literatureLink
						.split(/[\r\n;]+/)
						.map((item) => item.trim())
						.filter(Boolean)
				: [''];
			return parsed.length > 0 ? parsed : [''];
		})
	);
	let examples = $state<string[]>(
		untrack(() => {
			const parsed = initial?.example ? initial.example.split(/\n\s*---\s*\n|\r?\n\r?\n/) : [''];
			return parsed.length > 0 ? parsed : [''];
		})
	);
	let quizQuestion = $state(untrack(() => initial?.quizQuestion ?? ''));

	let submitting = $state(false);
	let error = $state('');

	function addDefinitionField() {
		definitions = [...definitions, ''];
	}
	function addSourceField() {
		sourceLinks = [...sourceLinks, ''];
	}
	function addExampleField() {
		examples = [...examples, ''];
	}
	function removeListItem(items: string[], index: number): string[] {
		const next = items.filter((_, i) => i !== index);
		return next.length > 0 ? next : [''];
	}
	function splitMultiValue(value: string) {
		return value
			.split(/[\r\n;]+/)
			.map((part) => part.trim())
			.filter(Boolean);
	}
	function normalizeSourceLink(value: string) {
		const trimmed = value.trim();
		if (!trimmed) return '';
		if (/^https?:\/\//i.test(trimmed)) return trimmed;
		if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
		return trimmed;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (name.trim().length < 1) {
			error = 'Give the concept a name.';
			return;
		}

		const normalizedDefinitions = definitions.flatMap((value) => splitMultiValue(value));
		const normalizedSources = sourceLinks
			.flatMap((value) => splitMultiValue(value))
			.map((value) => normalizeSourceLink(value));
		const normalizedExamples = examples.flatMap((value) => splitMultiValue(value));

		submitting = true;
		try {
			await onSubmit({
				name: name.trim(),
				definition: normalizedDefinitions.join('\n\n---\n\n') || null,
				literatureLink: normalizedSources.join('\n') || null,
				example: normalizedExamples.join('\n\n---\n\n') || null,
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
				<div class="mb-1 flex items-center justify-between gap-2">
					<label for="c-def" class="block text-sm font-medium text-slate-700">Definition</label>
					<button type="button" onclick={addDefinitionField} class="text-xs font-medium text-blue-600 hover:underline">
						+ Add another
					</button>
				</div>
				{#each definitions as definition, index (index)}
					<div class="mb-2 flex gap-2">
						<textarea
							id={index === 0 ? 'c-def' : undefined}
							bind:value={definitions[index]}
							rows="3"
							placeholder="A precise, sourced definition of this concept…"
							class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						></textarea>
						{#if definitions.length > 1}
							<button
								type="button"
								onclick={() => (definitions = removeListItem(definitions, index))}
								class="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
							>
								Remove
							</button>
						{/if}
					</div>
				{/each}
			</div>

			<div>
				<div class="mb-1 flex items-center justify-between gap-2">
					<label for="c-lit" class="block text-sm font-medium text-slate-700">Sources</label>
					<button type="button" onclick={addSourceField} class="text-xs font-medium text-blue-600 hover:underline">
						+ Add another
					</button>
				</div>
				{#each sourceLinks as sourceLink, index (index)}
					<div class="mb-2 flex gap-2">
						<input
							id={index === 0 ? 'c-lit' : undefined}
							bind:value={sourceLinks[index]}
							type="url"
							placeholder="https://doi.org/…"
							class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
						{#if sourceLinks.length > 1}
							<button
								type="button"
								onclick={() => (sourceLinks = removeListItem(sourceLinks, index))}
								class="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
							>
								Remove
							</button>
						{/if}
					</div>
				{/each}
			</div>

			<div>
				<div class="mb-1 flex items-center justify-between gap-2">
					<label for="c-example" class="block text-sm font-medium text-slate-700">Example</label>
					<button type="button" onclick={addExampleField} class="text-xs font-medium text-blue-600 hover:underline">
						+ Add another
					</button>
				</div>
				{#each examples as example, index (index)}
					<div class="mb-2 flex gap-2">
						<textarea
							id={index === 0 ? 'c-example' : undefined}
							bind:value={examples[index]}
							rows="2"
							placeholder="A concrete example that illustrates the concept…"
							class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						></textarea>
						{#if examples.length > 1}
							<button
								type="button"
								onclick={() => (examples = removeListItem(examples, index))}
								class="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
							>
								Remove
							</button>
						{/if}
					</div>
				{/each}
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
