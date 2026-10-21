import type { AnalyticsReport } from '$lib/analytics/types';

/** Quote every cell and neutralise spreadsheet formulas, including control prefixes. */
function cell(value: string | number) {
	let text = String(value).replaceAll('\u0000', '');
	if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}

export function analyticsCsv(report: AnalyticsReport) {
	const rows: (string | number)[][] = [
		['section', 'key', 'label', 'views'],
		['report', 'from', report.from, ''],
		['report', 'to', report.to, ''],
		['report', 'timezone', report.timezone, ''],
		['report', 'generated_at', report.generatedAt, ''],
		['report', 'retention_days', report.retentionDays, ''],
		['summary', 'page_views', 'Consented recorded page views', report.totalViews],
		['summary', 'distinct_pages', 'Distinct viewed pages', report.distinctPages],
		['summary', 'countries', 'Known countries represented', report.countryCount],
		['summary', 'cities', 'Known cities represented', report.cityCount]
	];
	for (const item of report.series) rows.push(['daily', item.date, item.date, item.views]);
	for (const dimension of [
		'pages',
		'countries',
		'cities',
		'referrers',
		'devices',
		'browsers'
	] as const) {
		for (const item of report[dimension]) {
			rows.push([dimension, item.key, item.label, item.views]);
		}
	}
	return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
