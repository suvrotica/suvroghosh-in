import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { RESEND_API_KEY: 're_test' } }));
beforeEach(() => vi.resetModules());
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function invoke(
	body: BodyInit = new URLSearchParams({
		name: 'Reader',
		email: 'reader@example.com',
		message: 'A sufficiently long message.'
	}),
	contentType?: string,
	origin = 'https://site.example',
	address: string | null = 'client'
) {
	const { actions } = await import('./+page.server');
	const request = new Request('https://site.example/contact', {
		method: 'POST',
		body,
		headers: { Origin: origin, ...(contentType ? { 'Content-Type': contentType } : {}) },
		...(body instanceof ReadableStream ? { duplex: 'half' } : {})
	});
	const action = actions.default;
	if (!action) throw new Error('Contact action missing');
	return await action({
		request,
		url: new URL(request.url),
		getClientAddress: () => {
			if (address === null) throw new Error('Adapter has no address');
			return address;
		},
		setHeaders: vi.fn()
	} as unknown as Parameters<typeof action>[0]);
}

describe('contact request and delivery boundaries', () => {
	it('retains the three-attempt limit when an adapter has no client address', async () => {
		const provider = vi.fn(
			async () =>
				new Response(JSON.stringify({ id: 'email-id' }), {
					headers: { 'Content-Type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', provider);
		for (let index = 0; index < 3; index++) {
			expect(await invoke(undefined, undefined, 'https://site.example', null)).toMatchObject({
				success: true
			});
		}
		expect(await invoke(undefined, undefined, 'https://site.example', null)).toMatchObject({
			status: 429
		});
		expect(provider).toHaveBeenCalledTimes(3);
	});

	it('preserves native multipart form submissions', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ id: 'email-id' }), {
						headers: { 'Content-Type': 'application/json' }
					})
			)
		);
		const form = new FormData();
		form.set('name', 'Reader');
		form.set('email', 'reader@example.com');
		form.set('message', 'A sufficiently long multipart message.');
		expect(await invoke(form)).toMatchObject({ success: true });
	});

	it('bounds streamed form input without trusting Content-Length', async () => {
		const cancel = vi.fn();
		vi.stubGlobal('fetch', vi.fn());
		const result = await invoke(
			new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array(65537));
				},
				cancel
			}),
			'application/x-www-form-urlencoded'
		);
		expect(result).toMatchObject({ status: 413 });
		expect(cancel).toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('preserves ordinary form values and passes an abort signal through the real Resend SDK', async () => {
		const provider = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'email-id' }), {
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', provider);
		expect(await invoke()).toMatchObject({ success: true });
		const [url, options] = provider.mock.calls[0];
		expect(url).toBe('https://api.resend.com/emails');
		expect(options.signal).toBeInstanceOf(AbortSignal);
		expect(JSON.parse(options.body)).toMatchObject({ reply_to: 'reader@example.com' });
	});

	it('rejects foreign-origin submission before delivery', async () => {
		vi.stubGlobal('fetch', vi.fn());
		expect(await invoke(undefined, undefined, 'https://other.example')).toMatchObject({
			status: 403
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('aborts a stalled mail request at the delivery deadline', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		let signal: AbortSignal | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn((_url, options) => {
				signal = options.signal;
				return new Promise(() => {});
			})
		);
		const response = invoke();
		await vi.advanceTimersByTimeAsync(15001);
		expect(await response).toMatchObject({ status: 500 });
		expect(signal?.aborted).toBe(true);
	});
});
