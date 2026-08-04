import { access, mkdir, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.LIGHTNING_ATLAS_POSTER_PORT ?? 4217);
const previewOrigin = process.env.LIGHTNING_ATLAS_PREVIEW_ORIGIN ?? `http://127.0.0.1:${port}`;
const managesPreview = !process.env.LIGHTNING_ATLAS_PREVIEW_ORIGIN;
const articleUrl = new URL(
	'/blog/visualizations/lightning-atlas?v=1&terrain=kalbaisakhi-bengal&seed=kalbaisakhi-poster-21&mode=replay&scale=heroic&flash=negative-cg&strike=0&display=night&view=hero&flashSafe=1&webgl=on',
	previewOrigin
).href;
const artifactDirectory = path.join(projectRoot, 'artifacts', 'lightning-atlas');
const rawPath = path.join(artifactDirectory, 'actual-viewport.png');
const outputPath = path.join(projectRoot, 'static', 'images', 'lightning-atlas.png');

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
		create: { width: 1600, height: 900, channels: 4, background: '#07101f' }
	})
		.png()
		.toFile(outputPath);
}

if (managesPreview) {
	const npmCli =
		process.env.npm_execpath ?? path.join(projectRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
	try {
		await run(process.execPath, [npmCli, 'run', 'build:site']);
	} catch (error) {
		if (createdBootstrapPoster) await unlink(outputPath).catch(() => undefined);
		throw error;
	}
}

let preview;
if (managesPreview) {
	const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
	preview = spawn(
		process.execPath,
		[viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port)],
		{
			cwd: projectRoot,
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		}
	);
}

async function waitForPreview() {
	let lastError;
	for (let attempt = 0; attempt < 120; attempt += 1) {
		try {
			const response = await fetch(articleUrl);
			if (response.ok) return;
			lastError = new Error(`Preview returned ${response.status}.`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw lastError ?? new Error('Preview did not become ready.');
}

let browser;
try {
	await waitForPreview();
	browser = await chromium.launch({
		channel: process.env.PLAYWRIGHT_CHANNEL?.trim() || 'chrome',
		headless: true
	});
	const page = await browser.newPage({
		deviceScaleFactor: 2,
		reducedMotion: 'no-preference',
		viewport: { width: 1600, height: 1100 }
	});
	await page.goto(articleUrl, { waitUntil: 'domcontentloaded' });
	const laboratory = page.locator('figure.lightning-atlas');
	await laboratory.waitFor({ state: 'visible' });
	await laboratory.evaluate((element) => element.scrollIntoView({ block: 'center' }));
	const viewport = laboratory.locator('.viewport-frame');
	await viewport.waitFor({ state: 'visible' });
	await viewport.evaluate((element) => {
		const width = element.getBoundingClientRect().width;
		element.style.minHeight = '0';
		element.style.height = `${Math.round((width * 9) / 16)}px`;
	});
	await viewport.evaluate((element) => element.scrollIntoView({ block: 'center' }));
	await page.waitForFunction(
		() =>
			document.querySelector('.viewport-frame')?.getAttribute('data-renderer-status') === 'ready',
		undefined,
		{ timeout: 60_000 }
	);
	await laboratory.getByLabel('Flash type').selectOption('negative-cg');
	await laboratory.locator('.inspector').getByText('Negative', { exact: true }).waitFor();
	const pause = laboratory.getByRole('button', { name: 'Pause', exact: true }).first();
	if (await pause.isVisible()) await pause.click();
	await laboratory
		.getByRole('list', { name: 'Strike phases' })
		.getByRole('button', { name: 'Return stroke' })
		.click();
	const timeline = laboratory.getByLabel(/Storm replay time:/u);
	await timeline.evaluate((element) => {
		const input = element;
		input.value = String(Math.min(Number(input.max), Number(input.value) + 0.22));
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await page.waitForTimeout(400);
	await viewport.screenshot({ path: rawPath, animations: 'disabled' });
	await sharp(rawPath)
		.resize(1600, 900, { fit: 'cover', position: 'centre' })
		.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 94 })
		.toFile(outputPath);
	const metadata = await sharp(outputPath).metadata();
	console.log(
		`Actual Lightning Atlas viewport saved: ${path.relative(projectRoot, outputPath)} (${metadata.width} × ${metadata.height})`
	);
} finally {
	await browser?.close();
	if (preview && !preview.killed) preview.kill();
}
