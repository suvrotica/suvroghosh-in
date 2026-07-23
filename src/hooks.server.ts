import { redirect, type Handle } from '@sveltejs/kit';
import { slugifyCategory } from '$lib/content/categories';
import { notesAuthReferrerPolicy } from '$lib/server/notes/referrer-policy';
import { resolveNotesUser } from '$lib/server/notes/supabase';

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	event.locals.supabase = null;
	event.locals.user = null;
	event.locals.requestId = crypto.randomUUID();
	event.locals.supabaseResponseHeaders = {};

	const match = path.match(/^\/blog\/([^/]+)(\/.*)?$/);
	if (match) {
		const rawCategory = decodeURIComponent(match[1]);
		const normalized = slugifyCategory(rawCategory);
		const rest = match[2] ?? '';

		if (rawCategory !== normalized) {
			throw redirect(301, `/blog/${normalized}${rest}`);
		}
	}

	const matchesPath = (base: string) => path === base || path.startsWith(`${base}/`);
	const isStudio = matchesPath('/notes/studio');
	const isSignIn = matchesPath('/notes/sign-in');
	const isForgotPassword = matchesPath('/notes/forgot-password');
	const isResetPassword = matchesPath('/notes/reset-password');
	const isNotesAuthCallback = matchesPath('/notes/auth');
	const isNotesAuth = isSignIn || isForgotPassword || isResetPassword || isNotesAuthCallback;
	const isProtectedNotesApi = matchesPath('/api/notes');
	const needsNotesSession = isStudio || isSignIn || isResetPassword || isProtectedNotesApi;
	if (needsNotesSession) await resolveNotesUser(event);

	const response = await resolve(event);
	response.headers.set('x-request-id', event.locals.requestId);
	for (const [name, value] of Object.entries(event.locals.supabaseResponseHeaders)) {
		response.headers.set(name, value);
	}
	response.headers.set(
		'referrer-policy',
		// A native form POST can serialize Origin as null under no-referrer, which
		// SvelteKit correctly rejects. Keep no-referrer only while a secret is still
		// present in the URL; clean auth pages never send a referrer cross-origin.
		isNotesAuth ? notesAuthReferrerPolicy(event.url) : 'strict-origin-when-cross-origin'
	);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	if (isStudio || isNotesAuth || isProtectedNotesApi) {
		response.headers.set(
			'cache-control',
			'private, no-cache, no-store, must-revalidate, max-age=0'
		);
		response.headers.set('pragma', 'no-cache');
		response.headers.set('expires', '0');
		response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
	}
	return response;
};
