import { error } from '@sveltejs/kit';
import type { AnalyticsRanking, AnalyticsReport } from '$lib/analytics/types';
import { withDeadline } from '$lib/server/http/body';
import { createNotesAdminClient } from '$lib/server/notes/supabase';
import {
	addDays,
	ANALYTICS_RETENTION_DAYS,
	ANALYTICS_TIMEZONE,
	reportingDay,
	type Geography
} from './policy';

export function analyticsDateRange(params: URLSearchParams, now = new Date()) {
	const today = reportingDay(now);
	const oldest = addDays(today, 1 - ANALYTICS_RETENTION_DAYS);
	const period = params.get('period') ?? '30d';
	let from: string;
	let to = today;
	if (period === 'custom') {
		from = params.get('from') ?? '';
		to = params.get('to') ?? '';
	} else if (period === 'today') from = today;
	else if (['7d', '30d', '90d'].includes(period))
		from = addDays(today, 1 - Number(period.slice(0, -1)));
	else throw error(400, 'Choose a supported analytics date range.');
	const validDay = (day: string) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
		const date = new Date(`${day}T00:00:00Z`);
		return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
	};
	if (!validDay(from) || !validDay(to) || from > to || from < oldest || to > today) {
		throw error(400, `Choose valid dates within the last ${ANALYTICS_RETENTION_DAYS} days.`);
	}
	return { from, to };
}

type AggregatePayload = Pick<
	AnalyticsReport,
	| 'totalViews'
	| 'distinctPages'
	| 'countryCount'
	| 'cityCount'
	| 'series'
	| 'pages'
	| 'countries'
	| 'cities'
	| 'referrers'
	| 'devices'
	| 'browsers'
>;

function emptyReport(range: { from: string; to: string }): AnalyticsReport {
	return {
		configured: false,
		...range,
		timezone: ANALYTICS_TIMEZONE,
		generatedAt: new Date().toISOString(),
		retentionDays: ANALYTICS_RETENTION_DAYS,
		totalViews: 0,
		distinctPages: 0,
		countryCount: 0,
		cityCount: 0,
		series: [],
		pages: [],
		countries: [],
		cities: [],
		referrers: [],
		devices: [],
		browsers: []
	};
}

function count(value: unknown) {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
		throw new Error('Invalid aggregate count');
	return value;
}

function rankings(value: unknown): AnalyticsRanking[] {
	if (!Array.isArray(value) || value.length > 200) throw new Error('Invalid aggregate ranking');
	return value.map((row) => {
		if (
			!row ||
			typeof row.key !== 'string' ||
			row.key.length > 512 ||
			typeof row.label !== 'string' ||
			row.label.length > 512
		)
			throw new Error('Invalid aggregate label');
		return { key: row.key, label: row.label, views: count(row.views) };
	});
}

export async function getAnalyticsReport(params: URLSearchParams): Promise<AnalyticsReport> {
	const range = analyticsDateRange(params);
	const report = emptyReport(range);
	const client = createNotesAdminClient();
	if (!client)
		return {
			...report,
			error:
				'Analytics storage is not configured. Complete the private Supabase setup and analytics migration.'
		};
	try {
		const { data, error: readError } = await withDeadline(
			async (signal) =>
				await client
					.rpc('get_site_analytics_report', { p_from: range.from, p_to: range.to })
					.abortSignal(signal),
			5000
		);
		if (readError || !data || typeof data !== 'object')
			throw new Error('Aggregate read unavailable');
		const aggregate = data as AggregatePayload;
		const knownSeries = new Map<string, number>();
		if (!Array.isArray(aggregate.series) || aggregate.series.length > ANALYTICS_RETENTION_DAYS)
			throw new Error('Invalid aggregate series');
		for (const row of aggregate.series) {
			if (typeof row.date !== 'string' || row.date < range.from || row.date > range.to)
				throw new Error('Invalid series day');
			knownSeries.set(row.date, count(row.views));
		}
		const series: AnalyticsReport['series'] = [];
		for (let day = range.from; day <= range.to; day = addDays(day, 1))
			series.push({ date: day, views: knownSeries.get(day) ?? 0 });
		return {
			...report,
			configured: true,
			totalViews: count(aggregate.totalViews),
			distinctPages: count(aggregate.distinctPages),
			countryCount: count(aggregate.countryCount),
			cityCount: count(aggregate.cityCount),
			series,
			pages: rankings(aggregate.pages),
			countries: rankings(aggregate.countries),
			cities: rankings(aggregate.cities),
			referrers: rankings(aggregate.referrers),
			devices: rankings(aggregate.devices),
			browsers: rankings(aggregate.browsers)
		};
	} catch {
		return {
			...report,
			configured: true,
			error:
				'Analytics reports are temporarily unavailable. Check the analytics migration and database connection.'
		};
	}
}

export type PageViewDimensions = Geography & {
	path: string;
	referrer: string;
	device: string;
	browser: string;
};

/** Atomic durable rate checks and all independent daily rollups run in one DB transaction. */
export async function recordAnalyticsPageView(dimensions: PageViewDimensions, rateKey: string) {
	const client = createNotesAdminClient();
	if (!client) return 'unavailable' as const;
	try {
		return await withDeadline(async (signal) => {
			const { data, error: writeError } = await client
				.rpc('record_site_page_view', {
					p_rate_key: rateKey,
					p_path: dimensions.path,
					p_country: dimensions.country,
					p_region: dimensions.region,
					p_city: dimensions.city,
					p_referrer: dimensions.referrer,
					p_device: dimensions.device,
					p_browser: dimensions.browser
				})
				.abortSignal(signal);
			return !writeError && data === 'accepted'
				? ('accepted' as const)
				: !writeError && data === 'rate_limited'
					? ('rate_limited' as const)
					: ('unavailable' as const);
		}, 4000);
	} catch {
		return 'unavailable' as const;
	}
}
