import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	development: false,
	inject: vi.fn(),
	pageview: vi.fn(),
	track: vi.fn(),
	consentRead: vi.fn()
}));
vi.mock('$app/environment', () => ({
	get dev() {
		return state.development;
	}
}));
vi.mock('@vercel/analytics', () => ({
	inject: state.inject,
	pageview: state.pageview,
	track: state.track
}));
vi.mock('$lib/privacy/consent', () => ({
	getConsent: state.consentRead,
	initializeConsent: state.consentRead,
	subscribeConsent: state.consentRead
}));
import { startMeasurement } from './client';

describe('default public Vercel pageviews', () => {
	const origin = 'https://www.suvroghosh.in';
	let collector: ReturnType<typeof startMeasurement> | undefined;
	let local: Map<string, string>;
	let session: Map<string, string>;
	let location: { origin: string; pathname: string; href: string };
	let fetcher: ReturnType<typeof vi.fn>;
	let localRead: ReturnType<typeof vi.fn>;
	let sessionRead: ReturnType<typeof vi.fn>;
	function navigate(path: string) {
		location.pathname = path;
		location.href = `${location.origin}${path}`;
		collector!.navigate(path);
	}
	beforeEach(() => {
		vi.clearAllMocks();
		state.development = false;
		local = new Map();
		session = new Map();
		location = { origin, pathname: '/writing', href: `${origin}/writing?token=secret#state` };
		fetcher = vi.fn();
		localRead = vi.fn((key: string) => local.get(key) ?? null);
		sessionRead = vi.fn((key: string) => session.get(key) ?? null);
		vi.stubGlobal('fetch', fetcher);
		vi.stubGlobal('navigator', { webdriver: false });
		vi.stubGlobal('window', {
			location,
			localStorage: { getItem: localRead },
			sessionStorage: { getItem: sessionRead },
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		});
	});
	afterEach(() => {
		collector?.stop();
		collector = undefined;
		// This integration owns only Vercel views: no collector, performance or custom events.
		expect(fetcher).not.toHaveBeenCalled();
		expect(state.track).not.toHaveBeenCalled();
		expect(state.consentRead).not.toHaveBeenCalled();
		expect(localRead).not.toHaveBeenCalled();
		expect(sessionRead).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
	it('initializes once and counts initial, completed and revisited paths without duplicates', () => {
		collector = startMeasurement();
		expect(state.inject).toHaveBeenCalledOnce();
		expect(state.inject.mock.calls[0][0]).toEqual({
			mode: 'production',
			disableAutoTrack: true,
			framework: 'sveltekit',
			beforeSend: expect.any(Function)
		});
		navigate('/writing');
		navigate('/about');
		navigate('/about');
		navigate('/writing');
		expect(state.pageview.mock.calls).toEqual([
			[{ path: '/writing' }],
			[{ path: '/about' }],
			[{ path: '/writing' }]
		]);
		expect(state.inject).toHaveBeenCalledOnce();
	});
	it.each([false, true])(
		'ignores legacy analytics=%s and both hidden measurement preferences',
		(analytics) => {
			const savedAt = Date.now();
			local.set(
				'suvroghosh:consent',
				JSON.stringify({
					v: 1,
					analytics,
					media: false,
					savedAt,
					expiresAt: savedAt + 180 * 24 * 60 * 60 * 1000
				})
			);
			local.set('suvroghosh:measurement', 'off');
			session.set('suvroghosh:measurement', 'off');
			collector = startMeasurement();
			expect(state.pageview.mock.calls).toEqual([[{ path: '/writing' }]]);
			local.set('suvroghosh:consent', '{malformed');
			navigate('/about');
			expect(state.pageview).toHaveBeenCalledTimes(2);
		}
	);
	it.each(['storage', 'alternate-host', 'webdriver', 'development'])(
		'initializes public pageviews under %s without application-level eligibility gates',
		(condition) => {
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
				callback({ type: 'pageview', url: `${location.origin}/writing?secret=yes#state` })
			).toEqual({
				type: 'pageview',
				url: `${location.origin}/writing`
			});
		}
	);
	it('suppresses private URLs before SDK initialization and after public navigation', () => {
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
		navigate('/notes/public-note');
		expect(state.pageview).toHaveBeenCalledTimes(2);
	});
	it('rejects custom events and external URLs while preserving sanitized public callbacks', () => {
		collector = startMeasurement();
		const callback = state.inject.mock.calls[0][0].beforeSend;
		expect(
			callback({ type: 'event', url: `${origin}/writing`, payload: { name: 'custom' } })
		).toBeNull();
		expect(callback({ type: 'pageview', url: 'https://external.test/writing' })).toBeNull();
		expect(callback({ type: 'pageview', url: `${origin}/writing?token=secret#state` })).toEqual({
			type: 'pageview',
			url: `${origin}/writing`
		});
	});
	it('disposal clears pending views and disables navigation and retained callbacks', () => {
		collector = startMeasurement();
		const callback = state.inject.mock.calls[0][0].beforeSend;
		window.vaq = [
			['beforeSend', callback],
			['pageview', { path: '/writing' }],
			['event', { name: 'queued' }]
		];
		collector.stop();
		expect(window.vaq.map(([kind]) => kind)).toEqual(['beforeSend']);
		expect(callback({ type: 'pageview', url: `${origin}/writing` })).toBeNull();
		navigate('/about');
		expect(state.pageview).toHaveBeenCalledOnce();
	});
});
