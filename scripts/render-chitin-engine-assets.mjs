import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.CHITIN_ENGINE_POSTER_PORT ?? 4241);
const origin = `http://127.0.0.1:${port}`;
const articlePath = '/blog/visualizations/the-chitin-engine';
const specimenQuery =
	'ce_v=1&ce_seed=glassback-1847&ce_preset=glassback-knifemite&ce_world=terminator-line&ce_view=specimen';
const posterUrl = `${origin}${articlePath}?ce_poster=1&${specimenQuery}`;
const comparisonUrl = `${origin}${articlePath}?${specimenQuery}`;
const outputPoster = path.join(
	projectRoot,
	'static',
	'images',
	'the-chitin-engine-xenobiological-foundry.png'
);
const outputComparison = path.join(
	projectRoot,
	'static',
	'images',
	'visualizations',
	'chitin-engine',
	'chitin-engine-four-worlds.png'
);
const imageBudget = 750 * 1024;

async function assertPortAvailable() {
	await new Promise((resolve, reject) => {
		const socket = createConnection({ host: '127.0.0.1', port });
		let settled = false;
		const finish = (callback, value) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			callback(value);
		};
		socket.setTimeout(1_000);
		socket.once('connect', () =>
			finish(reject, new Error(`Port ${port} is occupied; refusing a stale preview.`))
		);
		socket.once('error', (error) => {
			if (error?.code === 'ECONNREFUSED') finish(resolve);
			else finish(reject, error);
		});
		socket.once('timeout', () => finish(reject, new Error(`Port ${port} check timed out.`)));
	});
}

async function waitForServer(server, getSpawnError) {
	let lastError;
	for (let attempt = 0; attempt < 180; attempt += 1) {
		if (getSpawnError()) throw getSpawnError();
		if (server.exitCode !== null || server.signalCode !== null) {
			throw new Error(
				`Vite exited before becoming ready (${server.exitCode ?? server.signalCode}).`
			);
		}
		try {
			const response = await fetch(posterUrl);
			if (response.ok) return;
			lastError = new Error(`Vite returned ${response.status}.`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw lastError ?? new Error('The Chitin Engine dev server did not become ready.');
}

function childIsRunning(server) {
	if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return false;
	try {
		process.kill(server.pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function stopServer(server) {
	if (!childIsRunning(server)) return;
	const exited = new Promise((resolve) => server.once('exit', resolve));
	server.kill('SIGTERM');
	await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 4_000))]);
	if (childIsRunning(server)) {
		server.kill('SIGKILL');
		await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
	}
	if (childIsRunning(server)) throw new Error('The Chitin Engine asset server did not stop.');
}

async function settlePage(page) {
	await page.waitForFunction(
		() => {
			const host = document.querySelector('[data-testid="chitin-viewport"]');
			const canvas = host?.querySelector('canvas');
			const status = host?.getAttribute('data-renderer-status');
			return (
				canvas instanceof HTMLCanvasElement &&
				canvas.width > 64 &&
				canvas.height > 64 &&
				(status === 'ready' || status === 'fallback')
			);
		},
		undefined,
		{ timeout: 60_000 }
	);
	await page.evaluate(async () => {
		await document.fonts?.ready;
		await new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))
		);
	});
}

async function optimizePng(rawPath, outputPath, width, height, minimumVisibleRatio = 0.07) {
	let bestBuffer;
	for (const colours of [256, 224, 192, 160, 128, 96]) {
		const candidate = await sharp(rawPath)
			.resize(width, height, {
				fit: 'contain',
				position: 'centre',
				background: '#04050d'
			})
			.flatten({ background: '#04050d' })
			.png({
				compressionLevel: 9,
				adaptiveFiltering: true,
				palette: true,
				colours,
				dither: 0.72,
				effort: 10
			})
			.toBuffer();
		if (!bestBuffer || candidate.byteLength < bestBuffer.byteLength) bestBuffer = candidate;
		if (candidate.byteLength <= imageBudget) {
			bestBuffer = candidate;
			break;
		}
	}
	if (bestBuffer.byteLength > imageBudget) {
		throw new Error(
			`${path.basename(outputPath)} is ${(bestBuffer.byteLength / 1024).toFixed(1)} KiB after optimisation.`
		);
	}
	const metadata = await sharp(bestBuffer).metadata();
	if (metadata.width !== width || metadata.height !== height) {
		throw new Error(`${path.basename(outputPath)} has incorrect dimensions.`);
	}
	const { data, info } = await sharp(bestBuffer)
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	let visible = 0;
	for (let offset = 0; offset < data.length; offset += info.channels) {
		if (Math.max(data[offset], data[offset + 1], data[offset + 2]) >= 28) visible += 1;
	}
	const visibleRatio = visible / (info.width * info.height);
	if (visibleRatio < minimumVisibleRatio) {
		throw new Error(
			`${path.basename(outputPath)} appears blank (${(visibleRatio * 100).toFixed(1)}% lit).`
		);
	}
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, bestBuffer);
	const size = (await stat(outputPath)).size;
	console.log(
		`Renderer asset saved: ${path.relative(projectRoot, outputPath)} (${width} × ${height}, ${(size / 1024).toFixed(1)} KiB, ${(visibleRatio * 100).toFixed(1)}% lit).`
	);
}

let artifactDirectory;
let browser;
let server;
let taskError;
let cleanupFailures;
try {
	await assertPortAvailable();
	artifactDirectory = await mkdtemp(path.join(tmpdir(), 'chitin-engine-assets-'));
	const rawPoster = path.join(artifactDirectory, 'poster.png');
	const rawComparison = path.join(artifactDirectory, 'comparison.png');
	const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
	let spawnError;
	server = spawn(
		process.execPath,
		[viteCli, 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
		{ cwd: projectRoot, stdio: 'inherit', windowsHide: true }
	);
	server.once('error', (error) => {
		spawnError = error;
	});
	await waitForServer(server, () => spawnError);

	browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	const diagnostics = [];
	const page = await browser.newPage({
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		viewport: { width: 1200, height: 630 }
	});
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (!['error', 'warning'].includes(message.type())) return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		diagnostics.push(`console ${message.type()}: ${message.text()}`);
	});

	await page.goto(posterUrl, { waitUntil: 'domcontentloaded' });
	await page.addStyleTag({
		content: `
			.site-shell > header,
			.site-shell > footer,
			.site-shell > .skip-link,
			.site-shell > .route-atmosphere { display: none !important; }
			.site-shell { padding: 0 !important; }
			body { margin: 0 !important; }
		`
	});
	await settlePage(page);
	const exhibit = page.getByTestId('chitin-engine');
	await exhibit.screenshot({ path: rawPoster, animations: 'disabled' });
	await optimizePng(rawPoster, outputPoster, 1200, 630);

	await page.setViewportSize({ width: 1800, height: 1200 });
	await page.goto(comparisonUrl, { waitUntil: 'domcontentloaded' });
	await settlePage(page);
	const comparison = page.locator('.chitin-foundry .comparison');
	await comparison.scrollIntoViewIfNeeded();
	await page.waitForFunction(
		() =>
			[...document.querySelectorAll('.chitin-foundry .comparison canvas')].length === 4 &&
			[...document.querySelectorAll('.chitin-foundry .comparison canvas')].every(
				(canvas) => canvas instanceof HTMLCanvasElement && canvas.width > 64 && canvas.height > 64
			),
		undefined,
		{ timeout: 30_000 }
	);
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
	);
	await comparison.screenshot({ path: rawComparison, animations: 'disabled' });
	await optimizePng(rawComparison, outputComparison, 1600, 900, 0.05);

	if (diagnostics.length > 0) {
		throw new Error(`Renderer emitted diagnostics:\n${diagnostics.join('\n')}`);
	}
} catch (error) {
	taskError = error;
} finally {
	const cleanup = await Promise.allSettled([
		browser?.close() ?? Promise.resolve(),
		stopServer(server),
		artifactDirectory ? rm(artifactDirectory, { recursive: true, force: true }) : Promise.resolve()
	]);
	cleanupFailures = cleanup
		.filter((result) => result.status === 'rejected')
		.map((result) => result.reason);
}

if (taskError && cleanupFailures.length > 0) {
	throw new AggregateError([taskError, ...cleanupFailures], 'Asset generation and cleanup failed.');
}
if (taskError) throw taskError;
if (cleanupFailures.length > 0) {
	throw new AggregateError(cleanupFailures, 'Asset cleanup did not complete.');
}
