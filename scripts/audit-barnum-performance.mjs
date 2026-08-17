#!/usr/bin/env node

/**
 * A focused, reproducible Lighthouse release gate for the Barnum laboratory.
 *
 * Run this against a local production preview. The script deliberately refuses
 * remote origins, runs the pinned Lighthouse mobile profile three times, blocks
 * telemetry, verifies the effective throttling in every report, and evaluates
 * median thresholds rather than trusting one unusually fast navigation.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { TELEMETRY_BLOCK_PATTERNS, verifyTelemetryBlocking } from './audit-performance.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_ORIGIN = 'http://127.0.0.1:4173';
const DEFAULT_CHROME_PATH =
	process.platform === 'win32'
		? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
		: 'google-chrome';

export const BARNUM_PATHNAME =
	'/blog/visualizations/the-profile-that-knows-almost-nothing-about-you';
export const BARNUM_LIGHTHOUSE_VERSION = '13.4.1';
export const BARNUM_LIGHTHOUSE_RUNS = 3;
export const BARNUM_LIGHTHOUSE_THRESHOLDS = Object.freeze({
	performanceScore: 0.75,
	accessibilityScore: 0.95,
	largestContentfulPaintMs: 4_000,
	totalBlockingTimeMs: 400,
	cumulativeLayoutShift: 0.1,
	totalTransferBytes: 1_000 * 1024,
	javascriptTransferBytes: 300 * 1024
});

export const FORBIDDEN_HTML_ASSET_MARKERS = Object.freeze([
	'double-pendulum',
	'living-aperture',
	'neuron-zoo',
	'hello-fragment',
	'first-shader',
	'fractal-atlas'
]);

const LIGHTHOUSE_TEMP_DIRECTORY_NAME = /^\/lighthouse\.\d{8}(?:\/|\s|$|['"])/iu;
const LIGHTHOUSE_CLEANUP_EPERM = /\bEPERM\b[^\r\n]*(?:operation not permitted|permission denied)/iu;
const LIGHTHOUSE_CLEANUP_STACK = /Launcher\.destroyTmp/iu;
const CHROME_LAUNCHER_STACK = /chrome-launcher\/dist\/chrome-launcher\.js/iu;

function usage() {
	return `Usage: node scripts/audit-barnum-performance.mjs [options]

Prerequisite:
  Build the site, then serve the production output locally on 127.0.0.1:4173.

Options:
  --origin URL        Local preview origin (default ${DEFAULT_ORIGIN})
  --chrome-path PATH  Chrome/Chromium executable
  --dry-run           Print the pinned command matrix without navigating
  --help              Show this help
`;
}

export function parseBarnumPerformanceArguments(argv) {
	const options = {
		origin: DEFAULT_ORIGIN,
		chromePath: process.env.CHROME_PATH || DEFAULT_CHROME_PATH,
		dryRun: false,
		help: false
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const next = () => {
			index += 1;
			if (index >= argv.length) throw new Error(`${argument} requires a value.`);
			return argv[index];
		};

		if (argument === '--origin') options.origin = next();
		else if (argument === '--chrome-path') options.chromePath = next();
		else if (argument === '--dry-run') options.dryRun = true;
		else if (argument === '--help') options.help = true;
		else throw new Error(`Unknown argument: ${argument}`);
	}

	const origin = new URL(options.origin);
	if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname)) {
		throw new Error('--origin must be an HTTP localhost or 127.0.0.1 production preview.');
	}
	if (origin.pathname !== '/' || origin.search || origin.hash) {
		throw new Error('--origin must contain only a local origin, without a path, query, or hash.');
	}
	options.origin = origin.origin;
	options.outputDirectory = path.join(
		REPOSITORY_ROOT,
		'.audit-private',
		'barnum-lab',
		'lighthouse-mobile'
	);
	return options;
}

function npxInvocationPrefix() {
	const npxCliPath =
		process.platform === 'win32'
			? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
			: null;
	return {
		command: npxCliPath ? process.execPath : 'npx',
		arguments: npxCliPath ? [npxCliPath] : []
	};
}

export function buildBarnumLighthouseInvocation({ origin, outputPath, chromePath, tempDirectory }) {
	const npx = npxInvocationPrefix();
	const environment = { ...process.env, CHROME_PATH: chromePath };
	if (tempDirectory) {
		environment.TEMP = tempDirectory;
		environment.TMP = tempDirectory;
	}
	return {
		command: npx.command,
		arguments: [
			...npx.arguments,
			'--yes',
			`lighthouse@${BARNUM_LIGHTHOUSE_VERSION}`,
			new URL(BARNUM_PATHNAME, origin).href,
			'--quiet',
			'--only-categories=performance,accessibility',
			'--form-factor=mobile',
			'--throttling-method=simulate',
			...TELEMETRY_BLOCK_PATTERNS.map((pattern) => `--blocked-url-patterns=${pattern}`),
			'--output=json',
			`--output-path=${outputPath}`,
			'--max-wait-for-load=60000',
			'--chrome-flags=--headless=new --disable-extensions --disable-background-networking --disable-component-update --no-first-run --no-default-browser-check'
		],
		environment
	};
}

function normalizedPathText(value) {
	return String(value).replaceAll('\\', '/').toLowerCase();
}

/**
 * Chrome Launcher writes the report before killing Chrome. On Windows its final
 * synchronous profile removal can still lose a file-lock race after its own
 * retries. Recognise only that exact post-report cleanup stack, scoped to the
 * per-run temp root owned by this process.
 */
export function isBarnumLighthouseCleanupOnlyExit(result, tempDirectory) {
	if (result?.code !== 1 || result?.timedOut || result?.error || !tempDirectory) {
		return false;
	}

	const output = normalizedPathText(`${result.stderr || ''}\n${result.stdout || ''}`);
	const controlledRoot = normalizedPathText(path.resolve(tempDirectory)).replace(/\/$/u, '');
	const controlledRootIndex = output.indexOf(controlledRoot);
	const controlledPathSuffix = output.slice(controlledRootIndex + controlledRoot.length);
	return (
		controlledRootIndex >= 0 &&
		LIGHTHOUSE_TEMP_DIRECTORY_NAME.test(controlledPathSuffix) &&
		LIGHTHOUSE_CLEANUP_EPERM.test(output) &&
		LIGHTHOUSE_CLEANUP_STACK.test(output) &&
		CHROME_LAUNCHER_STACK.test(output)
	);
}

export function canAcceptBarnumLighthouseCleanupExit({
	result,
	tempDirectory,
	report,
	reportIsFresh
}) {
	return (
		reportIsFresh === true &&
		isBarnumLighthouseCleanupOnlyExit(result, tempDirectory) &&
		validateBarnumLighthouseReport(report).length === 0
	);
}

function metric(lhr, auditId) {
	const value = lhr?.audits?.[auditId]?.numericValue;
	return Number.isFinite(value) ? value : Number.NaN;
}

function resourceBytes(lhr, resourceType) {
	const value = lhr?.audits?.['resource-summary']?.details?.items?.find(
		(item) => item.resourceType === resourceType
	)?.transferSize;
	return Number.isFinite(value) ? value : Number.NaN;
}

function median(values) {
	const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
	if (ordered.length === 0) return Number.NaN;
	return ordered[Math.floor(ordered.length / 2)];
}

export function summarizeBarnumLighthouseReport(lhr) {
	return {
		performanceScore: lhr?.categories?.performance?.score ?? Number.NaN,
		accessibilityScore: lhr?.categories?.accessibility?.score ?? Number.NaN,
		largestContentfulPaintMs: metric(lhr, 'largest-contentful-paint'),
		totalBlockingTimeMs: metric(lhr, 'total-blocking-time'),
		cumulativeLayoutShift: metric(lhr, 'cumulative-layout-shift'),
		totalTransferBytes: resourceBytes(lhr, 'total'),
		javascriptTransferBytes: resourceBytes(lhr, 'script')
	};
}

export function validateBarnumLighthouseReport(lhr) {
	const failures = [];
	if (lhr?.lighthouseVersion !== BARNUM_LIGHTHOUSE_VERSION) {
		failures.push(
			`Expected Lighthouse ${BARNUM_LIGHTHOUSE_VERSION}; received ${lhr?.lighthouseVersion ?? 'unknown'}.`
		);
	}
	if (lhr?.runtimeError?.code) {
		failures.push(`Lighthouse runtime error ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);
	}
	const settings = lhr?.configSettings ?? {};
	if (settings.formFactor !== 'mobile') failures.push('Lighthouse formFactor was not mobile.');
	if (settings.throttlingMethod !== 'simulate') {
		failures.push('Lighthouse throttlingMethod was not simulate.');
	}
	if (settings.screenEmulation?.mobile !== true) {
		failures.push('Lighthouse mobile screen emulation was not active.');
	}
	if (!(settings.throttling?.rttMs >= 100)) {
		failures.push('Lighthouse network RTT was not mobile-throttled.');
	}
	if (!(settings.throttling?.cpuSlowdownMultiplier >= 4)) {
		failures.push('Lighthouse CPU slowdown was below 4x.');
	}
	const telemetry = verifyTelemetryBlocking(lhr);
	if (!telemetry.verified) {
		failures.push(
			`Telemetry blocking failed: missing=${telemetry.missingPatterns.join('|') || 'none'}; completed=${telemetry.completedCount}.`
		);
	}
	for (const [name, value] of Object.entries(summarizeBarnumLighthouseReport(lhr))) {
		if (!Number.isFinite(value)) failures.push(`Lighthouse metric ${name} was unavailable.`);
	}
	return failures;
}

export function evaluateBarnumLighthouseReports(reports) {
	const failures = [];
	if (reports.length !== BARNUM_LIGHTHOUSE_RUNS) {
		failures.push(
			`Expected exactly ${BARNUM_LIGHTHOUSE_RUNS} reports; received ${reports.length}.`
		);
	}
	for (const [index, report] of reports.entries()) {
		failures.push(
			...validateBarnumLighthouseReport(report).map((failure) => `Run ${index + 1}: ${failure}`)
		);
	}

	const summaries = reports.map(summarizeBarnumLighthouseReport);
	const medians = Object.fromEntries(
		Object.keys(BARNUM_LIGHTHOUSE_THRESHOLDS).map((metricName) => [
			metricName,
			median(summaries.map((summary) => summary[metricName]))
		])
	);
	for (const [metricName, threshold] of Object.entries(BARNUM_LIGHTHOUSE_THRESHOLDS)) {
		const actual = medians[metricName];
		const minimumMetric = metricName.endsWith('Score');
		if (!Number.isFinite(actual) || (minimumMetric ? actual < threshold : actual > threshold)) {
			failures.push(
				`${metricName} median ${Number.isFinite(actual) ? actual : 'unavailable'} must be ${minimumMetric ? '>=' : '<='} ${threshold}.`
			);
		}
	}

	return {
		passed: failures.length === 0,
		failures,
		thresholds: BARNUM_LIGHTHOUSE_THRESHOLDS,
		medians
	};
}

export function inspectBarnumServedHtml(html) {
	const lowerHtml = html.toLowerCase();
	const forbiddenMarkers = FORBIDDEN_HTML_ASSET_MARKERS.filter((marker) =>
		lowerHtml.includes(marker)
	);
	const failures = [];
	if (!/data-testid=["']barnum-lab["']/u.test(html)) {
		failures.push('The local production response did not contain the server-rendered Barnum lab.');
	}
	if (forbiddenMarkers.length > 0) {
		failures.push(
			`The served HTML mentioned unrelated visualization assets: ${forbiddenMarkers.join(', ')}.`
		);
	}
	return { passed: failures.length === 0, failures, forbiddenMarkers };
}

function runCommand(invocation, timeoutMs = 180_000) {
	return new Promise((resolve) => {
		const child = spawn(invocation.command, invocation.arguments, {
			cwd: REPOSITORY_ROOT,
			env: invocation.environment,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ ...result, stdout, stderr });
		};
		const timer = setTimeout(() => {
			child.kill();
			finish({ code: null, timedOut: true });
		}, timeoutMs);
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.once('error', (error) => finish({ code: null, timedOut: false, error }));
		child.once('close', (code) => finish({ code, timedOut: false }));
	});
}

async function assertLocalProductionResponse(options) {
	const url = new URL(BARNUM_PATHNAME, options.origin);
	let response;
	try {
		response = await fetch(url, { redirect: 'error' });
	} catch (error) {
		throw new Error(
			`Could not reach ${url.href}. Start the local production preview before running this gate: ${error.message}`,
			{ cause: error }
		);
	}
	if (!response.ok) throw new Error(`The local Barnum route returned HTTP ${response.status}.`);
	const inspection = inspectBarnumServedHtml(await response.text());
	if (!inspection.passed) throw new Error(inspection.failures.join(' '));
}

export async function runBarnumPerformanceAudit(options) {
	await assertLocalProductionResponse(options);
	fs.mkdirSync(options.outputDirectory, { recursive: true });
	const reports = [];

	for (let run = 1; run <= BARNUM_LIGHTHOUSE_RUNS; run += 1) {
		const outputPath = path.join(options.outputDirectory, `run-${run}.report.json`);
		const tempDirectory = fs.mkdtempSync(path.join(options.outputDirectory, `.run-${run}-temp-`));
		try {
			fs.rmSync(outputPath, { force: true });
			const startedAt = Date.now();
			const invocation = buildBarnumLighthouseInvocation({
				...options,
				outputPath,
				tempDirectory
			});
			const result = await runCommand(invocation);
			if (result.timedOut) throw new Error(`Lighthouse run ${run} timed out.`);

			const reportIsFresh =
				fs.existsSync(outputPath) && fs.statSync(outputPath).mtimeMs + 1_000 >= startedAt;
			let report;
			let reportReadError;
			if (reportIsFresh) {
				try {
					report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
				} catch (error) {
					reportReadError = error;
				}
			}

			if (result.code !== 0) {
				const cleanupExitAccepted = canAcceptBarnumLighthouseCleanupExit({
					result,
					tempDirectory,
					report,
					reportIsFresh
				});
				if (!cleanupExitAccepted) {
					throw new Error(
						`Lighthouse run ${run} exited with ${result.code}: ${result.error?.message || result.stderr || result.stdout}`
					);
				}
				console.warn(
					`Lighthouse run ${run} reported only a Windows profile-cleanup EPERM after writing a fresh, valid report; accepting the report.`
				);
			}
			if (!reportIsFresh) {
				throw new Error(`Lighthouse run ${run} did not produce a fresh report.`);
			}
			if (reportReadError) {
				throw new Error(`Lighthouse run ${run} produced invalid JSON: ${reportReadError.message}`, {
					cause: reportReadError
				});
			}
			reports.push(report);
			console.log(`Barnum Lighthouse mobile run ${run}/${BARNUM_LIGHTHOUSE_RUNS} complete.`);
		} finally {
			try {
				fs.rmSync(tempDirectory, {
					recursive: true,
					force: true,
					maxRetries: 12,
					retryDelay: 100
				});
			} catch (error) {
				console.warn(
					`Could not remove controlled Lighthouse temp directory ${tempDirectory}: ${error.message}`
				);
			}
		}
	}

	const evaluation = evaluateBarnumLighthouseReports(reports);
	const summaryPath = path.join(options.outputDirectory, 'summary.json');
	fs.writeFileSync(
		summaryPath,
		`${JSON.stringify(
			{
				url: new URL(BARNUM_PATHNAME, options.origin).href,
				lighthouseVersion: BARNUM_LIGHTHOUSE_VERSION,
				profile: 'mobile simulated throttling',
				telemetryBlockPatterns: TELEMETRY_BLOCK_PATTERNS,
				...evaluation
			},
			null,
			2
		)}\n`,
		'utf8'
	);
	console.log(JSON.stringify(evaluation, null, 2));
	if (!evaluation.passed) {
		throw new Error(`Barnum Lighthouse thresholds failed. See ${summaryPath}.`);
	}
	return evaluation;
}

async function main() {
	const options = parseBarnumPerformanceArguments(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}
	if (options.dryRun) {
		for (let run = 1; run <= BARNUM_LIGHTHOUSE_RUNS; run += 1) {
			const outputPath = path.join(options.outputDirectory, `run-${run}.report.json`);
			const invocation = buildBarnumLighthouseInvocation({ ...options, outputPath });
			console.log(`${invocation.command} ${invocation.arguments.join(' ')}`);
		}
		return;
	}
	await runBarnumPerformanceAudit(options);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.stack : error);
		process.exitCode = 1;
	});
}
