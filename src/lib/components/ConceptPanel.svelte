<script lang="ts">
	import { RELATION_META } from '$lib/shared/relations';
	import { relativeTime } from '$lib/shared/format';
	import type { ClientConcept, ClientRelation } from '$lib/shared/types';

	let {
		concept,
		concepts,
		relations,
		onClose,
		onEdit,
		onDelete,
		onAddRelation,
		onSelectConcept,
		onDeleteRelation
	}: {
		concept: ClientConcept;
		concepts: ClientConcept[];
		relations: ClientRelation[];
		onClose: () => void;
		onEdit: () => void;
		onDelete: () => void;
		onAddRelation: () => void;
		onSelectConcept: (id: string) => void;
		onDeleteRelation: (id: string) => void;
	} = $props();

	const conceptById = $derived(new Map(concepts.map((c) => [c.id, c])));

	const outgoing = $derived(relations.filter((r) => r.sourceId === concept.id));
	const incoming = $derived(relations.filter((r) => r.targetId === concept.id));

	let confirmingDelete = $state(false);
</script>

<aside class="flex h-full w-full flex-col overflow-y-auto border-l border-slate-200 bg-white">
	<div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
		<div>
			<h2 class="text-lg font-semibold text-slate-900">{concept.name}</h2>
			<p class="mt-0.5 text-xs text-slate-400">
				added by {concept.createdByName ?? 'unknown'} · {relativeTime(concept.createdAt)}
				{#if concept.updatedById !== concept.createdById || concept.updatedAt !== concept.createdAt}
					<br />edited by {concept.updatedByName ?? 'unknown'} · {relativeTime(concept.updatedAt)}
				{/if}
			</p>
		</div>
		<button onclick={onClose} class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
			✕
		</button>
	</div>

	<div class="flex-1 space-y-5 p-4">
		<section>
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Definition</h3>
			<p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">{concept.definition}</p>
			{#if concept.literatureLink}
				<a
					href={concept.literatureLink}
					target="_blank"
					rel="noopener noreferrer"
					class="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
				>
					📖 Source literature
				</a>
			{/if}
		</section>

		{#if concept.example}
			<section>
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Example</h3>
				<p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">{concept.example}</p>
			</section>
		{/if}

		{#if concept.quizQuestion}
			<section>
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Quiz question</h3>
				<p class="mt-1 whitespace-pre-wrap rounded-md bg-amber-50 p-2 text-sm text-amber-900">
					❓ {concept.quizQuestion}
				</p>
			</section>
		{/if}

		<section>
			<div class="flex items-center justify-between">
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">
					Related concepts ({outgoing.length + incoming.length})
				</h3>
				<button onclick={onAddRelation} class="text-xs font-medium text-blue-600 hover:underline">
					+ Add link
				</button>
			</div>

			{#if outgoing.length === 0 && incoming.length === 0}
				<p class="mt-2 text-sm text-slate-400">No relations yet.</p>
			{:else}
				<ul class="mt-2 space-y-1.5">
					{#each outgoing as rel (rel.id)}
						{@const other = conceptById.get(rel.targetId)}
						{@const meta = RELATION_META[rel.type]}
						<li class="group flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm">
							<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {meta.color}"></span>
							<span class="text-slate-500">{meta.phrase}</span>
							<button
								onclick={() => other && onSelectConcept(other.id)}
								class="flex-1 truncate text-left font-medium text-slate-800 hover:text-blue-600"
							>
								{other?.name ?? 'Unknown concept'}
							</button>
							<button
								onclick={() => onDeleteRelation(rel.id)}
								class="hidden text-slate-300 hover:text-red-600 group-hover:block"
								aria-label="Remove link"
							>
								✕
							</button>
						</li>
					{/each}
					{#each incoming as rel (rel.id)}
						{@const other = conceptById.get(rel.sourceId)}
						{@const meta = RELATION_META[rel.type]}
						<li class="group flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm">
							<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {meta.color}"></span>
							<button
								onclick={() => other && onSelectConcept(other.id)}
								class="flex-1 truncate text-left font-medium text-slate-800 hover:text-blue-600"
							>
								{other?.name ?? 'Unknown concept'}
							</button>
							<span class="text-slate-500">{meta.phrase} this</span>
							<button
								onclick={() => onDeleteRelation(rel.id)}
								class="hidden text-slate-300 hover:text-red-600 group-hover:block"
								aria-label="Remove link"
							>
								✕
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<div class="flex items-center gap-2 border-t border-slate-100 p-4">
		<button
			onclick={onEdit}
			class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
		>
			Edit
		</button>
		{#if confirmingDelete}
			<button
				onclick={onDelete}
				class="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
			>
				Confirm delete
			</button>
			<button
				onclick={() => (confirmingDelete = false)}
				class="rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
			>
				Cancel
			</button>
		{:else}
			<button
				onclick={() => (confirmingDelete = true)}
				class="flex-1 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
			>
				Delete
			</button>
		{/if}
	</div>
</aside>
