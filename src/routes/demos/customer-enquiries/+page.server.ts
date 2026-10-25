import type { PageServerLoad } from './$types';
import { authenticated, demoEnabled } from '$lib/server/enquiry-demo/runtime';
import {
	loadPublicSession,
	publicModeEnabled,
	sandboxInfo,
	staffActive
} from '$lib/server/enquiry-demo/public-runtime';

export const prerender = false;

export const load: PageServerLoad = async ({ url, cookies, setHeaders, request }) => {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	if (publicModeEnabled(url)) {
		try {
			const workspace = await loadPublicSession(cookies, request.signal);
			return {
				enabled: true,
				publicMode: true,
				authenticated: Boolean(workspace && staffActive(workspace)),
				sandbox: workspace ? sandboxInfo(workspace) : null
			};
		} catch {
			return { enabled: true, publicMode: true, authenticated: false, sandbox: null };
		}
	}
	const enabled = demoEnabled(url);
	try {
		return { enabled, authenticated: enabled && authenticated(cookies) };
	} catch {
		// An unavailable local session database must not expose private desk data.
		return { enabled, authenticated: false };
	}
};
