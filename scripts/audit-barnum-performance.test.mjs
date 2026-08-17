import assert from 'node:assert/strict';
import test from 'node:test';

import { TELEMETRY_BLOCK_PATTERNS } from './audit-performance.mjs';
import {
	BARNUM_LIGHTHOUSE_RUNS,
	BARNUM_LIGHTHOUSE_VERSION,
	BARNUM_PATHNAME,
	buildBarnumLighthouseInvocation,
	canAcceptBarnumLighthouseCleanupExit,
	evaluateBarnumLighthouseReports,
	inspectBarnumServedHtml,
	isBarnumLighthouseCleanupOnlyExit,
	parseBarnumPerformanceArguments
} from './audit-barnum-performance.mjs';

function passingReport(overrides = {}) {
	return {
		lighthouseVersion: BARNUM_LIGHTHOUSE_VERSION,
		configSettings: {
			formFactor: 'mobile',
			throttlingMethod: 'simulate',
			screenEmulation: { mobile: true },
			throttling: { rttMs: 150, throughputKbps: 1_638.4, cpuSlowdownMultiplier: 4 },
			blockedUrlPatterns: [...TELEMETRY_BLOCK_PATTERNS]
		},
		categories: {
			performance: { score: 0.88 },
			accessibility: { score: 1 }
		},
		audits: {
			'largest-contentful-paint': { numericValue: 2_500 },
			'total-blocking-time': { numericValue: 120 },
			'cumulative-layout-shift': { numericValue: 0.03 },
			'resource-summary': {
				details: {
					items: [
						{ resourceType: 'total', transferSize: 450 * 1024 },
						{ resourceType: 'script', transferSize: 120 * 1024 }
					]
				}
			},
			'network-requests': { details: { items: [] } }
		},
		...overrides
	};
}

test('the command is pinned to three telemetry-blocked throttled-mobile Barnum runs', () => {
	const options = parseBarnumPerformanceArguments(['--origin', 'http://localhost:4173']);
	const tempDirectory = 'C:\\controlled-audit-temp\\run-1';
	const invocation = buildBarnumLighthouseInvocation({
		...options,
		outputPath: 'barnum-report.json',
		tempDirectory
	});
	const joined = invocation.arguments.join(' ');

	assert.equal(BARNUM_LIGHTHOUSE_RUNS, 3);
	assert.match(
		joined,
		new RegExp(`lighthouse@${BARNUM_LIGHTHOUSE_VERSION.replaceAll('.', '\\.')}`)
	);
	assert.match(joined, new RegExp(`${BARNUM_PATHNAME}$|${BARNUM_PATHNAME} `));
	assert.match(joined, /--form-factor=mobile/u);
	assert.match(joined, /--throttling-method=simulate/u);
	for (const pattern of TELEMETRY_BLOCK_PATTERNS) {
		assert.ok(invocation.arguments.includes(`--blocked-url-patterns=${pattern}`));
	}
	assert.equal(invocation.environment.TEMP, tempDirectory);
	assert.equal(invocation.environment.TMP, tempDirectory);
	assert.throws(
		() => parseBarnumPerformanceArguments(['--origin', 'https://www.suvroghosh.in']),
		/localhost/u
	);
});

test('only a controlled Chrome Launcher cleanup EPERM can reuse a fresh valid report', () => {
	const tempDirectory = 'C:\\controlled-audit-temp\\run-1';
	const cleanupFailure = {
		code: 1,
		timedOut: false,
		stdout: '',
		stderr: [
			"Error: EPERM: operation not permitted, unlink 'C:\\controlled-audit-temp\\run-1\\lighthouse.12345678\\Default\\History'",
			'at Launcher.destroyTmp (file:///cache/node_modules/chrome-launcher/dist/chrome-launcher.js:367:9)'
		].join('\n')
	};

	assert.equal(isBarnumLighthouseCleanupOnlyExit(cleanupFailure, tempDirectory), true);
	assert.equal(
		isBarnumLighthouseCleanupOnlyExit(
			{
				...cleanupFailure,
				stderr: [
					"Runtime error encountered: EPERM, Permission denied: \\\\?\\C:\\controlled-audit-temp\\run-1\\lighthouse.87654321 '\\\\?\\C:\\controlled-audit-temp\\run-1\\lighthouse.87654321'",
					'at Launcher.destroyTmp (file:///cache/node_modules/chrome-launcher/dist/chrome-launcher.js:367:9)'
				].join('\n')
			},
			tempDirectory
		),
		true
	);
	assert.equal(
		canAcceptBarnumLighthouseCleanupExit({
			result: cleanupFailure,
			tempDirectory,
			report: passingReport(),
			reportIsFresh: true
		}),
		true
	);
	assert.equal(
		canAcceptBarnumLighthouseCleanupExit({
			result: cleanupFailure,
			tempDirectory,
			report: passingReport({ runtimeError: { code: 'PAGE_HUNG', message: 'Page hung.' } }),
			reportIsFresh: true
		}),
		false
	);
	assert.equal(
		canAcceptBarnumLighthouseCleanupExit({
			result: cleanupFailure,
			tempDirectory,
			report: passingReport(),
			reportIsFresh: false
		}),
		false
	);
});

test('cleanup recovery rejects generic failures and EPERM outside the controlled run root', () => {
	const tempDirectory = 'C:\\controlled-audit-temp\\run-1';
	const unrelatedEperm = {
		code: 1,
		timedOut: false,
		stdout: '',
		stderr: [
			"Error: EPERM: operation not permitted, unlink 'C:\\Users\\person\\AppData\\Local\\Temp\\lighthouse.12345678\\Default\\History'",
			'at Launcher.destroyTmp (file:///cache/node_modules/chrome-launcher/dist/chrome-launcher.js:367:9)'
		].join('\n')
	};
	const runtimeFailure = {
		code: 1,
		timedOut: false,
		stdout: '',
		stderr: 'Runtime error encountered: The page did not paint.'
	};

	assert.equal(isBarnumLighthouseCleanupOnlyExit(unrelatedEperm, tempDirectory), false);
	assert.equal(isBarnumLighthouseCleanupOnlyExit(runtimeFailure, tempDirectory), false);
	assert.equal(
		isBarnumLighthouseCleanupOnlyExit({ ...unrelatedEperm, code: 67 }, tempDirectory),
		false
	);
});

test('the release gate evaluates deterministic medians and rejects invalid mobile telemetry', () => {
	const passing = Array.from({ length: BARNUM_LIGHTHOUSE_RUNS }, () => passingReport());
	assert.equal(evaluateBarnumLighthouseReports(passing).passed, true);

	const failing = [
		passingReport(),
		passingReport({
			configSettings: {
				formFactor: 'desktop',
				throttlingMethod: 'provided',
				screenEmulation: { mobile: false },
				throttling: { rttMs: 0, cpuSlowdownMultiplier: 1 },
				blockedUrlPatterns: []
			},
			categories: {
				performance: { score: 0.4 },
				accessibility: { score: 0.8 }
			}
		}),
		passingReport({
			categories: {
				performance: { score: 0.4 },
				accessibility: { score: 0.8 }
			}
		})
	];
	const evaluation = evaluateBarnumLighthouseReports(failing);
	assert.equal(evaluation.passed, false);
	assert.match(evaluation.failures.join('\n'), /formFactor was not mobile/u);
	assert.match(evaluation.failures.join('\n'), /Telemetry blocking failed/u);
	assert.match(evaluation.failures.join('\n'), /performanceScore median/u);
	assert.match(evaluation.failures.join('\n'), /accessibilityScore median/u);
});

test('served HTML must contain the SSR lab and no unrelated visualization marker', () => {
	assert.equal(
		inspectBarnumServedHtml(
			'<main><section data-testid="barnum-lab">Useful poster</section></main>'
		).passed,
		true
	);
	const failure = inspectBarnumServedHtml(
		'<link rel="stylesheet" href="/assets/double-pendulum.css"><main></main>'
	);
	assert.equal(failure.passed, false);
	assert.deepEqual(failure.forbiddenMarkers, ['double-pendulum']);
});
