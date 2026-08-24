import type { RelationType } from './relations';

export interface ClientUser {
	id: string;
	name: string;
	color: string;
}

export interface ClientMap {
	id: string;
	name: string;
	description: string | null;
	createdAt: string;
	updatedAt: string;
	createdByName?: string | null;
}

export interface ClientConcept {
	id: string;
	mapId: string;
	name: string;
	definition: string;
	literatureLink: string | null;
	example: string | null;
	quizQuestion: string | null;
	x: number | null;
	y: number | null;
	createdAt: string;
	updatedAt: string;
	createdById: string;
	createdByName: string | null;
	createdByColor: string | null;
	updatedById: string;
	updatedByName: string | null;
	updatedByColor: string | null;
}

export interface ClientRelation {
	id: string;
	mapId: string;
	sourceId: string;
	targetId: string;
	type: RelationType;
	createdById: string;
	createdByName?: string | null;
	createdAt: string;
}

export interface ClientActivityEntry {
	id: string;
	mapId: string;
	userId: string;
	userName: string | null;
	userColor: string | null;
	action: string;
	entityType: string;
	entityId: string;
	summary: string;
	createdAt: string;
}

export interface ConceptInput {
	name: string;
	definition: string;
	literatureLink?: string | null;
	example?: string | null;
	quizQuestion?: string | null;
	x?: number | null;
	y?: number | null;
}
