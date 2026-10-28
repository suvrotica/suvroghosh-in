import { z } from 'zod';
import { readBoundedBody, withDeadline } from '$lib/server/http/body';
import type { UmlServerConfig } from './config';
import { UmlServiceFailure } from './failure';

export type UmlQuotaReservation = { allowed: boolean; retryAfterSeconds: number };
const reservationSchema = z.object({
	allowed: z.boolean(),
	retryAfterSeconds: z.number().int().min(0).max(86_400)
});

/** One identity per owner/hour across IP addresses and application instances. */
export async function umlOwnerQuotaHash(ownerId: string, salt: string, now = new Date()) {
	if (!ownerId || ownerId.length > 256 || salt.length < 32)
		throw new UmlServiceFailure('quota_unavailable', 'Shared AI usage limits are not configured.');
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(salt),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const digest = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(`post-to-uml:${now.toISOString().slice(0, 13)}:${ownerId}`)
	);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Reuse the existing atomic, service-only quota RPC. Its daily pool is shared with Prompt Atlas. */
export async function reserveUmlUsage(
	config: UmlServerConfig,
	ownerId: string,
	signal: AbortSignal,
	fetcher: typeof fetch = fetch
): Promise<UmlQuotaReservation> {
	try {
		return await withDeadline(async (deadline) => {
			const combined = AbortSignal.any([signal, deadline]);
			const response = await fetcher(
				`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/reserve_prompt_atlas_usage`,
				{
					method: 'POST',
					redirect: 'error',
					signal: combined,
					headers: {
						'content-type': 'application/json',
						apikey: config.supabaseKey,
						authorization: `Bearer ${config.supabaseKey}`
					},
					body: JSON.stringify({
						client_hash: await umlOwnerQuotaHash(ownerId, config.salt),
						daily_request_limit: 50,
						hourly_client_limit: 5
					})
				}
			);
			const bytes = await readBoundedBody(response, 16 * 1024, 4_000, combined);
			if (!response.ok) throw new Error('Quota unavailable');
			return reservationSchema.parse(
				JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
			);
		}, 5_000);
	} catch {
		if (signal.aborted) throw new DOMException('Generation cancelled.', 'AbortError');
		throw new UmlServiceFailure(
			'quota_unavailable',
			'Shared AI usage limits are unavailable. No provider request was sent.'
		);
	}
}
