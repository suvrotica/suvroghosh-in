import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import { createNotesAdminClient } from './supabase';

async function hashKey(value: string) {
	const salt = env.NOTES_RATE_LIMIT_SALT;
	if (!salt) return null;
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(`${salt}:${value}`)
	);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function clientAddress(event: RequestEvent) {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

export async function consumeOwnerSignInLimit(event: RequestEvent, email: string) {
	const client = createNotesAdminClient();
	const address = clientAddress(event);
	const ipKey = await hashKey(`signin-ip:${address}`);
	const accountKey = await hashKey(`signin-account:${address}:${email.trim().toLowerCase()}`);
	if (!client || !ipKey || !accountKey) {
		return { configured: false, allowed: false, accountKey: null };
	}
	const [ip, account] = await Promise.all([
		client.rpc('consume_note_auth_rate_limit', {
			p_key_hash: ipKey,
			p_limit: 20,
			p_window_seconds: 900,
			p_block_seconds: 1800
		}),
		client.rpc('consume_note_auth_rate_limit', {
			p_key_hash: accountKey,
			p_limit: 6,
			p_window_seconds: 900,
			p_block_seconds: 1800
		})
	]);
	if (ip.error || account.error) {
		return { configured: false, allowed: false, accountKey: null };
	}
	return {
		configured: true,
		allowed: ip.data === true && account.data === true,
		accountKey
	};
}

export async function clearSuccessfulSignInLimit(accountKey: string | null) {
	if (!accountKey) return;
	await createNotesAdminClient()?.rpc('clear_note_auth_rate_limit', {
		p_key_hash: accountKey
	});
}
