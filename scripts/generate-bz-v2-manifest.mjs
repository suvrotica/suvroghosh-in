import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { validateBZV2PerformanceEvidence } from './lib/bz-v2-performance-evidence.mjs';

const root = process.cwd();
const outputPath = path.join(root, 'static', 'data', 'bz-v2-calibration.json');
const assetIndexPath = path.join(
	root,
	'static',
	'images',
	'visualizations',
	'belousov-zhabotinsky',
	'v2',
	'bz-v2-assets.json'
);
const checkpointPosterIndexPath = path.join(
	root,
	'static',
	'images',
	'visualizations',
	'belousov-zhabotinsky',
	'v2',
	'bz-v2-checkpoint-posters.json'
);
const checkpointPosterIndexPublicPath =
	'/images/visualizations/belousov-zhabotinsky/v2/bz-v2-checkpoint-posters.json';
const parityEvidencePath = path.join(root, 'static', 'data', 'bz-v2', 'gpu-parity.json');
const parityPublicPath = '/data/bz-v2/gpu-parity.json';
const performanceEvidencePath = path.join(root, 'static', 'data', 'bz-v2', 'performance.json');
const performancePublicPath = '/data/bz-v2/performance.json';
const checkOnly = process.argv.includes('--check');
const candidateOnly = process.argv.includes('--candidate');
const helpOnly = process.argv.includes('--help') || process.argv.includes('-h');
const allowedArguments = new Set(['--check', '--candidate', '--help', '-h']);
const unknownArguments = process.argv
	.slice(2)
	.filter((argument) => !allowedArguments.has(argument));

if (unknownArguments.length > 0) {
	throw new RangeError(
		`Unknown argument${unknownArguments.length === 1 ? '' : 's'}: ${unknownArguments.join(', ')}`
	);
}

const SCHEMA_VERSION = 2;
const CHECKPOINT_VERSION = 1;
const ENGINE_VERSION = 'bz-heun-five-point-v2';
const DISPLAY_VERSION = 'bz-display-linear-light-v2';
const CHECKPOINT_MAGIC = Buffer.from([0x42, 0x5a, 0x43, 0x50, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHECKPOINT_HEADER_BYTES = 32;
const CHECKPOINT_TRAILER_BYTES = 32;
const CHECKPOINT_ENDIAN_MARKER = 0x01020304;
const HEX_SHA256 = /^[0-9a-f]{64}$/u;
const LUMINOUS_PROFILE_ID = 'oregonator-luminous-publication-v2';
const CHECKPOINT_POSTER_SIZE = 1200;
const CHECKPOINT_POSTER_DIRECTORY = '/images/visualizations/belousov-zhabotinsky/v2';
const REQUIRED_ASSET_IDS = Object.freeze([
	'bz-v2-hero-poster',
	'bz-v2-visualization-card',
	'bz-v2-classic-target-rings-plate',
	'bz-v2-persistent-single-spiral-plate',
	'bz-v2-spiral-garden-plate',
	'bz-v2-raw-u-vs-luminous-plate',
	'bz-v2-bz-versus-turing-plate',
	'bz-v2-open-graph'
]);
const REQUIRED_CHECKPOINT_POSTER_IDS = Object.freeze([
	'bz-v2-classic-target-rings-checkpoint-poster',
	'bz-v2-persistent-single-spiral-checkpoint-poster',
	'bz-v2-spiral-garden-checkpoint-poster'
]);
const REQUIRED_NUMERICAL_PARITY_CASE_IDS = Object.freeze([
	'declared-intervention-schedule-64',
	'mature-checkpoint-upload',
	'mature-checkpoint-continuation'
]);
const REQUIRED_DISPLAY_PARITY_CASE_IDS = Object.freeze([
	'scientific-u',
	'luminous-publication',
	'ferroin-representative',
	'phase-spectrum'
]);

const heroInputs = Object.freeze([
	Object.freeze({
		id: 'classic-target-rings',
		title: 'Classic Target Rings',
		searchFile: 'target-grid256.json',
		checkpointId: 'classic-target-rings-256-v2',
		sourceSemantics: 'declared-periodic-external-source',
		convergence: Object.freeze([
			Object.freeze({
				comparison: '256² versus 128²',
				candidateFile: 'target-grid256.json',
				referenceFile: 'target-grid128.json',
				observable: 'meanWaveSpeed',
				tolerance: 0.05
			}),
			Object.freeze({
				comparison: 'Δt 0.0005 versus 0.00025 at 128²',
				candidateFile: 'target-grid128.json',
				referenceFile: 'target-dt-half.json',
				observable: 'meanWaveSpeed',
				tolerance: 0.05
			})
		])
	}),
	Object.freeze({
		id: 'persistent-single-spiral',
		title: 'Persistent Single Spiral',
		searchFile: 'spiral-grid256.json',
		checkpointId: 'persistent-single-spiral-256-v2',
		sourceSemantics: 'finite-initial-perturbation',
		convergence: Object.freeze([
			Object.freeze({
				comparison: '256² versus 128²',
				candidateFile: 'spiral-grid256.json',
				referenceFile: 'spiral-grid128.json',
				observable: 'rotationPeriodMean',
				tolerance: 0.02
			}),
			Object.freeze({
				comparison: '256² Δt 0.0005 versus 96² Δt 0.00025 refinement',
				candidateFile: 'spiral-grid256.json',
				referenceFile: 'spiral-dt-half.json',
				observable: 'rotationPeriodMean',
				tolerance: 0.05
			})
		])
	}),
	Object.freeze({
		id: 'spiral-garden',
		title: 'Spiral Garden',
		searchFile: 'garden-grid256.json',
		checkpointId: 'spiral-garden-256-v2',
		sourceSemantics: 'finite-initial-perturbation',
		convergence: Object.freeze([
			Object.freeze({
				comparison: '256² versus 96²',
				candidateFile: 'garden-grid256.json',
				referenceFile: 'garden-grid96.json',
				observable: 'minimumMeasuredRotations',
				tolerance: 0.05
			}),
			Object.freeze({
				comparison: '256² Δt 0.0005 versus 64² Δt 0.00025 refinement',
				candidateFile: 'garden-grid256.json',
				referenceFile: 'garden-dt-half.json',
				observable: 'minimumMeasuredRotations',
				tolerance: 0.05
			})
		])
	})
]);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertRecord(value, label) {
	assert(
		value !== null && typeof value === 'object' && !Array.isArray(value),
		`${label} must be an object.`
	);
	return value;
}

function assertArray(value, label) {
	assert(Array.isArray(value), `${label} must be an array.`);
	return value;
}

function assertExactKeys(value, expected, label) {
	const actual = Object.keys(value).sort();
	const keys = [...expected].sort();
	assert(
		actual.length === keys.length && actual.every((key, index) => key === keys[index]),
		`${label} keys differ from the versioned contract.`
	);
}

function assertFinite(value, label) {
	assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite.`);
	return value;
}

function assertNonNegative(value, label) {
	const result = assertFinite(value, label);
	assert(result >= 0, `${label} must be non-negative.`);
	return result;
}

function assertSafeInteger(value, label, minimum = 0) {
	assert(
		Number.isSafeInteger(value) && value >= minimum,
		`${label} must be a safe integer >= ${minimum}.`
	);
	return value;
}

function assertSha256(value, label) {
	assert(
		typeof value === 'string' && HEX_SHA256.test(value),
		`${label} must be a lowercase SHA-256 digest.`
	);
	return value;
}

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonicalize(value[key])])
		);
	}
	return value;
}

function canonicalJSONStringify(value) {
	return JSON.stringify(canonicalize(value));
}

function sameDocument(left, right) {
	return canonicalJSONStringify(left) === canonicalJSONStringify(right);
}

function canonicalDocumentSha256(value) {
	return sha256(Buffer.from(canonicalJSONStringify(value), 'utf8'));
}

function jsonBytes(value) {
	return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relativeDifference(candidate, reference) {
	return Math.abs(candidate - reference) / Math.max(Math.abs(reference), 1e-12);
}

function nearlyEqual(left, right) {
	return Math.abs(left - right) <= 1e-15 || relativeDifference(left, right) <= 1e-12;
}

function publicToLocal(publicPath) {
	assert(
		typeof publicPath === 'string' && publicPath.startsWith('/') && !publicPath.includes('..'),
		`Unsafe public path ${publicPath}.`
	);
	return path.join(root, 'static', ...publicPath.slice(1).split('/'));
}

async function readRequired(filePath, label) {
	try {
		return await fs.readFile(filePath);
	} catch (error) {
		if (error?.code === 'ENOENT')
			throw new Error(`${label} is missing at ${path.relative(root, filePath)}.`, {
				cause: error
			});
		throw error;
	}
}

async function readJsonDocument(filePath, label) {
	const bytes = await readRequired(filePath, label);
	let value;
	try {
		value = JSON.parse(bytes.toString('utf8'));
	} catch (error) {
		throw new Error(`${label} is not valid JSON.`, { cause: error });
	}
	return { bytes, sha256: sha256(bytes), value: assertRecord(value, label) };
}

async function readOptionalJsonDocument(filePath, label) {
	try {
		return await readJsonDocument(filePath, label);
	} catch (error) {
		if (error?.cause?.code === 'ENOENT') return null;
		throw error;
	}
}

function searchPath(filename) {
	return path.join(root, 'artifacts', 'bz-v2-search', filename);
}

function exactSearchResult(document, filename, expectedHero) {
	const source = document.value;
	assert(source.schemaVersion === SCHEMA_VERSION, `${filename} has the wrong schema version.`);
	assert(source.grid === 256, `${filename} is not the final 256² result.`);
	assert(
		source.stage === 'publication-refinement',
		`${filename} is not a publication-refinement result.`
	);
	const results = assertArray(source.results, `${filename} results`);
	assert(results.length === 1, `${filename} must contain exactly one final result.`);
	const result = assertRecord(results[0], `${filename} result`);
	assert(
		result.hero === expectedHero,
		`${filename} belongs to ${result.hero}, not ${expectedHero}.`
	);
	assert(result.setup?.gridSize === 256, `${filename} result setup is not 256².`);
	assert(result.finite === true, `${filename} final state is not finite.`);
	assert(typeof result.pass === 'boolean', `${filename} is missing its objective pass result.`);
	const descriptors = assertArray(
		source.checkpointDescriptors,
		`${filename} checkpoint descriptors`
	);
	assert(descriptors.length === 1, `${filename} must contain exactly one checkpoint descriptor.`);
	return { source, result, descriptor: assertRecord(descriptors[0], `${filename} checkpoint`) };
}

function refinementResult(document, filename, expectedHero) {
	const source = document.value;
	assert(source.schemaVersion === SCHEMA_VERSION, `${filename} has the wrong schema version.`);
	const results = assertArray(source.results, `${filename} results`);
	assert(results.length === 1, `${filename} must contain exactly one result.`);
	const result = assertRecord(results[0], `${filename} result`);
	assert(result.hero === expectedHero, `${filename} belongs to the wrong regime.`);
	assert(
		result.finite === true && result.pass === true,
		`${filename} did not pass its declared objective.`
	);
	return result;
}

async function verifyCheckpoint(descriptor) {
	assert(
		descriptor.version === CHECKPOINT_VERSION,
		`${descriptor.id} has an unsupported checkpoint version.`
	);
	assert(descriptor.encoding === 'bzcp-f32le-v1', `${descriptor.id} has an unsupported encoding.`);
	assert(
		descriptor.losslessForStoredRepresentation === true,
		`${descriptor.id} is not lossless for its stored representation.`
	);
	assert(
		descriptor.engineVersion === ENGINE_VERSION,
		`${descriptor.id} has the wrong engine version.`
	);
	assertSha256(descriptor.sha256, `${descriptor.id} trailer checksum`);
	assertSha256(descriptor.fieldSha256F64Reference, `${descriptor.id} Float64 checksum`);
	assertSha256(descriptor.browserStateSha256, `${descriptor.id} browser checksum`);
	assertSha256(descriptor.setupChecksum, `${descriptor.id} setup checksum`);
	assertSha256(descriptor.interventionLogChecksum, `${descriptor.id} intervention checksum`);
	const filePath = publicToLocal(descriptor.path);
	const bytes = await readRequired(filePath, `Checkpoint ${descriptor.id}`);
	assert(
		bytes.length === descriptor.byteLength,
		`${descriptor.id} byte length differs from its descriptor.`
	);
	assert(
		bytes.length >= CHECKPOINT_HEADER_BYTES + CHECKPOINT_TRAILER_BYTES,
		`${descriptor.id} is truncated.`
	);
	assert(
		bytes.subarray(0, 8).equals(CHECKPOINT_MAGIC),
		`${descriptor.id} has the wrong magic bytes.`
	);
	assert(bytes.readUInt16LE(8) === CHECKPOINT_VERSION, `${descriptor.id} header version differs.`);
	assert(
		bytes.readUInt16LE(10) === CHECKPOINT_HEADER_BYTES,
		`${descriptor.id} header size differs.`
	);
	assert(
		bytes.readUInt32LE(12) === CHECKPOINT_ENDIAN_MARKER,
		`${descriptor.id} endian marker differs.`
	);
	const metadataLength = bytes.readUInt32LE(16);
	const payloadLength = bytes.readUInt32LE(20);
	const width = bytes.readUInt32LE(24);
	const height = bytes.readUInt32LE(28);
	assert(
		width === descriptor.width && height === descriptor.height,
		`${descriptor.id} dimensions differ.`
	);
	const trailerOffset = CHECKPOINT_HEADER_BYTES + metadataLength + payloadLength;
	assert(
		trailerOffset + CHECKPOINT_TRAILER_BYTES === bytes.length,
		`${descriptor.id} section lengths differ.`
	);
	const digest = crypto.createHash('sha256').update(bytes.subarray(0, trailerOffset)).digest();
	assert(
		digest.equals(bytes.subarray(trailerOffset)),
		`${descriptor.id} trailer does not authenticate the file.`
	);
	assert(
		digest.toString('hex') === descriptor.sha256,
		`${descriptor.id} authenticated checksum differs.`
	);
	const metadataBytes = bytes.subarray(
		CHECKPOINT_HEADER_BYTES,
		CHECKPOINT_HEADER_BYTES + metadataLength
	);
	const metadata = assertRecord(
		JSON.parse(metadataBytes.toString('utf8')),
		`${descriptor.id} metadata`
	);
	const payload = bytes.subarray(CHECKPOINT_HEADER_BYTES + metadataLength, trailerOffset);
	assert(metadata.checkpointId === descriptor.id, `${descriptor.id} metadata identity differs.`);
	assert(
		metadata.sourcePresetId === descriptor.sourcePresetId,
		`${descriptor.id} source preset differs.`
	);
	assert(metadata.warmupStep === descriptor.modelStep, `${descriptor.id} model step differs.`);
	assert(metadata.modelTime === descriptor.modelTime, `${descriptor.id} model time differs.`);
	assert(
		sameDocument(metadata.setup, descriptor.setup),
		`${descriptor.id} setup metadata differs.`
	);
	assert(
		sameDocument(metadata.interventions, descriptor.interventions),
		`${descriptor.id} intervention metadata differs.`
	);
	assert(
		metadata.checksums?.cpuFloat64State === descriptor.fieldSha256F64Reference,
		`${descriptor.id} Float64 checksum differs.`
	);
	assert(
		metadata.checksums?.browserFloat32State === descriptor.browserStateSha256,
		`${descriptor.id} browser checksum differs.`
	);
	assert(
		metadata.checksums?.setupCanonicalJson === descriptor.setupChecksum,
		`${descriptor.id} setup checksum differs.`
	);
	assert(
		metadata.checksums?.interventionLogCanonicalJson === descriptor.interventionLogChecksum,
		`${descriptor.id} intervention checksum differs.`
	);
	assert(
		sha256(payload) === descriptor.browserStateSha256,
		`${descriptor.id} payload checksum differs.`
	);
	assert(
		canonicalDocumentSha256(descriptor.setup) === descriptor.setupChecksum,
		`${descriptor.id} canonical setup checksum differs.`
	);
	assert(
		canonicalDocumentSha256(descriptor.interventions) === descriptor.interventionLogChecksum,
		`${descriptor.id} canonical intervention checksum differs.`
	);
	return { metadata, binaryWholeFileSha256: sha256(bytes) };
}

function readPngDimensions(bytes, label) {
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	assert(bytes.length >= 24 && bytes.subarray(0, 8).equals(signature), `${label} is not a PNG.`);
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function normalizedPresentationSetup(setup) {
	const result = JSON.parse(JSON.stringify(setup));
	delete result.gridSize;
	return result;
}

function validateDisplayProfile(profile, label) {
	assert(
		typeof profile.id === 'string' && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(profile.id),
		`${label} id is invalid.`
	);
	assert(
		typeof profile.title === 'string' && profile.title.length > 0,
		`${label} title is missing.`
	);
	assert(profile.version === DISPLAY_VERSION, `${label} display version differs.`);
	assert(
		['luminous-composite', 'ferroin-proxy', 'phase-spectrum', 'scientific'].includes(profile.style),
		`${label} style is unsupported.`
	);
	assert(
		['ferroin', 'cerium', 'phase-spectrum', 'scientific', 'high-contrast'].includes(
			profile.palette
		),
		`${label} palette is unsupported.`
	);
	assert(
		[
			'dish',
			'u',
			'v',
			'reaction-u',
			'diffusion-u',
			'net-u',
			'mask',
			'difference-from-mean',
			'ferroin-proxy',
			'luminous-composite',
			'phase',
			'front',
			'refractory'
		].includes(profile.defaultView),
		`${label} default view is unsupported.`
	);
	assert(profile.rangeMode === 'fixed', `${label} must use fixed calibrated ranges.`);
	const ranges = assertRecord(profile.ranges, `${label} ranges`);
	assert(Object.keys(ranges).length > 0, `${label} has no calibrated ranges.`);
	for (const [name, rawRange] of Object.entries(ranges)) {
		const range = assertRecord(rawRange, `${label} ${name} range`);
		const minimum = assertFinite(range.minimum, `${label} ${name} minimum`);
		const maximum = assertFinite(range.maximum, `${label} ${name} maximum`);
		assert(maximum > minimum, `${label} ${name} range must increase.`);
		assert(
			['dimensionless', 'dimensionless-rate', 'radians'].includes(range.units),
			`${label} ${name} range units are unsupported.`
		);
	}
	const phase = assertRecord(profile.phase, `${label} phase coordinate`);
	assertFinite(phase.centreU, `${label} phase centre U`);
	assertFinite(phase.centreV, `${label} phase centre V`);
	assert(
		assertFinite(phase.scaleU, `${label} phase scale U`) > 0,
		`${label} phase scale U must be positive.`
	);
	assert(
		assertFinite(phase.scaleV, `${label} phase scale V`) > 0,
		`${label} phase scale V must be positive.`
	);
	for (const name of ['exposure', 'saturation', 'frontScale', 'contrast', 'gamma']) {
		assert(
			assertFinite(profile[name], `${label} ${name}`) > 0,
			`${label} ${name} must be positive.`
		);
	}
	for (const name of ['bloom', 'highlight', 'bloomRadius']) {
		assertNonNegative(profile[name], `${label} ${name}`);
	}
	const bloomThreshold = assertNonNegative(profile.bloomThreshold, `${label} bloomThreshold`);
	assert(bloomThreshold <= 1, `${label} bloomThreshold must lie from zero to one.`);
	for (const [name, keys] of [
		['ferroinMix', ['recoveryWeight', 'activatorLuminanceWeight', 'gradientHighlightWeight']],
		['luminousMix', ['phaseWeight', 'recoveryWeight', 'frontWeight']]
	]) {
		const mix = assertRecord(profile[name], `${label} ${name}`);
		assert(
			Object.keys(mix).sort().join('\0') === [...keys].sort().join('\0'),
			`${label} ${name} keys differ from the display contract.`
		);
		for (const key of keys) assertNonNegative(mix[key], `${label} ${name} ${key}`);
	}
	assert(
		profile.interpolation === 'mask-aware-manual-bilinear' &&
			profile.toneMap === 'aces-fitted' &&
			profile.outputTransfer === 'srgb',
		`${label} rendering transfer contract differs.`
	);
	assert(
		typeof profile.disclosure === 'string' && profile.disclosure.length > 0,
		`${label} disclosure is missing.`
	);
	return profile;
}

async function loadAssetEvidence() {
	const indexDocument = await readJsonDocument(assetIndexPath, 'BZ V2 asset index');
	const index = indexDocument.value;
	assert(
		index.schemaVersion === 1 && index.kind === 'bz-v2-publication-assets',
		'BZ V2 asset index identity differs.'
	);
	assert(
		index.engineVersion === ENGINE_VERSION && index.displayVersion === DISPLAY_VERSION,
		'BZ V2 asset index engine/display versions differ.'
	);
	assert(
		index.stateGrid === 512,
		'BZ V2 publication assets must use the declared 512² state grid.'
	);
	assert(
		typeof index.generatedAt === 'string' && Number.isFinite(Date.parse(index.generatedAt)),
		'BZ V2 asset generation time is invalid.'
	);
	const regimes = new Map();
	for (const source of assertArray(index.regimes, 'BZ V2 asset regimes')) {
		assertRecord(source, 'BZ V2 asset regime');
		assert(!regimes.has(source.id), `BZ V2 asset regime ${source.id} is duplicated.`);
		assertSha256(source.initialStateSha256, `${source.id} initial state checksum`);
		assertSha256(source.stateSha256, `${source.id} state checksum`);
		const stateAfterRendering =
			source.stateSha256AfterRendering ?? source.stateSha256AfterDisplay ?? source.stateSha256After;
		if (stateAfterRendering !== undefined) {
			assertSha256(stateAfterRendering, `${source.id} post-render state checksum`);
		}
		assertSha256(source.setupSha256, `${source.id} setup checksum`);
		assertSha256(source.interventionLogSha256, `${source.id} intervention checksum`);
		assert(
			canonicalDocumentSha256(source.setup) === source.setupSha256,
			`${source.id} asset setup checksum differs.`
		);
		assert(
			canonicalDocumentSha256(source.interventions) === source.interventionLogSha256,
			`${source.id} asset intervention checksum differs.`
		);
		regimes.set(source.id, source);
	}
	for (const regimeId of [
		...heroInputs.map((input) => input.id),
		'schnakenberg-turing-comparator'
	]) {
		assert(regimes.has(regimeId), `Required BZ V2 asset regime ${regimeId} is missing.`);
	}
	const profiles = new Map();
	const verifiedAssets = [];
	const indexedAssetIds = new Set();
	for (const indexedAsset of assertArray(index.assets, 'BZ V2 assets')) {
		assertRecord(indexedAsset, 'BZ V2 indexed asset');
		assert(!indexedAssetIds.has(indexedAsset.id), `BZ V2 asset ${indexedAsset.id} is duplicated.`);
		indexedAssetIds.add(indexedAsset.id);
		const pngPath = publicToLocal(indexedAsset.path);
		const metadataPath = publicToLocal(indexedAsset.metadataPath);
		const [pngBytes, metadataDocument] = await Promise.all([
			readRequired(pngPath, `Asset ${indexedAsset.id}`),
			readJsonDocument(metadataPath, `Asset metadata ${indexedAsset.id}`)
		]);
		assert(sha256(pngBytes) === indexedAsset.sha256, `${indexedAsset.id} PNG checksum differs.`);
		assert(
			metadataDocument.sha256 === indexedAsset.metadataSha256,
			`${indexedAsset.id} metadata checksum differs.`
		);
		const dimensions = readPngDimensions(pngBytes, indexedAsset.id);
		assert(
			dimensions.width === indexedAsset.width && dimensions.height === indexedAsset.height,
			`${indexedAsset.id} dimensions differ.`
		);
		const metadata = metadataDocument.value;
		assert(
			metadata.schemaVersion === 1 && metadata.kind === 'bz-v2-publication-asset-metadata',
			`${indexedAsset.id} metadata identity differs.`
		);
		assert(
			metadata.engineVersion === ENGINE_VERSION && metadata.displayVersion === DISPLAY_VERSION,
			`${indexedAsset.id} metadata engine/display versions differ.`
		);
		assert(
			sameDocument(metadata.asset, {
				id: indexedAsset.id,
				path: indexedAsset.path,
				metadataPath: indexedAsset.metadataPath,
				width: indexedAsset.width,
				height: indexedAsset.height,
				format: indexedAsset.format,
				sha256: indexedAsset.sha256
			}),
			`${indexedAsset.id} indexed and adjacent asset metadata differ.`
		);
		const metadataSources = assertArray(metadata.sources, `${indexedAsset.id} sources`);
		for (const source of metadataSources) {
			assertRecord(source, `${indexedAsset.id} source`);
			const indexedRegime = regimes.get(source.presetId);
			assert(indexedRegime, `${indexedAsset.id} references unknown regime ${source.presetId}.`);
			assert(
				sameDocument(indexedRegime, {
					id: source.presetId,
					title: source.presetTitle,
					setup: source.setup,
					interventions: source.interventions,
					modelStep: source.modelStep,
					modelTime: source.modelTime,
					initialStateSha256: source.initialStateSha256,
					stateSha256: source.stateSha256,
					stateSha256AfterRendering: source.stateSha256AfterRendering,
					setupSha256: source.setupSha256,
					interventionLogSha256: source.interventionLogSha256,
					preparationDisclosure: source.preparationDisclosure
				}),
				`${indexedAsset.id} adjacent source ${source.presetId} differs from the asset index.`
			);
		}
		const metadataDisplays = assertArray(metadata.displays, `${indexedAsset.id} displays`);
		assert(
			sameDocument(indexedAsset.presetIds, [
				...new Set(metadataSources.map((source) => source.presetId))
			]) &&
				sameDocument(
					indexedAsset.views,
					metadataDisplays.map((display) => display.view)
				) &&
				sameDocument(indexedAsset.displayProfileIds, [
					...new Set(metadataDisplays.map((display) => display.profileId))
				]),
			`${indexedAsset.id} index summaries differ from adjacent metadata.`
		);
		for (const display of metadataDisplays) {
			assertRecord(display, `${indexedAsset.id} display`);
			const profile = validateDisplayProfile(
				assertRecord(display.profile, `${indexedAsset.id} display profile`),
				`${indexedAsset.id} display profile`
			);
			assert(
				profile.id === display.profileId && profile.version === DISPLAY_VERSION,
				`${indexedAsset.id} display profile identity differs.`
			);
			const previous = profiles.get(profile.id);
			if (previous)
				assert(
					sameDocument(previous, profile),
					`Display profile ${profile.id} differs between assets.`
				);
			else profiles.set(profile.id, profile);
		}
		verifiedAssets.push({ index: indexedAsset, metadata });
	}
	for (const assetId of REQUIRED_ASSET_IDS) {
		assert(indexedAssetIds.has(assetId), `Required BZ V2 publication asset ${assetId} is missing.`);
	}
	return { index, indexSha256: indexDocument.sha256, regimes, profiles, verifiedAssets };
}

async function loadCheckpointPosterEvidence(presets, profiles) {
	if (candidateOnly) {
		return { index: null, indexSha256: null, verifiedPosters: [] };
	}
	const indexDocument = await readJsonDocument(
		checkpointPosterIndexPath,
		'BZ V2 checkpoint poster index'
	);
	const index = assertRecord(indexDocument.value, 'BZ V2 checkpoint poster index');
	assertExactKeys(
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
		'BZ V2 checkpoint poster index'
	);
	assert(
		index.schemaVersion === 1 && index.kind === 'bz-v2-checkpoint-posters',
		'BZ V2 checkpoint poster index identity differs.'
	);
	assert(
		index.engineVersion === ENGINE_VERSION && index.displayVersion === DISPLAY_VERSION,
		'BZ V2 checkpoint poster engine/display versions differ.'
	);
	assert(
		index.generatedBy === 'scripts/render-bz-v2-checkpoint-posters.mjs' &&
			index.generationCommand === 'node scripts/render-bz-v2-checkpoint-posters.mjs' &&
			index.assetDirectory === CHECKPOINT_POSTER_DIRECTORY,
		'BZ V2 checkpoint poster provenance differs.'
	);
	assert(
		typeof index.generatedAt === 'string' && Number.isFinite(Date.parse(index.generatedAt)),
		'BZ V2 checkpoint poster generation time is invalid.'
	);
	const indexedAssets = assertArray(index.assets, 'BZ V2 checkpoint poster assets');
	assert(
		indexedAssets.length === REQUIRED_CHECKPOINT_POSTER_IDS.length,
		'BZ V2 checkpoint poster index must contain exactly three assets.'
	);
	const assetsById = new Map();
	for (const indexedAsset of indexedAssets) {
		assertRecord(indexedAsset, 'BZ V2 indexed checkpoint poster');
		assertExactKeys(
			indexedAsset,
			[
				'id',
				'path',
				'metadataPath',
				'width',
				'height',
				'stateGrid',
				'presetId',
				'checkpointId',
				'modelStep',
				'modelTime',
				'view',
				'displayProfileId',
				'sha256',
				'metadataSha256'
			],
			`${indexedAsset.id ?? 'unknown'} checkpoint poster index entry`
		);
		assert(
			typeof indexedAsset.id === 'string' && !assetsById.has(indexedAsset.id),
			`BZ V2 checkpoint poster ${indexedAsset.id} is duplicated.`
		);
		assetsById.set(indexedAsset.id, indexedAsset);
	}
	assert(
		sameDocument([...assetsById.keys()].sort(), [...REQUIRED_CHECKPOINT_POSTER_IDS].sort()),
		'BZ V2 checkpoint poster ids differ from the three hero contracts.'
	);

	const verifiedPosters = [];
	for (const preset of presets) {
		const descriptor = preset.descriptor;
		const expectedId = `bz-v2-${preset.id}-checkpoint-poster`;
		const indexedAsset = assetsById.get(expectedId);
		assert(indexedAsset, `Required checkpoint poster ${expectedId} is missing.`);
		const expectedPath = `${CHECKPOINT_POSTER_DIRECTORY}/${preset.id}-checkpoint-poster.png`;
		const expectedMetadataPath = `${CHECKPOINT_POSTER_DIRECTORY}/${preset.id}-checkpoint-poster.metadata.json`;
		assertSha256(indexedAsset.sha256, `${expectedId} PNG checksum`);
		assertSha256(indexedAsset.metadataSha256, `${expectedId} metadata checksum`);
		assert(
			indexedAsset.path === expectedPath && indexedAsset.metadataPath === expectedMetadataPath,
			`${expectedId} paths differ from the checkpoint poster contract.`
		);
		assert(
			indexedAsset.width === CHECKPOINT_POSTER_SIZE &&
				indexedAsset.height === CHECKPOINT_POSTER_SIZE &&
				indexedAsset.stateGrid === 256 &&
				indexedAsset.stateGrid === preset.result.setup.gridSize &&
				indexedAsset.presetId === preset.id &&
				indexedAsset.checkpointId === descriptor.id &&
				indexedAsset.modelStep === descriptor.modelStep &&
				indexedAsset.modelTime === descriptor.modelTime &&
				indexedAsset.view === 'luminous-composite' &&
				indexedAsset.displayProfileId === LUMINOUS_PROFILE_ID,
			`${expectedId} does not bind the exact 256² checkpoint, step and display profile.`
		);
		const [pngBytes, metadataDocument] = await Promise.all([
			readRequired(publicToLocal(indexedAsset.path), `Checkpoint poster ${expectedId}`),
			readJsonDocument(
				publicToLocal(indexedAsset.metadataPath),
				`Checkpoint poster metadata ${expectedId}`
			)
		]);
		assert(sha256(pngBytes) === indexedAsset.sha256, `${expectedId} PNG checksum differs.`);
		assert(
			metadataDocument.sha256 === indexedAsset.metadataSha256,
			`${expectedId} metadata checksum differs.`
		);
		const dimensions = readPngDimensions(pngBytes, expectedId);
		assert(
			dimensions.width === CHECKPOINT_POSTER_SIZE && dimensions.height === CHECKPOINT_POSTER_SIZE,
			`${expectedId} must be the exact square poster size.`
		);
		const metadata = assertRecord(metadataDocument.value, `${expectedId} metadata`);
		assertExactKeys(
			metadata,
			[
				'schemaVersion',
				'kind',
				'generatedAt',
				'generatedBy',
				'generationCommand',
				'engineVersion',
				'displayVersion',
				'asset',
				'source',
				'display'
			],
			`${expectedId} metadata`
		);
		assert(
			metadata.schemaVersion === 1 &&
				metadata.kind === 'bz-v2-checkpoint-poster-metadata' &&
				metadata.generatedAt === index.generatedAt &&
				metadata.generatedBy === index.generatedBy &&
				metadata.generationCommand === index.generationCommand &&
				metadata.engineVersion === ENGINE_VERSION &&
				metadata.displayVersion === DISPLAY_VERSION,
			`${expectedId} metadata identity or provenance differs.`
		);
		const metadataAsset = assertRecord(metadata.asset, `${expectedId} metadata asset`);
		assertExactKeys(
			metadataAsset,
			['id', 'path', 'metadataPath', 'width', 'height', 'format', 'sha256'],
			`${expectedId} metadata asset`
		);
		assert(
			sameDocument(metadataAsset, {
				id: indexedAsset.id,
				path: indexedAsset.path,
				metadataPath: indexedAsset.metadataPath,
				width: indexedAsset.width,
				height: indexedAsset.height,
				format: 'png',
				sha256: indexedAsset.sha256
			}),
			`${expectedId} indexed and adjacent asset metadata differ.`
		);
		const source = assertRecord(metadata.source, `${expectedId} checkpoint source`);
		assertExactKeys(
			source,
			[
				'presetId',
				'checkpointId',
				'checkpointPath',
				'checkpointSha256',
				'modelStep',
				'modelTime',
				'stateGrid',
				'setup',
				'interventions',
				'storedFloat32StateSha256',
				'cpuFloat64ReferenceSha256',
				'renderStateSha256Before',
				'renderStateSha256After'
			],
			`${expectedId} checkpoint source`
		);
		for (const [field, label] of [
			['storedFloat32StateSha256', 'stored Float32 state'],
			['cpuFloat64ReferenceSha256', 'CPU Float64 reference state'],
			['renderStateSha256Before', 'pre-render state'],
			['renderStateSha256After', 'post-render state']
		]) {
			assertSha256(source[field], `${expectedId} ${label} checksum`);
		}
		assert(
			source.presetId === preset.id &&
				source.checkpointId === descriptor.id &&
				source.checkpointPath === descriptor.path &&
				source.checkpointSha256 === descriptor.sha256 &&
				source.modelStep === descriptor.modelStep &&
				source.modelTime === descriptor.modelTime &&
				source.stateGrid === descriptor.width &&
				sameDocument(source.setup, preset.result.setup) &&
				sameDocument(source.interventions, descriptor.interventions) &&
				canonicalDocumentSha256(source.setup) === descriptor.setupChecksum &&
				canonicalDocumentSha256(source.interventions) === descriptor.interventionLogChecksum &&
				source.storedFloat32StateSha256 === descriptor.browserStateSha256 &&
				source.cpuFloat64ReferenceSha256 === descriptor.fieldSha256F64Reference &&
				source.renderStateSha256Before === source.renderStateSha256After,
			`${expectedId} adjacent metadata differs from its authenticated checkpoint.`
		);
		const display = assertRecord(metadata.display, `${expectedId} display`);
		assertExactKeys(
			display,
			['view', 'profileId', 'profile', 'disclosure'],
			`${expectedId} display`
		);
		const profile = validateDisplayProfile(
			assertRecord(display.profile, `${expectedId} display profile`),
			`${expectedId} display profile`
		);
		assert(
			display.view === indexedAsset.view &&
				display.profileId === indexedAsset.displayProfileId &&
				sameDocument(profile, profiles.get(indexedAsset.displayProfileId)) &&
				typeof display.disclosure === 'string' &&
				display.disclosure.length > 0,
			`${expectedId} display metadata differs from the fixed manifest profile.`
		);
		verifiedPosters.push({ index: indexedAsset, metadata });
	}
	return {
		index,
		indexSha256: indexDocument.sha256,
		verifiedPosters
	};
}

function validateParityRecord(record, preset, evidenceSha256) {
	assertRecord(record, `${preset.id} GPU parity record`);
	assertExactKeys(
		record,
		[
			'presetId',
			'gridSize',
			'steps',
			'modelTime',
			'textureFormat',
			'numerical',
			'numericalCases',
			'display',
			'displayCases',
			'fieldMaxTolerance',
			'fieldRmsTolerance',
			'displayByteTolerance',
			'pass'
		],
		`${preset.id} GPU parity record`
	);
	assert(record.presetId === preset.id, `${preset.id} GPU parity identity differs.`);
	const grid = assertSafeInteger(record.gridSize, `${preset.id} parity grid`, 2);
	const modelStep = assertSafeInteger(record.steps, `${preset.id} parity steps`, 1);
	const modelTime = assertNonNegative(record.modelTime, `${preset.id} parity model time`);
	assert(
		modelTime === modelStep * preset.result.setup.timestep,
		`${preset.id} parity step and model time differ.`
	);
	assert(
		record.textureFormat === 'RGBA32F' || record.textureFormat === 'RGBA16F',
		`${preset.id} parity texture format is unsupported.`
	);
	const numerical = assertRecord(record.numerical, `${preset.id} numerical parity`);
	const display = assertRecord(record.display, `${preset.id} display parity`);
	assertExactKeys(numerical, ['maxAbsolute', 'rms', 'samples'], `${preset.id} numerical parity`);
	assertExactKeys(
		display,
		['maximumByteDifference', 'meanByteDifference', 'samples'],
		`${preset.id} display parity`
	);
	const fieldMaxTolerance = assertNonNegative(
		record.fieldMaxTolerance,
		`${preset.id} maximum field tolerance`
	);
	const fieldRmsTolerance = assertNonNegative(
		record.fieldRmsTolerance,
		`${preset.id} RMS field tolerance`
	);
	const displayByteTolerance = assertNonNegative(
		record.displayByteTolerance,
		`${preset.id} display-byte tolerance`
	);
	const numericalCases = [];
	const numericalCaseIds = new Set();
	const rawNumericalCases = assertArray(
		record.numericalCases,
		`${preset.id} numerical parity cases`
	);
	const matureParity = grid === 256;
	assert(grid === 64 || matureParity, `${preset.id} parity grid must be 64² or mature 256².`);
	for (const [index, rawCase] of rawNumericalCases.entries()) {
		const parityCase = assertRecord(rawCase, `${preset.id} numerical parity case ${index}`);
		assertExactKeys(
			parityCase,
			matureParity ? ['id', 'gridSize', 'step', 'modelTime', 'error'] : ['id', 'step', 'error'],
			`${preset.id} numerical parity case ${index}`
		);
		assert(
			typeof parityCase.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(parityCase.id),
			`${preset.id} numerical parity case ${index} id is invalid.`
		);
		const normalizedId = matureParity
			? parityCase.id
			: `${parityCase.id}${parityCase.id.endsWith('-64') ? '' : '-64'}`;
		assert(
			!numericalCaseIds.has(normalizedId),
			`${preset.id} numerical parity case ${normalizedId} is duplicated.`
		);
		numericalCaseIds.add(normalizedId);
		const caseGrid = matureParity
			? assertSafeInteger(parityCase.gridSize, `${preset.id} ${normalizedId} grid`, 2)
			: 64;
		const caseStep = assertSafeInteger(parityCase.step, `${preset.id} ${parityCase.id} step`);
		const caseTime = matureParity
			? assertNonNegative(parityCase.modelTime, `${preset.id} ${normalizedId} model time`)
			: caseStep * preset.result.setup.timestep;
		assert(
			caseTime === caseStep * preset.result.setup.timestep,
			`${preset.id} ${parityCase.id} step and model time differ.`
		);
		const error = assertRecord(parityCase.error, `${preset.id} ${normalizedId} error`);
		assertExactKeys(error, ['maxAbsolute', 'rms', 'samples'], `${preset.id} ${normalizedId} error`);
		const maxAbsolute = assertNonNegative(
			error.maxAbsolute,
			`${preset.id} ${normalizedId} maximum field error`
		);
		const rms = assertNonNegative(error.rms, `${preset.id} ${normalizedId} RMS field error`);
		const samples = assertSafeInteger(error.samples, `${preset.id} ${normalizedId} samples`, 1);
		numericalCases.push({
			id: normalizedId,
			gridSize: caseGrid,
			step: caseStep,
			modelTime: caseTime,
			error: { maxAbsolute, rms, samples },
			pass: maxAbsolute <= fieldMaxTolerance && rms <= fieldRmsTolerance
		});
	}
	let scopeKind;
	let scope;
	if (matureParity) {
		for (const caseId of REQUIRED_NUMERICAL_PARITY_CASE_IDS) {
			assert(
				numericalCaseIds.has(caseId),
				`${preset.id} GPU parity is missing required case ${caseId}.`
			);
		}
		const scheduledCase = numericalCases.find(
			(parityCase) => parityCase.id === 'declared-intervention-schedule-64'
		);
		const uploadCase = numericalCases.find(
			(parityCase) => parityCase.id === 'mature-checkpoint-upload'
		);
		const continuationCase = numericalCases.find(
			(parityCase) => parityCase.id === 'mature-checkpoint-continuation'
		);
		assert(
			scheduledCase.gridSize === 64,
			`${preset.id} declared intervention schedule parity must run at 64².`
		);
		assert(
			uploadCase.gridSize === 256 &&
				uploadCase.step === preset.descriptor.modelStep &&
				uploadCase.modelTime === preset.descriptor.modelTime,
			`${preset.id} mature checkpoint upload parity does not match its authenticated checkpoint.`
		);
		assert(
			continuationCase.gridSize === 256 &&
				continuationCase.step >= preset.descriptor.modelStep + 64,
			`${preset.id} mature checkpoint continuation parity must cover at least 64 fixed steps.`
		);
		assert(
			grid === continuationCase.gridSize &&
				modelStep === continuationCase.step &&
				modelTime === continuationCase.modelTime,
			`${preset.id} aggregate parity scope differs from its mature continuation case.`
		);
		scopeKind = 'mature-checkpoint-continuation-256';
		scope =
			'Mature parity starts from the authenticated 256² browser checkpoint, verifies immediate GPU upload and at least 64 fixed continuation steps; morphology validation remains the independent Float64 CPU search evidence. The same report also covers the declared schedule at 64².';
	} else {
		assert(
			numericalCaseIds.has('base-fixed-step-64'),
			`${preset.id} implementation parity is missing its fixed-step 64² case.`
		);
		if (preset.descriptor.interventions.length > 0) {
			assert(
				numericalCaseIds.has('declared-intervention-schedule-64'),
				`${preset.id} implementation parity is missing its declared schedule case.`
			);
		}
		assert(
			numericalCases.some(
				(parityCase) => parityCase.step === modelStep && parityCase.modelTime === modelTime
			),
			`${preset.id} aggregate parity scope differs from its 64² implementation cases.`
		);
		scopeKind = 'implementation-and-display-64';
		scope =
			'Browser CPU/GPU fixed-step integration, declared intervention scheduling and display-transform agreement were measured at 64². This is implementation parity only; mature 256² morphology, core rotations and target fronts are established by the authenticated Float64 CPU search, convergence and checkpoint provenance, not by GPU remeasurement.';
	}
	const numericalSamples = numericalCases.reduce(
		(sum, parityCase) => sum + parityCase.error.samples,
		0
	);
	const numericalMaximum = Math.max(
		...numericalCases.map((parityCase) => parityCase.error.maxAbsolute)
	);
	const numericalRms = Math.sqrt(
		numericalCases.reduce(
			(sum, parityCase) => sum + parityCase.error.rms ** 2 * parityCase.error.samples,
			0
		) / numericalSamples
	);
	const aggregateNumericalSamples = assertSafeInteger(
		numerical.samples,
		`${preset.id} field comparison samples`,
		1
	);
	assert(
		aggregateNumericalSamples === numericalSamples &&
			nearlyEqual(numerical.maxAbsolute, numericalMaximum) &&
			nearlyEqual(numerical.rms, numericalRms),
		`${preset.id} aggregate numerical parity differs from its measured cases.`
	);
	const displayCases = [];
	const displayCaseIds = new Set();
	for (const [index, rawCase] of assertArray(
		record.displayCases,
		`${preset.id} display parity cases`
	).entries()) {
		const parityCase = assertRecord(rawCase, `${preset.id} display parity case ${index}`);
		assertExactKeys(parityCase, ['id', 'error'], `${preset.id} display parity case ${index}`);
		assert(
			typeof parityCase.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(parityCase.id),
			`${preset.id} display parity case ${index} id is invalid.`
		);
		assert(
			!displayCaseIds.has(parityCase.id),
			`${preset.id} display parity case ${parityCase.id} is duplicated.`
		);
		displayCaseIds.add(parityCase.id);
		const error = assertRecord(parityCase.error, `${preset.id} ${parityCase.id} display error`);
		assertExactKeys(
			error,
			['maximumByteDifference', 'meanByteDifference', 'samples'],
			`${preset.id} ${parityCase.id} display error`
		);
		const maximumByteDifference = assertNonNegative(
			error.maximumByteDifference,
			`${preset.id} ${parityCase.id} maximum display-byte difference`
		);
		const meanByteDifference = assertNonNegative(
			error.meanByteDifference,
			`${preset.id} ${parityCase.id} mean display-byte difference`
		);
		const samples = assertSafeInteger(
			error.samples,
			`${preset.id} ${parityCase.id} display samples`,
			1
		);
		displayCases.push({
			id: parityCase.id,
			error: { maximumByteDifference, meanByteDifference, samples },
			pass:
				maximumByteDifference <= displayByteTolerance && meanByteDifference <= displayByteTolerance
		});
	}
	assert(
		displayCaseIds.size === REQUIRED_DISPLAY_PARITY_CASE_IDS.length &&
			REQUIRED_DISPLAY_PARITY_CASE_IDS.every((caseId) => displayCaseIds.has(caseId)),
		`${preset.id} display parity cases differ from the required view contract.`
	);
	const displaySamples = displayCases.reduce(
		(sum, parityCase) => sum + parityCase.error.samples,
		0
	);
	const displayMaximum = Math.max(
		...displayCases.map((parityCase) => parityCase.error.maximumByteDifference)
	);
	const displayMean =
		displayCases.reduce(
			(sum, parityCase) => sum + parityCase.error.meanByteDifference * parityCase.error.samples,
			0
		) / displaySamples;
	const aggregateDisplaySamples = assertSafeInteger(
		display.samples,
		`${preset.id} display comparison samples`,
		1
	);
	assert(
		aggregateDisplaySamples === displaySamples &&
			nearlyEqual(display.maximumByteDifference, displayMaximum) &&
			nearlyEqual(display.meanByteDifference, displayMean),
		`${preset.id} aggregate display parity differs from its measured cases.`
	);
	const observables = [
		{
			name: 'field-maximum-absolute-error',
			value: assertNonNegative(numerical.maxAbsolute, `${preset.id} maximum field error`),
			tolerance: fieldMaxTolerance,
			samples: aggregateNumericalSamples
		},
		{
			name: 'field-rms-error',
			value: assertNonNegative(numerical.rms, `${preset.id} RMS field error`),
			tolerance: fieldRmsTolerance,
			samples: numerical.samples
		},
		{
			name: 'display-maximum-byte-difference',
			value: assertNonNegative(
				display.maximumByteDifference,
				`${preset.id} maximum display-byte difference`
			),
			tolerance: displayByteTolerance,
			samples: aggregateDisplaySamples
		},
		{
			name: 'display-mean-byte-difference',
			value: assertNonNegative(
				display.meanByteDifference,
				`${preset.id} mean display-byte difference`
			),
			tolerance: displayByteTolerance,
			samples: display.samples
		},
		...numericalCases.flatMap((parityCase) => [
			{
				name: `${parityCase.id}-maximum-absolute-error`,
				value: parityCase.error.maxAbsolute,
				tolerance: fieldMaxTolerance,
				samples: parityCase.error.samples
			},
			{
				name: `${parityCase.id}-rms-error`,
				value: parityCase.error.rms,
				tolerance: fieldRmsTolerance,
				samples: parityCase.error.samples
			}
		]),
		...displayCases.flatMap((parityCase) => [
			{
				name: `${parityCase.id}-maximum-byte-difference`,
				value: parityCase.error.maximumByteDifference,
				tolerance: displayByteTolerance,
				samples: parityCase.error.samples
			},
			{
				name: `${parityCase.id}-mean-byte-difference`,
				value: parityCase.error.meanByteDifference,
				tolerance: displayByteTolerance,
				samples: parityCase.error.samples
			}
		])
	].map((observable) => ({
		...observable,
		pass: observable.value <= observable.tolerance
	}));
	const pass = observables.every((observable) => observable.pass);
	assert(record.pass === pass, `${preset.id} aggregate GPU parity pass flag differs.`);
	return {
		status: 'measured',
		pass: record.pass,
		evidencePath: parityPublicPath,
		evidenceSha256,
		grid,
		modelStep,
		modelTime,
		cpuPrecision: 'float64',
		gpuPrecision: record.textureFormat === 'RGBA32F' ? 'float32' : 'float16',
		textureFormat: record.textureFormat,
		scopeKind,
		scope,
		numericalCases,
		displayCases,
		observables
	};
}

async function loadParityEvidence(presets) {
	if (candidateOnly) return { document: null, records: new Map() };
	const document = await readOptionalJsonDocument(parityEvidencePath, 'BZ V2 GPU parity evidence');
	if (!document) return { document: null, records: new Map() };
	const source = document.value;
	assert(
		source.schemaVersion === 1 && source.kind === 'bz-v2-browser-cpu-gpu-parity',
		'BZ V2 GPU parity identity differs.'
	);
	assert(source.engineVersion === ENGINE_VERSION, 'BZ V2 GPU parity engine version differs.');
	assert(source.displayVersion === DISPLAY_VERSION, 'BZ V2 GPU parity display version differs.');
	assert(
		typeof source.userAgent === 'string' && source.userAgent.length > 0,
		'BZ V2 GPU parity user agent is missing.'
	);
	assertNonNegative(source.durationMs, 'BZ V2 GPU parity duration');
	const records = new Map();
	for (const rawRecord of assertArray(source.records, 'BZ V2 GPU parity records')) {
		const preset = presets.find((entry) => entry.id === rawRecord?.presetId);
		assert(preset, `GPU parity references unknown preset ${rawRecord?.presetId}.`);
		assert(!records.has(preset.id), `GPU parity duplicates ${preset.id}.`);
		records.set(preset.id, validateParityRecord(rawRecord, preset, document.sha256));
	}
	assert(
		source.pass === presets.every((preset) => records.get(preset.id)?.pass === true),
		'BZ V2 GPU parity aggregate result differs.'
	);
	return { document, records };
}

async function loadPerformanceEvidence() {
	const document = await readOptionalJsonDocument(
		performanceEvidencePath,
		'BZ V2 browser performance evidence'
	);
	if (!document) return { document: null, measuredAt: null, reports: [] };
	const validated = validateBZV2PerformanceEvidence(document.value, {
		engineVersion: ENGINE_VERSION,
		displayVersion: DISPLAY_VERSION
	});
	return { document, ...validated };
}

function criteriaFor(preset) {
	const result = preset.result;
	const finiteCriterion = {
		id: 'finite-state',
		kind: 'prerequisite',
		description: 'The final 256² observation window remained finite under the fail-fast solver.',
		pass: result.finite === true,
		evidence: { finite: result.finite, grid: result.setup.gridSize, duration: result.duration }
	};
	if (preset.id === 'classic-target-rings') {
		return [
			finiteCriterion,
			{
				id: 'three-outward-fronts',
				kind: 'validation',
				description:
					'At least three separated outward radial fronts coexist in the declared observation window without a reflected track.',
				pass: result.pass === true,
				evidence: {
					maximumSignificantPeaks: result.maximumSignificantPeaks,
					simultaneousThreePeakFraction: result.simultaneousThreePeakFraction,
					minimumObservedSpacing: result.minimumObservedSpacing,
					outwardTrackCount: result.outwardTrackCount,
					wallReflectionTracks: result.wallReflectionTracks,
					meanWaveSpeed: result.meanWaveSpeed
				}
			}
		];
	}
	if (preset.id === 'persistent-single-spiral') {
		return [
			finiteCriterion,
			{
				id: 'persistent-rotating-single-core',
				kind: 'validation',
				description:
					'Exactly one detected phase singularity persists centrally for at least three measured rotations.',
				pass: result.pass === true,
				evidence: {
					rotations: result.rotations,
					rotationPeriodMean: result.rotationPeriodMean,
					rotationPeriodCv: result.rotationPeriodCv,
					detectedFraction: result.detectedFraction,
					exactlyOneCoreFraction: result.exactlyOneCoreFraction,
					centralFraction: result.centralFraction,
					minimumWallDistance: result.minimumWallDistance
				}
			}
		];
	}
	return [
		finiteCriterion,
		{
			id: 'persistent-three-core-garden',
			kind: 'validation',
			description:
				'At least three separated phase-singularity tracks persist for at least three measured rotations.',
			pass: result.pass === true,
			evidence: {
				minimumCoreCount: result.minimumCoreCount,
				maximumCoreCount: result.maximumCoreCount,
				persistentFraction: result.persistentFraction,
				persistentTrackCount: result.persistentTrackCount,
				minimumMeasuredRotations: result.minimumMeasuredRotations,
				minimumSeparation: result.minimumSeparation,
				minimumWallDistance: result.minimumWallDistance
			}
		}
	];
}

function sampleContract(result) {
	let summary;
	if (result.hero === 'classic-target-rings') summary = result.trackSummaries?.[0];
	else if (result.hero === 'persistent-single-spiral') summary = result.trackSegments?.[0];
	else summary = result.trackSummaries?.[0];
	assertRecord(summary, `${result.hero} sample summary`);
	const samples = assertSafeInteger(summary.samples, `${result.hero} sample count`, 2);
	const start = result.observationStart;
	const end = result.duration;
	const interval = (end - start) / (samples - 1);
	const sampleEverySteps = Math.round(interval / result.setup.timestep);
	assert(sampleEverySteps >= 1, `${result.hero} sample interval is invalid.`);
	const sampledTimes = Array.from({ length: samples }, (_, index) => {
		if (index === samples - 1) return end;
		return Number((start + index * sampleEverySteps * result.setup.timestep).toPrecision(15));
	});
	return {
		window: {
			startStep: Math.round(start / result.setup.timestep),
			endStep: Math.round(end / result.setup.timestep),
			startTime: start,
			endTime: end,
			sampleEverySteps
		},
		sampledTimes
	};
}

function summaryMeasurements(preset) {
	const result = preset.result;
	if (preset.id === 'classic-target-rings') {
		return {
			grid: result.setup.gridSize,
			modelTime: result.duration,
			maximumSignificantPeaks: result.maximumSignificantPeaks,
			simultaneousThreePeakFraction: result.simultaneousThreePeakFraction,
			meanWaveSpeed: result.meanWaveSpeed,
			outwardTrackCount: result.outwardTrackCount,
			wallReflectionTracks: result.wallReflectionTracks
		};
	}
	if (preset.id === 'persistent-single-spiral') {
		return {
			grid: result.setup.gridSize,
			modelTime: result.duration,
			rotations: result.rotations,
			rotationPeriodMean: result.rotationPeriodMean,
			rotationPeriodCv: result.rotationPeriodCv,
			exactlyOneCoreFraction: result.exactlyOneCoreFraction,
			minimumWallDistance: result.minimumWallDistance
		};
	}
	return {
		grid: result.setup.gridSize,
		modelTime: result.duration,
		minimumCoreCount: result.minimumCoreCount,
		persistentTrackCount: result.persistentTrackCount,
		minimumMeasuredRotations: result.minimumMeasuredRotations,
		minimumSeparation: result.minimumSeparation,
		minimumWallDistance: result.minimumWallDistance
	};
}

function shortDescription(preset) {
	const result = preset.result;
	if (preset.id === 'classic-target-rings') {
		return `A declared periodic central state-reset source produced ${result.maximumSignificantPeaks} simultaneous outward fronts at 256²; mean measured radial speed ${result.meanWaveSpeed.toFixed(3)}.`;
	}
	if (preset.id === 'persistent-single-spiral') {
		return `One measured phase singularity persisted for ${result.rotations.toFixed(2)} rotations at 256² after the declared plane-wave cut.`;
	}
	return `${result.persistentTrackCount} measured phase-singularity tracks persisted for at least ${result.minimumMeasuredRotations.toFixed(2)} rotations at 256².`;
}

function claimBoundary(preset, validated) {
	if (!validated) {
		return `${preset.title} passed its deterministic 256² Float64 CPU morphology search, but remains a candidate until explicitly scoped browser CPU/GPU implementation parity, display-independence evidence and matching publication metadata pass.`;
	}
	return `${preset.title} morphology is validated by the recorded 256² Float64 CPU search, convergence and authenticated checkpoint provenance. GPU evidence separately verifies only the browser integration and display-transform scope stated in its parity record; it is not morphology evidence. The claim applies only to the exact setup, preparation, timestep, observation window and publication metadata recorded here.`;
}

async function buildManifest() {
	const requiredSearchNames = new Set();
	for (const input of heroInputs) {
		requiredSearchNames.add(input.searchFile);
		for (const comparison of input.convergence) {
			requiredSearchNames.add(comparison.candidateFile);
			requiredSearchNames.add(comparison.referenceFile);
		}
	}
	const searchDocuments = new Map();
	for (const filename of [...requiredSearchNames].sort()) {
		searchDocuments.set(
			filename,
			await readJsonDocument(searchPath(filename), `Search result ${filename}`)
		);
	}
	const presets = [];
	for (const input of heroInputs) {
		const final = exactSearchResult(
			searchDocuments.get(input.searchFile),
			input.searchFile,
			input.id
		);
		assert(final.descriptor.id === input.checkpointId, `${input.id} checkpoint identity differs.`);
		assert(final.descriptor.sourcePresetId === input.id, `${input.id} checkpoint source differs.`);
		assert(
			final.descriptor.validationRecordId === `${input.id}-validation-v2`,
			`${input.id} validation identity differs.`
		);
		assert(
			sameDocument(final.result.setup, final.descriptor.setup),
			`${input.id} result and checkpoint setups differ.`
		);
		const resultInterventions = final.result.preparation ?? final.descriptor.interventions;
		assert(
			sameDocument(resultInterventions, final.descriptor.interventions),
			`${input.id} result and checkpoint interventions differ.`
		);
		assert(
			final.descriptor.modelTime === final.result.duration,
			`${input.id} checkpoint time differs from the final result.`
		);
		assert(
			final.descriptor.modelStep * final.result.setup.timestep === final.result.duration,
			`${input.id} checkpoint step and time differ.`
		);
		const checkpointVerification = await verifyCheckpoint(final.descriptor);
		const convergence = input.convergence.map((comparison) => {
			const candidateResult = refinementResult(
				searchDocuments.get(comparison.candidateFile),
				comparison.candidateFile,
				input.id
			);
			const referenceResult = refinementResult(
				searchDocuments.get(comparison.referenceFile),
				comparison.referenceFile,
				input.id
			);
			const candidate = assertFinite(
				candidateResult[comparison.observable],
				`${comparison.candidateFile} ${comparison.observable}`
			);
			const reference = assertFinite(
				referenceResult[comparison.observable],
				`${comparison.referenceFile} ${comparison.observable}`
			);
			const difference = relativeDifference(candidate, reference);
			return {
				comparison: comparison.comparison,
				reference: comparison.referenceFile,
				observable: comparison.observable,
				relativeDifference: difference,
				tolerance: comparison.tolerance,
				pass: difference <= comparison.tolerance,
				candidateValue: candidate,
				referenceValue: reference,
				candidateArtifactSha256: searchDocuments.get(comparison.candidateFile).sha256,
				referenceArtifactSha256: searchDocuments.get(comparison.referenceFile).sha256
			};
		});
		presets.push({
			...input,
			search: final.source,
			result: final.result,
			descriptor: final.descriptor,
			checkpointVerification,
			convergence,
			searchArtifactSha256: searchDocuments.get(input.searchFile).sha256
		});
	}
	const assets = await loadAssetEvidence();
	const luminousProfile = assets.profiles.get(LUMINOUS_PROFILE_ID);
	assert(
		luminousProfile,
		`Required display profile ${LUMINOUS_PROFILE_ID} is absent from asset metadata.`
	);
	assert(
		luminousProfile.rangeMode === 'fixed',
		'The publication luminous profile is not fixed-range.'
	);
	const checkpointPosters = await loadCheckpointPosterEvidence(presets, assets.profiles);
	const parity = await loadParityEvidence(presets);
	const performance = await loadPerformanceEvidence();
	const assetRecords = [];
	const matchingAssetsByPreset = new Map(heroInputs.map((input) => [input.id, []]));
	const matchingCheckpointPostersByPreset = new Map(heroInputs.map((input) => [input.id, []]));
	const displayIndependenceByPreset = new Map();
	for (const verified of assets.verifiedAssets) {
		const metadataSources = new Map(
			assertArray(verified.metadata.sources, `${verified.index.id} metadata sources`).map(
				(source) => [source.presetId, source]
			)
		);
		for (const [displayIndex, display] of verified.metadata.displays.entries()) {
			const preset = presets.find((entry) => entry.id === display.runId);
			if (!preset) continue;
			const source = metadataSources.get(preset.id);
			if (!source) continue;
			const setupMatches = sameDocument(
				normalizedPresentationSetup(source.setup),
				normalizedPresentationSetup(preset.result.setup)
			);
			const interventionsMatch = sameDocument(
				source.interventions,
				preset.descriptor.interventions
			);
			const timeMatches =
				source.modelStep === preset.descriptor.modelStep &&
				source.modelTime === preset.descriptor.modelTime;
			if (!setupMatches || !interventionsMatch || !timeMatches) continue;
			const suffixNeeded = verified.metadata.displays.length > 1;
			const record = {
				id: suffixNeeded ? `${verified.index.id}-${displayIndex + 1}` : verified.index.id,
				path: verified.index.path,
				width: verified.index.width,
				height: verified.index.height,
				stateGrid: source.setup.gridSize,
				presetId: preset.id,
				checkpointId: null,
				view: display.view,
				displayProfileId: display.profileId,
				sha256: verified.index.sha256,
				metadataPath: verified.index.metadataPath
			};
			assetRecords.push(record);
			const promotionEligible =
				verified.metadata.sources.length === 1 &&
				verified.metadata.displays.length === 1 &&
				['dish', 'ferroin-proxy', 'luminous-composite'].includes(display.view);
			if (promotionEligible) matchingAssetsByPreset.get(preset.id).push(record);
			const stateAfterRendering =
				source.stateSha256AfterRendering ??
				source.stateSha256AfterDisplay ??
				source.stateSha256After;
			if (stateAfterRendering !== undefined) {
				assertSha256(stateAfterRendering, `${preset.id} post-render state checksum`);
				const evidence = {
					stateChecksumBefore: source.stateSha256,
					stateChecksumAfter: stateAfterRendering,
					pass: source.stateSha256 === stateAfterRendering,
					status: 'measured',
					metadataPath: verified.index.metadataPath
				};
				const previous = displayIndependenceByPreset.get(preset.id);
				if (previous) {
					assert(
						previous.stateChecksumBefore === evidence.stateChecksumBefore &&
							previous.stateChecksumAfter === evidence.stateChecksumAfter &&
							previous.pass === evidence.pass &&
							previous.status === evidence.status,
						`${preset.id} display-independence metadata differs between assets.`
					);
				} else {
					displayIndependenceByPreset.set(preset.id, evidence);
				}
			}
		}
	}
	for (const verified of checkpointPosters.verifiedPosters) {
		const record = {
			id: verified.index.id,
			path: verified.index.path,
			width: verified.index.width,
			height: verified.index.height,
			stateGrid: verified.index.stateGrid,
			presetId: verified.index.presetId,
			checkpointId: verified.index.checkpointId,
			view: verified.index.view,
			displayProfileId: verified.index.displayProfileId,
			sha256: verified.index.sha256,
			metadataPath: verified.index.metadataPath
		};
		assetRecords.push(record);
		matchingCheckpointPostersByPreset.get(verified.index.presetId).push(record);
	}
	const calibrationRecords = [];
	const presetRecords = [];
	for (const preset of presets) {
		const criteria = criteriaFor(preset);
		const sample = sampleContract(preset.result);
		const parityRecord = parity.records.get(preset.id) ?? {
			status: 'not-measured',
			pass: false,
			reason: `No explicit numerical GPU parity evidence is present at ${parityPublicPath}.`,
			observables: []
		};
		const displayIndependence = displayIndependenceByPreset.get(preset.id) ?? {
			stateChecksumBefore: preset.descriptor.fieldSha256F64Reference,
			stateChecksumAfter: preset.descriptor.fieldSha256F64Reference,
			pass: false,
			status: 'not-measured',
			reason: 'No explicit before/after display-independence measurement was supplied.'
		};
		const matchingAssets = matchingAssetsByPreset.get(preset.id);
		const matchingCheckpointPosters = matchingCheckpointPostersByPreset.get(preset.id);
		const gates = {
			objectiveSearch: preset.result.pass === true,
			criteria: criteria.every((criterion) => criterion.pass),
			convergence: preset.convergence.length > 0 && preset.convergence.every((entry) => entry.pass),
			gpuParity: parityRecord.pass === true,
			displayIndependence: displayIndependence.pass === true,
			matchingAssetMetadata: matchingAssets.length > 0,
			checkpointPosterMetadata:
				matchingCheckpointPosters.length === 1 &&
				matchingCheckpointPosters[0].checkpointId === preset.descriptor.id &&
				matchingCheckpointPosters[0].stateGrid === preset.result.setup.gridSize &&
				matchingCheckpointPosters[0].displayProfileId === luminousProfile.id,
			checkpoint: true,
			fixedDisplayProfile: luminousProfile.rangeMode === 'fixed'
		};
		const validated = Object.values(gates).every(Boolean);
		const status = validated ? 'validated' : 'candidate';
		const failedCriteria = Object.entries(gates)
			.filter(([, pass]) => !pass)
			.map(([name]) => name);
		const passedCriteria = criteria
			.filter((criterion) => criterion.pass)
			.map((criterion) => criterion.id);
		const assetRegime = assets.regimes.get(preset.id);
		const initialStateSha256 =
			assetRegime &&
			sameDocument(
				normalizedPresentationSetup(assetRegime.setup),
				normalizedPresentationSetup(preset.result.setup)
			)
				? assetRegime.initialStateSha256
				: null;
		const statusReason = validated
			? `Every deterministic Float64 morphology search, convergence, authenticated checkpoint, explicitly scoped ${parityRecord.scopeKind} browser parity, display-independence, publication-metadata and exact checkpoint-poster gate passed.`
			: `Candidate only. Outstanding evidence gates: ${failedCriteria.join(', ')}.`;
		calibrationRecords.push({
			id: preset.descriptor.validationRecordId,
			presetId: preset.id,
			status,
			statusReason,
			setup: preset.result.setup,
			interventions: preset.descriptor.interventions,
			observationWindow: sample.window,
			sampledTimes: sample.sampledTimes,
			metrics: {
				objective: preset.result,
				initialStateSha256,
				initialStateGrid: initialStateSha256 ? assetRegime.setup.gridSize : null,
				checkpointCpuFloat64StateSha256: preset.descriptor.fieldSha256F64Reference,
				checkpointBrowserFloat32StateSha256: preset.descriptor.browserStateSha256,
				validationGates: gates
			},
			criteria,
			convergence: preset.convergence,
			cpuGpuParity: parityRecord,
			displayIndependence,
			provenance: {
				generator: 'scripts/generate-bz-v2-manifest.mjs',
				searchArtifact: `artifacts/bz-v2-search/${preset.searchFile}`,
				searchArtifactSha256: preset.searchArtifactSha256,
				searchCommand: preset.search.command,
				checkpointWholeFileSha256: preset.checkpointVerification.binaryWholeFileSha256,
				assetIndexSha256: assets.indexSha256,
				checkpointPosterIndexSha256: checkpointPosters.indexSha256,
				gpuParityEvidenceSha256: parity.document?.sha256 ?? null
			}
		});
		presetRecords.push({
			schemaVersion: SCHEMA_VERSION,
			id: preset.id,
			title: assets.regimes.get(preset.id)?.title ?? preset.title,
			shortDescription: shortDescription(preset),
			model: preset.result.setup.model,
			modelVersion: preset.result.setup.modelVersion,
			equationsId: preset.result.setup.equationsId,
			setup: preset.result.setup,
			initialCondition: preset.result.setup.initialCondition,
			initialInterventions: preset.descriptor.interventions,
			sourceSemantics: preset.sourceSemantics,
			warmupPolicy: {
				kind: 'checkpoint',
				checkpointId: preset.descriptor.id,
				modelTime: preset.descriptor.modelTime,
				genesisAvailable: true
			},
			optionalCheckpoint: preset.descriptor,
			displayProfileId: luminousProfile.id,
			calibrationRecordId: preset.descriptor.validationRecordId,
			validationStatus: status,
			validationSummary: {
				status,
				headline: statusReason,
				passedCriteria,
				failedCriteria,
				measurements: summaryMeasurements(preset)
			},
			observationWindow: sample.window,
			reproducibility: {
				seed: preset.result.setup.seed,
				engineVersion: ENGINE_VERSION,
				setupChecksum: preset.descriptor.setupChecksum,
				interventionLogChecksum: preset.descriptor.interventionLogChecksum,
				command: preset.search.command
			},
			articleClaimBoundary: claimBoundary(preset, validated),
			hero: validated
		});
	}
	const timestamps = [
		assets.index.generatedAt,
		...(checkpointPosters.index ? [checkpointPosters.index.generatedAt] : []),
		...presets.map((preset) => preset.descriptor.generatedAt),
		...(parity.document ? [parity.document.value.generatedAt] : []),
		...(performance.measuredAt ? [performance.measuredAt] : [])
	]
		.filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))
		.map((value) => new Date(value).getTime());
	assert(timestamps.length > 0, 'No deterministic manifest generation timestamp is available.');
	const validatedHeroes = presetRecords.filter((preset) => preset.hero);
	const searchInputs = [...searchDocuments.entries()].map(([filename, document]) => ({
		path: `artifacts/bz-v2-search/${filename}`,
		sha256: document.sha256
	}));
	return {
		schemaVersion: SCHEMA_VERSION,
		engineVersion: ENGINE_VERSION,
		displayVersion: DISPLAY_VERSION,
		generatedAt: new Date(Math.max(...timestamps)).toISOString(),
		generatedBy: 'scripts/generate-bz-v2-manifest.mjs',
		literatureBasis: [
			{
				label: 'Tyson and Fife (1980), Oregonator spiral-regime search guidance',
				url: 'https://doi.org/10.1063/1.440418'
			},
			{
				label: 'Jahnke, Skaggs and Winfree (1989), Oregonator spiral-regime search guidance',
				url: 'https://doi.org/10.1021/j100339a047'
			},
			{
				label: 'Mahanta, Das and Dutta (2018), Oregonator spiral-regime search guidance',
				url: 'https://doi.org/10.1103/PhysRevE.97.022206'
			}
		],
		numericalMethod:
			'Fixed-timestep explicit Heun integration of the declared two-variable Oregonator with fail-fast finite and negativity checks.',
		boundaryMethod:
			'Five-point Laplacian with explicit circular-domain and active-cell masks; missing neighbours use the declared no-flux rule.',
		checksumAlgorithms: {
			checkpointFile: 'sha256-bzcp-complete-v1',
			cpuReferenceState: 'sha256-f64le-state-v1',
			browserCheckpointState: 'sha256-f32le-state-v1',
			canonicalDocuments: 'sha256-canonical-json-v1',
			assets: 'sha256'
		},
		search: {
			status: 'complete',
			stage: 'publication-refinement',
			finalGrid: 256,
			inputs: searchInputs,
			assetIndex: {
				path: '/images/visualizations/belousov-zhabotinsky/v2/bz-v2-assets.json',
				sha256: assets.indexSha256
			},
			checkpointPosterIndex: checkpointPosters.index
				? {
						path: checkpointPosterIndexPublicPath,
						sha256: checkpointPosters.indexSha256
					}
				: { path: checkpointPosterIndexPublicPath, status: 'not-supplied' },
			gpuParityEvidence: parity.document
				? { path: parityPublicPath, sha256: parity.document.sha256 }
				: { path: parityPublicPath, status: 'not-supplied' },
			performanceEvidence: performance.document
				? { path: performancePublicPath, sha256: performance.document.sha256 }
				: { path: performancePublicPath, status: 'not-supplied' },
			validationBoundary:
				'Float64 CPU search, convergence and authenticated checkpoint provenance are the 256² morphology evidence. The available 64² browser parity validates fixed-step CPU/GPU integration, declared scheduling and display transforms only; it does not remeasure mature fronts, cores or rotations on the GPU. Stronger optional mature-checkpoint parity may be recorded separately. Display independence, matching publication metadata and exact checkpoint-poster provenance must also pass.'
		},
		displayProfiles: [...assets.profiles.values()].sort((left, right) =>
			left.id.localeCompare(right.id)
		),
		presets: presetRecords,
		calibrations: calibrationRecords,
		checkpoints: presets.map((preset) => preset.descriptor),
		assets: assetRecords.sort((left, right) => left.id.localeCompare(right.id)),
		performance: performance.reports,
		articleClaims: {
			validationBoundary:
				validatedHeroes.length > 0
					? `${validatedHeroes.length} hero preset(s) satisfy every recorded evidence gate; claims remain exact-configuration only.`
					: 'No V2 preset is promoted to a validated hero because explicit numerical GPU parity and/or other required evidence is absent.',
			classicTargetRings: claimBoundary(
				presets[0],
				presetRecords[0].validationStatus === 'validated'
			),
			persistentSingleSpiral: claimBoundary(
				presets[1],
				presetRecords[1].validationStatus === 'validated'
			),
			spiralGarden: claimBoundary(presets[2], presetRecords[2].validationStatus === 'validated')
		}
	};
}

async function run() {
	const manifest = await buildManifest();
	const expected = jsonBytes(manifest);
	if (checkOnly) {
		const actual = await readRequired(outputPath, 'Generated BZ V2 calibration manifest');
		assert(
			actual.equals(expected),
			'BZ V2 calibration manifest is stale. Run `npm run bz:manifest`.'
		);
		console.log(
			`BZ V2 calibration manifest is current (${manifest.presets.length} presets, ${manifest.assets.length} matching asset records, ${manifest.presets.filter((preset) => preset.hero).length} validated heroes).`
		);
		return;
	}
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, expected);
	console.log(
		`wrote ${path.relative(root, outputPath)} · ${expected.length} bytes · ${manifest.presets.length} presets · ${manifest.assets.length} matching asset records · ${manifest.presets.filter((preset) => preset.hero).length} validated heroes`
	);
	console.log(
		'Run `npm run bz:manifest:check` to verify the committed manifest against its exact inputs.'
	);
}

if (helpOnly) {
	console.log(
		'Usage: node scripts/generate-bz-v2-manifest.mjs [--candidate] [--check]\n\n' +
			'Reads the final 256² search JSON, authenticated checkpoint bytes, adjacent publication metadata, optional explicit GPU parity evidence and optional measured browser performance evidence. --candidate deliberately defers parity so the browser probe can bootstrap from a fail-closed candidate manifest. It never promotes a hero from CPU search or appearance alone.'
	);
} else {
	await run();
}
