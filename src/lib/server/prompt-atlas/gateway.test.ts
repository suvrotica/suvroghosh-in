import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGateway } from '@ai-sdk/gateway';
import { generateText, Output } from 'ai';
import {
	normalizeSemanticWire,
	prepareSemanticWire
} from '$lib/visualizations/prompt-atlas/semantic-wire';
import type { PromptOntology } from '$lib/visualizations/prompt-atlas/types';
import { createSemanticDependencies, FREE_ROUTE_URL, verifyFreeRoute } from './gateway';
import { SEMANTIC_MODEL, SEMANTIC_PROVIDER, type SemanticConfig } from './config';

vi.mock('@ai-sdk/gateway', () => ({
	createGateway: vi.fn(() => vi.fn((modelId: string) => ({ modelId })))
}));
vi.mock('ai', () => ({
	generateText: vi.fn(),
	Output: { object: vi.fn(), json: vi.fn(() => ({ testOutputMode: 'json' })) }
}));
vi.mock('$lib/visualizations/prompt-atlas/semantic-wire', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('$lib/visualizations/prompt-atlas/semantic-wire')>();
	return { ...actual, normalizeSemanticWire: vi.fn() };
});

const config: SemanticConfig = {
	enabled: true,
	credentialAvailable: true,
	salt: 'test-salt-at-least-thirty-two-characters',
	supabaseUrl: 'https://quota.example.test/',
	supabaseKey: 'test-service-key'
};
const controller = () => new AbortController();
function freeRoute(
	pricing: Record<string, unknown> = {
		prompt: '0',
		completion: '0',
		request: '0',
		internal_reasoning: '0',
		input_cache_read: '0'
	}
) {
	return {
		data: {
			id: SEMANTIC_MODEL,
			endpoints: [{ provider_name: 'nvidia', pricing, tags: ['structured-output'] }]
		}
	};
}
function fetchJson(value: unknown, status = 200) {
	return vi.fn<typeof fetch>().mockResolvedValue(
		new Response(JSON.stringify(value), {
			status,
			headers: { 'content-type': 'application/json' }
		})
	);
}
const generatedOntology: PromptOntology = {
	schemaVersion: 1,
	source: { text: 'A thought.', revision: 'test' },
	mode: 'semantic',
	analysisMetadata: { provider: SEMANTIC_PROVIDER, model: SEMANTIC_MODEL },
	language: 'en',
	nodes: [],
	relations: [],
	issues: []
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(generateText).mockResolvedValue({
		output: { untrusted: true },
		finishReason: 'stop'
	} as Awaited<ReturnType<typeof generateText>>);
	vi.mocked(normalizeSemanticWire).mockImplementation((_draft, text, metadata, prepared) => ({
		...generatedOntology,
		source: { text, revision: 'test' },
		analysisMetadata: metadata,
		compression: prepared.compression
	}));
});

describe('zero-price route verification', () => {
	it('checks the exact pinned model/provider and every monetary price using fresh no-store metadata', async () => {
		const fetcher = fetchJson(freeRoute());
		const signal = controller().signal;
		await verifyFreeRoute(fetcher, signal);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher.mock.calls[0][0]).toBe(FREE_ROUTE_URL);
		expect(FREE_ROUTE_URL).toContain(SEMANTIC_MODEL);
		expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', redirect: 'error' });
		expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
		expect(fetcher.mock.calls[0][1]?.headers).toBeUndefined();
	});

	it.each(['0', '0.0', '0.0000000', 0])(
		'accepts an explicitly zero monetary price: %j',
		async (price) => {
			await expect(
				verifyFreeRoute(
					fetchJson(
						freeRoute({
							prompt: price,
							completion: price,
							request: price,
							internal_reasoning: price
						})
					),
					controller().signal
				)
			).resolves.toBeUndefined();
		}
	);

	it.each(['0.000001', '1', 'free', '-1', '0e0', '', null, false, {}, 1])(
		'fails closed on nonzero, ambiguous, or unknown price: %j',
		async (price) => {
			await expect(
				verifyFreeRoute(
					fetchJson(
						freeRoute({
							prompt: '0',
							completion: '0',
							request: '0',
							internal_reasoning: '0',
							extra_price: price
						})
					),
					controller().signal
				)
			).rejects.toMatchObject({ code: 'free_route_unavailable' });
		}
	);

	it.each(['prompt', 'completion', 'request', 'internal_reasoning'])(
		'requires an explicit %s price',
		async (name) => {
			const value = freeRoute();
			delete value.data.endpoints[0].pricing[name];
			await expect(verifyFreeRoute(fetchJson(value), controller().signal)).rejects.toMatchObject({
				code: 'free_route_unavailable'
			});
		}
	);

	it('rejects a different model, missing pinned provider, missing structured output, or an empty route', async () => {
		const wrongModel = freeRoute();
		wrongModel.data.id = 'other/paid-model';
		const wrongProvider = freeRoute();
		wrongProvider.data.endpoints[0].provider_name = 'paid-fallback';
		const unstructured = freeRoute();
		unstructured.data.endpoints[0].tags = [];
		const empty = freeRoute();
		empty.data.endpoints = [];
		for (const value of [wrongModel, wrongProvider, unstructured, empty])
			await expect(verifyFreeRoute(fetchJson(value), controller().signal)).rejects.toMatchObject({
				code: 'free_route_unavailable'
			});
	});

	it('fails closed when any endpoint of the pinned provider is priced', async () => {
		const value = freeRoute();
		value.data.endpoints.push({
			provider_name: 'nvidia',
			pricing: { prompt: '0.01', completion: '0', request: '0', internal_reasoning: '0' },
			tags: ['structured-output']
		});
		await expect(verifyFreeRoute(fetchJson(value), controller().signal)).rejects.toMatchObject({
			code: 'free_route_unavailable'
		});
	});

	it('rejects malformed, oversized, and failed route responses without exposing their payload', async () => {
		for (const response of [
			new Response('private invalid JSON'),
			new Response(JSON.stringify(freeRoute()), { status: 503 }),
			new Response('x'.repeat(64 * 1024 + 1), { headers: { 'content-length': '1' } })
		]) {
			const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
			try {
				await verifyFreeRoute(fetcher, controller().signal);
				throw new Error('Expected free-route rejection');
			} catch (cause) {
				expect(cause).toMatchObject({ code: 'free_route_unavailable' });
				expect(String(cause)).not.toContain('private invalid JSON');
			}
		}
	});
});

describe('durable quota adapter', () => {
	it('calls only the fixed bounded RPC with server-side credentials and hardcoded low request ceilings', async () => {
		const fetcher = fetchJson({
			allowed: true,
			retryAfterSeconds: 0,
			dailyReservations: 1,
			hourlyClientReservations: 1
		});
		const dependencies = createSemanticDependencies(config, undefined, fetcher);
		const hash = 'a'.repeat(64);
		expect(await dependencies.reserve(hash, controller().signal)).toEqual({
			allowed: true,
			retryAfterSeconds: 0
		});
		const [target, options] = fetcher.mock.calls[0];
		expect(target).toBe('https://quota.example.test/rest/v1/rpc/reserve_prompt_atlas_usage');
		expect(options).toMatchObject({
			method: 'POST',
			redirect: 'error',
			headers: { apikey: config.supabaseKey, authorization: `Bearer ${config.supabaseKey}` }
		});
		expect(JSON.parse(options?.body as string)).toEqual({
			client_hash: hash,
			daily_request_limit: 50,
			hourly_client_limit: 5
		});
	});

	it.each([
		{ allowed: 'true', retryAfterSeconds: 0 },
		{ allowed: true, retryAfterSeconds: -1 },
		{ allowed: false, retryAfterSeconds: 86401 },
		{ allowed: false, retryAfterSeconds: 0.5 },
		{},
		null
	])('refuses invalid quota-store output: %j', async (body) => {
		const dependencies = createSemanticDependencies(config, undefined, fetchJson(body));
		await expect(dependencies.reserve('a'.repeat(64), controller().signal)).rejects.toMatchObject({
			code: 'quota_unavailable'
		});
	});

	it('sanitises missing-RPC, database-error, and oversized response bodies', async () => {
		for (const response of [
			new Response('private database connection failure', { status: 404 }),
			new Response('x'.repeat(16 * 1024 + 1), { headers: { 'content-length': '1' } })
		]) {
			const dependencies = createSemanticDependencies(
				config,
				undefined,
				vi.fn<typeof fetch>().mockResolvedValue(response)
			);
			await expect(dependencies.reserve('a'.repeat(64), controller().signal)).rejects.toMatchObject(
				{
					code: 'quota_unavailable',
					message: 'Shared free AI usage limits are unavailable. Use local analysis.'
				}
			);
		}
	});
});

describe('pinned generation adapter', () => {
	it('uses pinned NVIDIA JSON mode with no reasoning, no reporting surcharges, zero retries and no fallback models', async () => {
		const dependencies = createSemanticDependencies(
			config,
			'test-gateway-key',
			vi.fn<typeof fetch>()
		);
		const result = await dependencies.generate('A thought.', controller().signal);
		expect(result).toMatchObject(generatedOntology);
		expect(result.compression).toMatchObject({
			applied: false,
			originalCodePoints: 10,
			analysedCodePoints: 10,
			omittedCodePoints: 0
		});
		expect(createGateway).toHaveBeenCalledWith(
			expect.objectContaining({ apiKey: 'test-gateway-key', fetch: expect.any(Function) })
		);
		expect(generateText).toHaveBeenCalledTimes(1);
		const options = vi.mocked(generateText).mock.calls[0][0];
		expect(options).toMatchObject({
			model: { modelId: SEMANTIC_MODEL },
			maxRetries: 0,
			maxOutputTokens: 8_000,
			reasoning: 'none',
			output: { testOutputMode: 'json' },
			providerOptions: {
				nvidia: { reasoningEffort: 'none', chat_template_kwargs: { enable_thinking: false } },
				gateway: {
					only: ['nvidia'],
					order: ['nvidia'],
					models: [],
					has: ['structured-output']
				}
			}
		});
		expect(Output.json).toHaveBeenCalledTimes(1);
		expect(Output.object).not.toHaveBeenCalled();
		expect(Object.keys(options.providerOptions!.gateway).sort()).toEqual([
			'has',
			'models',
			'only',
			'order'
		]);
		expect(options.system).toContain('untrusted data');
		expect(options.system).toContain('JSON SCHEMA:');
		const system = options.system as string;
		const schema = JSON.parse(system.slice(system.lastIndexOf('\n') + 1));
		expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
		expect([...schema.required].sort()).toEqual(['issues', 'nodes', 'relations']);
		expect(schema.properties).not.toHaveProperty('databaseTarget');
		expect(schema.properties.nodes).toMatchObject({ type: 'array', minItems: 1, maxItems: 60 });
		expect(schema.properties.nodes.items.required).toEqual(
			expect.arrayContaining(['id', 'label', 'kind', 'provenance', 'rationale', 'sourceIds'])
		);
		expect(options.providerOptions!.nvidia).toEqual({
			reasoningEffort: 'none',
			chat_template_kwargs: { enable_thinking: false },
			response_format: {
				type: 'json_schema',
				json_schema: { name: 'PromptAtlasOntology', strict: true, schema }
			}
		});
		const prepared = prepareSemanticWire('A thought.');
		for (const owner of [schema.properties.nodes.items, schema.properties.relations.items]) {
			expect(owner.required).toContain('sourceIds');
			expect(owner.additionalProperties).toBe(false);
			expect(owner.properties.sourceIds).toMatchObject({ type: 'array', minItems: 1, maxItems: 2 });
			expect(owner.properties.sourceIds.items.enum).toEqual(
				prepared.fragments.map((fragment) => fragment.id)
			);
			expect(owner.properties.provenance.enum).toEqual(['explicit', 'inferred']);
			for (const field of [
				'evidence',
				'quote',
				'start',
				'end',
				'layer',
				'attributes',
				'analysisMetadata'
			])
				expect(owner.properties).not.toHaveProperty(field);
		}
		expect(typeof options.prompt).toBe('string');
		expect(vi.mocked(normalizeSemanticWire).mock.calls[0].slice(0, 3)).toEqual([
			{ untrusted: true },
			'A thought.',
			{ provider: SEMANTIC_PROVIDER, model: SEMANTIC_MODEL }
		]);
	});

	it('supports Vercel OIDC without putting a token into browser-visible configuration', async () => {
		await createSemanticDependencies(config, undefined, vi.fn<typeof fetch>()).generate(
			'A thought.',
			controller().signal
		);
		const settings = vi.mocked(createGateway).mock.calls[0][0];
		expect(settings).not.toHaveProperty('apiKey');
		expect(settings).toHaveProperty('fetch');
	});

	it('preserves omitted explicit instructions while retaining the semantic subject graph and provider identity', async () => {
		const text =
			'Write a kind bedtime story about a robot gardener for children aged eight. Keep it under 500 words.';
		const start = text.indexOf('robot gardener');
		const subject = {
			id: 'semantic-robot',
			label: 'Robot gardener',
			kind: 'concept',
			layer: 'subject',
			provenance: 'explicit',
			evidence: [{ start, end: start + 'robot gardener'.length, quote: 'robot gardener' }],
			attributes: []
		} as const;
		vi.mocked(normalizeSemanticWire).mockReturnValueOnce({
			...generatedOntology,
			source: { text, revision: 'semantic-original' },
			compression: prepareSemanticWire(text).compression,
			nodes: [{ ...subject, evidence: [...subject.evidence], attributes: [] }]
		});
		const result = await createSemanticDependencies(
			config,
			undefined,
			vi.fn<typeof fetch>()
		).generate(text, controller().signal);
		expect(result.mode).toBe('semantic');
		expect(result.source).toEqual({ text, revision: 'semantic-original' });
		expect(result.analysisMetadata).toEqual(generatedOntology.analysisMetadata);
		expect(result.nodes.find((node) => node.id === subject.id)).toEqual(subject);
		expect(result.nodes.some((node) => node.kind === 'task' && node.layer === 'instruction')).toBe(
			true
		);
		expect(
			result.nodes.some((node) => node.kind === 'constraint' && node.label.includes('500 words'))
		).toBe(true);
		expect(
			result.nodes.some(
				(node) => node.kind === 'audience' && node.label.includes('children aged eight')
			)
		).toBe(true);
		for (const claim of [...result.nodes, ...result.relations])
			for (const span of claim.evidence) expect(text.slice(span.start, span.end)).toBe(span.quote);
	});

	it('converts a real thin graph through source grounding and hybrid preservation into the canonical ontology', async () => {
		const text = 'Write a kind story about a robot gardener. Keep it under 80 words.';
		const prepared = prepareSemanticWire(text);
		const sourceId = prepared.fragments.find((fragment) =>
			fragment.text.includes('robot gardener')
		)!.id;
		const actual = await vi.importActual<
			typeof import('$lib/visualizations/prompt-atlas/semantic-wire')
		>('$lib/visualizations/prompt-atlas/semantic-wire');
		vi.mocked(normalizeSemanticWire).mockImplementationOnce(actual.normalizeSemanticWire);
		vi.mocked(generateText).mockResolvedValueOnce({
			finishReason: 'stop',
			output: {
				nodes: [
					{
						id: 'robot',
						label: 'Robot gardener',
						kind: 'concept',
						sourceIds: [sourceId],
						provenance: 'explicit',
						rationale: 'The source explicitly names the robot gardener.'
					}
				],
				relations: [],
				issues: []
			}
		} as Awaited<ReturnType<typeof generateText>>);
		const result = await createSemanticDependencies(
			config,
			undefined,
			vi.fn<typeof fetch>()
		).generate(text, controller().signal);
		expect(result).toMatchObject({
			mode: 'semantic',
			source: { text },
			analysisMetadata: { provider: SEMANTIC_PROVIDER, model: SEMANTIC_MODEL }
		});
		expect(result.nodes.find((node) => node.id === 'robot')).toMatchObject({
			label: 'Robot gardener',
			layer: 'subject',
			attributes: []
		});
		expect(result.nodes.some((node) => node.kind === 'task')).toBe(true);
		expect(
			result.nodes.some((node) => node.kind === 'constraint' && node.label.includes('80 words'))
		).toBe(true);
		for (const claim of [...result.nodes, ...result.relations])
			for (const span of claim.evidence) expect(text.slice(span.start, span.end)).toBe(span.quote);
	});

	it('sends bounded exact excerpts for a large prompt while grounding output against the full original', async () => {
		const text = `Write an explanation.\n${'Context: a quiet garden with several paths.\n'.repeat(2400)}Never invent measurements.`;
		const result = await createSemanticDependencies(
			config,
			undefined,
			vi.fn<typeof fetch>()
		).generate(text, controller().signal);
		const options = vi.mocked(generateText).mock.calls[0][0];
		expect(typeof options.prompt).toBe('string');
		expect(options.prompt).toContain('EXACT SOURCE UNITS');
		expect((options.prompt as string).length).toBeLessThan(text.length);
		const argumentsPassed = vi.mocked(normalizeSemanticWire).mock.calls[0];
		expect(argumentsPassed[1]).toBe(text);
		const fragments = argumentsPassed[3]!.fragments;
		expect(fragments.length).toBeGreaterThan(0);
		for (const fragment of fragments)
			expect(text.slice(fragment.start, fragment.start + fragment.text.length)).toBe(fragment.text);
		expect(result.compression?.applied).toBe(true);
		expect(result.compression!.analysedCodePoints).toBeLessThanOrEqual(24_000);
		expect(result.compression!.omittedCodePoints).toBeGreaterThan(0);
		expect(result.compression!.originalCodePoints).toBe(
			result.compression!.analysedCodePoints + result.compression!.omittedCodePoints
		);
	});

	it('bounds SDK response bytes, refuses credential redirects, and removes stale transport encodings', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
			new Response('bounded body', {
				headers: {
					'content-length': '1',
					'content-encoding': 'gzip',
					'content-type': 'application/json'
				}
			})
		);
		await createSemanticDependencies(config, undefined, fetcher).generate(
			'A thought.',
			controller().signal
		);
		const wrapped = vi.mocked(createGateway).mock.calls[0][0]!.fetch!;
		const result = await wrapped('https://gateway.example.test/generate', {});
		expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
		expect(result.headers.has('content-length')).toBe(false);
		expect(result.headers.has('content-encoding')).toBe(false);
		expect(await result.text()).toBe('bounded body');
	});

	it('rejects an oversized streamed SDK response even when its declared length is small', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'content-length': '1' } })
			);
		await createSemanticDependencies(config, undefined, fetcher).generate(
			'A thought.',
			controller().signal
		);
		const wrapped = vi.mocked(createGateway).mock.calls[0][0]!.fetch!;
		await expect(wrapped('https://gateway.example.test/generate', {})).rejects.toMatchObject({
			kind: 'too-large'
		});
	});

	it('sanitises SDK or normalization failures without a retry or alternate provider', async () => {
		vi.mocked(generateText).mockRejectedValueOnce(new Error('private prompt and API key'));
		const dependencies = createSemanticDependencies(config, undefined, vi.fn<typeof fetch>());
		await expect(dependencies.generate('A thought.', controller().signal)).rejects.toMatchObject({
			code: 'analysis_failed',
			status: 502
		});
		expect(generateText).toHaveBeenCalledTimes(1);
		vi.mocked(normalizeSemanticWire).mockImplementationOnce(() => {
			throw new Error('forged evidence with private prompt');
		});
		await expect(dependencies.generate('A thought.', controller().signal)).rejects.toMatchObject({
			code: 'analysis_failed',
			status: 502
		});
	});

	it.each(['length', 'content-filter', 'tool-calls', 'error', 'other', undefined])(
		'rejects a structurally valid response that did not finish normally: %s',
		async (finishReason) => {
			vi.mocked(generateText).mockResolvedValueOnce({
				output: { untrusted: true },
				finishReason
			} as Awaited<ReturnType<typeof generateText>>);
			const dependencies = createSemanticDependencies(config, undefined, vi.fn<typeof fetch>());
			await expect(dependencies.generate('A thought.', controller().signal)).rejects.toMatchObject({
				code: 'incomplete_analysis',
				status: 502
			});
			expect(normalizeSemanticWire).not.toHaveBeenCalled();
			expect(generateText).toHaveBeenCalledTimes(1);
		}
	);

	it.each([
		[401, 'provider_authorization'],
		[403, 'provider_authorization'],
		[402, 'free_capacity_unavailable'],
		[429, 'free_capacity_unavailable']
	] as const)('returns a safe, actionable provider status for HTTP%s', async (statusCode, code) => {
		vi.mocked(generateText).mockRejectedValueOnce(
			Object.assign(new Error('private provider details and credential'), { statusCode })
		);
		const dependencies = createSemanticDependencies(config, undefined, vi.fn<typeof fetch>());
		try {
			await dependencies.generate('A thought.', controller().signal);
			throw new Error('Expected provider rejection');
		} catch (cause) {
			expect(cause).toMatchObject({ code, status: 503 });
			expect(String(cause)).not.toMatch(/private provider|credential/);
		}
		expect(generateText).toHaveBeenCalledTimes(1);
		expect(normalizeSemanticWire).not.toHaveBeenCalled();
	});
});
