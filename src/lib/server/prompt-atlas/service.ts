import { z } from 'zod';
import { BodyReadError, readBoundedBody, withDeadline } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { MAX_CODE_POINTS, type PromptOntology } from '$lib/visualizations/prompt-atlas/types';
import {
	configurationReason,
	semanticHeaders,
	SEMANTIC_MAX_BYTES,
	SEMANTIC_MODEL,
	SEMANTIC_PROVIDER,
	SEMANTIC_TIMEOUT_MS,
	type SemanticConfig
} from './config';

export class SemanticFailure extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly status = 503
	) {
		super(message);
	}
}

export type QuotaReservation = { allowed: boolean; retryAfterSeconds: number };
export type SemanticDependencies = {
	verifyFreeRoute(signal: AbortSignal): Promise<void>;
	reserve(clientHash: string, signal: AbortSignal): Promise<QuotaReservation>;
	generate(text: string, signal: AbortSignal): Promise<PromptOntology>;
};
type Event = { request: Request; url: URL; getClientAddress(): string };
const inputSchema = z.strictObject({
	text: z
		.string()
		.min(1)
		.refine((text) => Boolean(text.trim()) && Array.from(text).length <= MAX_CODE_POINTS),
	consent: z.literal(true)
});

export async function semanticClientHash(address: string, salt: string, now = new Date()) {
	if (!address || address.length > 256 || salt.length < 32)
		throw new SemanticFailure('configuration', 'Secure AI usage limits are unavailable.');
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
		new TextEncoder().encode(`prompt-atlas:${now.toISOString().slice(0, 13)}:${address}`)
	);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function response(body: unknown, status = 200, extra: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...semanticHeaders, 'content-type': 'application/json; charset=utf-8', ...extra }
	});
}
function failure(cause: unknown) {
	if (cause instanceof SemanticFailure)
		return response({ error: cause.message, code: cause.code }, cause.status);
	if (cause instanceof BodyReadError) {
		if (cause.kind === 'too-large')
			return response({ error: 'The prompt request exceeds 2 MiB.', code: 'too_large' }, 413);
		return response(
			{
				error: 'AI analysis timed out or was cancelled. You can retry or use local analysis.',
				code: 'timeout'
			},
			504
		);
	}
	return response(
		{
			error: 'Free AI analysis is temporarily unavailable. You can use local analysis.',
			code: 'unavailable'
		},
		503
	);
}

/** The process guard supplements the durable database quota; it is not a shared limit. */
export function createSemanticHandlers(
	config: () => SemanticConfig,
	dependencies: () => SemanticDependencies
) {
	const admit = createLocalAdmission({
		attempts: 6,
		globalAttempts: 60,
		windowMs: 60_000,
		concurrency: 4,
		perKeyConcurrency: 1,
		maxKeys: 1024
	});
	const statusAdmit = createLocalAdmission({
		attempts: 30,
		globalAttempts: 300,
		windowMs: 60_000,
		concurrency: 8,
		maxKeys: 1024
	});
	let freeCheck: { at: number; task: Promise<void> } | undefined;
	return {
		async GET(event: Event) {
			const current = config();
			let reason = configurationReason(current);
			if (!reason) {
				let admission;
				try {
					admission = statusAdmit(await semanticClientHash(event.getClientAddress(), current.salt));
					if (!admission.allowed)
						reason = 'Please wait before checking free AI availability again.';
					else {
						// Public price metadata only. A POST always checks afresh before reserving usage.
						if (!freeCheck || Date.now() - freeCheck.at > 30_000)
							freeCheck = {
								at: Date.now(),
								task: withDeadline((signal) => dependencies().verifyFreeRoute(signal), 5000)
							};
						await freeCheck.task;
					}
				} catch {
					reason = 'The free model cannot currently be verified. Use local analysis.';
				} finally {
					if (admission?.allowed) admission.release();
				}
			}
			return response({
				available: reason === null,
				provider: SEMANTIC_PROVIDER,
				model: SEMANTIC_MODEL,
				reason,
				freeOnly: true,
				maxCodePoints: MAX_CODE_POINTS,
				timeoutMs: 65_000
			});
		},
		async POST(event: Event) {
			let admission;
			try {
				if (event.request.headers.get('origin') !== event.url.origin)
					throw new SemanticFailure('origin', 'Submit AI analysis from this site.', 403);
				if (
					event.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
					'application/json'
				)
					throw new SemanticFailure('content_type', 'Submit a JSON prompt request.', 415);
				const current = config();
				const reason = configurationReason(current);
				if (reason) throw new SemanticFailure('configuration', reason);
				const address = event.getClientAddress();
				const clientHash = await semanticClientHash(address, current.salt);
				admission = admit(clientHash);
				if (!admission.allowed)
					return response(
						{
							error: 'Please wait before another AI analysis.',
							code: 'rate_limited',
							retryAfterSeconds: admission.retryAfterSeconds
						},
						429,
						{ 'retry-after': String(admission.retryAfterSeconds) }
					);
				return await withDeadline(async (deadline) => {
					const signal = AbortSignal.any([deadline, event.request.signal]);
					const bytes = await readBoundedBody(event.request, SEMANTIC_MAX_BYTES, 8000, signal);
					let raw: unknown;
					try {
						raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
					} catch {
						throw new SemanticFailure('input', 'Submit valid UTF-8 JSON.', 400);
					}
					const parsed = inputSchema.safeParse(raw);
					if (!parsed.success)
						throw new SemanticFailure(
							'input',
							`Enter up to ${MAX_CODE_POINTS.toLocaleString('en')} code points and consent to this AI analysis.`,
							400
						);
					const deps = dependencies();
					await deps.verifyFreeRoute(signal);
					if (signal.aborted) throw new BodyReadError('aborted');
					const quota = await deps.reserve(await semanticClientHash(address, current.salt), signal);
					if (!quota.allowed)
						return response(
							{
								error: 'The free AI usage limit has been reached. Try later or use local analysis.',
								code: 'rate_limited',
								retryAfterSeconds: quota.retryAfterSeconds
							},
							429,
							{ 'retry-after': String(quota.retryAfterSeconds) }
						);
					if (signal.aborted) throw new BodyReadError('aborted');
					const ontology = await deps.generate(parsed.data.text, signal);
					if (signal.aborted) throw new BodyReadError('aborted');
					return response({ ontology });
				}, SEMANTIC_TIMEOUT_MS);
			} catch (cause) {
				return failure(cause);
			} finally {
				if (admission?.allowed) admission.release();
			}
		}
	};
}
