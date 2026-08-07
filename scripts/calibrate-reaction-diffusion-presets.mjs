import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createServer } from 'vite';

const root = process.cwd();
const outputDirectory = path.join(root, 'static', 'images', 'visualizations', 'reaction-diffusion');
const dataPath = path.join(outputDirectory, 'preset-calibration.json');
const montagePath = path.join(outputDirectory, 'preset-calibration.png');
const requestedId = process.argv.find((argument) => argument.startsWith('--preset='))?.slice(9);

await fs.mkdir(outputDirectory, { recursive: true });
const vite = await createServer({
	root,
	appType: 'custom',
	server: { middlewareMode: true },
	logLevel: 'error'
});

let modules;
try {
	modules = await Promise.all([
		vite.ssrLoadModule('/src/lib/visualizations/reaction-diffusion/presets.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/reaction-diffusion/engine.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/reaction-diffusion/metrics.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/reaction-diffusion/spectrum.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/reaction-diffusion/display.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/reaction-diffusion/types.ts')
	]);
} finally {
	await vite.close();
}

const [presetModule, engineModule, metricsModule, spectrumModule, displayModule, typesModule] =
	modules;
const candidates = requestedId
	? presetModule.REACTION_DIFFUSION_PRESETS.filter((preset) => preset.id === requestedId)
	: presetModule.REACTION_DIFFUSION_PRESETS;
if (candidates.length === 0) throw new Error(`Unknown reaction–diffusion preset ${requestedId}.`);

const calibrations = [];
const tiles = [];
for (const preset of candidates) {
	const setup = setupFromPreset(preset);
	const targetStep = Math.round(preset.recommendedModelTime / setup.timestep);
	if (Math.abs(targetStep * setup.timestep - preset.recommendedModelTime) > 1e-10) {
		throw new Error(
			`${preset.id} observation time is not an exact multiple of its fixed timestep.`
		);
	}
	console.log(
		`Calibrating ${preset.id}: ${targetStep} Heun steps at ${setup.gridSize} × ${setup.gridSize}…`
	);
	const startedAt = performance.now();
	const engine = new engineModule.ReactionDiffusionCpuEngine(setup);
	engine.step(targetStep);
	const state = engine.snapshot();
	const runtimeMs = performance.now() - startedAt;
	const metrics = metricsModule.calculateFieldMetrics(state);
	const spectrum = spectrumModule.calculateRadialSpectrum(state.v, state.size, setup.domainWidth, {
		mask: state.mask,
		window: setup.boundary === 'periodic' ? 'none' : 'hann'
	});
	const checksum = fieldChecksum(state);
	calibrations.push({
		id: preset.id,
		label: preset.label,
		observedFiniteTimeDescription: preset.description,
		observationPrompt: preset.observationPrompt,
		conditionalNote: preset.conditionalNote,
		setup,
		step: engine.stepIndex,
		modelTime: engine.modelTime,
		metrics,
		spectrum: {
			trustworthy: spectrum.trustworthy,
			dominantWavelength: spectrum.dominantWavelength,
			domainFraction: spectrum.domainFraction,
			prominence: spectrum.prominence,
			reason: spectrum.reason,
			window: spectrum.window
		},
		fieldSha256: checksum
	});

	const rendered = displayModule.renderReactionDiffusionPixelBuffer(state, setup, {
		mode: 'v',
		palette: 'mineral',
		width: 320,
		height: 320
	});
	const fieldPng = await sharp(Buffer.from(rendered.data.buffer), {
		raw: { width: rendered.width, height: rendered.height, channels: 4 }
	})
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
	const label = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64"><rect width="320" height="64" fill="#eee6d6"/><text x="16" y="25" font-family="monospace" font-size="15" font-weight="700" fill="#263b37">${escapeXml(preset.label)}</text><text x="16" y="47" font-family="monospace" font-size="12" fill="#395b55">F ${preset.feed.toFixed(4)} · k ${preset.kill.toFixed(4)} · t ${engine.modelTime}</text></svg>`
	);
	tiles.push({ fieldPng, label });
	console.log(
		`  ${runtimeMs.toFixed(0)} ms · mean V ${metrics.meanV.toPrecision(5)} · variance ${metrics.varianceV.toPrecision(5)} · ${checksum.slice(0, 12)}`
	);
}

const calibrationArtifact = {
	schemaVersion: 1,
	engineVersion: typesModule.REACTION_DIFFUSION_ENGINE_VERSION,
	model: typesModule.REACTION_DIFFUSION_MODEL_ID,
	method: 'Float64 CPU reference, fixed-step Heun RK2, second-order five-point Laplacian',
	claim:
		'Each row is an observed finite-time result for the exact setup shown, not a universal phase label.',
	calibrations
};

if (!requestedId) {
	await fs.writeFile(dataPath, `${JSON.stringify(calibrationArtifact, null, 2)}\n`);
	const columns = 3;
	const tileWidth = 320;
	const tileHeight = 384;
	const rows = Math.ceil(tiles.length / columns);
	const composites = [];
	for (let index = 0; index < tiles.length; index += 1) {
		const left = (index % columns) * tileWidth;
		const top = Math.floor(index / columns) * tileHeight;
		composites.push({ input: tiles[index].fieldPng, left, top });
		composites.push({ input: tiles[index].label, left, top: top + 320 });
	}
	await sharp({
		create: {
			width: columns * tileWidth,
			height: rows * tileHeight,
			channels: 4,
			background: '#eee6d6'
		}
	})
		.composite(composites)
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toFile(montagePath);
	console.log(`Wrote ${path.relative(root, dataPath)} and ${path.relative(root, montagePath)}.`);
}

function setupFromPreset(preset) {
	const setup = { ...preset };
	for (const key of [
		'id',
		'label',
		'description',
		'recommendedModelTime',
		'observationPrompt',
		'conditionalNote'
	]) {
		delete setup[key];
	}
	return setup;
}

function fieldChecksum(state) {
	const hash = crypto.createHash('sha256');
	hash.update(Buffer.from(state.u.buffer, state.u.byteOffset, state.u.byteLength));
	hash.update(Buffer.from(state.v.buffer, state.v.byteOffset, state.v.byteLength));
	hash.update(Buffer.from(state.mask.buffer, state.mask.byteOffset, state.mask.byteLength));
	return hash.digest('hex');
}

function escapeXml(value) {
	return value.replace(/[<>&"']/gu, (character) => {
		if (character === '<') return '&lt;';
		if (character === '>') return '&gt;';
		if (character === '&') return '&amp;';
		if (character === '"') return '&quot;';
		return '&apos;';
	});
}
