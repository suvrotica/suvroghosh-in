import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from '@sveltejs/kit';
const mocks = vi.hoisted(() => ({
	privateEnv: {
		VERCEL: '1',
		VERCEL_ENV: 'production',
		NOTES_RATE_LIMIT_SALT: 'test-only-not-a-real-secret'
	},
	record: vi.fn(),
	eligible: vi.fn(),
	context: { dev: false }
}));
vi.mock('$env/dynamic/private', () => ({ env: mocks.privateEnv }));
vi.mock('$app/environment', () => mocks.context);
vi.mock('$lib/server/analytics/repository', () => ({ recordAnalyticsPageView: mocks.record }));
vi.mock('$lib/server/analytics/paths', () => ({ eligibleAnalyticsPath: mocks.eligible }));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.privateEnv.VERCEL = '1';
	mocks.privateEnv.VERCEL_ENV = 'production';
	mocks.privateEnv.NOTES_RATE_LIMIT_SALT = 'test-only-not-a-real-secret';
	mocks.context.dev = false;
	mocks.record.mockResolvedValue('accepted');
	mocks.eligible.mockImplementation((path: string) =>
		path.split(/[?#]/)[0] === '/writing' ? '/writing' : null
	);
});
afterEach(() => vi.useRealTimers());

async function invoke(
	body: BodyInit = JSON.stringify({ v: 1, consent: true, path: '/writing' }),
	headers: Record<string, string> = {},
	origin = 'https://www.suvroghosh.in',
	address = 'test-address'
) {
	const { POST } = await import('./+server');
	const request = new Request(`${origin}/api/analytics/pageview`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
		body,
		...(body instanceof ReadableStream ? { duplex: 'half' } : {})
	});
	return (await POST({
		request,
		url: new URL(request.url),
		getClientAddress: () => address
	} as Parameters<RequestHandler>[0])) as Response;
}

describe('same-origin consented page-view collection', () => {
	it('records only canonical eligible minimized dimensions in production', async () => {
		const response = await invoke(
			JSON.stringify({
				v: 1,
				consent: true,
				path: '/writing?secret=a#fragment',
				referrer: 'www.google.com'
			}),
			{
				'x-vercel-ip-country': 'IN',
				'x-vercel-ip-country-region': 'WB',
				'x-vercel-ip-city': 'Calcutta',
				'User-Agent': 'Chrome/100'
			}
		);
		expect(response.status).toBe(204);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.record).toHaveBeenCalledWith(
			{
				path: '/writing',
				country: 'IN',
				region: 'WB',
				city: 'Calcutta',
				referrer: 'Google',
				device: 'Desktop',
				browser: 'Chrome'
			},
			expect.stringMatching(/^[a-f0-9]{64}$/)
		);
		expect(JSON.stringify(mocks.record.mock.calls)).not.toContain('test-address');
	});
	it('does not trust caller-supplied geography or unsupported consent', async () => {
		for (const payload of [
			{ v: 1, consent: false, path: '/writing' },
			{ v: 2, consent: true, path: '/writing' },
			{ v: 1, consent: true, path: '/writing', city: 'Spoofed' },
			null,
			[]
		]) {
			expect((await invoke(JSON.stringify(payload))).status).toBe(400);
		}
		expect(mocks.record).not.toHaveBeenCalled();
		expect((await invoke()).status).toBe(204);
		expect(mocks.record.mock.calls[0][0]).toMatchObject({
			country: 'Unknown',
			region: 'Unknown',
			city: 'Unknown'
		});
	});
	it('requires exact Origin, supported content type and a public registered page', async () => {
		expect(
			(await invoke('{}', { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' }))
				.status
		).toBe(403);
		expect((await invoke('{}', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
		expect((await invoke('{}', { 'Content-Type': 'text/plain' })).status).toBe(415);
		expect(
			(await invoke(JSON.stringify({ v: 1, consent: true, path: '/notes/studio' }))).status
		).toBe(400);
		expect(mocks.record).not.toHaveBeenCalled();
	});
	it('ignores development, preview and noncanonical deployments even with geo headers', async () => {
		mocks.context.dev = true;
		expect((await invoke()).status).toBe(204);
		mocks.context.dev = false;
		mocks.privateEnv.VERCEL_ENV = 'preview';
		expect((await invoke()).status).toBe(204);
		mocks.privateEnv.VERCEL_ENV = 'production';
		expect((await invoke(undefined, {}, 'https://preview.example')).status).toBe(204);
		expect(mocks.record).not.toHaveBeenCalled();
	});
	it('rejects an oversized live stream regardless of Content-Length and cancels it', async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(2049));
			},
			cancel
		});
		expect((await invoke(body, { 'Content-Length': '1' })).status).toBe(413);
		expect(cancel).toHaveBeenCalled();
		expect(mocks.record).not.toHaveBeenCalled();
	});
	it('cancels stalled body reads at the two-second boundary', async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		const pending = invoke(new ReadableStream({ cancel }));
		await vi.advanceTimersByTimeAsync(2001);
		expect((await pending).status).toBe(408);
		expect(cancel).toHaveBeenCalled();
		expect(mocks.record).not.toHaveBeenCalled();
	});
	it('fails closed without private rate salt and maps durable rate/backend failures', async () => {
		mocks.privateEnv.NOTES_RATE_LIMIT_SALT = '';
		expect((await invoke()).status).toBe(503);
		expect(mocks.record).not.toHaveBeenCalled();
		mocks.privateEnv.NOTES_RATE_LIMIT_SALT = 'test-only-not-a-real-secret';
		mocks.record.mockResolvedValue('rate_limited');
		const response = await invoke();
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('60');
		mocks.record.mockResolvedValue('unavailable');
		expect((await invoke()).status).toBe(503);
	});
	it('bounds repeated admitted work before database calls', async () => {
		for (let n = 0; n < 60; n++) expect((await invoke()).status).toBe(204);
		expect((await invoke()).status).toBe(429);
		expect(mocks.record).toHaveBeenCalledTimes(60);
	});
});
