import { redirect, type RequestHandler } from '@sveltejs/kit';
import { createGoogleAuthorizationRedirect } from '$lib/server/radio/auth';
import { getRadioServerConfig } from '$lib/server/radio/config';
import { RADIO_PRIVATE_HEADERS, radioWriteAdmission } from '$lib/server/radio/http';

export const GET: RequestHandler = async (event) => {
	const lease = radioWriteAdmission.tryAcquire(event.getClientAddress());
	if (!lease.ok) {
		throw redirect(302, '/tools/radio?authError=rate_limited');
	}

	try {
		const config = getRadioServerConfig(event.url);
		if (!config.googleConfigured) {
			throw redirect(302, '/tools/radio?authError=oauth_unconfigured');
		}

		const returnTo = event.url.searchParams.get('returnTo') || '/tools/radio';
		const authUrl = await createGoogleAuthorizationRedirect(event, returnTo);

		return new Response(null, {
			status: 302,
			headers: {
				...RADIO_PRIVATE_HEADERS,
				Location: authUrl
			}
		});
	} finally {
		lease.release();
	}
};
