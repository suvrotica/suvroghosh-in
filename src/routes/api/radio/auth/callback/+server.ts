import type { RequestHandler } from '@sveltejs/kit';
import { completeGoogleAuthorizationCallback, setRadioSessionCookie } from '$lib/server/radio/auth';
import { upsertRadioAccount } from '$lib/server/radio/store';
import { RADIO_PRIVATE_HEADERS, radioWriteAdmission } from '$lib/server/radio/http';
import { withRadioPersistence } from '$lib/server/radio/persistence';

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
		// Google exchange/JWKS verification happen before acquiring the shared room
		// lease. Only an already verified identity reaches the durable account write.
		const response = await withRadioPersistence(
			event,
			async () => {
				await upsertRadioAccount(user);
				return new Response(null, {
					status: 302,
					headers: { ...RADIO_PRIVATE_HEADERS, Location: returnTo || '/tools/radio' }
				});
			},
			user
		);
		// Cookie mutations survive response replacement in SvelteKit. Issue the
		// signed session only after the durable account commit has succeeded.
		if (response.status === 302) await setRadioSessionCookie(event, user);
		return response;
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
