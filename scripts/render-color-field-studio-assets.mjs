import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	applyPreset,
	buildPaintingModel,
	COLOR_FIELD_GENERATOR_VERSION,
	CURATED_DEFAULT_SEED,
	CURATED_STUDY_SEEDS,
	DEFAULT_STATE,
	measurePaintingMetrics,
	normalizeState,
	renderPaintingStill,
	serializeStateParams
} from '../src/lib/visualizations/color-field-studio/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = 'color-field-studio';
const outputDir = path.join(root, 'static', 'images', 'visualizations', slug);
const checkMode = process.argv.includes('--check');
const MAX_IMAGE_BYTES = 750 * 1024;

const sourceFiles = [
	'src/lib/visualizations/color-field-studio/types.ts',
	'src/lib/visualizations/color-field-studio/prng.ts',
	'src/lib/visualizations/color-field-studio/studies.ts',
	'src/lib/visualizations/color-field-studio/fields.ts',
	'src/lib/visualizations/color-field-studio/timeline.ts',
	'src/lib/visualizations/color-field-studio/surface.ts',
	'src/lib/visualizations/color-field-studio/state.ts',
	'src/lib/visualizations/color-field-studio/export.ts',
	'src/lib/visualizations/color-field-studio/index.ts',
	'scripts/render-color-field-studio-assets.mjs'
];

async function computeSourceHash() {
	const hash = createHash('sha256');
	for (const rel of sourceFiles) {
		const text = (await readFile(path.join(root, rel), 'utf8')).replace(/\r\n/g, '\n');
		hash.update(rel).update('\0').update(text).update('\0');
	}
	return hash.digest('hex');
}

async function rawPixelSha256(pngBytes) {
	const raw = await sharp(pngBytes).ensureAlpha().raw().toBuffer();
	return createHash('sha256').update(raw).digest('hex');
}

function roundTo(value, decimals) {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function buildAssetSpecs() {
	const socialState = normalizeState({
		...DEFAULT_STATE,
		studyId: 'rothko-nocturne',
		seed: CURATED_STUDY_SEEDS['rothko-nocturne']
	});

	const twoAreasSharpState = applyPreset(DEFAULT_STATE, 'two-area-sharp');
	const twoAreasSoftState = applyPreset(DEFAULT_STATE, 'two-area-soft');

	const frankenthalerLayersState = applyPreset(
		normalizeState({
			...DEFAULT_STATE,
			studyId: 'frankenthaler-wash',
			seed: CURATED_STUDY_SEEDS['frankenthaler-wash']
		}),
		'deep-stack'
	);

	const scaleCompactState = normalizeState({
		...DEFAULT_STATE,
		studyId: 'rothko-nocturne',
		seed: CURATED_STUDY_SEEDS['rothko-nocturne'],
		areaCount: 3,
		areaSize: 36,
		edgeSoftness: 58,
		transparency: 52,
		canvasTexture: 55
	});

	const scaleExpandedState = normalizeState({
		...DEFAULT_STATE,
		studyId: 'rothko-nocturne',
		seed: CURATED_STUDY_SEEDS['rothko-nocturne'],
		areaCount: 3,
		areaSize: 84,
		edgeSoftness: 58,
		transparency: 52,
		canvasTexture: 55
	});

	return [
		{
			id: 'social',
			file: 'social.png',
			label: 'Social preview — Rothko Nocturne (1200×630 center crop)',
			width: 1200,
			height: 630,
			state: socialState,
			crop: { x: 0, y: 85, width: 1200, height: 630 }
		},
		{
			id: 'two-areas-sharp',
			file: 'example-two-areas-sharp.png',
			label: 'Two fixed color areas — sharp & near-opaque (0% edge softness, 14% transparency)',
			width: 960,
			height: 640,
			state: twoAreasSharpState,
			crop: null
		},
		{
			id: 'two-areas-soft-translucent',
			file: 'example-two-areas-soft-translucent.png',
			label:
				'Two fixed color areas — softened edges & higher transparency (82% edge softness, 68% transparency)',
			width: 960,
			height: 640,
			state: twoAreasSoftState,
			crop: null
		},
		{
			id: 'frankenthaler-layers',
			file: 'example-frankenthaler-layers.png',
			label: 'Frankenthaler Wash — 5 overlapping soak-stain layers (deep-stack preset)',
			width: 960,
			height: 640,
			state: frankenthalerLayersState,
			crop: null
		},
		{
			id: 'scale-compact',
			file: 'example-scale-compact.png',
			label: 'Scale & adjacency — compact 36% area size (open canvas margins)',
			width: 960,
			height: 640,
			state: scaleCompactState,
			crop: null
		},
		{
			id: 'scale-expanded',
			file: 'example-scale-expanded.png',
			label: 'Scale & adjacency — expanded 84% area size (tight margins, overlapping halos)',
			width: 960,
			height: 640,
			state: scaleExpandedState,
			crop: null
		}
	];
}

async function renderSpecBuffer(spec) {
	const model = buildPaintingModel(spec.state);
	const effectiveCrop = spec.crop ?? {
		x: 0,
		y: 0,
		width: spec.state.artboardWidth,
		height: spec.state.artboardHeight
	};
	const rendered = renderPaintingStill(spec.state, spec.width, spec.height, {
		model,
		...(spec.crop ? { crop: spec.crop } : {})
	});

	const rgbaBuffer = Buffer.from(
		rendered.rgba.buffer,
		rendered.rgba.byteOffset,
		rendered.rgba.byteLength
	);

	const pngBuffer = await sharp(rgbaBuffer, {
		raw: {
			width: spec.width,
			height: spec.height,
			channels: 4
		}
	})
		.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10, palette: false })
		.toBuffer();

	if (pngBuffer.byteLength > MAX_IMAGE_BYTES) {
		throw new Error(
			`Generated lossless PNG for ${spec.file} (${pngBuffer.byteLength} bytes) exceeds ${MAX_IMAGE_BYTES} byte budget.`
		);
	}

	const metrics = spec.crop
		? (() => {
				const fullPreview = renderPaintingStill(spec.state, 600, 400, { model });
				return measurePaintingMetrics(fullPreview.rgba, 600, 400, model);
			})()
		: measurePaintingMetrics(rendered.rgba, spec.width, spec.height, model);

	return {
		pngBuffer,
		rgba: rendered.rgba,
		model,
		effectiveCrop,
		metrics
	};
}

async function main() {
	const sourceHash = await computeSourceHash();
	const specs = buildAssetSpecs();
	const manifestPath = path.join(outputDir, 'assets.json');

	if (checkMode) {
		const rawManifest = await readFile(manifestPath, 'utf8');
		const manifest = JSON.parse(rawManifest);
		if (manifest.generatorVersion !== COLOR_FIELD_GENERATOR_VERSION) {
			throw new Error(
				`Color Field Studio asset manifest generatorVersion mismatch (expected ${COLOR_FIELD_GENERATOR_VERSION}, found ${manifest.generatorVersion}).`
			);
		}
		if (manifest.sourceHash !== sourceHash) {
			throw new Error(
				'Color Field Studio asset manifest sourceHash is out of date. Run `npm run color-field-studio:assets`.'
			);
		}
		if (!Array.isArray(manifest.assets) || manifest.assets.length !== specs.length) {
			throw new Error(
				`Color Field Studio asset manifest count mismatch (expected ${specs.length}, found ${Array.isArray(manifest.assets) ? manifest.assets.length : 'invalid'}).`
			);
		}
		for (let i = 0; i < specs.length; i++) {
			const spec = specs[i];
			const item = manifest.assets[i];
			if (
				!item ||
				item.id !== spec.id ||
				item.file !== spec.file ||
				item.width !== spec.width ||
				item.height !== spec.height
			) {
				throw new Error(
					`Color Field Studio asset manifest entry ${i} mismatch (expected ${spec.id} ${spec.file} ${spec.width}x${spec.height}).`
				);
			}
			const filePath = path.join(outputDir, spec.file);
			const diskBytes = await readFile(filePath);
			if (diskBytes.byteLength <= 0 || diskBytes.byteLength > MAX_IMAGE_BYTES) {
				throw new Error(
					`Asset ${spec.file} has invalid size (${diskBytes.byteLength} bytes; budget <= ${MAX_IMAGE_BYTES} bytes).`
				);
			}
			const meta = await sharp(diskBytes).metadata();
			if (meta.format !== 'png' || meta.width !== spec.width || meta.height !== spec.height) {
				throw new Error(
					`Asset ${spec.file} PNG metadata mismatch (got format=${meta.format} ${meta.width}x${meta.height}, expected png ${spec.width}x${spec.height}).`
				);
			}
			const ihdrColorType = diskBytes[25];
			if (ihdrColorType !== 6 && ihdrColorType !== 2) {
				throw new Error(
					`Asset ${spec.file} PNG must be non-indexed truecolor (expected IHDR colorType 2 or 6, got ${ihdrColorType}).`
				);
			}
			const actualPixelSha256 = await rawPixelSha256(diskBytes);
			if (actualPixelSha256 !== item.pixelSha256) {
				throw new Error(
					`Asset ${spec.file} decoded pixel SHA-256 mismatch (expected ${item.pixelSha256}, got ${actualPixelSha256}).`
				);
			}
		}
		console.log(
			`Color Field Studio assets verified (${manifest.assets.length} PNGs, sourceHash=${sourceHash.slice(0, 12)}).`
		);
		return;
	}

	await mkdir(outputDir, { recursive: true });

	const recordedAssets = [];
	for (const spec of specs) {
		const { pngBuffer, rgba, model, effectiveCrop, metrics } = await renderSpecBuffer(spec);
		const outPath = path.join(outputDir, spec.file);
		await writeFile(outPath, pngBuffer);

		if (pngBuffer.byteLength > MAX_IMAGE_BYTES) {
			throw new Error(
				`Generated ${spec.file} (${pngBuffer.byteLength} bytes) exceeds 750 KiB media budget.`
			);
		}

		const sha256 = createHash('sha256').update(pngBuffer).digest('hex');
		const pixelSha256 = createHash('sha256')
			.update(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength))
			.digest('hex');
		const studioUrl = `/tools/color-field-studio?${serializeStateParams(spec.state).toString()}`;

		recordedAssets.push({
			id: spec.id,
			file: spec.file,
			publicPath: `/images/visualizations/${slug}/${spec.file}`,
			label: spec.label,
			width: spec.width,
			height: spec.height,
			bytes: pngBuffer.byteLength,
			sha256,
			pixelSha256,
			seed: spec.state.seed,
			studyId: spec.state.studyId,
			activePasses: model.glazePasses.length,
			parameters: {
				areaCount: spec.state.areaCount,
				areaSize: spec.state.areaSize,
				edgeSoftness: spec.state.edgeSoftness,
				transparency: spec.state.transparency,
				canvasTexture: spec.state.canvasTexture,
				paintingTime: spec.state.paintingTime,
				artboard: spec.state.artboard,
				artboardWidth: spec.state.artboardWidth,
				artboardHeight: spec.state.artboardHeight,
				focalPoint: model.focalPoint,
				crop: {
					x: roundTo(effectiveCrop.x, 2),
					y: roundTo(effectiveCrop.y, 2),
					width: roundTo(effectiveCrop.width, 2),
					height: roundTo(effectiveCrop.height, 2)
				}
			},
			metrics: {
				paintedCoveragePct: roundTo(metrics.paintedCoveragePct, 2),
				meanBoundaryGradient: roundTo(metrics.meanBoundaryGradient, 2),
				edgeGradientSmoothness: roundTo(metrics.edgeGradientSmoothness, 4),
				canvasWeaveVisibility: roundTo(metrics.canvasWeaveVisibility, 4),
				pigmentVariationScore: roundTo(metrics.pigmentVariationScore, 4),
				regionSeparation: roundTo(metrics.regionSeparation, 2)
			},
			description: model.description,
			studioUrl
		});

		console.log(
			`Wrote ${spec.file} (${spec.width}x${spec.height}, ${(pngBuffer.byteLength / 1024).toFixed(1)} KiB, passes=${model.glazePasses.length}, cov=${metrics.paintedCoveragePct.toFixed(2)}%, grad=${metrics.meanBoundaryGradient.toFixed(2)}, weave=${metrics.canvasWeaveVisibility.toFixed(4)})`
		);
	}

	const manifest = {
		generatorVersion: COLOR_FIELD_GENERATOR_VERSION,
		sourceHash,
		curatedSeed: CURATED_DEFAULT_SEED,
		curatedStudySeeds: CURATED_STUDY_SEEDS,
		assets: recordedAssets
	};

	await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`, 'utf8');
	console.log(`Wrote ${path.relative(root, manifestPath)}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
