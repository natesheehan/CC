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
	definition: string | null;
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
	type: RelationType | string;
	direction: 'forward' | 'both';
	description: string | null;
	createdById: string;
	createdByName?: string | null;
	createdAt: string;
	updatedById?: string | null;
	updatedByName?: string | null;
	updatedAt?: string | null;
	commentCount?: number;
}

export interface ClientRelationComment {
	id: string;
	mapId: string;
	relationId: string;
	userId: string;
	userName: string | null;
	userColor: string | null;
	body: string;
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
	definition?: string | null;
	literatureLink?: string | null;
	example?: string | null;
	quizQuestion?: string | null;
	x?: number | null;
	y?: number | null;
}

// --- live collaboration -----------------------------------------------------

/** What a collaborator is doing right now, as reported by their heartbeat. */
export interface LivePeer {
	clientId: string;
	userId: string;
	name: string;
	color: string;
	/** Concept they have selected / open, if any. */
	focusId: string | null;
	/** "concept:<id>", "relation:<id>", "map", or null. */
	editing: string | null;
	/** Pointer position in graph space, null when off the canvas. */
	cursor: { x: number; y: number } | null;
	lastSeen: number;
}

export interface LiveHeartbeat {
	clientId: string;
	focusId?: string | null;
	editing?: string | null;
	cursor?: { x: number; y: number } | null;
	/** Server time (ms) of the previous response; changes after it are returned. */
	since?: number | null;
	/** Sent on tab close so the person disappears immediately. */
	leave?: boolean;
	/**
	 * Whether to persist this tab's presence on this call. Clients only set it
	 * when their state actually changed, or as a keep-alive before the row
	 * would expire — so idle tabs read without writing.
	 */
	write?: boolean;
	/** `sig` from the last full response; lets the server answer 204 when nothing changed. */
	sig?: string | null;
}

export interface LiveUpdate {
	/** Server clock — pass back as `since` on the next heartbeat. */
	now: number;
	peers: LivePeer[];
	activity: ClientActivityEntry[];
	/** Nodes repositioned since `since` (drags, auto-layout). */
	moves: { id: string; x: number | null; y: number | null }[];
	/** Fingerprint of `peers`; echo it back as `sig`. */
	sig: string;
}
