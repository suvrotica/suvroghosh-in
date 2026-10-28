import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';

const root = process.cwd();
const output = path.join(root, '.tmp/uml-renderer');
const config = {
	configFile: false,
	root: path.join(root, 'scripts/uml-renderer-harness'),
	logLevel: 'warn',
	build: { outDir: path.join(output, 'dist'), emptyOutDir: true, minify: true },
	preview: { host: '127.0.0.1', port: 4322, strictPort: true }
};
await build(config);
const server = await preview(config);
let browser;
try {
	browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
		headless: true
	});
	const page = await browser.newPage({
		serviceWorkers: 'block',
		viewport: { width: 1500, height: 1000 }
	});
	const failures = [];
	page.on('pageerror', (error) => failures.push(error.message));
	const requests = [];
	page.on('request', (request) => requests.push(request.url()));
	await page.goto('http://127.0.0.1:4322');
	await page.waitForFunction(() => window.umlHarness);
	const results = await page.evaluate(async () => {
		const { fixtures, render } = window.umlHarness;
		const results = [];
		for (const [type, fixture] of Object.entries(fixtures)) {
			const source = fixture.sourceCode;
			try {
				results.push({ type, title: fixture.title, source, svg: await render(source) });
			} catch (error) {
				results.push({ type, error: String(error) });
			}
		}
		return results;
	});
	assert.equal(results.length, 14);
	await fs.mkdir(output, { recursive: true });
	for (const result of results) {
		assert.equal(result.error, undefined, `${result.type}: ${result.error}`);
		assert.match(result.svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
		assert.doesNotMatch(
			result.svg,
			/<script|<foreignObject|<image|\son\w+=|\[From textarea|Assumed diagram type:/i
		);
		await fs.writeFile(path.join(output, `${result.type}.svg`), result.svg);
		await fs.writeFile(path.join(output, `${result.type}.puml`), result.source);
	}
	assert.match(results.find((r) => r.type === 'profile').svg, /<polygon[^>]+fill="#181818"/);
	assert.match(
		results.find((r) => r.type === 'object').svg,
		/(?:text-decoration="underline"|<line)/
	);
	assert.match(results.find((r) => r.type === 'activity').svg, /Persist encounter/);
	assert.match(results.find((r) => r.type === 'communication').svg, /1\.1: resolvePatientCRID/);
	assert.match(
		results.find((r) => r.type === 'interaction-overview').svg,
		/ref: MutualTLSHandshake/
	);
	assert.match(results.find((r) => r.type === 'timing').svg, /ReceiptConfirmed/);
	const security = await page.evaluate(async () => {
		const { render, cancel, fixtures } = window.umlHarness;
		const rejected = [];
		for (const source of [
			'@startuml\n!includeurl https://example.invalid/private\n@enduml',
			'@startuml\n%getenv("SECRET")\n@enduml',
			'@startuml\n<img:https://example.invalid/x>\n@enduml',
			'@startuml\nthis is invalid ???\n@enduml',
			'@startuml\ntitle Bad swimlane\nstart\n|Late|\n:A;\nstop\n@enduml',
			'x'.repeat(100001)
		]) {
			try {
				await render(source);
				rejected.push(false);
			} catch {
				rejected.push(true);
			}
		}
		const controller = new AbortController();
		const p = render(fixtures.class.sourceCode, controller.signal).then(
			() => false,
			(e) => e.name === 'AbortError'
		);
		controller.abort();
		const aborted = await p;
		const first = render(fixtures.class.sourceCode);
		const cancelled = Array.from({ length: 40 }, () => {
			const token = new AbortController();
			const job = render(fixtures.class.sourceCode, token.signal).then(
				() => false,
				(e) => e.name === 'AbortError'
			);
			token.abort();
			return job;
		});
		const afterAbort = await render(fixtures.sequence.sourceCode);
		await first;
		if (!(await Promise.all(cancelled)).every(Boolean))
			throw new Error('Queued cancellation did not settle correctly.');
		await render('@startuml\nAlice -> Bob : An error has occurred\n@enduml');
		cancel();
		return { rejected, aborted, recovered: afterAbort.includes('<svg') };
	});
	assert.ok(security.rejected.every(Boolean), JSON.stringify(security));
	assert.ok(security.aborted && security.recovered);
	assert.equal(
		requests.filter((url) => !url.startsWith('http://127.0.0.1:4322/') && !url.startsWith('data:'))
			.length,
		0
	);
	assert.deepEqual(failures, []);
	await page.evaluate((results) => {
		const main = document.querySelector('main');
		main.style.cssText =
			'display:grid;grid-template-columns:1fr 1fr;gap:20px;font-family:sans-serif;background:white';
		for (const { type, svg } of results) {
			const figure = document.createElement('figure');
			figure.style.cssText = 'margin:0;padding:12px;border:1px solid #ccc;min-height:320px';
			const label = document.createElement('figcaption');
			label.textContent = type;
			figure.append(label);
			const img = document.createElement('img');
			img.alt = type;
			img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
			img.style.cssText = 'width:100%;max-height:450px;object-fit:contain';
			figure.append(img);
			main.append(figure);
		}
	}, results);
	await page.waitForFunction(() =>
		[...document.images].every((image) => image.complete && image.naturalWidth > 0)
	);
	await page.screenshot({ path: path.join(output, 'all-fourteen.png'), fullPage: true });
	await fs.writeFile(
		path.join(output, 'verification.json'),
		JSON.stringify(
			{
				renderer: '@plantuml/core@1.2026.9',
				layout: 'Smetana',
				checks: {
					types: 14,
					unsafeAndInvalidInputs: 6,
					cancellation: true,
					recovery: true,
					noExternalRequests: true,
					svgImagesLoad: true
				},
				types: results.map(({ svg, source, ...r }) => ({ ...r, bytes: svg.length }))
			},
			null,
			2
		)
	);
	console.log(
		'Verified fourteen real PlantUML fixtures, six unsafe/invalid inputs, cancellation, worker recovery, no external requests, and SVG image loading.'
	);
	console.log(`Visual proof: ${path.join(output, 'all-fourteen.png')}`);
} finally {
	await browser?.close();
	await new Promise((resolve) => server.httpServer.close(resolve));
}
