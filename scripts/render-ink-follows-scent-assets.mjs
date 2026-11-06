import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
	DEFAULT_SEED,
	DESKTOP_PARTICLE_COUNT,
	FIXED_TIMESTEP,
	INK_FOLLOWS_SCENT_ENGINE_VERSION,
	INK_SCENT_PRESETS,
	InkFollowsScentEngine,
	LOGICAL_HEIGHT,
	LOGICAL_WIDTH,
	PRESET_ORDER,
	TRAIL_HEIGHT,
	TRAIL_WIDTH,
	renderRunToRgba
} from '../src/lib/visualizations/ink-that-follows-a-scent/index.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'static', 'images', 'visualizations', 'ink-that-follows-a-scent');
const checkMode = process.argv.includes('--check');

const sourceFiles = [
	'src/lib/visualizations/ink-that-follows-a-scent/types.ts',
	'src/lib/visualizations/ink-that-follows-a-scent/random.ts',
	'src/lib/visualizations/ink-that-follows-a-scent/presets.ts',
	'src/lib/visualizations/ink-that-follows-a-scent/field.ts',
	'src/lib/visualizations/ink-that-follows-a-scent/engine.ts',
	'src/lib/visualizations/ink-that-follows-a-scent/display.ts',
	'scripts/render-ink-follows-scent-assets.mjs'
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

function runStateSha256(snap) {
	const hash = createHash('sha256');
	hash.update(
		Buffer.from(
			snap.sensingOn.px.buffer,
			snap.sensingOn.px.byteOffset,
			snap.sensingOn.px.byteLength
		)
	);
	hash.update(
		Buffer.from(
			snap.sensingOn.py.buffer,
			snap.sensingOn.py.byteOffset,
			snap.sensingOn.py.byteLength
		)
	);
	hash.update(
		Buffer.from(
			snap.sensingOff.px.buffer,
			snap.sensingOff.px.byteOffset,
			snap.sensingOff.px.byteLength
		)
	);
	hash.update(
		Buffer.from(
			snap.sensingOff.py.buffer,
			snap.sensingOff.py.byteOffset,
			snap.sensingOff.py.byteLength
		)
	);
	return hash.digest('hex');
}

async function renderRunBufferToPng(run, field, width, height, options = {}) {
	const rgba = renderRunToRgba(run, field, options);
	return sharp(Buffer.from(rgba.buffer), {
		raw: { width: TRAIL_WIDTH, height: TRAIL_HEIGHT, channels: 4 }
	})
		.resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
		.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
		.toBuffer();
}

const expectedFiles = {
	'social.png': [1200, 630],
	'poster.png': [1200, 750],
	'preset-one-source.png': [512, 384],
	'preset-curved-line.png': [512, 384]
};

const sourceHash = await computeSourceHash();

if (checkMode) {
	const manifestPath = path.join(outputDir, 'assets.json');
	const calibrationPath = path.join(outputDir, 'calibration.json');
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
	const calibration = JSON.parse(await readFile(calibrationPath, 'utf8'));

	if (manifest.sourceHash !== sourceHash) {
		throw new Error(
			'Ink That Follows a Scent assets are stale relative to engine/script sources. Run npm run ink-follows-scent:assets.'
		);
	}
	if (calibration.engineVersion !== INK_FOLLOWS_SCENT_ENGINE_VERSION) {
		throw new Error('Ink That Follows a Scent calibration engineVersion mismatch.');
	}
	if (!Array.isArray(calibration.presets) || calibration.presets.length !== 2) {
		throw new Error('Ink That Follows a Scent calibration record must include both presets.');
	}

	for (const [name, [expectedW, expectedH]] of Object.entries(expectedFiles)) {
		const bytes = await readFile(path.join(outputDir, name));
		if (bytes.length > 750 * 1024) {
			throw new Error(`Ink That Follows a Scent asset exceeds 750 KiB: ${name}`);
		}
		const meta = await sharp(bytes).metadata();
		if (meta.width !== expectedW || meta.height !== expectedH) {
			throw new Error(
				`Ink That Follows a Scent asset ${name} has dimensions ${meta.width}x${meta.height}; expected ${expectedW}x${expectedH}.`
			);
		}
		const actualHash = await rawPixelSha256(bytes);
		if (actualHash !== manifest.files[name]?.pixelSha256) {
			throw new Error(`Ink That Follows a Scent asset pixel hash mismatch: ${name}`);
		}
	}

	console.log(
		'Ink That Follows a Scent: verified social card, computed comparison poster, 2 preset plates, and calibration record.'
	);
	process.exit(0);
}

await mkdir(outputDir, { recursive: true });

const observationTimeSec = 14;
const totalSteps = Math.round(observationTimeSec / FIXED_TIMESTEP);
const presetRecords = [];
const presetEngines = new Map();
const generatedBuffers = new Map();

for (const presetId of PRESET_ORDER) {
	const preset = INK_SCENT_PRESETS[presetId];
	const engine = new InkFollowsScentEngine({
		presetId,
		seed: DEFAULT_SEED,
		particleCount: DESKTOP_PARTICLE_COUNT
	});
	const initialAvgOn = engine.sensingOnRun.averageChemical;
	const initialAvgOff = engine.sensingOffRun.averageChemical;

	engine.step(totalSteps);
	const snap = engine.snapshot();
	presetEngines.set(presetId, engine);

	const fileName = `preset-${presetId}.png`;
	const pngBuf = await renderRunBufferToPng(engine.sensingOnRun, engine.field, 512, 384, {
		showChemical: true,
		showParticles: true
	});
	await writeFile(path.join(outputDir, fileName), pngBuf);
	generatedBuffers.set(fileName, pngBuf);

	presetRecords.push({
		id: preset.id,
		label: preset.label,
		description: preset.shortDescription,
		seed: DEFAULT_SEED,
		particleCount: DESKTOP_PARTICLE_COUNT,
		domain: {
			logicalWidth: LOGICAL_WIDTH,
			logicalHeight: LOGICAL_HEIGHT,
			trailWidth: TRAIL_WIDTH,
			trailHeight: TRAIL_HEIGHT,
			boundaryCondition: 'reflecting'
		},
		timestep: FIXED_TIMESTEP,
		observationTime: observationTimeSec,
		steps: totalSteps,
		settings: snap.settings,
		stateSha256: runStateSha256(snap),
		referenceImage: `/images/visualizations/ink-that-follows-a-scent/${fileName}`,
		measurements: {
			initialAverageChemicalOn: Number(initialAvgOn.toFixed(5)),
			initialAverageChemicalOff: Number(initialAvgOff.toFixed(5)),
			finalAverageChemicalOn: Number(snap.sensingOn.telemetry.averageChemical.toFixed(5)),
			finalAverageChemicalOff: Number(snap.sensingOff.telemetry.averageChemical.toFixed(5)),
			uphillStepFractionOn: Number(snap.sensingOn.telemetry.uphillStepFraction.toFixed(4)),
			maxTrailIntensityOn: Number(snap.sensingOn.telemetry.maxTrailIntensity.toFixed(4)),
			maxTrailIntensityOff: Number(snap.sensingOff.telemetry.maxTrailIntensity.toFixed(4))
		}
	});
}

const oneSourceEngine = presetEngines.get('one-source');
const curvedLineEngine = presetEngines.get('curved-line');
const avgOn = oneSourceEngine.sensingOnRun.averageChemical;
const avgOff = oneSourceEngine.sensingOffRun.averageChemical;

// 1. Build poster.png (1200 x 750)
const posterSensingOn = await renderRunBufferToPng(
	oneSourceEngine.sensingOnRun,
	oneSourceEngine.field,
	520,
	390,
	{ showChemical: true, showParticles: true }
);
const posterSensingOff = await renderRunBufferToPng(
	oneSourceEngine.sensingOffRun,
	oneSourceEngine.field,
	520,
	390,
	{ showChemical: true, showParticles: true }
);

const onBarW = Math.round(Math.min(1, avgOn) * 440);
const offBarW = Math.round(Math.min(1, avgOff) * 440);

const posterSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
  <rect width="1200" height="750" fill="#101315"/>
  <!-- Outer warm wood trim + bevelled graphite chassis -->
  <rect x="20" y="20" width="1160" height="710" rx="14" fill="#583822"/>
  <rect x="24" y="24" width="1152" height="702" rx="11" fill="#202629" stroke="#384147" stroke-width="1.5"/>

  <!-- Top header bar -->
  <rect x="44" y="42" width="1112" height="54" rx="8" fill="#151A1D" stroke="#283035"/>
  <rect x="64" y="65" width="34" height="6" rx="3" fill="#FFAA4C"/>
  <text x="112" y="74" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="18" font-weight="700">Ink That Follows a Scent · Paired comparison from same start (t = 14.0 s, seed 2026)</text>
  <rect x="928" y="52" width="212" height="34" rx="6" fill="#FFAA4C"/>
  <text x="1034" y="74" text-anchor="middle" fill="#101315" font-family="Arial, sans-serif" font-size="14" font-weight="700">Compare from same start</text>

  <!-- Subtitle banner -->
  <text x="46" y="124" fill="#B8C0C2" font-family="Arial, sans-serif" font-size="15">Same starting points. Same random nudges. Sensing on versus off. (5,000 independent particles per panel)</text>

  <!-- Left panel: Sensing on -->
  <rect x="44" y="140" width="544" height="442" rx="9" fill="#151A1D" stroke="#384147"/>
  <text x="60" y="168" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="16" font-weight="700">Sensing on</text>
  <text x="572" y="168" text-anchor="end" fill="#FFAA4C" font-family="Courier New, monospace" font-size="14" font-weight="700">Sensitivity: 1.2</text>

  <!-- Right panel: Sensing off -->
  <rect x="612" y="140" width="544" height="442" rx="9" fill="#151A1D" stroke="#384147"/>
  <text x="628" y="168" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="16" font-weight="700">Sensing off</text>
  <text x="1140" y="168" text-anchor="end" fill="#B8C0C2" font-family="Courier New, monospace" font-size="14" font-weight="700">Sensitivity: 0.0</text>

  <!-- Bottom measurement bar -->
  <rect x="44" y="598" width="1112" height="108" rx="9" fill="#151A1D" stroke="#283035"/>
  <text x="64" y="626" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="16" font-weight="700">Average chemical at particle positions</text>
  <text x="1136" y="626" text-anchor="end" fill="#B8C0C2" font-family="Arial, sans-serif" font-size="14">Higher means particles are currently in stronger chemical.</text>

  <!-- Sensing on bar -->
  <text x="64" y="656" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="14">Sensing on</text>
  <text x="504" y="656" text-anchor="end" fill="#FFAA4C" font-family="Courier New, monospace" font-size="15" font-weight="700">${avgOn.toFixed(3)}</text>
  <rect x="64" y="666" width="440" height="12" rx="6" fill="#0A0E10" stroke="#283035"/>
  <rect x="64" y="666" width="${onBarW}" height="12" rx="6" fill="#FFAA4C"/>

  <!-- Sensing off bar -->
  <text x="632" y="656" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="14">Sensing off</text>
  <text x="1072" y="656" text-anchor="end" fill="#B8C0C2" font-family="Courier New, monospace" font-size="15" font-weight="700">${avgOff.toFixed(3)}</text>
  <rect x="632" y="666" width="440" height="12" rx="6" fill="#0A0E10" stroke="#283035"/>
  <rect x="632" y="666" width="${offBarW}" height="12" rx="6" fill="#7F8C91"/>
</svg>
`);

const posterBuffer = await sharp(posterSvg)
	.composite([
		{ input: posterSensingOn, left: 56, top: 180 },
		{ input: posterSensingOff, left: 624, top: 180 }
	])
	.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
	.toBuffer();

await writeFile(path.join(outputDir, 'poster.png'), posterBuffer);
generatedBuffers.set('poster.png', posterBuffer);

// 2. Build social.png (1200 x 630)
const socialOneSource = await renderRunBufferToPng(
	oneSourceEngine.sensingOnRun,
	oneSourceEngine.field,
	340,
	255,
	{ showChemical: true, showParticles: true }
);
const socialCurved = await renderRunBufferToPng(
	curvedLineEngine.sensingOnRun,
	curvedLineEngine.field,
	340,
	255,
	{ showChemical: true, showParticles: true }
);
const socialControl = await renderRunBufferToPng(
	oneSourceEngine.sensingOffRun,
	oneSourceEngine.field,
	340,
	255,
	{ showChemical: false, showParticles: true }
);

const socialSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#101315"/>
  <rect x="20" y="20" width="1160" height="590" rx="14" fill="#583822"/>
  <rect x="24" y="24" width="1152" height="582" rx="11" fill="#202629" stroke="#384147" stroke-width="1.5"/>

  <rect x="56" y="56" width="38" height="6" rx="3" fill="#FFAA4C"/>
  <text x="108" y="65" fill="#FFAA4C" font-family="Courier New, monospace" font-size="15" font-weight="700" letter-spacing="1.4">INTERACTIVE CHEMOTAXIS &amp; BIASED RANDOM WALK LAB</text>

  <text x="56" y="122" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="46" font-weight="700">Ink That Follows a Scent</text>
  <text x="56" y="160" fill="#B8C0C2" font-family="Arial, sans-serif" font-size="20">Paint an invisible chemical trail. Watch 5,000 wandering particles reveal it.</text>

  <!-- Three computed panels -->
  <rect x="56" y="192" width="356" height="328" rx="8" fill="#151A1D" stroke="#384147"/>
  <text x="72" y="484" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="17" font-weight="700">One source (Sensing on)</text>
  <text x="72" y="506" fill="#FFAA4C" font-family="Courier New, monospace" font-size="14">Avg chemical: ${avgOn.toFixed(3)}</text>

  <rect x="422" y="192" width="356" height="328" rx="8" fill="#151A1D" stroke="#384147"/>
  <text x="438" y="484" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="17" font-weight="700">Curved line (Sensing on)</text>
  <text x="438" y="506" fill="#FFAA4C" font-family="Courier New, monospace" font-size="14">Avg chemical: ${curvedLineEngine.sensingOnRun.averageChemical.toFixed(3)}</text>

  <rect x="788" y="192" width="356" height="328" rx="8" fill="#151A1D" stroke="#384147"/>
  <text x="804" y="484" fill="#F0F1EC" font-family="Arial, sans-serif" font-size="17" font-weight="700">Same start (Sensing off)</text>
  <text x="804" y="506" fill="#B8C0C2" font-family="Courier New, monospace" font-size="14">Avg chemical: ${avgOff.toFixed(3)}</text>

  <text x="56" y="566" fill="#B8C0C2" font-family="Courier New, monospace" font-size="15">x(t + dt) = reflect(x(t) + √(2D·dt)·Z + sensitivity·∇C(x)·dt)   ·   SUVROGHOSH.IN</text>
</svg>
`);

const socialBuffer = await sharp(socialSvg)
	.composite([
		{ input: socialOneSource, left: 64, top: 200 },
		{ input: socialCurved, left: 430, top: 200 },
		{ input: socialControl, left: 796, top: 200 }
	])
	.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
	.toBuffer();

await writeFile(path.join(outputDir, 'social.png'), socialBuffer);
generatedBuffers.set('social.png', socialBuffer);

const calibrationArtifact = {
	schemaVersion: 1,
	engineVersion: INK_FOLLOWS_SCENT_ENGINE_VERSION,
	model: {
		updateRule:
			'nextPosition = reflectAtBoundary(position + sqrt(2 * D * dt) * randomVector + sensitivity * gradient(C, position) * dt)',
		randomKey: '(seed, particleId, simulationStep, component)',
		fieldModel:
			'Prescribed 256x192 chemical concentration grid on fixed [0, 1] scale (painted grid + movable Gaussian source); no chemical diffusion or decay.'
	},
	presets: presetRecords
};

await writeFile(
	path.join(outputDir, 'calibration.json'),
	`${JSON.stringify(calibrationArtifact, null, 2)}\n`
);

const manifestFiles = {};
for (const [name, [width, height]] of Object.entries(expectedFiles)) {
	const buf = generatedBuffers.get(name);
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
			engineVersion: INK_FOLLOWS_SCENT_ENGINE_VERSION,
			sourceHash,
			sources: sourceFiles,
			files: manifestFiles
		},
		null,
		2
	)}\n`
);

console.log(
	'Ink That Follows a Scent: generated social.png, poster.png, 2 preset reference plates, calibration.json, and assets.json.'
);
