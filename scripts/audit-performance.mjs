#!/usr/bin/env node

/**
 * Reproducible Phase 7 performance and accessibility audit.
 *
 * The default run executes exactly three Lighthouse navigations for each of eight representative
 * production URLs under both Lighthouse mobile and desktop presets (48 serial runs). Raw reports
 * and browser-probe data are written to the ignored .audit-private directory; the public CSV
 * contains sanitized run data and medians. The runner never submits a form or changes production.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_AUDIT_DATE = '2026-08-06';
const DEFAULT_ORIGIN = 'https://www.suvroghosh.in';
const DEFAULT_LIGHTHOUSE_VERSION = '13.4.1';
const DEFAULT_CHROME_PATH =
	process.platform === 'win32'
		? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
		: 'google-chrome';

export const REPRESENTATIVE_PAGES = Object.freeze([
	{ id: 'homepage', pageType: 'homepage', pathname: '/' },
	{ id: 'resume', pageType: 'resume', pathname: '/resume' },
	{ id: 'consulting', pageType: 'consulting', pathname: '/consulting' },
	{
		id: 'normal-long-article',
		pageType: 'normal_long_article',
		pathname: '/blog/engineering-blog/sql-or-sequel-the-immortal-language-of-data'
	},
	{
		id: 'media-heavy-article',
		pageType: 'media_heavy_article',
		pathname: '/blog/personal/schooling-in-calcutta'
	},
	{ id: 'archive', pageType: 'archive_page', pathname: '/blog/archive/2026/07' },
	{
		id: 'lightweight-visualization',
		pageType: 'lightweight_visualization',
		pathname: '/blog/visualizations/hello-fragment-your-first-shader-from-scratch'
	},
	{
		id: 'heaviest-visualization',
		pageType: 'heaviest_visualization',
		pathname: '/blog/visualizations/the-fractal-atlas'
	}
]);

export const LAB_PROFILES = Object.freeze([
	{ id: 'mobile', lighthouseArguments: [] },
	{ id: 'desktop', lighthouseArguments: ['--preset=desktop'] }
]);

export const TELEMETRY_BLOCK_PATTERNS = Object.freeze([
	'*/_vercel/insights/*',
	'*/_vercel/speed-insights/*',
	'*vercel-insights.com/*',
	'*vercel-analytics.com/*',
	'*vercel-scripts.com/*'
]);

const CSV_COLUMNS = Object.freeze([
	'page_id',
	'page_type',
	'url',
	'profile',
	'run',
	'row_status',
	'fetch_time_utc',
	'lighthouse_version',
	'browser_user_agent',
	'final_url',
	'performance_score_0_100',
	'accessibility_score_0_100',
	'lcp_ms',
	'interaction_lab_proxy',
	'tbt_ms',
	'cls',
	'ttfb_ms',
	'fcp_ms',
	'speed_index_ms',
	'total_transfer_bytes',
	'javascript_transfer_bytes',
	'unused_javascript_bytes',
	'image_transfer_bytes',
	'font_transfer_bytes',
	'main_thread_ms',
	'script_evaluation_ms',
	'javascript_bootup_ms',
	'long_task_count',
	'max_long_task_ms',
	'layout_shift_count',
	'network_rtt_ms',
	'network_throughput_kbps',
	'cpu_slowdown_multiplier',
	'accessibility_failure_count',
	'accessibility_failure_ids',
	'telemetry_block_patterns',
	'telemetry_block_verified',
	'telemetry_network_records_seen',
	'telemetry_completed_request_count',
	'command_exit_code',
	'error'
]);

function parseInteger(value, label, minimum = 0) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < minimum) {
		throw new Error(`${label} must be an integer greater than or equal to ${minimum}.`);
	}
	return parsed;
}

export function parseArguments(argv) {
	const options = {
		auditDate: DEFAULT_AUDIT_DATE,
		origin: DEFAULT_ORIGIN,
		lighthouseVersion: DEFAULT_LIGHTHOUSE_VERSION,
		chromePath: process.env.CHROME_PATH || DEFAULT_CHROME_PATH,
		runs: 3,
		cooldownMs: 2_000,
		commandTimeoutMs: 150_000,
		pageIds: [],
		profileIds: [],
		lab: true,
		probes: true,
		dryRun: false
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const next = () => {
			index += 1;
			if (index >= argv.length) throw new Error(`${argument} requires a value.`);
			return argv[index];
		};

		if (argument === '--audit-date') options.auditDate = next();
		else if (argument === '--origin') options.origin = next();
		else if (argument === '--lighthouse-version') options.lighthouseVersion = next();
		else if (argument === '--chrome-path') options.chromePath = next();
		else if (argument === '--runs') options.runs = parseInteger(next(), '--runs', 1);
		else if (argument === '--cooldown-ms')
			options.cooldownMs = parseInteger(next(), '--cooldown-ms', 0);
		else if (argument === '--command-timeout-ms')
			options.commandTimeoutMs = parseInteger(next(), '--command-timeout-ms', 1_000);
		else if (argument === '--page') options.pageIds.push(next());
		else if (argument === '--profile') options.profileIds.push(next());
		else if (argument === '--lab-only') options.probes = false;
		else if (argument === '--probes-only') options.lab = false;
		else if (argument === '--dry-run') options.dryRun = true;
		else if (argument === '--help') options.help = true;
		else throw new Error(`Unknown argument: ${argument}`);
	}

	const parsedOrigin = new URL(options.origin);
	if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
		throw new Error('--origin must use HTTP or HTTPS.');
	}
	options.origin = parsedOrigin.origin;
	for (const pageId of options.pageIds) {
		if (!REPRESENTATIVE_PAGES.some((page) => page.id === pageId)) {
			throw new Error(`Unknown --page value: ${pageId}`);
		}
	}
	for (const profileId of options.profileIds) {
		if (!LAB_PROFILES.some((profile) => profile.id === profileId)) {
			throw new Error(`Unknown --profile value: ${profileId}`);
		}
	}
	options.publicOutputPath = path.join(
		REPOSITORY_ROOT,
		'docs',
		'audits',
		`traffic-${options.auditDate}`,
		'LIGHTHOUSE_RESULTS.csv'
	);
	options.rawDirectory = path.join(
		REPOSITORY_ROOT,
		'.audit-private',
		options.auditDate,
		'performance-lab',
		'telemetry-blocked'
	);
	return options;
}

function usage() {
	return `Usage: node scripts/audit-performance.mjs [options]

Options:
  --audit-date YYYY-MM-DD       Audit output date (default ${DEFAULT_AUDIT_DATE})
  --origin URL                  Site origin (default ${DEFAULT_ORIGIN})
  --lighthouse-version VERSION  Pinned npx Lighthouse version (default ${DEFAULT_LIGHTHOUSE_VERSION})
  --chrome-path PATH            Chrome/Chromium executable
  --runs N                      Runs per page/profile (default 3; acceptance run must remain 3)
  --cooldown-ms N               Delay between Lighthouse runs (default 2000)
  --command-timeout-ms N        Per-run timeout (default 150000)
  --page ID                     Limit to one page ID (repeatable; diagnostic use)
  --profile mobile|desktop      Limit to one profile (repeatable; diagnostic use)
  --lab-only                    Skip semantic/visualization browser probes
  --probes-only                 Skip the Lighthouse matrix
  --dry-run                     Print the planned matrix without network activity
  --help                        Show this help
`;
}

export function median(values) {
	const numbers = values.filter(Number.isFinite).sort((first, second) => first - second);
	if (numbers.length === 0) return '';
	const middle = Math.floor(numbers.length / 2);
	return numbers.length % 2 === 1 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

function round(value, decimals = 2) {
	if (!Number.isFinite(value)) return '';
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function auditNumeric(lhr, id) {
	return Number.isFinite(lhr?.audits?.[id]?.numericValue) ? lhr.audits[id].numericValue : '';
}

function resourceBytes(lhr, resourceType) {
	const item = lhr?.audits?.['resource-summary']?.details?.items?.find(
		(candidate) => candidate.resourceType === resourceType
	);
	return Number.isFinite(item?.transferSize) ? item.transferSize : '';
}

function accessibilityFailures(lhr) {
	const references = lhr?.categories?.accessibility?.auditRefs ?? [];
	return references
		.map(({ id }) => ({ id, audit: lhr?.audits?.[id] }))
		.filter(({ audit }) => audit?.score === 0)
		.map(({ id, audit }) => ({
			id,
			itemCount: Array.isArray(audit?.details?.items) ? audit.details.items.length : 0
		}));
}

export function isVercelTelemetryUrl(value) {
	try {
		const url = new URL(value);
		return (
			url.pathname.startsWith('/_vercel/insights/') ||
			url.pathname.startsWith('/_vercel/speed-insights/') ||
			/(^|\.)(?:vercel-insights|vercel-analytics|vercel-scripts)\.com$/i.test(url.hostname)
		);
	} catch {
		return false;
	}
}

export function browserProbeBlockReason(requestUrl, method) {
	if (isVercelTelemetryUrl(requestUrl)) return 'vercel_telemetry';
	return ['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase())
		? ''
		: 'non_read_request';
}

export function verifyTelemetryBlocking(lhr) {
	const configuredPatterns = lhr?.configSettings?.blockedUrlPatterns ?? [];
	const missingPatterns = TELEMETRY_BLOCK_PATTERNS.filter(
		(pattern) => !configuredPatterns.includes(pattern)
	);
	const records = (lhr?.audits?.['network-requests']?.details?.items ?? []).filter((item) =>
		isVercelTelemetryUrl(item.url)
	);
	const completed = records.filter(
		(item) => Number.isFinite(item.statusCode) && item.statusCode >= 200 && item.statusCode < 400
	);
	return {
		verified: missingPatterns.length === 0 && completed.length === 0,
		configuredPatterns,
		missingPatterns,
		recordCount: records.length,
		completedCount: completed.length,
		records: records.map((item) => ({
			url: item.url,
			statusCode: item.statusCode ?? null,
			finished: item.finished ?? null,
			failed: item.failed ?? null,
			failureReason: item.failureReason ?? null
		}))
	};
}

export function summarizeLighthouse(lhr, context) {
	const mainThreadItems = lhr?.audits?.['mainthread-work-breakdown']?.details?.items ?? [];
	const scriptEvaluation = mainThreadItems.find(
		(item) => item.groupLabel === 'Script Evaluation'
	)?.duration;
	const longTasks = lhr?.audits?.['long-tasks']?.details?.items ?? [];
	const layoutShifts = lhr?.audits?.['layout-shifts']?.details?.items ?? [];
	const failures = accessibilityFailures(lhr);
	const unusedJavaScript = lhr?.audits?.['unused-javascript']?.details?.overallSavingsBytes;
	const telemetry = context.telemetry ?? verifyTelemetryBlocking(lhr);

	return {
		page_id: context.page.id,
		page_type: context.page.pageType,
		url: new URL(context.page.pathname, context.origin).href,
		profile: context.profile.id,
		run: context.run,
		row_status: 'VERIFIED_LAB_RUN_TELEMETRY_BLOCKED',
		fetch_time_utc: lhr.fetchTime ?? '',
		lighthouse_version: lhr.lighthouseVersion ?? '',
		browser_user_agent: lhr.userAgent ?? '',
		final_url: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? '',
		performance_score_0_100: round((lhr?.categories?.performance?.score ?? 0) * 100),
		accessibility_score_0_100: round((lhr?.categories?.accessibility?.score ?? 0) * 100),
		lcp_ms: round(auditNumeric(lhr, 'largest-contentful-paint')),
		interaction_lab_proxy:
			'Total Blocking Time (navigation-lab proxy; INP requires field interaction data)',
		tbt_ms: round(auditNumeric(lhr, 'total-blocking-time')),
		cls: round(auditNumeric(lhr, 'cumulative-layout-shift'), 4),
		ttfb_ms: round(auditNumeric(lhr, 'server-response-time')),
		fcp_ms: round(auditNumeric(lhr, 'first-contentful-paint')),
		speed_index_ms: round(auditNumeric(lhr, 'speed-index')),
		total_transfer_bytes: resourceBytes(lhr, 'total'),
		javascript_transfer_bytes: resourceBytes(lhr, 'script'),
		unused_javascript_bytes: Number.isFinite(unusedJavaScript) ? round(unusedJavaScript) : '',
		image_transfer_bytes: resourceBytes(lhr, 'image'),
		font_transfer_bytes: resourceBytes(lhr, 'font'),
		main_thread_ms: round(auditNumeric(lhr, 'mainthread-work-breakdown')),
		script_evaluation_ms: round(scriptEvaluation),
		javascript_bootup_ms: round(auditNumeric(lhr, 'bootup-time')),
		long_task_count: longTasks.length,
		max_long_task_ms: round(Math.max(0, ...longTasks.map((item) => item.duration ?? 0))),
		layout_shift_count: layoutShifts.length,
		network_rtt_ms: lhr?.configSettings?.throttling?.rttMs ?? '',
		network_throughput_kbps: lhr?.configSettings?.throttling?.throughputKbps ?? '',
		cpu_slowdown_multiplier: lhr?.configSettings?.throttling?.cpuSlowdownMultiplier ?? '',
		accessibility_failure_count: failures.length,
		accessibility_failure_ids: failures
			.map((failure) => failure.id)
			.sort()
			.join('|'),
		telemetry_block_patterns: TELEMETRY_BLOCK_PATTERNS.join('|'),
		telemetry_block_verified: telemetry.verified ? 'YES' : 'NO',
		telemetry_network_records_seen: telemetry.recordCount,
		telemetry_completed_request_count: telemetry.completedCount,
		command_exit_code: context.exitCode,
		error: ''
	};
}

function failureRow(context, error, exitCode = '') {
	const message = String(error instanceof Error ? error.message : error)
		.replaceAll(REPOSITORY_ROOT, '<repository>')
		.replace(/C:\\Users\\[^\\\s]+/gi, 'C:\\Users\\<redacted>')
		.replace(/\s+/g, ' ')
		.slice(0, 500);
	return {
		page_id: context.page.id,
		page_type: context.page.pageType,
		url: new URL(context.page.pathname, context.origin).href,
		profile: context.profile.id,
		run: context.run,
		row_status: 'FAILED — NO LAB RESULT',
		interaction_lab_proxy: 'UNVERIFIED',
		command_exit_code: exitCode,
		error: message
	};
}

function csvCell(value) {
	const text = value === undefined || value === null ? '' : String(value);
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows) {
	return (
		[
			CSV_COLUMNS.join(','),
			...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','))
		].join('\n') + '\n'
	);
}

function selectedPages(options) {
	return options.pageIds.length
		? REPRESENTATIVE_PAGES.filter((page) => options.pageIds.includes(page.id))
		: REPRESENTATIVE_PAGES;
}

function selectedProfiles(options) {
	return options.profileIds.length
		? LAB_PROFILES.filter((profile) => options.profileIds.includes(profile.id))
		: LAB_PROFILES;
}

function medianRows(rows, origin, pages = REPRESENTATIVE_PAGES, profiles = LAB_PROFILES) {
	const numericColumns = CSV_COLUMNS.filter((column) =>
		[
			'performance_score_0_100',
			'accessibility_score_0_100',
			'lcp_ms',
			'tbt_ms',
			'cls',
			'ttfb_ms',
			'fcp_ms',
			'speed_index_ms',
			'total_transfer_bytes',
			'javascript_transfer_bytes',
			'unused_javascript_bytes',
			'image_transfer_bytes',
			'font_transfer_bytes',
			'main_thread_ms',
			'script_evaluation_ms',
			'javascript_bootup_ms',
			'long_task_count',
			'max_long_task_ms',
			'layout_shift_count',
			'network_rtt_ms',
			'network_throughput_kbps',
			'cpu_slowdown_multiplier',
			'accessibility_failure_count',
			'telemetry_network_records_seen',
			'telemetry_completed_request_count'
		].includes(column)
	);
	const medians = [];

	for (const page of pages) {
		for (const profile of profiles) {
			const group = rows.filter(
				(row) =>
					row.page_id === page.id &&
					row.profile === profile.id &&
					row.row_status === 'VERIFIED_LAB_RUN_TELEMETRY_BLOCKED'
			);
			const row = {
				page_id: page.id,
				page_type: page.pageType,
				url: new URL(page.pathname, origin).href,
				profile: profile.id,
				run: 'median',
				row_status:
					group.length === 3
						? 'MEDIAN_OF_3_VERIFIED_TELEMETRY_BLOCKED_LAB_RUNS'
						: `INCOMPLETE_MEDIAN — ${group.length}_SUCCESSFUL_RUNS`,
				fetch_time_utc:
					group
						.map((item) => item.fetch_time_utc)
						.sort()
						.at(-1) ?? '',
				lighthouse_version: [...new Set(group.map((item) => item.lighthouse_version))].join('|'),
				browser_user_agent: [...new Set(group.map((item) => item.browser_user_agent))].join('|'),
				final_url: [...new Set(group.map((item) => item.final_url))].join('|'),
				interaction_lab_proxy:
					'Total Blocking Time median (navigation-lab proxy; INP requires field interaction data)',
				accessibility_failure_ids: [
					...new Set(
						group.flatMap((item) => String(item.accessibility_failure_ids || '').split('|'))
					)
				]
					.filter(Boolean)
					.sort()
					.join('|'),
				telemetry_block_patterns: TELEMETRY_BLOCK_PATTERNS.join('|'),
				telemetry_block_verified: group.length === 3 ? 'YES' : 'NO',
				command_exit_code: [...new Set(group.map((item) => item.command_exit_code))].join('|'),
				error: ''
			};
			for (const column of numericColumns) {
				row[column] = round(
					median(
						group.map((item) =>
							item[column] === '' || item[column] === undefined ? Number.NaN : Number(item[column])
						)
					),
					column === 'cls' ? 4 : 2
				);
			}
			medians.push(row);
		}
	}
	return medians;
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function findOpenPort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : null;
			server.close((error) => (error ? reject(error) : resolve(port)));
		});
	});
}

async function waitForDevTools(port, timeoutMs = 20_000) {
	const deadline = Date.now() + timeoutMs;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) return response.json();
		} catch (error) {
			lastError = error;
		}
		await delay(200);
	}
	throw new Error(`Chrome DevTools endpoint did not start: ${lastError?.message ?? 'timeout'}`);
}

function runCommand(command, arguments_, { timeoutMs, environment = process.env } = {}) {
	return new Promise((resolve) => {
		const child = spawn(command, arguments_, {
			cwd: REPOSITORY_ROOT,
			env: environment,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill();
		}, timeoutMs ?? 150_000);
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({ code: null, stdout, stderr, error, timedOut });
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr, timedOut });
		});
	});
}

async function launchChrome(options) {
	if (!fs.existsSync(options.chromePath) && path.isAbsolute(options.chromePath)) {
		throw new Error(`Chrome executable not found at ${options.chromePath}`);
	}
	const port = await findOpenPort();
	const profileDirectory = path.join(
		options.rawDirectory,
		`chrome-profile-${process.pid}-${Date.now()}`
	);
	fs.mkdirSync(profileDirectory, { recursive: true });
	const arguments_ = [
		'--headless=new',
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${profileDirectory}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-extensions',
		'--disable-background-networking',
		'--disable-component-update',
		'--enable-precise-memory-info',
		'about:blank'
	];
	const child = spawn(options.chromePath, arguments_, {
		cwd: REPOSITORY_ROOT,
		windowsHide: true,
		stdio: ['ignore', 'ignore', 'pipe']
	});
	let stderr = '';
	child.stderr.on('data', (chunk) => (stderr += chunk));
	try {
		const version = await waitForDevTools(port);
		return { child, port, profileDirectory, version, stderr: () => stderr };
	} catch (error) {
		child.kill();
		throw error;
	}
}

async function closeChrome(chrome) {
	if (!chrome || chrome.child.exitCode !== null) return;
	try {
		await fetch(`http://127.0.0.1:${chrome.port}/json/close`, { method: 'POST' });
	} catch {
		// The endpoint does not expose a browser-close target on every Chrome build.
	}
	chrome.child.kill();
	await Promise.race([new Promise((resolve) => chrome.child.once('close', resolve)), delay(5_000)]);
}

function writePublicCsv(options, runRows) {
	fs.mkdirSync(path.dirname(options.publicOutputPath), { recursive: true });
	const rows = [
		...runRows,
		...medianRows(runRows, options.origin, selectedPages(options), selectedProfiles(options))
	];
	fs.writeFileSync(options.publicOutputPath, rowsToCsv(rows), 'utf8');
}

export function buildLighthouseInvocation({ options, chromePort, page, profile, rawPath }) {
	const npxCliPath =
		process.platform === 'win32'
			? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
			: null;
	return {
		command: npxCliPath ? process.execPath : 'npx',
		arguments: [
			...(npxCliPath ? [npxCliPath] : []),
			'--yes',
			`lighthouse@${options.lighthouseVersion}`,
			new URL(page.pathname, options.origin).href,
			'--quiet',
			`--port=${chromePort}`,
			'--only-categories=performance,accessibility',
			...TELEMETRY_BLOCK_PATTERNS.map((pattern) => `--blocked-url-patterns=${pattern}`),
			'--output=json',
			`--output-path=${rawPath}`,
			'--max-wait-for-load=60000',
			...profile.lighthouseArguments
		]
	};
}

async function runLighthouseMatrix(options, chrome) {
	const runRows = [];
	const pages = selectedPages(options);
	const profiles = selectedProfiles(options);
	const total = pages.length * profiles.length * options.runs;
	let completed = 0;

	for (const page of pages) {
		for (const profile of profiles) {
			for (let run = 1; run <= options.runs; run += 1) {
				const context = { page, profile, run, origin: options.origin };
				const rawPath = path.join(options.rawDirectory, `${page.id}-${profile.id}-${run}.json`);
				// A prior report must never make a failed rerun look successful.
				fs.rmSync(rawPath, { force: true });
				const invocationStartedAt = Date.now();
				const invocation = buildLighthouseInvocation({
					options,
					chromePort: chrome.port,
					page,
					profile,
					rawPath
				});
				const result = await runCommand(invocation.command, invocation.arguments, {
					timeoutMs: options.commandTimeoutMs
				});

				try {
					if (result.code !== 0) {
						throw new Error(
							result.timedOut
								? 'Lighthouse timed out.'
								: result.error?.message ||
										result.stderr ||
										`Lighthouse exited with code ${result.code}.`
						);
					}
					if (!fs.existsSync(rawPath)) {
						throw new Error(
							result.timedOut
								? 'Lighthouse timed out before producing a report.'
								: result.error?.message || result.stderr || 'Lighthouse produced no JSON report.'
						);
					}
					const rawStat = fs.statSync(rawPath);
					if (rawStat.mtimeMs + 1_000 < invocationStartedAt) {
						throw new Error('Lighthouse report predates the current invocation.');
					}
					const lhr = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
					if (lhr.runtimeError?.code) {
						throw new Error(
							`Lighthouse runtime error ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`
						);
					}
					const telemetry = verifyTelemetryBlocking(lhr);
					if (!telemetry.verified) {
						throw new Error(
							`Telemetry block could not be verified; missing patterns=${telemetry.missingPatterns.join('|') || 'none'}; completed telemetry requests=${telemetry.completedCount}.`
						);
					}
					runRows.push(summarizeLighthouse(lhr, { ...context, exitCode: result.code, telemetry }));
				} catch (error) {
					runRows.push(failureRow(context, error, result.code));
				}

				completed += 1;
				writePublicCsv(options, runRows);
				console.log(
					`[${completed}/${total}] ${page.id} ${profile.id} run ${run}: ${runRows.at(-1).row_status}`
				);
				if (completed < total && options.cooldownMs > 0) await delay(options.cooldownMs);
			}
		}
	}

	return runRows;
}

async function runBrowserProbes(options) {
	let chromium;
	try {
		({ chromium } = await import('playwright'));
	} catch (error) {
		throw new Error(`Playwright is unavailable for browser probes: ${error.message}`, {
			cause: error
		});
	}

	const browser = await chromium.launch({
		executablePath: options.chromePath,
		headless: true,
		args: ['--enable-precise-memory-info']
	});
	const summaries = [];
	try {
		for (const pageDefinition of selectedPages(options)) {
			const context = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 2,
				reducedMotion: 'reduce'
			});
			const telemetryAttempts = [];
			const telemetryFinished = [];
			const blockedWriteAttempts = [];
			await context.route('**/*', async (route) => {
				const request = route.request();
				const requestUrl = request.url();
				const blockReason = browserProbeBlockReason(requestUrl, request.method());
				if (blockReason === 'vercel_telemetry') {
					telemetryAttempts.push(requestUrl);
					await route.abort('blockedbyclient');
					return;
				}
				if (blockReason === 'non_read_request') {
					const parsed = new URL(requestUrl);
					blockedWriteAttempts.push({
						method: request.method(),
						url: `${parsed.origin}${parsed.pathname}`
					});
					await route.abort('blockedbyclient');
					return;
				}
				await route.continue();
			});
			const page = await context.newPage();
			page.on('requestfinished', (request) => {
				if (isVercelTelemetryUrl(request.url())) telemetryFinished.push(request.url());
			});
			const url = new URL(pageDefinition.pathname, options.origin).href;
			const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
			await page.locator('main').first().waitFor({ state: 'attached', timeout: 20_000 });
			await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {
				// Third-party embeds can keep the load state unsettled. Semantic probes only require the
				// server-rendered main landmark and a short resource-settling window.
			});
			await page.waitForTimeout(1_500);
			const summary = await page.evaluate(() => {
				const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
				const accessibleName = (element) => {
					const labelledBy = (element.getAttribute('aria-labelledby') || '')
						.split(/\s+/)
						.map((id) => text(document.getElementById(id)))
						.filter(Boolean)
						.join(' ');
					const associatedLabels =
						'labels' in element && element.labels
							? [...element.labels]
									.map((label) => text(label))
									.filter(Boolean)
									.join(' ')
							: '';
					return (
						element.getAttribute('aria-label') ||
						labelledBy ||
						element.getAttribute('alt') ||
						associatedLabels ||
						text(element) ||
						element.getAttribute('title') ||
						''
					);
				};
				const isPerceivable = (element) =>
					element.getClientRects().length > 0 &&
					!element.closest('[aria-hidden="true"],[inert]') &&
					getComputedStyle(element).visibility !== 'hidden';
				const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
				const headingLevels = headings.map((heading) => Number(heading.tagName.slice(1)));
				const headingSkips = headingLevels.filter(
					(level, index) => index > 0 && level > headingLevels[index - 1] + 1
				).length;
				const focusables = [
					...document.querySelectorAll(
						'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'
					)
				].filter((element) => !element.hasAttribute('disabled') && isPerceivable(element));
				const unnamedFocusables = focusables.filter((element) => !accessibleName(element));
				const perceivableCanvases = [...document.querySelectorAll('canvas')].filter(isPerceivable);
				return {
					lang: document.documentElement.lang,
					title: document.title,
					main_count: document.querySelectorAll('main').length,
					h1_count: document.querySelectorAll('h1').length,
					heading_skip_count: headingSkips,
					image_count: document.images.length,
					image_missing_alt_count: [...document.images].filter(
						(image) => !image.hasAttribute('alt')
					).length,
					image_empty_alt_count: [...document.images].filter((image) => image.alt === '').length,
					canvas_count: document.querySelectorAll('canvas').length,
					perceivable_canvas_count: perceivableCanvases.length,
					unnamed_perceivable_canvas_count: perceivableCanvases.filter(
						(canvas) => !accessibleName(canvas)
					).length,
					focusable_count: focusables.length,
					unnamed_focusable_count: unnamedFocusables.length,
					unnamed_focusable_samples: unnamedFocusables.slice(0, 10).map((element) => ({
						tag: element.tagName.toLowerCase(),
						type: element.getAttribute('type') || '',
						id: element.id,
						role: element.getAttribute('role') || '',
						class: element.className || ''
					})),
					custom_interactive_negative_tabindex_count: [
						...document.querySelectorAll(
							'[role="button"],[role="link"],[role="checkbox"],[role="slider"]'
						)
					].filter((element) => element.tabIndex < 0).length,
					horizontal_overflow_px: Math.max(
						0,
						document.documentElement.scrollWidth - document.documentElement.clientWidth
					),
					reduced_motion_active: matchMedia('(prefers-reduced-motion: reduce)').matches,
					canonical: document.querySelector('link[rel="canonical"]')?.href ?? '',
					og_image: document.querySelector('meta[property="og:image"]')?.content ?? '',
					visible_word_count: text(document.body).split(/\s+/).filter(Boolean).length,
					script_transfer_bytes: performance
						.getEntriesByType('resource')
						.filter((entry) => entry.initiatorType === 'script')
						.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
					used_js_heap_bytes:
						typeof performance.memory?.usedJSHeapSize === 'number'
							? performance.memory.usedJSHeapSize
							: null
				};
			});

			let visualization = null;
			if (pageDefinition.pageType.endsWith('_visualization')) {
				const target =
					pageDefinition.id === 'lightweight-visualization'
						? page.locator('figure.visualization-shell').first()
						: page.locator('#fractal-atlas-laboratory').first();
				if ((await target.count()) > 0) {
					await target.scrollIntoViewIfNeeded();
					if (pageDefinition.id === 'lightweight-visualization') {
						const loadButton = target.getByRole('button', {
							name: /load interactive shader/i
						});
						if (
							(await loadButton.count()) > 0 &&
							(await loadButton.first().isVisible()) &&
							(await loadButton.first().isEnabled())
						) {
							await loadButton
								.first()
								.click({ timeout: 5_000 })
								.catch((error) => {
									// IntersectionObserver can begin loading between the enabled check and click.
									// The canvas wait below remains the authoritative activation check.
									if (!/disabled|detached|not enabled/i.test(String(error))) throw error;
								});
						}
						await target.locator('canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
					} else {
						await target.waitFor({ state: 'visible', timeout: 20_000 });
					}
					await page.waitForTimeout(5_000);
					const afterLoad = await target.evaluate((element) => ({
						script_transfer_bytes: performance
							.getEntriesByType('resource')
							.filter((entry) => entry.initiatorType === 'script')
							.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
						used_js_heap_bytes:
							typeof performance.memory?.usedJSHeapSize === 'number'
								? performance.memory.usedJSHeapSize
								: null,
						canvases: [...element.querySelectorAll('canvas')].map((canvas) => ({
							intrinsic_width: canvas.width,
							intrinsic_height: canvas.height,
							css_width: Math.round(canvas.getBoundingClientRect().width),
							css_height: Math.round(canvas.getBoundingClientRect().height),
							accessible_name: canvas.getAttribute('aria-label') || '',
							aria_hidden: canvas.getAttribute('aria-hidden') || ''
						})),
						applications: [...element.querySelectorAll('[role="application"]')].map(
							(application) => ({
								accessible_name: application.getAttribute('aria-label') || '',
								tab_index: application.tabIndex
							})
						),
						target_css_width: Math.round(element.getBoundingClientRect().width),
						worker_resource_count: performance
							.getEntriesByType('resource')
							.filter((entry) => /worker/i.test(entry.name)).length
					}));
					const frameSample = await page.evaluate(
						() =>
							new Promise((resolve) => {
								let frames = 0;
								const started = performance.now();
								const sample = (now) => {
									frames += 1;
									if (now - started >= 2_000) {
										resolve({
											frames,
											duration_ms: now - started,
											foreground_raf_callback_rate_hz: (frames * 1_000) / (now - started)
										});
										return;
									}
									requestAnimationFrame(sample);
								};
								requestAnimationFrame(sample);
							})
					);

					await page.setViewportSize({ width: 320, height: 720 });
					await page.waitForTimeout(500);
					const narrowResize = await target.evaluate((element) => ({
						horizontal_overflow_px: Math.max(
							0,
							document.documentElement.scrollWidth - document.documentElement.clientWidth
						),
						target_css_width: Math.round(element.getBoundingClientRect().width),
						viewport_width: window.innerWidth,
						canvas_css_widths: [...element.querySelectorAll('canvas')].map((canvas) =>
							Math.round(canvas.getBoundingClientRect().width)
						)
					}));
					await page.setViewportSize({ width: 768, height: 900 });
					await page.waitForTimeout(500);
					const wideResize = await target.evaluate((element) => ({
						horizontal_overflow_px: Math.max(
							0,
							document.documentElement.scrollWidth - document.documentElement.clientWidth
						),
						target_css_width: Math.round(element.getBoundingClientRect().width),
						viewport_width: window.innerWidth,
						canvas_css_widths: [...element.querySelectorAll('canvas')].map((canvas) =>
							Math.round(canvas.getBoundingClientRect().width)
						)
					}));
					const motionControls = await target
						.getByRole('button')
						.allTextContents()
						.then((labels) =>
							labels
								.map((label) => label.replace(/\s+/g, ' ').trim())
								.filter((label) => /pause|start|stop|play/i.test(label))
						);
					const probeEndHeap = await page.evaluate(() =>
						typeof performance.memory?.usedJSHeapSize === 'number'
							? performance.memory.usedJSHeapSize
							: null
					);
					visualization = {
						initial_script_transfer_bytes: summary.script_transfer_bytes,
						after_activation_script_transfer_bytes: afterLoad.script_transfer_bytes,
						activation_script_transfer_delta_bytes:
							afterLoad.script_transfer_bytes - summary.script_transfer_bytes,
						initial_used_js_heap_bytes: summary.used_js_heap_bytes,
						after_activation_and_5s_used_js_heap_bytes: afterLoad.used_js_heap_bytes,
						heap_delta_after_activation_and_5s_bytes:
							afterLoad.used_js_heap_bytes !== null && summary.used_js_heap_bytes !== null
								? afterLoad.used_js_heap_bytes - summary.used_js_heap_bytes
								: null,
						probe_end_used_js_heap_bytes: probeEndHeap,
						heap_delta_during_frame_and_resize_probe_bytes:
							probeEndHeap !== null && afterLoad.used_js_heap_bytes !== null
								? probeEndHeap - afterLoad.used_js_heap_bytes
								: null,
						canvases_after_activation: afterLoad.canvases,
						worker_resource_count: afterLoad.worker_resource_count,
						frame_sample: frameSample,
						narrow_320px_resize: narrowResize,
						wide_768px_resize: wideResize,
						motion_control_labels: motionControls
					};
				}
			}

			let tabStopsObserved = 0;
			let focusIndicatorsObserved = 0;
			const missingFocusIndicatorSamples = [];
			const seen = new Set();
			for (let index = 0; index < Math.min(summary.focusable_count, 40); index += 1) {
				await page.keyboard.press('Tab');
				const focused = await page.evaluate(() => {
					const element = document.activeElement;
					if (!(element instanceof HTMLElement) || element === document.body) return null;
					const style = getComputedStyle(element);
					return {
						key: `${element.tagName}:${element.id}:${element.getAttribute('href') || ''}:${element.textContent?.trim().slice(0, 40) || ''}`,
						indicator:
							(style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0) ||
							style.boxShadow !== 'none'
					};
				});
				if (!focused || seen.has(focused.key)) continue;
				seen.add(focused.key);
				tabStopsObserved += 1;
				if (focused.indicator) focusIndicatorsObserved += 1;
				else if (missingFocusIndicatorSamples.length < 10)
					missingFocusIndicatorSamples.push(focused.key);
			}

			if (telemetryFinished.length > 0) {
				throw new Error(
					`Browser probe completed ${telemetryFinished.length} Vercel telemetry request(s); aborting.`
				);
			}
			summaries.push({
				page_id: pageDefinition.id,
				page_type: pageDefinition.pageType,
				url,
				http_status: response?.status() ?? null,
				...summary,
				visualization,
				tab_stops_observed: tabStopsObserved,
				focus_indicators_observed: focusIndicatorsObserved,
				missing_focus_indicator_samples: missingFocusIndicatorSamples,
				telemetry_block_verified: true,
				telemetry_attempt_count: telemetryAttempts.length,
				telemetry_completed_request_count: telemetryFinished.length,
				write_request_guard_verified: true,
				blocked_write_request_count: blockedWriteAttempts.length,
				blocked_write_requests: blockedWriteAttempts,
				probe_time_utc: new Date().toISOString()
			});
			await context.close();
		}
	} finally {
		await browser.close();
	}

	fs.writeFileSync(
		path.join(options.rawDirectory, 'semantic-browser-probes.json'),
		JSON.stringify(
			{ methodology: 'Playwright mobile viewport with reduced motion enabled', summaries },
			null,
			2
		),
		'utf8'
	);
	return summaries;
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}

	const pages = selectedPages(options);
	const profiles = selectedProfiles(options);
	const matrixCount = pages.length * profiles.length * options.runs;
	console.log(
		`Planned audit: ${pages.length} pages × ${profiles.length} profiles × ${options.runs} runs = ${matrixCount} serial Lighthouse navigations.`
	);
	if (options.runs !== 3) {
		console.warn('This invocation will not satisfy the project requirement of exactly three runs.');
	}
	if (options.dryRun) {
		for (const page of pages) {
			for (const profile of profiles) {
				console.log(
					`${profile.id}\t${page.pageType}\t${new URL(page.pathname, options.origin).href}`
				);
			}
		}
		return;
	}

	fs.mkdirSync(options.rawDirectory, { recursive: true });
	let chrome;
	try {
		if (options.lab) {
			chrome = await launchChrome(options);
			console.log(`Chrome ready: ${chrome.version.Browser ?? 'version unavailable'}`);
			const rows = await runLighthouseMatrix(options, chrome);
			const successful = rows.filter(
				(row) => row.row_status === 'VERIFIED_LAB_RUN_TELEMETRY_BLOCKED'
			).length;
			console.log(`Lighthouse matrix complete: ${successful}/${matrixCount} successful reports.`);
			if (successful !== matrixCount) {
				throw new Error(
					`Lighthouse matrix incomplete: ${successful}/${matrixCount} verified reports.`
				);
			}
		}
		if (options.probes) {
			const probes = await runBrowserProbes(options);
			console.log(`Browser probes complete: ${probes.length}/${pages.length} pages.`);
		}
	} finally {
		await closeChrome(chrome);
	}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.stack : error);
		process.exitCode = 1;
	});
}
