import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	DOMAIN_SHAPES,
	FIXED_ACTIVATOR_DIFFUSION,
	PRESET_ORDER,
	SPOTS_AND_STRIPES_ENGINE_VERSION,
	SPOT_STRIPE_PRESETS,
	SpotStripeSolver,
	SynchronisedComparisonEngine,
	configFromPreset,
	createSeededDisturbance,
	renderFieldToRgba
} from '../src/lib/visualizations/how-spots-and-stripes-form/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'static', 'images', 'visualizations', 'how-spots-and-stripes-form');
const checkMode = process.argv.includes('--check');

const sourceFiles = [
	'src/lib/visualizations/how-spots-and-stripes-form/types.ts',
	'src/lib/visualizations/how-spots-and-stripes-form/presets.ts',
	'src/lib/visualizations/how-spots-and-stripes-form/engine.ts',
	'src/lib/visualizations/how-spots-and-stripes-form/display.ts',
	'scripts/render-spots-and-stripes-assets.mjs'
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

function fieldSha256(snapshot) {
	const hash = createHash('sha256');
	hash.update(Buffer.from(snapshot.u.buffer, snapshot.u.byteOffset, snapshot.u.byteLength));
	hash.update(Buffer.from(snapshot.v.buffer, snapshot.v.byteOffset, snapshot.v.byteLength));
	hash.update(Buffer.from(snapshot.mask.buffer, snapshot.mask.byteOffset, snapshot.mask.byteLength));
	return hash.digest('hex');
}

async function snapshotToPngBuffer(snapshot, width, height, viewMode = 'activator') {
	const rgba = renderFieldToRgba(snapshot, { viewMode });
	return sharp(Buffer.from(rgba.buffer), {
		raw: { width: snapshot.nx, height: snapshot.ny, channels: 4 }
	})
		.resize(width, height, { fit: 'fill', kernel: sharp.kernel.nearest })
		.png({ compressionLevel: 9 })
		.toBuffer();
}

const expectedFiles = {
	'social.png': [1200, 630],
	'poster.png': [1200, 750],
	'preset-spots.png': [384, 384],
	'preset-stripes.png': [384, 384],
	'preset-inverse-spots.png': [384, 384]
};

const sourceHash = await computeSourceHash();

if (checkMode) {
	const manifestPath = path.join(outputDir, 'assets.json');
	const calibrationPath = path.join(outputDir, 'calibration.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	const calibration = JSON.parse(await readFile(calibrationPath, 'utf8'));

	if (manifest.sourceHash !== sourceHash) {
		throw new Error(
			'How spots and stripes form assets are stale relative to engine/script sources. Run npm run spots-and-stripes:assets.'
		);
	}
	if (calibration.engineVersion !== SPOTS_AND_STRIPES_ENGINE_VERSION) {
		throw new Error('How spots and stripes form calibration engineVersion mismatch.');
	}
	if (!Array.isArray(calibration.presets) || calibration.presets.length !== 3) {
		throw new Error('How spots and stripes form calibration record must include all three presets.');
	}

	for (const [name, [expectedW, expectedH]] of Object.entries(expectedFiles)) {
		const bytes = await readFile(path.join(outputDir, name));
		if (bytes.length > 750 * 1024) {
			throw new Error(`How spots and stripes form asset exceeds 750 KiB: ${name}`);
		}
		const meta = await sharp(bytes).metadata();
		if (meta.width !== expectedW || meta.height !== expectedH) {
			throw new Error(
				`How spots and stripes form asset ${name} has dimensions ${meta.width}x${meta.height}; expected ${expectedW}x${expectedH}.`
			);
		}
		const actualHash = await rawPixelSha256(bytes);
		if (actualHash !== manifest.files[name]?.pixelSha256) {
			throw new Error(`How spots and stripes form asset pixel hash mismatch: ${name}`);
		}
	}

	console.log(
		'How spots and stripes form: verified social card, computed preview poster, 3 preset plates, and calibration record.'
	);
	process.exit(0);
}

await mkdir(outputDir, { recursive: true });

const presetRecords = [];
const presetSnapshots = new Map();
const presetBuffers = new Map();

for (const presetId of PRESET_ORDER) {
	const preset = SPOT_STRIPE_PRESETS[presetId];
	const config = configFromPreset(presetId);
	const shapeSpec = DOMAIN_SHAPES[config.shape];
	const steps = Math.round(config.observationTime / config.timestep);

	const sharedDisturbance = createSeededDisturbance(
		shapeSpec.nx,
		shapeSpec.ny,
		config.seed,
		config.disturbanceAmplitude
	);

	const solver = new SpotStripeSolver(config, { disturbance: sharedDisturbance });
	solver.step(steps);
	const snap = solver.snapshot();
	presetSnapshots.set(presetId, snap);

	// Timestep refinement check at dt / 2 (0.005)
	const refinedSolver = new SpotStripeSolver(
		{ ...config, timestep: config.timestep * 0.5 },
		{ disturbance: sharedDisturbance }
	);
	refinedSolver.step(steps * 2);
	let sqDiffSum = 0;
	let maxAbsDiff = 0;
	for (let i = 0; i < snap.u.length; i += 1) {
		const diff = Math.abs(snap.u[i] - refinedSolver.u[i]);
		sqDiffSum += diff * diff;
		if (diff > maxAbsDiff) maxAbsDiff = diff;
	}
	const refinementRmsDiffU = Math.sqrt(sqDiffSum / snap.u.length);

	const fileName = `preset-${presetId}.png`;
	const pngBuf = await snapshotToPngBuffer(snap, 384, 384, 'activator');
	await writeFile(path.join(outputDir, fileName), pngBuf);
	presetBuffers.set(fileName, pngBuf);

	presetRecords.push({
		id: preset.id,
		label: preset.label,
		description: preset.description,
		patternBalance: config.patternBalance,
		diffusionU: FIXED_ACTIVATOR_DIFFUSION,
		diffusionV: FIXED_ACTIVATOR_DIFFUSION * config.inhibitorRatio,
		inhibitorRatio: config.inhibitorRatio,
		uniformEquilibrium: Number(snap.equilibrium.toFixed(6)),
		seed: config.seed,
		disturbanceAmplitude: config.disturbanceAmplitude,
		domain: {
			shape: config.shape,
			nx: shapeSpec.nx,
			ny: shapeSpec.ny,
			gridSpacing: shapeSpec.gridSpacing,
			physicalWidth: shapeSpec.physicalWidth,
			physicalHeight: shapeSpec.physicalHeight,
			boundaryCondition: 'no-flux (zero normal derivative across domain edges)'
		},
		integrator: 'Explicit second-order Heun (RK2) with five-point Laplacian stencil',
		timestep: config.timestep,
		eulerDiffusionStabilityLimit: Number(snap.stability.eulerDiffusionLimit.toFixed(6)),
		observationTime: config.observationTime,
		steps,
		referenceImage: `/images/visualizations/how-spots-and-stripes-form/${fileName}`,
		fieldSha256: fieldSha256(snap),
		measurements: {
			meanU: Number(snap.summary.meanU.toFixed(5)),
			stdU: Number(snap.summary.stdU.toFixed(5)),
			minU: Number(snap.summary.minU.toFixed(4)),
			maxU: Number(snap.summary.maxU.toFixed(4)),
			skewU: Number(snap.summary.skewU.toFixed(4)),
			fractionAboveZero: Number(snap.summary.fractionAboveZero.toFixed(4)),
			positiveComponents: snap.summary.positiveComponents,
			negativeComponents: snap.summary.negativeComponents,
			laplacianSumU: Number(snap.summary.laplacianSumU.toExponential(3)),
			growingSpatialModes: snap.modeAnalysis.growingModeCount,
			fastestModeGrowthRate: Number(snap.modeAnalysis.maxGrowthRate.toFixed(4)),
			fastestModeWavelength:
				snap.modeAnalysis.dominantMode.wavelength !== null
					? Number(snap.modeAnalysis.dominantMode.wavelength.toFixed(2))
					: null,
			halfTimestepRmsDiffU: Number(refinementRmsDiffU.toExponential(3)),
			halfTimestepMaxDiffU: Number(maxAbsDiff.toExponential(3))
		}
	});
}

// Compute the worked comparison (Spots 15x vs Equal spreading 1x) for the poster & social card
const comparisonEngine = new SynchronisedComparisonEngine(configFromPreset('spots'));
comparisonEngine.step(Math.round(60 / 0.01));
const comparisonSnap = comparisonEngine.snapshot();

// 1. Build poster.png (1200 x 750): Computed example of Spots (t = 60) + Equal spreading comparison
const spotsLargeField = await snapshotToPngBuffer(comparisonSnap.different, 560, 560, 'activator');
const equalSmallField = await snapshotToPngBuffer(comparisonSnap.equal, 240, 240, 'activator');
const stripesSmallField = await snapshotToPngBuffer(
	presetSnapshots.get('stripes'),
	240,
	240,
	'activator'
);

const posterChromeSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
  <rect width="1200" height="750" fill="#101416"/>
  <rect x="24" y="24" width="1152" height="702" rx="12" fill="#202629" stroke="#364046" stroke-width="1.5"/>
  <!-- Top status bar -->
  <rect x="44" y="42" width="1112" height="48" rx="8" fill="#171C1F" stroke="#2D353A"/>
  <circle cx="68" cy="66" r="6" fill="#68DCA1"/>
  <text x="84" y="71" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="16" font-weight="700">Computed example · Spots preset (t = 60.0)</text>
  <rect x="926" y="51" width="216" height="30" rx="6" fill="#D97536"/>
  <text x="1034" y="71" text-anchor="middle" fill="#101416" font-family="Arial, sans-serif" font-size="14" font-weight="700">Grow from noise</text>

  <!-- Main simulation viewport frame -->
  <rect x="44" y="106" width="584" height="584" rx="8" fill="#101416" stroke="#384248" stroke-width="1.5"/>
  <text x="56" y="712" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="15">Different spreading rates (15× inhibitor, Dv = 9.0, Du = 0.6) · σu = ${comparisonSnap.different.summary.stdU.toFixed(3)}</text>

  <!-- Right comparison column -->
  <rect x="652" y="106" width="504" height="292" rx="8" fill="#171C1F" stroke="#30383C"/>
  <text x="674" y="138" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="18" font-weight="700">Worked comparison: spreading rates</text>
  <text x="674" y="164" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">Same seed (1952), same pattern balance (k = −0.075)</text>
  <rect x="674" y="180" width="244" height="202" rx="6" fill="#101416" stroke="#343D42"/>
  <text x="936" y="210" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="16" font-weight="700">Equal spreading (1×)</text>
  <text x="936" y="236" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">Dv = Du = 0.6</text>
  <text x="936" y="268" fill="#68DCA1" font-family="Courier New, monospace" font-size="15" font-weight="700">σu = 0.0000</text>
  <text x="936" y="296" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">Initial differences</text>
  <text x="936" y="316" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">smooth out to the</text>
  <text x="936" y="336" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">uniform equilibrium</text>
  <text x="936" y="356" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">u = v = −0.273.</text>

  <!-- Bottom right: Stripes comparison -->
  <rect x="652" y="414" width="504" height="276" rx="8" fill="#171C1F" stroke="#30383C"/>
  <text x="674" y="446" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="18" font-weight="700">Pattern balance shifts spots to stripes</text>
  <rect x="674" y="462" width="244" height="208" rx="6" fill="#101416" stroke="#343D42"/>
  <text x="936" y="492" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="16" font-weight="700">Stripes (k = 0.000)</text>
  <text x="936" y="518" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">15× inhibitor spreading</text>
  <text x="936" y="550" fill="#68DCA1" font-family="Courier New, monospace" font-size="15" font-weight="700">σu = ${presetSnapshots.get('stripes').summary.stdU.toFixed(3)}</text>
  <text x="936" y="578" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">Balanced high- and</text>
  <text x="936" y="598" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">low-signal regions</text>
  <text x="936" y="618" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="14">connect into bands.</text>
</svg>
`);

const equalCropped = await sharp(equalSmallField)
	.resize(240, 198, { fit: 'cover' })
	.png()
	.toBuffer();
const stripesCropped = await sharp(stripesSmallField)
	.resize(240, 204, { fit: 'cover' })
	.png()
	.toBuffer();

const posterBuffer = await sharp(posterChromeSvg)
	.composite([
		{ input: spotsLargeField, left: 56, top: 118 },
		{ input: equalCropped, left: 676, top: 182 },
		{ input: stripesCropped, left: 676, top: 464 }
	])
	.png({ compressionLevel: 9 })
	.toBuffer();

await writeFile(path.join(outputDir, 'poster.png'), posterBuffer);
presetBuffers.set('poster.png', posterBuffer);

// 2. Build social.png (1200 x 630)
const socialSpots = await snapshotToPngBuffer(presetSnapshots.get('spots'), 220, 220, 'activator');
const socialStripes = await snapshotToPngBuffer(
	presetSnapshots.get('stripes'),
	220,
	220,
	'activator'
);
const socialInverse = await snapshotToPngBuffer(
	presetSnapshots.get('inverse-spots'),
	220,
	220,
	'activator'
);

const socialSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#101416"/>
  <rect x="24" y="24" width="1152" height="582" rx="14" fill="#202629" stroke="#364046" stroke-width="2"/>
  <circle cx="64" cy="68" r="6" fill="#68DCA1"/>
  <text x="82" y="73" fill="#68DCA1" font-family="Courier New, monospace" font-size="15" font-weight="700" letter-spacing="1.5">INTERACTIVE TURING-PATTERN INSTRUMENT</text>
  <text x="58" y="138" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="48" font-weight="700">How spots and stripes form</text>
  <text x="58" y="178" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="21">Grow patterns from tiny disturbances, compare equal spreading rates, and change the surface shape.</text>

  <!-- Three computed plates -->
  <rect x="58" y="214" width="236" height="292" rx="8" fill="#161B1E" stroke="#343E44"/>
  <text x="74" y="472" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="18" font-weight="700">Spots</text>
  <text x="74" y="494" fill="#B8C0C3" font-family="Courier New, monospace" font-size="14">k = −0.075 · 15× inhibitor</text>

  <rect x="314" y="214" width="236" height="292" rx="8" fill="#161B1E" stroke="#343E44"/>
  <text x="330" y="472" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="18" font-weight="700">Stripes</text>
  <text x="330" y="494" fill="#B8C0C3" font-family="Courier New, monospace" font-size="14">k = 0.000 · 15× inhibitor</text>

  <rect x="570" y="214" width="236" height="292" rx="8" fill="#161B1E" stroke="#343E44"/>
  <text x="586" y="472" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="18" font-weight="700">Inverse spots</text>
  <text x="586" y="494" fill="#B8C0C3" font-family="Courier New, monospace" font-size="14">k = +0.075 · 15× inhibitor</text>

  <!-- Right control card -->
  <rect x="830" y="214" width="312" height="292" rx="8" fill="#161B1E" stroke="#343E44"/>
  <rect x="854" y="238" width="264" height="46" rx="8" fill="#D97536"/>
  <text x="986" y="267" text-anchor="middle" fill="#101416" font-family="Arial, sans-serif" font-size="18" font-weight="700">Grow from noise</text>
  <text x="854" y="320" fill="#F1F0E8" font-family="Arial, sans-serif" font-size="17" font-weight="700">Central comparison</text>
  <text x="854" y="348" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="15">15× inhibitor: pattern grows</text>
  <text x="854" y="372" fill="#68DCA1" font-family="Courier New, monospace" font-size="15" font-weight="700">σu = ${comparisonSnap.different.summary.stdU.toFixed(3)} at t = 60</text>
  <text x="854" y="410" fill="#B8C0C3" font-family="Arial, sans-serif" font-size="15">1× equal spreading: fades</text>
  <text x="854" y="434" fill="#B8C0C3" font-family="Courier New, monospace" font-size="15">σu = 0.0000 at t = 60</text>
  <text x="854" y="484" fill="#B8C0C3" font-family="Courier New, monospace" font-size="13">SUVROGHOSH.IN / VISUALIZATIONS</text>

  <text x="58" y="564" fill="#B8C0C3" font-family="Courier New, monospace" font-size="15">∂u/∂t = 0.6∇²u + u − u³ − 1.2v + k   ·   ∂v/∂t = Dv∇²v + 1.5(u − v)</text>
</svg>
`);

const socialBuffer = await sharp(socialSvg)
	.composite([
		{ input: socialSpots, left: 66, top: 222 },
		{ input: socialStripes, left: 322, top: 222 },
		{ input: socialInverse, left: 578, top: 222 }
	])
	.png({ compressionLevel: 9 })
	.toBuffer();

await writeFile(path.join(outputDir, 'social.png'), socialBuffer);
presetBuffers.set('social.png', socialBuffer);

const calibrationArtifact = {
	schemaVersion: 1,
	engineVersion: SPOTS_AND_STRIPES_ENGINE_VERSION,
	model: {
		activatorEquation: 'du/dt = 0.6 * laplacian(u) + u - u^3 - 1.2v + k',
		inhibitorEquation: 'dv/dt = Dv * laplacian(v) + 1.5 * (u - v)',
		equilibriumEquation: 'u = v = s where s^3 + 0.2s = k',
		fieldsNote:
			'u and v are normalised, signed signal fields. Negative values are valid; they are not nonnegative chemical concentrations.'
	},
	equalSpreadingComparison: {
		presetId: 'spots',
		seed: 1952,
		observationTime: 60,
		differentSpreading: {
			inhibitorRatio: 15,
			diffusionU: 0.6,
			diffusionV: 9.0,
			finalStdU: Number(comparisonSnap.different.summary.stdU.toFixed(5))
		},
		equalSpreading: {
			inhibitorRatio: 1,
			diffusionU: 0.6,
			diffusionV: 0.6,
			finalStdU: Number(comparisonSnap.equal.summary.stdU.toFixed(6))
		},
		verdict: comparisonSnap.verdict
	},
	presets: presetRecords
};

await writeFile(
	path.join(outputDir, 'calibration.json'),
	`${JSON.stringify(calibrationArtifact, null, 2)}\n`
);

const manifestFiles = {};
for (const [name, [width, height]] of Object.entries(expectedFiles)) {
	const buf = presetBuffers.get(name);
	manifestFiles[name] = {
		width,
		height,
		bytes: buf.length,
		pixelSha256: await rawPixelSha256(buf)
	};
}

await writeFile(
	path.join(outputDir, 'assets.json'),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			engineVersion: SPOTS_AND_STRIPES_ENGINE_VERSION,
			sourceHash,
			sources: sourceFiles,
			files: manifestFiles
		},
		null,
		2
	)}\n`
);

console.log(
	'How spots and stripes form: generated social.png, poster.png, 3 preset reference plates, calibration.json, and assets.json.'
);
