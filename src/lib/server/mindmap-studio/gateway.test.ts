import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import { createSemanticDependencies } from '$lib/server/prompt-atlas/gateway';
import { SEMANTIC_MODEL, type SemanticConfig } from '$lib/server/prompt-atlas/config';
import { createStudioDependencies } from './gateway';
import { normalizeAnalysis, prepareAnalysis } from './wire';

vi.mock('@ai-sdk/gateway', () => ({
	createGateway: vi.fn(() => vi.fn((modelId: string) => ({ modelId })))
}));
vi.mock('ai', () => ({ generateText: vi.fn(), Output: { json: vi.fn(() => ({ mode: 'json' })) } }));
vi.mock('$lib/server/prompt-atlas/gateway', () => ({ createSemanticDependencies: vi.fn() }));
const config: SemanticConfig = {
	enabled: true,
	credentialAvailable: true,
	salt: 'test-only-long-salt-at-least-thirty-two',
	supabaseUrl: 'https://quota.example.test',
	supabaseKey: 'test-only-key'
};
const prepared = prepareAnalysis({
	sources: [{ id: 'source', title: 'Shade', text: 'Trees offer shade.', kind: 'text' }],
	focus: '',
	depth: 'research',
	consent: true
});
const verify = vi.fn<(signal: AbortSignal) => Promise<void>>().mockResolvedValue(undefined);
const reserve = vi
	.fn<
		(hash: string, signal: AbortSignal) => Promise<{ allowed: boolean; retryAfterSeconds: number }>
	>()
	.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(createSemanticDependencies).mockReturnValue({
		verifyFreeRoute: verify,
		reserve,
		generate: vi.fn()
	});
	vi.mocked(generateText).mockResolvedValue({
		output: { nodes: [] },
		finishReason: 'stop'
	} as unknown as Awaited<ReturnType<typeof generateText>>);
});

describe('mind-map provider boundary', () => {
	it('reuses the existing price and durable quota adapters, pins NVIDIA and disables paid fallback/retries', async () => {
		const dependencies = createStudioDependencies(config, 'test-gateway-key');
		const signal = new AbortController().signal;
		await dependencies.verifyFreeRoute(signal);
		await dependencies.reserve('client-hash', signal);
		await dependencies.generate(prepared, signal);
		expect(verify).toHaveBeenCalledWith(signal);
		expect(reserve).toHaveBeenCalledWith('client-hash', signal);
		expect(createGateway).toHaveBeenCalledWith(
			expect.objectContaining({ apiKey: 'test-gateway-key' })
		);
		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: { modelId: SEMANTIC_MODEL },
				abortSignal: signal,
				maxRetries: 0,
				reasoning: 'none',
				maxOutputTokens: 10000,
				providerOptions: expect.objectContaining({
					gateway: { only: ['nvidia'], order: ['nvidia'], models: [], has: ['structured-output'] },
					nvidia: expect.objectContaining({
						response_format: expect.objectContaining({ type: 'json_schema' })
					})
				})
			})
		);
		const options = vi.mocked(generateText).mock.calls[0][0];
		expect(options).not.toHaveProperty('experimental_telemetry');
		expect(options.providerOptions?.gateway).not.toHaveProperty('tags');
		expect(options.providerOptions?.gateway).not.toHaveProperty('user');
		expect(options.providerOptions).toMatchObject({
			nvidia: {
				response_format: {
					json_schema: { schema: JSON.parse(prepared.system.split('JSON SCHEMA:\n')[1]) }
				}
			}
		});
	});
	it('accepts a complete provider wire object through canonical source validation without weakening provenance', async () => {
		const fixture = {
			title: 'Shade and its evidence',
			rootId: 'root',
			nodes: [
				{
					id: 'root',
					parentId: null,
					label: 'Shade and its evidence',
					description: 'An organising topic for the supplied observation.',
					category: 'topic',
					status: 'inferred',
					unitIds: [],
					notes: ''
				},
				{
					id: 'shade',
					parentId: 'root',
					label: 'Trees offer shade',
					description: 'The source explicitly states that trees offer shade.',
					category: 'claim',
					status: 'explicit',
					unitIds: ['s1u1'],
					notes: ''
				}
			],
			edges: [
				{
					id: 'supports',
					from: 'shade',
					to: 'root',
					type: 'supports',
					status: 'inferred',
					unitIds: ['s1u1'],
					rationale: 'The source observation supports the organising topic.'
				}
			],
			analysis: [
				{
					id: 'scope',
					title: 'Scope',
					body: 'The source supplies one observation; its mechanism is not explained.'
				}
			]
		};
		vi.mocked(generateText).mockResolvedValue({
			output: fixture,
			finishReason: 'stop'
		} as unknown as Awaited<ReturnType<typeof generateText>>);
		const result = await createStudioDependencies(config).generate(
			prepared,
			new AbortController().signal
		);
		const project = normalizeAnalysis(result, prepared);
		expect(project.nodes[0]).toMatchObject({ status: 'inferred', evidence: [] });
		expect(project.nodes[1]).toMatchObject({
			status: 'explicit',
			evidence: [{ sourceId: 'source', start: 0, end: 18, quote: 'Trees offer shade.' }]
		});
		expect(project.edges[0]).toMatchObject({
			status: 'inferred',
			rationale: 'The source observation supports the organising topic.'
		});
		expect(project.sources).toEqual(prepared.input.sources);
		const unsupported = structuredClone(fixture);
		unsupported.nodes[0].status = 'explicit';
		expect(() => normalizeAnalysis(unsupported, prepared)).toThrow(
			'Source-grounded map validation failed.'
		);
	});
	it('does not accept a truncated result as a completed map', async () => {
		vi.mocked(generateText).mockResolvedValue({
			output: { nodes: [] },
			finishReason: 'length'
		} as unknown as Awaited<ReturnType<typeof generateText>>);
		await expect(
			createStudioDependencies(config).generate(prepared, new AbortController().signal)
		).rejects.toMatchObject({ code: 'incomplete_analysis', status: 502 });
	});
	it('bounds actual provider response bytes and refuses redirects', async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response('x'.repeat(2 * 1024 * 1024 + 1), { headers: { 'content-length': '1' } })
			);
		await createStudioDependencies(config, undefined, fetcher).generate(
			prepared,
			new AbortController().signal
		);
		const boundedFetch = vi.mocked(createGateway).mock.calls[0][0]!.fetch!;
		await expect(boundedFetch('https://ai-gateway.vercel.sh/test', {})).rejects.toMatchObject({
			kind: 'too-large'
		});
		expect(fetcher).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) })
		);
	});
	it.each([401, 403, 402, 429, 500])(
		'hides provider body and source details on HTTP %i',
		async (statusCode) => {
			vi.mocked(generateText).mockRejectedValue({
				statusCode,
				message: 'private user source text'
			});
			try {
				await createStudioDependencies(config).generate(prepared, new AbortController().signal);
				throw new Error('Expected rejection');
			} catch (cause) {
				expect(String(cause)).not.toContain('private user source text');
				expect(cause).toHaveProperty('code');
			}
		}
	);
});
