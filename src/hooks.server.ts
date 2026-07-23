import { redirect, type Handle } from '@sveltejs/kit';
import { slugifyCategory } from '$lib/content/categories';
import { resolveNotesUser } from '$lib/server/notes/supabase';

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	event.locals.supabase = null;
	event.locals.user = null;
	event.locals.requestId = crypto.randomUUID();

	const match = path.match(/^\/blog\/([^/]+)(\/.*)?$/);
	if (match) {
		const rawCategory = decodeURIComponent(match[1]);
		const normalized = slugifyCategory(rawCategory);
		const rest = match[2] ?? '';

		if (rawCategory !== normalized) {
			throw redirect(301, `/blog/${normalized}${rest}`);
		}
	}

	const isStudio = path === '/notes/studio' || path.startsWith('/notes/studio/');
	const isSignIn = path === '/notes/sign-in' || path.startsWith('/notes/sign-in/');
	const isProtectedNotesApi = path.startsWith('/api/notes/');
	const needsNotesSession = isStudio || isSignIn || isProtectedNotesApi;
	if (needsNotesSession) await resolveNotesUser(event);

	const response = await resolve(event);
	response.headers.set('x-request-id', event.locals.requestId);
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	if (isStudio || isSignIn || isProtectedNotesApi) {
		response.headers.set('cache-control', 'private, no-store');
		response.headers.set('x-robots-tag', 'noindex, nofollow');
	}
	return response;
};
