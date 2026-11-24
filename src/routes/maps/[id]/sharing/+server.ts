import { json, error } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mapMembers, maps, users } from '$lib/server/db/schema';
import { addMember, removeMember, requireMapManage, requireMapView } from '$lib/server/access';
import { logActivity } from '$lib/server/activity';
import { rateLimitUserWrite } from '$lib/server/rateLimit';
import { VISIBILITY_META, isVisibility } from '$lib/shared/access';
import type { ClientMapMember, ClientSharing } from '$lib/shared/types';
import type { MapRow } from '$lib/server/db/schema';
import type { MapAccess, Visibility } from '$lib/shared/access';
import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';
import { LIGHT_FUNCTION_CONFIG } from '$lib/server/functionConfig';

export const config: Config = LIGHT_FUNCTION_CONFIG;

// Who can see / edit a map. Anyone who can view the map can see who's
// invited; only the owner changes visibility, invites or removes people,
// or sees the invite link. Members may remove themselves (leave).

async function sharingState(map: MapRow, access: MapAccess): Promise<ClientSharing> {
	const owner = await db.select().from(users).where(eq(users.id, map.createdBy)).get();
	const rows = await db
		.select({ userId: users.id, name: users.name, color: users.color, addedAt: mapMembers.createdAt })
		.from(mapMembers)
		.innerJoin(users, eq(mapMembers.userId, users.id))
		.where(eq(mapMembers.mapId, map.id))
		.orderBy(asc(mapMembers.createdAt))
		.all();
	const members: ClientMapMember[] = [
		...(owner ? [{ userId: owner.id, name: owner.name, color: owner.color, isOwner: true, addedAt: null }] : []),
		...rows
			.filter((r) => r.userId !== map.createdBy)
			.map((r) => ({ ...r, isOwner: false, addedAt: r.addedAt.toISOString() }))
	];
	return {
		visibility: access.visibility,
		canManage: access.canManage,
		members,
		invitePath: access.canManage && map.inviteToken ? `/maps/${map.id}/join/${map.inviteToken}` : null
	};
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	const { map, access } = await requireMapView(params.id, locals.user.id);
	return json(await sharingState(map, access));
};

/** { visibility?: Visibility, invite?: 'enable' | 'rotate' | 'disable' } */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);
	const { map } = await requireMapManage(params.id, locals.user.id);
	const body = (await request.json().catch(() => ({}))) as { visibility?: unknown; invite?: unknown };

	const updates: Partial<typeof maps.$inferInsert> = {};
	let nextVisibility: Visibility | null = null;
	if (body.visibility !== undefined) {
		if (!isVisibility(body.visibility)) throw error(400, 'Unknown visibility.');
		nextVisibility = updates.visibility = body.visibility;
	}
	if (body.invite === 'enable') updates.inviteToken = map.inviteToken ?? nanoid(24);
	else if (body.invite === 'rotate') updates.inviteToken = nanoid(24);
	else if (body.invite === 'disable') updates.inviteToken = null;
	else if (body.invite !== undefined) throw error(400, 'Unknown invite action.');

	if (Object.keys(updates).length > 0) {
		await db.update(maps).set(updates).where(eq(maps.id, params.id)).run();
	}
	if (nextVisibility && nextVisibility !== map.visibility) {
		await logActivity({
			mapId: params.id,
			userId: locals.user.id,
			action: 'changed_visibility',
			entityType: 'map',
			entityId: params.id,
			summary: `Changed who can access the map to "${VISIBILITY_META[nextVisibility].label}"`
		});
	}

	const fresh = await requireMapView(params.id, locals.user.id);
	return json(await sharingState(fresh.map, fresh.access));
};

/** Invite someone by display name: { name } */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);
	const { map } = await requireMapManage(params.id, locals.user.id);
	const body = (await request.json().catch(() => ({}))) as { name?: unknown };
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!name) throw error(400, 'Enter the name they sign in with.');

	const user = await db.select().from(users).where(sql`lower(${users.name}) = lower(${name})`).get();
	if (!user) {
		throw error(404, `No one has signed in as "${name}" yet. Send them the invite link instead.`);
	}
	if (user.id !== map.createdBy) {
		const already = await db
			.select({ userId: mapMembers.userId })
			.from(mapMembers)
			.where(and(eq(mapMembers.mapId, params.id), eq(mapMembers.userId, user.id)))
			.get();
		if (!already) {
			await addMember(params.id, user.id, locals.user.id);
			await logActivity({
				mapId: params.id,
				userId: locals.user.id,
				action: 'invited_member',
				entityType: 'member',
				entityId: user.id,
				summary: `Invited ${user.name} to edit the map`
			});
		}
	}

	const fresh = await requireMapView(params.id, locals.user.id);
	return json(await sharingState(fresh.map, fresh.access), { status: 201 });
};

/** Remove someone: ?userId=… (owner), or yourself (leave). */
export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) throw error(401, 'Sign in required');
	await rateLimitUserWrite(locals.user.id);
	const userId = url.searchParams.get('userId') ?? locals.user.id;
	const { map, access } = await requireMapView(params.id, locals.user.id);
	if (userId !== locals.user.id && !access.canManage) throw error(403, "Only the map's owner can remove people.");
	if (userId === map.createdBy) throw error(400, "The owner can't be removed from their own map.");

	const removed = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get();
	await removeMember(params.id, userId);
	await logActivity({
		mapId: params.id,
		userId: locals.user.id,
		action: 'removed_member',
		entityType: 'member',
		entityId: userId,
		summary: userId === locals.user.id ? 'Left the map' : `Removed ${removed?.name ?? 'someone'} from the map`
	});

	// Leaving a private map means you can't see it any more.
	const fresh = await requireMapView(params.id, locals.user.id).catch(() => null);
	return json(fresh ? await sharingState(fresh.map, fresh.access) : { left: true });
};
