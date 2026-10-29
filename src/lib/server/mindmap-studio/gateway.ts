import { createGateway } from '@ai-sdk/gateway';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createSemanticDependencies } from '$lib/server/prompt-atlas/gateway';
import { SEMANTIC_MODEL, type SemanticConfig } from '$lib/server/prompt-atlas/config';
import { SemanticFailure } from '$lib/server/prompt-atlas/service';
import type { StudioDependencies } from './service';
import { wireSchema } from './wire';

export function createStudioDependencies(
	config: SemanticConfig,
	apiKey?: string,
	fetcher: typeof fetch = fetch
): StudioDependencies {
	const shared = createSemanticDependencies(config, apiKey, fetcher);
	return {
		verifyFreeRoute: shared.verifyFreeRoute,
		reserve: shared.reserve,
		async generate(prepared, signal) {
			try {
				const gateway = createGateway({
					...(apiKey ? { apiKey } : {}),
					fetch: async (input, init) => {
						const combined = AbortSignal.any([
							signal,
							...(init?.signal ? [init.signal] : []),
							...(input instanceof Request ? [input.signal] : [])
						]);
						const upstream = await fetcher(input, { ...init, signal: combined, redirect: 'error' });
						const bytes = await readBoundedBody(upstream, 2 * 1024 * 1024, 55_000, combined);
						const headers = new Headers(upstream.headers);
						headers.delete('content-length');
						headers.delete('content-encoding');
						return new Response(bytes, {
							status: upstream.status,
							statusText: upstream.statusText,
							headers
						});
					}
				});
				const result = await generateText({
					model: gateway(SEMANTIC_MODEL),
					output: Output.json(),
					system: prepared.system,
					prompt: prepared.prompt,
					maxOutputTokens: 10_000,
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
									name: 'SourceGroundedMindMap',
									strict: true,
									schema: JSON.parse(
										JSON.stringify(z.toJSONSchema(wireSchema, { target: 'draft-07' }))
									)
								}
							}
						},
						gateway: { only: ['nvidia'], order: ['nvidia'], models: [], has: ['structured-output'] }
					}
				});
				if (result.finishReason !== 'stop')
					throw new SemanticFailure(
						'incomplete_analysis',
						'The model stopped before completing a reliable map. Try a narrower source or focus.',
						502
					);
				return result.output;
			} catch (cause) {
				if (signal.aborted) throw new BodyReadError('aborted');
				if (cause instanceof SemanticFailure) throw cause;
				const status =
					cause && typeof cause === 'object' && 'statusCode' in cause
						? cause.statusCode
						: undefined;
				if (status === 401 || status === 403)
					throw new SemanticFailure(
						'provider_authorization',
						'The free AI provider has not authorised this deployment. Your current map is unchanged.'
					);
				if (status === 402 || status === 429)
					throw new SemanticFailure(
						'free_capacity_unavailable',
						'Free AI capacity is unavailable or exhausted. Your current map is unchanged.'
					);
				throw new SemanticFailure(
					'analysis_failed',
					'The free model did not return a complete analysis. Your current map is unchanged.',
					502
				);
			}
		}
	};
}
