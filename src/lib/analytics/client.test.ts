import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	consent: undefined as boolean | undefined,
	development: false,
	subscriber: (() => {}) as () => void,
	inject: vi.fn(),
	pageview: vi.fn(),
	track: vi.fn(),
	speed: vi.fn((options: { beforeSend: (event: { url: string }) => unknown }) => ({
		setRoute: vi.fn(),
		options
	}))
}));
vi.mock('$app/environment', () => ({
	get dev() {
		return state.development;
	}
}));
vi.mock('$lib/components/seo/SEO', () => ({ siteUrl: 'https://www.suvroghosh.in' }));
vi.mock('@vercel/analytics', () => ({
	inject: state.inject,
	pageview: state.pageview,
	track: state.track
}));
vi.mock('@vercel/speed-insights', () => ({ injectSpeedInsights: state.speed }));
vi.mock('$lib/privacy/consent', () => ({
	getConsent: () => (state.consent === undefined ? null : { analytics: state.consent }),
	initializeConsent: () => () => {},
	subscribeConsent: (fn: () => void) => {
		state.subscriber = fn;
		fn();
		return () => {};
	}
}));
import { startMeasurement, trackConsented } from './client';

describe('baseline provider pageviews and separate optional measurement', () => {
	const origin = 'https://www.suvroghosh.in';
	let collector: ReturnType<typeof startMeasurement> | undefined;
	let local: Map<string, string>;
	let session: Map<string, string>;
	let location: { origin: string; pathname: string; href: string };
	let fetcher: ReturnType<typeof vi.fn>;
	let storageChanged: () => void;
	function navigate(path: string) {
		location.pathname = path;
		location.href = `${location.origin}${path}`;
		collector!.navigate(path);
	}
	beforeEach(() => {
		vi.clearAllMocks();
		state.consent = undefined;
		state.development = false;
		storageChanged = () => {};
		local = new Map();
		session = new Map();
		location = { origin, pathname: '/writing', href: `${origin}/writing?token=secret#state` };
		fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
		vi.stubGlobal('fetch', fetcher);
		vi.stubGlobal('navigator', { webdriver: false });
		vi.stubGlobal('document', { referrer: 'https://example.test/search?private=secret' });
		vi.stubGlobal('window', {
			location,
			localStorage: { getItem: (key: string) => local.get(key) ?? null },
			sessionStorage: { getItem: (key: string) => session.get(key) ?? null },
			setTimeout,
			addEventListener: vi.fn((name: string, callback: () => void) => {
				if (name === 'storage') storageChanged = callback;
			}),
			removeEventListener: vi.fn()
		});
	});
	afterEach(() => {
		collector?.stop();
		collector = undefined;
		vi.unstubAllGlobals();
	});
	it('records fresh, rejected and expired-choice views without starting optional collection', () => {
		collector = startMeasurement();
		trackConsented('example');
		expect(state.inject).toHaveBeenCalledOnce();
		expect(state.inject.mock.calls[0][0]).toEqual({
			mode: 'production',
			disableAutoTrack: true,
			framework: 'sveltekit',
			beforeSend: expect.any(Function)
		});
		state.consent = false;
		state.subscriber();
		navigate('/about');
		// The consent module returns null after an expired choice, just as for a fresh visit.
		state.consent = undefined;
		state.subscriber();
		navigate('/projects');
		expect(state.pageview.mock.calls).toEqual([
			[{ path: '/writing' }],
			[{ path: '/about' }],
			[{ path: '/projects' }]
		]);
		expect(state.inject).toHaveBeenCalledOnce();
		expect(state.speed).not.toHaveBeenCalled();
		expect(state.track).not.toHaveBeenCalled();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('uses independent ledgers for initial views, SPA navigation and late consent without duplicates', () => {
		collector = startMeasurement();
		navigate('/about');
		expect(state.pageview).toHaveBeenCalledTimes(2);
		expect(fetcher).not.toHaveBeenCalled();
		state.consent = true;
		state.subscriber();
		expect(state.inject).toHaveBeenCalledOnce();
		expect(state.speed).toHaveBeenCalledOnce();
		expect(state.pageview).toHaveBeenCalledTimes(2);
		expect(fetcher).toHaveBeenCalledOnce();
		expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
			v: 1,
			consent: true,
			path: '/about',
			referrer: 'example.test'
		});
		navigate('/about');
		state.subscriber();
		expect(fetcher).toHaveBeenCalledOnce();
		navigate('/projects');
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(state.pageview).toHaveBeenCalledTimes(3);
		state.consent = false;
		state.subscriber();
		state.consent = true;
		state.subscriber();
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(state.pageview).toHaveBeenCalledTimes(3);
	});

	it('withdrawal aborts optional work and queued events while preserving baseline pageviews', () => {
		fetcher.mockImplementation(() => new Promise(() => {}));
		state.consent = true;
		collector = startMeasurement();
		const callback = state.inject.mock.calls[0][0].beforeSend;
		const event = { type: 'event', url: `${origin}/writing?secret=yes` };
		const view = { type: 'pageview', url: `${origin}/writing?secret=yes` };
		expect(callback(event)).toEqual({ type: 'event', url: `${origin}/writing` });
		trackConsented('allowed');
		expect(state.track).toHaveBeenCalledTimes(1);
		window.vaq = [
			['beforeSend', callback],
			['pageview', { path: '/writing' }],
			['event', { name: 'queued' }]
		];
		state.consent = false;
		state.subscriber();
		expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
		expect(window.vaq.map(([kind]) => kind)).toEqual(['beforeSend', 'pageview']);
		expect(callback(event)).toBeNull();
		expect(callback(view)).toEqual({ type: 'pageview', url: `${origin}/writing` });
		expect(state.speed.mock.calls[0][0].beforeSend({ url: `${origin}/writing` })).toBeNull();
		trackConsented('denied');
		expect(state.track).toHaveBeenCalledTimes(1);
		navigate('/about');
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(state.pageview).toHaveBeenCalledTimes(2);
	});

	it.each(['storage', 'alternate-host', 'webdriver', 'development'])(
		'keeps baseline provider views under %s without widening optional collection',
		(condition) => {
			state.consent = true;
			if (condition === 'storage') {
				for (const key of ['localStorage', 'sessionStorage']) {
					Object.defineProperty(window, key, {
						get: () => {
							throw new Error('denied');
						}
					});
				}
			} else if (condition === 'alternate-host') {
				location.origin = 'https://preview.vercel.app';
				location.href = `${location.origin}/writing?token=secret`;
			} else if (condition === 'webdriver') {
				vi.stubGlobal('navigator', { webdriver: true });
			} else state.development = true;
			collector = startMeasurement();
			expect(state.inject).toHaveBeenCalledOnce();
			expect(state.inject.mock.calls[0][0].mode).toBe(
				condition === 'development' ? 'development' : 'production'
			);
			expect(state.pageview.mock.calls).toEqual([[{ path: '/writing' }]]);
			const callback = state.inject.mock.calls[0][0].beforeSend;
			expect(
				callback({ type: 'pageview', url: `${location.origin}/writing?token=secret#state` })
			).toEqual({ type: 'pageview', url: `${location.origin}/writing` });
			expect(callback({ type: 'event', url: `${location.origin}/writing` })).toBeNull();
			expect(fetcher).not.toHaveBeenCalled();
			expect(state.speed).not.toHaveBeenCalled();
			trackConsented('denied');
			expect(state.track).not.toHaveBeenCalled();
		}
	);

	it.each(['local', 'session'])(
		'honors explicit %s opt-out and clears pending provider views when it changes',
		(scope) => {
			const storage = scope === 'local' ? local : session;
			storage.set('suvroghosh:measurement', 'off');
			collector = startMeasurement();
			expect(state.inject).not.toHaveBeenCalled();
			expect(state.pageview).not.toHaveBeenCalled();
			storage.clear();
			storageChanged();
			expect(state.inject).toHaveBeenCalledOnce();
			expect(state.pageview).toHaveBeenCalledOnce();
			const callback = state.inject.mock.calls[0][0].beforeSend;
			window.vaq = [
				['beforeSend', callback],
				['pageview', { path: '/writing' }],
				['event', { name: 'queued' }]
			];
			storage.set('suvroghosh:measurement', 'off');
			storageChanged();
			expect(window.vaq.map(([kind]) => kind)).toEqual(['beforeSend']);
			expect(callback({ type: 'pageview', url: `${origin}/writing` })).toBeNull();
			navigate('/about');
			expect(state.pageview).toHaveBeenCalledOnce();
			expect(fetcher).not.toHaveBeenCalled();
		}
	);

	it('never initializes on private URLs and sanitizes provider callbacks after public navigation', () => {
		location.pathname = '/notes/%73tudio/analytics';
		location.href = `${origin}${location.pathname}?token=secret`;
		collector = startMeasurement();
		expect(state.inject).not.toHaveBeenCalled();
		navigate('/writing');
		expect(state.pageview).toHaveBeenCalledOnce();
		const callback = state.inject.mock.calls[0][0].beforeSend;
		for (const path of [
			'/notes/auth/callback',
			'/notes/reset-password',
			'/api/analytics/pageview',
			'/notes/studio'
		]) {
			navigate(path);
			expect(callback({ type: 'pageview', url: `${origin}${path}?token=secret` })).toBeNull();
		}
		expect(state.pageview).toHaveBeenCalledOnce();
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('disposal aborts optional work, clears pending provider work and disables retained callbacks', () => {
		state.consent = true;
		fetcher.mockImplementation(() => new Promise(() => {}));
		collector = startMeasurement();
		const callback = state.inject.mock.calls[0][0].beforeSend;
		window.vaq = [
			['beforeSend', callback],
			['pageview', { path: '/writing' }],
			['event', { name: 'queued' }]
		];
		collector.stop();
		expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
		expect(window.vaq.map(([kind]) => kind)).toEqual(['beforeSend']);
		expect(callback({ type: 'pageview', url: `${origin}/writing` })).toBeNull();
		navigate('/about');
		expect(state.pageview).toHaveBeenCalledOnce();
	});
});
