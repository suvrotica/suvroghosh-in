import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { getRadioServerConfig } from '$lib/server/radio/config';
import { createPostgresRadioBackend, runRadioTransaction } from '$lib/server/radio/persistence';
import { sweepExpiredRadioTransmissions } from '$lib/server/radio/store';

export const config = { maxDuration: 30 };
const URL_CANONICAL = 'https://www.suvroghosh.in/api/internal/radio-watchdog';
const Payload = z
	.object({ dispatchId: z.string().uuid(), expiresAt: z.number().int().positive().safe() })
	.strict();
const headers = {
	'Cache-Control': 'private, no-store',
	'X-Robots-Tag': 'noindex, nofollow',
	'Referrer-Policy': 'no-referrer'
};
const admit = createLocalAdmission({
	attempts: 60,
	globalAttempts: 60,
	windowMs: 60_000,
	concurrency: 1,
	maxKeys: 1
});
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function watchdogRpc(name: 'claim' | 'finish', body: unknown): Promise<boolean> {
	const base = new URL(env.SUPABASE_URL!);
	if (base.protocol !== 'https:') throw new Error('Watchdog persistence is unavailable.');
	const response = await fetch(new URL(`/rest/v1/rpc/comm_link_watchdog_${name}`, base), {
		method: 'POST',
		headers: {
			apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
			Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(2000),
		cache: 'no-store'
	});
	if (!response.ok) throw new Error('Watchdog persistence is unavailable.');
	return (await response.json()) === true;
}

export const POST: RequestHandler = async (event) => {
	const provider = getRadioServerConfig(event.url);
	const secret = env.COMM_LINK_WATCHDOG_SECRET?.trim();
	if (
		env.VERCEL_ENV !== 'production' ||
		event.url.href !== URL_CANONICAL ||
		!secret ||
		Buffer.byteLength(secret, 'utf8') < 32 ||
		!provider.livekitConfigured ||
		!provider.supabaseConfigured
	) {
		return reply({ ok: false, error: 'Radio watchdog is unavailable.' }, 503);
	}
	const proof = /^Bearer ([a-f0-9]{64})$/.exec(
		event.request.headers.get('authorization') ?? ''
	)?.[1];
	if (!proof) {
		return reply({ ok: false, error: 'Worker authorization is required.' }, 401);
	}
	const origin = event.request.headers.get('origin');
	const site = event.request.headers.get('sec-fetch-site');
	if (
		(origin && origin !== event.url.origin) ||
		(site && site !== 'same-origin' && site !== 'none')
	) {
		return reply({ ok: false, error: 'Cross-site worker requests are not allowed.' }, 403);
	}
	if (
		event.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
		'application/json'
	) {
		return reply({ ok: false, error: 'Send JSON.' }, 415);
	}
	let dispatchId: string;
	let expiresAt: number;
	try {
		const bytes = await readBoundedBody(event.request, 128, 1000, event.request.signal);
		({ dispatchId, expiresAt } = Payload.parse(
			JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
		));
	} catch (error) {
		const status = error instanceof BodyReadError ? (error.kind === 'too-large' ? 413 : 408) : 400;
		return reply({ ok: false, error: 'Invalid watchdog request.' }, status);
	}
	// pg_net queues can be readable on managed Supabase. Queue only a short-lived
	// proof for this exact dispatch, never the reusable Vault/server signing key.
	const now = Math.floor(Date.now() / 1000);
	const message = `comm-link-watchdog:v1\n${dispatchId}\n${expiresAt}\nPOST\n${URL_CANONICAL}`;
	const expected = createHmac('sha256', secret).update(message, 'utf8').digest();
	if (
		expiresAt <= now ||
		expiresAt > now + 30 ||
		!timingSafeEqual(expected, Buffer.from(proof, 'hex'))
	) {
		return reply({ ok: false, error: 'Worker authorization is required.' }, 401);
	}
	const admission = admit('watchdog');
	if (!admission.allowed) return reply({ ok: false, error: 'Watchdog is busy.' }, 429);
	const owner = randomUUID();
	let claimed = false;
	let acknowledged = false;
	try {
		claimed = await watchdogRpc('claim', { p_dispatch_id: dispatchId, p_owner: owner });
		if (!claimed) return reply({ ok: true, skipped: true });
		const report = await runRadioTransaction(
			createPostgresRadioBackend(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!),
			() => sweepExpiredRadioTransmissions(),
			{ mediaEnabled: true, maxActionMs: 8000, waitMs: 1500 }
		);
		// Even a partial sweep commits successful removals. Failed publisher leases
		// stay in the snapshot and remain due for the next independent retry.
		acknowledged = await watchdogRpc('finish', {
			p_dispatch_id: dispatchId,
			p_owner: owner,
			p_success: report.failures === 0
		});
		if (!acknowledged)
			return reply({ ok: false, error: 'Watchdog acknowledgement was not committed.' }, 503);
		return reply(
			{ ok: report.failures === 0, revoked: report.revoked, failures: report.failures },
			report.failures ? 503 : 200
		);
	} catch {
		return reply({ ok: false, error: 'Radio expiry cleanup will be retried.' }, 503);
	} finally {
		if (claimed && !acknowledged) {
			await watchdogRpc('finish', {
				p_dispatch_id: dispatchId,
				p_owner: owner,
				p_success: false
			}).catch(() => undefined);
		}
		admission.release?.();
	}
};
