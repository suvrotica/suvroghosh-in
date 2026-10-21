import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	consent: false,
	subscriber: (() => {}) as () => void,
	inject: vi.fn(),
	pageview: vi.fn(),
	track: vi.fn(),
	speed: vi.fn(() => ({ setRoute: vi.fn() }))
}));
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$lib/components/seo/SEO', () => ({ siteUrl: 'https://www.suvroghosh.in' }));
vi.mock('@vercel/analytics', () => ({
	inject: state.inject,
	pageview: state.pageview,
	track: state.track
}));
vi.mock('@vercel/speed-insights', () => ({ injectSpeedInsights: state.speed }));
vi.mock('$lib/privacy/consent', () => ({
	getConsent: () => ({ analytics: state.consent }),
	initializeConsent: () => () => {},
	subscribeConsent: (fn: () => void) => {
		state.subscriber = fn;
		fn();
		return () => {};
	}
}));
import { startMeasurement, trackConsented } from './client';

describe('eligible-browser consent and collection integration', () => {
	const origin = 'https://www.suvroghosh.in';
	let collector: ReturnType<typeof startMeasurement> | undefined;
	let local: Map<string, string>;
	let session: Map<string, string>;
	let location: { origin: string; pathname: string; href: string };
	let fetcher: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		vi.clearAllMocks();
		state.consent = false;
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
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		});
	});
	afterEach(() => {
		collector?.stop();
		collector = undefined;
		vi.unstubAllGlobals();
	});
	it('sends nothing without consent; granting initializes once and sends only sanitized values', () => {
		collector = startMeasurement();
		trackConsented('example');
		expect(state.inject).not.toHaveBeenCalled();
		expect(state.track).not.toHaveBeenCalled();
		expect(fetcher).not.toHaveBeenCalled();
		state.consent = true;
		state.subscriber();
		expect(state.inject).toHaveBeenCalledTimes(1);
		expect(state.speed).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
			v: 1,
			consent: true,
			path: '/writing',
			referrer: 'example.test'
		});
		collector.navigate('/writing');
		state.subscriber();
		expect(fetcher).toHaveBeenCalledTimes(1);
		location.pathname = '/about';
		location.href = `${origin}/about`;
		collector.navigate('/about');
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(state.inject).toHaveBeenCalledTimes(1);
	});
	it('withdrawal aborts in-flight collection and blocks provider callbacks and custom events', () => {
		fetcher.mockImplementation(() => new Promise(() => {}));
		state.consent = true;
		collector = startMeasurement();
		const callback = state.inject.mock.calls[0][0].beforeSend;
		expect(callback({ url: `${origin}/writing?secret=yes` })).toEqual({ url: `${origin}/writing` });
		trackConsented('allowed');
		expect(state.track).toHaveBeenCalledTimes(1);
		state.consent = false;
		state.subscriber();
		expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
		expect(callback({ url: `${origin}/writing` })).toBeNull();
		trackConsented('denied');
		expect(state.track).toHaveBeenCalledTimes(1);
		location.pathname = '/about';
		collector.navigate('/about');
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
	it('preserves opt-out and blocks automation, previews, unavailable storage and private routes', () => {
		state.consent = true;
		local.set('suvroghosh:measurement', 'off');
		collector = startMeasurement();
		expect(fetcher).not.toHaveBeenCalled();
		local.clear();
		session.set('suvroghosh:measurement', 'off');
		state.subscriber();
		expect(fetcher).not.toHaveBeenCalled();
		session.clear();
		vi.stubGlobal('navigator', { webdriver: true });
		state.subscriber();
		expect(fetcher).not.toHaveBeenCalled();
		vi.stubGlobal('navigator', { webdriver: false });
		location.origin = 'https://preview.vercel.app';
		state.subscriber();
		expect(fetcher).not.toHaveBeenCalled();
		location.origin = origin;
		location.href = `${origin}/notes/studio/analytics`;
		collector.navigate('/notes/studio/analytics');
		expect(fetcher).not.toHaveBeenCalled();
		location.href = `${origin}/writing`;
		Object.defineProperty(window, 'localStorage', {
			get: () => {
				throw new Error('denied');
			}
		});
		collector.navigate('/writing');
		state.subscriber();
		expect(fetcher).not.toHaveBeenCalled();
	});
});
