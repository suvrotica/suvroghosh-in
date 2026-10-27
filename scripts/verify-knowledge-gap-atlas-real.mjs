import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Public-application QA only: no Vite/module imports or synthetic replacement text.
// Fetch the complete RFC separately into the ignored fixture path before running.
const origin = process.env.KNOWLEDGE_GAP_ATLAS_BASE_URL || 'http://127.0.0.1:4330';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) {
	throw new Error('Run this review only against a loopback development or production preview.');
}
const argument = (name, fallback) => {
	const at = process.argv.indexOf(name);
	return at < 0 ? fallback : process.argv[at + 1];
};
const fixturePath = path.resolve(
	argument('--fixture', 'node_modules/.cache/knowledge-gap-atlas-real/rfc9110.txt')
);
const artifactDirectory = path.resolve(
	argument('--artifacts', 'test-results/knowledge-gap-atlas-real')
);
const outputPath = path.resolve(argument('--output', path.join(artifactDirectory, 'report.json')));
const expectedHash = '21c1cdce6ab0e5509b04d84a28000836c7a087cf786efe6f04877ebfff47232a';
const bytes = await readFile(fixturePath);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(
	sha256(bytes),
	expectedHash,
	'Use the exact complete RFC 9110 fixture recorded for this review.'
);
// Buffer preserves the leading U+FEFF in this fixture; File.text() does not.
const original = bytes.toString('utf8');
const independentWords =
	original.match(/[\p{L}\p{M}\p{N}]+(?:['’\-‐]+[\p{L}\p{M}\p{N}]+)*/gu)?.length ?? 0;
assert.equal(bytes.length, 502_941);
assert.equal(original.length, 502_907);
assert.equal(independentWords, 70_786);
await mkdir(artifactDirectory, { recursive: true });
await mkdir(path.dirname(outputPath), { recursive: true });
const report = {
	measuredAt: new Date().toISOString(),
	source: {
		url: 'https://www.rfc-editor.org/rfc/rfc9110.txt',
		sha256: expectedHash,
		bytes: bytes.length,
		chars: original.length,
		independentWords,
		hasUtf8Bom: bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
	},
	environment: {
		node: process.version,
		platform: `${os.platform()} ${os.release()} ${os.arch()}`,
		cpu: os.cpus()[0]?.model,
		logicalProcessors: os.cpus().length,
		systemMemoryGiB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
	},
	limitations: [
		'One public technical specification, not a cross-language quality benchmark.',
		'Elapsed timings include browser automation and local machine load; they are not performance guarantees.',
		'Source-bearing request checks inspect selected exact source passages and request metadata; external network requests are blocked.'
	],
	checks: {},
	errors: [],
	sourceBearingRequests: [],
	networkWrites: [],
	status: 'running'
};
const browser = await chromium.launch({
	channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
	headless: true
});
const context = await browser.newContext({
	viewport: { width: 1440, height: 1100 },
	serviceWorkers: 'block',
	reducedMotion: 'reduce',
	acceptDownloads: true
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.on('pageerror', (error) => report.errors.push(error.message));
const needles = [
	original.slice(1000, 1120),
	original.slice(250000, 250120),
	original.slice(-500, -380)
];
page.on('request', (request) => {
	const payload = `${request.url()} ${request.postData() ?? ''}`;
	if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
		report.networkWrites.push({ url: request.url(), method: request.method() });
	}
	if (
		needles.some(
			(needle) =>
				payload.includes(needle) ||
				payload.includes(encodeURIComponent(needle)) ||
				payload.includes(JSON.stringify(needle).slice(1, -1))
		)
	) {
		report.sourceBearingRequests.push({ url: request.url(), method: request.method() });
	}
});
await context.route('**/*', (route) => {
	const url = new URL(route.request().url());
	return url.origin === new URL(origin).origin || !['http:', 'https:'].includes(url.protocol)
		? route.continue()
		: route.abort('blockedbyclient');
});
const app = page.getByTestId('atlas-app');
const table = (name) =>
	page.evaluate(
		(storeName) =>
			new Promise((resolve, reject) => {
				const opening = indexedDB.open('suvro-knowledge-gap-atlas');
				opening.onerror = () => reject(opening.error);
				opening.onsuccess = () => {
					const database = opening.result;
					const request = database.transaction(storeName).objectStore(storeName).getAll();
					request.onsuccess = () => {
						database.close();
						resolve(request.result);
					};
					request.onerror = () => {
						database.close();
						reject(request.error);
					};
				};
			}),
		name
	);
const summary = () =>
	page.evaluate(
		() =>
			new Promise((resolve, reject) => {
				const opening = indexedDB.open('suvro-knowledge-gap-atlas');
				opening.onerror = () => reject(opening.error);
				opening.onsuccess = () => {
					const database = opening.result;
					const request = database.transaction('projects').objectStore('projects').getAll();
					request.onerror = () => {
						database.close();
						reject(request.error);
					};
					request.onsuccess = () => {
						database.close();
						const project = request.result.find((entry) => entry.result);
						const result = project?.result;
						resolve(
							result
								? {
										projectId: project.id,
										revision: result.analysisRevision,
										words: result.words,
										settings: result.settings,
										concepts: result.concepts.length,
										edges: result.edges.length,
										topics: result.topics.length,
										rawConcepts: result.totalTerms,
										rawEdges: result.totalEdges,
										findingCounts: result.findings.reduce(
											(counts, finding) => ({
												...counts,
												[finding.kind]: (counts[finding.kind] ?? 0) + 1
											}),
											{}
										),
										topConcepts: result.concepts
											.slice(0, 20)
											.map(({ id, label, count, score }) => ({ id, label, count, score })),
										importantConcepts: result.concepts
											.filter((concept) =>
												[
													'header field',
													'origin server',
													'status code',
													'content negotiation'
												].includes(concept.id)
											)
											.map(({ id, count, community }) => ({ id, count, community })),
										topFindings: result.findings
											.slice(0, 8)
											.map(({ kind, title, priority, factors }) => ({
												kind,
												title,
												priority,
												factors
											})),
										questions: project.questions.map(({ text, status }) => ({ text, status }))
									}
								: null
						);
					};
				};
			})
	);
const capture = async (name) => {
	await page.evaluate(() => document.fonts.ready);
	const hideHeader = await page.addStyleTag({
		content: '.site-header { visibility: hidden !important; }'
	});
	await app.screenshot({
		path: path.join(artifactDirectory, `${name}.png`),
		animations: 'disabled'
	});
	await hideHeader.evaluate((element) => element.remove());
};
try {
	await page.goto(new URL('/blog/visualizations/knowledge-gap-atlas', origin).href, {
		timeout: 90_000
	});
	await expect(app).toBeVisible();
	await page.getByRole('button', { name: 'Keep videos paused', exact: true }).click();
	await page.getByRole('button', { name: 'Dismiss privacy confirmation', exact: true }).click();
	await expect(app.locator('[data-testid^="atlas-example-"]')).toHaveCount(5);
	await capture('practice-cases-landing');
	await app.getByRole('button', { name: /Map your material/ }).click();
	const started = performance.now();
	await app.getByLabel('Add text files', { exact: true }).setInputFiles(fixturePath);
	await expect
		.poll(async () => (await summary())?.words ?? 0, {
			timeout: 180_000,
			intervals: [250, 500, 1000]
		})
		.toBe(independentWords);
	report.importAndAnalysisMs = Math.round(performance.now() - started);
	await expect(app.getByTestId('atlas-map')).toBeVisible();
	await expect(app.getByTestId('atlas-progress')).toHaveCount(0);
	report.analysis = await summary();
	const sources = await table('sources');
	assert.equal(sources.length, 1);
	assert.equal(sources[0].status, 'complete');
	assert.equal(sources[0].processedBytes, bytes.length);
	assert.equal(sources[0].chars, original.length);
	const chunks = (await table('chunks')).sort((a, b) => a.index - b.index);
	const recovered = chunks.map((chunk) => chunk.text).join('');
	assert.ok(
		recovered === original,
		'Every original source character, including BOM and tail, must survive import.'
	);
	report.checks.sourcePreservation = {
		exact: true,
		sha256: sha256(recovered),
		chunks: chunks.length,
		completeWords: report.analysis.words
	};
	assert.equal(
		report.analysis.importantConcepts.length,
		4,
		'Core HTTP terms should remain discoverable.'
	);
	const detail = app.locator('.kga-density').getByRole('combobox');
	await detail.selectOption({ label: 'All concepts' });
	await expect(app.getByTestId('atlas-map').locator('canvas')).toHaveAccessibleName(
		new RegExp(`showing ${report.analysis.concepts} of ${report.analysis.concepts} concepts`)
	);
	await expect(app.getByTestId('atlas-map').locator('.kga-map-count')).toContainText(
		`${report.analysis.topics} / ${report.analysis.topics} topics`
	);
	report.checks.allConcepts = {
		allVisible: true,
		concepts: report.analysis.concepts,
		topics: report.analysis.topics
	};
	await detail.selectOption({ label: 'Balanced · 140' });
	const notice = app.getByRole('button', { name: 'Dismiss notification', exact: true });
	if (await notice.isVisible()) await notice.click();
	await capture('desktop-map');
	await app.getByRole('button', { name: 'Use night theme', exact: true }).click();
	await capture('night-map');
	await app.getByRole('button', { name: 'Use paper theme', exact: true }).click();
	report.checks.nightMap =
		'Captured the same complete-corpus overview in night theme for visual review.';
	const overview = await app.getByTestId('atlas-map').locator('canvas').getAttribute('aria-label');
	report.checks.overview = {
		description: overview,
		appFitsViewport: await app.evaluate((element) => element.scrollWidth <= element.clientWidth + 2)
	};
	assert.ok(report.checks.overview.appFitsViewport, 'The desktop app must fit its viewport.');
	await app.locator('.kga-first-lead button').click();
	await expect(app.getByTestId('atlas-evidence').locator('mark').first()).toHaveText(/\S/);
	await capture('gap-evidence');
	await app.getByTestId('atlas-evidence').locator('mark').first().scrollIntoViewIfNeeded();
	await capture('gap-original-passages');
	await app.getByRole('button', { name: 'Close evidence inspector', exact: true }).click();
	await app.getByLabel('Find a concept', { exact: true }).fill('origin server');
	await expect(app.getByTestId('atlas-map').locator('.kga-map-count')).toContainText('matches');
	await capture('search-map');
	await app.getByTestId('atlas-view-concepts').click();
	await app.getByRole('table').getByRole('button', { name: 'origin server', exact: true }).click();
	await expect(
		app.getByTestId('atlas-evidence').getByRole('heading', { name: 'origin server', exact: true })
	).toBeVisible();
	await expect(app.getByTestId('atlas-evidence').locator('mark').first()).toHaveText(/\S/);
	await capture('concept-evidence');
	report.checks.importantSearchAndEvidence =
		'origin server found through public map search and Concepts, with original passages';
	await app.getByRole('button', { name: 'Close evidence inspector', exact: true }).click();
	await app.getByLabel('Search concepts', { exact: true }).fill('');
	await app.getByTestId('atlas-view-map').click();
	await app.locator('.kga-topic-list button').first().click();
	await expect(app.getByTestId('atlas-map').locator('.kga-map-caption')).toContainText(
		'TOPIC IN FOCUS'
	);
	await capture('topic-detail');
	await app.getByRole('button', { name: /^All topics/ }).click();
	await app.getByTestId('atlas-view-findings').click();
	await app.getByTestId('atlas-findings').getByRole('button').first().click();
	await expect(app.getByTestId('atlas-evidence').locator('mark').first()).toHaveText(/\S/);
	await app.getByTestId('atlas-question-save').click();
	await app.getByTestId('atlas-view-research').click();
	const savedQuestion =
		'Which source passages distinguish an origin server from an intermediary when applying HTTP semantics?';
	await app.getByRole('textbox', { name: 'Research question 1', exact: true }).fill(savedQuestion);
	await app.getByRole('textbox', { name: 'Research question 1', exact: true }).press('Tab');
	await expect.poll(async () => (await summary())?.questions[0]?.text).toBe(savedQuestion);
	report.checks.savedResearchQuestion = savedQuestion;
	await app.getByTestId('atlas-view-sources').click();
	await app.getByTestId('atlas-sources').getByRole('button').first().click();
	const reader = app.locator('.kga-source-reader pre');
	await expect.poll(() => reader.textContent()).toBe(original.slice(0, 5000));
	for (let offset = 5000; offset < original.length; offset += 5000) {
		await app.getByRole('button', { name: 'Next passage →', exact: true }).click();
		await expect.poll(() => reader.textContent()).toBe(original.slice(offset, offset + 5000));
	}
	await expect(app.getByRole('button', { name: 'Next passage →', exact: true })).toBeDisabled();
	await capture('source-tail');
	report.checks.sourcePaging = {
		allPagesExact: true,
		pages: Math.ceil(original.length / 5000),
		tailVerified: true
	};
	await app.getByTestId('atlas-export').click();
	await app.getByRole('checkbox', { name: /Include original source text/ }).check();
	await page.evaluate(() =>
		Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
	);
	const downloads = [];
	const collectDownload = (download) => downloads.push(download);
	page.on('download', collectDownload);
	await app.getByRole('button', { name: /Complete project/ }).click();
	await expect(app.getByRole('status').filter({ hasText: 'Project downloaded' })).toBeVisible({
		timeout: 90_000
	});
	page.off('download', collectDownload);
	assert.ok(downloads.length > 0, 'The portable export must produce a download.');
	const exportLines = [];
	for (const download of downloads.sort((a, b) =>
		a.suggestedFilename().localeCompare(b.suggestedFilename())
	)) {
		const stream = await download.createReadStream();
		assert.ok(stream, 'A downloaded project part must be readable.');
		const parts = [];
		for await (const part of stream) parts.push(Buffer.from(part));
		exportLines.push(
			...Buffer.concat(parts)
				.toString('utf8')
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line))
		);
	}
	assert.equal(exportLines.at(-1).type, 'end');
	const exportedText = exportLines
		.filter((line) => line.type === 'chunk')
		.sort((a, b) => a.index - b.index)
		.map((line) => line.text)
		.join('');
	assert.ok(exportedText === original, 'Portable export must contain the exact full RFC text.');
	assert.ok(
		exportLines.some((line) => line.type === 'question' && line.question.text === savedQuestion)
	);
	report.checks.portableExport = {
		exactSource: true,
		sha256: sha256(exportedText),
		parts: downloads.length,
		savedQuestion: true
	};
	await app.getByTestId('atlas-export').click();
	await app.getByTestId('atlas-view-map').click();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(app.getByTestId('atlas-map')).toBeVisible();
	assert.ok(
		await app.evaluate((element) => element.scrollWidth <= element.clientWidth + 2),
		'The mobile app must fit its viewport.'
	);
	const openInspector = app.getByRole('button', { name: 'Close evidence inspector', exact: true });
	if (await openInspector.isVisible()) {
		await capture('mobile-evidence');
		await openInspector.click();
	}
	if (await notice.isVisible()) await notice.click();
	await capture('mobile-map');
	report.checks.mobileFitsViewport = true;
	await page.setViewportSize({ width: 1440, height: 1100 });
	await app.getByRole('button', { name: /^My atlases/ }).click();
	await app.getByRole('button', { name: 'Browse practice cases', exact: true }).click();
	await app.getByTestId('atlas-example-product-feedback').click();
	await expect(app.getByTestId('atlas-map')).toBeVisible({ timeout: 90_000 });
	await expect(app.getByTestId('atlas-practice-guide').locator('li')).toHaveCount(3);
	await expect(app.locator('.kga-first-lead')).not.toContainText(
		/Should the target address (?:interview|interviews|quote|quotes|notes|said),/i
	);
	if (await notice.isVisible()) await notice.click();
	await capture('product-practice-guide');
	report.checks.practiceGuide = {
		case: 'product-feedback',
		steps: 3,
		firstQuestion: await app.locator('.kga-first-lead button span').textContent()
	};
	report.environment.browser = await browser.version();
	assert.deepEqual(report.errors, [], 'No browser runtime errors are permitted.');
	assert.deepEqual(
		report.sourceBearingRequests,
		[],
		'No selected source passage may appear in a network request.'
	);
	assert.deepEqual(
		report.networkWrites,
		[],
		'This local analysis workflow must not make network writes.'
	);
	report.status = 'passed';
} catch (error) {
	report.status = 'failed';
	report.failure = error instanceof Error ? error.message : String(error);
	await page
		.screenshot({ path: path.join(artifactDirectory, 'failure.png'), fullPage: true })
		.catch(() => undefined);
	throw error;
} finally {
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	await browser.close();
	process.stdout.write(`Real-document review ${report.status}; report: ${outputPath}\n`);
}
