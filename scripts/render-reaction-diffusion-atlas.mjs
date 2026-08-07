import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createServer } from 'vite';

const root = process.cwd();
const imageDirectory = path.join(root, 'static', 'images');
const detailDirectory = path.join(imageDirectory, 'visualizations', 'reaction-diffusion');
const heroPath = path.join(imageDirectory, 'reaction-diffusion-atlas.png');
const fieldPath = path.join(imageDirectory, 'reaction-diffusion-atlas-field.png');
const guidePath = path.join(detailDirectory, 'guided-observations.png');
const metadataPath = path.join(detailDirectory, 'metadata.json');

await fs.mkdir(detailDirectory, { recursive: true });

// Load the same TypeScript modules used by the browser. Vite supplies the repository's
// aliases and transforms; this avoids maintaining a second poster-only solver.
const vite = await createServer({
	root,
	appType: 'custom',
	server: { middlewareMode: true },
	logLevel: 'error'
});

let model;
try {
	model = await vite.ssrLoadModule('/src/lib/visualizations/reaction-diffusion/index.ts');
} finally {
	await vite.close();
}

const {
	DEFAULT_REACTION_DIFFUSION_SETUP,
	REACTION_DIFFUSION_ENGINE_VERSION,
	ReactionDiffusionCpuEngine,
	calculateFieldMetrics,
	calculateRadialSpectrum,
	cloneFieldState,
	createInitialField,
	createReactionDiffusionWorkspace,
	stepFieldInto
} = model;

const mineralStops = [
	[6, 17, 19],
	[15, 56, 61],
	[39, 111, 100],
	[111, 151, 117],
	[196, 163, 96],
	[248, 235, 197]
];

function interpolate(stops, value) {
	const bounded = Math.max(0, Math.min(1, value));
	const scaled = bounded * (stops.length - 1);
	const lower = Math.min(stops.length - 1, Math.floor(scaled));
	const upper = Math.min(stops.length - 1, lower + 1);
	const blend = scaled - lower;
	return [0, 1, 2].map((channel) =>
		Math.round(stops[lower][channel] * (1 - blend) + stops[upper][channel] * blend)
	);
}

function fieldPixels(field, mode = 'v') {
	const pixels = new Uint8ClampedArray(field.size * field.size * 4);
	for (let index = 0; index < field.v.length; index += 1) {
		const offset = index * 4;
		if (!field.mask[index]) {
			pixels[offset] = 20;
			pixels[offset + 1] = 22;
			pixels[offset + 2] = 22;
			pixels[offset + 3] = 255;
			continue;
		}
		const raw = mode === 'u' ? 1 - field.u[index] : field.v[index] * 2.85;
		const colour = interpolate(mineralStops, raw);
		pixels[offset] = colour[0];
		pixels[offset + 1] = colour[1];
		pixels[offset + 2] = colour[2];
		pixels[offset + 3] = 255;
	}
	return pixels;
}

async function fieldPng(field, width, height = width, mode = 'v') {
	return sharp(fieldPixels(field, mode), {
		raw: { width: field.size, height: field.size, channels: 4 }
	})
		.resize(width, height, { fit: 'fill', kernel: sharp.kernel.nearest })
		.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 94 })
		.toBuffer();
}

function run(setup, steps) {
	const engine = new ReactionDiffusionCpuEngine(setup);
	engine.step(steps);
	return { field: engine.snapshot(), step: engine.stepIndex, modelTime: engine.modelTime };
}

function runFromField(setup, initial, steps) {
	let current = cloneFieldState(initial);
	let next = cloneFieldState(initial);
	const workspace = createReactionDiffusionWorkspace(initial.size);
	for (let step = 0; step < steps; step += 1) {
		stepFieldInto(current, setup, next, workspace);
		[current, next] = [next, current];
	}
	return current;
}

function continuousPatchState(setup, reactionPatch = true) {
	const field = createInitialField({ ...setup, initialCondition: 'blank-feed' });
	const centre = (field.size - 1) / 2;
	const radius = field.size * 0.105;
	for (let row = 0; row < field.size; row += 1) {
		for (let column = 0; column < field.size; column += 1) {
			const index = row * field.size + column;
			const distance = Math.hypot(row - centre, column - centre);
			const weight = Math.max(0, Math.min(1, (radius - distance) / Math.max(1, radius * 0.28)));
			if (reactionPatch) {
				field.u[index] = 1 - 0.5 * weight;
				field.v[index] = 0.25 * weight;
			} else {
				field.u[index] = 1 - 0.72 * weight;
				field.v[index] = 0;
			}
		}
	}
	return field;
}

function deterministicSpotArray(setup) {
	const field = createInitialField({ ...setup, initialCondition: 'blank-feed' });
	const centres = [0.13, 0.38, 0.63, 0.88];
	const radius = field.size * 0.052;
	for (let row = 0; row < field.size; row += 1) {
		for (let column = 0; column < field.size; column += 1) {
			const index = row * field.size + column;
			const y = (row + 0.5) / field.size;
			const x = (column + 0.5) / field.size;
			let weight = 0;
			for (const centreY of centres) {
				for (const centreX of centres) {
					const distance = Math.hypot((x - centreX) * field.size, (y - centreY) * field.size);
					weight = Math.max(
						weight,
						Math.max(0, Math.min(1, (radius - distance) / Math.max(1, radius * 0.3)))
					);
				}
			}
			if (weight > 0) {
				field.u[index] = 1 - 0.62 * weight;
				field.v[index] = 0.6 * weight;
			}
		}
	}
	return field;
}

const mainSetup = {
	...DEFAULT_REACTION_DIFFUSION_SETUP,
	feed: 0.051,
	kill: 0.0585,
	gridSize: 128,
	domainWidth: 128,
	seed: 'morphospace-common-1',
	initialCondition: 'hand-painted',
	boundary: 'periodic',
	maskPreset: 'open-square',
	integrator: 'heun',
	timestep: 0.5
};

console.log('Evolving deterministic main plate…');
const main = {
	field: runFromField(mainSetup, deterministicSpotArray(mainSetup), 1000),
	step: 1000,
	modelTime: 1000 * mainSetup.timestep
};
const mainMetrics = calculateFieldMetrics(main.field);
const mainSpectrum = calculateRadialSpectrum(main.field.v, main.field.size, mainSetup.domainWidth, {
	mask: main.field.mask,
	window: 'none'
});
const square = await fieldPng(main.field, 1200);
await sharp(square)
	.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true })
	.toFile(fieldPath);

console.log('Calculating deterministic feed–kill inset…');
const atlasCount = 5;
const tileSize = 86;
const tileGap = 4;
const atlasWidth = atlasCount * tileSize + (atlasCount - 1) * tileGap;
const atlasComposites = [];
const atlasMetadata = [];
for (let row = 0; row < atlasCount; row += 1) {
	for (let column = 0; column < atlasCount; column += 1) {
		const feed = 0.024 + (0.054 * column) / (atlasCount - 1);
		const kill = 0.071 - (0.025 * row) / (atlasCount - 1);
		const tileSetup = {
			...mainSetup,
			feed,
			kill,
			gridSize: 32,
			domainWidth: 32,
			seed: 'morphospace-common-1',
			initialCondition: 'central-soft-disk'
		};
		const tile = run(tileSetup, 720);
		const metrics = calculateFieldMetrics(tile.field);
		atlasMetadata.push({
			row,
			column,
			feed,
			kill,
			modelTime: tile.modelTime,
			meanV: metrics.meanV,
			varianceV: metrics.varianceV
		});
		atlasComposites.push({
			input: await fieldPng(tile.field, tileSize),
			left: column * (tileSize + tileGap),
			top: row * (tileSize + tileGap)
		});
	}
}
const atlas = await sharp({
	create: { width: atlasWidth, height: atlasWidth, channels: 4, background: '#0b1213' }
})
	.composite(atlasComposites)
	.png()
	.toBuffer();

const heroWidth = 1600;
const heroHeight = 900;
const heroSvg = Buffer.from(`
<svg width="${heroWidth}" height="${heroHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="987" y="0" width="613" height="900" fill="#e9e1cf"/>
  <path d="M987 0v900" stroke="#d3aa5d" stroke-width="3"/>
  <text x="1050" y="94" fill="#2b403d" font-family="Georgia,serif" font-size="48" font-weight="700">GRAY–SCOTT ATLAS</text>
  <text x="1050" y="142" fill="#53736c" font-family="monospace" font-size="26">A CONTROLLED NUMERICAL MAP</text>
  <text x="1050" y="706" fill="#2b403d" font-family="monospace" font-size="38">FINITE TIME</text>
  <text x="1050" y="756" fill="#2b403d" font-family="monospace" font-size="38">FIXED CLOCK</text>
  <text x="1050" y="822" fill="#6e5940" font-family="Georgia,serif" font-size="34">NOT A UNIVERSAL</text>
  <text x="1050" y="866" fill="#6e5940" font-family="Georgia,serif" font-size="34">PHASE DIAGRAM</text>
</svg>`);

await sharp({
	create: { width: heroWidth, height: heroHeight, channels: 4, background: '#101817' }
})
	.composite([
		{
			input: await sharp(square)
				.resize(987, 987, { kernel: sharp.kernel.nearest })
				.extract({ left: 0, top: 43, width: 987, height: 900 })
				.toBuffer(),
			left: 0,
			top: 0
		},
		{ input: heroSvg, left: 0, top: 0 },
		{ input: atlas, left: 1060, top: 180 }
	])
	.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 94 })
	.toFile(heroPath);

console.log('Rendering six deterministic guided states…');
const guideSize = 64;
const guideBase = {
	...mainSetup,
	gridSize: guideSize,
	domainWidth: guideSize,
	seed: 'guided-observations-1'
};
const blank = createInitialField({ ...guideBase, initialCondition: 'blank-feed' });
const diffusionSetup = {
	...guideBase,
	feed: 0,
	kill: 0,
	diffusionV: 0,
	initialCondition: 'blank-feed'
};
const diffusion = runFromField(diffusionSetup, continuousPatchState(diffusionSetup, false), 260);
const reactionSetup = { ...guideBase, diffusionU: 0, diffusionV: 0 };
const reaction = runFromField(reactionSetup, continuousPatchState(reactionSetup, true), 80);
const coupled = run({ ...guideBase, initialCondition: 'central-soft-disk' }, 720).field;
const nearby = run(
	{ ...guideBase, feed: guideBase.feed + 0.001, initialCondition: 'central-soft-disk' },
	720
).field;
const classified = run(
	{ ...guideBase, feed: 0.051, kill: 0.0585, initialCondition: 'two-spots' },
	720
).field;
const guideFields = [blank, diffusion, reaction, coupled, nearby, classified];
const guideModes = ['v', 'u', 'v', 'v', 'v', 'v'];
const guideLabels = [
	'1 · equilibrium',
	'2 · diffusion only',
	'3 · reaction only',
	'4 · coupled',
	'5 · F + 0.001',
	'6 · classification'
];
const guideProvenance = [
	{
		label: guideLabels[0],
		setup: { ...guideBase, initialCondition: 'blank-feed' },
		step: 0,
		modelTime: 0,
		displayMode: guideModes[0],
		initialParameters: { recipe: 'uniform feed equilibrium U=1, V=0' }
	},
	{
		label: guideLabels[1],
		setup: diffusionSetup,
		step: 260,
		modelTime: 260 * diffusionSetup.timestep,
		displayMode: guideModes[1],
		initialParameters: {
			recipe: 'deterministic continuous central U depression; V=0',
			radiusFraction: 0.105,
			softEdgeFraction: 0.28,
			centreU: 0.28,
			centreV: 0
		}
	},
	{
		label: guideLabels[2],
		setup: reactionSetup,
		step: 80,
		modelTime: 80 * reactionSetup.timestep,
		displayMode: guideModes[2],
		initialParameters: {
			recipe: 'deterministic continuous central reaction patch',
			radiusFraction: 0.105,
			softEdgeFraction: 0.28,
			centreU: 0.5,
			centreV: 0.25
		}
	},
	{
		label: guideLabels[3],
		setup: { ...guideBase, initialCondition: 'central-soft-disk' },
		step: 720,
		modelTime: 720 * guideBase.timestep,
		displayMode: guideModes[3]
	},
	{
		label: guideLabels[4],
		setup: {
			...guideBase,
			feed: guideBase.feed + 0.001,
			initialCondition: 'central-soft-disk'
		},
		step: 720,
		modelTime: 720 * guideBase.timestep,
		displayMode: guideModes[4]
	},
	{
		label: guideLabels[5],
		setup: {
			...guideBase,
			feed: 0.051,
			kill: 0.0585,
			initialCondition: 'two-spots'
		},
		step: 720,
		modelTime: 720 * guideBase.timestep,
		displayMode: guideModes[5]
	}
];
const guideTile = 360;
const labelHeight = 54;
const guideComposites = [];
for (let index = 0; index < guideFields.length; index += 1) {
	const left = (index % 3) * guideTile;
	const top = Math.floor(index / 3) * (guideTile + labelHeight);
	guideComposites.push({
		input: await fieldPng(guideFields[index], guideTile, guideTile, guideModes[index]),
		left,
		top
	});
	guideComposites.push({
		input: Buffer.from(
			`<svg width="${guideTile}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#eee6d6"/><text x="18" y="34" fill="#263b37" font-family="monospace" font-size="18" font-weight="700">${guideLabels[index]}</text></svg>`
		),
		left,
		top: top + guideTile
	});
}
await sharp({
	create: {
		width: guideTile * 3,
		height: (guideTile + labelHeight) * 2,
		channels: 4,
		background: '#eee6d6'
	}
})
	.composite(guideComposites)
	.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 94 })
	.toFile(guidePath);

const metadata = {
	schemaVersion: 1,
	engineVersion: REACTION_DIFFUSION_ENGINE_VERSION,
	generatedBy:
		'scripts/render-reaction-diffusion-atlas.mjs using the repository CPU reference engine',
	model: 'Gray–Scott: du/dt=Du laplacian(u)-uv^2+F(1-u); dv/dt=Dv laplacian(v)+uv^2-(F+k)v',
	integrator: 'fixed-step Heun RK2',
	stencil: 'second-order five-point Laplacian',
	main: {
		file: '/images/reaction-diffusion-atlas-field.png',
		setup: mainSetup,
		step: main.step,
		modelTime: main.modelTime,
		initialParameters: {
			recipe: 'deterministic 4 × 4 soft-spot array',
			centres: [0.13, 0.38, 0.63, 0.88],
			radiusFraction: 0.052,
			centreU: 0.38,
			centreV: 0.6
		},
		metrics: mainMetrics,
		spectrum: {
			trustworthy: mainSpectrum.trustworthy,
			dominantWavelength: mainSpectrum.dominantWavelength,
			prominence: mainSpectrum.prominence,
			reason: mainSpectrum.reason
		}
	},
	hero: { file: '/images/reaction-diffusion-atlas.png', width: heroWidth, height: heroHeight },
	morphospaceInset: atlasMetadata,
	guided: {
		file: '/images/visualizations/reaction-diffusion/guided-observations.png',
		plates: guideProvenance
	}
};
await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

for (const output of [heroPath, fieldPath, guidePath]) {
	const info = await sharp(output).metadata();
	const stats = await fs.stat(output);
	console.log(
		`Wrote ${path.relative(root, output)} (${info.width}×${info.height}, ${Math.round(stats.size / 1024)} KiB).`
	);
}
console.log(`Wrote ${path.relative(root, metadataPath)}.`);
