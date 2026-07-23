import { env } from '$env/dynamic/private';
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { createNotesServerClient, notesBackendConfigured, resolveNotesUser } from './supabase';

export function isConfiguredOwner(userId?: string | null) {
	return Boolean(userId && env.NOTES_OWNER_USER_ID && userId === env.NOTES_OWNER_USER_ID);
}

export async function requireNotesOwner(event: RequestEvent, redirectToSignIn = false) {
	if (!notesBackendConfigured() || !env.NOTES_OWNER_USER_ID) {
		throw error(503, {
			message: 'The notes backend is not configured. See the handwritten-notes setup guide.'
		});
	}
	const user = event.locals.user ?? (await resolveNotesUser(event));
	if (!user) {
		if (redirectToSignIn) {
			const returnTo = encodeURIComponent(`${event.url.pathname}${event.url.search}`);
			throw redirect(303, `/notes/sign-in?returnTo=${returnTo}`);
		}
		throw error(401, { message: 'Sign in is required.' });
	}
	if (!isConfiguredOwner(user.id)) {
		await event.locals.supabase?.auth.signOut({ scope: 'local' });
		throw error(404, { message: 'Not found' });
	}
	return user;
}

export async function requireFreshNotesOwner(event: RequestEvent, maxAgeMinutes = 12 * 60) {
	const user = await requireNotesOwner(event);
	const { data: isFresh, error: freshnessError } = await getNotesClient(event).rpc(
		'note_session_is_fresh',
		{ p_max_age_minutes: maxAgeMinutes }
	);
	if (freshnessError || isFresh !== true) {
		throw error(401, {
			message: 'Sign out and sign in again before publishing, unpublishing, or archiving notes.'
		});
	}
	return user;
}

export function getNotesClient(event: RequestEvent) {
	const client = event.locals.supabase ?? createNotesServerClient(event);
	if (!client) {
		throw error(503, { message: 'The notes backend is not configured.' });
	}
	event.locals.supabase = client;
	return client;
}

export function assertSameOrigin(event: RequestEvent) {
	const origin = event.request.headers.get('origin');
	const fetchSite = event.request.headers.get('sec-fetch-site');
	const exactOrigin = origin === event.url.origin;
	const browserConfirmedSameOrigin = fetchSite === 'same-origin';
	if (!exactOrigin && !browserConfirmedSameOrigin) {
		throw error(403, { message: 'Cross-site requests are not allowed.' });
	}
}
