/**
 * Deterministic, real-browser publication capture.
 * Start the site on BASE_URL (default http://127.0.0.1:4251), then run:
 * node --experimental-strip-types scripts/render-scale-elevator-assets.mjs
 * FFMPEG_PATH selects a native FFmpeg executable; no shell or download is used.
 */
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import {
	DEFAULT_STATE,
	FLOORS,
	TOUR_DURATION,
	tourProgress
} from '../src/lib/visualizations/scale-elevator/core.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_DIR = path.join(ROOT, 'static/images/visualizations/scale-elevator');
const VIDEO_DIR = path.join(ROOT, 'static/videos/visualizations/scale-elevator');
const MANIFEST = path.join(IMAGE_DIR, 'assets.json');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4251';
const CHECK = process.argv.includes('--check');
const STILLS_ONLY = process.argv.includes('--stills-only');
const VIDEO_ONLY = process.argv.includes('--video-only');
const BENCHMARK = process.argv.includes('--benchmark');
const INSPECT_VIDEO = process.argv.includes('--inspect-video');
const SOURCE_PATHS = [
	'src/lib/visualizations/scale-elevator/types.ts',
	'src/lib/visualizations/scale-elevator/core.ts',
	'src/lib/visualizations/scale-elevator/renderer.ts',
	'src/lib/components/visualizations/scale-elevator/ScaleElevator.svelte',
	'src/lib/components/visualizations/scale-elevator/ScaleStage.svelte',
	'src/lib/components/visualizations/scale-elevator/ScaleChart.svelte',
	'src/lib/components/visualizations/scale-elevator/scale-elevator.css',
	'scripts/render-scale-elevator-assets.mjs'
];
const SCHEMA = 1;
const CAPTURE_VERSION = 'scale-elevator-browser-capture-v1';
const MODEL_VERSION = 'scale-elevator-v1';
const VIEWPORT = { width: 1440, height: 1200 };
const FPS = 24;
const MAX_STILL_BYTES = 750_000;
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const SEED = 20261021;
const STATE = { ...DEFAULT_STATE, scenario: 'baseline', control: 0.5, selected: 0, seed: SEED };
const VIDEO_PATH = path.join(VIDEO_DIR, 'scale-elevator-tour.mp4');
const SOCIAL_NAME = 'scale-elevator-social.jpg';
const OVERVIEW_NAME = 'scale-elevator-overview.jpg';
const SOURCE_PROVENANCE = [
	{ title: 'RCSB PDB-101: Haemoglobin', url: 'https://pdb101.rcsb.org/motm/41' },
	{ title: 'RCSB PDB-101: Cytochrome c oxidase', url: 'https://pdb101.rcsb.org/motm/5' },
	{
		title: 'FDA: Pulse oximeters',
		url: 'https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters'
	},
	{
		title: 'WHO: Technical specifications for health facility based medical oxygen systems',
		url: 'https://www.who.int/publications/i/item/9789240101616'
	}
];

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
function relative(filename) {
	return path.relative(ROOT, filename).split(path.sep).join('/');
}
function xml(value) {
	return String(value).replace(
		/[&<>"']/g,
		(character) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]
	);
}
function svg(width, height, content) {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`
	);
}
function progress(message) {
	process.stdout.write(`[scale-elevator] ${message}\n`);
}

// Match Playwright's locator screenshot enclosing-pixel crop, including fractional borders.
function enclosingClip(bounds) {
	if (!bounds) throw new Error('No capture card bounds.');
	const x = Math.floor(bounds.x + 0.001);
	const y = Math.floor(bounds.y + 0.001);
	return {
		x,
		y,
		width: Math.ceil(bounds.x + bounds.width - 0.001) - x,
		height: Math.ceil(bounds.y + bounds.height - 0.001) - y
	};
}

async function sourceHash() {
	const contents = await Promise.all(
		SOURCE_PATHS.map(
			async (filename) =>
				`${filename}\0${(await readFile(path.join(ROOT, filename), 'utf8')).replace(/\r\n?/g, '\n')}`
		)
	);
	return sha256(`${SCHEMA}\0${CAPTURE_VERSION}\0${contents.join('\0')}`);
}

async function imageMetadata(filename, kind, floor = undefined) {
	const metadata = await sharp(filename).metadata();
	const info = await stat(filename);
	if (!metadata.width || !metadata.height || metadata.format !== 'jpeg')
		throw new Error(`Invalid JPEG: ${relative(filename)}`);
	if (metadata.width > 1920 || metadata.height > 1920)
		throw new Error(`Image exceeds 1920 px: ${relative(filename)}`);
	if (info.size > MAX_STILL_BYTES)
		throw new Error(`Image exceeds ${MAX_STILL_BYTES} bytes: ${relative(filename)}`);
	return {
		path: relative(filename),
		kind,
		...(floor ? { floor } : {}),
		width: metadata.width,
		height: metadata.height,
		byteBudget: MAX_STILL_BYTES
	};
}

async function writeJpeg(buffer, filename, options = {}) {
	await sharp(buffer)
		.resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 80, mozjpeg: true, ...options })
		.toFile(filename);
}

/** Read only the MP4 movie/track headers; no platform-specific ffprobe dependency. */
function mp4Metadata(buffer) {
	function atoms(start, end) {
		const result = [];
		let offset = start;
		while (offset + 8 <= end) {
			let size = buffer.readUInt32BE(offset);
			let header = 8;
			const type = buffer.toString('ascii', offset + 4, offset + 8);
			if (size === 1) {
				if (offset + 16 > end) break;
				size = Number(buffer.readBigUInt64BE(offset + 8));
				header = 16;
			}
			if (size === 0) size = end - offset;
			if (size < header || offset + size > end) throw new Error('Malformed MP4 atom bounds.');
			result.push({ type, start: offset + header, end: offset + size });
			offset += size;
		}
		return result;
	}
	const top = atoms(0, buffer.length);
	const movie = top.find((atom) => atom.type === 'moov');
	if (!movie || !top.some((atom) => atom.type === 'ftyp')) throw new Error('Not a complete MP4.');
	const children = atoms(movie.start, movie.end);
	const header = children.find((atom) => atom.type === 'mvhd');
	if (!header) throw new Error('MP4 has no movie timing header.');
	const version = buffer[header.start];
	const timescale = buffer.readUInt32BE(header.start + (version === 1 ? 20 : 12));
	const duration =
		version === 1
			? Number(buffer.readBigUInt64BE(header.start + 24))
			: buffer.readUInt32BE(header.start + 16);
	const tracks = children.filter((atom) => atom.type === 'trak');
	let width = 0,
		height = 0,
		displayWidth = 0;
	for (const track of tracks) {
		const trackChildren = atoms(track.start, track.end);
		const trackHeader = trackChildren.find((atom) => atom.type === 'tkhd');
		const media = trackChildren.find((atom) => atom.type === 'mdia');
		if (!trackHeader || !media) continue;
		const mediaInfo = atoms(media.start, media.end).find((atom) => atom.type === 'minf');
		if (!mediaInfo) continue;
		const sampleTable = atoms(mediaInfo.start, mediaInfo.end).find((atom) => atom.type === 'stbl');
		if (!sampleTable) continue;
		const descriptions = atoms(sampleTable.start, sampleTable.end).find(
			(atom) => atom.type === 'stsd'
		);
		if (!descriptions) continue;
		const avc = atoms(descriptions.start + 8, descriptions.end).find(
			(atom) => atom.type === 'avc1'
		);
		if (!avc || avc.start + 28 > avc.end) continue;
		// tkhd encodes a display rectangle, which can be fractional for non-square SAR.
		// The AVC visual sample entry gives the actual integer coded-pixel dimensions.
		const codedWidth = buffer.readUInt16BE(avc.start + 24);
		const codedHeight = buffer.readUInt16BE(avc.start + 26);
		if (codedWidth > width) {
			width = codedWidth;
			height = codedHeight;
			displayWidth = buffer.readUInt32BE(trackHeader.end - 8) / 65536;
		}
	}
	if (!timescale || !width || !height || !buffer.includes(Buffer.from('avc1')))
		throw new Error('MP4 lacks a playable H.264 video track.');
	return {
		width,
		height,
		displayWidth,
		duration: duration / timescale,
		codec: 'H.264 / AVC',
		container: 'MP4'
	};
}

async function videoMetadata() {
	const buffer = await readFile(VIDEO_PATH);
	if (buffer.length > MAX_VIDEO_BYTES) throw new Error('Recording exceeds the 15 MiB budget.');
	const metadata = mp4Metadata(buffer);
	if (
		metadata.width !== 1280 ||
		metadata.height % 2 ||
		Math.abs(metadata.duration - TOUR_DURATION) > 0.12
	)
		throw new Error(`Unexpected recording dimensions or duration: ${JSON.stringify(metadata)}`);
	return {
		path: relative(VIDEO_PATH),
		...metadata,
		bytes: buffer.length,
		fps: FPS,
		frames: FPS * TOUR_DURATION,
		byteBudget: MAX_VIDEO_BYTES,
		sha256: sha256(buffer)
	};
}

async function check() {
	const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
	if (
		manifest.schemaVersion !== SCHEMA ||
		manifest.captureVersion !== CAPTURE_VERSION ||
		manifest.modelVersion !== MODEL_VERSION
	)
		throw new Error('Asset manifest version is stale.');
	if (manifest.sourceHash !== (await sourceHash()))
		throw new Error('Scale Elevator source changed after capture. Regenerate publication assets.');
	if (JSON.stringify(manifest.sourceFiles) !== JSON.stringify(SOURCE_PATHS))
		throw new Error('Asset manifest source coverage differs.');
	const expectedNames = FLOORS.flatMap((floor, index) => [
		`${String(index + 1).padStart(2, '0')}-${floor.id}.jpg`,
		`scene-${String(index + 1).padStart(2, '0')}-${floor.id}.jpg`
	]).concat([OVERVIEW_NAME, SOCIAL_NAME]);
	if (manifest.images.length !== expectedNames.length)
		throw new Error(
			'Asset manifest must contain eleven annotated stills, eleven clean views, and two montages.'
		);
	for (const name of expectedNames) {
		const record = manifest.images.find(
			(item) => item.path === relative(path.join(IMAGE_DIR, name))
		);
		if (!record) throw new Error(`Asset manifest is missing ${name}.`);
		const actual = await imageMetadata(path.join(ROOT, record.path), record.kind, record.floor);
		if (actual.width !== record.width || actual.height !== record.height)
			throw new Error(`Image dimensions changed: ${name}.`);
	}
	const social = manifest.images.find((item) => item.path.endsWith(SOCIAL_NAME));
	const overview = manifest.images.find((item) => item.path.endsWith(OVERVIEW_NAME));
	if (social.width !== 1200 || social.height !== 630 || overview.width !== 1800)
		throw new Error('Montage dimensions are incorrect.');
	if (!manifest.video) throw new Error('The continuous zoom recording has not been captured.');
	const recording = await videoMetadata();
	if (
		recording.sha256 !== manifest.video.sha256 ||
		recording.width !== manifest.video.width ||
		recording.height !== manifest.video.height
	)
		throw new Error('Recording differs from the verified manifest.');
	progress(
		`Verified ${manifest.images.length} JPEGs and ${recording.duration.toFixed(2)} s H.264 recording; source manifest current.`
	);
}

async function browserSession() {
	const browser = await chromium.launch({
		channel: 'chrome',
		headless: true,
		args: [
			'--use-gl=angle',
			'--use-angle=swiftshader',
			'--enable-unsafe-swiftshader',
			'--disable-dev-shm-usage'
		]
	});
	try {
		const context = await browser.newContext({
			viewport: VIEWPORT,
			deviceScaleFactor: 1,
			reducedMotion: 'reduce',
			colorScheme: 'light',
			serviceWorkers: 'block'
		});
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.setDefaultTimeout(45_000);
		progress(`Opening ${BASE_URL}; waiting for the article and its renderer.`);
		await page.goto(
			`${BASE_URL}/blog/visualizations/the-scale-elevator-from-ion-to-city?se-capture=1&motion=reduce`,
			{ waitUntil: 'domcontentloaded', timeout: 180_000 }
		);
		const root = page.getByTestId('scale-elevator');
		progress('Article response loaded; awaiting hydration.');
		await root.waitFor();
		await root.scrollIntoViewIfNeeded();
		await page.waitForFunction(
			() =>
				document.querySelector('[data-testid="scale-elevator"]')?.getAttribute('data-hydrated') ===
				'true',
			null,
			{ timeout: 180_000 }
		);
		progress('Interactive root hydrated; awaiting WebGL.');
		await page.waitForFunction(
			() =>
				document.querySelector('[data-testid="scale-elevator"]')?.getAttribute('data-status') ===
				'ready',
			null,
			{ timeout: 180_000 }
		);
		await page.evaluate(() => document.fonts.ready);
		await page.addStyleTag({ content: '.site-header{visibility:hidden!important}' });
		const card = page.getByTestId('scale-capture');
		const stage = page.getByTestId('scale-stage').locator('canvas');
		async function setState(position, time = 1.25) {
			await page.evaluate(
				async (detail) => {
					const target = document.querySelector('[data-testid="scale-elevator"]');
					if (!target) throw new Error('Capture root disappeared.');
					target.dispatchEvent(new CustomEvent('scale-capture', { detail }));
					await new Promise(requestAnimationFrame);
					await new Promise(requestAnimationFrame);
				},
				{ ...STATE, progress: position, time }
			);
			const actual = await root.getAttribute('data-progress');
			if (actual !== position.toFixed(4))
				throw new Error(`Capture state did not settle: wanted ${position}, received ${actual}.`);
			await page.waitForFunction(
				(expected) =>
					document
						.querySelector('[data-testid="scale-stage"]')
						?.getAttribute('data-render-progress') === expected,
				position.toFixed(4)
			);
			if (errors.length) throw new Error(`Browser runtime error: ${errors.join('; ')}`);
		}
		// All frames have the same crop even when explanations wrap to different heights.
		let workbenchHeight = 0,
			passportHeight = 0;
		for (let floor = 0; floor < FLOORS.length; floor++) {
			await setState(floor);
			const sizes = await page.evaluate(() => ({
				workbench: document.querySelector('.se-workbench').getBoundingClientRect().height,
				passport: document.querySelector('.se-passport').getBoundingClientRect().height
			}));
			workbenchHeight = Math.max(workbenchHeight, sizes.workbench);
			passportHeight = Math.max(passportHeight, sizes.passport);
		}
		await page.addStyleTag({
			content: `.se-capture-mode .se-workbench{min-height:${Math.ceil(workbenchHeight)}px}.se-capture-mode .se-passport{min-height:${Math.ceil(passportHeight)}px}`
		});
		await setState(0);
		const bounds = await card.boundingBox();
		if (!bounds || bounds.width < 1000 || bounds.height > 1920)
			throw new Error(`Unexpected capture card bounds: ${JSON.stringify(bounds)}`);
		return {
			browser,
			page,
			card,
			stage,
			setState,
			errors,
			layout: {
				cardWidth: Math.round(bounds.width),
				cardHeight: Math.round(bounds.height),
				workbenchHeight: Math.ceil(workbenchHeight),
				passportHeight: Math.ceil(passportHeight)
			}
		};
	} catch (error) {
		await browser.close();
		throw error;
	}
}

async function captureStills(session) {
	const images = [];
	for (const [index, floor] of FLOORS.entries()) {
		await session.setState(index);
		const prefix = `${String(index + 1).padStart(2, '0')}-${floor.id}`;
		const annotated = path.join(IMAGE_DIR, `${prefix}.jpg`);
		const clean = path.join(IMAGE_DIR, `scene-${prefix}.jpg`);
		await writeJpeg(
			await session.card.screenshot({
				type: 'jpeg',
				quality: 90,
				animations: 'disabled',
				caret: 'hide'
			}),
			annotated
		);
		const hideOverlays = await session.page.addStyleTag({
			content: '.se-stage-heading,.se-stage-corner,.se-stage-caption{visibility:hidden!important}'
		});
		try {
			await writeJpeg(
				await session.stage.screenshot({
					type: 'jpeg',
					quality: 90,
					animations: 'disabled',
					caret: 'hide'
				}),
				clean
			);
		} finally {
			await hideOverlays.evaluate((element) => element.remove());
		}
		images.push(
			await imageMetadata(annotated, 'annotated-floor', floor.id),
			await imageMetadata(clean, 'clean-scene', floor.id)
		);
		progress(`Still ${index + 1}/11: ${floor.name}`);
	}
	images.push(...(await montages()));
	return images;
}

async function montages() {
	const overviewWidth = 1800,
		overviewHeight = 1140;
	const overviewLayers = [];
	let labels = `<rect width="1800" height="1140" fill="#0a1723"/><text x="42" y="56" fill="#82f4ed" font-family="Arial,sans-serif" font-size="15" letter-spacing="3">ONE PHENOMENON · ELEVEN WAYS OF SEEING</text><text x="42" y="111" fill="#eeece0" font-family="Georgia,serif" font-size="43">The Scale Elevator — From Ion to City</text><text x="42" y="146" fill="#9cb8c2" font-family="Arial,sans-serif" font-size="18">Oxygen changes meaning with its place, denominator and clock.</text>`;
	for (const [index, floor] of FLOORS.entries()) {
		const x = 27 + (index % 4) * 443;
		const y = 188 + Math.floor(index / 4) * 292;
		const preview = await sharp(
			path.join(IMAGE_DIR, `scene-${String(index + 1).padStart(2, '0')}-${floor.id}.jpg`)
		)
			.resize(421, 221, { fit: 'contain', background: '#0a1723' })
			.toBuffer();
		overviewLayers.push({ input: preview, left: x, top: y + 35 });
		labels += `<path d="M${x},${y + 270}h421" stroke="#314a58"/><text x="${x + 8}" y="${y + 25}" fill="#e3e5d9" font-family="Georgia,serif" font-size="25">${String(index + 1).padStart(2, '0')} / ${xml(floor.name)}</text><text x="${x + 8}" y="${y + 286}" fill="#96bac2" font-family="Arial,sans-serif" font-size="13">${xml(floor.unit)} · ${xml(floor.verb.toLowerCase())}</text>`;
	}
	labels += `<text x="1380" y="922" fill="#82f4ed" font-family="Georgia,serif" font-size="66">O₂</text><text x="1380" y="962" fill="#e1e4da" font-family="Georgia,serif" font-size="23">Follow the role.</text><text x="1380" y="991" fill="#a0bcc3" font-family="Arial,sans-serif" font-size="15">Synthetic educational models</text><text x="1380" y="1017" fill="#a0bcc3" font-family="Arial,sans-serif" font-size="15">SUVROGHOSH.IN</text><path d="M42,1090H1758" stroke="#82f4ed"/><text x="42" y="1120" fill="#a0bcc3" font-family="Arial,sans-serif" font-size="14">Actual views from the interactive exhibit · Baseline · Seed ${SEED} · Model v1</text>`;
	const background = svg(overviewWidth, overviewHeight, labels);
	// Images are composed first; the transparent type overlay stays above the real scenes.
	const overview = await sharp({
		create: { width: overviewWidth, height: overviewHeight, channels: 3, background: '#0a1723' }
	})
		.composite([{ input: background }, ...overviewLayers])
		.jpeg({ quality: 80, mozjpeg: true })
		.toBuffer();
	await writeJpeg(overview, path.join(IMAGE_DIR, OVERVIEW_NAME));

	const socialLayers = [];
	let socialLabels = `<text x="31" y="30" fill="#82f4ed" font-family="Arial,sans-serif" font-size="11" letter-spacing="2">AN OXYGEN JOURNEY · SUVROGHOSH.IN</text><text x="30" y="83" fill="#eeece0" font-family="Georgia,serif" font-size="47">The Scale Elevator</text><text x="32" y="120" fill="#c9d7d6" font-family="Georgia,serif" font-size="27">From Ion to City</text>`;
	for (const [index, floor] of FLOORS.entries()) {
		const x = 24 + (index % 6) * 193;
		const y = 151 + Math.floor(index / 6) * 187;
		const preview = await sharp(
			path.join(IMAGE_DIR, `scene-${String(index + 1).padStart(2, '0')}-${floor.id}.jpg`)
		)
			.resize(184, 143, { fit: 'contain', background: '#0a1723' })
			.toBuffer();
		socialLayers.push({ input: preview, left: x, top: y + 26 });
		socialLabels += `<text x="${x + 4}" y="${y + 20}" fill="#e3e6da" font-family="Georgia,serif" font-size="16">${String(index + 1).padStart(2, '0')} ${xml(floor.name)}</text><path d="M${x},${y + 176}h184" stroke="#314a58"/>`;
	}
	socialLabels += `<text x="1014" y="411" fill="#82f4ed" font-family="Georgia,serif" font-size="63">O₂</text><text x="1004" y="446" fill="#9cb8c2" font-family="Arial,sans-serif" font-size="12">ELEVEN SCALES</text><path d="M31,554H1169" stroke="#82f4ed" stroke-width="2"/><text x="31" y="587" fill="#dde5db" font-family="Georgia,serif" font-size="23">A number needs a place, a denominator, and a clock.</text><text x="32" y="614" fill="#91b1bc" font-family="Arial,sans-serif" font-size="12">Actual interactive views · Schematic geometry · Synthetic demonstration</text>`;
	const social = await sharp({
		create: { width: 1200, height: 630, channels: 3, background: '#0a1723' }
	})
		.composite([...socialLayers, { input: svg(1200, 630, socialLabels) }])
		.jpeg({ quality: 80, mozjpeg: true })
		.toBuffer();
	await writeJpeg(social, path.join(IMAGE_DIR, SOCIAL_NAME));
	progress('Created actual eleven-view overview and 1200×630 social montage.');
	return [
		await imageMetadata(path.join(IMAGE_DIR, OVERVIEW_NAME), 'overview'),
		await imageMetadata(path.join(IMAGE_DIR, SOCIAL_NAME), 'social')
	];
}

async function captureVideo(session) {
	await session.setState(0, 0);
	await session.card.scrollIntoViewIfNeeded();
	const clip = enclosingClip(await session.card.boundingBox());
	if (
		!clip ||
		clip.x < 0 ||
		clip.y < 0 ||
		clip.x + clip.width > VIEWPORT.width ||
		clip.y + clip.height > VIEWPORT.height
	)
		throw new Error(`The video card must fit entirely in the viewport: ${JSON.stringify(clip)}`);
	const executable = process.env.FFMPEG_PATH || 'ffmpeg';
	const encoder = spawn(
		executable,
		[
			'-hide_banner',
			'-loglevel',
			'warning',
			'-y',
			'-f',
			'image2pipe',
			'-vcodec',
			'mjpeg',
			'-framerate',
			String(FPS),
			'-i',
			'pipe:0',
			'-an',
			'-vf',
			'scale=1280:-2,setsar=1',
			'-c:v',
			'libx264',
			'-preset',
			'fast',
			'-crf',
			'23',
			'-pix_fmt',
			'yuv420p',
			'-movflags',
			'+faststart',
			VIDEO_PATH
		],
		{ shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] }
	);
	let encoderError;
	let stderr = '';
	encoder.stderr.on('data', (chunk) => {
		stderr = (stderr + chunk.toString()).slice(-8000);
	});
	encoder.stdin.on('error', (error) => {
		encoderError = error;
	});
	const completion = new Promise((resolve, reject) => {
		encoder.once('error', reject);
		encoder.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${stderr}`))
		);
	});
	// Attach immediately, before asynchronous browser work, to avoid unhandled rejection.
	completion.catch((error) => {
		encoderError = error;
	});
	const frames = Math.round(TOUR_DURATION * FPS);
	const started = Date.now();
	try {
		for (let frame = 0; frame < frames; frame++) {
			if (encoderError) throw encoderError;
			const seconds = frame / FPS;
			await session.setState(tourProgress(seconds), seconds);
			const buffer = await session.card.screenshot({
				type: 'jpeg',
				quality: 82,
				animations: 'disabled',
				caret: 'hide'
			});
			if (!encoder.stdin.write(buffer)) await once(encoder.stdin, 'drain');
			if (frame % (FPS * 6) === 0)
				progress(
					`Recording ${(frame / FPS).toFixed(1)}/${TOUR_DURATION} s · ${frame}/${frames} exact frames · wall ${Math.round((Date.now() - started) / 1000)} s`
				);
		}
		encoder.stdin.end();
		await completion;
	} catch (error) {
		encoder.stdin.destroy();
		encoder.kill();
		await completion.catch(() => {});
		throw error;
	}
	const result = await videoMetadata();
	progress(
		`Encoded ${result.width}×${result.height}, ${result.duration.toFixed(2)} s, ${FPS} fps H.264/MP4.`
	);
	return result;
}

async function benchmark(session) {
	await session.setState(0);
	const locator = await session.card.screenshot({
		type: 'png',
		animations: 'disabled',
		caret: 'hide'
	});
	const clip = enclosingClip(await session.card.boundingBox());
	if (!clip) throw new Error('No card bounds.');
	const page = await session.page.screenshot({
		clip,
		type: 'png',
		animations: 'disabled',
		caret: 'hide'
	});
	const a = await sharp(locator).raw().toBuffer({ resolveWithObject: true });
	const b = await sharp(page).raw().toBuffer({ resolveWithObject: true });
	if (a.info.width !== b.info.width || a.info.height !== b.info.height)
		throw new Error(`Clip framing differs: ${JSON.stringify(a.info)} / ${JSON.stringify(b.info)}`);
	let difference = 0;
	for (let offset = 0; offset < a.data.length; offset++)
		if (a.data[offset] !== b.data[offset]) difference++;
	const fraction = difference / a.data.length;
	if (fraction > 0.0001)
		throw new Error(`Clip differs from locator by ${(fraction * 100).toFixed(5)}% of channels.`);
	const measurements = {};
	for (const method of ['locator', 'page']) {
		const start = performance.now();
		for (const floor of [0, 1, 4, 8, 10]) {
			await session.setState(floor);
			const target = method === 'locator' ? session.card : session.page;
			await target.screenshot({
				...(method === 'page' ? { clip } : {}),
				type: 'jpeg',
				quality: 82,
				animations: 'disabled',
				caret: 'hide'
			});
		}
		measurements[method] = Math.round(performance.now() - start);
	}
	progress(
		`Fixed clip pixel comparison: ${(fraction * 100).toFixed(5)}% channels differ; five-frame timings ${JSON.stringify(measurements)} ms.`
	);
	progress(`Existing bootstrap movie coded metadata: ${JSON.stringify(await videoMetadata())}`);
}

async function main() {
	if (INSPECT_VIDEO) {
		progress(JSON.stringify(await videoMetadata()));
		return;
	}
	if (CHECK) {
		await check();
		return;
	}
	if (STILLS_ONLY && VIDEO_ONLY)
		throw new Error('--stills-only and --video-only are mutually exclusive.');
	await Promise.all([mkdir(IMAGE_DIR, { recursive: true }), mkdir(VIDEO_DIR, { recursive: true })]);
	const initialHash = await sourceHash();
	let previous;
	if (VIDEO_ONLY) {
		previous = JSON.parse(await readFile(MANIFEST, 'utf8'));
		if (previous.sourceHash !== initialHash)
			throw new Error('Stills are stale. Run the full capture after finalising source.');
	}
	const session = await browserSession();
	try {
		if (BENCHMARK) {
			await benchmark(session);
			return;
		}
		progress(
			`Capture ready: ${session.layout.cardWidth}×${session.layout.cardHeight} card, Chrome SwiftShader, DPR 1.`
		);
		const images = VIDEO_ONLY ? previous.images : await captureStills(session);
		const video = STILLS_ONLY ? null : await captureVideo(session);
		if ((await sourceHash()) !== initialHash)
			throw new Error('Rendering source changed during capture. Finalise it and capture again.');
		const manifest = {
			schemaVersion: SCHEMA,
			captureVersion: CAPTURE_VERSION,
			modelVersion: MODEL_VERSION,
			sourceHash: initialHash,
			sourceFiles: SOURCE_PATHS,
			capture: {
				viewport: VIEWPORT,
				deviceScaleFactor: 1,
				browser: 'Chrome / Playwright / SwiftShader',
				browserVersion: session.browser.version(),
				reducedMotion: 'reduce; explicit capture clock',
				state: STATE,
				stillTime: 1.25,
				layout: session.layout,
				continuousTour: {
					fps: FPS,
					duration: TOUR_DURATION,
					frames: FPS * TOUR_DURATION,
					clock: 'core.tourProgress(frame / fps)',
					frameCapture: 'DOM card including HTML/SVG overlays and WebGL canvas'
				}
			},
			provenance: {
				geometry: 'Procedural authored schematics; fictional city; no external raster imagery',
				data: 'Deterministic educational calculations and synthetic records; see article and docs/visualizations/scale-elevator.md',
				references: SOURCE_PROVENANCE
			},
			images,
			video
		};
		await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
		progress(
			STILLS_ONLY
				? 'Stills complete. Manifest marks recording pending; run full capture before publication.'
				: 'Publication assets and current source manifest complete.'
		);
		if (!STILLS_ONLY) await check();
	} finally {
		await session.browser.close();
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack || error}\n`);
	process.exitCode = 1;
});
