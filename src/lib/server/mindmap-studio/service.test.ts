import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SemanticConfig } from '$lib/server/prompt-atlas/config';
import { semanticClientHash, SemanticFailure } from '$lib/server/prompt-atlas/service';
import { ANALYSIS_TIMEOUT_MS, createStudioHandlers } from './service';
import { MAX_REQUEST_BYTES, type PreparedAnalysis } from './wire';

const origin = 'https://studio.example.test';
const url = new URL(`${origin}/api/mindmap-studio`);
const config: SemanticConfig = {
	enabled: true,
	credentialAvailable: true,
	salt: 'test-salt-with-at-least-thirty-two-characters',
	supabaseUrl: 'https://quota.example.test',
	supabaseKey: 'test-key'
};
const payload = {
	sources: [{ id: 's1', title: 'Shade', kind: 'text', text: 'Trees offer shade.' }],
	focus: '',
	depth: 'detailed',
	consent: true
};
function wire(prepared: PreparedAnalysis) {
	return {
		title: 'Shade',
		rootId: 'root',
		nodes: [
			{
				id: 'root',
				parentId: null,
				label: 'Shade',
				description: '',
				category: 'concept',
				status: 'explicit',
				unitIds: [prepared.units[0].id],
				notes: ''
			}
		],
		edges: [],
		analysis: []
	};
}
function setup(overrides: Partial<SemanticConfig> = {}) {
	const verifyFreeRoute = vi
		.fn<(signal: AbortSignal) => Promise<void>>()
		.mockResolvedValue(undefined);
	const reserve = vi
		.fn<
			(
				hash: string,
				signal: AbortSignal
			) => Promise<{ allowed: boolean; retryAfterSeconds: number }>
		>()
		.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
	const generate = vi.fn(
		async (prepared: PreparedAnalysis, signal: AbortSignal): Promise<unknown> => {
			signal.throwIfAborted();
			return wire(prepared);
		}
	);
	const dependencies = vi.fn(() => ({ verifyFreeRoute, reserve, generate }));
	return {
		...createStudioHandlers(() => ({ ...config, ...overrides }), dependencies),
		verifyFreeRoute,
		reserve,
		generate,
		dependencies
	};
}
function event(
	body: BodyInit = JSON.stringify(payload),
	headers: Record<string, string> = {},
	signal?: AbortSignal
) {
	const request = new Request(url, {
		method: 'POST',
		headers: { origin, 'content-type': 'application/json', ...headers },
		body,
		signal,
		...(body instanceof ReadableStream ? { duplex: 'half' } : {})
	} as RequestInit);
	return { request, url, getClientAddress: () => '203.0.113.4' };
}
const getEvent = () => ({ request: new Request(url), url, getClientAddress: () => '203.0.113.4' });
function privateResponse(response: Response) {
	expect(response.headers.get('cache-control')).toContain('private');
	expect(response.headers.get('cache-control')).toContain('no-store');
	expect(response.headers.get('x-robots-tag')).toContain('noindex');
}
afterEach(() => vi.useRealTimers());

describe('mind-map free analysis endpoint', () => {
	it('does not reserve quota for a PDF consisting only of unreadable-page placeholders', async () => {
		const handlers = setup();
		const response = await handlers.POST(
			event(
				JSON.stringify({
					...payload,
					sources: [
						{
							...payload.sources[0],
							kind: 'pdf',
							text: '[PDF page 1]\n[No extractable text on this page]'
						}
					]
				})
			)
		);
		expect(response.status).toBe(400);
		expect(handlers.dependencies).not.toHaveBeenCalled();
	});
	it('verifies pricing then shares the existing client quota before generating a validated project', async () => {
		const handlers = setup();
		const order: string[] = [];
		handlers.verifyFreeRoute.mockImplementation(async () => {
			order.push('price');
		});
		handlers.reserve.mockImplementation(async () => {
			order.push('quota');
			return { allowed: true, retryAfterSeconds: 0 };
		});
		handlers.generate.mockImplementation(async (prepared) => {
			order.push('generate');
			return wire(prepared);
		});
		const response = await handlers.POST(event());
		expect(response.status).toBe(200);
		privateResponse(response);
		expect(order).toEqual(['price', 'quota', 'generate']);
		expect(handlers.reserve.mock.calls[0][0]).toBe(
			await semanticClientHash('203.0.113.4', config.salt)
		);
		const result = await response.json();
		expect(result.project.sources[0].text).toBe(payload.sources[0].text);
		expect(result.project.nodes[0].evidence[0].quote).toBe(payload.sources[0].text);
	});
	it.each(['https://elsewhere.test', 'null', ''])(
		'rejects a different Origin before dependencies: %s',
		async (sentOrigin) => {
			const handlers = setup();
			const response = await handlers.POST(event(undefined, { origin: sentOrigin }));
			expect(response.status).toBe(403);
			expect(handlers.dependencies).not.toHaveBeenCalled();
			privateResponse(response);
		}
	);
	it('requires JSON, valid UTF-8, exact consent, known fields and bounded sources', async () => {
		const handlers = setup();
		expect((await handlers.POST(event(undefined, { 'content-type': 'text/plain' }))).status).toBe(
			415
		);
		for (const value of [
			{ ...payload, consent: false },
			{ ...payload, provider: 'paid-model' },
			{ ...payload, sources: [] }
		])
			expect((await handlers.POST(event(JSON.stringify(value)))).status).toBe(400);
		expect((await handlers.POST(event(new Uint8Array([255])))).status).toBe(400);
		expect(handlers.verifyFreeRoute).not.toHaveBeenCalled();
	});
	it('bounds actual streamed body bytes even when declared length lies', async () => {
		const handlers = setup();
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES + 1));
				controller.close();
			}
		});
		const response = await handlers.POST(event(body, { 'content-length': '1' }));
		expect(response.status).toBe(413);
		privateResponse(response);
		expect(handlers.reserve).not.toHaveBeenCalled();
	});
	it('does not spend quota when free pricing fails and does not generate after quota rejection', async () => {
		const unavailable = setup();
		unavailable.verifyFreeRoute.mockRejectedValue(
			new SemanticFailure('free_route_unavailable', 'Free route not verified.')
		);
		expect((await unavailable.POST(event())).status).toBe(503);
		expect(unavailable.reserve).not.toHaveBeenCalled();
		const exhausted = setup();
		exhausted.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
		const response = await exhausted.POST(event());
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('120');
		expect(exhausted.generate).not.toHaveBeenCalled();
	});
	it('rejects invalid provider results with no replacement project or leaked source/error', async () => {
		const handlers = setup();
		handlers.generate.mockResolvedValue({ secret: 'private provider response' });
		const response = await handlers.POST(event());
		const body = await response.text();
		expect(response.status).toBe(502);
		privateResponse(response);
		expect(body).not.toContain('private provider response');
		expect(body).not.toContain('Trees');
		expect(JSON.parse(body).project).toBeUndefined();
		expect(JSON.parse(body).diagnostic).toMatchObject({ stage: 'wire-schema' });
	});
	it('reports a safe topology diagnostic without returning provider labels, values or source IDs', async () => {
		const handlers = setup();
		handlers.generate.mockImplementation(async (prepared) => {
			const value = wire(prepared);
			value.rootId = 'private-missing-root-id';
			value.nodes[0].label = 'PRIVATE SOURCE-LINKED LABEL';
			return value;
		});
		const response = await handlers.POST(event());
		expect(response.status).toBe(502);
		privateResponse(response);
		const body = await response.json();
		expect(body.code).toBe('invalid_analysis');
		expect(body.project).toBeUndefined();
		expect(body.diagnostic).toEqual({ stage: 'topology', reason: 'invalid_root', field: 'rootId' });
		expect(JSON.stringify(body)).not.toMatch(/PRIVATE|private-missing-root-id|Trees offer shade/);
	});
	it('distinguishes an unexpected normalizer exception without exposing its message', async () => {
		const handlers = setup();
		handlers.generate.mockResolvedValue({
			get title() {
				throw new Error('PRIVATE NORMALIZER DETAIL');
			}
		});
		const response = await handlers.POST(event());
		expect(response.status).toBe(502);
		const body = await response.json();
		expect(body.diagnostic).toEqual({ stage: 'unexpected', reason: 'normalizer_exception' });
		expect(JSON.stringify(body)).not.toContain('PRIVATE');
		expect(body.project).toBeUndefined();
	});
	it('reports disabled/unverified availability truthfully without reserving quota', async () => {
		const disabled = setup({ enabled: false });
		expect((await (await disabled.GET(getEvent())).json()).available).toBe(false);
		expect(disabled.dependencies).not.toHaveBeenCalled();
		const available = setup();
		expect((await (await available.GET(getEvent())).json()).available).toBe(true);
		await available.GET(getEvent());
		expect(available.verifyFreeRoute).toHaveBeenCalledTimes(1);
		expect(available.reserve).not.toHaveBeenCalled();
		await available.POST(event());
		expect(available.verifyFreeRoute).toHaveBeenCalledTimes(2);
	});
	it('aborts and settles when a provider ignores the deadline', async () => {
		vi.useFakeTimers();
		const handlers = setup();
		let providerSignal: AbortSignal | undefined;
		handlers.generate.mockImplementation((_prepared, signal) => {
			providerSignal = signal;
			return new Promise(() => {});
		});
		const pending = handlers.POST(event());
		await vi.waitFor(() => expect(providerSignal).toBeDefined());
		await vi.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS + 10);
		const response = await pending;
		expect(response.status).toBe(504);
		expect(providerSignal?.aborted).toBe(true);
		privateResponse(response);
	});
	it('refuses overlapping work from one client and releases admission after failure', async () => {
		const handlers = setup();
		let release: (value: unknown) => void = () => {};
		handlers.generate.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				})
		);
		const first = handlers.POST(event());
		await vi.waitFor(() => expect(handlers.generate).toHaveBeenCalledOnce());
		expect((await handlers.POST(event())).status).toBe(429);
		release({ invalid: true });
		expect((await first).status).toBe(502);
		expect((await handlers.POST(event())).status).toBe(200);
	});
});
