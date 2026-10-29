import { BodyReadError, readBoundedBody, withDeadline } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import {
	configurationReason,
	semanticHeaders,
	SEMANTIC_MODEL,
	SEMANTIC_PROVIDER,
	type SemanticConfig
} from '$lib/server/prompt-atlas/config';
import {
	semanticClientHash,
	SemanticFailure,
	type QuotaReservation
} from '$lib/server/prompt-atlas/service';
import {
	inputSchema,
	MAX_REQUEST_BYTES,
	MAX_SOURCE_CHARACTERS,
	MAX_PROVIDER_CHARACTERS,
	normalizeAnalysis,
	prepareAnalysis,
	type PreparedAnalysis
} from './wire';

export const ANALYSIS_TIMEOUT_MS = 60_000;
export type StudioDependencies = {
	verifyFreeRoute(signal: AbortSignal): Promise<void>;
	reserve(clientHash: string, signal: AbortSignal): Promise<QuotaReservation>;
	generate(prepared: PreparedAnalysis, signal: AbortSignal): Promise<unknown>;
};
type Event = { request: Request; url: URL; getClientAddress(): string };

function response(body: unknown, status = 200, extra: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...semanticHeaders, 'content-type': 'application/json; charset=utf-8', ...extra }
	});
}
function rateLimited(retryAfterSeconds: number) {
	return response(
		{
			error: 'The free AI usage limit has been reached. Try later; your current map is unchanged.',
			code: 'rate_limited',
			retryAfterSeconds
		},
		429,
		{ 'retry-after': String(retryAfterSeconds) }
	);
}
function failure(cause: unknown) {
	if (cause instanceof SemanticFailure)
		return response({ error: cause.message, code: cause.code }, cause.status);
	if (cause instanceof BodyReadError) {
		if (cause.kind === 'too-large')
			return response({ error: 'The analysis request exceeds 2 MiB.', code: 'too_large' }, 413);
		return response(
			{
				error: 'Analysis timed out or was cancelled. Your current map is unchanged.',
				code: 'timeout'
			},
			504
		);
	}
	// Provider/schema exceptions can include source text. Never return or log them.
	return response(
		{ error: 'AI analysis is unavailable. Your current map is unchanged.', code: 'unavailable' },
		503
	);
}

export function createStudioHandlers(
	config: () => SemanticConfig,
	dependencies: () => StudioDependencies
) {
	const admit = createLocalAdmission({
		attempts: 6,
		globalAttempts: 60,
		windowMs: 60_000,
		concurrency: 4,
		perKeyConcurrency: 1,
		maxKeys: 1_024
	});
	const statusAdmit = createLocalAdmission({
		attempts: 30,
		globalAttempts: 300,
		windowMs: 60_000,
		concurrency: 8,
		maxKeys: 1_024
	});
	let freeCheck: { at: number; task: Promise<void> } | undefined;
	return {
		async GET(event: Event) {
			let reason: string | null;
			let admission;
			try {
				const current = config();
				reason = configurationReason(current);
				if (!reason) {
					admission = statusAdmit(await semanticClientHash(event.getClientAddress(), current.salt));
					if (!admission.allowed) reason = 'Please wait before checking AI availability again.';
					else {
						if (!freeCheck || Date.now() - freeCheck.at > 30_000)
							freeCheck = {
								at: Date.now(),
								task: withDeadline((signal) => dependencies().verifyFreeRoute(signal), 5_000)
							};
						await freeCheck.task;
					}
				}
			} catch {
				reason =
					'The free model cannot currently be verified. You can still edit maps and prepare an analysis prompt.';
			} finally {
				if (admission?.allowed) admission.release();
			}
			return response({
				available: reason === null,
				provider: SEMANTIC_PROVIDER,
				model: SEMANTIC_MODEL,
				reason,
				freeOnly: true,
				timeoutMs: 65_000,
				maxSources: 8,
				maxCharacters: MAX_SOURCE_CHARACTERS,
				maxProviderCharacters: MAX_PROVIDER_CHARACTERS,
				retentionNotice:
					'Selected source excerpts and your focus are sent through Vercel AI Gateway to NVIDIA only for a consented analysis. NVIDIA may retain submitted material for model improvement.',
				quotaNotice:
					'Availability does not guarantee remaining capacity. This app shares the site’s free AI allowance; a failed generation can consume a reservation.'
			});
		},
		async POST(event: Event) {
			let admission;
			try {
				if (event.request.headers.get('origin') !== event.url.origin)
					throw new SemanticFailure('origin', 'Submit analysis from this site.', 403);
				if (
					event.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
					'application/json'
				)
					throw new SemanticFailure('content_type', 'Submit a JSON analysis request.', 415);
				const current = config();
				const reason = configurationReason(current);
				if (reason) throw new SemanticFailure('configuration', reason);
				const address = event.getClientAddress();
				admission = admit(await semanticClientHash(address, current.salt));
				if (!admission.allowed) return rateLimited(admission.retryAfterSeconds);
				return await withDeadline(async (deadline) => {
					const signal = AbortSignal.any([deadline, event.request.signal]);
					const bytes = await readBoundedBody(event.request, MAX_REQUEST_BYTES, 8_000, signal);
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
							'Provide up to eight sources with unique IDs, at most 100,000 characters each and 200,000 in total, a valid depth, and consent. Every source must contain text; URLs are not fetched.',
							400
						);
					const prepared = prepareAnalysis(parsed.data);
					if (!prepared.units.length)
						throw new SemanticFailure(
							'input',
							'No readable source passages were found. Supply extracted text or a transcript before analysing.',
							400
						);
					const deps = dependencies();
					await deps.verifyFreeRoute(signal);
					if (signal.aborted) throw new BodyReadError('aborted');
					// Use the same rotating identity as Prompt Atlas so this route cannot reset its hourly allowance.
					const quota = await deps.reserve(await semanticClientHash(address, current.salt), signal);
					if (!quota.allowed) return rateLimited(quota.retryAfterSeconds);
					if (signal.aborted) throw new BodyReadError('aborted');
					const generated = await deps.generate(prepared, signal);
					if (signal.aborted) throw new BodyReadError('aborted');
					let project;
					try {
						project = normalizeAnalysis(generated, prepared);
					} catch {
						throw new SemanticFailure(
							'invalid_analysis',
							'The model returned an incomplete or invalid source-grounded map. Your current map is unchanged; retry with a narrower source or focus.',
							502
						);
					}
					return response({ project });
				}, ANALYSIS_TIMEOUT_MS);
			} catch (cause) {
				return failure(cause);
			} finally {
				if (admission?.allowed) admission.release();
			}
		}
	};
}
