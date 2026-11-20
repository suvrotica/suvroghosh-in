import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	buildPaintingModel,
	computeInspectCropRect,
	CURATED_DEFAULT_SEED,
	CURATED_STUDY_SEEDS,
	DEFAULT_DRIP_STATE,
	DEFAULT_VIEW_STATE,
	DRIP_GENERATOR_VERSION,
	EXPERIMENT_CONFIG,
	measurePaintingMetrics,
	normalizeState,
	normalizeViewState,
	renderPaintingStill,
	serializeStateParams
} from '../src/lib/visualizations/drip-painting-studio/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slug = 'drip-painting-studio';
const outputDir = path.join(root, 'static', 'images', 'visualizations', slug);
const checkMode = process.argv.includes('--check');

const sourceFiles = [
	'src/lib/visualizations/drip-painting-studio/types.ts',
	'src/lib/visualizations/drip-painting-studio/prng.ts',
	'src/lib/visualizations/drip-painting-studio/studies.ts',
	'src/lib/visualizations/drip-painting-studio/paths.ts',
	'src/lib/visualizations/drip-painting-studio/deposition.ts',
	'src/lib/visualizations/drip-painting-studio/timeline.ts',
	'src/lib/visualizations/drip-painting-studio/surface.ts',
	'src/lib/visualizations/drip-painting-studio/state.ts',
	'src/lib/visualizations/drip-painting-studio/export.ts',
	'src/lib/visualizations/drip-painting-studio/index.ts',
	'scripts/render-drip-painting-studio-assets.mjs'
];

async function computeSourceHash() {
	const hash = createHash('sha256');
	for (const rel of sourceFiles) {
		const text = (await readFile(path.join(root, rel), 'utf8')).replace(/\r\n/g, '\n');
		hash.update(rel).update('\0').update(text).update('\0');
	}
	return hash.digest('hex');
}

function roundTo(value, decimals) {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function buildAssetSpecs() {
	const socialState = normalizeState({
		...DEFAULT_DRIP_STATE,
		study: 'pending-file',
		seed: CURATED_STUDY_SEEDS['pending-file'],
		passes: 18,
		paintFlow: 45,
		sweepWidth: 68,
		paintLayers: 4,
		paintTexture: 50,
		paintingTime: 10,
		artboardWidth: 1200,
		artboardHeight: 630
	});

	const thinState = normalizeState(EXPERIMENT_CONFIG.thin);
	const heavyState = normalizeState(EXPERIMENT_CONFIG.heavy);
	const buriedState = normalizeState(EXPERIMENT_CONFIG.buried);

	const publicWorksState = normalizeState({
		...DEFAULT_DRIP_STATE,
		study: 'public-works-tenders',
		seed: CURATED_STUDY_SEEDS['public-works-tenders'],
		passes: 26,
		paintFlow: 60,
		sweepWidth: 68,
		paintLayers: 6,
		paintTexture: 50,
		paintingTime: 10,
		artboardWidth: 1200,
		artboardHeight: 800
	});

	const counterMiddlemanState = normalizeState({
		...DEFAULT_DRIP_STATE,
		study: 'counter-middleman',
		seed: CURATED_STUDY_SEEDS['counter-middleman'],
		passes: 26,
		paintFlow: 60,
		sweepWidth: 68,
		paintLayers: 6,
		paintTexture: 50,
		paintingTime: 10,
		artboardWidth: 1200,
		artboardHeight: 800
	});

	const whitewashRecordState = normalizeState({
		...DEFAULT_DRIP_STATE,
		study: 'whitewash-record',
		seed: CURATED_STUDY_SEEDS['whitewash-record'],
		passes: 26,
		paintFlow: 60,
		sweepWidth: 68,
		paintLayers: 6,
		paintTexture: 50,
		paintingTime: 10,
		artboardWidth: 1200,
		artboardHeight: 800
	});

	return [
		{
			id: 'social',
			file: 'social.png',
			label: 'Social preview — Pending File (1200×630)',
			width: 1200,
			height: 630,
			state: socialState,
			inspectView: null
		},
		{
			id: 'pending-thin',
			file: 'example-pending-thin.png',
			label: 'Pending File — Thin flow (20% flow, 16 passes, 4 layers)',
			width: 960,
			height: 640,
			state: thinState,
			inspectView: null
		},
		{
			id: 'pending-heavy',
			file: 'example-pending-heavy.png',
			label: 'Pending File — Heavy flow (80% flow on identical paths, 16 passes, 4 layers)',
			width: 960,
			height: 640,
			state: heavyState,
			inspectView: null
		},
		{
			id: 'pending-buried',
			file: 'example-pending-buried.png',
			label: 'Pending File — Buried upper coats (80% flow, 36 passes, 6 layers)',
			width: 960,
			height: 640,
			state: buriedState,
			inspectView: null
		},
		{
			id: 'inspect-surface',
			file: 'example-inspect-surface.png',
			label: 'Pending File — Inspect surface 3.5× close-up over buried focal knot',
			width: 960,
			height: 640,
			state: buriedState,
			inspectView: 'focal'
		},
		{
			id: 'public-works-tenders',
			file: 'example-public-works-tenders.png',
			label: 'Public Works & Tenders — sweeping tar-umber, ochre, and lime-whitewash arcs',
			width: 960,
			height: 640,
			state: publicWorksState,
			inspectView: null
		},
		{
			id: 'counter-middleman',
			file: 'example-counter-middleman.png',
			label: 'Counter & Middleman — sharp directional whips and tangential spatter crust',
			width: 960,
			height: 640,
			state: counterMiddlemanState,
			inspectView: null
		},
		{
			id: 'whitewash-record',
			file: 'example-whitewash-record.png',
			label: 'Whitewash & Record — carbon-indigo and file-tape red veiled under chalky coats',
			width: 960,
			height: 640,
			state: whitewashRecordState,
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
			inspectZoom: DEFAULT_VIEW_STATE.inspectZoom,
			inspectCenterX: model.focalPoint.x,
			inspectCenterY: model.focalPoint.y
		});
		crop = computeInspectCropRect(
			{
				artboardWidth: spec.state.artboardWidth,
				artboardHeight: spec.state.artboardHeight
			},
			viewState.inspectZoom,
			viewState.inspectCenterX,
			viewState.inspectCenterY,
			spec.width,
			spec.height
		);
	}

	const pixelCount = spec.width * spec.height;
	const rgba = new Uint8ClampedArray(pixelCount * 4);
	const heightField = new Float32Array(pixelCount);

	renderPaintingStill(
		{ pixels: rgba, heightField, width: spec.width, height: spec.height },
		model,
		{ crop, width: spec.width, height: spec.height, maxProgress: 1 }
	);

	let pngBuffer = await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
		raw: {
			width: spec.width,
			height: spec.height,
			channels: 4
		}
	})
		.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
		.toBuffer();

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

	const metrics = measurePaintingMetrics(model, 600, 400);

	let cropHeightMin = Infinity;
	let cropHeightMax = -Infinity;
	let cropHeightSum = 0;
	for (let i = 0; i < heightField.length; i++) {
		const hv = heightField[i];
		if (hv < cropHeightMin) cropHeightMin = hv;
		if (hv > cropHeightMax) cropHeightMax = hv;
		cropHeightSum += hv;
	}

	return {
		pngBuffer,
		model,
		viewState,
		crop,
		metrics,
		cropHeightStats: {
			minHeight: roundTo(cropHeightMin, 4),
			meanHeight: roundTo(cropHeightSum / heightField.length, 4),
			maxHeight: roundTo(cropHeightMax, 4)
		}
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
				'Drip Painting Studio asset manifest sourceHash is out of date. Run `npm run drip-painting-studio:assets`.'
			);
		}
		if (!Array.isArray(manifest.assets) || manifest.assets.length !== specs.length) {
			throw new Error(
				`Drip Painting Studio asset manifest count mismatch (expected ${specs.length}, found ${Array.isArray(manifest.assets) ? manifest.assets.length : 'invalid'}).`
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
			`Drip Painting Studio assets verified (${manifest.assets.length} PNGs, sourceHash=${sourceHash.slice(0, 12)}).`
		);
		return;
	}

	await mkdir(outputDir, { recursive: true });

	const recordedAssets = [];
	for (const spec of specs) {
		const { pngBuffer, model, viewState, crop, metrics, cropHeightStats } =
			await renderSpecBuffer(spec);
		const outPath = path.join(outputDir, spec.file);
		await writeFile(outPath, pngBuffer);

		if (pngBuffer.byteLength > 750 * 1024) {
			throw new Error(
				`Generated ${spec.file} (${pngBuffer.byteLength} bytes) exceeds 750 KiB media budget.`
			);
		}

		const sha256 = createHash('sha256').update(pngBuffer).digest('hex');
		const studioUrl = `/tools/drip-painting-studio?${serializeStateParams(spec.state, {
			viewState
		}).toString()}`;

		const roundedShares = Object.fromEntries(
			Object.entries(metrics.pigmentShares).map(([key, value]) => [key, roundTo(value * 100, 2)])
		);

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
			study: spec.state.study,
			activePasses: model.depositionPasses.length,
			parameters: {
				passes: spec.state.passes,
				paintFlow: spec.state.paintFlow,
				sweepWidth: spec.state.sweepWidth,
				paintLayers: spec.state.paintLayers,
				paintTexture: spec.state.paintTexture,
				paintingTime: spec.state.paintingTime,
				artboardWidth: spec.state.artboardWidth,
				artboardHeight: spec.state.artboardHeight,
				viewMode: viewState?.mode ?? 'fill',
				inspectZoom: viewState?.inspectZoom ?? null,
				focalPoint: model.focalPoint,
				crop: {
					x: roundTo(crop.x, 2),
					y: roundTo(crop.y, 2),
					width: roundTo(crop.width, 2),
					height: roundTo(crop.height, 2)
				}
			},
			metrics: {
				coveragePct: roundTo(metrics.coveragePct, 2),
				meanHeight: roundTo(metrics.meanHeight, 4),
				maxHeight: roundTo(metrics.maxHeight, 4),
				poolCount: metrics.poolCount,
				dropletCount: metrics.dropletCount,
				pigmentSharesPct: roundedShares,
				...(spec.inspectView === 'focal' ? { cropHeightStats } : {})
			},
			description: model.description,
			studioUrl
		});

		console.log(
			`Wrote ${spec.file} (${spec.width}x${spec.height}, ${(pngBuffer.byteLength / 1024).toFixed(1)} KiB, passes=${model.depositionPasses.length}, cov=${metrics.coveragePct.toFixed(2)}%, pools=${metrics.poolCount}, drops=${metrics.dropletCount})`
		);
	}

	const manifest = {
		generatorVersion: DRIP_GENERATOR_VERSION,
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
