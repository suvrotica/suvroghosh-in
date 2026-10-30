import { createHmac } from 'node:crypto';
import { readBoundedBody, withDeadline } from '$lib/server/http/body';

export type TtsQuotaConfig = {
	supabaseUrl: string;
	supabaseKey: string;
	salt: string;
};

type Environment = Record<string, string | undefined>;

function privateHttpUrl(value: string, originOnly = false) {
	try {
		const url = new URL(value);
		const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
		return (
			(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash &&
			(!originOnly || url.pathname === '/')
		);
	} catch {
		return false;
	}
}

/** The browser flag only displays controls. Every provider call needs these private controls. */
export function ttsQuotaConfig(env: Environment): TtsQuotaConfig | null {
	const endpoint = env.CHATTERBOX_TTS_ENDPOINT?.trim() ?? '';
	const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/$/, '') ?? '';
	const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
	const salt = env.CHATTERBOX_TTS_RATE_LIMIT_SALT?.trim() ?? '';
	if (
		env.CHATTERBOX_TTS_ENABLED !== 'true' ||
		!privateHttpUrl(endpoint) ||
		!privateHttpUrl(supabaseUrl, true) ||
		!supabaseKey ||
		salt.length < 32
	)
		return null;
	return { supabaseUrl, supabaseKey, salt };
}

export function ttsClientHash(address: string, salt: string, now = new Date()) {
	if (!address || address.length > 256 || salt.length < 32)
		throw new Error('Invalid quota identity');
	return createHmac('sha256', salt)
		.update(`chatterbox:${now.toISOString().slice(0, 10)}:${address}`)
		.digest('hex');
}

/** A reservation is consumed even after failure, timeout, abort, or an unknown RPC outcome. */
export async function reserveTtsUsage(
	config: TtsQuotaConfig,
	address: string,
	characters: number,
	signal: AbortSignal,
	fetcher: typeof fetch = fetch
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
	if (!Number.isInteger(characters) || characters < 1 || characters > 3000)
		throw new Error('Invalid quota size');
	const clientHash = ttsClientHash(address, config.salt);
	return withDeadline(async (deadline) => {
		const combined = AbortSignal.any([signal, deadline]);
		combined.throwIfAborted();
		const response = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/reserve_chatterbox_usage`, {
			method: 'POST',
			redirect: 'error',
			cache: 'no-store',
			signal: combined,
			headers: {
				'content-type': 'application/json',
				apikey: config.supabaseKey,
				authorization: `Bearer ${config.supabaseKey}`
			},
			body: JSON.stringify({ client_hash: clientHash, text_characters: characters })
		});
		if (!response.ok) {
			void response.body?.cancel().catch(() => {});
			throw new Error('Quota unavailable');
		}
		const bytes = await readBoundedBody(response, 4096, 5000, combined);
		const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new Error('Invalid quota receipt');
		const { allowed, retryAfterSeconds } = value as Record<string, unknown>;
		if (
			typeof allowed !== 'boolean' ||
			typeof retryAfterSeconds !== 'number' ||
			!Number.isInteger(retryAfterSeconds) ||
			retryAfterSeconds < (allowed ? 0 : 1) ||
			retryAfterSeconds > (allowed ? 0 : 86400)
		)
			throw new Error('Invalid quota receipt');
		combined.throwIfAborted();
		return { allowed, retryAfterSeconds };
	}, 5000);
}
