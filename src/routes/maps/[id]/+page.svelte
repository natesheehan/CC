<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import GraphCanvas from '$lib/components/GraphCanvas.svelte';
	import ConceptPanel from '$lib/components/ConceptPanel.svelte';
	import ConceptFormModal from '$lib/components/ConceptFormModal.svelte';
	import RelationFormModal from '$lib/components/RelationFormModal.svelte';
	import ActivityFeed from '$lib/components/ActivityFeed.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import { RELATION_META } from '$lib/shared/relations';
	import type { ConceptInput, ClientConcept } from '$lib/shared/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let selectedConceptId: string | null = $state(null);
	let rightPanel: 'none' | 'concept' | 'activity' = $state('none');
	let showLegend = $state(true);

	let conceptModal: { mode: 'create' | 'edit'; initial?: ClientConcept } | null = $state(null);
	let relationModal: { sourceId?: string } | null = $state(null);

	let graphRef: GraphCanvas | undefined = $state();

	const selectedConcept = $derived(data.concepts.find((c) => c.id === selectedConceptId) ?? null);

	function selectConcept(id: string) {
		selectedConceptId = id;
		rightPanel = 'concept';
	}

	async function api(url: string, options: RequestInit = {}) {
		const res = await fetch(url, {
			...options,
			headers: { 'Content-Type': 'application/json', ...options.headers }
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message ?? `Request failed (${res.status})`);
		}
		return res.status === 204 ? null : res.json();
	}

	async function createConcept(input: ConceptInput) {
		const created = await api(`/maps/${data.map.id}/concepts`, {
			method: 'POST',
			body: JSON.stringify(input)
		});
		await invalidateAll();
		conceptModal = null;
		selectConcept(created.id);
	}

	async function updateConcept(id: string, input: ConceptInput) {
		await api(`/maps/${data.map.id}/concepts/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(input)
		});
		await invalidateAll();
		conceptModal = null;
	}

	async function deleteConcept(id: string) {
		await api(`/maps/${data.map.id}/concepts/${id}`, { method: 'DELETE' });
		if (selectedConceptId === id) {
			selectedConceptId = null;
			rightPanel = 'none';
		}
		await invalidateAll();
	}

	async function createRelation(input: { sourceId: string; targetId: string; type: string }) {
		await api(`/maps/${data.map.id}/relations`, {
			method: 'POST',
			body: JSON.stringify(input)
		});
		await invalidateAll();
		relationModal = null;
	}

	async function deleteRelation(id: string) {
		await api(`/maps/${data.map.id}/relations/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	function moveConcept(id: string, x: number, y: number) {
		// Fire and forget: position is not a tracked content edit.
		fetch(`/maps/${data.map.id}/concepts/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ x, y })
		}).catch(() => {});
	}
</script>

<svelte:head>
	<title>{data.map.name} · Concept Cartography</title>
</svelte:head>

<div class="flex flex-1 flex-col overflow-hidden">
	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
		<a href="/" class="text-slate-400 hover:text-slate-600" aria-label="Back to maps">←</a>
		<div class="min-w-0">
			<h1 class="truncate font-semibold text-slate-800">{data.map.name}</h1>
		</div>

		<div class="ml-auto flex flex-wrap items-center gap-2">
			<SearchBar concepts={data.concepts} onSelect={selectConcept} />

			<button
				onclick={() => (conceptModal = { mode: 'create' })}
				class="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
			>
				<span class="leading-none">+</span> Concept
			</button>

			<button
				onclick={() => (relationModal = { sourceId: selectedConceptId ?? undefined })}
				disabled={data.concepts.length < 2}
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
			>
				Link concepts
			</button>

			<button
				onclick={() => graphRef?.reArrange()}
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				Auto-arrange
			</button>

			<button
				onclick={() => (rightPanel = rightPanel === 'activity' ? 'none' : 'activity')}
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 {rightPanel === 'activity'
					? 'bg-slate-100 text-slate-900'
					: 'text-slate-700'}"
			>
				Activity
			</button>
		</div>
	</div>

	<!-- Body -->
	<div class="relative flex flex-1 overflow-hidden">
		<div class="relative flex-1">
			{#if data.concepts.length === 0}
				<div class="flex h-full flex-col items-center justify-center px-4 text-center">
					<p class="text-slate-500">This map is empty. Add your first concept to get started.</p>
					<button
						onclick={() => (conceptModal = { mode: 'create' })}
						class="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						Add a concept
					</button>
				</div>
			{:else}
				<GraphCanvas
					bind:this={graphRef}
					concepts={data.concepts}
					relations={data.relations}
					selectedId={selectedConceptId}
					onSelect={selectConcept}
					onNodeMoved={moveConcept}
				/>
			{/if}

			{#if showLegend && data.concepts.length > 0}
				<div class="absolute bottom-4 left-4 max-w-[220px] rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-sm backdrop-blur">
					<div class="mb-1.5 flex items-center justify-between">
						<span class="font-semibold text-slate-600">Relation types</span>
						<button onclick={() => (showLegend = false)} class="text-slate-300 hover:text-slate-500" aria-label="Hide legend">✕</button>
					</div>
					<ul class="space-y-1">
						{#each Object.entries(RELATION_META) as [key, meta] (key)}
							<li class="flex items-center gap-1.5 text-slate-600">
								<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {meta.color}"></span>
								{meta.label}
								{#if !meta.directional}<span class="text-slate-300">(mutual)</span>{/if}
							</li>
						{/each}
					</ul>
				</div>
			{:else if !showLegend && data.concepts.length > 0}
				<button
					onclick={() => (showLegend = true)}
					class="absolute bottom-4 left-4 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm hover:text-slate-700"
				>
					Show legend
				</button>
			{/if}
		</div>

		{#if rightPanel === 'concept' && selectedConcept}
			<div class="w-full max-w-sm shrink-0">
				<ConceptPanel
					concept={selectedConcept}
					concepts={data.concepts}
					relations={data.relations}
					onClose={() => (rightPanel = 'none')}
					onEdit={() => (conceptModal = { mode: 'edit', initial: selectedConcept! })}
					onDelete={() => deleteConcept(selectedConcept!.id)}
					onAddRelation={() => (relationModal = { sourceId: selectedConcept!.id })}
					onSelectConcept={selectConcept}
					onDeleteRelation={deleteRelation}
				/>
			</div>
		{:else if rightPanel === 'activity'}
			<div class="w-full max-w-sm shrink-0">
				<ActivityFeed activity={data.activity} onClose={() => (rightPanel = 'none')} />
			</div>
		{/if}
	</div>
</div>

{#if conceptModal}
	<ConceptFormModal
		mode={conceptModal.mode}
		initial={conceptModal.initial}
		onClose={() => (conceptModal = null)}
		onSubmit={(input) =>
			conceptModal!.mode === 'create' ? createConcept(input) : updateConcept(conceptModal!.initial!.id, input)}
	/>
{/if}

{#if relationModal}
	<RelationFormModal
		concepts={data.concepts}
		defaultSourceId={relationModal.sourceId}
		onClose={() => (relationModal = null)}
		onSubmit={createRelation}
	/>
{/if}
