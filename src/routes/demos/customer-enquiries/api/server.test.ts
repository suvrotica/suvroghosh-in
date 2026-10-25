import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	enabled: vi.fn(() => true),
	authenticated: vi.fn(() => false),
	login: vi.fn(() => false),
	logout: vi.fn(),
	submit: vi.fn(),
	update: vi.fn(),
	retry: vi.fn(),
	tick: vi.fn(),
	sandbox: vi.fn(),
	reset: vi.fn(),
	dashboard: vi.fn(),
	list: vi.fn(),
	detail: vi.fn(),
	staff: vi.fn(),
	now: vi.fn(() => Date.parse('2026-10-26T06:00:00Z')),
	settings: vi.fn(),
	routingRules: vi.fn()
}));

vi.mock('$lib/server/enquiry-demo/runtime', () => ({
	demoEnabled: mocks.enabled,
	authenticated: mocks.authenticated,
	login: mocks.login,
	logout: mocks.logout,
	demoStore: () => mocks
}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.enabled.mockReturnValue(true);
	mocks.authenticated.mockReturnValue(false);
	mocks.login.mockReturnValue(false);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function request(
	method: 'POST' | 'GET',
	input: unknown = {},
	options: { origin?: string; type?: string; body?: ReadableStream; query?: string } = {}
) {
	const handlers = await import('./+server');
	const url = new URL(`http://127.0.0.1:4321/demos/customer-enquiries/api${options.query || ''}`);
	const body = options.body || JSON.stringify(input);
	const req = new Request(url, {
		method,
		...(method === 'POST'
			? {
					body,
					headers: {
						origin: options.origin ?? url.origin,
						'content-type': options.type ?? 'application/json'
					},
					...(options.body ? { duplex: 'half' } : {})
				}
			: {})
	});
	return await handlers[method]({
		request: req,
		url,
		cookies: {},
		getClientAddress: () => 'test-client'
	} as unknown as Parameters<typeof handlers.POST>[0]);
}

describe('local demonstration HTTP boundaries', () => {
	test('private staff reads and every staff mutation reject an unauthenticated caller', async () => {
		expect((await request('GET', {}, { query: '?view=desk' })).status).toBe(401);
		expect((await request('GET', {}, { query: '?view=detail&ref=EOS-00001' })).status).toBe(401);
		for (const action of ['update', 'retry', 'tick', 'sandbox', 'reset', 'logout']) {
			expect((await request('POST', { action, reference: 'EOS-00001' })).status).toBe(401);
		}
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.reset).not.toHaveBeenCalled();
	});

	test('disabled handlers fail closed before accessing any saved data', async () => {
		mocks.enabled.mockReturnValue(false);
		expect((await request('GET', {}, { query: '?view=desk' })).status).toBe(404);
		expect((await request('POST', { action: 'submit' })).status).toBe(404);
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	test('foreign origins and unsupported bodies are rejected', async () => {
		expect(
			(await request('POST', { action: 'submit' }, { origin: 'https://other.example' })).status
		).toBe(403);
		expect((await request('POST', { action: 'submit' }, { type: 'text/plain' })).status).toBe(415);
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	test('limits streamed bytes without relying on a Content-Length header', async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(16 * 1024 + 1));
			},
			cancel
		});
		expect((await request('POST', {}, { body })).status).toBe(413);
		expect(cancel).toHaveBeenCalled();
		expect(mocks.submit).not.toHaveBeenCalled();
	});

	test('times out a stalled request and cancels its stream', async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		const body = new ReadableStream({ cancel });
		const response = request('POST', {}, { body });
		await vi.advanceTimersByTimeAsync(5001);
		expect((await response).status).toBe(408);
		expect(cancel).toHaveBeenCalled();
	});

	test('a login checks the server-side password adapter and does not expose credentials', async () => {
		const rejected = await request('POST', { action: 'login', password: 'incorrect' });
		expect(rejected.status).toBe(401);
		expect(mocks.login).toHaveBeenCalledWith('incorrect', {}, false);
		mocks.login.mockReturnValue(true);
		const accepted = await request('POST', { action: 'login', password: 'correct-local-secret' });
		expect(accepted.status).toBe(200);
		expect(await accepted.json()).toEqual({ authenticated: true });
		expect(accepted.headers.get('cache-control')).toContain('no-store');
	});

	test('a saved receipt excludes staff data and database failures do not report success', async () => {
		mocks.submit.mockReturnValue({
			duplicate: false,
			enquiry: {
				ref: 'EOS-00031',
				createdAt: '2026-10-26T06:00:00Z',
				deadlineAt: '2026-10-26T10:00:00Z',
				ackStatus: 'waiting',
				email: 'private@example.com',
				ownerName: 'Demo staff'
			}
		});
		const receipt = await request('POST', { action: 'submit' });
		expect(receipt.status).toBe(200);
		expect(await receipt.json()).toEqual({
			reference: 'EOS-00031',
			duplicate: false,
			createdAt: '2026-10-26T06:00:00Z',
			deadlineAt: '2026-10-26T10:00:00Z',
			ackStatus: 'waiting'
		});
		mocks.submit.mockImplementation(() => {
			throw new Error('secret sql exception');
		});
		const failed = await request('POST', { action: 'submit' });
		expect(failed.status).toBe(503);
		expect(await failed.text()).not.toContain('secret sql exception');
	});

	test('sample reset requires authentication and an exact typed confirmation', async () => {
		mocks.authenticated.mockReturnValue(true);
		expect((await request('POST', { action: 'reset', confirmation: 'reset' })).status).toBe(400);
		expect(mocks.reset).not.toHaveBeenCalled();
		expect((await request('POST', { action: 'reset', confirmation: 'RESET DEMO' })).status).toBe(
			200
		);
		expect(mocks.reset).toHaveBeenCalledTimes(1);
	});

	test('an authenticated staff action accepts the five-digit stable reference', async () => {
		mocks.authenticated.mockReturnValue(true);
		mocks.update.mockReturnValue({ ref: 'EOS-00001', status: 'in-progress' });
		const changed = await request('POST', {
			action: 'update',
			reference: 'EOS-00001',
			status: 'in-progress'
		});
		expect(changed.status).toBe(200);
		expect(mocks.update).toHaveBeenCalledWith(
			'EOS-00001',
			{ status: 'in-progress' },
			'Office coordinator'
		);
	});
});
