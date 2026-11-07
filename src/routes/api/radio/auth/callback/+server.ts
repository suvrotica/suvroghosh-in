import type { RequestHandler } from '@sveltejs/kit';
import { completeGoogleAuthorizationCallback, setRadioSessionCookie } from '$lib/server/radio/auth';
import { upsertRadioAccount } from '$lib/server/radio/store';
import { RADIO_PRIVATE_HEADERS, radioWriteAdmission } from '$lib/server/radio/http';

export const GET: RequestHandler = async (event) => {
	const lease = radioWriteAdmission.tryAcquire(event.getClientAddress());
	if (!lease.ok) {
		return new Response(null, {
			status: 302,
			headers: {
				...RADIO_PRIVATE_HEADERS,
				Location: '/tools/radio?authError=rate_limited'
			}
		});
	}

	try {
		const oauthError = event.url.searchParams.get('error');
		if (oauthError) {
			return new Response(null, {
				status: 302,
				headers: {
					...RADIO_PRIVATE_HEADERS,
					Location: `/tools/radio?authError=${encodeURIComponent(oauthError)}`
				}
			});
		}

		const { user, returnTo } = await completeGoogleAuthorizationCallback(event);
		await upsertRadioAccount(user);
		await setRadioSessionCookie(event, user);

		return new Response(null, {
			status: 302,
			headers: {
				...RADIO_PRIVATE_HEADERS,
				Location: returnTo || '/tools/radio'
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'oauth_callback_failed';
		return new Response(null, {
			status: 302,
			headers: {
				...RADIO_PRIVATE_HEADERS,
				Location: `/tools/radio?authError=${encodeURIComponent(message.slice(0, 80))}`
			}
		});
	} finally {
		lease.release();
	}
};
