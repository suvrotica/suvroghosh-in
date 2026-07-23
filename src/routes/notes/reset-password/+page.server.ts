import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { assertSameOrigin, isConfiguredOwner } from '$lib/server/notes/auth';
import {
	clearRecoveryGrant,
	clearRecoveryToken,
	hasRecoveryGrant,
	isValidRecoveryTokenHash,
	readRecoveryToken,
	rememberRecoveryGrant,
	rememberRecoveryToken,
	validateRecoveryPassword
} from '$lib/server/notes/recovery';
import {
	createNotesServerClient,
	notesBackendConfigured,
	resolveNotesUser
} from '$lib/server/notes/supabase';

function recoveryBackendConfigured() {
	return (
		notesBackendConfigured() &&
		Boolean(
			env.NOTES_OWNER_USER_ID && env.NOTES_RATE_LIMIT_SALT && env.NOTES_RATE_LIMIT_SALT.length >= 32
		)
	);
}

const invalidLinkMessage = 'That reset link is invalid, expired, or has already been used.';

export const load: PageServerLoad = async (event) => {
	if (event.url.searchParams.has('token_hash')) {
		const tokenHash = event.url.searchParams.get('token_hash');
		clearRecoveryToken(event);
		clearRecoveryGrant(event);
		if (isValidRecoveryTokenHash(tokenHash)) {
			rememberRecoveryToken(event, tokenHash!);
			throw redirect(303, '/notes/reset-password');
		}
		throw redirect(303, '/notes/reset-password?invalid=1');
	}

	const configured = recoveryBackendConfigured();
	if (!configured) return { configured, stage: 'invalid' as const };

	const tokenHash = readRecoveryToken(event);
	if (tokenHash) return { configured, stage: 'confirm' as const };

	const user = event.locals.user;
	if (isConfiguredOwner(user?.id) && (await hasRecoveryGrant(event, user!.id))) {
		return { configured, stage: 'update' as const };
	}

	if (user && !isConfiguredOwner(user.id)) {
		await event.locals.supabase?.auth.signOut({ scope: 'local' });
	}
	clearRecoveryGrant(event);
	return {
		configured,
		stage: 'invalid' as const,
		message: event.url.searchParams.get('invalid') === '1' ? invalidLinkMessage : undefined
	};
};

export const actions: Actions = {
	confirm: async (event) => {
		assertSameOrigin(event);
		if (!recoveryBackendConfigured()) {
			return fail(503, {
				stage: 'invalid' as const,
				message: 'Secure password recovery is temporarily unavailable.'
			});
		}

		const tokenHash = readRecoveryToken(event);
		clearRecoveryToken(event);
		clearRecoveryGrant(event);
		if (!tokenHash) {
			return fail(400, {
				stage: 'invalid' as const,
				message: invalidLinkMessage
			});
		}

		const client = event.locals.supabase ?? createNotesServerClient(event);
		if (!client) {
			return fail(503, {
				stage: 'invalid' as const,
				message: 'Secure password recovery is temporarily unavailable.'
			});
		}

		const { data, error } = await client.auth.verifyOtp({
			token_hash: tokenHash,
			type: 'recovery'
		});
		if (error || !data.session || !data.user || !isConfiguredOwner(data.user.id)) {
			if (data.session) await client.auth.signOut({ scope: 'local' });
			return fail(400, {
				stage: 'invalid' as const,
				message: invalidLinkMessage
			});
		}

		if (!(await rememberRecoveryGrant(event, data.user.id))) {
			await client.auth.signOut({ scope: 'local' });
			return fail(503, {
				stage: 'invalid' as const,
				message: 'Secure password recovery is temporarily unavailable.'
			});
		}
		throw redirect(303, '/notes/reset-password');
	},

	update: async (event) => {
		assertSameOrigin(event);
		if (!recoveryBackendConfigured()) {
			return fail(503, {
				stage: 'invalid' as const,
				message: 'Secure password recovery is temporarily unavailable.'
			});
		}

		const client = event.locals.supabase ?? createNotesServerClient(event);
		if (!client) {
			return fail(503, {
				stage: 'invalid' as const,
				message: 'Secure password recovery is temporarily unavailable.'
			});
		}
		const user = event.locals.user ?? (await resolveNotesUser(event));
		if (!isConfiguredOwner(user?.id) || !(await hasRecoveryGrant(event, user!.id))) {
			clearRecoveryGrant(event);
			return fail(401, {
				stage: 'invalid' as const,
				message: invalidLinkMessage
			});
		}

		const form = await event.request.formData();
		const password = String(form.get('password') ?? '');
		const confirmation = String(form.get('passwordConfirmation') ?? '');
		const passwordError = validateRecoveryPassword(password, confirmation);
		if (passwordError) {
			return fail(400, {
				stage: 'update' as const,
				message: passwordError
			});
		}

		const { error } = await client.auth.updateUser({ password });
		if (error) {
			return fail(400, {
				stage: 'update' as const,
				message: 'That password was not accepted. Try a different, unique passphrase.'
			});
		}

		clearRecoveryToken(event);
		clearRecoveryGrant(event);
		const { error: signOutError } = await client.auth.signOut({ scope: 'global' });
		if (signOutError) await client.auth.signOut({ scope: 'local' });
		throw redirect(303, '/notes/sign-in?passwordReset=1');
	}
};
