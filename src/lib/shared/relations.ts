export const RELATION_TYPES = [
	'type_of',
	'part_of',
	'produces',
	'counteracts',
	'similar_to',
	'equivalent_to',
	'distinct_from',
	'depends_on'
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface RelationMeta {
	label: string;
	/** Read as "<source> [phrase] <target>" */
	phrase: string;
	color: string;
	/** Arrowed (A -> B means something specific) vs a plain symmetric line. */
	directional: boolean;
	description: string;
}

export const RELATION_META: Record<RelationType, RelationMeta> = {
	type_of: {
		label: 'Type of',
		phrase: 'is a type of',
		color: '#2563eb', // blue
		directional: true,
		description: 'Taxonomic / is-a relationship (hierarchy).'
	},
	part_of: {
		label: 'Part of',
		phrase: 'is part of',
		color: '#7c3aed', // vivid violet
		directional: true,
		description: 'Compositional / meronymic relationship (whole-part).'
	},
	produces: {
		label: 'Produces',
		phrase: 'produces',
		color: '#10b981', // emerald green
		directional: true,
		description: 'Causal relationship: source generates or yields target.'
	},
	counteracts: {
		label: 'Counteracts',
		phrase: 'counteracts',
		color: '#b91c1c', // deep crimson red
		directional: true,
		description: 'Source opposes, inhibits, or offsets target.'
	},
	similar_to: {
		label: 'Similar to',
		phrase: 'is similar to',
		color: '#0ea5e9', // bright sky blue
		directional: false,
		description: 'Conceptually related / analogous, without full equivalence.'
	},
	equivalent_to: {
		label: 'Equivalent to',
		phrase: 'is equivalent to',
		color: '#84cc16', // chartreuse green
		directional: false,
		description: 'Interchangeable within the scope of this map.'
	},
	distinct_from: {
		label: 'Distinct from',
		phrase: 'is distinct from',
		color: '#0f766e', // deep teal
		directional: false,
		description: 'Commonly confused, but explicitly different concepts.'
	},
	depends_on: {
		label: 'Depends on',
		phrase: 'depends on',
		color: '#7c3aed', // vivid violet
		directional: true,
		description: 'Source requires or presupposes target.'
	}
};

export function relationLabel(type: string): string {
	return RELATION_META[type as RelationType]?.label ?? type;
}

export function relationColor(type: string): string {
	return RELATION_META[type as RelationType]?.color ?? '#64748b';
}
