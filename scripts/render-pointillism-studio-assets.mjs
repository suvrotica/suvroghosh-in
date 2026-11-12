import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	buildPaintingModel,
	computeInspectCropRect,
	CURATED_SCENE_SEEDS,
	INITIAL_CURATED_SEED,
	normalizeState,
	normalizeViewState,
	POINTILLISM_GENERATOR_VERSION,
	renderPaintingCrop,
	serializeStateQuery
} from '../src/lib/visualizations/pointillism-studio/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = 'pointillism-studio';
const outputDir = path.join(root, 'static', 'images', 'visualizations', slug);
const checkMode = process.argv.includes('--check');

const sourceFiles = [
	'src/lib/visualizations/pointillism-studio/types.ts',
	'src/lib/visualizations/pointillism-studio/prng.ts',
	'src/lib/visualizations/pointillism-studio/scene-primitives.ts',
	'src/lib/visualizations/pointillism-studio/scene.ts',
	'src/lib/visualizations/pointillism-studio/sampling.ts',
	'src/lib/visualizations/pointillism-studio/palette.ts',
	'src/lib/visualizations/pointillism-studio/timeline.ts',
	'src/lib/visualizations/pointillism-studio/material.ts',
	'src/lib/visualizations/pointillism-studio/state.ts',
	'scripts/render-pointillism-studio-assets.mjs'
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
	const riverDefault = normalizeState({
		sceneFamily: 'river-path',
		seed: CURATED_SCENE_SEEDS['river-path'],
		dotSize: 40,
		dotSpacing: 35,
		paletteContrast: 45,
		colorVariation: 40,
		paintTexture: 45,
		paintingTime: 10,
		artboardWidth: 1200,
		artboardHeight: 800
	});

	const riverLargerDots = normalizeState({
		...riverDefault,
		dotSize: 74
	});

	const socialState = normalizeState({
		...riverDefault,
		artboardWidth: 1200,
		artboardHeight: 630
	});

	const neighborhoodState = normalizeState({
		sceneFamily: 'neighborhood-street',
		seed: CURATED_SCENE_SEEDS['neighborhood-street'],
		dotSize: 40,
		dotSpacing: 35,
		paletteContrast: 45,
		colorVariation: 40,
		paintTexture: 45,
		artboardWidth: 1200,
		artboardHeight: 800
	});

	const plazaState = normalizeState({
		sceneFamily: 'plaza-market',
		seed: CURATED_SCENE_SEEDS['plaza-market'],
		dotSize: 40,
		dotSpacing: 35,
		paletteContrast: 45,
		colorVariation: 40,
		paintTexture: 45,
		artboardWidth: 1200,
		artboardHeight: 800
	});

	const hillCountryState = normalizeState({
		sceneFamily: 'hill-country-creek',
		seed: CURATED_SCENE_SEEDS['hill-country-creek'],
		dotSize: 40,
		dotSpacing: 35,
		paletteContrast: 45,
		colorVariation: 40,
		paintTexture: 45,
		artboardWidth: 1200,
		artboardHeight: 800
	});

	return [
		{
			id: 'social',
			file: 'social.png',
			label: 'Social preview — San Antonio river path (1200×630)',
			width: 1200,
			height: 630,
			state: socialState,
			inspectView: null
		},
		{
			id: 'river-path',
			file: 'example-river-path.png',
			label: 'San Antonio river path — whole painting',
			width: 960,
			height: 640,
			state: riverDefault,
			inspectView: null
		},
		{
			id: 'river-closeup',
			file: 'example-river-closeup.png',
			label: 'San Antonio river path — close-up inspection of the same painting',
			width: 960,
			height: 640,
			state: riverDefault,
			inspectView: 'focal'
		},
		{
			id: 'river-larger-dots',
			file: 'example-river-larger-dots.png',
			label: 'San Antonio river path — same scene with larger dots (74%)',
			width: 960,
			height: 640,
			state: riverLargerDots,
			inspectView: null
		},
		{
			id: 'neighborhood',
			file: 'example-neighborhood.png',
			label: 'Neighborhood street and porch',
			width: 960,
			height: 640,
			state: neighborhoodState,
			inspectView: null
		},
		{
			id: 'plaza-market',
			file: 'example-plaza-market.png',
			label: 'Public plaza, park, or small market',
			width: 960,
			height: 640,
			state: plazaState,
			inspectView: null
		},
		{
			id: 'hill-country',
			file: 'example-hill-country.png',
			label: 'Hill Country creek and trail',
			width: 960,
			height: 640,
			state: hillCountryState,
			inspectView: null
		}
	];
}

async function renderSpecBuffer(spec) {
	const model = buildPaintingModel(spec.state);
	let crop = {
		x: 0,
		y: 0,
		width: spec.state.artboardWidth,
		height: spec.state.artboardHeight
	};
	let viewState = undefined;

	if (spec.inspectView === 'focal') {
		viewState = normalizeViewState({
			mode: 'inspect',
			inspectZoom: 3.4,
			inspectCenterX: model.scene.focalArea.x,
			inspectCenterY: model.scene.focalArea.y
		});
		crop = computeInspectCropRect(
			spec.state.artboardWidth,
			spec.state.artboardHeight,
			viewState,
			spec.width,
			spec.height
		);
	}

	const rgba = renderPaintingCrop(model, crop, spec.width, spec.height);
	let pngBuffer = await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
		raw: {
			width: spec.width,
			height: spec.height,
			channels: 4
		}
	})
		.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
		.toBuffer();

	// If lossless 24-bit PNG exceeds the strict 750 KiB static media budget (e.g., 1200x630 social card),
	// encode high-quality 256-color dithered PNG while keeping dimensions intact.
	if (pngBuffer.byteLength > 740 * 1024) {
		pngBuffer = await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
			raw: {
				width: spec.width,
				height: spec.height,
				channels: 4
			}
		})
			.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10, dither: 0.65 })
			.toBuffer();
	}

	return {
		pngBuffer,
		model,
		viewState,
		crop
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
				'Pointillism Studio asset manifest sourceHash is out of date. Run `npm run pointillism-studio:assets`.'
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
		console.log(
			`Pointillism Studio assets verified (${manifest.assets.length} PNGs, sourceHash=${sourceHash.slice(0, 12)}).`
		);
		return;
	}

	await mkdir(outputDir, { recursive: true });

	const recordedAssets = [];
	for (const spec of specs) {
		const { pngBuffer, model, viewState, crop } = await renderSpecBuffer(spec);
		const outPath = path.join(outputDir, spec.file);
		await writeFile(outPath, pngBuffer);

		if (pngBuffer.byteLength > 750 * 1024) {
			throw new Error(
				`Generated ${spec.file} (${pngBuffer.byteLength} bytes) exceeds 750 KiB media budget.`
			);
		}

		const sha256 = createHash('sha256').update(pngBuffer).digest('hex');
		const studioUrl = `/tools/pointillism-studio?${serializeStateQuery(spec.state, {
			viewState
		})}`;

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
			sceneFamily: spec.state.sceneFamily,
			activeMarks: model.activeCount,
			totalCandidates: model.hierarchy.candidates.length,
			parameters: {
				dotSize: spec.state.dotSize,
				dotSpacing: spec.state.dotSpacing,
				paletteContrast: spec.state.paletteContrast,
				colorVariation: spec.state.colorVariation,
				paintTexture: spec.state.paintTexture,
				paintingTime: spec.state.paintingTime,
				artboardWidth: spec.state.artboardWidth,
				artboardHeight: spec.state.artboardHeight,
				viewMode: viewState?.mode ?? 'fill',
				inspectZoom: viewState?.inspectZoom ?? null,
				crop: {
					x: Math.round(crop.x * 10) / 10,
					y: Math.round(crop.y * 10) / 10,
					width: Math.round(crop.width * 10) / 10,
					height: Math.round(crop.height * 10) / 10
				}
			},
			summary: model.scene.summary,
			description: model.description,
			studioUrl
		});

		console.log(
			`Wrote ${spec.file} (${spec.width}x${spec.height}, ${(pngBuffer.byteLength / 1024).toFixed(1)} KiB, marks=${model.activeCount}, template=${model.scene.summary.templateName})`
		);
	}

	const manifest = {
		generatorVersion: POINTILLISM_GENERATOR_VERSION,
		sourceHash,
		curatedSeed: INITIAL_CURATED_SEED,
		curatedSceneSeeds: CURATED_SCENE_SEEDS,
		assets: recordedAssets
	};

	await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`, 'utf8');
	console.log(`Wrote ${path.relative(root, manifestPath)}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
