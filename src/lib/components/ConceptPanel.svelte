<script lang="ts">
	import { RELATION_META } from '$lib/shared/relations';
	import { relativeTime } from '$lib/shared/format';
	import type { ClientConcept, ClientRelation } from '$lib/shared/types';

	let {
		concept,
		concepts,
		relations,
		relationMeta = RELATION_META,
		shareUrl,
		onClose,
		onEdit,
		onDelete,
		onAddRelation,
		onSelectConcept,
		onDeleteRelation,
		onEditRelation,
		onOpenComments
	}: {
		concept: ClientConcept;
		concepts: ClientConcept[];
		relations: ClientRelation[];
		relationMeta?: Record<string, { label: string; phrase: string; color: string; directional: boolean }>;
		shareUrl?: string;
		onClose: () => void;
		onEdit: () => void;
		onDelete: () => void;
		onAddRelation: () => void;
		onSelectConcept: (id: string) => void;
		onDeleteRelation: (id: string) => void;
		onEditRelation?: (rel: ClientRelation) => void;
		onOpenComments?: (rel: ClientRelation) => void;
	} = $props();

	const conceptById = $derived(new Map(concepts.map((c) => [c.id, c])));
	const definitionBlocks = $derived(
		(concept.definition ?? '')
			.split(/\n\s*---\s*\n|\r?\n\r?\n/)
			.map((segment) => segment.trim())
			.filter(Boolean)
	);
	const sourceLinks = $derived(
		(concept.literatureLink ?? '')
			.split(/[\r\n;]+/)
			.map((link) => link.trim())
			.filter(Boolean)
	);
	const exampleBlocks = $derived(
		(concept.example ?? '')
			.split(/\n\s*---\s*\n|\r?\n\r?\n/)
			.map((segment) => segment.trim())
			.filter(Boolean)
	);
	const quizBlocks = $derived(
		(concept.quizQuestion ?? '')
			.split(/\n\s*---\s*\n|\r?\n\r?\n/)
			.map((segment) => segment.trim())
			.filter(Boolean)
	);

	const outgoing = $derived(relations.filter((r) => r.sourceId === concept.id));
	const incoming = $derived(relations.filter((r) => r.targetId === concept.id));

	interface RelationRow {
		rel: ClientRelation;
		other: ClientConcept | undefined;
		asSource: boolean;
	}

	// Aggregate every relation touching this concept into explorable groups
	// keyed by relation type, so e.g. all 5 "type of" links show together.
	const groupedRelations = $derived.by(() => {
		const rows: RelationRow[] = [
			...outgoing.map((rel) => ({ rel, other: conceptById.get(rel.targetId), asSource: true })),
			...incoming.map((rel) => ({ rel, other: conceptById.get(rel.sourceId), asSource: false }))
		];
		const groups = new Map<string, RelationRow[]>();
		for (const row of rows) {
			const list = groups.get(row.rel.type) ?? [];
			list.push(row);
			groups.set(row.rel.type, list);
		}
		return Array.from(groups.entries())
			.map(([type, items]) => ({ type, meta: relationMeta[type] ?? { label: type, phrase: type, color: '#64748b', directional: true }, items }))
			.sort((a, b) => b.items.length - a.items.length);
	});

	let confirmingDelete = $state(false);
	let linkCopied = $state(false);

	async function copyConceptLink() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 1500);
		} catch {
			// clipboard API may be unavailable; ignore silently
		}
	}
</script>

<aside class="flex h-full w-full flex-col overflow-y-auto border-l border-slate-200 bg-white">
	<div class="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
		<div class="min-w-0">
			<div class="flex items-center gap-1.5">
				<h2 class="truncate text-lg font-semibold text-slate-900">{concept.name}</h2>
				{#if shareUrl}
					<button
						onclick={copyConceptLink}
						class="shrink-0 text-xs text-slate-300 hover:text-blue-600"
						title="Copy link to this concept"
						aria-label="Copy link to this concept"
					>
						{linkCopied ? '✓' : '🔗'}
					</button>
				{/if}
			</div>
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
			{#if definitionBlocks.length > 0}
				<div class="mt-1 space-y-2">
					{#each definitionBlocks as block (block)}
						<p class="whitespace-pre-wrap text-sm text-slate-700">{block}</p>
					{/each}
				</div>
			{:else}
				<p class="mt-1 text-sm text-slate-400">No definition added yet.</p>
			{/if}
			{#if sourceLinks.length > 0}
				<div class="mt-2 space-y-1">
					{#each sourceLinks as sourceLink (sourceLink)}
						<a
							href={sourceLink}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
						>
							📖 {sourceLink}
						</a>
					{/each}
				</div>
			{/if}
		</section>

		{#if exampleBlocks.length > 0}
			<section>
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Examples</h3>
				<div class="mt-1 space-y-2">
					{#each exampleBlocks as block (block)}
						<p class="whitespace-pre-wrap text-sm text-slate-700">{block}</p>
					{/each}
				</div>
			</section>
		{/if}

		{#if quizBlocks.length > 0}
			<section>
				<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Quiz question{quizBlocks.length > 1 ? 's' : ''}</h3>
				<div class="mt-1 space-y-2">
					{#each quizBlocks as block (block)}
						<p class="whitespace-pre-wrap rounded-md bg-amber-50 p-2 text-sm text-amber-900">
							❓ {block}
						</p>
					{/each}
				</div>
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

			{#if groupedRelations.length === 0}
				<p class="mt-2 text-sm text-slate-400">No relations yet.</p>
			{:else}
				<div class="mt-2 space-y-2">
					{#each groupedRelations as group (group.type)}
						<details open class="rounded-md border border-slate-100">
							<summary class="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-sm">
								<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {group.meta.color}"></span>
								<span class="font-medium text-slate-700">{group.meta.label}</span>
								<span class="text-xs text-slate-400">({group.items.length})</span>
							</summary>
							<ul class="space-y-1 border-t border-slate-100 p-1.5">
								{#each group.items as row (row.rel.id)}
									<li class="group flex items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50">
										<span class="mt-0.5 shrink-0 text-xs text-slate-400" title={row.rel.direction === 'both' ? 'Multi-directional' : 'One-directional'}>
											{row.rel.direction === 'both' ? '↔' : row.asSource ? '→' : '←'}
										</span>
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-1.5">
												{#if row.asSource}
													<span class="text-slate-500">{group.meta.phrase}</span>
													<button
														onclick={() => row.other && onSelectConcept(row.other.id)}
														class="truncate text-left font-medium text-slate-800 hover:text-blue-600"
													>
														{row.other?.name ?? 'Unknown concept'}
													</button>
												{:else}
													<button
														onclick={() => row.other && onSelectConcept(row.other.id)}
														class="truncate text-left font-medium text-slate-800 hover:text-blue-600"
													>
														{row.other?.name ?? 'Unknown concept'}
													</button>
													<span class="text-slate-500">{group.meta.phrase} this</span>
												{/if}
											</div>
											{#if row.rel.description}
												<p class="mt-1 whitespace-pre-wrap text-xs text-slate-500">{row.rel.description}</p>
											{/if}
											<p class="mt-1 text-[11px] text-slate-300">
												added by {row.rel.createdByName ?? 'unknown'}
												{#if row.rel.updatedByName && row.rel.updatedById !== row.rel.createdById}
													· edited by {row.rel.updatedByName}
												{/if}
											</p>
										</div>
										<div class="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
											{#if onOpenComments}
												<button
													onclick={() => onOpenComments?.(row.rel)}
													class="rounded px-1 text-xs text-slate-400 hover:text-blue-600"
													title="Comments"
												>
													💬{row.rel.commentCount ? row.rel.commentCount : ''}
												</button>
											{/if}
											{#if onEditRelation}
												<button
													onclick={() => onEditRelation?.(row.rel)}
													class="rounded px-1 text-xs text-slate-400 hover:text-blue-600"
													title="Edit relation"
												>
													✎
												</button>
											{/if}
											<button
												onclick={() => onDeleteRelation(row.rel.id)}
												class="rounded px-1 text-xs text-slate-300 hover:text-red-600"
												aria-label="Remove link"
											>
												✕
											</button>
										</div>
									</li>
								{/each}
							</ul>
						</details>
					{/each}
				</div>
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

