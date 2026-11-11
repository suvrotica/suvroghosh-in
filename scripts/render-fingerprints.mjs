import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { END_TIME, PRESETS, settingsRecord } from '../src/lib/visualizations/fingerprint/config.ts';
import { encodeFrame } from '../src/lib/visualizations/fingerprint/protocol.ts';
import {
	RENDER_WIDTH,
	RENDER_HEIGHT,
	rasterize
} from '../src/lib/visualizations/fingerprint/render.ts';

const assets = 'static/images/visualizations/how-fingerprints-form';
const review = 'artifacts/fingerprints';
const manifestPath = join(assets, 'assets.json');
const families = ['arch', 'loop', 'whorl'];
const formationTimes = [0, 100, 200, 350, 600, END_TIME];
const sourcePaths = ['config.ts', 'geometry.ts', 'protocol.ts', 'render.ts', 'solver.ts'].map(
	(name) => `src/lib/visualizations/fingerprint/${name}`
);
sourcePaths.push('scripts/render-fingerprints.mjs');
const outputPaths = [
	...families.map((name) => join(assets, `${name}.png`)),
	...families.map((name) => join(assets, `${name}-preview.png`)),
	join(assets, 'loop.bin'),
	join(assets, 'social.png'),
	join(review, 'family-variations.png'),
	join(review, 'formation.png')
];

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (path) => path.replaceAll('\\', '/');
async function fingerprint(path, isSource = false) {
	const bytes = await readFile(path);
	if (path.endsWith('.png')) {
		// The standard publishing optimizer may change PNG compression without changing pixels.
		const { data, info } = await sharp(bytes)
			.toColourspace('srgb')
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		return sha(Buffer.concat([Buffer.from(`${info.width}x${info.height}:`), data]));
	}
	return sha(isSource ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes);
}

if (process.argv.includes('--check')) {
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	for (const path of sourcePaths) {
		if (manifest.sources[key(path)] !== (await fingerprint(path, true))) {
			throw new Error(`Fingerprint asset source changed: ${path}. Run npm run fingerprint:assets.`);
		}
	}
	for (const path of outputPaths) {
		if (manifest.outputs[key(path)] !== (await fingerprint(path))) {
			throw new Error(`Fingerprint asset changed: ${path}. Run npm run fingerprint:assets.`);
		}
	}
	console.log('Fingerprint preview, field and review artifacts match their recorded sources.');
	process.exit(0);
}

const { FingerprintSolver } = await import('../src/lib/visualizations/fingerprint/solver.ts');
const prototype = process.argv.includes('--prototype');
const hashes = async (paths, isSource = false) =>
	Object.fromEntries(
		await Promise.all(paths.map(async (path) => [key(path), await fingerprint(path, isSource)]))
	);
const sources = await hashes(sourcePaths, true);

function snapshot(solver) {
	return { ...solver.mesh, time: solver.time, field: solver.frame() };
}

function advanceTo(solver, time) {
	while (solver.time < time - 1e-8) solver.advance(1);
	return snapshot(solver);
}

function canvas(frame, view = 'print') {
	return sharp(rasterize(frame, view), {
		raw: { width: RENDER_WIDTH, height: RENDER_HEIGHT, channels: 4 }
	});
}

function safe(s) {
	return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}

async function makeSheet(panels, count, output, title) {
	const cardW = count > 3 ? 194 : 300;
	const cardH = count > 3 ? 220 : 302;
	const pad = 12;
	const top = 56;
	const width = cardW * count + pad * (count + 1);
	const height = top + cardH * Math.ceil(panels.length / count) + pad;
	const layers = [];
	const labels = [`<text x="${pad}" y="36" font-size="24">${safe(title)}</text>`];
	for (const [index, { frame, label, view }] of panels.entries()) {
		const x = pad + (index % count) * (cardW + pad);
		const y = top + Math.floor(index / count) * cardH;
		const buffer = await canvas(frame, view)
			.resize(cardW, cardH - 30, { fit: 'cover' })
			.png()
			.toBuffer();
		layers.push({ input: buffer, left: x, top: y });
		labels.push(`<text x="${x}" y="${y + cardH - 10}" font-size="14">${safe(label)}</text>`);
	}
	const text = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><g fill="#f0eee8" font-family="sans-serif">${labels.join('')}</g></svg>`;
	await sharp({ create: { width, height, channels: 3, background: '#24292a' } })
		.composite([...layers, { input: Buffer.from(text) }])
		.png()
		.toFile(output);
}

async function social(frame) {
	const text = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
		<rect width="1200" height="630" fill="#151819"/>
		<path d="M76 123H140" stroke="#e9943c" stroke-width="5" stroke-linecap="round"/>
		<g font-family="sans-serif" fill="#f0eee8">
			<text x="76" y="253" font-size="65" font-weight="bold">How fingerprints</text>
			<text x="76" y="330" font-size="65" font-weight="bold">form</text>
			<text x="79" y="402" font-size="25" fill="#c2c5c2">A reaction–diffusion experiment</text>
			<text x="79" y="547" font-size="20" fill="#e9943c">Suvro Ghosh</text>
		</g></svg>`);
	const print = await canvas(frame).resize(490, 520, { fit: 'cover' }).png().toBuffer();
	await sharp(text)
		.composite([{ input: print, left: 654, top: 55 }])
		.png()
		.toFile(join(assets, 'social.png'));
}

await Promise.all([mkdir(assets, { recursive: true }), mkdir(review, { recursive: true })]);
const variants = [];
const formation = [];
const runs = [];
for (const family of families) {
	const baseline = PRESETS[family];
	for (const seed of prototype
		? [baseline.seed]
		: [baseline.seed, baseline.seed + 1, baseline.seed + 2]) {
		const settings = { ...baseline, seed };
		const start = performance.now();
		const solver = new FingerprintSolver(settings);
		if (seed === baseline.seed) {
			for (const time of formationTimes) {
				const frame = advanceTo(solver, time);
				formation.push({ frame, label: `${family} · t = ${time}`, view: 'print' });
			}
		}
		const frame = advanceTo(solver, END_TIME);
		const elapsed = (performance.now() - start) / 1000;
		const bytes = Buffer.from(encodeFrame(frame));
		const min = frame.field.reduce((a, b) => Math.min(a, b), Infinity);
		const max = frame.field.reduce((a, b) => Math.max(a, b), -Infinity);
		console.log(
			`${family} ${seed}: ${frame.columns} × ${frame.rows}, u = ${min.toFixed(2)}–${max.toFixed(2)}, ${elapsed.toFixed(2)} s`
		);
		variants.push({ frame, label: `${family} · seed ${seed}` });
		runs.push({ ...settingsRecord(settings), endFrameHash: sha(bytes) });
		if (seed === baseline.seed) {
			await canvas(frame)
				.png()
				.toFile(join(assets, `${family}.png`));
			await canvas(frame)
				.extract({ left: 72, top: 37, width: 456, height: 514 })
				.resize(120, 120, { fit: 'contain', background: '#e5e1d6' })
				.png()
				.toFile(join(assets, `${family}-preview.png`));
			if (family === 'loop') {
				await writeFile(join(assets, 'loop.bin'), bytes);
				await social(frame);
			}
		}
	}
}
await makeSheet(
	variants,
	prototype ? 1 : 3,
	join(review, 'family-variations.png'),
	'Solved fields · three starting configurations'
);
await makeSheet(
	formation,
	formationTimes.length,
	join(review, 'formation.png'),
	'Formation · frames from the numerical solve'
);

if (!prototype) {
	if (JSON.stringify(sources) !== JSON.stringify(await hashes(sourcePaths, true))) {
		throw new Error(
			'Fingerprint source changed during generation. Run npm run fingerprint:assets again.'
		);
	}
	const manifest = {
		formationTimes,
		runs,
		sources,
		outputs: await hashes(outputPaths)
	};
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
