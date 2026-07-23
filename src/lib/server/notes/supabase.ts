import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

export function notesBackendConfigured() {
	return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
}

export function createNotesServerClient(event: RequestEvent): SupabaseClient | null {
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_PUBLISHABLE_KEY;
	if (!url || !key) return null;
	return createServerClient(url, key, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				for (const cookie of cookies) {
					event.cookies.set(cookie.name, cookie.value, {
						...cookie.options,
						path: cookie.options.path ?? '/'
					});
				}
			}
		},
		cookieOptions: {
			path: '/',
			sameSite: 'lax',
			secure: !event.url.hostname.startsWith('localhost'),
			httpOnly: true
		}
	});
}

export function createNotesPublicClient(): SupabaseClient | null {
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_PUBLISHABLE_KEY;
	if (!url || !key) return null;
	return createClient(url, key, {
		auth: {
			autoRefreshToken: false,
			detectSessionInUrl: false,
			persistSession: false
		}
	});
}

export function createNotesAdminClient(): SupabaseClient | null {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
	return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: {
			autoRefreshToken: false,
			detectSessionInUrl: false,
			persistSession: false
		}
	});
}

export async function resolveNotesUser(event: RequestEvent): Promise<User | null> {
	const client = createNotesServerClient(event);
	event.locals.supabase = client;
	if (!client) return null;
	const {
		data: { user },
		error
	} = await client.auth.getUser();
	if (error || !user) return null;
	event.locals.user = user;
	return user;
}
