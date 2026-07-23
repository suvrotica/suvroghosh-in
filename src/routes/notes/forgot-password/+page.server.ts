import { env } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { assertSameOrigin } from '$lib/server/notes/auth';
import { consumeOwnerRecoveryLimit } from '$lib/server/notes/rate-limit';
import {
	isValidRecoveryEmail,
	normaliseRecoveryEmail,
	notesRecoveryRedirectUrl
} from '$lib/server/notes/recovery';
import {
	createNotesAdminClient,
	createNotesPublicClient,
	notesBackendConfigured
} from '$lib/server/notes/supabase';

function recoveryBackendConfigured() {
	return (
		notesBackendConfigured() &&
		Boolean(
			env.NOTES_OWNER_USER_ID &&
			env.SUPABASE_SERVICE_ROLE_KEY &&
			env.NOTES_RATE_LIMIT_SALT &&
			env.NOTES_RATE_LIMIT_SALT.length >= 32
		)
	);
}

export const load: PageServerLoad = () => ({
	configured: recoveryBackendConfigured()
});

export const actions: Actions = {
	default: async (event) => {
		assertSameOrigin(event);
		if (!recoveryBackendConfigured()) {
			return fail(503, {
				message: 'Secure password recovery has not been configured.',
				email: ''
			});
		}

		const form = await event.request.formData();
		const email = normaliseRecoveryEmail(form.get('email'));
		if (!isValidRecoveryEmail(email)) {
			return fail(400, {
				message: 'Enter a valid email address.',
				email
			});
		}

		const rateLimit = await consumeOwnerRecoveryLimit(event, email);
		if (!rateLimit.configured) {
			return fail(503, {
				message: 'Secure password recovery is temporarily unavailable.',
				email: ''
			});
		}
		if (!rateLimit.allowed) return { sent: true };

		const admin = createNotesAdminClient();
		const publicClient = createNotesPublicClient();
		if (!admin || !publicClient || !env.NOTES_OWNER_USER_ID) {
			return fail(503, {
				message: 'Secure password recovery is temporarily unavailable.',
				email: ''
			});
		}

		const { data, error } = await admin.auth.admin.getUserById(env.NOTES_OWNER_USER_ID);
		const ownerEmail = normaliseRecoveryEmail(data.user?.email ?? null);
		if (!error && ownerEmail && ownerEmail === email) {
			await publicClient.auth.resetPasswordForEmail(email, {
				redirectTo: notesRecoveryRedirectUrl(event.url)
			});
		}

		return { sent: true };
	}
};
