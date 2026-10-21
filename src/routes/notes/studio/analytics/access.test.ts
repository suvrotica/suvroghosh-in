import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import type { AnalyticsReport } from '$lib/analytics/types';
import { analyticsCsv } from './export/csv';

const mocked = vi.hoisted(() => ({
	report: vi.fn(),
	configured: vi.fn(),
	resolveUser: vi.fn(),
	env: { NOTES_OWNER_USER_ID: 'owner' } as Record<string, string>
}));

vi.mock('$env/dynamic/private', () => ({ env: mocked.env }));
vi.mock('$lib/server/notes/supabase', () => ({
	notesBackendConfigured: mocked.configured,
	resolveNotesUser: mocked.resolveUser,
	createNotesServerClient: vi.fn()
}));
vi.mock('$lib/server/analytics/repository', () => ({ getAnalyticsReport: mocked.report }));

function sampleReport(): AnalyticsReport {
	return {
		configured: true,
		from: '2026-10-16',
		to: '2026-10-22',
		timezone: 'Asia/Kolkata',
		generatedAt: '2026-10-22T08:00:00.000Z',
		totalViews: 4,
		distinctPages: 1,
		countryCount: 1,
		cityCount: 1,
		retentionDays: 180,
		series: [{ date: '2026-10-22', views: 4 }],
		pages: [{ key: '/', label: '/', views: 4 }],
		countries: [{ key: 'IN', label: 'India', views: 4 }],
		cities: [{ key: 'IN|WB|Kolkata', label: 'Kolkata, WB, India', views: 4 }],
		referrers: [],
		devices: [],
		browsers: []
	};
}

function event(userId: string | null, suffix = '') {
	const url = new URL(`https://suvroghosh.in/notes/studio/analytics${suffix}`);
	return {
		url,
		request: new Request(url),
		locals: { user: userId ? { id: userId } : null, supabase: { auth: { signOut: vi.fn() } } },
		setHeaders: vi.fn()
	} as unknown as RequestEvent;
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocked.env.NOTES_OWNER_USER_ID = 'owner';
	mocked.configured.mockReturnValue(true);
	mocked.resolveUser.mockResolvedValue(null);
	mocked.report.mockResolvedValue(sampleReport());
});

describe('owner analytics page', () => {
	it('redirects unauthenticated readers before loading report data', async () => {
		const { load } = await import('./+page.server');
		await expect(load(event(null) as Parameters<typeof load>[0])).rejects.toMatchObject({
			status: 303,
			location: '/notes/sign-in?returnTo=%2Fnotes%2Fstudio%2Fanalytics'
		});
		expect(mocked.report).not.toHaveBeenCalled();
	});

	it('rejects a signed-in user who is not the configured owner', async () => {
		const { load } = await import('./+page.server');
		await expect(load(event('other') as Parameters<typeof load>[0])).rejects.toMatchObject({
			status: 404
		});
		expect(mocked.report).not.toHaveBeenCalled();
	});

	it('passes bounded query options to the reporting repository only for the owner', async () => {
		const { load } = await import('./+page.server');
		const result = await load(event('owner', '?period=7d') as Parameters<typeof load>[0]);
		expect(result).toMatchObject({ report: { totalViews: 4 }, period: '7d' });
		expect(mocked.report.mock.calls[0][0].get('period')).toBe('7d');
	});

	it('limits repeated owner queries without touching reporting data on rejection', async () => {
		const { load } = await import('./+page.server');
		for (let index = 0; index < 10; index++)
			await load(event('owner') as Parameters<typeof load>[0]);
		await expect(load(event('owner') as Parameters<typeof load>[0])).rejects.toMatchObject({
			status: 429
		});
		expect(mocked.report).toHaveBeenCalledTimes(10);
	});
});

describe('owner analytics export', () => {
	it.each([
		[null, 401],
		['other', 404]
	] as const)('rejects %s independently with private response headers', async (userId, status) => {
		const { GET } = await import('./export/+server');
		const response = await GET(event(userId) as Parameters<typeof GET>[0]);
		expect(response.status).toBe(status);
		expect(response.headers.get('cache-control')).toContain('private');
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(response.headers.get('x-robots-tag')).toContain('noindex');
		expect(mocked.report).not.toHaveBeenCalled();
	});

	it('never exports a backend error as an apparently successful empty report', async () => {
		const { GET } = await import('./export/+server');
		mocked.report.mockResolvedValue({ ...sampleReport(), error: 'Unavailable' });
		const response = await GET(event('owner') as Parameters<typeof GET>[0]);
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toContain('no-store');
	});

	it('does not expose unexpected backend details in error responses', async () => {
		const { GET } = await import('./export/+server');
		mocked.report.mockRejectedValue(new Error('private connection secret'));
		const response = await GET(event('owner') as Parameters<typeof GET>[0]);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('secret');
	});

	it('exports real report counters with private download headers', async () => {
		const { GET } = await import('./export/+server');
		const response = await GET(event('owner') as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
		expect(response.headers.get('content-disposition')).toContain(
			'fieldbook-2026-10-16-2026-10-22.csv'
		);
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(await response.text()).toContain('"Kolkata, WB, India","4"');
	});

	it('rate limits report exports', async () => {
		const { GET } = await import('./export/+server');
		for (let index = 0; index < 10; index++)
			expect((await GET(event('owner') as Parameters<typeof GET>[0])).status).toBe(200);
		const response = await GET(event('owner') as Parameters<typeof GET>[0]);
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBeTruthy();
		expect(mocked.report).toHaveBeenCalledTimes(10);
	});
});

describe('aggregate CSV encoding', () => {
	it('quotes commas and neutralises spreadsheet formulas and control prefixes', () => {
		const report = sampleReport();
		report.pages = [
			'=SUM(1,2)',
			'\t=HYPERLINK("x")',
			'  +1+1',
			'@command',
			'-1+1',
			'safe,"quoted"'
		].map((label) => ({ key: label, label, views: 2 }));
		const csv = analyticsCsv(report);
		expect(csv).toContain('"\'=SUM(1,2)"');
		expect(csv).toContain('"\'\t=HYPERLINK(""x"")"');
		expect(csv).toContain('"\'  +1+1"');
		expect(csv).toContain('"\'@command"');
		expect(csv).toContain('"\'-1+1"');
		expect(csv).toContain('"safe,""quoted"""');
		expect(csv.startsWith('\uFEFF')).toBe(true);
		expect(csv).toContain('\r\n');
	});
});
