import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PERLIN_BLOOM_POSTER_PORT ?? 4237);
const origin = `http://127.0.0.1:${port}`;
const articleUrl = new URL(
	'/blog/visualizations/thinking-outside-the-box?pb_poster=1&pb_v=1&pb_seed=outside-1847&pb_preset=neon-orchid&pb_motion=0&pb_view=artwork&pb_quality=high',
	origin
).href;
const outputPath = path.join(
	projectRoot,
	'static',
	'images',
	'thinking-outside-the-box-perlin-flower.png'
);
const imageBudget = 750 * 1024;

async function waitForServer(server, getSpawnError) {
	let lastError;
	for (let attempt = 0; attempt < 160; attempt += 1) {
		if (getSpawnError()) throw getSpawnError();
		if (server.exitCode !== null || server.signalCode !== null) {
			throw new Error(
				`Vite server exited before becoming ready (${server.exitCode ?? server.signalCode}).`
			);
		}
		try {
			const response = await fetch(articleUrl);
			if (response.ok) return;
			lastError = new Error(`Vite preview returned ${response.status}.`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw lastError ?? new Error('The local Vite server did not become ready.');
}

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
			finish(reject, new Error(`Port ${port} is already occupied; refusing a stale preview.`))
		);
		socket.once('error', (error) => {
			if (error?.code === 'ECONNREFUSED') finish(resolve);
			else finish(reject, error);
		});
		socket.once('timeout', () =>
			finish(reject, new Error(`Timed out while checking preview port ${port}.`))
		);
	});
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
		if (childIsRunning(server)) {
			throw new Error('The local Vite server did not stop after SIGKILL.');
		}
	}
}

let artifactDirectory;
let browser;
let server;
let taskError;
let cleanupFailures;
try {
	await mkdir(path.dirname(outputPath), { recursive: true });
	artifactDirectory = await mkdtemp(path.join(tmpdir(), 'perlin-bloom-poster-'));
	const rawPath = path.join(artifactDirectory, 'actual-perlin-bloom.png');

	await assertPortAvailable();

	const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
	let spawnError;
	server = spawn(
		process.execPath,
		[viteCli, 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
		{
			cwd: projectRoot,
			stdio: 'inherit',
			windowsHide: true
		}
	);
	server.once('error', (error) => {
		spawnError = error;
	});
	await waitForServer(server, () => spawnError);
	browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	const page = await browser.newPage({
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		viewport: { width: 1200, height: 630 }
	});
	const diagnostics = [];
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() !== 'error' && message.type() !== 'warning') return;
		const source = `${message.location().url} ${message.text()}`;
		if (source.includes('/_vercel/') || /favicon/iu.test(source)) return;
		diagnostics.push(`console ${message.type()}: ${message.text()}`);
	});

	await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
	await page.addStyleTag({
		content: `
			.site-shell > header,
			.site-shell > footer,
			.site-shell > .skip-link,
			.site-shell > .route-atmosphere {
				display: none !important;
			}
		`
	});
	const exhibit = page.getByTestId('perlin-bloom-exhibit');
	await exhibit.waitFor({ state: 'visible' });
	await exhibit.scrollIntoViewIfNeeded();
	await page.waitForFunction(
		() => {
			const host = document.querySelector('[data-testid="perlin-bloom-p5-host"]');
			const canvas = host?.querySelector('[data-testid="perlin-bloom-canvas"]');
			return (
				canvas instanceof HTMLCanvasElement &&
				canvas.width > 0 &&
				canvas.height > 0 &&
				host?.classList.contains('ready') === true &&
				canvas.dataset.ready === 'true' &&
				canvas.dataset.renderer === 'canvas-2d' &&
				canvas.dataset.resolvedQuality === 'high' &&
				Number(canvas.dataset.frameCount) >= 1 &&
				canvas.dataset.geometryHash === canvas.dataset.morphologyHash
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
	await exhibit.screenshot({ path: rawPath, animations: 'disabled' });

	if (diagnostics.length > 0) {
		throw new Error(`Renderer emitted diagnostics:\n${diagnostics.join('\n')}`);
	}

	let bestBuffer;
	for (const colours of [256, 224, 192, 160, 128]) {
		const candidate = await sharp(rawPath)
			.resize(1200, 630, { fit: 'cover', position: 'centre' })
			.flatten({ background: '#05040f' })
			.png({
				compressionLevel: 9,
				adaptiveFiltering: true,
				palette: true,
				colours,
				dither: 0.75,
				effort: 10
			})
			.toBuffer();
		if (!bestBuffer || candidate.byteLength < bestBuffer.byteLength) bestBuffer = candidate;
		if (candidate.byteLength <= imageBudget) {
			bestBuffer = candidate;
			break;
		}
	}
	const metadata = await sharp(bestBuffer).metadata();
	const size = bestBuffer.byteLength;
	if (metadata.width !== 1200 || metadata.height !== 630) {
		throw new Error(`Poster is ${metadata.width} × ${metadata.height}; expected 1200 × 630.`);
	}
	if (size > imageBudget) {
		throw new Error(`Poster is ${(size / 1024).toFixed(1)} KiB; budget is 750 KiB.`);
	}
	const { data: pixels, info } = await sharp(bestBuffer)
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	let nonDarkPixels = 0;
	for (let offset = 0; offset < pixels.length; offset += info.channels) {
		if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) >= 32) nonDarkPixels += 1;
	}
	const nonDarkRatio = nonDarkPixels / (info.width * info.height);
	if (nonDarkRatio < 0.08) {
		throw new Error(
			`Poster appears blank or nearly black (${(nonDarkRatio * 100).toFixed(1)}% lit).`
		);
	}
	await writeFile(outputPath, bestBuffer);
	console.log(
		`Actual Perlin Bloom renderer saved: ${path.relative(projectRoot, outputPath)} (${metadata.width} × ${metadata.height}, ${(size / 1024).toFixed(1)} KiB, ${(nonDarkRatio * 100).toFixed(1)}% lit).`
	);
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
	throw new AggregateError(
		[taskError, ...cleanupFailures],
		'Poster generation and cleanup failed.'
	);
}
if (taskError) throw taskError;
if (cleanupFailures.length > 0) {
	throw new AggregateError(cleanupFailures, 'Poster cleanup did not complete.');
}
