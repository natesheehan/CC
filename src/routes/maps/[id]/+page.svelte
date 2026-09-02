<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { untrack } from 'svelte';
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

	// --- rename map -------------------------------------------------------------
	let editingMapName = $state(false);
	let mapNameDraft = $state(untrack(() => data.map.name));
	let savingMapName = $state(false);
	let mapNameError = $state('');
	let mapNameInputEl: HTMLInputElement | undefined = $state();

	function startEditingMapName() {
		mapNameDraft = data.map.name;
		mapNameError = '';
		editingMapName = true;
	}

	$effect(() => {
		if (editingMapName) mapNameInputEl?.focus();
	});

	async function saveMapName() {
		const name = mapNameDraft.trim();
		if (!name || name === data.map.name) {
			editingMapName = false;
			return;
		}
		savingMapName = true;
		mapNameError = '';
		try {
			await api(`/maps/${data.map.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
			await invalidateAll();
			editingMapName = false;
		} catch (err) {
			mapNameError = err instanceof Error ? err.message : 'Could not rename the map.';
		}
		savingMapName = false;
	}

	// --- delete map -------------------------------------------------------------
	let confirmDeleteMap = $state(false);
	let deletingMap = $state(false);
	let deleteMapError = $state('');

	async function deleteMap() {
		deletingMap = true;
		deleteMapError = '';
		try {
			await api(`/maps/${data.map.id}`, { method: 'DELETE' });
			await goto('/');
		} catch (err) {
			deleteMapError = err instanceof Error ? err.message : 'Could not delete the map.';
			deletingMap = false;
		}
	}

	// --- export -------------------------------------------------------------
	let showExportMenu = $state(false);
	let exportMenuEl: HTMLDivElement | undefined = $state();

	function exportAs(kind: 'svg' | 'png') {
		const filename = `${data.map.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'concept-map'}.${kind}`;
		if (kind === 'svg') {
			graphRef?.exportSVG(filename);
		} else {
			graphRef?.exportPNG(filename);
		}
		showExportMenu = false;
	}

	function onWindowClick(e: MouseEvent) {
		if (showExportMenu && exportMenuEl && !exportMenuEl.contains(e.target as Node)) {
			showExportMenu = false;
		}
	}
</script>

<svelte:window onclick={onWindowClick} />

<svelte:head>
	<title>{data.map.name} · Concept Cartography</title>
</svelte:head>

<div class="flex flex-1 flex-col overflow-hidden">
	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
		<a href="/" class="text-slate-400 hover:text-slate-600" aria-label="Back to maps">←</a>

		<div class="min-w-0">
			{#if editingMapName}
				<div class="flex items-center gap-1.5">
					<input
						bind:this={mapNameInputEl}
						bind:value={mapNameDraft}
						onblur={saveMapName}
						onkeydown={(e) => {
							if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
							if (e.key === 'Escape') {
								editingMapName = false;
							}
						}}
						disabled={savingMapName}
						class="rounded-md border border-blue-300 px-2 py-1 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				{#if mapNameError}
					<p class="mt-0.5 text-xs text-red-600">{mapNameError}</p>
				{/if}
			{:else}
				<button onclick={startEditingMapName} class="group flex items-center gap-1.5" aria-label="Rename map">
					<h1 class="truncate font-semibold text-slate-800 group-hover:text-blue-600">{data.map.name}</h1>
					<span class="text-slate-300 group-hover:text-slate-500">✎</span>
				</button>
			{/if}
		</div>

		<button
			onclick={() => (confirmDeleteMap = true)}
			class="text-slate-300 hover:text-red-600"
			aria-label="Delete map"
			title="Delete map"
		>
			🗑
		</button>

		<div class="ml-auto flex flex-wrap items-center gap-2">
			<SearchBar concepts={data.concepts} onSelect={selectConcept} />

			<button
				onclick={() => (conceptModal = { mode: 'create' })}
				class="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
			>
				<span class="text-base leading-none">+</span>
				<span>Concept</span>
			</button>

			<button
				onclick={() => (relationModal = { sourceId: selectedConceptId ?? undefined })}
				disabled={data.concepts.length < 2}
				class="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
			>
				Link concepts
			</button>


			<div class="relative" bind:this={exportMenuEl}>
				<button
					onclick={() => (showExportMenu = !showExportMenu)}
					disabled={data.concepts.length === 0}
					class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
				>
					Export
				</button>
				{#if showExportMenu}
					<div class="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
						<button
							onclick={() => exportAs('png')}
							class="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
						>
							Export as PNG
						</button>
						<button
							onclick={() => exportAs('svg')}
							class="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
						>
							Export as SVG
						</button>
					</div>
				{/if}
			</div>

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
				<div class="absolute top-4 left-4 max-w-[220px] rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-sm backdrop-blur">
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
					class="absolute top-4 left-4 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm hover:text-slate-700"
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

{#if confirmDeleteMap}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
		<div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
			<h2 class="text-lg font-semibold text-slate-800">Delete this map?</h2>
			<p class="mt-2 text-sm text-slate-500">
				This permanently deletes "{data.map.name}" and all {data.concepts.length}
				concept{data.concepts.length === 1 ? '' : 's'} and {data.relations.length}
				link{data.relations.length === 1 ? '' : 's'} in it. This can't be undone.
			</p>

			{#if deleteMapError}
				<p class="mt-2 text-sm text-red-600">{deleteMapError}</p>
			{/if}

			<div class="mt-4 flex justify-end gap-2">
				<button
					onclick={() => (confirmDeleteMap = false)}
					disabled={deletingMap}
					class="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
				>
					Cancel
				</button>
				<button
					onclick={deleteMap}
					disabled={deletingMap}
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
				>
					{deletingMap ? 'Deleting…' : 'Delete map'}
				</button>
			</div>
		</div>
	</div>
{/if}