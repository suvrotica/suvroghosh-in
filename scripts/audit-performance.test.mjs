import assert from 'node:assert/strict';
import test from 'node:test';

import {
	browserProbeBlockReason,
	buildLighthouseInvocation,
	median,
	parseArguments,
	REPRESENTATIVE_PAGES,
	rowsToCsv,
	summarizeLighthouse,
	TELEMETRY_BLOCK_PATTERNS,
	verifyTelemetryBlocking
} from './audit-performance.mjs';

test('browser probes block telemetry and every non-read request method', () => {
	assert.equal(
		browserProbeBlockReason('https://www.suvroghosh.in/_vercel/insights/event', 'POST'),
		'vercel_telemetry'
	);
	assert.equal(
		browserProbeBlockReason('https://www.suvroghosh.in/api/tts/chatterbox', 'POST'),
		'non_read_request'
	);
	assert.equal(
		browserProbeBlockReason('https://outside.example/collect', 'DELETE'),
		'non_read_request'
	);
	assert.equal(browserProbeBlockReason('https://outside.example/library.js', 'GET'), '');
	assert.equal(browserProbeBlockReason('https://www.suvroghosh.in/', 'HEAD'), '');
});

test('the default matrix declares the eight required representative page types', () => {
	assert.equal(REPRESENTATIVE_PAGES.length, 8);
	assert.deepEqual(
		REPRESENTATIVE_PAGES.map((page) => page.pageType),
		[
			'homepage',
			'resume',
			'consulting',
			'normal_long_article',
			'media_heavy_article',
			'archive_page',
			'lightweight_visualization',
			'heaviest_visualization'
		]
	);
});

test('default arguments require exactly three serial lab runs per page and profile', () => {
	const options = parseArguments([]);
	assert.equal(options.runs, 3);
	assert.equal(options.cooldownMs, 2_000);
	assert.equal(options.origin, 'https://www.suvroghosh.in');
});

test('every Lighthouse invocation carries every telemetry block pattern exactly once', () => {
	const options = parseArguments([]);
	const invocation = buildLighthouseInvocation({
		options,
		chromePort: 9222,
		page: REPRESENTATIVE_PAGES[0],
		profile: { id: 'mobile', lighthouseArguments: [] },
		rawPath: 'private-report.json'
	});
	for (const pattern of TELEMETRY_BLOCK_PATTERNS) {
		assert.equal(
			invocation.arguments.filter((argument) => argument === `--blocked-url-patterns=${pattern}`)
				.length,
			1
		);
	}
	assert.equal(
		invocation.arguments.filter((argument) => argument.startsWith('--blocked-url-patterns='))
			.length,
		TELEMETRY_BLOCK_PATTERNS.length
	);
});

test('telemetry verification requires configured patterns and rejects a completed endpoint', () => {
	const base = {
		configSettings: { blockedUrlPatterns: [...TELEMETRY_BLOCK_PATTERNS] },
		audits: {
			'network-requests': {
				details: {
					items: [
						{
							url: 'https://www.suvroghosh.in/_vercel/insights/script.js',
							statusCode: -1,
							failed: true
						}
					]
				}
			}
		}
	};
	assert.equal(verifyTelemetryBlocking(base).verified, true);
	const completed = structuredClone(base);
	completed.audits['network-requests'].details.items[0].statusCode = 200;
	assert.equal(verifyTelemetryBlocking(completed).verified, false);
	const missing = structuredClone(base);
	missing.configSettings.blockedUrlPatterns.pop();
	assert.equal(verifyTelemetryBlocking(missing).verified, false);
});

test('median handles odd, even, missing, and non-finite measurements', () => {
	assert.equal(median([3, 1, 2]), 2);
	assert.equal(median([4, 1, 3, 2]), 2.5);
	assert.equal(median(['', Number.NaN]), '');
	assert.equal(median([Number.POSITIVE_INFINITY, 8]), 8);
});

test('Lighthouse summary extracts performance, transfer, and accessibility evidence', () => {
	const lhr = {
		fetchTime: '2026-08-06T07:00:00.000Z',
		lighthouseVersion: '13.4.1',
		userAgent: 'HeadlessChrome/151',
		finalDisplayedUrl: 'https://www.suvroghosh.in/',
		categories: {
			performance: { score: 0.91 },
			accessibility: { score: 0.98, auditRefs: [{ id: 'button-name' }] }
		},
		configSettings: {
			blockedUrlPatterns: [...TELEMETRY_BLOCK_PATTERNS],
			throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 }
		},
		audits: {
			'largest-contentful-paint': { numericValue: 2400 },
			'total-blocking-time': { numericValue: 120 },
			'cumulative-layout-shift': { numericValue: 0.01999 },
			'server-response-time': { numericValue: 410 },
			'first-contentful-paint': { numericValue: 1250 },
			'speed-index': { numericValue: 1900 },
			'resource-summary': {
				details: {
					items: [
						{ resourceType: 'total', transferSize: 600000 },
						{ resourceType: 'script', transferSize: 210000 },
						{ resourceType: 'image', transferSize: 190000 },
						{ resourceType: 'font', transferSize: 90000 }
					]
				}
			},
			'unused-javascript': { details: { overallSavingsBytes: 34000 } },
			'mainthread-work-breakdown': {
				numericValue: 520,
				details: { items: [{ groupLabel: 'Script Evaluation', duration: 240 }] }
			},
			'bootup-time': { numericValue: 310 },
			'long-tasks': { details: { items: [{ duration: 85 }, { duration: 61 }] } },
			'layout-shifts': { details: { items: [{ score: 0.01 }] } },
			'network-requests': {
				details: {
					items: [
						{
							url: 'https://www.suvroghosh.in/_vercel/insights/script.js',
							statusCode: -1,
							failed: true
						}
					]
				}
			},
			'button-name': { score: 0, details: { items: [{ node: {} }] } }
		}
	};

	const row = summarizeLighthouse(lhr, {
		page: REPRESENTATIVE_PAGES[0],
		profile: { id: 'mobile' },
		run: 1,
		origin: 'https://www.suvroghosh.in',
		exitCode: 0
	});
	assert.equal(row.performance_score_0_100, 91);
	assert.equal(row.lcp_ms, 2400);
	assert.equal(row.cls, 0.02);
	assert.equal(row.javascript_transfer_bytes, 210000);
	assert.equal(row.long_task_count, 2);
	assert.equal(row.max_long_task_ms, 85);
	assert.equal(row.accessibility_failure_ids, 'button-name');
	assert.equal(row.telemetry_block_verified, 'YES');
	assert.equal(row.telemetry_completed_request_count, 0);
	assert.match(row.interaction_lab_proxy, /INP requires field interaction data/);
});

test('CSV serialization quotes commas, quotes, and newlines', () => {
	const csv = rowsToCsv([
		{
			page_id: 'home,primary',
			error: 'A "quoted"\nerror'
		}
	]);
	assert.match(csv, /"home,primary"/);
	assert.match(csv, /"A ""quoted""\nerror"/);
});
