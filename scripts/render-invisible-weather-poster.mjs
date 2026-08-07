import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INVISIBLE_WEATHER_POSTER_PORT ?? 4234);
const origin = `http://127.0.0.1:${port}`;
const articleUrl = new URL(
	'/blog/visualizations/the-museum-of-invisible-weather?iw_v=1&iw_seed=monsoon-ledger-1847&iw_preset=monsoon-ledger&iw_layout=salon-wall&iw_motion=still&iw_orientation=landscape',
	origin
).href;
const artifactDirectory = await mkdtemp(path.join(tmpdir(), 'invisible-weather-poster-'));
const rawPath = path.join(artifactDirectory, 'actual-renderer.png');
const outputPath = path.join(
	projectRoot,
	'static',
	'images',
	'the-museum-of-invisible-weather.png'
);
const imageBudget = 750 * 1024;
const skipBuild = process.env.INVISIBLE_WEATHER_SKIP_BUILD === '1';

await mkdir(artifactDirectory, { recursive: true });
await mkdir(path.dirname(outputPath), { recursive: true });

async function run(command, arguments_) {
	await new Promise((resolve, reject) => {
		const child = spawn(command, arguments_, {
			cwd: projectRoot,
			stdio: 'inherit',
			windowsHide: true
		});
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`${command} exited with status ${code}.`))
		);
	});
}

let createdBootstrapPoster = false;
try {
	await access(outputPath);
} catch {
	createdBootstrapPoster = true;
	await sharp({
		create: { width: 1600, height: 900, channels: 4, background: '#d8cfbf' }
	})
		.png()
		.toFile(outputPath);
}

const npmCli =
	process.env.npm_execpath ?? path.join(projectRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
if (!skipBuild) {
	try {
		await run(process.execPath, [npmCli, 'run', 'build:site']);
	} catch (error) {
		if (createdBootstrapPoster) await unlink(outputPath).catch(() => undefined);
		throw error;
	}
}

const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(
	process.execPath,
	[viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port)],
	{
		cwd: projectRoot,
		stdio: ['ignore', 'inherit', 'inherit'],
		windowsHide: true
	}
);

async function waitForServer() {
	let lastError;
	for (let attempt = 0; attempt < 160; attempt += 1) {
		try {
			const response = await fetch(articleUrl);
			if (response.ok) return;
			lastError = new Error(`Vite preview returned ${response.status}.`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw lastError ?? new Error('The local Vite preview did not become ready.');
}

let browser;
let wroteActualPoster = false;
try {
	await waitForServer();
	browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || (process.env.CI ? undefined : 'chrome'),
		headless: true
	});
	const page = await browser.newPage({
		deviceScaleFactor: 1,
		reducedMotion: 'reduce',
		viewport: { width: 1800, height: 1200 }
	});
	const diagnostics = [];
	page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			const source = `${message.location().url} ${message.text()}`;
			if (source.includes('/_vercel/')) return;
			diagnostics.push(`console ${message.type()}: ${message.text()}`);
		}
	});

	await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
	const exhibit = page.locator('#invisible-weather-exhibit');
	await exhibit.waitFor({ state: 'visible' });
	await exhibit.scrollIntoViewIfNeeded();

	const host = exhibit.getByTestId('invisible-weather-p5-host');
	await host.waitFor({ state: 'visible' });

	await page.waitForFunction(
		() => {
			const host = document.querySelector('[data-testid="invisible-weather-p5-host"]');
			const canvas = host?.querySelector('canvas[data-invisible-weather-canvas="true"]');
			if (!(canvas instanceof HTMLCanvasElement)) return false;
			return (
				host?.getAttribute('data-artwork-count') === '9' &&
				host?.getAttribute('data-motion') === 'still' &&
				Boolean(host?.getAttribute('data-recipe-hash')) &&
				canvas.width > 0 &&
				canvas.height > 0
			);
		},
		undefined,
		{ timeout: 60_000 }
	);
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))
			)
	);

	// Capture through the exhibit's real gallery-export path. This deliberately exercises
	// the same offscreen renderer and size policy visitors use, without racing p5's live
	// ResizeObserver while coercing the on-page canvas to poster dimensions.
	const exportMenu = exhibit.getByTestId('invisible-weather-export-menu');
	await exportMenu.locator('summary').click();
	const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
	await exportMenu.getByRole('button', { name: 'Gallery PNG · 1×', exact: true }).click();
	const download = await downloadPromise;
	const downloadError = await download.failure();
	if (downloadError) throw new Error(`Gallery export download failed: ${downloadError}`);
	await download.saveAs(rawPath);

	if (diagnostics.length > 0) {
		throw new Error(`Renderer emitted diagnostics:\n${diagnostics.join('\n')}`);
	}

	let bestBuffer;
	for (const colours of [256, 192, 128, 96]) {
		const candidate = await sharp(rawPath)
			.resize(1600, 900, { fit: 'cover', position: 'centre' })
			.flatten({ background: '#d8cfbf' })
			.png({
				compressionLevel: 9,
				adaptiveFiltering: true,
				palette: true,
				colours,
				dither: 0.8,
				effort: 10
			})
			.toBuffer();
		if (!bestBuffer || candidate.byteLength < bestBuffer.byteLength) bestBuffer = candidate;
		if (candidate.byteLength <= imageBudget) {
			bestBuffer = candidate;
			break;
		}
	}
	await writeFile(outputPath, bestBuffer);
	wroteActualPoster = true;

	const metadata = await sharp(outputPath).metadata();
	const size = (await stat(outputPath)).size;
	const budgetMessage =
		size <= imageBudget
			? 'within the 750 KiB media budget'
			: 'above 750 KiB after palette optimisation';
	console.log(
		`Actual Invisible Weather renderer saved: ${path.relative(projectRoot, outputPath)} (${metadata.width} × ${metadata.height}, ${(size / 1024).toFixed(1)} KiB, ${budgetMessage}).`
	);
} catch (error) {
	if (createdBootstrapPoster && !wroteActualPoster) {
		await unlink(outputPath).catch(() => undefined);
	}
	throw error;
} finally {
	await browser?.close();
	if (!server.killed) server.kill('SIGTERM');
	await rm(artifactDirectory, { recursive: true, force: true });
}
