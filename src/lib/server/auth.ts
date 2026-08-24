import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users, sessions, type User } from './db/schema';
import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'session_id';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const AVATAR_COLORS = [
	'#2563eb',
	'#7c3aed',
	'#16a34a',
	'#dc2626',
	'#0891b2',
	'#ea580c',
	'#db2777',
	'#65a30d',
	'#9333ea',
	'#0d9488'
];

function colorForName(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Find an existing user by (case-insensitive) name, or create one. */
export async function getOrCreateUser(name: string): Promise<User> {
	const trimmed = name.trim();
	if (trimmed.length < 2 || trimmed.length > 40) {
		throw new Error('Name must be between 2 and 40 characters.');
	}

	const allUsers = await db.select().from(users).all();
	const existing = allUsers.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
	if (existing) return existing;

	const user: User = {
		id: nanoid(),
		name: trimmed,
		color: colorForName(trimmed),
		createdAt: new Date()
	};
	await db.insert(users).values(user).run();
	return user;
}

export async function createSession(cookies: Cookies, userId: string): Promise<void> {
	const id = nanoid(32);
	const now = new Date();
	const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

	await db.insert(sessions).values({ id, userId, createdAt: now, expiresAt }).run();

	cookies.set(SESSION_COOKIE, id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export async function destroySession(cookies: Cookies): Promise<void> {
	const id = cookies.get(SESSION_COOKIE);
	if (id) {
		await db.delete(sessions).where(eq(sessions.id, id)).run();
	}
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function getUserFromSession(cookies: Cookies): Promise<User | null> {
	const id = cookies.get(SESSION_COOKIE);
	if (!id) return null;

	const session = await db.select().from(sessions).where(eq(sessions.id, id)).get();
	if (!session) return null;

	if (session.expiresAt.getTime() < Date.now()) {
		await db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}

	const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
	return user ?? null;
}
