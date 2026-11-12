import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	applyPreset,
	buildCompositionModel,
	buildPaintTimeline,
	INITIAL_CURATED_SEED,
	MONDRIAN_GENERATOR_VERSION,
	normalizeState,
	prepareMaterial,
	renderPainting,
	serializeStateQuery
} from '../src/lib/visualizations/mondrian-studio/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = 'mondrian-studio';
const outputDir = path.join(root, 'static', 'images', 'visualizations', slug);
const checkMode = process.argv.includes('--check');

const sourceFiles = [
	'src/lib/visualizations/mondrian-studio/types.ts',
	'src/lib/visualizations/mondrian-studio/prng.ts',
	'src/lib/visualizations/mondrian-studio/layout.ts',
	'src/lib/visualizations/mondrian-studio/colors.ts',
	'src/lib/visualizations/mondrian-studio/timeline.ts',
	'src/lib/visualizations/mondrian-studio/material.ts',
	'src/lib/visualizations/mondrian-studio/state.ts',
	'scripts/render-mondrian-studio-assets.mjs'
];

async function computeSourceHash() {
	const hash = createHash('sha256');
	for (const rel of sourceFiles) {
		const text = (await readFile(path.join(root, rel), 'utf8')).replace(/\r\n/g, '\n');
		hash.update(rel).update('\0').update(text).update('\0');
	}
	return hash.digest('hex');
}

function buildAssetSpecs() {
	const baseSeedState = normalizeState({
		seed: INITIAL_CURATED_SEED,
		aspectRatio: 1.5
	});

	const spareState = applyPreset(baseSeedState, 'spare');
	const balancedState = applyPreset(baseSeedState, 'balanced');
	const denseState = applyPreset(baseSeedState, 'dense');
	const socialState = normalizeState({
		...balancedState,
		aspectRatio: Number((1200 / 630).toFixed(4))
	});

	return [
		{
			id: 'social',
			file: 'social.png',
			label: 'Social preview (Balanced, 1200×630)',
			width: 1200,
			height: 630,
			state: socialState
		},
		{
			id: 'spare',
			file: 'example-spare.png',
			label: 'Spare preset',
			width: 960,
			height: 640,
			state: spareState
		},
		{
			id: 'balanced',
			file: 'example-balanced.png',
			label: 'Balanced preset',
			width: 960,
			height: 640,
			state: balancedState
		},
		{
			id: 'dense',
			file: 'example-dense.png',
			label: 'Dense preset',
			width: 960,
			height: 640,
			state: denseState
		}
	];
}

async function renderSpecBuffer(spec) {
	const model = buildCompositionModel(spec.state);
	const timeline = buildPaintTimeline(model.layout, model.colors, spec.state.paintingTime);
	const prepared = prepareMaterial({
		layout: model.layout,
		colors: model.colors,
		timeline,
		paintTexture: spec.state.paintTexture,
		width: spec.width,
		height: spec.height
	});
	const finished = renderPainting(prepared, 1.0);
	const pngBuffer = await sharp(
		Buffer.from(finished.buffer, finished.byteOffset, finished.byteLength),
		{
			raw: {
				width: spec.width,
				height: spec.height,
				channels: 4
			}
		}
	)
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();

	return {
		pngBuffer,
		model
	};
}

async function main() {
	const sourceHash = await computeSourceHash();
	const specs = buildAssetSpecs();
	const manifestPath = path.join(outputDir, 'assets.json');

	if (checkMode) {
		const rawManifest = await readFile(manifestPath, 'utf8');
		const manifest = JSON.parse(rawManifest);
		if (manifest.sourceHash !== sourceHash) {
			throw new Error(
				'Mondrian Studio asset manifest sourceHash is out of date. Run `npm run mondrian-studio:assets`.'
			);
		}
		for (const item of manifest.assets) {
			const filePath = path.join(outputDir, item.file);
			const info = await stat(filePath);
			if (info.size <= 0 || info.size > 750 * 1024) {
				throw new Error(
					`Asset ${item.file} has invalid size (${info.size} bytes; budget <= 768000 bytes).`
				);
			}
		}
		console.log(`Mondrian Studio assets verified (${manifest.assets.length} PNGs, sourceHash=${sourceHash.slice(0, 12)}).`);
		return;
	}

	await mkdir(outputDir, { recursive: true });

	const recordedAssets = [];
	for (const spec of specs) {
		const { pngBuffer, model } = await renderSpecBuffer(spec);
		const outPath = path.join(outputDir, spec.file);
		await writeFile(outPath, pngBuffer);

		if (pngBuffer.byteLength > 750 * 1024) {
			throw new Error(
				`Generated ${spec.file} (${pngBuffer.byteLength} bytes) exceeds 750 KiB media budget.`
			);
		}

		const sha256 = createHash('sha256').update(pngBuffer).digest('hex');
		const studioUrl = `/tools/mondrian-studio?${serializeStateQuery(spec.state)}`;

		recordedAssets.push({
			id: spec.id,
			file: spec.file,
			publicPath: `/images/visualizations/${slug}/${spec.file}`,
			label: spec.label,
			width: spec.width,
			height: spec.height,
			bytes: pngBuffer.byteLength,
			sha256,
			seed: spec.state.seed,
			parameters: {
				panels: spec.state.panels,
				unevenSpacing: spec.state.unevenSpacing,
				colorArea: spec.state.colorArea,
				actualColorAreaPct: model.colors.actualColorAreaPct,
				lineWidth: spec.state.lineWidth,
				paintTexture: spec.state.paintTexture,
				paintingTime: spec.state.paintingTime,
				colorEmphasis: spec.state.colorEmphasis,
				aspectRatio: spec.state.aspectRatio
			},
			description: model.description,
			studioUrl
		});

		console.log(
			`Wrote ${spec.file} (${spec.width}x${spec.height}, ${(pngBuffer.byteLength / 1024).toFixed(1)} KiB, actualColor=${model.colors.actualColorAreaPct}%)`
		);
	}

	const manifest = {
		generatorVersion: MONDRIAN_GENERATOR_VERSION,
		sourceHash,
		curatedSeed: INITIAL_CURATED_SEED,
		assets: recordedAssets
	};

	await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`, 'utf8');
	console.log(`Wrote ${path.relative(root, manifestPath)}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
