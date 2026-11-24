<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import GraphCanvas from '$lib/components/GraphCanvas.svelte';
	import ConceptPanel from '$lib/components/ConceptPanel.svelte';
	import ConceptFormModal from '$lib/components/ConceptFormModal.svelte';
	import RelationFormModal from '$lib/components/RelationFormModal.svelte';
	import RelationTypeManager from '$lib/components/RelationTypeManager.svelte';
	import RelationCommentsModal from '$lib/components/RelationCommentsModal.svelte';
	import ActivityFeed from '$lib/components/ActivityFeed.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import MapStats from '$lib/components/MapStats.svelte';
	import MapHelp from '$lib/components/MapHelp.svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import MapContextMenu, { type MenuItem, type MenuSection } from '$lib/components/MapContextMenu.svelte';
	import LivePresence from '$lib/components/LivePresence.svelte';
	import LiveToasts, { type LiveToast } from '$lib/components/LiveToasts.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import VersionsPanel from '$lib/components/VersionsPanel.svelte';
	import { VISIBILITY_META } from '$lib/shared/access';
	import type { CustomRelationType } from '$lib/shared/relations';
	import { LiveSession, describePeer } from '$lib/client/live.svelte';
	import { RELATION_TYPES, mergeRelationMeta } from '$lib/shared/relations';
	import type {
		ConceptInput,
		ClientActivityEntry,
		ClientConcept,
		ClientRelation,
		ClientRelationComment,
		ClientMapVersion,
		LivePeer,
		MapSnapshot
	} from '$lib/shared/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// --- access & version preview ---------------------------------------------
	// While previewing a saved version the canvas shows that snapshot instead
	// of the live map, read-only. Everything that displays the map reads the
	// view* values below; mutations and live bookkeeping keep using `data`.
	type Preview = {
		version: ClientMapVersion;
		concepts: ClientConcept[];
		relations: ClientRelation[];
		relationTypes: CustomRelationType[];
	};
	let preview = $state<Preview | null>(null);
	const viewConcepts = $derived(preview?.concepts ?? data.concepts);
	const viewRelations = $derived(preview?.relations ?? data.relations);
	const viewRelationTypes = $derived(preview?.relationTypes ?? data.relationTypes);
	/** Server-granted: may this person edit the live map? */
	const canEditMap = $derived(data.access.canEdit);
	/** May they edit what's on screen right now (never a preview)? */
	const editable = $derived(canEditMap && !preview);
	let shareOpen = $state(false);
	let versionsRefreshKey = $state(0);
	/** Bumped to remount the canvas so it adopts server positions wholesale (after a restore). */
	let canvasEpoch = $state(0);

	let selectedConceptId: string | null = $state(null);
	let centralConceptId: string | null = $state(null);
	let rightPanel = $state<'none' | 'concept' | 'activity' | 'versions'>('none');
	let showLegend = $state(true);
	const relationMeta = $derived(mergeRelationMeta(viewRelationTypes));
	let visibleRelationTypes = $state<Set<string>>(new Set(RELATION_TYPES));

	let conceptModal: {
		mode: 'create' | 'edit';
		initial?: ClientConcept;
		/** Graph-space position for "Add concept here" from the right-click menu. */
		position?: { x: number; y: number };
	} | null = $state(null);
	let relationModal: { mode: 'create' | 'edit'; sourceId?: string; initial?: ClientRelation } | null = $state(null);
	let relationTypeManagerOpen = $state(false);
	let commentsRelation: ClientRelation | null = $state(null);
	let selectedRelationId: string | null = $state(null);

	let graphRef: GraphCanvas | undefined = $state();

	const selectedConcept = $derived(viewConcepts.find((c) => c.id === selectedConceptId) ?? null);
	const centralConcept = $derived(viewConcepts.find((c) => c.id === centralConceptId) ?? null);
	const visibleRelations = $derived(viewRelations.filter((relation) => visibleRelationTypes.has(relation.type)));

	// Legend entries, split into built-in vs. map-specific ("Community
	// labels") types and ordered within each group by how many relations
	// currently use that type (most-used first).
	const relationTypeCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const r of viewRelations) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
		return counts;
	});
	const builtInLegend = $derived(
		RELATION_TYPES.map((key) => ({ key, meta: relationMeta[key], count: relationTypeCounts.get(key) ?? 0 })).sort(
			(a, b) => b.count - a.count
		)
	);
	const communityLegend = $derived(
		viewRelationTypes
			.map((t) => ({ key: t.key, meta: relationMeta[t.key], count: relationTypeCounts.get(t.key) ?? 0 }))
			.sort((a, b) => b.count - a.count)
	);

	// New custom relation types should be visible by default alongside built-ins.
	$effect(() => {
		const known = new Set(visibleRelationTypes);
		let changed = false;
		for (const t of viewRelationTypes) {
			if (!known.has(t.key)) {
				known.add(t.key);
				changed = true;
			}
		}
		if (changed) visibleRelationTypes = known;
	});

	function toggleRelationType(type: string) {
		const next = new Set(visibleRelationTypes);
		if (next.has(type)) next.delete(type);
		else next.add(type);
		visibleRelationTypes = next;
	}

	function updateUrlParam(key: 'concept' | 'relation', value: string | null) {
		const url = new URL(page.url);
		if (value) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
		goto(url, { replaceState: false, noScroll: true, keepFocus: true });
	}

	function selectConcept(id: string) {
		selectedConceptId = id;
		rightPanel = 'concept';
		updateUrlParam('concept', id);
	}

	// Search results also bring the chosen concept into view.
	// Single click: just highlight. If the details panel is already open it
	// follows the selection; otherwise details only open on double-click.
	function highlightConcept(id: string) {
		selectedConceptId = id;
		if (rightPanel === 'concept') updateUrlParam('concept', id);
	}

	function clearSelection() {
		if (!selectedConceptId) return;
		selectedConceptId = null;
		if (rightPanel === 'concept') {
			rightPanel = 'none';
			updateUrlParam('concept', null);
		}
	}

	async function searchSelect(id: string) {
		selectConcept(id);
		// Wait for the details panel to take its space before centring, or
		// the node lands off-centre in the narrower canvas.
		await tick();
		requestAnimationFrame(() => {
			graphRef?.focusNode(id);
			graphRef?.flashNode(id);
		});
	}

	function setCentralConcept() {
		if (!selectedConceptId) return;
		centralConceptId = centralConceptId === selectedConceptId ? null : selectedConceptId;
	}

	function arrangeAroundCentral() {
		if (centralConceptId) graphRef?.reArrangeAround(centralConceptId);
	}

	// Deep-link support: on load (and whenever the URL changes), open the
	// concept or relation referenced by ?concept=<id> / ?relation=<id>.
	$effect(() => {
		const conceptParam = page.url.searchParams.get('concept');
		const relationParam = page.url.searchParams.get('relation');
		untrack(() => {
			if (conceptParam && viewConcepts.some((c) => c.id === conceptParam) && selectedConceptId !== conceptParam) {
				selectedConceptId = conceptParam;
				rightPanel = 'concept';
			}
			if (relationParam && commentsRelation?.id !== relationParam) {
				const rel = viewRelations.find((r) => r.id === relationParam);
				if (rel) openComments(rel);
			}
		});
	});

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
			body: JSON.stringify({
				...input,
				x: input.x != null ? Math.round(input.x) : input.x,
				y: input.y != null ? Math.round(input.y) : input.y
			})
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

	async function createRelation(input: {
		sourceId: string;
		targetId: string;
		type: string;
		direction: 'forward' | 'both';
		description: string;
	}) {
		await api(`/maps/${data.map.id}/relations`, {
			method: 'POST',
			body: JSON.stringify(input)
		});
		await invalidateAll();
		relationModal = null;
	}

	async function updateRelation(
		id: string,
		input: { sourceId: string; targetId: string; type: string; direction: 'forward' | 'both'; description: string }
	) {
		await api(`/maps/${data.map.id}/relations/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ type: input.type, direction: input.direction, description: input.description })
		});
		await invalidateAll();
		relationModal = null;
	}

	async function deleteRelation(id: string) {
		await api(`/maps/${data.map.id}/relations/${id}`, { method: 'DELETE' });
		if (commentsRelation?.id === id) commentsRelation = null;
		await invalidateAll();
	}

	function editRelation(rel: ClientRelation) {
		relationModal = { mode: 'edit', initial: rel };
	}

	function openComments(rel: ClientRelation) {
		commentsRelation = rel;
		selectedRelationId = rel.id;
		updateUrlParam('relation', rel.id);
	}

	function closeComments() {
		commentsRelation = null;
		selectedRelationId = null;
		updateUrlParam('relation', null);
	}

	async function loadRelationComments(): Promise<ClientRelationComment[]> {
		if (!commentsRelation) return [];
		return await api(`/maps/${data.map.id}/relations/${commentsRelation.id}/comments`);
	}

	async function addRelationComment(body: string): Promise<ClientRelationComment> {
		if (!commentsRelation) throw new Error('No relation selected.');
		const created = await api(`/maps/${data.map.id}/relations/${commentsRelation.id}/comments`, {
			method: 'POST',
			body: JSON.stringify({ body })
		});
		invalidateAll();
		return created;
	}

	async function deleteRelationComment(commentId: string) {
		if (!commentsRelation) return;
		await api(`/maps/${data.map.id}/relations/${commentsRelation.id}/comments/${commentId}`, { method: 'DELETE' });
		invalidateAll();
	}

	async function createRelationType(input: {
		label: string;
		phrase: string;
		color: string;
		directional: boolean;
		description: string;
	}) {
		await api(`/maps/${data.map.id}/relation-types`, { method: 'POST', body: JSON.stringify(input) });
		await invalidateAll();
	}

	async function updateRelationType(
		id: string,
		input: { label: string; phrase: string; color: string; directional: boolean; description: string }
	) {
		await api(`/maps/${data.map.id}/relation-types/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
		await invalidateAll();
	}

	async function deleteRelationType(id: string) {
		await api(`/maps/${data.map.id}/relation-types/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	function shareUrlFor(param: 'concept' | 'relation', id: string): string {
		const url = new URL(page.url);
		url.search = '';
		url.searchParams.set(param, id);
		return url.toString();
	}

	// --- position persistence -------------------------------------------------
	// Node moves (drags and auto-layout settling) are queued, de-duplicated
	// against what the server already has, and flushed as one PATCH /positions
	// request. Previously every moved node was its own request (~7 DB round
	// trips each), so a layout settling 200 nodes cost ~200 requests and
	// tripped the per-user write rate limit, silently dropping positions.
	const POSITION_FLUSH_MS = 250;
	/** Last position known to be stored server-side, per concept. */
	const persistedPositions = new Map<string, { x: number; y: number }>();
	const pendingPositions = new Map<string, { id: string; x: number; y: number }>();
	let positionTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		for (const c of data.concepts) {
			if (c.x != null && c.y != null) persistedPositions.set(c.id, { x: c.x, y: c.y });
		}
	});

	function moveConcept(id: string, x: number, y: number) {
		// View-only visitors and previews can rearrange the screen, but it isn't saved.
		if (!editable) return;
		const rx = Math.round(x);
		const ry = Math.round(y);
		const stored = persistedPositions.get(id);
		if (stored && stored.x === rx && stored.y === ry) {
			pendingPositions.delete(id);
			return;
		}
		pendingPositions.set(id, { id, x: rx, y: ry });
		clearTimeout(positionTimer);
		positionTimer = setTimeout(() => flushPositions(), POSITION_FLUSH_MS);
	}

	function flushPositions(keepalive = false) {
		clearTimeout(positionTimer);
		if (pendingPositions.size === 0) return;
		const positions = [...pendingPositions.values()];
		pendingPositions.clear();
		for (const p of positions) persistedPositions.set(p.id, { x: p.x, y: p.y });
		// Fire and forget: position is not a tracked content edit.
		fetch(`/maps/${data.map.id}/positions`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ positions }),
			keepalive
		})
			.then((res) => {
				if (!res.ok) throw new Error(String(res.status));
			})
			.catch(() => {
				// Not stored after all: forget them so the next move re-sends.
				for (const p of positions) persistedPositions.delete(p.id);
			});
	}

	onMount(() => {
		const onHide = () => flushPositions(true);
		window.addEventListener('pagehide', onHide);
		return () => {
			window.removeEventListener('pagehide', onHide);
			flushPositions(true);
		};
	});

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

	// --- edit map description ----------------------------------------------
	let editingMapDescription = $state(false);
	let mapDescriptionDraft = $state(untrack(() => data.map.description ?? ''));
	let savingMapDescription = $state(false);
	let mapDescriptionError = $state('');
	let mapDescriptionInputEl: HTMLTextAreaElement | undefined = $state();

	function startEditingMapDescription() {
		mapDescriptionDraft = data.map.description ?? '';
		mapDescriptionError = '';
		editingMapDescription = true;
	}

	$effect(() => {
		if (editingMapDescription) mapDescriptionInputEl?.focus();
	});

	async function saveMapDescription() {
		const description = mapDescriptionDraft.trim();
		if (description === (data.map.description ?? '')) {
			editingMapDescription = false;
			return;
		}
		savingMapDescription = true;
		mapDescriptionError = '';
		try {
			await api(`/maps/${data.map.id}`, { method: 'PATCH', body: JSON.stringify({ description }) });
			await invalidateAll();
			editingMapDescription = false;
		} catch (err) {
			mapDescriptionError = err instanceof Error ? err.message : 'Could not update the description.';
		}
		savingMapDescription = false;
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
			await goto('/maps');
		} catch (err) {
			deleteMapError = err instanceof Error ? err.message : 'Could not delete the map.';
			deletingMap = false;
		}
	}

	// --- export -------------------------------------------------------------
	function exportAs(kind: 'svg' | 'png' | 'json') {
		const filename = `${data.map.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'concept-map'}.${kind}`;
		const info = { title: data.map.name, description: data.map.description };
		if (kind === 'svg') {
			graphRef?.exportSVG(filename, info);
		} else if (kind === 'png') {
			graphRef?.exportPNG(filename, info);
		} else {
			downloadJson(filename);
		}
	}

	// The full map (not just what's currently filtered on screen), without
	// internal user ids.
	function downloadJson(filename: string) {
		const names = new Map(viewConcepts.map((c) => [c.id, c.name]));
		const payload = {
			map: {
				id: data.map.id,
				name: data.map.name,
				description: data.map.description ?? null,
				createdAt: data.map.createdAt,
				updatedAt: data.map.updatedAt
			},
			exportedAt: new Date().toISOString(),
			relationTypes: Object.entries(relationMeta).map(([key, meta]) => ({
				key,
				label: meta.label,
				phrase: meta.phrase,
				color: meta.color,
				directional: meta.directional
			})),
			concepts: viewConcepts.map((c) => ({
				id: c.id,
				name: c.name,
				definition: c.definition,
				example: c.example,
				literatureLink: c.literatureLink,
				quizQuestion: c.quizQuestion,
				x: c.x,
				y: c.y,
				createdBy: c.createdByName,
				createdAt: c.createdAt,
				updatedAt: c.updatedAt
			})),
			relations: viewRelations.map((r) => ({
				id: r.id,
				sourceId: r.sourceId,
				source: names.get(r.sourceId) ?? null,
				targetId: r.targetId,
				target: names.get(r.targetId) ?? null,
				type: r.type,
				direction: r.direction,
				description: r.description,
				createdBy: r.createdByName ?? null,
				createdAt: r.createdAt
			}))
		};
		downloadObject(filename, payload);
	}

	function downloadObject(filename: string, payload: unknown) {
		const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	// --- versions ------------------------------------------------------------
	async function fetchVersion(v: ClientMapVersion): Promise<MapSnapshot> {
		const res = await api(`/maps/${data.map.id}/versions/${v.id}`);
		return res.snapshot as MapSnapshot;
	}

	async function previewVersion(v: ClientMapVersion | null) {
		if (!v) {
			preview = null;
			return;
		}
		const snap = await fetchVersion(v);
		const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
		const names = new Map<string, { name: string; color: string }>();
		for (const c of data.concepts) {
			if (c.createdByName) names.set(c.createdById, { name: c.createdByName, color: c.createdByColor ?? '#94a3b8' });
			if (c.updatedByName) names.set(c.updatedById, { name: c.updatedByName, color: c.updatedByColor ?? '#94a3b8' });
		}
		selectedConceptId = null;
		centralConceptId = null;
		if (rightPanel === 'concept') rightPanel = 'versions';
		preview = {
			version: v,
			concepts: snap.concepts.map((c) => ({
				...c,
				mapId: data.map.id,
				createdAt: iso(c.createdAt)!,
				updatedAt: iso(c.updatedAt)!,
				createdById: c.createdBy,
				createdByName: names.get(c.createdBy)?.name ?? null,
				createdByColor: names.get(c.createdBy)?.color ?? null,
				updatedById: c.updatedBy,
				updatedByName: names.get(c.updatedBy)?.name ?? null,
				updatedByColor: names.get(c.updatedBy)?.color ?? null
			})),
			relations: snap.relations.map((r) => ({
				id: r.id,
				mapId: data.map.id,
				sourceId: r.sourceId,
				targetId: r.targetId,
				type: r.type,
				direction: r.direction === 'both' ? 'both' : 'forward',
				description: r.description,
				createdById: r.createdBy,
				createdByName: names.get(r.createdBy)?.name ?? null,
				createdAt: iso(r.createdAt)!,
				updatedById: r.updatedBy,
				updatedAt: iso(r.updatedAt)
			})),
			relationTypes: snap.relationTypes.map((t) => ({
				id: t.id,
				mapId: data.map.id,
				key: t.key,
				label: t.label,
				phrase: t.phrase,
				color: t.color,
				directional: t.directional,
				description: t.description,
				createdById: t.createdBy,
				createdAt: iso(t.createdAt)!
			}))
		};
	}

	async function restoreVersion(v: ClientMapVersion) {
		await api(`/maps/${data.map.id}/versions/${v.id}/restore`, { method: 'POST' });
		preview = null;
		selectedConceptId = null;
		await invalidateAll();
		canvasEpoch++;
		versionsRefreshKey++;
	}

	async function downloadVersion(v: ClientMapVersion) {
		const snapshot = await fetchVersion(v);
		const slug = `${data.map.name}-${v.label}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
		downloadObject(`${slug || 'concept-map-version'}.json`, {
			map: { id: data.map.id, name: snapshot.name, description: snapshot.description },
			version: { id: v.id, label: v.label, savedBy: v.createdByName, savedAt: v.createdAt },
			concepts: snapshot.concepts,
			relations: snapshot.relations,
			relationTypes: snapshot.relationTypes
		});
	}

	// --- full screen --------------------------------------------------------
	// Uses the Fullscreen API on the whole map page (so modals and panels come
	// along), falling back to a fixed, viewport-filling overlay where the API
	// is unavailable (e.g. iOS Safari).
	let rootEl: HTMLDivElement | undefined = $state();
	let nativeFullscreen = $state(false);
	let pseudoFullscreen = $state(false);
	const isFullscreen = $derived(nativeFullscreen || pseudoFullscreen);

	async function toggleFullscreen() {
		if (document.fullscreenElement) {
			await document.exitFullscreen().catch(() => {});
			return;
		}
		if (pseudoFullscreen) {
			pseudoFullscreen = false;
			return;
		}
		if (document.fullscreenEnabled && rootEl?.requestFullscreen) {
			try {
				await rootEl.requestFullscreen();
				return;
			} catch {
				// fall through to the CSS fallback
			}
		}
		pseudoFullscreen = true;
	}

	onMount(() => {
		const onChange = () => (nativeFullscreen = document.fullscreenElement === rootEl);
		document.addEventListener('fullscreenchange', onChange);
		// Start with the tools panel shrunk on small screens so the map has room.
		if (window.matchMedia('(max-width: 640px)').matches) {
			toolsExpanded = false;
			showLegend = false;
		}
		return () => document.removeEventListener('fullscreenchange', onChange);
	});

	// --- live collaboration -------------------------------------------------
	// Presence (who's here, what they're on, their cursor) and remote changes
	// arrive through a paced heartbeat; see $lib/client/live.svelte.ts.
	let live: LiveSession | undefined = $state();
	const peers = $derived(live?.peers ?? []);
	let showPeerCursors = $state(true);
	const canvasPeers = $derived(showPeerCursors ? peers : peers.map((p) => ({ ...p, cursor: null })));
	let toasts = $state<LiveToast[]>([]);
	let commentsRefreshKey = $state(0);
	let followingClientId = $state<string | null>(null);
	const followedPeer = $derived(peers.find((p) => p.clientId === followingClientId) ?? null);

	onMount(() => {
		const session = new LiveSession(
			data.map.id,
			data.activity.map((a) => a.id),
			{
				onActivity: handleRemoteActivity,
				onMoves: (moves) => {
					for (const m of moves) if (m.x != null && m.y != null) persistedPositions.set(m.id, { x: m.x, y: m.y });
					graphRef?.applyRemoteMoves(moves);
				},
				onGone: () => goto('/maps')
			}
		);
		live = session;
		session.start();
		return () => {
			session.stop();
			clearTimeout(refreshTimer);
		};
	});

	// Anything this tab has already loaded (e.g. after its own edits) isn't news.
	$effect(() => {
		const ids = data.activity.map((a) => a.id);
		untrack(() => live?.markSeen(ids));
	});

	$effect(() => {
		live?.setFocus(selectedConceptId);
	});

	const editingState = $derived.by(() => {
		if (conceptModal?.mode === 'edit' && conceptModal.initial) return `concept:${conceptModal.initial.id}`;
		if (relationModal?.mode === 'edit' && relationModal.initial) return `relation:${relationModal.initial.id}`;
		return editingMapName || editingMapDescription ? 'map' : null;
	});
	$effect(() => {
		live?.setEditing(editingState);
	});

	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	/** A restore moved everything: rebuild the canvas once the new data is in. */
	let remountAfterRefresh = false;
	function scheduleRefresh() {
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(async () => {
			await invalidateAll();
			if (remountAfterRefresh) {
				remountAfterRefresh = false;
				canvasEpoch++;
			}
		}, 200);
	}

	function handleRemoteActivity(entries: ClientActivityEntry[]) {
		const myId = data.user?.id;
		const known = new Set(data.activity.map((a) => a.id));
		// Our own edits already reload this tab; only refetch for changes made
		// by others (or by us in another tab).
		if (entries.some((e) => e.userId !== myId || !known.has(e.id))) scheduleRefresh();
		for (const e of entries) {
			if (e.action === 'commented_relation' && commentsRelation?.id === e.entityId) commentsRefreshKey++;
			if (e.entityType === 'version') versionsRefreshKey++;
			if (e.action === 'restored_version' && !known.has(e.id)) remountAfterRefresh = true;
			if (e.userId !== myId) pushToast(e);
		}
	}

	function pushToast(e: ClientActivityEntry) {
		const text = e.summary.replace(/^(Added|Edited|Deleted|Linked|Removed|Created|Renamed|Commented) /, (m) => m.toLowerCase());
		let action: LiveToast['action'];
		if (e.entityType === 'concept' && !e.action.startsWith('deleted')) {
			action = { label: 'Show', run: () => searchSelect(e.entityId) };
		} else if (e.entityType === 'relation' && !e.action.startsWith('deleted')) {
			action = {
				label: 'Open',
				run: () => {
					const rel = viewRelations.find((r) => r.id === e.entityId);
					if (rel) openComments(rel);
				}
			};
		}
		const toast: LiveToast = { id: e.id, name: e.userName ?? 'Someone', color: e.userColor ?? '#64748b', text, action };
		toasts = [...toasts.filter((t) => t.id !== e.id), toast].slice(-4);
		setTimeout(() => dismissToast(e.id), 7000);
	}

	function dismissToast(id: string) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function conceptName(id: string) {
		return viewConcepts.find((c) => c.id === id)?.name;
	}
	function relationName(id: string) {
		const rel = viewRelations.find((r) => r.id === id);
		if (!rel) return undefined;
		return `${conceptName(rel.sourceId) ?? '?'} → ${conceptName(rel.targetId) ?? '?'}`;
	}
	const describe = (peer: LivePeer) => describePeer(peer, conceptName, relationName);

	/** Graph node a peer is on: what they're editing, else what they've selected. */
	function peerNode(peer: LivePeer): string | null {
		const editingId = peer.editing?.startsWith('concept:') ? peer.editing.slice(8) : null;
		const id = editingId ?? peer.focusId;
		return id && viewConcepts.some((c) => c.id === id) ? id : null;
	}

	function goToPeer(peer: LivePeer) {
		const nodeId = peerNode(peer);
		if (nodeId) {
			graphRef?.focusNode(nodeId);
			graphRef?.flashNode(nodeId);
		} else if (peer.cursor) {
			graphRef?.focusPoint(peer.cursor.x, peer.cursor.y);
		}
	}

	// Follow mode: keep the view on whatever the followed person is on.
	// Re-centres only when their target moves noticeably, so it doesn't jitter.
	let lastFollowTarget: { x: number; y: number } | null = null;
	$effect(() => {
		const peer = followedPeer;
		if (!peer) {
			lastFollowTarget = null;
			// They left the map: drop follow mode (but not during a brief reconnect).
			if (untrack(() => followingClientId && live?.status === 'live')) followingClientId = null;
			return;
		}
		untrack(() => {
			const nodeId = peerNode(peer);
			const node = nodeId ? viewConcepts.find((c) => c.id === nodeId) : null;
			const target =
				node && node.x != null && node.y != null ? { x: node.x, y: node.y } : peer.cursor ? { ...peer.cursor } : null;
			if (!target) return;
			if (lastFollowTarget && Math.hypot(target.x - lastFollowTarget.x, target.y - lastFollowTarget.y) < 80) return;
			lastFollowTarget = target;
			if (nodeId) graphRef?.focusNode(nodeId);
			else graphRef?.focusPoint(target.x, target.y);
		});
	});

	function namesOf(list: LivePeer[]): string[] {
		return [...new Set(list.map((p) => p.name))];
	}
	function joinNames(names: string[]): string {
		return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
	}

	// Collaboration warnings shown inside the edit dialogs.
	const conceptNotice = $derived.by(() => {
		if (conceptModal?.mode !== 'edit' || !conceptModal.initial) return null;
		const id = conceptModal.initial.id;
		const current = viewConcepts.find((c) => c.id === id);
		if (!current) return 'Someone deleted this concept while you were editing it.';
		if (current.updatedAt !== conceptModal.initial.updatedAt && current.updatedById !== data.user?.id) {
			return `${current.updatedByName ?? 'Someone'} saved changes to this concept while you were editing — saving will overwrite them.`;
		}
		const others = namesOf(peers.filter((p) => p.editing === `concept:${id}`));
		if (others.length) return `${joinNames(others)} ${others.length === 1 ? 'is' : 'are'} also editing this concept right now.`;
		return null;
	});

	const relationNotice = $derived.by(() => {
		if (relationModal?.mode !== 'edit' || !relationModal.initial) return null;
		const id = relationModal.initial.id;
		const current = viewRelations.find((r) => r.id === id);
		if (!current) return 'Someone deleted this link while you were editing it.';
		if (current.updatedAt !== relationModal.initial.updatedAt && current.updatedById !== data.user?.id) {
			return `${current.updatedByName ?? 'Someone'} saved changes to this link while you were editing — saving will overwrite them.`;
		}
		const others = namesOf(peers.filter((p) => p.editing === `relation:${id}`));
		if (others.length) return `${joinNames(others)} ${others.length === 1 ? 'is' : 'are'} also editing this link right now.`;
		return null;
	});

	const selectedConceptPeers = $derived.by(() => {
		if (!selectedConceptId) return [];
		const byUser = new Map<string, { clientId: string; name: string; color: string; editing: boolean }>();
		for (const p of peers) {
			const editing = p.editing === `concept:${selectedConceptId}`;
			if (!editing && p.focusId !== selectedConceptId) continue;
			const prev = byUser.get(p.userId);
			if (!prev || (editing && !prev.editing)) byUser.set(p.userId, { clientId: p.clientId, name: p.name, color: p.color, editing });
		}
		return [...byUser.values()];
	});

	// --- actions ------------------------------------------------------------
	// Every map command is defined once here and shared by the tools panel,
	// the right-click menu and the keyboard shortcuts.
	let toolsExpanded = $state(true);
	let helpOpen = $state(false);
	let searchRef: SearchBar | undefined = $state();
	const isOwner = $derived(data.map.createdBy === page.data.user?.id);
	const hasConcepts = $derived(viewConcepts.length > 0);
	// The map row only stores the creator's id, so find their name wherever
	// else they appear.
	const creatorName = $derived(
		(isOwner ? page.data.user?.name : null) ??
			data.activity.find((a) => a.userId === data.map.createdBy)?.userName ??
			viewConcepts.find((c) => c.createdById === data.map.createdBy)?.createdByName ??
			null
	);

	type Action = {
		label: string;
		icon: IconName;
		shortcut?: string;
		disabled?: boolean;
		active?: boolean;
		danger?: boolean;
		run: () => void;
	};

	type ActionId =
		| 'addConcept' | 'addLink' | 'search'
		| 'setCenter' | 'arrange' | 'clearCenter' | 'relayout'
		| 'zoomIn' | 'zoomOut' | 'fit' | 'rotate' | 'resetView' | 'fullscreen' | 'legend' | 'tools'
		| 'cursors' | 'stopFollowing'
		| 'share' | 'versions' | 'relationTypes' | 'activity' | 'exportPng' | 'exportSvg' | 'exportJson' | 'rename' | 'describe' | 'deleteMap';

	const actions: Record<ActionId, Action> = $derived({
		addConcept: {
			label: 'Add concept',
			icon: 'plus',
			shortcut: 'N',
			disabled: !editable,
			run: () => (conceptModal = { mode: 'create' })
		},
		addLink: {
			label: 'Add link',
			icon: 'link',
			shortcut: 'L',
			disabled: !editable || viewConcepts.length < 2,
			run: () => (relationModal = { mode: 'create', sourceId: selectedConceptId ?? undefined })
		},
		search: {
			label: 'Search concepts',
			icon: 'search',
			shortcut: '/',
			disabled: !hasConcepts,
			run: () => searchRef?.focus()
		},
		setCenter: {
			label: selectedConceptId && selectedConceptId === centralConceptId ? 'Unset center' : 'Set selected as center',
			icon: 'target',
			active: !!centralConceptId && selectedConceptId === centralConceptId,
			disabled: !selectedConceptId,
			run: setCentralConcept
		},
		arrange: {
			label: 'Arrange around center',
			icon: 'orbit',
			disabled: !centralConceptId,
			run: arrangeAroundCentral
		},
		clearCenter: {
			label: 'Clear center',
			icon: 'x',
			disabled: !centralConceptId,
			run: () => (centralConceptId = null)
		},
		relayout: {
			label: 'Re-run auto layout',
			icon: 'shuffle',
			disabled: !hasConcepts,
			run: () => graphRef?.reArrange()
		},
		zoomIn: { label: 'Zoom in', icon: 'zoomIn', shortcut: '+', disabled: !hasConcepts, run: () => graphRef?.zoomIn() },
		zoomOut: { label: 'Zoom out', icon: 'zoomOut', shortcut: '−', disabled: !hasConcepts, run: () => graphRef?.zoomOut() },
		fit: { label: 'Fit to view', icon: 'fit', shortcut: '0', disabled: !hasConcepts, run: () => graphRef?.fitView() },
		rotate: { label: 'Rotate 90°', icon: 'rotate', disabled: !hasConcepts, run: () => graphRef?.rotateView() },
		resetView: { label: 'Reset view', icon: 'reset', disabled: !hasConcepts, run: () => graphRef?.resetView() },
		fullscreen: {
			label: isFullscreen ? 'Exit full screen' : 'Full screen',
			icon: isFullscreen ? 'minimize' : 'maximize',
			shortcut: 'F',
			active: isFullscreen,
			run: toggleFullscreen
		},
		legend: {
			label: showLegend ? 'Hide legend' : 'Show legend',
			icon: 'list',
			active: showLegend,
			disabled: !hasConcepts,
			run: () => (showLegend = !showLegend)
		},
		tools: {
			label: toolsExpanded ? 'Shrink tools panel' : 'Expand tools panel',
			icon: toolsExpanded ? 'chevronRight' : 'chevronLeft',
			run: () => (toolsExpanded = !toolsExpanded)
		},
		cursors: {
			label: showPeerCursors ? "Hide others' cursors" : "Show others' cursors",
			icon: 'mouse',
			active: showPeerCursors,
			run: () => (showPeerCursors = !showPeerCursors)
		},
		stopFollowing: {
			label: followedPeer ? `Stop following ${followedPeer.name}` : 'Not following anyone',
			icon: 'eye',
			disabled: !followedPeer,
			run: () => (followingClientId = null)
		},
		share: { label: 'Share & access', icon: 'share', disabled: !!preview, run: () => (shareOpen = true) },
		versions: {
			label: 'Versions',
			icon: 'history',
			active: rightPanel === 'versions',
			run: () => (rightPanel = rightPanel === 'versions' ? 'none' : 'versions')
		},
		relationTypes: { label: 'Relation types', icon: 'tag', disabled: !editable, run: () => (relationTypeManagerOpen = true) },
		activity: {
			label: 'Activity feed',
			icon: 'clock',
			active: rightPanel === 'activity',
			run: () => (rightPanel = rightPanel === 'activity' ? 'none' : 'activity')
		},
		exportPng: { label: 'Export as PNG', icon: 'image', disabled: !hasConcepts, run: () => exportAs('png') },
		exportSvg: { label: 'Export as SVG', icon: 'code', disabled: !hasConcepts, run: () => exportAs('svg') },
		exportJson: { label: 'Download data (JSON)', icon: 'download', disabled: !hasConcepts, run: () => exportAs('json') },
		rename: { label: 'Rename map', icon: 'edit', disabled: !editable, run: startEditingMapName },
		describe: { label: 'Edit description', icon: 'edit', disabled: !editable, run: startEditingMapDescription },
		deleteMap: {
			label: 'Delete map',
			icon: 'trash',
			danger: true,
			disabled: !isOwner,
			run: () => (confirmDeleteMap = true)
		}
	});

	const TOOL_GROUPS: { title: string; ids: ActionId[] }[] = [
		{ title: 'Create', ids: ['addConcept', 'addLink'] },
		{ title: 'Layout', ids: ['setCenter', 'arrange', 'clearCenter', 'relayout'] },
		{ title: 'Map', ids: ['share', 'versions', 'relationTypes', 'activity', 'exportPng', 'exportSvg', 'exportJson'] },
		{ title: 'Live', ids: ['cursors', 'stopFollowing'] }
	];

	// --- keyboard shortcuts --------------------------------------------------
	const anyModalOpen = $derived(
		!!conceptModal ||
			!!relationModal ||
			relationTypeManagerOpen ||
			!!commentsRelation ||
			confirmDeleteMap ||
			helpOpen ||
			shareOpen
	);

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || anyModalOpen || contextMenu) return;
		const el = e.target as HTMLElement | null;
		if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
		if (e.key === 'Escape') {
			// Peel back one layer at a time: follow mode, fallback full
			// screen, then the center highlight, then the selection.
			if (preview) preview = null;
			else if (followingClientId) followingClientId = null;
			else if (pseudoFullscreen) pseudoFullscreen = false;
			else if (centralConceptId) centralConceptId = null;
			else clearSelection();
			return;
		}
		const byKey: Record<string, ActionId> = {
			'/': 'search',
			n: 'addConcept',
			l: 'addLink',
			f: 'fullscreen',
			'+': 'zoomIn',
			'=': 'zoomIn',
			'-': 'zoomOut',
			'0': 'fit'
		};
		const id = byKey[e.key.toLowerCase()];
		if (!id || actions[id].disabled) return;
		e.preventDefault();
		actions[id].run();
	}

	// --- right-click menu ----------------------------------------------------
	type MenuTarget = { kind: 'node' | 'edge' | 'background'; id?: string };
	let contextMenu: { x: number; y: number; target: MenuTarget; graph: { x: number; y: number } | null } | null =
		$state(null);

	function openContextMenu(target: MenuTarget, x: number, y: number) {
		if (target.kind === 'node' && target.id) selectedConceptId = target.id;
		contextMenu = { x, y, target, graph: graphRef?.graphPointAt(x, y) ?? null };
	}

	function copyText(text: string) {
		navigator.clipboard?.writeText(text).catch(() => {});
	}

	function item(id: ActionId, overrides: Partial<Action> = {}): MenuItem {
		return { ...actions[id], ...overrides };
	}

	const menuSections = $derived.by((): MenuSection[] => {
		if (!contextMenu) return [];
		const { target, graph } = contextMenu;
		const sections: MenuSection[] = [];

		if (target.kind === 'node' && target.id) {
			const concept = viewConcepts.find((c) => c.id === target.id);
			if (concept) {
				const id = concept.id;
				const isCentral = centralConceptId === id;
				sections.push({
					id: 'target',
					title: concept.name,
					pinned: true,
					items: [
						{ label: 'Open details', icon: 'info', run: () => selectConcept(id) },
						{
							label: 'Edit concept',
							icon: 'edit',
							disabled: !editable,
							run: () => (conceptModal = { mode: 'edit', initial: concept })
						},
						{
							label: 'Link from here…',
							icon: 'link',
							disabled: !editable || viewConcepts.length < 2,
							run: () => (relationModal = { mode: 'create', sourceId: id })
						},
						{
							label: isCentral ? 'Unset center' : 'Set as center',
							icon: isCentral ? 'x' : 'target',
							run: () => (centralConceptId = isCentral ? null : id)
						},
						{
							label: 'Arrange around this',
							icon: 'orbit',
							run: () => {
								centralConceptId = id;
								graphRef?.reArrangeAround(id);
							}
						},
						{ label: 'Center in view', icon: 'eye', run: () => graphRef?.focusNode(id) },
						{ label: 'Copy link', icon: 'copy', run: () => copyText(shareUrlFor('concept', id)) },
						{
							label: 'Delete concept',
							icon: 'trash',
							danger: true,
							disabled: !editable,
							run: () => {
								if (confirm(`Delete "${concept.name}" and its links?`)) deleteConcept(id);
							}
						}
					]
				});
			}
		} else if (target.kind === 'edge' && target.id) {
			const rel = viewRelations.find((r) => r.id === target.id);
			if (rel) {
				const source = viewConcepts.find((c) => c.id === rel.sourceId)?.name ?? '?';
				const dest = viewConcepts.find((c) => c.id === rel.targetId)?.name ?? '?';
				sections.push({
					id: 'target',
					title: `${source} → ${dest}`,
					pinned: true,
					items: [
						{ label: 'Open discussion', icon: 'message', run: () => openComments(rel) },
						{ label: 'Edit link', icon: 'edit', disabled: !editable, run: () => editRelation(rel) },
						{ label: 'Copy link', icon: 'copy', run: () => copyText(shareUrlFor('relation', rel.id)) },
						{
							label: 'Delete link',
							icon: 'trash',
							danger: true,
							disabled: !editable,
							run: () => {
								if (confirm(`Delete the link "${source} ${relationMeta[rel.type]?.phrase ?? rel.type} ${dest}"?`))
									deleteRelation(rel.id);
							}
						}
					]
				});
			}
		}

		sections.push(
			{
				id: 'create',
				title: 'Create',
				icon: 'plus',
				items: [
					item('addConcept', {
						label: target.kind === 'background' && graph ? 'Add concept here' : 'Add concept',
						run: () =>
							(conceptModal = { mode: 'create', position: target.kind === 'background' ? graph ?? undefined : undefined })
					}),
					item('addLink'),
					item('search')
				]
			},
			{
				id: 'layout',
				title: 'Layout',
				icon: 'orbit',
				items: [item('setCenter'), item('arrange'), item('clearCenter'), item('relayout')]
			},
			{
				id: 'view',
				title: 'View',
				icon: 'eye',
				items: [
					item('zoomIn'),
					item('zoomOut'),
					item('fit'),
					item('rotate'),
					item('resetView'),
					item('fullscreen'),
					item('legend'),
					item('tools')
				]
			},
			{
				id: 'live',
				title: peers.length > 0 ? `Live · ${namesOf(peers).length} here` : 'Live',
				icon: 'users',
				items: [
					...namesOf(peers)
						.slice(0, 5)
						.map((name): MenuItem => {
							const p = peers.find((x) => x.name === name)!;
							const following = followingClientId === p.clientId;
							return {
								label: following ? `Stop following ${name}` : `Follow ${name}`,
								icon: following ? 'x' : 'eye',
								run: () => {
									followingClientId = following ? null : p.clientId;
									if (!following) goToPeer(p);
								}
							};
						}),
					item('cursors')
				]
			},
			{
				id: 'map',
				title: 'Map',
				icon: 'tag',
				items: [
					item('share'),
					item('versions'),
					item('relationTypes'),
					item('activity'),
					item('exportPng'),
					item('exportSvg'),
					item('exportJson'),
					item('rename'),
					item('describe'),
					...(isOwner ? [item('deleteMap')] : [])
				]
			}
		);
		return sections;
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<svelte:head>
	<title>{data.map.name} · Concept Cartography</title>
</svelte:head>

<div
	bind:this={rootEl}
	class="map-page flex flex-col overflow-hidden bg-slate-50 {pseudoFullscreen ? 'fixed inset-0 z-40' : 'flex-1'}"
>
	<!-- Header: what this map is, who's building it, and how to use it. All
	     map actions live on the canvas (tools panel, right-click, shortcuts). -->
	<div class="map-header relative border-b border-slate-200 bg-white">
		<div class="map-header-stripe" aria-hidden="true"></div>
		<div
			class="mx-auto flex w-full flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 {isFullscreen ? 'max-w-none' : 'max-w-7xl'}"
		>
			<div class="flex min-w-[16rem] flex-1 items-start gap-3">
				<a
					href="/maps"
					class="map-back mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
					aria-label="Back to maps"
					title="Back to maps"
				>
					<Icon name="chevronLeft" />
				</a>

				<div class="min-w-0 flex-1">
					<p class="flex flex-wrap items-center gap-x-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
						<span class="text-memphis-pink">Concept map</span>
						{#if creatorName}<span aria-hidden="true">·</span><span>by {creatorName}</span>{/if}
						<span aria-hidden="true">·</span>
						<span>since {new Date(data.map.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
						<span aria-hidden="true">·</span>
						<button
							onclick={() => (shareOpen = true)}
							class="flex items-center gap-1 uppercase tracking-[0.14em] hover:text-slate-600"
							title={VISIBILITY_META[data.access.visibility].description}
						>
							<Icon
								name={data.access.visibility === 'private' ? 'lock' : data.access.visibility === 'public_view' ? 'eye' : 'globe'}
								class="h-3 w-3"
							/>
							{VISIBILITY_META[data.access.visibility].short}
						</button>
						{#if !canEditMap}
							<span class="view-only-chip ml-1 rounded-full px-2 py-0.5 normal-case tracking-normal" title="Ask the map's owner for an invite to edit">
								View only
							</span>
						{/if}
					</p>

					{#if editingMapName}
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
							class="map-title mt-0.5 w-full max-w-xl rounded-md border border-blue-300 px-2 py-0.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
						{#if mapNameError}
							<p class="mt-0.5 text-xs text-red-600">{mapNameError}</p>
						{/if}
					{:else if !editable}
						<h1 class="map-title mt-0.5 truncate text-slate-900">{data.map.name}</h1>
					{:else}
						<button onclick={startEditingMapName} class="group mt-0.5 flex max-w-full items-center gap-2 text-left" aria-label="Rename map">
							<h1 class="map-title truncate text-slate-900">{data.map.name}</h1>
							<span class="shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
								<Icon name="edit" class="h-4 w-4" />
							</span>
						</button>
					{/if}

					{#if editingMapDescription}
						<textarea
							bind:this={mapDescriptionInputEl}
							bind:value={mapDescriptionDraft}
							rows="2"
							placeholder="What is this map exploring?"
							onblur={saveMapDescription}
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									(e.target as HTMLTextAreaElement).blur();
								}
								if (e.key === 'Escape') editingMapDescription = false;
							}}
							disabled={savingMapDescription}
							class="mt-1 w-full max-w-xl resize-none rounded-md border border-blue-300 px-2 py-1 text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
						></textarea>
						{#if mapDescriptionError}
							<p class="mt-0.5 text-xs text-red-600">{mapDescriptionError}</p>
						{/if}
					{:else if !editable}
						{#if data.map.description}
							<p class="mt-0.5 line-clamp-2 max-w-xl text-sm leading-snug text-slate-500">{data.map.description}</p>
						{/if}
					{:else}
						<button
							onclick={startEditingMapDescription}
							class="group mt-0.5 flex max-w-xl items-start gap-1.5 text-left"
							aria-label="Edit map description"
						>
							{#if data.map.description}
								<p class="line-clamp-2 text-sm leading-snug text-slate-500 group-hover:text-slate-700">{data.map.description}</p>
							{:else}
								<p class="text-sm italic text-slate-400 group-hover:text-slate-600">Add a description — what is this map exploring?</p>
							{/if}
						</button>
					{/if}
				</div>
			</div>

			<div class="order-3 w-full min-w-0 xl:order-2 xl:w-auto">
				<MapStats
					concepts={viewConcepts}
					relations={viewRelations}
					activity={data.activity}
					onSelectConcept={searchSelect}
				/>
			</div>

			<div class="order-2 flex shrink-0 items-center gap-2 xl:order-3">
				{#if live}
					<LivePresence
						{peers}
						status={live.status}
						me={data.user ? { name: data.user.name, color: data.user.color } : null}
						followingId={followingClientId}
						{describe}
						onGoTo={goToPeer}
						onFollow={(p) => {
							followingClientId = p?.clientId ?? null;
							if (p) goToPeer(p);
						}}
					/>
				{/if}
				<button
					onclick={() => (shareOpen = true)}
					class="share-btn flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
					title="Share & access"
				>
					<Icon name={data.access.visibility === 'private' ? 'lock' : 'share'} class="h-4 w-4" />
					<span class="max-sm:sr-only">Share</span>
				</button>
				<MapHelp bind:open={helpOpen} />
				{#if isOwner}
					<button
						onclick={() => (confirmDeleteMap = true)}
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
						aria-label="Delete map"
						title="Delete map"
					>
						<Icon name="trash" />
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Body -->
	<div
		class="relative mx-auto flex w-full flex-1 gap-3 overflow-hidden {isFullscreen ? 'max-w-none p-2' : 'max-w-7xl p-3 sm:p-4'}"
	>
		<div class="relative min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			{#if viewConcepts.length === 0}
				<div
					class="flex h-full flex-col items-center justify-center px-4 text-center"
					role="presentation"
					oncontextmenu={(e) => {
						e.preventDefault();
						openContextMenu({ kind: 'background' }, e.clientX, e.clientY);
					}}
				>
					{#if preview}
						<p class="text-slate-500">This version of the map was empty.</p>
					{:else if editable}
						<p class="text-slate-500">This map is empty. Add your first concept to get started.</p>
						<button
							onclick={() => (conceptModal = { mode: 'create' })}
							class="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
						>
							Add a concept
						</button>
					{:else}
						<p class="text-slate-500">This map is empty so far.</p>
					{/if}
				</div>
			{:else}
				{#key preview ? `preview:${preview.version.id}` : `live:${canvasEpoch}`}
				<GraphCanvas
					bind:this={graphRef}
					concepts={viewConcepts}
					relations={visibleRelations}
					selectedId={selectedConceptId}
					centralId={centralConceptId}
					selectedRelationId={selectedRelationId}
					relationMeta={relationMeta}
					onSelect={highlightConcept}
					onOpen={selectConcept}
					onBackgroundClick={clearSelection}
					onSelectRelation={(id) => {
						const rel = viewRelations.find((r) => r.id === id);
						if (rel) openComments(rel);
					}}
					onNodeMoved={moveConcept}
					onContextMenu={openContextMenu}
					peers={canvasPeers}
					onCursorMove={(p) => live?.setCursor(p)}
					fullscreen={isFullscreen}
					onToggleFullscreen={toggleFullscreen}
				/>
				{/key}
			{/if}

			<!-- Version preview banner. -->
			{#if preview}
				<div
					class="preview-chip absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm max-sm:bottom-16"
					transition:fly={{ y: 12, duration: 200 }}
				>
					<Icon name="history" class="h-4 w-4 shrink-0" />
					<span class="truncate">Previewing <strong>{preview.version.label}</strong> · read-only</span>
					{#if canEditMap}
						<button
							onclick={() => (rightPanel = 'versions')}
							class="flex h-7 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold"
							title="Restore it from the Versions panel"
						>
							Restore…
						</button>
					{/if}
					<button
						onclick={() => (preview = null)}
						class="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
						title="Back to the live map (Esc)"
					>
						<Icon name="x" class="h-3.5 w-3.5" />
						Exit
					</button>
				</div>
			{/if}

			<!-- Center-focus chip: shows what the map is focused on, one click to clear. -->
			{#if centralConcept}
				<div
					class="center-chip absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm max-sm:bottom-16"
					transition:fly={{ y: 12, duration: 200 }}
				>
					<span class="text-amber-500" aria-hidden="true">✦</span>
					<span class="truncate">Centered on <strong>{centralConcept.name}</strong></span>
					<button
						onclick={() => (centralConceptId = null)}
						class="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
						title="Clear center (Esc)"
					>
						<Icon name="x" class="h-3.5 w-3.5" />
						Clear
					</button>
				</div>
			{/if}

			<!-- Follow-mode chip. -->
			{#if followedPeer}
				<div
					class="follow-chip absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm max-sm:left-3 max-sm:right-16 max-sm:top-[6.5rem] max-sm:max-w-none max-sm:translate-x-0"
					style="--peer: {followedPeer.color}"
					transition:fly={{ y: -12, duration: 200 }}
				>
					<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background: var(--peer)" aria-hidden="true"></span>
					<span class="truncate">Following <strong>{followedPeer.name}</strong> · {describe(followedPeer)}</span>
					<button
						onclick={() => (followingClientId = null)}
						class="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
						title="Stop following (Esc)"
					>
						<Icon name="x" class="h-3.5 w-3.5" />
						Stop
					</button>
				</div>
			{/if}

			<LiveToasts {toasts} onDismiss={dismissToast} />

			<!-- Top-left: search, then the legend beneath it. -->
			{#if viewConcepts.length > 0}
				<div
					class="pointer-events-none absolute left-3 top-3 z-20 flex max-h-[calc(100%-9.5rem)] w-[min(18rem,calc(100%-5.5rem))] flex-col gap-2 sm:left-4 sm:top-4"
				>
					<div class="pointer-events-auto">
						<SearchBar bind:this={searchRef} concepts={viewConcepts} onSelect={searchSelect} />
					</div>

					{#if showLegend}
						<div
							class="map-legend pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-sm shadow-sm backdrop-blur"
						>
							<div class="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
								<Icon name="list" class="h-4 w-4 text-slate-400" />
								<span class="flex-1 font-semibold text-slate-600">Relation types</span>
								<button
									onclick={() =>
										(visibleRelationTypes =
											visibleRelationTypes.size > 0 ? new Set() : new Set([...RELATION_TYPES, ...viewRelationTypes.map((t) => t.key)]))}
									class="text-xs font-medium text-slate-400 hover:text-slate-600"
								>
									{visibleRelationTypes.size > 0 ? 'Hide all' : 'Show all'}
								</button>
								<button
									onclick={() => (showLegend = false)}
									class="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
									aria-label="Collapse legend"
									title="Collapse legend"
								>
									<Icon name="chevronUp" />
								</button>
							</div>
							<div class="min-h-0 overflow-y-auto p-2">
								{#each [{ title: null, rows: builtInLegend }, { title: 'Community labels', rows: communityLegend }] as group (group.title)}
									{#if group.rows.length > 0}
										{#if group.title}
											<div class="mb-1 mt-2 border-t border-slate-100 px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
												{group.title}
											</div>
										{/if}
										<ul class="space-y-0.5">
											{#each group.rows as { key, meta, count } (key)}
												{@const on = visibleRelationTypes.has(key)}
												<li>
													<button
														onclick={() => toggleRelationType(key)}
														aria-pressed={on}
														title={meta.phrase}
														class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-slate-50 {on
															? 'text-slate-700'
															: 'text-slate-400 line-through'}"
													>
														<svg viewBox="0 0 28 10" class="legend-swatch h-2.5 w-7 shrink-0 {on ? '' : 'opacity-25'}" style="--edge: {meta.color}" aria-hidden="true">
															<line x1="1" y1="5" x2={meta.directional ? 20 : 27} y2="5" stroke-dasharray={meta.directional ? undefined : '4 3'} />
															{#if meta.directional}<path d="M19 1 L27 5 L19 9 Z" />{/if}
														</svg>
														<span class="flex-1 truncate">{meta.label}</span>
														<span class="tabular-nums text-xs text-slate-400">{count}</span>
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								{/each}
								<p class="mt-2 border-t border-slate-100 px-1 pt-2 text-[11px] text-slate-400">
									Arrows show direction · dashed = mutual
								</p>
							</div>
						</div>
					{:else}
						<button
							onclick={() => (showLegend = true)}
							class="map-legend pointer-events-auto flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur hover:text-slate-800"
							aria-label="Expand legend"
						>
							<Icon name="list" class="h-4 w-4 text-slate-400" />
							Legend
							<Icon name="chevronDown" class="h-4 w-4 text-slate-400" />
						</button>
					{/if}
				</div>
			{/if}

			<!-- Top-right: collapsible tools panel. Shrinks to an icon rail. -->
			<div
				class="map-tools absolute right-3 top-3 z-20 flex max-h-[calc(100%-5.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur sm:right-4 sm:top-4 {toolsExpanded
					? 'w-52'
					: 'w-11'}"
				role="toolbar"
				aria-label="Map tools"
				aria-orientation="vertical"
			>
				<button
					onclick={() => (toolsExpanded = !toolsExpanded)}
					class="flex h-10 shrink-0 items-center gap-2 border-b border-slate-100 px-3 text-sm font-semibold text-slate-600 hover:text-slate-800"
					aria-expanded={toolsExpanded}
					aria-label={toolsExpanded ? 'Shrink tools panel' : 'Expand tools panel'}
					title={toolsExpanded ? 'Shrink tools panel' : 'Expand tools panel'}
				>
					<Icon name="tools" class="h-4 w-4 shrink-0 text-slate-400" />
					{#if toolsExpanded}
						<span class="flex-1 text-left">Tools</span>
						<Icon name="chevronRight" class="h-4 w-4 text-slate-400" />
					{/if}
				</button>
				<div class="min-h-0 overflow-y-auto p-1">
					{#each TOOL_GROUPS as group, gi (group.title)}
						{#if toolsExpanded}
							<p class="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{group.title}</p>
						{:else if gi > 0}
							<div class="mx-1.5 my-1 h-px bg-slate-100"></div>
						{/if}
						{#each group.ids as id (id)}
							{@const a = actions[id]}
							<button
								onclick={a.run}
								disabled={a.disabled}
								title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
								aria-label={a.label}
								aria-pressed={a.active}
								class="map-tool-btn {id === 'addConcept' ? 'primary' : ''} {a.active ? 'active' : ''} {toolsExpanded
									? 'justify-start px-2'
									: 'justify-center'}"
							>
								<Icon name={a.icon} class="h-4 w-4 shrink-0" />
								{#if toolsExpanded}
									<span class="flex-1 truncate text-left">{a.label}</span>
									{#if a.shortcut}
										<kbd class="text-[10px] font-semibold opacity-60">{a.shortcut}</kbd>
									{/if}
								{/if}
							</button>
						{/each}
					{/each}
				</div>
			</div>
		</div>

		{#if rightPanel === 'concept' && selectedConcept}
			<div class="absolute inset-3 z-30 shrink-0 sm:static sm:w-full sm:max-w-sm">
				<ConceptPanel
					concept={selectedConcept}
					concepts={viewConcepts}
					relations={viewRelations}
					relationMeta={relationMeta}
					shareUrl={shareUrlFor('concept', selectedConcept.id)}
					onClose={() => {
						rightPanel = 'none';
						updateUrlParam('concept', null);
					}}
					onEdit={() => (conceptModal = { mode: 'edit', initial: selectedConcept! })}
					onDelete={() => deleteConcept(selectedConcept!.id)}
					onAddRelation={() => (relationModal = { mode: 'create', sourceId: selectedConcept!.id })}
					onSelectConcept={selectConcept}
					onDeleteRelation={deleteRelation}
					onEditRelation={editRelation}
					onOpenComments={openComments}
					livePeers={preview ? [] : selectedConceptPeers}
					readOnly={!editable}
				/>
			</div>
		{:else if rightPanel === 'activity'}
			<div class="absolute inset-3 z-30 shrink-0 sm:static sm:w-full sm:max-w-sm">
				<ActivityFeed activity={data.activity} onClose={() => (rightPanel = 'none')} />
			</div>
		{:else if rightPanel === 'versions'}
			<div class="absolute inset-3 z-30 shrink-0 sm:static sm:w-full sm:max-w-sm">
				<VersionsPanel
					mapId={data.map.id}
					currentUserId={data.user?.id ?? ''}
					canEdit={canEditMap}
					canManage={data.access.canManage}
					previewingId={preview?.version.id ?? null}
					refreshKey={versionsRefreshKey}
					onPreview={previewVersion}
					onRestore={restoreVersion}
					onDownload={downloadVersion}
					onClose={() => (rightPanel = 'none')}
				/>
			</div>
		{/if}
	</div>

	{#if contextMenu}
		<MapContextMenu x={contextMenu.x} y={contextMenu.y} sections={menuSections} onClose={() => (contextMenu = null)} />
	{/if}

	<!-- Modals live inside the page root so they stay visible in full screen. -->
	{#if conceptModal}
		<ConceptFormModal
			mode={conceptModal.mode}
			initial={conceptModal.initial}
			notice={conceptNotice}
			onClose={() => (conceptModal = null)}
			onSubmit={(input) =>
				conceptModal!.mode === 'create'
					? createConcept({ ...input, ...(conceptModal!.position ?? {}) })
					: updateConcept(conceptModal!.initial!.id, input)}
		/>
	{/if}

	{#if relationModal}
		<RelationFormModal
			mode={relationModal.mode}
			initial={relationModal.initial}
			concepts={viewConcepts}
			customTypes={viewRelationTypes}
			relationMeta={relationMeta}
			defaultSourceId={relationModal.sourceId}
			notice={relationNotice}
			onClose={() => (relationModal = null)}
			onManageTypes={() => (relationTypeManagerOpen = true)}
			onSubmit={(input) =>
				relationModal!.mode === 'create' ? createRelation(input) : updateRelation(relationModal!.initial!.id, input)}
		/>
	{/if}

	{#if relationTypeManagerOpen}
		<RelationTypeManager
			mapId={data.map.id}
			customTypes={viewRelationTypes}
			onClose={() => (relationTypeManagerOpen = false)}
			onCreate={createRelationType}
			onUpdate={updateRelationType}
			onDelete={deleteRelationType}
		/>
	{/if}

	{#if commentsRelation}
		{@const source = viewConcepts.find((c) => c.id === commentsRelation!.sourceId)}
		{@const target = viewConcepts.find((c) => c.id === commentsRelation!.targetId)}
		<RelationCommentsModal
			relation={commentsRelation}
			sourceName={source?.name ?? 'Unknown'}
			targetName={target?.name ?? 'Unknown'}
			relationLabelText={relationMeta[commentsRelation.type]?.phrase ?? commentsRelation.type}
			currentUserId={data.user?.id ?? ''}
			shareUrl={shareUrlFor('relation', commentsRelation.id)}
			onClose={closeComments}
			onLoadComments={loadRelationComments}
			onAddComment={addRelationComment}
			onDeleteComment={deleteRelationComment}
			refreshKey={commentsRefreshKey}
			canComment={editable}
		/>
	{/if}

	{#if shareOpen}
		<ShareDialog
			mapId={data.map.id}
			currentUserId={data.user?.id ?? ''}
			onClose={() => (shareOpen = false)}
			onChanged={() => invalidateAll()}
			onLeft={() => goto('/maps')}
		/>
	{/if}

	{#if confirmDeleteMap}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
			<div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
				<h2 class="text-lg font-semibold text-slate-800">Delete this map?</h2>
				<p class="mt-2 text-sm text-slate-500">
					This permanently deletes "{data.map.name}" and all {viewConcepts.length}
					concept{viewConcepts.length === 1 ? '' : 's'} and {viewRelations.length}
					link{viewRelations.length === 1 ? '' : 's'} in it. This can't be undone.
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
</div>

<style>
	.legend-swatch {
		--edge-color: color-mix(in oklab, var(--edge), black 18%);
		stroke: var(--edge-color);
		fill: var(--edge-color);
		stroke-width: 2.5;
		stroke-linecap: round;
	}
	:global(.dark) .legend-swatch {
		--edge-color: color-mix(in oklab, var(--edge), white 35%);
	}

	.map-tools {
		transition: width 200ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.map-tool-btn {
		display: flex;
		width: 100%;
		height: 2.25rem;
		align-items: center;
		gap: 0.6rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #334155;
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}
	.map-tool-btn:hover:not(:disabled) {
		background: #f1f5f9;
		color: #0f172a;
	}
	.map-tool-btn:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}
	.map-tool-btn.primary {
		background: var(--memphis-pink);
		color: white;
		font-weight: 600;
	}
	.map-tool-btn.primary:hover:not(:disabled) {
		background: var(--memphis-pink-deep);
		color: white;
	}
	.map-tool-btn.active {
		background: #ffe3ef;
		color: var(--memphis-pink-deep);
	}
	.map-tool-btn:focus-visible {
		outline: 2px solid var(--memphis-pink);
		outline-offset: -2px;
	}

	:global(.dark) .map-tool-btn {
		color: #cbd5e1;
	}
	:global(.dark) .map-tool-btn:hover:not(:disabled) {
		background: #273449;
		color: #f8fafc;
	}
	:global(.dark) .map-tool-btn.active {
		background: rgb(255 61 129 / 0.18);
		color: #ff8fb8;
	}

	.map-header-stripe {
		height: 4px;
		background: linear-gradient(
			90deg,
			var(--memphis-pink) 0 33%,
			var(--memphis-yellow) 33% 66%,
			var(--memphis-cyan) 66% 100%
		);
	}
	.map-title {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: clamp(1.15rem, 1rem + 0.8vw, 1.6rem);
		line-height: 1.15;
		letter-spacing: -0.01em;
	}
	.map-back {
		border: 2px solid var(--memphis-ink);
		color: var(--memphis-ink);
		transition:
			transform 150ms ease,
			box-shadow 150ms ease;
	}
	.map-back:hover {
		transform: translate(-1px, -1px);
		box-shadow: 3px 3px 0 var(--memphis-ink);
	}
	:global(.dark) .map-back {
		border-color: #475569;
		color: #e2e8f0;
	}
	:global(.dark) .map-back:hover {
		box-shadow: 3px 3px 0 var(--memphis-cyan);
	}

	.center-chip {
		border: 2px solid var(--memphis-ink);
		background: #fff7e0;
		color: var(--memphis-ink);
		box-shadow: 3px 3px 0 var(--memphis-ink);
	}
	.center-chip button {
		background: var(--memphis-ink);
		color: #fff7e0;
	}
	.center-chip button:hover {
		background: var(--memphis-pink);
		color: white;
	}
	:global(.dark) .center-chip {
		border-color: #fbbf24;
		background: #3b2a12;
		color: #fde68a;
		box-shadow: 3px 3px 0 #fbbf24;
	}
	:global(.dark) .center-chip button {
		background: #fbbf24;
		color: #3b2a12;
	}

	.preview-chip {
		border: 2px solid var(--memphis-ink);
		background: #fff7e0;
		color: var(--memphis-ink);
		box-shadow: 3px 3px 0 var(--memphis-ink);
	}
	.preview-chip button {
		background: var(--memphis-ink);
		color: #fff7e0;
	}
	.preview-chip button:hover {
		background: var(--memphis-pink);
		color: white;
	}
	:global(.dark) .preview-chip {
		border-color: #fbbf24;
		background: #3b2a12;
		color: #fde68a;
		box-shadow: 3px 3px 0 #fbbf24;
	}
	:global(.dark) .preview-chip button {
		background: #fbbf24;
		color: #3b2a12;
	}

	.share-btn {
		border: 2px solid var(--memphis-ink);
		color: var(--memphis-ink);
		transition:
			transform 150ms ease,
			box-shadow 150ms ease;
	}
	.share-btn:hover {
		transform: translate(-1px, -1px);
		box-shadow: 3px 3px 0 var(--memphis-ink);
	}
	:global(.dark) .share-btn {
		border-color: #475569;
		color: #e2e8f0;
	}
	:global(.dark) .share-btn:hover {
		box-shadow: 3px 3px 0 var(--memphis-cyan);
	}

	.view-only-chip {
		background: #e0f7fa;
		color: #0e7490;
	}
	:global(.dark) .view-only-chip {
		background: rgb(0 194 209 / 0.15);
		color: #67e8f9;
	}

	.follow-chip {
		border: 2px solid var(--peer);
		background: white;
		color: var(--memphis-ink);
		box-shadow: 3px 3px 0 var(--peer);
	}
	.follow-chip button {
		background: var(--peer);
		color: white;
	}
	.follow-chip button:hover {
		filter: brightness(0.9);
	}
	:global(.dark) .follow-chip {
		background: #172033;
		color: #e2e8f0;
	}

	.map-page:fullscreen {
		background: var(--memphis-cream);
	}
	:global(.dark) .map-page:fullscreen {
		background: #0f172a;
	}
</style>
