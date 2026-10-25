import { createGateway } from '@ai-sdk/gateway';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { readBoundedBody, withDeadline } from '$lib/server/http/body';
import { preserveInstructionLayer } from '$lib/visualizations/prompt-atlas/hybrid';
import {
	prepareSemanticWire,
	normalizeSemanticWire
} from '$lib/visualizations/prompt-atlas/semantic-wire';
import { SEMANTIC_MODEL, SEMANTIC_PROVIDER, type SemanticConfig } from './config';
import { SemanticFailure, type SemanticDependencies } from './service';

export const FREE_ROUTE_URL = `https://ai-gateway.vercel.sh/v1/models/${SEMANTIC_MODEL}/endpoints`;

async function boundedJson(response: Response, maxBytes: number, signal: AbortSignal) {
	const bytes = await readBoundedBody(response, maxBytes, 5000, signal);
	if (!response.ok)
		throw new SemanticFailure('unavailable', 'The free AI service is temporarily unavailable.');
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

const routeSchema = z.object({
	data: z.object({
		id: z.literal(SEMANTIC_MODEL),
		endpoints: z
			.array(
				z.object({
					provider_name: z.string(),
					pricing: z.record(z.string(), z.unknown()),
					tags: z.array(z.string())
				})
			)
			.min(1)
			.max(30)
	})
});

/** Refuse unknown or nonzero pricing. No paid route/model can be supplied by a visitor or env var. */
export async function verifyFreeRoute(fetcher: typeof fetch = fetch, signal: AbortSignal) {
	try {
		await withDeadline(async (deadline) => {
			const combined = AbortSignal.any([signal, deadline]);
			const result = routeSchema.parse(
				await boundedJson(
					await fetcher(FREE_ROUTE_URL, { signal: combined, cache: 'no-store', redirect: 'error' }),
					64 * 1024,
					combined
				)
			);
			const endpoints = result.data.endpoints.filter(
				(endpoint) => endpoint.provider_name === 'nvidia'
			);
			if (!endpoints.length) throw new Error('Missing free provider');
			for (const endpoint of endpoints) {
				if (!endpoint.tags.includes('structured-output'))
					throw new Error('Missing structured output');
				for (const required of ['prompt', 'completion', 'request', 'internal_reasoning']) {
					if (!(required in endpoint.pricing)) throw new Error('Incomplete pricing');
				}
				for (const [name, price] of Object.entries(endpoint.pricing)) {
					if (name === 'discount') continue;
					if (!((typeof price === 'string' && /^0(?:\.0+)?$/.test(price)) || price === 0))
						throw new Error('Nonzero or unknown pricing');
				}
			}
		}, 5000);
	} catch {
		throw new SemanticFailure(
			'free_route_unavailable',
			'The model’s free price or availability cannot be verified. Use local analysis.'
		);
	}
}

const quotaSchema = z.object({
	allowed: z.boolean(),
	retryAfterSeconds: z.number().int().min(0).max(86_400)
});

export function createSemanticDependencies(
	config: SemanticConfig,
	apiKey?: string,
	fetcher: typeof fetch = fetch
): SemanticDependencies {
	return {
		verifyFreeRoute: (signal) => verifyFreeRoute(fetcher, signal),
		async reserve(clientHash, signal) {
			try {
				return await withDeadline(async (deadline) => {
					const combined = AbortSignal.any([signal, deadline]);
					const result = await fetcher(
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
								client_hash: clientHash,
								daily_request_limit: 50,
								hourly_client_limit: 5
							})
						}
					);
					return quotaSchema.parse(await boundedJson(result, 16 * 1024, combined));
				}, 5000);
			} catch {
				throw new SemanticFailure(
					'quota_unavailable',
					'Shared free AI usage limits are unavailable. Use local analysis.'
				);
			}
		},
		async generate(text, signal) {
			try {
				const prepared = prepareSemanticWire(text);
				const outputSchema = JSON.stringify(
					z.toJSONSchema(prepared.schema, { target: 'draft-07' })
				);
				// The SDK uses Vercel OIDC when no explicit Gateway key is configured.
				// All SDK response bodies are bounded before parsing, including error bodies.
				const gateway = createGateway({
					...(apiKey ? { apiKey } : {}),
					fetch: async (input, init) => {
						const combined = AbortSignal.any([
							signal,
							...(init?.signal ? [init.signal] : []),
							...(input instanceof Request ? [input.signal] : [])
						]);
						const result = await fetcher(input, { ...init, signal: combined, redirect: 'error' });
						const bytes = await readBoundedBody(result, 2 * 1024 * 1024, 55_000, combined);
						const headers = new Headers(result.headers);
						headers.delete('content-length');
						headers.delete('content-encoding');
						return new Response(bytes, {
							status: result.status,
							statusText: result.statusText,
							headers
						});
					}
				});
				const result = await generateText({
					model: gateway(SEMANTIC_MODEL),
					output: Output.json(),
					// Parse JSON through the SDK and pass native schema constraints explicitly
					// to NVIDIA below. The hosted adapter's generic schema flag is disabled.
					// The normalizer independently validates shape, provenance and source evidence.
					system: prepared.system,
					prompt: prepared.prompt,
					maxOutputTokens: 8_000,
					maxRetries: 0,
					reasoning: 'none',
					abortSignal: signal,
					providerOptions: {
						nvidia: {
							reasoningEffort: 'none',
							chat_template_kwargs: { enable_thinking: false },
							response_format: {
								type: 'json_schema',
								json_schema: {
									name: 'PromptAtlasOntology',
									strict: true,
									schema: JSON.parse(outputSchema)
								}
							}
						},
						gateway: {
							only: ['nvidia'],
							order: ['nvidia'],
							models: [],
							has: ['structured-output']
						}
					}
				});
				if (result.finishReason !== 'stop')
					throw new SemanticFailure(
						'incomplete_analysis',
						'The free model stopped before completing a reliable graph. Try a more focused prompt or use local analysis.',
						502
					);
				const ontology = normalizeSemanticWire(
					result.output,
					text,
					{ provider: SEMANTIC_PROVIDER, model: SEMANTIC_MODEL },
					prepared
				);
				return preserveInstructionLayer(ontology, prepared.fragments);
			} catch (cause) {
				if (cause instanceof SemanticFailure) throw cause;
				const status =
					cause && typeof cause === 'object' && 'statusCode' in cause
						? cause.statusCode
						: undefined;
				if (status === 401 || status === 403)
					throw new SemanticFailure(
						'provider_authorization',
						'The free AI provider has not authorised this deployment. Local analysis is available.'
					);
				if (status === 402 || status === 429)
					throw new SemanticFailure(
						'free_capacity_unavailable',
						'Free AI capacity is unavailable or exhausted. Use local analysis or try later.'
					);
				throw new SemanticFailure(
					'analysis_failed',
					'The free model did not return a valid, source-grounded interpretation. Try again or use local analysis.',
					502
				);
			}
		}
	};
}
