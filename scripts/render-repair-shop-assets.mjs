import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME_PATH = '/blog/games/the-repair-shop-on-the-corner';
const PORT = Number(process.env.REPAIR_SHOP_ASSET_PORT ?? 4256);
const BASE_URL = process.env.REPAIR_SHOP_BASE_URL?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const STATIC_OUTPUT = path.join(ROOT, 'static', 'images', 'games');
const COVER_PATH = path.join(STATIC_OUTPUT, 'the-repair-shop-on-the-corner-cover.webp');
const SOCIAL_PATH = path.join(STATIC_OUTPUT, 'the-repair-shop-on-the-corner-social.png');
const QA_OUTPUT = path.join(ROOT, '.codex-artifacts', 'the-repair-shop-on-the-corner');
const VITE_ENTRY = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

async function fileExists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function ensureBootstrapArtwork() {
	await mkdir(STATIC_OUTPUT, { recursive: true });
	const [hasCover, hasSocial] = await Promise.all([
		fileExists(COVER_PATH),
		fileExists(SOCIAL_PATH)
	]);
	if (!hasCover) {
		await sharp({
			create: { width: 1200, height: 800, channels: 3, background: { r: 44, g: 32, b: 22 } }
		})
			.webp({ quality: 80 })
			.toFile(COVER_PATH);
	}
	if (!hasSocial) {
		await sharp({
			create: { width: 1200, height: 800, channels: 3, background: { r: 44, g: 32, b: 22 } }
		})
			.png()
			.toFile(SOCIAL_PATH);
	}
}

function runViteBuild() {
	console.log('Building production site bundle for deterministic preview capture…');
	const existingNodeOpts = process.env.NODE_OPTIONS ?? '';
	const nodeOptions = existingNodeOpts.includes('max-old-space-size')
		? existingNodeOpts
		: `${existingNodeOpts} --max-old-space-size=8192`.trim();
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [VITE_ENTRY, 'build'], {
			cwd: ROOT,
			env: { ...process.env, NO_COLOR: '1', NODE_OPTIONS: nodeOptions },
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		});
		let output = '';
		child.stdout.on('data', (chunk) => (output = `${output}${chunk}`.slice(-24_000)));
		child.stderr.on('data', (chunk) => (output = `${output}${chunk}`.slice(-24_000)));
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				console.log('Vite build completed.');
				resolve();
			} else {
				reject(new Error(`Vite build exited with code ${code}.\n${output}`));
			}
		});
	});
}

function startPreviewServer() {
	const child = spawn(
		process.execPath,
		[VITE_ENTRY, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
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

let startedServer = null;

async function waitForServer() {
	const deadline = Date.now() + 2 * 60_000;
	while (Date.now() < deadline) {
		if (startedServer && startedServer.exitCode !== null) {
			throw new Error(`Vite preview exited early.\n${startedServer.latestOutput()}`);
		}
		try {
			const response = await fetch(`${BASE_URL}${GAME_PATH}`, {
				signal: AbortSignal.timeout(5_000)
			});
			if (response.ok) return;
		} catch {
			// Wait for preview listener.
		}
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	throw new Error(
		`Timed out waiting for preview at ${BASE_URL}${GAME_PATH}.\n${startedServer?.latestOutput() ?? ''}`
	);
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
		return chromium.launch({
			headless: true,
			args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
		});
	}
}

async function waitForPlayingPhase(page) {
	for (let i = 0; i < 120; i += 1) {
		const phase = await page.locator('#game-experience').getAttribute('data-phase');
		if (phase === 'playing') return;
		if (phase === 'error') {
			const text = await page.locator('#game-experience').innerText();
			throw new Error(`Renderer entered error state:\n${text}`);
		}
		await page.waitForTimeout(300);
	}
	throw new Error('Timed out waiting for data-phase="playing".');
}

async function setSliderValue(locator, value) {
	await locator.evaluate((el, v) => {
		el.value = String(v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
		el.dispatchEvent(new Event('change', { bubbles: true }));
	}, value);
}

async function render() {
	await Promise.all([
		mkdir(STATIC_OUTPUT, { recursive: true }),
		mkdir(QA_OUTPUT, { recursive: true })
	]);
	if (!process.env.REPAIR_SHOP_BASE_URL) {
		await ensureBootstrapArtwork();
		const skipBuild =
			process.argv.includes('--skip-build') || process.env.REPAIR_SHOP_SKIP_BUILD === '1';
		if (!skipBuild) {
			await runViteBuild();
		}
		startedServer = startPreviewServer();
	}
	await waitForServer();

	const browser = await launchBrowser();
	try {
		const desktop = { width: 1440, height: 900 };
		const context = await browser.newContext({
			serviceWorkers: 'block',
			viewport: desktop,
			deviceScaleFactor: 1
		});
		const page = await context.newPage();

		const failures = [];
		page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));

		await page.goto(`${BASE_URL}${GAME_PATH}`, {
			waitUntil: 'domcontentloaded',
			timeout: 5 * 60_000
		});
		await page.waitForTimeout(1200);

		// Hide privacy consent pill during clean asset capture only
		await page
			.locator('[data-privacy-note], [data-privacy-settings], .privacy-status')
			.evaluateAll((els) => {
				for (const el of els) el.style.visibility = 'hidden';
			});

		// 1. Poster screenshot
		const shell = page.locator('#game-experience');
		await writeFile(
			path.join(QA_OUTPUT, '01-poster.png'),
			await shell.screenshot({ type: 'png', animations: 'disabled' })
		);

		// Enter workshop quietly
		await page.getByRole('button', { name: 'Enter shop quietly' }).click();
		await waitForPlayingPhase(page);
		await page.waitForTimeout(900);

		// 2. Explore with HUD
		await writeFile(
			path.join(QA_OUTPUT, '03-explore-with-hud.png'),
			await shell.screenshot({ type: 'png', animations: 'disabled' })
		);

		// Clean 3D neighbourhood shot for Cover & Social artwork (hide HUD overlay briefly)
		await page.locator('#game-experience .hud-layer').evaluateAll((els) => {
			for (const el of els) el.style.visibility = 'hidden';
		});
		await page.waitForTimeout(80);
		const canvas = page.locator('#game-experience canvas');
		const cleanCanvasPng = await canvas.screenshot({ type: 'png', animations: 'disabled' });
		await page.locator('#game-experience .hud-layer').evaluateAll((els) => {
			for (const el of els) el.style.visibility = '';
		});
		await page.waitForTimeout(60);
		const stats = await sharp(cleanCanvasPng).stats();
		const stdev = stats.channels.slice(0, 3).reduce((sum, ch) => sum + ch.stdev, 0) / 3;
		if (stdev < 10) {
			throw new Error(`3D canvas contrast too low (${stdev.toFixed(2)}) — possible blank frame.`);
		}
		await writeFile(path.join(QA_OUTPUT, '02-shop-and-lane-clean.png'), cleanCanvasPng);

		await Promise.all([
			sharp(cleanCanvasPng)
				.resize(1200, 800, { fit: 'cover', position: 'centre' })
				.webp({ quality: 88, effort: 6 })
				.toFile(path.join(STATIC_OUTPUT, 'the-repair-shop-on-the-corner-cover.webp')),
			sharp(cleanCanvasPng)
				.resize(1200, 800, { fit: 'cover', position: 'centre' })
				.png({ compressionLevel: 9, palette: true })
				.toFile(path.join(STATIC_OUTPUT, 'the-repair-shop-on-the-corner-social.png'))
		]);

		// 3. Accept Radio from Bapi & open back on workbench
		await page
			.getByRole('button', { name: /Talk to Bapi/i })
			.first()
			.click();
		await page
			.getByRole('button', { name: 'Accept radio and take a look' })
			.click({ timeout: 20_000 });
		await page.getByRole('button', { name: 'Switch power on' }).click();
		await page.getByRole('button', { name: 'Test & tilt radio' }).click();
		await page.getByRole('button', { name: /Power: ON/i }).click();
		await page.getByRole('button', { name: /Unscrew back screw/i }).click();
		await page.getByRole('button', { name: /Unscrew back screw/i }).click();
		await page.getByRole('button', { name: 'Open back cover' }).click();
		await page.getByRole('button', { name: 'Back', exact: true }).click();
		await page.getByRole('button', { name: /Inspect Speaker spade connector/i }).click();
		await page.waitForTimeout(450);

		await writeFile(
			path.join(QA_OUTPUT, '04-radio-workbench-open.png'),
			await shell.screenshot({ type: 'png', animations: 'disabled' })
		);

		// Mobile portrait check right on the open Radio workbench!
		await page.setViewportSize({ width: 390, height: 844 });
		await page.waitForTimeout(500);
		await writeFile(
			path.join(QA_OUTPUT, '07-mobile-portrait-workbench.png'),
			await shell.screenshot({ type: 'png', animations: 'disabled' })
		);
		await page.setViewportSize(desktop);
		await page.waitForTimeout(400);

		// Finish Radio repair & return to Bapi + get spare belt
		await page.getByRole('button', { name: 'Seat speaker connector firmly' }).click();
		await page.getByRole('button', { name: 'Close back cover' }).click();
		await page
			.getByRole('button', { name: /Fasten screw/i })
			.first()
			.click();
		await page
			.getByRole('button', { name: /Fasten screw/i })
			.first()
			.click();
		await page.getByRole('button', { name: 'Switch power on' }).click();
		await setSliderValue(page.getByLabel('Radio tuning dial'), 70);
		await page.getByRole('button', { name: 'Test & tilt radio' }).click();
		await page.getByRole('button', { name: /Carry back to Bapi Mondal/i }).click();
		await page
			.getByRole('button', { name: 'Return the repaired radio' })
			.click({ timeout: 25_000 });
		// Ask Bapi for spare belts right away (we are standing right at Bapi's tea stall!)
		await page
			.getByRole('button', { name: /Ask Bapi about rubber belts/i })
			.first()
			.click();
		await page.getByRole('button', { name: 'Ask about the spare rubber belts' }).click();
		await page.getByRole('button', { name: 'Take spare rubber belts to the shop' }).click();

		// 4. Accept Mala's Clock & capture open gear train
		await page.getByRole('button', { name: 'Walk & Visit…' }).click();
		await page.getByRole('button', { name: /Talk to Mala/i }).click();
		await page.getByRole('button', { name: 'Accept the wind-up clock' }).click({ timeout: 25_000 });
		await page.getByRole('button', { name: /Unscrew thumbscrew/i }).click();
		await page.getByRole('button', { name: /Unscrew thumbscrew/i }).click();
		await page.getByRole('button', { name: 'Open brass back plate' }).click();
		await page.waitForTimeout(450);

		await writeFile(
			path.join(QA_OUTPUT, '05-clock-workbench-gears.png'),
			await shell.screenshot({ type: 'png', animations: 'disabled' })
		);

		// Arrange gears (Large -> Shaft 1, Medium -> Shaft 2, Small -> Shaft 3), test, close, set hands, return
		const moveBtns = page.getByRole('button', { name: 'Move…' });
		await moveBtns.nth(0).click(); // Large
		await page.getByRole('button', { name: 'Shaft 1 (Left)' }).click();
		await moveBtns.nth(1).click(); // Medium
		await page.getByRole('button', { name: 'Shaft 2 (Centre)' }).click();
		await moveBtns.nth(2).click(); // Small
		await page.getByRole('button', { name: 'Shaft 3 (Right)' }).click();
		await page.getByRole('button', { name: 'Turn winding key slowly' }).click();
		await page.getByRole('button', { name: 'Close brass back plate' }).click();
		await page
			.getByRole('button', { name: /Fasten thumbscrew/i })
			.first()
			.click();
		await page
			.getByRole('button', { name: /Fasten thumbscrew/i })
			.first()
			.click();
		await setSliderValue(page.getByLabel('Set clock hands time'), 270);
		await page.getByRole('button', { name: /Carry back to Mala Sen/i }).click();
		await page.getByRole('button', { name: 'Return the wind-up clock' }).click({ timeout: 25_000 });

		// 5. Accept Ruma's Projector, repair belt + route, focus test card, capture!
		await page.getByRole('button', { name: 'Walk & Visit…' }).click();
		await page.getByRole('button', { name: /Talk to Ruma/i }).click();
		await page.getByRole('button', { name: 'Accept the film projector' }).click({
			timeout: 25_000
		});
		await page.getByRole('button', { name: 'Open side cover' }).click();
		await page.getByRole('button', { name: 'Remove perished belt' }).click();
		await page.getByRole('button', { name: 'Fit spare belt from Bapi' }).click();
		await page.getByRole('button', { name: 'Rewind film leader' }).click();
		await page.getByRole('button', { name: /Thread Upper guide roller/i }).click();
		await page.getByRole('button', { name: /Thread Aperture gate/i }).click();
		await page.getByRole('button', { name: /Thread Toothed drive sprocket/i }).click();
		await page.getByRole('button', { name: /Thread Lower tension guide/i }).click();
		await page.getByRole('button', { name: /Thread Take-up spool hub/i }).click();
		await page.getByRole('button', { name: 'Turn mechanism manually' }).click();
		await page.getByRole('button', { name: 'Close side cover' }).click();
		await page.getByRole('button', { name: 'Switch projector on' }).click();
		await setSliderValue(page.getByLabel('Projector lens focus barrel'), 59);
		await page.getByRole('button', { name: 'Angle', exact: true }).click();
		await page.waitForTimeout(500);

		await writeFile(
			path.join(QA_OUTPUT, '06-projector-workbench-focus.png'),
			await shell.screenshot({ type: 'png', animations: 'disabled' })
		);

		// 6. Return Projector to Ruma & start Courtyard Film Screening!
		await page.getByRole('button', { name: /Carry back to Ruma Chatterjee/i }).click();
		await page
			.getByRole('button', { name: 'Place repaired projector on courtyard table' })
			.click({ timeout: 25_000 });
		await page
			.getByRole('button', { name: /Start courtyard film screening/i })
			.first()
			.click();
		await page.waitForTimeout(7500); // Advance into Scene 2 (Calcutta Terraces & Kites!)

		await writeFile(
			path.join(QA_OUTPUT, '08-courtyard-screening.png'),
			await shell.screenshot({ type: 'png', animations: 'disabled' })
		);

		if (failures.length > 0) {
			throw new Error(`Page errors during capture:\n${failures.join('\n')}`);
		}
	} finally {
		await browser.close();
	}
}

try {
	await render();
	console.log('Rendered The Repair Shop on the Corner cover, social image, and QA captures.');
} finally {
	if (startedServer && startedServer.exitCode === null) startedServer.kill();
}
