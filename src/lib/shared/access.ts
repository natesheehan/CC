// Who can see and edit a map. Shared by the server (enforcement) and the
// client (labels, hiding controls the viewer can't use).
//
//   public_edit  Anyone signed in can see and edit.          (default)
//   public_view  Anyone signed in can see; only invited people can edit.
//   private      Only invited people can see or edit.
//
// "Invited" = the map's creator, or a row in map_members (added by name, or
// by opening the map's invite link).

export const VISIBILITIES = ['public_edit', 'public_view', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const DEFAULT_VISIBILITY: Visibility = 'public_edit';

export const VISIBILITY_META: Record<Visibility, { label: string; short: string; description: string }> = {
	public_edit: {
		label: 'Public · anyone can edit',
		short: 'Anyone can edit',
		description: 'Everyone signed in can find, view and edit this map.'
	},
	public_view: {
		label: 'Public · invite to edit',
		short: 'Anyone can view',
		description: 'Everyone signed in can find and view it; only people you invite can edit.'
	},
	private: {
		label: 'Private · invite only',
		short: 'Private',
		description: 'Hidden from everyone except the people you invite, who can view and edit.'
	}
};

export function isVisibility(value: unknown): value is Visibility {
	return typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value);
}

/** Unknown/legacy values fall back to the permissive default, matching the column default. */
export function normalizeVisibility(value: unknown): Visibility {
	return isVisibility(value) ? value : DEFAULT_VISIBILITY;
}

export interface MapAccess {
	visibility: Visibility;
	isOwner: boolean;
	isMember: boolean;
	canView: boolean;
	canEdit: boolean;
	/** Change visibility, invite/remove people, manage the invite link. */
	canManage: boolean;
}

export function resolveAccess(
	map: { visibility: string | null; createdBy: string },
	userId: string | null | undefined,
	isMember: boolean
): MapAccess {
	const visibility = normalizeVisibility(map.visibility);
	const isOwner = !!userId && map.createdBy === userId;
	const invited = isOwner || (!!userId && isMember);
	return {
		visibility,
		isOwner,
		isMember: invited,
		canView: invited || visibility !== 'private',
		canEdit: invited || visibility === 'public_edit',
		canManage: isOwner
	};
}
