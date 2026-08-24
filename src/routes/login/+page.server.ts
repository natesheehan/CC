import { fail, redirect } from '@sveltejs/kit';
import { getOrCreateUser, createSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		throw redirect(303, url.searchParams.get('redirectTo') || '/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();

		if (name.length < 2 || name.length > 40) {
			return fail(400, { error: 'Name must be between 2 and 40 characters.', name });
		}

		try {
			const user = await getOrCreateUser(name);
			await createSession(cookies, user.id);
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Could not sign in.', name });
		}

		throw redirect(303, url.searchParams.get('redirectTo') || '/');
	}
};
