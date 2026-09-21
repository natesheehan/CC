<script lang="ts">
	import GraphCanvas from '../src/lib/components/GraphCanvas.svelte';
	import type { ClientConcept, ClientRelation } from '../src/lib/shared/types';

	let concepts: ClientConcept[] = $state([]);
	let relations: ClientRelation[] = $state([]);

	export function addConcept(id: string, name: string) {
		const now = new Date().toISOString();
		const concept: ClientConcept = {
			id,
			mapId: 'map-1',
			name,
			definition: `Definition of ${name}`,
			literatureLink: null,
			example: null,
			quizQuestion: null,
			x: null,
			y: null,
			createdAt: now,
			updatedAt: now,
			createdById: 'user-1',
			createdByName: 'Tester',
			createdByColor: '#2563eb',
			updatedById: 'user-1',
			updatedByName: 'Tester',
			updatedByColor: '#2563eb'
		};
		// New array reference, exactly like `data.concepts` after `invalidateAll()`.
		concepts = [...concepts, concept];
	}

	export function addRelation(id: string, sourceId: string, targetId: string) {
		const relation: ClientRelation = {
			id,
			mapId: 'map-1',
			sourceId,
			targetId,
			type: 'produces',
			direction: 'forward',
			description: null,
			createdById: 'user-1',
			createdByName: 'Tester',
			createdAt: new Date().toISOString()
		};
		relations = [...relations, relation];
	}

	export function renameConcept(id: string, newName: string) {
		// Mimics what happens after editing a concept and invalidateAll()
		// re-fetches: a brand new array with brand new objects, same ids.
		concepts = concepts.map((c) => (c.id === id ? { ...c, name: newName, updatedAt: new Date().toISOString() } : c));
	}

	export function removeConcept(id: string) {
		concepts = concepts.filter((c) => c.id !== id);
		relations = relations.filter((r) => r.sourceId !== id && r.targetId !== id);
	}
</script>

<div style="width: 800px; height: 600px;">
	<GraphCanvas {concepts} {relations} onSelect={() => {}} onNodeMoved={() => {}} />
</div>
