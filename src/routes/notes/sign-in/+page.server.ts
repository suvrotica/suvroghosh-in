import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { assertSameOrigin, isConfiguredOwner } from '$lib/server/notes/auth';
import { safeStudioReturnTo } from '$lib/server/notes/recovery';
import { createNotesServerClient, notesBackendConfigured } from '$lib/server/notes/supabase';
import { clearSuccessfulSignInLimit, consumeOwnerSignInLimit } from '$lib/server/notes/rate-limit';

export const load: PageServerLoad = ({ locals, url }) => {
	if (isConfiguredOwner(locals.user?.id))
		throw redirect(303, safeStudioReturnTo(url.searchParams.get('returnTo')));
	return {
		configured:
			notesBackendConfigured() &&
			Boolean(
				env.NOTES_OWNER_USER_ID &&
				env.SUPABASE_SERVICE_ROLE_KEY &&
				env.NOTES_RATE_LIMIT_SALT &&
				env.NOTES_RATE_LIMIT_SALT.length >= 32
			),
		returnTo: safeStudioReturnTo(url.searchParams.get('returnTo')),
		passwordReset: url.searchParams.get('passwordReset') === '1'
	};
};

export const actions: Actions = {
	default: async (event) => {
		assertSameOrigin(event);
		if (!notesBackendConfigured() || !env.NOTES_OWNER_USER_ID) {
			return fail(503, {
				message: 'The owner sign-in backend has not been configured.',
				email: ''
			});
		}
		const form = await event.request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.slice(0, 320);
		const password = String(form.get('password') ?? '').slice(0, 512);
		const returnTo = safeStudioReturnTo(form.get('returnTo'));
		if (!email || !password) {
			return fail(400, { message: 'Enter the owner email address and password.', email });
		}
		const rateLimit = await consumeOwnerSignInLimit(event, email);
		if (!rateLimit.configured) {
			return fail(503, {
				message: 'Secure owner sign-in throttling is not configured.',
				email
			});
		}
		if (!rateLimit.allowed) {
			return fail(429, {
				message: 'Too many sign-in attempts. Wait before trying again.',
				email
			});
		}
		const client = event.locals.supabase ?? createNotesServerClient(event);
		if (!client) {
			return fail(503, { message: 'The owner sign-in backend is unavailable.', email });
		}
		const { data, error } = await client.auth.signInWithPassword({ email, password });
		if (error || !data.user || !isConfiguredOwner(data.user.id)) {
			if (data.session) await client.auth.signOut({ scope: 'local' });
			return fail(400, {
				message: 'The email address or password was not accepted.',
				email
			});
		}
		await clearSuccessfulSignInLimit(rateLimit.accountKey);
		throw redirect(303, returnTo);
	}
};
