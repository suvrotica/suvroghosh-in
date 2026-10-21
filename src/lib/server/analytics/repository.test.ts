import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createNotesAdminClient: vi.fn() }));
vi.mock('$lib/server/notes/supabase', () => ({
	createNotesAdminClient: mocks.createNotesAdminClient
}));
import { analyticsDateRange, getAnalyticsReport, recordAnalyticsPageView } from './repository';

function backend(data: unknown, error: unknown = null) {
	const abortSignal = vi.fn().mockResolvedValue({ data, error });
	const rpc = vi.fn().mockReturnValue({ abortSignal });
	mocks.createNotesAdminClient.mockReturnValue({ rpc });
	return { rpc, abortSignal };
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.createNotesAdminClient.mockReturnValue(null);
});

describe('analytics repository boundary', () => {
	it('validates presets and inclusive retained date range independently of host timezone', () => {
		const now = new Date('2026-10-21T19:00:00Z');
		expect(analyticsDateRange(new URLSearchParams('period=today'), now)).toEqual({
			from: '2026-10-22',
			to: '2026-10-22'
		});
		expect(analyticsDateRange(new URLSearchParams('period=7d'), now)).toEqual({
			from: '2026-10-16',
			to: '2026-10-22'
		});
		for (const query of [
			'period=all',
			'period=custom&from=2026-99-99&to=2026-10-22',
			'period=custom&from=2026-02-30&to=2026-10-22',
			'period=custom&from=2026-01-01&to=2026-10-22',
			'period=custom&from=2026-10-22&to=2026-10-23'
		]) {
			expect(() => analyticsDateRange(new URLSearchParams(query), now)).toThrow(
				expect.objectContaining({ status: 400 })
			);
		}
	});
	it('returns an honest unavailable state without private backend configuration', async () => {
		expect(await getAnalyticsReport(new URLSearchParams())).toMatchObject({
			configured: false,
			totalViews: 0,
			series: [],
			pages: [],
			error: expect.any(String)
		});
	});
	it('maps actual aggregates and fills absent daily buckets with zero', async () => {
		const { rpc, abortSignal } = backend({
			totalViews: 3,
			distinctPages: 1,
			countryCount: 1,
			cityCount: 1,
			series: [],
			pages: [{ key: '/writing', label: '/writing', views: 3 }],
			countries: [],
			cities: [],
			referrers: [],
			devices: [],
			browsers: []
		});
		const report = await getAnalyticsReport(new URLSearchParams('period=7d'));
		expect(report).toMatchObject({
			configured: true,
			totalViews: 3,
			pages: [{ key: '/writing', label: '/writing', views: 3 }]
		});
		expect(report.series).toHaveLength(7);
		expect(rpc).toHaveBeenCalledWith('get_site_analytics_report', {
			p_from: report.from,
			p_to: report.to
		});
		expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
	});
	it('contains malformed and failed database responses without inventing a report', async () => {
		backend(null, { code: 'database_down' });
		expect(await getAnalyticsReport(new URLSearchParams())).toMatchObject({
			configured: true,
			error: expect.any(String),
			totalViews: 0,
			pages: []
		});
		backend({ totalViews: -1, series: [] });
		expect((await getAnalyticsReport(new URLSearchParams())).error).toBeTruthy();
	});
	it('times out and aborts a hung report read', async () => {
		vi.useFakeTimers();
		try {
			let signal: AbortSignal | undefined;
			mocks.createNotesAdminClient.mockReturnValue({
				rpc: () => ({
					abortSignal: (value: AbortSignal) => {
						signal = value;
						return new Promise(() => {});
					}
				})
			});
			const pending = getAnalyticsReport(new URLSearchParams());
			await vi.advanceTimersByTimeAsync(5000);
			expect((await pending).error).toBeTruthy();
			expect(signal?.aborted).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
	it('writes only minimized dimensions and maps durable admission outcomes', async () => {
		const dimensions = {
			path: '/',
			country: 'IN',
			region: 'WB',
			city: 'Calcutta',
			referrer: 'Google',
			device: 'Mobile',
			browser: 'Safari'
		};
		const { rpc } = backend('accepted');
		expect(await recordAnalyticsPageView(dimensions, 'fake-expiring-key')).toBe('accepted');
		expect(rpc).toHaveBeenCalledWith('record_site_page_view', {
			p_path: '/',
			p_country: 'IN',
			p_region: 'WB',
			p_city: 'Calcutta',
			p_referrer: 'Google',
			p_device: 'Mobile',
			p_browser: 'Safari',
			p_rate_key: 'fake-expiring-key'
		});
		backend('rate_limited');
		expect(await recordAnalyticsPageView(dimensions, 'key')).toBe('rate_limited');
		backend(null, { code: 'failure' });
		expect(await recordAnalyticsPageView(dimensions, 'key')).toBe('unavailable');
	});
});
