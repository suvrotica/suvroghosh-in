import { mount } from 'svelte';
import '@fontsource-variable/source-serif-4/standard.css';
import '@fontsource-variable/roboto/standard.css';
import '../src/app.css';
import AnalyticsDashboard from '../src/lib/components/analytics/AnalyticsDashboard.svelte';
import type { AnalyticsReport } from '../src/lib/analytics/types';

// Isolated visual-test data. This harness is not a SvelteKit route, and does not
// bypass owner authentication or introduce a demo mode in the application.
const series = [
	42, 56, 38, 72, 63, 51, 81, 96, 67, 89, 104, 78, 86, 119, 94, 108, 92, 128, 116, 97, 134, 107,
	142, 126, 101, 119, 158, 137, 112, 146
].map((views, index) => ({
	date: new Date(Date.UTC(2026, 8, 23 + index)).toISOString().slice(0, 10),
	views
}));
const ranking = (values: [string, number][]) =>
	values.map(([label, views]) => ({ key: label, label, views }));
const report: AnalyticsReport = {
	configured: true,
	from: '2026-09-23',
	to: '2026-10-22',
	timezone: 'Asia/Kolkata',
	generatedAt: '2026-10-22T09:42:00Z',
	retentionDays: 180,
	totalViews: series.reduce((sum, entry) => sum + entry.views, 0),
	distinctPages: 47,
	countryCount: 18,
	cityCount: 63,
	series,
	pages: ranking([
		['/blog/raw-thoughts/the-space-between-two-thoughts', 642],
		['/blog/visualizations/the-profile-that-knows-almost-nothing-about-you', 514],
		['/', 478],
		['/blog/calcutta/a-small-city-within-the-city', 291],
		['/notes', 236],
		['/blog/visualizations/two-calendars', 184]
	]),
	countries: ranking([
		['India', 1718],
		['United Kingdom', 418],
		['United States', 332],
		['Bangladesh', 191],
		['Unknown', 114],
		['Germany', 83]
	]),
	cities: ranking([
		['Kolkata · West Bengal · India', 984],
		['London · England · United Kingdom', 285],
		['Bengaluru · Karnataka · India', 218],
		['Mumbai · Maharashtra · India', 174],
		['Dhaka · Dhaka Division · Bangladesh', 162],
		['Unknown', 114]
	]),
	referrers: ranking([
		['Direct / unknown', 1214],
		['Google', 683],
		['LinkedIn', 412],
		['Substack', 245],
		['X', 188]
	]),
	devices: ranking([
		['Mobile', 1627],
		['Desktop', 1151],
		['Tablet', 99]
	]),
	browsers: ranking([
		['Chrome', 1584],
		['Safari', 729],
		['Firefox', 341],
		['Edge', 223]
	])
};

const params = new URLSearchParams(location.search);
const theme = params.get('theme');
if (theme && ['paper', 'light', 'night', 'high-contrast'].includes(theme)) {
	document.documentElement.dataset.theme = theme;
}
const state = params.get('state');
if (state === 'empty') {
	Object.assign(report, {
		totalViews: 0,
		distinctPages: 0,
		countryCount: 0,
		cityCount: 0,
		series: series.map((entry) => ({ ...entry, views: 0 })),
		pages: [],
		countries: [],
		cities: [],
		referrers: [],
		devices: [],
		browsers: []
	});
} else if (state === 'unconfigured') {
	report.configured = false;
} else if (state === 'error') {
	report.error = 'Fixture backend unavailable';
}
const target = document.getElementById('dashboard-fixture');
if (target) mount(AnalyticsDashboard, { target, props: { report } });
