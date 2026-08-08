import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputDirectory = path.join(
	root,
	'static',
	'images',
	'visualizations',
	'belousov-zhabotinsky',
	'v2'
);
const publicDirectory = '/images/visualizations/belousov-zhabotinsky/v2';
const manifestPath = path.join(root, 'static', 'data', 'bz-v2-calibration.json');
const indexFilename = 'bz-v2-checkpoint-posters.json';
const indexPath = path.join(outputDirectory, indexFilename);
const generatedBy = 'scripts/render-bz-v2-checkpoint-posters.mjs';
const generationCommand = 'node scripts/render-bz-v2-checkpoint-posters.mjs';
const checkOnly = process.argv.includes('--check');
const helpOnly = process.argv.includes('--help') || process.argv.includes('-h');
const allowedArguments = new Set(['--check', '--help', '-h']);
const unknownArguments = process.argv
	.slice(2)
	.filter((argument) => !allowedArguments.has(argument));

if (unknownArguments.length > 0) {
	throw new RangeError(`Unknown arguments: ${unknownArguments.join(', ')}`);
}

const HERO_IDS = Object.freeze([
	'classic-target-rings',
	'persistent-single-spiral',
	'spiral-garden'
]);
const SIZE = 1200;
const INDEX_KIND = 'bz-v2-checkpoint-posters';
const METADATA_KIND = 'bz-v2-checkpoint-poster-metadata';

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
	return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function exactKeys(value, expected, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object.`);
	}
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
		throw new Error(`${label} does not match its versioned contract.`);
	}
}

function assertSha256(value, label) {
	if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
		throw new TypeError(`${label} must be a lowercase SHA-256 digest.`);
	}
}

function pngDimensions(bytes, label) {
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
		throw new TypeError(`${label} is not a PNG.`);
	}
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function publicPath(filename) {
	return `${publicDirectory}/${filename}`;
}

function diskPathFromPublic(publicFile) {
	if (typeof publicFile !== 'string' || !publicFile.startsWith('/') || publicFile.includes('..')) {
		throw new RangeError('Public paths must be absolute and traversal-free.');
	}
	return path.join(root, 'static', ...publicFile.slice(1).split('/'));
}

function posterContract(preset) {
	const checkpoint = preset.optionalCheckpoint;
	if (!checkpoint) throw new Error(`${preset.id} has no checkpoint descriptor.`);
	return {
		id: `bz-v2-${preset.id}-checkpoint-poster`,
		filename: `${preset.id}-checkpoint-poster.png`,
		metadataFilename: `${preset.id}-checkpoint-poster.metadata.json`,
		presetId: preset.id,
		checkpointId: checkpoint.id,
		modelStep: checkpoint.modelStep,
		modelTime: checkpoint.modelTime,
		stateGrid: preset.setup.gridSize,
		displayProfileId: preset.displayProfileId,
		view: 'luminous-composite'
	};
}

async function readManifest() {
	const source = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
	if (!Array.isArray(source.presets) || !Array.isArray(source.displayProfiles)) {
		throw new TypeError('The V2 manifest lacks presets or display profiles.');
	}
	const presets = HERO_IDS.map((id) => source.presets.find((entry) => entry.id === id));
	if (presets.some((entry) => !entry)) throw new Error('The V2 manifest lacks a hero preset.');
	return { source, presets };
}

async function loadRuntime() {
	const [{ default: sharp }, { createServer }] = await Promise.all([
		import('sharp'),
		import('vite')
	]);
	const vite = await createServer({
		root,
		appType: 'custom',
		server: { middlewareMode: true },
		logLevel: 'error'
	});
	try {
		const bz = await vite.ssrLoadModule('/src/lib/visualizations/bz/index.ts');
		return { sharp, bz };
	} finally {
		await vite.close();
	}
}

async function pngFromPixels(sharp, pixels) {
	return sharp(Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength), {
		raw: { width: pixels.width, height: pixels.height, channels: 4 }
	})
		.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
		.toBuffer();
}

async function generate() {
	const { source: manifest, presets } = await readManifest();
	const { sharp, bz } = await loadRuntime();
	const generatedAt = new Date().toISOString();
	const indexAssets = [];
	await fs.mkdir(outputDirectory, { recursive: true });

	for (const preset of presets) {
		const contract = posterContract(preset);
		const descriptor = preset.optionalCheckpoint;
		const profile = manifest.displayProfiles.find(
			(entry) => entry.id === contract.displayProfileId
		);
		if (!profile) throw new Error(`${preset.id} display profile is missing.`);
		const checkpointBytes = new Uint8Array(await fs.readFile(diskPathFromPublic(descriptor.path)));
		const decoded = await bz.decodeBZCheckpointV1(checkpointBytes, {
			checkpointId: descriptor.id,
			sourcePresetId: preset.id,
			setup: preset.setup,
			interventions: preset.initialInterventions,
			engineVersion: manifest.engineVersion,
			validationRecordId: preset.calibrationRecordId,
			cpuFloat64StateSha256: descriptor.fieldSha256F64Reference ?? undefined,
			fileSha256: descriptor.sha256
		});
		const state = bz.checkpointStateToBZFieldState(decoded.state);
		const before = await bz.checksumBZFloat64State(state);
		const pixels = bz.renderBZPublicationPixelBufferV2(state, preset.setup, {
			profile,
			view: contract.view,
			width: SIZE,
			height: SIZE,
			rangeMode: 'fixed',
			interpolation: 'mask-aware-bilinear',
			bloom: true,
			glass: true
		});
		const after = await bz.checksumBZFloat64State(state);
		if (before !== after) throw new Error(`${preset.id} poster rendering changed its state.`);
		const png = await pngFromPixels(sharp, pixels);
		const dimensions = pngDimensions(png, contract.id);
		if (dimensions.width !== SIZE || dimensions.height !== SIZE) {
			throw new Error(`${contract.id} rendered at an unexpected size.`);
		}
		const pngSha256 = sha256(png);
		const metadata = {
			schemaVersion: 1,
			kind: METADATA_KIND,
			generatedAt,
			generatedBy,
			generationCommand,
			engineVersion: manifest.engineVersion,
			displayVersion: manifest.displayVersion,
			asset: {
				id: contract.id,
				path: publicPath(contract.filename),
				metadataPath: publicPath(contract.metadataFilename),
				width: SIZE,
				height: SIZE,
				format: 'png',
				sha256: pngSha256
			},
			source: {
				presetId: preset.id,
				checkpointId: descriptor.id,
				checkpointPath: descriptor.path,
				checkpointSha256: descriptor.sha256,
				modelStep: descriptor.modelStep,
				modelTime: descriptor.modelTime,
				stateGrid: preset.setup.gridSize,
				setup: preset.setup,
				interventions: preset.initialInterventions,
				storedFloat32StateSha256: decoded.metadata.checksums.browserFloat32State,
				cpuFloat64ReferenceSha256: decoded.metadata.checksums.cpuFloat64State,
				renderStateSha256Before: before,
				renderStateSha256After: after
			},
			display: {
				view: contract.view,
				profileId: profile.id,
				profile,
				disclosure:
					'Exact authenticated 256² mature checkpoint rendered through the fixed V2 publication profile. Colour, bloom and glass are display only.'
			}
		};
		const metadataBytes = jsonBytes(metadata);
		await Promise.all([
			fs.writeFile(path.join(outputDirectory, contract.filename), png),
			fs.writeFile(path.join(outputDirectory, contract.metadataFilename), metadataBytes)
		]);
		indexAssets.push({
			id: contract.id,
			path: publicPath(contract.filename),
			metadataPath: publicPath(contract.metadataFilename),
			width: SIZE,
			height: SIZE,
			stateGrid: contract.stateGrid,
			presetId: contract.presetId,
			checkpointId: contract.checkpointId,
			modelStep: contract.modelStep,
			modelTime: contract.modelTime,
			view: contract.view,
			displayProfileId: contract.displayProfileId,
			sha256: pngSha256,
			metadataSha256: sha256(metadataBytes)
		});
		console.log(
			`wrote ${path.relative(root, path.join(outputDirectory, contract.filename))} · ${SIZE}×${SIZE} · checkpoint ${descriptor.id}`
		);
	}

	const index = {
		schemaVersion: 1,
		kind: INDEX_KIND,
		generatedAt,
		generatedBy,
		generationCommand,
		engineVersion: manifest.engineVersion,
		displayVersion: manifest.displayVersion,
		assetDirectory: publicDirectory,
		assets: indexAssets
	};
	await fs.writeFile(indexPath, jsonBytes(index));
	console.log(`wrote ${path.relative(root, indexPath)} · ${indexAssets.length} checkpoint posters`);
}

async function check() {
	const { source: manifest, presets } = await readManifest();
	const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
	exactKeys(
		index,
		[
			'schemaVersion',
			'kind',
			'generatedAt',
			'generatedBy',
			'generationCommand',
			'engineVersion',
			'displayVersion',
			'assetDirectory',
			'assets'
		],
		'Checkpoint poster index'
	);
	if (
		index.schemaVersion !== 1 ||
		index.kind !== INDEX_KIND ||
		index.engineVersion !== manifest.engineVersion ||
		index.displayVersion !== manifest.displayVersion ||
		!Array.isArray(index.assets)
	) {
		throw new Error('Checkpoint poster index header is invalid.');
	}
	const expectedIds = presets.map((preset) => posterContract(preset).id).sort();
	const actualIds = index.assets.map((asset) => asset.id).sort();
	if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
		throw new Error('Checkpoint poster asset ids differ from the three hero contracts.');
	}
	for (const preset of presets) {
		const contract = posterContract(preset);
		const asset = index.assets.find((entry) => entry.id === contract.id);
		const png = await fs.readFile(diskPathFromPublic(asset.path));
		const metadataBytes = await fs.readFile(diskPathFromPublic(asset.metadataPath));
		const metadata = JSON.parse(metadataBytes.toString('utf8'));
		assertSha256(asset.sha256, `${asset.id} PNG checksum`);
		assertSha256(asset.metadataSha256, `${asset.id} metadata checksum`);
		assertSha256(
			metadata.source.storedFloat32StateSha256,
			`${asset.id} stored Float32 state checksum`
		);
		if (sha256(png) !== asset.sha256 || sha256(metadataBytes) !== asset.metadataSha256) {
			throw new Error(`${asset.id} committed bytes differ from the index.`);
		}
		const dimensions = pngDimensions(png, asset.id);
		if (
			dimensions.width !== SIZE ||
			dimensions.height !== SIZE ||
			asset.width !== SIZE ||
			asset.height !== SIZE ||
			asset.stateGrid !== preset.setup.gridSize ||
			asset.presetId !== preset.id ||
			asset.checkpointId !== preset.optionalCheckpoint.id ||
			asset.modelStep !== preset.optionalCheckpoint.modelStep ||
			asset.modelTime !== preset.optionalCheckpoint.modelTime ||
			asset.displayProfileId !== preset.displayProfileId ||
			asset.view !== 'luminous-composite' ||
			metadata.kind !== METADATA_KIND ||
			metadata.asset.sha256 !== asset.sha256 ||
			metadata.source.checkpointId !== asset.checkpointId ||
			metadata.source.checkpointSha256 !== preset.optionalCheckpoint.sha256 ||
			metadata.source.renderStateSha256Before !== metadata.source.renderStateSha256After
		) {
			throw new Error(`${asset.id} metadata differs from the exact checkpoint contract.`);
		}
	}
	console.log('BZ V2 checkpoint posters are current (3 authenticated 256² assets).');
}

function help() {
	console.log(
		'Usage: node scripts/render-bz-v2-checkpoint-posters.mjs [--check]\n\n' +
			'Without arguments, renders three square Gallery posters from authenticated 256² checkpoint bytes.\n' +
			'--check verifies PNG, metadata, index, profile, and checkpoint bindings without rendering.'
	);
}

if (helpOnly) help();
else if (checkOnly) await check();
else await generate();
