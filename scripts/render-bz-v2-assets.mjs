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
const indexFilename = 'bz-v2-assets.json';
const indexPath = path.join(outputDirectory, indexFilename);
const generatedBy = 'scripts/render-bz-v2-assets.mjs';
const generationCommand = 'node scripts/render-bz-v2-assets.mjs';
const checkOnly = process.argv.includes('--check');
const helpOnly = process.argv.includes('--help') || process.argv.includes('-h');
const allowedArguments = new Set(['--check', '--help', '-h']);
const unknownArguments = process.argv
	.slice(2)
	.filter((argument) => !allowedArguments.has(argument));

if (unknownArguments.length > 0) {
	throw new RangeError(
		`Unknown argument${unknownArguments.length === 1 ? '' : 's'}: ${unknownArguments.join(', ')}`
	);
}

const GRID_SIZE = 512;
const TIMESTEP = 0.0005;
const MODEL_VERSION = 'tyson-fife-two-variable-v1';
const EQUATIONS_ID = 'tyson-fife-oregonator-2v-dimensionless';
const SCHNAKENBERG_MODEL_VERSION = 'schnakenberg-two-variable-v1';
const SCHNAKENBERG_EQUATIONS_ID = 'schnakenberg-2v-dimensionless';
const ENGINE_VERSION = 'bz-heun-five-point-v2';
const DISPLAY_VERSION = 'bz-display-linear-light-v2';
const STATE_CHECKSUM_ALGORITHM = 'sha256-f64le-state-v1';
const PNG_CHECKSUM_ALGORITHM = 'sha256';
const DOCUMENT_CHECKSUM_ALGORITHM = 'sha256-canonical-json-v1';
const LUMINOUS_PROFILE_ID = 'oregonator-luminous-publication-v2';
const SCIENTIFIC_PROFILE_ID = 'oregonator-scientific-publication-v2';
const TURING_SCIENTIFIC_PROFILE_ID = 'schnakenberg-scientific-publication-v2';
const LUMINOUS_PROFILE_DISCLOSURE =
	'Luminous phase and wavefront composite in linear light with fixed ranges; restrained bloom, tone mapping, and glass cues are display only.';
const SCIENTIFIC_PROFILE_DISCLOSURE =
	'Raw numerical field on a fixed scientific range; no bloom or chemical-colour claim.';
const TURING_SCIENTIFIC_PROFILE_DISCLOSURE =
	'Raw Schnakenberg u field on a fixed scientific range; the linearly verified diffusion-driven comparator remains distinct from travelling BZ waves.';
const PHASE_COORDINATE = Object.freeze({
	centreU: 0.1,
	centreV: 0.1,
	scaleU: 0.42,
	scaleV: 0.12
});

const colours = Object.freeze({
	ink: '#07090d',
	panel: '#10141b',
	panelSoft: '#171c24',
	paper: '#f3ead7',
	muted: '#aaa89f',
	line: '#343c49',
	gold: '#e4aa4a',
	red: '#d9475f',
	blue: '#5bc5df',
	violet: '#9a70ef'
});

function positiveOregonatorEquilibrium(parameters) {
	const linear = 1 - parameters.q - parameters.f;
	const discriminant = linear * linear + 4 * parameters.q * (1 + parameters.f);
	const u = (linear + Math.sqrt(discriminant)) / 2;
	return { u, v: u };
}

function oregonatorSetup({ parameters, domainSize, initialCondition }) {
	return Object.freeze({
		model: 'oregonator',
		modelVersion: MODEL_VERSION,
		equationsId: EQUATIONS_ID,
		parameters: Object.freeze({ ...parameters }),
		diffusionU: 1,
		diffusionV: 0,
		timestep: TIMESTEP,
		gridSize: GRID_SIZE,
		domainSize,
		activeRadius: domainSize * 0.46,
		boundary: 'no-flux',
		geometry: 'circular-dish',
		maskPreset: 'none',
		initialCondition,
		seed: `bz-v2-${initialCondition}-${parameters.epsilon}-${parameters.q}-${parameters.f}`
	});
}

function schnakenbergSetup() {
	return Object.freeze({
		model: 'schnakenberg',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		parameters: Object.freeze({ a: 0.1, b: 0.9, gamma: 1 }),
		diffusionU: 0.01,
		diffusionV: 0.1,
		timestep: 0.0025,
		gridSize: GRID_SIZE,
		domainSize: 20,
		activeRadius: 9.4,
		boundary: 'no-flux',
		geometry: 'circular-dish',
		maskPreset: 'none',
		initialCondition: 'turing-noise',
		seed: 'schnakenberg-spots-01'
	});
}

const targetParameters = Object.freeze({ epsilon: 0.05, q: 0.002, f: 2.4 });
const oscillatoryParameters = Object.freeze({ epsilon: 0.05, q: 0.002, f: 1.4 });
const targetEquilibrium = positiveOregonatorEquilibrium(targetParameters);
const oscillatoryEquilibrium = positiveOregonatorEquilibrium(oscillatoryParameters);

const regimeBlueprints = Object.freeze([
	Object.freeze({
		id: 'classic-target-rings',
		title: 'Classic Target Rings',
		assetTime: 14,
		assetStep: 28_000,
		setup: oregonatorSetup({
			parameters: targetParameters,
			domainSize: 120,
			initialCondition: 'periodic-source'
		}),
		interventions: Object.freeze([
			Object.freeze({
				schemaVersion: 1,
				sequence: 0,
				step: 0,
				kind: 'pacemaker',
				center: Object.freeze([0.5, 0.5]),
				radius: 0.025,
				// Retained for the shared intervention schema; state-reset ignores it,
				// but exact checkpoint/asset provenance requires the declared zero.
				amount: 0,
				sourceMode: 'state-reset',
				targetU: 0.8,
				targetV: targetEquilibrium.v * 0.75,
				strength: 1,
				periodSteps: 3_000,
				endStep: 120_000
			})
		]),
		preparationDisclosure:
			'Declared external periodic state-reset source at the dish centre; period 1.5 model-time units, scheduled through t = 60.'
	}),
	Object.freeze({
		id: 'persistent-single-spiral',
		title: 'Persistent Single Spiral',
		assetTime: 14,
		assetStep: 28_000,
		setup: oregonatorSetup({
			parameters: oscillatoryParameters,
			domainSize: 32,
			initialCondition: 'plane-wave'
		}),
		interventions: Object.freeze([
			Object.freeze({
				schemaVersion: 1,
				sequence: 0,
				step: 900,
				kind: 'cut',
				from: Object.freeze([0, 0.75]),
				to: Object.freeze([1, 0.75]),
				width: 0.25,
				targetU: oscillatoryEquilibrium.u,
				targetV: oscillatoryEquilibrium.v,
				strength: 1
			})
		]),
		preparationDisclosure:
			'Plane-wave initial state followed at t = 0.45 by a declared half-plane reset to the homogeneous recovered equilibrium.'
	}),
	Object.freeze({
		id: 'spiral-garden',
		title: 'Spiral Garden',
		assetTime: 12,
		assetStep: 24_000,
		setup: oregonatorSetup({
			parameters: oscillatoryParameters,
			domainSize: 32,
			initialCondition: 'multi-spiral-seed'
		}),
		interventions: Object.freeze([]),
		preparationDisclosure:
			'Deterministic multi-spiral phase seed; after initialization, the ordinary reaction-diffusion PDE advances every active cell.'
	}),
	Object.freeze({
		id: 'schnakenberg-turing-comparator',
		title: 'Schnakenberg Diffusion-Driven Comparator',
		assetTime: 60,
		assetStep: 24_000,
		setup: schnakenbergSetup(),
		interventions: Object.freeze([]),
		preparationDisclosure:
			'Deterministic low-amplitude noise around the reaction-stable Schnakenberg equilibrium; a resolved nonzero dispersion band is the comparison diagnostic.'
	})
]);

const assetBlueprints = Object.freeze([
	Object.freeze({
		id: 'bz-v2-hero-poster',
		filename: 'bz-v2-hero-poster.png',
		width: 1600,
		height: 1600,
		renderKind: 'hero',
		displays: Object.freeze([
			Object.freeze({
				runId: 'spiral-garden',
				view: 'luminous-composite',
				profileId: LUMINOUS_PROFILE_ID
			})
		])
	}),
	Object.freeze({
		id: 'bz-v2-visualization-card',
		filename: 'bz-v2-visualization-card.png',
		width: 1200,
		height: 800,
		renderKind: 'visualization-card',
		displays: Object.freeze([
			Object.freeze({
				runId: 'persistent-single-spiral',
				view: 'luminous-composite',
				profileId: LUMINOUS_PROFILE_ID
			})
		])
	}),
	Object.freeze({
		id: 'bz-v2-classic-target-rings-plate',
		filename: 'classic-target-rings-plate.png',
		width: 1800,
		height: 1200,
		renderKind: 'plate',
		displays: Object.freeze([
			Object.freeze({
				runId: 'classic-target-rings',
				view: 'luminous-composite',
				profileId: LUMINOUS_PROFILE_ID
			})
		])
	}),
	Object.freeze({
		id: 'bz-v2-persistent-single-spiral-plate',
		filename: 'persistent-single-spiral-plate.png',
		width: 1800,
		height: 1200,
		renderKind: 'plate',
		displays: Object.freeze([
			Object.freeze({
				runId: 'persistent-single-spiral',
				view: 'luminous-composite',
				profileId: LUMINOUS_PROFILE_ID
			})
		])
	}),
	Object.freeze({
		id: 'bz-v2-spiral-garden-plate',
		filename: 'spiral-garden-plate.png',
		width: 1800,
		height: 1200,
		renderKind: 'plate',
		displays: Object.freeze([
			Object.freeze({
				runId: 'spiral-garden',
				view: 'luminous-composite',
				profileId: LUMINOUS_PROFILE_ID
			})
		])
	}),
	Object.freeze({
		id: 'bz-v2-raw-u-vs-luminous-plate',
		filename: 'raw-u-vs-luminous-plate.png',
		width: 1800,
		height: 1200,
		renderKind: 'comparison',
		displays: Object.freeze([
			Object.freeze({
				runId: 'persistent-single-spiral',
				view: 'u',
				profileId: SCIENTIFIC_PROFILE_ID
			}),
			Object.freeze({
				runId: 'persistent-single-spiral',
				view: 'luminous-composite',
				profileId: LUMINOUS_PROFILE_ID
			})
		])
	}),
	Object.freeze({
		id: 'bz-v2-bz-versus-turing-plate',
		filename: 'bz-versus-turing-plate.png',
		width: 1800,
		height: 1200,
		renderKind: 'bz-versus-turing',
		displays: Object.freeze([
			Object.freeze({
				runId: 'persistent-single-spiral',
				view: 'luminous-composite',
				profileId: LUMINOUS_PROFILE_ID
			}),
			Object.freeze({
				runId: 'schnakenberg-turing-comparator',
				view: 'u',
				profileId: TURING_SCIENTIFIC_PROFILE_ID
			})
		])
	}),
	Object.freeze({
		id: 'bz-v2-open-graph',
		filename: 'bz-v2-open-graph.png',
		width: 1200,
		height: 630,
		renderKind: 'open-graph',
		displays: Object.freeze([
			Object.freeze({
				runId: 'spiral-garden',
				view: 'luminous-composite',
				profileId: LUMINOUS_PROFILE_ID
			})
		])
	})
]);

const scientificDisclosure =
	'Solver-generated Oregonator field, not a photograph. Interpolation, colour, exposure, bloom, tone mapping, labels, and glass cues affect presentation only; they do not generate rings or spirals and do not alter the numerical state.';

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalize(value[key])])
	);
}

function canonicalJSONStringify(value) {
	return JSON.stringify(canonicalize(value));
}

function canonicalDocumentSha256(value) {
	return sha256(Buffer.from(canonicalJSONStringify(value), 'utf8'));
}

function jsonBytes(value) {
	return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function publicPath(filename) {
	return `${publicDirectory}/${filename}`;
}

function metadataFilename(filename) {
	return filename.replace(/\.png$/u, '.metadata.json');
}

function readPngDimensions(bytes, label) {
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
		throw new TypeError(`${label} is not a PNG file.`);
	}
	if (bytes.toString('ascii', 12, 16) !== 'IHDR') {
		throw new TypeError(`${label} does not begin with a PNG IHDR chunk.`);
	}
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function assertRecord(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object.`);
	}
	return value;
}

function assertExactKeys(records, expectedIds, label) {
	const actualIds = records.map((record) => record.id).sort();
	const expected = [...expectedIds].sort();
	if (canonicalJSONStringify(actualIds) !== canonicalJSONStringify(expected)) {
		throw new Error(
			`${label} ids differ: expected ${expected.join(', ')}, found ${actualIds.join(', ')}.`
		);
	}
}

function assertSameDocument(actual, expected, label) {
	if (canonicalJSONStringify(actual) !== canonicalJSONStringify(expected)) {
		throw new Error(`${label} differs from the finalized V2 publication contract.`);
	}
}

function assertSha256(value, label) {
	if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
		throw new TypeError(`${label} must be a lowercase SHA-256 checksum.`);
	}
}

function regimeContract(regime) {
	return {
		id: regime.id,
		title: regime.title,
		setup: regime.setup,
		interventions: regime.interventions,
		modelStep: regime.assetStep,
		modelTime: regime.assetTime,
		preparationDisclosure: regime.preparationDisclosure
	};
}

function sourceContractFromMetadata(source) {
	return {
		id: source.presetId,
		title: source.presetTitle,
		setup: source.setup,
		interventions: source.interventions,
		modelStep: source.modelStep,
		modelTime: source.modelTime,
		preparationDisclosure: source.preparationDisclosure
	};
}

async function readRequired(filePath, label) {
	try {
		return await fs.readFile(filePath);
	} catch (error) {
		if (error?.code === 'ENOENT') {
			throw new Error(`${label} is missing at ${path.relative(root, filePath)}.`, { cause: error });
		}
		throw error;
	}
}

async function verifyCommittedAssets() {
	const indexBytes = await readRequired(indexPath, 'BZ V2 asset index');
	let index;
	try {
		index = JSON.parse(indexBytes.toString('utf8'));
	} catch (error) {
		throw new SyntaxError('BZ V2 asset index is not valid JSON.', { cause: error });
	}
	assertRecord(index, 'BZ V2 asset index');
	if (
		index.schemaVersion !== 1 ||
		index.kind !== 'bz-v2-publication-assets' ||
		index.generatedBy !== generatedBy ||
		index.engineVersion !== ENGINE_VERSION ||
		index.displayVersion !== DISPLAY_VERSION ||
		index.stateGrid !== GRID_SIZE ||
		index.assetDirectory !== publicDirectory ||
		index.scientificDisclosure !== scientificDisclosure
	) {
		throw new Error('BZ V2 asset index header differs from the publication contract.');
	}
	assertSameDocument(index.phaseCoordinate, PHASE_COORDINATE, 'Asset index phase coordinate');
	assertSameDocument(
		index.checksumAlgorithms,
		{
			png: PNG_CHECKSUM_ALGORITHM,
			metadata: PNG_CHECKSUM_ALGORITHM,
			state: STATE_CHECKSUM_ALGORITHM,
			canonicalDocuments: DOCUMENT_CHECKSUM_ALGORITHM
		},
		'Asset index checksum declaration'
	);
	if (!Array.isArray(index.regimes) || !Array.isArray(index.assets)) {
		throw new TypeError('BZ V2 asset index must contain regime and asset arrays.');
	}
	assertExactKeys(
		index.regimes,
		regimeBlueprints.map((regime) => regime.id),
		'Regime'
	);
	assertExactKeys(
		index.assets,
		assetBlueprints.map((asset) => asset.id),
		'Asset'
	);

	for (const blueprint of regimeBlueprints) {
		const recorded = assertRecord(
			index.regimes.find((regime) => regime.id === blueprint.id),
			`${blueprint.id} regime record`
		);
		assertSameDocument(
			{
				id: recorded.id,
				title: recorded.title,
				setup: recorded.setup,
				interventions: recorded.interventions,
				modelStep: recorded.modelStep,
				modelTime: recorded.modelTime,
				preparationDisclosure: recorded.preparationDisclosure
			},
			regimeContract(blueprint),
			`${blueprint.id} regime`
		);
		assertSha256(recorded.initialStateSha256, `${blueprint.id} initial state checksum`);
		assertSha256(recorded.stateSha256, `${blueprint.id} asset state checksum`);
		assertSha256(recorded.stateSha256AfterRendering, `${blueprint.id} post-render state checksum`);
		if (recorded.stateSha256AfterRendering !== recorded.stateSha256) {
			throw new Error(`${blueprint.id} display rendering changed the numerical state checksum.`);
		}
		assertSha256(recorded.setupSha256, `${blueprint.id} setup checksum`);
		assertSha256(recorded.interventionLogSha256, `${blueprint.id} intervention checksum`);
		if (recorded.setupSha256 !== canonicalDocumentSha256(blueprint.setup)) {
			throw new Error(`${blueprint.id} setup checksum does not match its exact setup.`);
		}
		if (recorded.interventionLogSha256 !== canonicalDocumentSha256(blueprint.interventions)) {
			throw new Error(`${blueprint.id} intervention checksum does not match its exact log.`);
		}
	}

	for (const blueprint of assetBlueprints) {
		const recorded = assertRecord(
			index.assets.find((asset) => asset.id === blueprint.id),
			`${blueprint.id} asset record`
		);
		const expectedMetadataFilename = metadataFilename(blueprint.filename);
		const expectedHeader = {
			id: blueprint.id,
			path: publicPath(blueprint.filename),
			metadataPath: publicPath(expectedMetadataFilename),
			width: blueprint.width,
			height: blueprint.height,
			format: 'png'
		};
		assertSameDocument(
			{
				id: recorded.id,
				path: recorded.path,
				metadataPath: recorded.metadataPath,
				width: recorded.width,
				height: recorded.height,
				format: recorded.format
			},
			expectedHeader,
			`${blueprint.id} index entry`
		);
		assertSameDocument(
			{
				presetIds: recorded.presetIds,
				views: recorded.views,
				displayProfileIds: recorded.displayProfileIds
			},
			{
				presetIds: [...new Set(blueprint.displays.map((display) => display.runId))],
				views: blueprint.displays.map((display) => display.view),
				displayProfileIds: [...new Set(blueprint.displays.map((display) => display.profileId))]
			},
			`${blueprint.id} indexed sources and displays`
		);
		assertSha256(recorded.sha256, `${blueprint.id} PNG checksum`);
		assertSha256(recorded.metadataSha256, `${blueprint.id} metadata checksum`);

		const pngPath = path.join(outputDirectory, blueprint.filename);
		const pngBytes = await readRequired(pngPath, `${blueprint.id} PNG`);
		const dimensions = readPngDimensions(pngBytes, blueprint.id);
		if (dimensions.width !== blueprint.width || dimensions.height !== blueprint.height) {
			throw new Error(
				`${blueprint.id} is ${dimensions.width}×${dimensions.height}; expected ${blueprint.width}×${blueprint.height}.`
			);
		}
		const pngSha256 = sha256(pngBytes);
		if (pngSha256 !== recorded.sha256) {
			throw new Error(`${blueprint.id} PNG checksum differs from its index record.`);
		}

		const metadataPath = path.join(outputDirectory, expectedMetadataFilename);
		const metadataBytes = await readRequired(metadataPath, `${blueprint.id} metadata`);
		if (sha256(metadataBytes) !== recorded.metadataSha256) {
			throw new Error(`${blueprint.id} metadata checksum differs from its index record.`);
		}
		let metadata;
		try {
			metadata = JSON.parse(metadataBytes.toString('utf8'));
		} catch (error) {
			throw new SyntaxError(`${blueprint.id} metadata is not valid JSON.`, { cause: error });
		}
		assertRecord(metadata, `${blueprint.id} metadata`);
		if (
			metadata.schemaVersion !== 1 ||
			metadata.kind !== 'bz-v2-publication-asset-metadata' ||
			metadata.generatedBy !== generatedBy ||
			metadata.engineVersion !== ENGINE_VERSION ||
			metadata.displayVersion !== DISPLAY_VERSION ||
			metadata.scientificDisclosure !== scientificDisclosure
		) {
			throw new Error(`${blueprint.id} metadata header differs from the publication contract.`);
		}
		assertSameDocument(
			metadata.asset,
			{ ...expectedHeader, sha256: pngSha256 },
			`${blueprint.id} metadata asset`
		);
		if (!Array.isArray(metadata.sources) || !Array.isArray(metadata.displays)) {
			throw new TypeError(`${blueprint.id} metadata must contain source and display arrays.`);
		}
		const expectedRunIds = [...new Set(blueprint.displays.map((display) => display.runId))];
		if (
			canonicalJSONStringify(metadata.sources.map((source) => source.presetId).sort()) !==
			canonicalJSONStringify([...expectedRunIds].sort())
		) {
			throw new Error(`${blueprint.id} metadata source regimes differ from its asset contract.`);
		}
		for (const source of metadata.sources) {
			const regime = regimeBlueprints.find((candidate) => candidate.id === source.presetId);
			if (!regime) throw new RangeError(`${blueprint.id} references an unknown source regime.`);
			assertSameDocument(
				sourceContractFromMetadata(source),
				regimeContract(regime),
				`${blueprint.id} source ${regime.id}`
			);
			assertSha256(source.initialStateSha256, `${blueprint.id} initial state checksum`);
			assertSha256(source.stateSha256, `${blueprint.id} state checksum`);
			assertSha256(source.stateSha256AfterRendering, `${blueprint.id} post-render state checksum`);
			if (source.stateSha256AfterRendering !== source.stateSha256) {
				throw new Error(`${blueprint.id} source display changed its numerical state checksum.`);
			}
			assertSha256(source.setupSha256, `${blueprint.id} source setup checksum`);
			assertSha256(source.interventionLogSha256, `${blueprint.id} source intervention checksum`);
			if (
				source.stateChecksumAlgorithm !== STATE_CHECKSUM_ALGORITHM ||
				source.canonicalDocumentChecksumAlgorithm !== DOCUMENT_CHECKSUM_ALGORITHM
			) {
				throw new Error(`${blueprint.id} source checksum declaration is invalid.`);
			}
			const indexedRun = index.regimes.find((candidate) => candidate.id === regime.id);
			if (
				source.initialStateSha256 !== indexedRun.initialStateSha256 ||
				source.stateSha256 !== indexedRun.stateSha256 ||
				source.stateSha256AfterRendering !== indexedRun.stateSha256AfterRendering ||
				source.setupSha256 !== indexedRun.setupSha256 ||
				source.interventionLogSha256 !== indexedRun.interventionLogSha256
			) {
				throw new Error(
					`${blueprint.id} source checksums differ from the indexed ${regime.id} run.`
				);
			}
		}
		const expectedDisplays = blueprint.displays.map(({ runId, view, profileId }) => ({
			runId,
			view,
			profileId
		}));
		assertSameDocument(
			metadata.displays.map(({ runId, view, profileId }) => ({ runId, view, profileId })),
			expectedDisplays,
			`${blueprint.id} display mapping`
		);
		for (const display of metadata.displays) {
			assertRecord(display.profile, `${blueprint.id} display profile`);
			const expectedProfile =
				display.profileId === LUMINOUS_PROFILE_ID
					? {
							style: 'luminous-composite',
							palette: 'ferroin',
							defaultView: 'dish',
							disclosure: LUMINOUS_PROFILE_DISCLOSURE
						}
					: display.profileId === SCIENTIFIC_PROFILE_ID
						? {
								style: 'scientific',
								palette: 'scientific',
								defaultView: 'u',
								disclosure: SCIENTIFIC_PROFILE_DISCLOSURE
							}
						: display.profileId === TURING_SCIENTIFIC_PROFILE_ID
							? {
									style: 'scientific',
									palette: 'scientific',
									defaultView: 'u',
									disclosure: TURING_SCIENTIFIC_PROFILE_DISCLOSURE
								}
							: null;
			if (!expectedProfile)
				throw new RangeError(`${blueprint.id} uses an unknown display profile.`);
			if (
				display.profile.id !== display.profileId ||
				display.profile.version !== DISPLAY_VERSION ||
				display.profile.rangeMode !== 'fixed' ||
				display.profile.style !== expectedProfile.style ||
				display.profile.palette !== expectedProfile.palette ||
				display.profile.defaultView !== expectedProfile.defaultView ||
				display.profile.interpolation !== 'mask-aware-manual-bilinear' ||
				display.profile.toneMap !== 'aces-fitted' ||
				display.profile.outputTransfer !== 'srgb' ||
				display.profile.disclosure !== expectedProfile.disclosure ||
				display.disclosure !== expectedProfile.disclosure ||
				!display.profile.ranges
			) {
				throw new Error(`${blueprint.id} contains an invalid fixed publication display profile.`);
			}
			assertSameDocument(
				display.profile.phase,
				display.profileId === TURING_SCIENTIFIC_PROFILE_ID
					? { centreU: 1, centreV: 0.9, scaleU: 0.3, scaleV: 0.15 }
					: PHASE_COORDINATE,
				`${blueprint.id} phase coordinate`
			);
		}
		console.log(
			`checked ${path.relative(root, pngPath)} · ${blueprint.width}×${blueprint.height} · ${pngSha256}`
		);
	}

	console.log(
		`BZ V2 publication assets and adjacent metadata are current (${assetBlueprints.length} PNGs).`
	);
}

function escapeXml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function svgBuffer(width, height, body) {
	return Buffer.from(
		`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
		<style>
		.title{font-family:Georgia,'Times New Roman',serif;font-weight:700;fill:${colours.paper}}
		.sans{font-family:Arial,Helvetica,sans-serif;fill:${colours.paper}}
		.mono{font-family:'Courier New',monospace;fill:${colours.muted};letter-spacing:1.6px}
		</style>${body}</svg>`,
		'utf8'
	);
}

function formatParameters(parameters) {
	return `ε ${parameters.epsilon} · q ${parameters.q} · f ${parameters.f}`;
}

function wrappedSvgText(value, x, y, maximumCharacters, lineHeight) {
	const words = String(value).split(/\s+/u);
	const lines = [];
	let line = '';
	for (const word of words) {
		const candidate = line ? `${line} ${word}` : word;
		if (line && candidate.length > maximumCharacters) {
			lines.push(line);
			line = word;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	return `<text class="sans" x="${x}" y="${y}" font-size="24" style="fill:${colours.muted}">${lines
		.map(
			(entry, index) =>
				`<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(entry)}</tspan>`
		)
		.join('')}</text>`;
}

function profileRecord(profile) {
	return JSON.parse(JSON.stringify(profile));
}

async function pngFromRaw(sharp, pixels) {
	return sharp(Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength), {
		raw: { width: pixels.width, height: pixels.height, channels: 4 }
	})
		.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
		.toBuffer();
}

async function resizePng(sharp, input, width, height = width) {
	return sharp(input)
		.resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
		.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
		.toBuffer();
}

async function composePng(sharp, svg, composites) {
	return sharp(svg)
		.composite(composites)
		.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
		.toBuffer();
}

function plateShell(asset, regime) {
	const { width, height } = asset;
	const accent =
		regime.id === 'classic-target-rings'
			? colours.gold
			: regime.id === 'persistent-single-spiral'
				? colours.red
				: colours.violet;
	return svgBuffer(
		width,
		height,
		`<rect width="${width}" height="${height}" fill="${colours.ink}"/>
		<rect x="0" y="0" width="14" height="${height}" fill="${accent}"/>
		<rect x="64" y="102" width="1036" height="1036" rx="10" fill="${colours.panel}" stroke="${colours.line}"/>
		<text class="mono" x="1160" y="132" font-size="18">OREGONATOR V2 · SOLVER OUTPUT</text>
		<text class="title" x="1160" y="226" font-size="42">${escapeXml(regime.title)}</text>
		<line x1="1160" y1="276" x2="1734" y2="276" stroke="${colours.line}"/>
		<text class="sans" x="1160" y="350" font-size="26">512² scientific state</text>
		<text class="sans" x="1160" y="397" font-size="26">model time t = ${regime.modelTime}</text>
		<text class="mono" x="1160" y="470" font-size="18">${escapeXml(formatParameters(regime.setup.parameters))}</text>
		<text class="mono" x="1160" y="510" font-size="18">L ${regime.setup.domainSize} · Δt ${regime.setup.timestep}</text>
		<text class="mono" x="1160" y="550" font-size="18">CIRCULAR NO-FLUX DISH</text>
		${wrappedSvgText(regime.preparationDisclosure, 1160, 650, 43, 36)}
		<line x1="1160" y1="996" x2="1734" y2="996" stroke="${colours.line}"/>
		<text class="mono" x="1160" y="1044" font-size="16">LUMINOUS FIXED-RANGE DISPLAY</text>
		<text class="sans" x="1160" y="1094" font-size="19" style="fill:${colours.muted}">Colour, bloom and glass are display only.</text>`
	);
}

async function renderHero(sharp, asset, garden, gardenDish) {
	const shell = svgBuffer(
		asset.width,
		asset.height,
		`<defs><radialGradient id="bg" cx="50%" cy="43%" r="68%"><stop offset="0" stop-color="${colours.panelSoft}"/><stop offset="1" stop-color="${colours.ink}"/></radialGradient></defs>
		<rect width="${asset.width}" height="${asset.height}" fill="url(#bg)"/>
		<rect x="0" y="0" width="${asset.width}" height="14" fill="${colours.red}"/>
		<text class="mono" x="800" y="62" text-anchor="middle" font-size="17">SOLVER-GENERATED OREGONATOR FIELD · 512² · t = ${garden.modelTime}</text>
		<text class="title" x="800" y="132" text-anchor="middle" font-size="64">The Luminous Clock</text>
		<line x1="224" y1="1500" x2="1376" y2="1500" stroke="${colours.line}"/>
		<text class="sans" x="800" y="1540" text-anchor="middle" font-size="24">Belousov–Zhabotinsky Laboratory · Spiral Garden</text>
		<text class="mono" x="800" y="1572" text-anchor="middle" font-size="13">REPRESENTATIVE LUMINOUS DISPLAY · NOT A CHEMICAL PHOTOGRAPH</text>`
	);
	return composePng(sharp, shell, [{ input: gardenDish, left: 140, top: 150 }]);
}

async function renderPlate(sharp, asset, regime, dish) {
	return composePng(sharp, plateShell(asset, regime), [{ input: dish, left: 82, top: 120 }]);
}

async function renderComparison(sharp, asset, spiral, rawDish, luminousDish) {
	const shell = svgBuffer(
		asset.width,
		asset.height,
		`<rect width="${asset.width}" height="${asset.height}" fill="${colours.ink}"/>
		<rect x="0" y="0" width="14" height="${asset.height}" fill="${colours.blue}"/>
		<text class="mono" x="70" y="58" font-size="17">ONE NUMERICAL STATE · TWO DISPLAY TRANSFORMATIONS</text>
		<text class="title" x="70" y="126" font-size="58">Raw u versus luminous phase composite</text>
		<rect x="62" y="176" width="804" height="804" rx="8" fill="${colours.panel}" stroke="${colours.line}"/>
		<rect x="934" y="176" width="804" height="804" rx="8" fill="${colours.panel}" stroke="${colours.line}"/>
		<text class="mono" x="464" y="1026" text-anchor="middle" font-size="18" style="fill:${colours.blue}">RAW FAST FIELD u · FIXED RANGE</text>
		<text class="mono" x="1336" y="1026" text-anchor="middle" font-size="18" style="fill:${colours.gold}">LUMINOUS COMPOSITE · FIXED RANGE</text>
		<text class="sans" x="900" y="1083" text-anchor="middle" font-size="21">Same Float64 state · ${escapeXml(spiral.title)} · 512² · t = ${spiral.modelTime}</text>
		<text class="mono" x="900" y="1126" text-anchor="middle" font-size="14">INTERPOLATION AND COLOUR DO NOT ALTER THE PDE STATE</text>`
	);
	return composePng(sharp, shell, [
		{ input: rawDish, left: 64, top: 178 },
		{ input: luminousDish, left: 936, top: 178 }
	]);
}

async function renderVisualizationCard(sharp, asset, spiral, spiralDish) {
	const shell = svgBuffer(
		asset.width,
		asset.height,
		`<defs><linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colours.ink}"/><stop offset="1" stop-color="${colours.panelSoft}"/></linearGradient></defs>
		<rect width="${asset.width}" height="${asset.height}" fill="url(#card)"/>
		<rect x="0" y="0" width="12" height="${asset.height}" fill="${colours.red}"/>
		<text class="mono" x="70" y="96" font-size="17">INTERACTIVE NUMERICAL EXHIBIT · OREGONATOR V2</text>
		<text class="title" x="70" y="184" font-size="56">Chemical waves</text>
		<text class="title" x="70" y="248" font-size="56" style="fill:${colours.gold}">with receipts</text>
		<line x1="70" y1="292" x2="515" y2="292" stroke="${colours.line}"/>
		<text class="sans" x="70" y="350" font-size="25">Persistent Single Spiral</text>
		<text class="mono" x="70" y="397" font-size="15">512² · FIXED-STEP HEUN · t = ${spiral.modelTime}</text>
		<text class="sans" x="70" y="670" font-size="18" style="fill:${colours.muted}">Solver state · representative luminous display</text>
		<text class="mono" x="70" y="708" font-size="13">NOT A CHEMICAL PHOTOGRAPH</text>`
	);
	return composePng(sharp, shell, [{ input: spiralDish, left: 540, top: 40 }]);
}

async function renderBzVersusTuring(sharp, asset, bzRun, turingRun, bzDish, turingDish) {
	const shell = svgBuffer(
		asset.width,
		asset.height,
		`<rect width="${asset.width}" height="${asset.height}" fill="${colours.ink}"/>
		<rect x="0" y="0" width="14" height="${asset.height}" fill="${colours.violet}"/>
		<text class="mono" x="70" y="58" font-size="17">TWO REACTION–DIFFUSION SYSTEMS · DIFFERENT DIAGNOSTICS</text>
		<text class="title" x="70" y="126" font-size="58">Travelling BZ wave versus diffusion-driven structure</text>
		<rect x="62" y="176" width="804" height="804" rx="8" fill="${colours.panel}" stroke="${colours.line}"/>
		<rect x="934" y="176" width="804" height="804" rx="8" fill="${colours.panel}" stroke="${colours.line}"/>
		<text class="mono" x="464" y="1026" text-anchor="middle" font-size="18" style="fill:${colours.red}">OREGONATOR · ROTATING WAVE · t = ${bzRun.modelTime}</text>
		<text class="mono" x="1336" y="1026" text-anchor="middle" font-size="18" style="fill:${colours.blue}">SCHNAKENBERG u · FIXED RANGE · t = ${turingRun.modelTime}</text>
		<text class="sans" x="900" y="1083" text-anchor="middle" font-size="20">The right-hand equilibrium is reaction-stable with a resolved nonzero growing diffusion band.</text>
		<text class="mono" x="900" y="1126" text-anchor="middle" font-size="14">VISUAL RESEMBLANCE IS NOT A SHARED MECHANISM</text>`
	);
	return composePng(sharp, shell, [
		{ input: bzDish, left: 64, top: 178 },
		{ input: turingDish, left: 936, top: 178 }
	]);
}

async function renderOpenGraph(sharp, asset, garden, gardenDish) {
	const shell = svgBuffer(
		asset.width,
		asset.height,
		`<defs><linearGradient id="og" x1="0" x2="1"><stop offset="0" stop-color="${colours.ink}"/><stop offset="1" stop-color="${colours.panelSoft}"/></linearGradient></defs>
		<rect width="${asset.width}" height="${asset.height}" fill="url(#og)"/>
		<rect x="0" y="0" width="16" height="${asset.height}" fill="${colours.red}"/>
		<line x1="575" y1="0" x2="575" y2="630" stroke="${colours.line}"/>
		<text class="mono" x="58" y="76" font-size="16">NUMERICAL EXHIBIT · OREGONATOR</text>
		<text class="title" x="58" y="164" font-size="60">THE LUMINOUS</text>
		<text class="title" x="58" y="228" font-size="60" style="fill:${colours.gold}">CLOCK</text>
		<text class="sans" x="58" y="290" font-size="27">Belousov–Zhabotinsky</text>
		<text class="sans" x="58" y="328" font-size="27">reaction–diffusion laboratory</text>
		<line x1="58" y1="382" x2="500" y2="382" stroke="${colours.line}"/>
		<text class="mono" x="58" y="430" font-size="15">SPIRAL GARDEN · 512² STATE</text>
		<text class="mono" x="58" y="464" font-size="15">FIXED-STEP HEUN · t = ${garden.modelTime}</text>
		<text class="sans" x="58" y="548" font-size="17" style="fill:${colours.muted}">Solver output · representative luminous colour</text>`
	);
	return composePng(sharp, shell, [{ input: gardenDish, left: 586, top: 12 }]);
}

function generatedTimestamp() {
	const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
	if (sourceDateEpoch !== undefined) {
		const seconds = Number(sourceDateEpoch);
		if (!Number.isFinite(seconds) || seconds < 0) {
			throw new RangeError('SOURCE_DATE_EPOCH must be a non-negative number of seconds.');
		}
		return new Date(seconds * 1000).toISOString();
	}
	return new Date().toISOString();
}

async function loadPublicationRuntime() {
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

async function generateAssets() {
	const generatedAt = generatedTimestamp();
	const { sharp, bz } = await loadPublicationRuntime();
	const requiredFunctions = [
		'BZFastCpuSolver',
		'createBZRenderProfileV2',
		'renderBZPublicationPixelBufferV2',
		'checksumBZFloat64State'
	];
	for (const name of requiredFunctions) {
		if (typeof bz[name] !== 'function')
			throw new TypeError(`BZ publication runtime is missing ${name}.`);
	}
	if (bz.BZ_V2_ENGINE_VERSION !== ENGINE_VERSION || bz.BZ_V2_DISPLAY_VERSION !== DISPLAY_VERSION) {
		throw new Error('The BZ V2 engine or display version differs from the publication contract.');
	}

	const luminousProfile = bz.createBZRenderProfileV2({
		id: LUMINOUS_PROFILE_ID,
		title: 'Oregonator luminous publication profile',
		style: 'luminous-composite',
		palette: 'ferroin',
		phase: PHASE_COORDINATE,
		disclosure: LUMINOUS_PROFILE_DISCLOSURE
	});
	const scientificProfile = bz.createBZRenderProfileV2({
		id: SCIENTIFIC_PROFILE_ID,
		title: 'Oregonator scientific publication profile',
		style: 'scientific',
		palette: 'scientific',
		defaultView: 'u',
		phase: PHASE_COORDINATE,
		bloom: 0,
		highlight: 0,
		saturation: 1,
		exposure: 1,
		contrast: 1,
		disclosure: SCIENTIFIC_PROFILE_DISCLOSURE
	});
	const turingScientificProfile = bz.createBZRenderProfileV2({
		id: TURING_SCIENTIFIC_PROFILE_ID,
		title: 'Schnakenberg scientific publication profile',
		style: 'scientific',
		palette: 'scientific',
		defaultView: 'u',
		phase: { centreU: 1, centreV: 0.9, scaleU: 0.3, scaleV: 0.15 },
		ranges: {
			...scientificProfile.ranges,
			u: { minimum: 0.7, maximum: 1.32, units: 'dimensionless' },
			v: { minimum: 0.75, maximum: 1.05, units: 'dimensionless' },
			'difference-from-mean': {
				minimum: -0.32,
				maximum: 0.32,
				units: 'dimensionless'
			}
		},
		bloom: 0,
		highlight: 0,
		saturation: 1,
		exposure: 1,
		contrast: 1,
		disclosure: TURING_SCIENTIFIC_PROFILE_DISCLOSURE
	});
	const profiles = new Map([
		[luminousProfile.id, luminousProfile],
		[scientificProfile.id, scientificProfile],
		[turingScientificProfile.id, turingScientificProfile]
	]);

	const runs = new Map();
	for (const blueprint of regimeBlueprints) {
		console.log(
			`replaying ${blueprint.id} · ${blueprint.setup.gridSize}² · ${blueprint.assetStep.toLocaleString('en-US')} steps · t = ${blueprint.assetTime}`
		);
		const solver = new bz.BZFastCpuSolver(blueprint.setup, {
			interventions: blueprint.interventions
		});
		const initialStateSha256 = await bz.checksumBZFloat64State(solver.state);
		solver.step(blueprint.assetStep);
		if (solver.stepIndex !== blueprint.assetStep || solver.modelTime !== blueprint.assetTime) {
			throw new Error(`${blueprint.id} replay stopped at an unexpected step or model time.`);
		}
		const state = solver.snapshot();
		const stateSha256 = await bz.checksumBZFloat64State(state);
		runs.set(blueprint.id, {
			...regimeContract(blueprint),
			initialStateSha256,
			stateSha256,
			setupSha256: canonicalDocumentSha256(blueprint.setup),
			interventionLogSha256: canonicalDocumentSha256(blueprint.interventions),
			state
		});
		console.log(`${blueprint.id} state SHA-256 ${stateSha256}`);
	}

	const renderCache = new Map();
	const renderDish = async (runId, profileId, view, size) => {
		const key = `${runId}:${profileId}:${view}:${size}`;
		if (renderCache.has(key)) return renderCache.get(key);
		const run = runs.get(runId);
		const profile = profiles.get(profileId);
		if (!run || !profile) throw new RangeError(`Unknown render source ${key}.`);
		const pixels = bz.renderBZPublicationPixelBufferV2(run.state, run.setup, {
			profile,
			view,
			width: size,
			height: size,
			rangeMode: 'fixed',
			interpolation: 'mask-aware-bilinear',
			bloom: profileId === LUMINOUS_PROFILE_ID,
			glass: true
		});
		const png = await pngFromRaw(sharp, pixels);
		renderCache.set(key, png);
		return png;
	};

	const gardenLarge = await renderDish(
		'spiral-garden',
		LUMINOUS_PROFILE_ID,
		'luminous-composite',
		1320
	);
	const targetLarge = await renderDish(
		'classic-target-rings',
		LUMINOUS_PROFILE_ID,
		'luminous-composite',
		1000
	);
	const spiralLarge = await renderDish(
		'persistent-single-spiral',
		LUMINOUS_PROFILE_ID,
		'luminous-composite',
		1000
	);
	const spiralRaw = await renderDish('persistent-single-spiral', SCIENTIFIC_PROFILE_ID, 'u', 800);
	const spiralLuminous = await resizePng(sharp, spiralLarge, 800);
	const spiralCard = await resizePng(sharp, spiralLarge, 720);
	const turingScientific = await renderDish(
		'schnakenberg-turing-comparator',
		TURING_SCIENTIFIC_PROFILE_ID,
		'u',
		800
	);
	const gardenPlate = await resizePng(sharp, gardenLarge, 1000);
	const gardenOg = await resizePng(sharp, gardenLarge, 606);
	for (const source of runs.values()) {
		source.stateSha256AfterRendering = await bz.checksumBZFloat64State(source.state);
		if (source.stateSha256AfterRendering !== source.stateSha256) {
			throw new Error(`${source.id} display rendering changed the Float64 numerical state.`);
		}
	}
	const run = (id) => runs.get(id);
	const assetPngs = new Map();
	for (const asset of assetBlueprints) {
		let png;
		if (asset.renderKind === 'hero') {
			png = await renderHero(sharp, asset, run('spiral-garden'), gardenLarge);
		} else if (asset.renderKind === 'visualization-card') {
			png = await renderVisualizationCard(
				sharp,
				asset,
				run('persistent-single-spiral'),
				spiralCard
			);
		} else if (asset.renderKind === 'comparison') {
			png = await renderComparison(
				sharp,
				asset,
				run('persistent-single-spiral'),
				spiralRaw,
				spiralLuminous
			);
		} else if (asset.renderKind === 'bz-versus-turing') {
			png = await renderBzVersusTuring(
				sharp,
				asset,
				run('persistent-single-spiral'),
				run('schnakenberg-turing-comparator'),
				spiralLuminous,
				turingScientific
			);
		} else if (asset.renderKind === 'open-graph') {
			png = await renderOpenGraph(sharp, asset, run('spiral-garden'), gardenOg);
		} else {
			const display = asset.displays[0];
			const dish =
				display.runId === 'classic-target-rings'
					? targetLarge
					: display.runId === 'persistent-single-spiral'
						? spiralLarge
						: gardenPlate;
			png = await renderPlate(sharp, asset, run(display.runId), dish);
		}
		const dimensions = readPngDimensions(png, asset.id);
		if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
			throw new Error(`${asset.id} rendered at an unexpected size.`);
		}
		assetPngs.set(asset.id, png);
	}

	await fs.mkdir(outputDirectory, { recursive: true });
	const indexAssets = [];
	for (const asset of assetBlueprints) {
		const png = assetPngs.get(asset.id);
		const pngSha256 = sha256(png);
		const metadataName = metadataFilename(asset.filename);
		const sourceIds = [...new Set(asset.displays.map((display) => display.runId))];
		const metadata = {
			schemaVersion: 1,
			kind: 'bz-v2-publication-asset-metadata',
			generatedAt,
			generatedBy,
			generationCommand,
			engineVersion: ENGINE_VERSION,
			displayVersion: DISPLAY_VERSION,
			asset: {
				id: asset.id,
				path: publicPath(asset.filename),
				metadataPath: publicPath(metadataName),
				width: asset.width,
				height: asset.height,
				format: 'png',
				sha256: pngSha256
			},
			sources: sourceIds.map((id) => {
				const source = runs.get(id);
				return {
					presetId: source.id,
					presetTitle: source.title,
					modelStep: source.modelStep,
					modelTime: source.modelTime,
					setup: source.setup,
					interventions: source.interventions,
					initialStateSha256: source.initialStateSha256,
					stateSha256: source.stateSha256,
					stateSha256AfterRendering: source.stateSha256AfterRendering,
					stateChecksumAlgorithm: STATE_CHECKSUM_ALGORITHM,
					setupSha256: source.setupSha256,
					interventionLogSha256: source.interventionLogSha256,
					canonicalDocumentChecksumAlgorithm: DOCUMENT_CHECKSUM_ALGORITHM,
					preparationDisclosure: source.preparationDisclosure
				};
			}),
			displays: asset.displays.map((display) => {
				const profile = profiles.get(display.profileId);
				return {
					runId: display.runId,
					view: display.view,
					profileId: profile.id,
					profile: profileRecord(profile),
					disclosure: profile.disclosure
				};
			}),
			scientificDisclosure,
			provenance: {
				node: process.version,
				platform: `${process.platform}-${process.arch}`,
				sharp: sharp.versions.sharp,
				libvips: sharp.versions.vips
			}
		};
		const metadataBytes = jsonBytes(metadata);
		await Promise.all([
			fs.writeFile(path.join(outputDirectory, asset.filename), png),
			fs.writeFile(path.join(outputDirectory, metadataName), metadataBytes)
		]);
		indexAssets.push({
			id: asset.id,
			path: publicPath(asset.filename),
			metadataPath: publicPath(metadataName),
			width: asset.width,
			height: asset.height,
			format: 'png',
			sha256: pngSha256,
			metadataSha256: sha256(metadataBytes),
			presetIds: sourceIds,
			views: asset.displays.map((display) => display.view),
			displayProfileIds: [...new Set(asset.displays.map((display) => display.profileId))]
		});
		console.log(
			`wrote ${path.relative(root, path.join(outputDirectory, asset.filename))} · ${asset.width}×${asset.height} · ${png.byteLength} bytes · ${pngSha256}`
		);
	}

	const index = {
		schemaVersion: 1,
		kind: 'bz-v2-publication-assets',
		generatedAt,
		generatedBy,
		generationCommand,
		engineVersion: ENGINE_VERSION,
		displayVersion: DISPLAY_VERSION,
		stateGrid: GRID_SIZE,
		assetDirectory: publicDirectory,
		phaseCoordinate: PHASE_COORDINATE,
		checksumAlgorithms: {
			png: PNG_CHECKSUM_ALGORITHM,
			metadata: PNG_CHECKSUM_ALGORITHM,
			state: STATE_CHECKSUM_ALGORITHM,
			canonicalDocuments: DOCUMENT_CHECKSUM_ALGORITHM
		},
		regimes: [...runs.values()].map((source) => ({
			id: source.id,
			title: source.title,
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
		})),
		assets: indexAssets,
		scientificDisclosure
	};
	await fs.writeFile(indexPath, jsonBytes(index));
	console.log(`wrote ${path.relative(root, indexPath)} · ${indexAssets.length} indexed assets`);
	console.log(
		'Run `node scripts/render-bz-v2-assets.mjs --check` to verify the committed files without replaying a solver.'
	);
}

function printHelp() {
	console.log(
		`Usage: node scripts/render-bz-v2-assets.mjs [--check]\n\n` +
			`Without arguments, replays the three finalized Oregonator heroes and one Schnakenberg comparator at 512², then writes eight publication PNGs plus adjacent metadata.\n` +
			`--check verifies the committed PNG dimensions, hashes, metadata, exact regime contract, and display disclosures without loading or running a solver.`
	);
}

if (helpOnly) {
	printHelp();
} else if (checkOnly) {
	await verifyCommittedAssets();
} else {
	await generateAssets();
}
