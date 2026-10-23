import { afterEach, describe, expect, it, vi } from 'vitest';
import { preserveOpenedPublicNote } from './public-offline';
import { registerServiceWorker } from './register-service-worker';

const origin = 'https://example.test';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function setup(resources: string[] = []) {
	const postMessage = vi.fn();
	let callback: PerformanceObserverCallback | undefined;
	const disconnect = vi.fn();
	vi.stubGlobal('navigator', {
		serviceWorker: { ready: Promise.resolve({ active: { postMessage } }), controller: null }
	});
	vi.stubGlobal('location', { origin, pathname: '/notes/opened-note' });
	vi.stubGlobal('document', { fonts: { ready: Promise.resolve() }, querySelectorAll: () => [] });
	vi.stubGlobal('performance', { getEntriesByType: () => resources.map((name) => ({ name })) });
	vi.stubGlobal(
		'PerformanceObserver',
		class {
			constructor(receive: PerformanceObserverCallback) {
				callback = receive;
			}
			observe() {}
			disconnect = disconnect;
		}
	);
	return {
		postMessage,
		disconnect,
		receive: (names: string[]) =>
			callback?.(
				{ getEntries: () => names.map((name) => ({ name })) } as PerformanceObserverEntryList,
				{} as PerformanceObserver
			)
	};
}

describe('first-open published note offline preparation', () => {
	it('sends only completed same-origin immutable resources and public images, deduped and bounded', async () => {
		const client = setup([
			origin + '/_app/immutable/entry/start.js',
			origin + '/_app/immutable/entry/start.js',
			origin + '/api/notes/private/document',
			'https://elsewhere.test/_app/immutable/other.js',
			origin + '/_app/immutable/query.js?x=1',
			...Array.from({ length: 200 }, (_, index) => origin + `/_app/immutable/chunks/${index}.js`),
			origin + '/api/public/notes/assets/note/image'
		]);
		const dispose = preserveOpenedPublicNote();
		await vi.waitFor(() => expect(client.postMessage).toHaveBeenCalledOnce());
		const payload = client.postMessage.mock.calls[0][0];
		expect(payload.type).toBe('cache-opened-public-note-v1');
		expect(payload.urls).toHaveLength(128);
		expect(new Set(payload.urls).size).toBe(128);
		expect(payload.urls).toContain(origin + '/api/public/notes/assets/note/image');
		expect(payload.urls.join(' ')).not.toContain('private');
		expect(payload.urls.join(' ')).not.toContain('elsewhere');
		expect(payload.urls.join(' ')).not.toContain('?');
		dispose();
	});

	it('keeps bootstrap entry points and newest note resources ahead of old browsing history', async () => {
		const client = setup([
			origin + '/_app/immutable/entry/start.js',
			...Array.from(
				{ length: 200 },
				(_, index) => origin + `/_app/immutable/chunks/old-${index}.js`
			),
			origin + '/_app/immutable/chunks/current-note.js'
		]);
		const dispose = preserveOpenedPublicNote();
		await vi.waitFor(() => expect(client.postMessage).toHaveBeenCalledOnce());
		const urls = client.postMessage.mock.calls[0][0].urls;
		expect(urls).toHaveLength(128);
		expect(urls[0]).toBe(origin + '/_app/immutable/entry/start.js');
		expect(urls[1]).toBe(origin + '/_app/immutable/chunks/current-note.js');
		expect(urls).not.toContain(origin + '/_app/immutable/chunks/old-0.js');
		dispose();
	});

	it('collects late requested resources without polling and disconnects on teardown', async () => {
		vi.useFakeTimers();
		const client = setup([origin + '/_app/immutable/entry/start.js']);
		const dispose = preserveOpenedPublicNote();
		await vi.advanceTimersByTimeAsync(0);
		client.receive([
			origin + '/_app/immutable/entry/start.js',
			origin + '/api/public/notes/assets/note/late'
		]);
		await vi.advanceTimersByTimeAsync(100);
		expect(client.postMessage).toHaveBeenCalledTimes(2);
		expect(client.postMessage.mock.calls[1][0].urls).toEqual([
			origin + '/api/public/notes/assets/note/late'
		]);
		dispose();
		expect(client.disconnect).toHaveBeenCalled();
		client.receive([origin + '/_app/immutable/chunks/disposed.js']);
		await vi.advanceTimersByTimeAsync(100);
		expect(client.postMessage).toHaveBeenCalledTimes(2);
	});

	it('does not send a stale route snapshot after navigation or failed service-worker registration', async () => {
		const client = setup([origin + '/_app/immutable/entry/start.js']);
		const dispose = preserveOpenedPublicNote();
		location.pathname = '/notes/studio';
		await Promise.resolve();
		await Promise.resolve();
		expect(client.postMessage).not.toHaveBeenCalled();
		dispose();
	});
});

describe('service-worker registration lifecycle', () => {
	function setupRegistration(readyState: DocumentReadyState = 'loading') {
		const target = new EventTarget();
		const register = vi.fn().mockResolvedValue({});
		vi.stubGlobal('window', target);
		vi.stubGlobal('document', { readyState });
		vi.stubGlobal('navigator', { serviceWorker: { register } });
		return { target, register };
	}

	it('leaves unsupported browsers alone', () => {
		const { target } = setupRegistration();
		vi.stubGlobal('navigator', {});
		const listen = vi.spyOn(target, 'addEventListener');
		expect(() => registerServiceWorker('/service-worker.js')()).not.toThrow();
		expect(listen).not.toHaveBeenCalled();
	});

	it('waits for load and registers once with the production URL and browser defaults', async () => {
		const { target, register } = setupRegistration();
		const dispose = registerServiceWorker('/service-worker.js');
		expect(register).not.toHaveBeenCalled();
		target.dispatchEvent(new Event('load'));
		target.dispatchEvent(new Event('load'));
		await Promise.resolve();
		expect(register.mock.calls).toEqual([['/service-worker.js']]);
		dispose();
	});

	it('registers immediately when the page already loaded', async () => {
		const { register } = setupRegistration('complete');
		const dispose = registerServiceWorker('/service-worker.js');
		await Promise.resolve();
		expect(register.mock.calls).toEqual([['/service-worker.js']]);
		dispose();
	});

	it('preserves the base path and development module-worker option', async () => {
		const { register } = setupRegistration('complete');
		const dispose = registerServiceWorker('/journal/service-worker.js', true);
		await Promise.resolve();
		expect(register.mock.calls).toEqual([['/journal/service-worker.js', { type: 'module' }]]);
		dispose();
	});

	it('removes a pending load listener when the owner unmounts', () => {
		const { target, register } = setupRegistration();
		const remove = vi.spyOn(target, 'removeEventListener');
		const dispose = registerServiceWorker('/service-worker.js');
		dispose();
		dispose();
		target.dispatchEvent(new Event('load'));
		expect(remove).toHaveBeenCalledWith('load', expect.any(Function));
		expect(register).not.toHaveBeenCalled();
	});

	it('handles a Google-renderer-like rejected registration without an unhandled rejection or retry', async () => {
		const { target, register } = setupRegistration();
		register.mockImplementation(() => Promise.reject(new Error('Rejected')));
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);
		const dispose = registerServiceWorker('/service-worker.js');
		try {
			target.dispatchEvent(new Event('load'));
			await new Promise((resolve) => setTimeout(resolve, 0));
			target.dispatchEvent(new Event('load'));
			expect(register).toHaveBeenCalledOnce();
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			dispose();
			process.off('unhandledRejection', unhandled);
		}
	});

	it('handles a synchronous registration throw', async () => {
		const { register } = setupRegistration('complete');
		register.mockImplementation(() => {
			throw new Error('Registration is unavailable');
		});
		const dispose = registerServiceWorker('/service-worker.js');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(register).toHaveBeenCalledOnce();
		dispose();
	});

	it('handles a service-worker API getter that throws', async () => {
		setupRegistration('complete');
		const access = vi.fn(() => {
			throw new Error('Access is denied');
		});
		vi.stubGlobal('navigator', Object.defineProperty({}, 'serviceWorker', { get: access }));
		const dispose = registerServiceWorker('/service-worker.js');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(access).toHaveBeenCalledOnce();
		dispose();
	});
});
