import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME_PATH = '/blog/games/kagojer-dana-a-paper-plane-through-calcutta';
const PORT = Number(process.env.KAGOJER_DANA_ASSET_PORT ?? 4252);
const BASE_URL =
	process.env.KAGOJER_DANA_BASE_URL?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
// This deterministic seed contains all three capture-anchor heroes: Howrah
// Bridge, Victoria Memorial and Biswa Bangla Gate.
const SEED = process.env.KAGOJER_DANA_ASSET_SEED ?? 'KD-CAPTURE-2';
const STATIC_OUTPUT = path.join(ROOT, 'static', 'images', 'games');
const QA_OUTPUT = path.join(ROOT, '.codex-artifacts', 'kagojer-dana');
const VITE_ENTRY = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const startedServer = process.env.KAGOJER_DANA_BASE_URL ? null : startServer();

function startServer() {
	const child = spawn(
		process.execPath,
		[VITE_ENTRY, 'dev', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
		{
			cwd: ROOT,
			env: { ...process.env, NO_COLOR: '1' },
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		}
	);
	let output = '';
	child.stdout.on('data', (chunk) => (output = `${output}${chunk}`.slice(-12_000)));
	child.stderr.on('data', (chunk) => (output = `${output}${chunk}`.slice(-12_000)));
	child.latestOutput = () => output;
	return child;
}

async function waitForServer() {
	const deadline = Date.now() + 10 * 60_000;
	while (Date.now() < deadline) {
		if (startedServer && startedServer.exitCode !== null) {
			throw new Error(`Vite stopped before becoming ready.\n${startedServer.latestOutput()}`);
		}
		try {
			const response = await fetch(`${BASE_URL}${GAME_PATH}`, {
				signal: AbortSignal.timeout(5_000)
			});
			if (response.ok) return;
		} catch {
			// The first Svelte/Vite compilation can be long in this repository.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Timed out waiting for ${BASE_URL}.\n${startedServer?.latestOutput() ?? ''}`);
}

async function launchBrowser() {
	const options = {
		headless: true,
		args: process.env.CI
			? ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
			: ['--enable-webgl']
	};
	if (process.env.CI) return chromium.launch(options);
	try {
		return await chromium.launch({
			...options,
			channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome'
		});
	} catch {
		return chromium.launch(options);
	}
}

async function captureFrame(page, { mode, viewport, fileName }) {
	const failures = [];
	const consoleHandler = (message) => {
		if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
			failures.push(`console: ${message.text()}`);
		}
	};
	const pageErrorHandler = (error) => failures.push(`page: ${error.message}`);
	const responseHandler = (response) => {
		if (
			response.status() >= 400 &&
			(response.url().includes('/games/kagojer-dana/') || response.url().includes('/@fs/'))
		) {
			failures.push(`response ${response.status()}: ${response.url()}`);
		}
	};
	page.on('console', consoleHandler);
	page.on('pageerror', pageErrorHandler);
	page.on('response', responseHandler);
	try {
		await page.setViewportSize(viewport);
		console.log(`Capturing ${mode} at ${viewport.width}×${viewport.height}…`);
		const url = new URL(`${BASE_URL}${GAME_PATH}`);
		url.searchParams.set('kd_v', '1');
		url.searchParams.set('kd_seed', SEED);
		url.searchParams.set('kd_mode', 'curated');
		url.searchParams.set('kd_capture', mode);
		await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 5 * 60_000 });
		// The button is already present in SSR HTML; wait for Svelte to attach its
		// gesture handler before clicking it.
		await page.waitForTimeout(1_200);
		console.log(`  ${mode}: hydrated poster`);
		await page.getByRole('button', { name: 'Fly silently' }).click({ timeout: 60_000 });
		console.log(`  ${mode}: silent launch requested`);
		let phase = null;
		for (let attempt = 0; attempt < 120; attempt += 1) {
			phase = await page.locator('#game-experience').getAttribute('data-phase');
			if (phase === 'playing' || phase === 'error') break;
			await page.waitForTimeout(500);
		}
		if (phase !== 'playing') {
			const shellText = await page.locator('#game-experience').innerText();
			throw new Error(
				`${mode} renderer entered ${phase ?? 'no phase'}:\n${shellText.slice(0, 2_000)}`
			);
		}
		await page.locator('#game-experience canvas').waitFor({ state: 'visible', timeout: 15_000 });
		console.log(`  ${mode}: renderer ready`);
		// The public HUD remains visible during play, but the catalog/social artwork
		// should show the renderer itself rather than bake transient controls into it.
		await page.locator('#game-experience .hud').evaluate((element) => {
			element.style.visibility = 'hidden';
		});
		await page.waitForTimeout(2_200);
		const canvas = page.locator('#game-experience canvas');
		const png = await canvas.screenshot({ type: 'png', animations: 'disabled' });
		console.log(`  ${mode}: canvas captured`);
		const stats = await sharp(png).stats();
		const contrast =
			stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
		// High-register fog is deliberately pale; a single-digit standard deviation
		// still distinguishes a failed blank frame from the authored erased-distance look.
		if (contrast < 8) failures.push(`capture contrast was only ${contrast.toFixed(2)}`);
		if (failures.length > 0) throw new Error(`${mode} capture failed:\n${failures.join('\n')}`);
		await writeFile(path.join(QA_OUTPUT, fileName), png);
		console.log(`  ${mode}: wrote ${fileName}`);
		return png;
	} finally {
		page.off('console', consoleHandler);
		page.off('pageerror', pageErrorHandler);
		page.off('response', responseHandler);
	}
}

async function render() {
	await Promise.all([
		mkdir(STATIC_OUTPUT, { recursive: true }),
		mkdir(QA_OUTPUT, { recursive: true })
	]);
	await waitForServer();
	const browser = await launchBrowser();
	try {
		const landscape = { width: 1_440, height: 900 };
		const context = await browser.newContext({
			viewport: landscape,
			deviceScaleFactor: 1,
			reducedMotion: 'reduce',
			colorScheme: 'light'
		});
		const page = await context.newPage();
		const howrah = await captureFrame(page, {
			mode: 'howrah',
			viewport: landscape,
			fileName: 'howrah-bridge.png'
		});
		await Promise.all([
			sharp(howrah)
				.resize(1_200, 800, { fit: 'cover', position: 'centre' })
				.webp({ quality: 90, effort: 6 })
				.toFile(path.join(STATIC_OUTPUT, 'kagojer-dana-poster.webp')),
			sharp(howrah)
				.resize(1_200, 800, { fit: 'cover', position: 'centre' })
				.png({ compressionLevel: 9, palette: true })
				.toFile(path.join(STATIC_OUTPUT, 'kagojer-dana-social.png'))
		]);

		await sharp(howrah)
			.resize(800, 1_200, { fit: 'cover', position: 'centre' })
			.webp({ quality: 90, effort: 6 })
			.toFile(path.join(STATIC_OUTPUT, 'kagojer-dana-portrait.webp'));

		for (const definition of [
			{ mode: 'north', fileName: 'north-lane.png' },
			{ mode: 'maidan', fileName: 'maidan.png' },
			{ mode: 'newtown', fileName: 'new-town.png' },
			{ mode: 'low', fileName: 'low-register.png' },
			{ mode: 'middle', fileName: 'middle-register.png' },
			{ mode: 'high', fileName: 'high-register.png' }
		]) {
			await captureFrame(page, {
				...definition,
				viewport: landscape
			});
		}
	} finally {
		await browser.close();
	}
}

try {
	await render();
	console.log(`Rendered Kagojer Dana game-derived assets with seed ${SEED}.`);
} finally {
	if (startedServer && startedServer.exitCode === null) startedServer.kill();
}
