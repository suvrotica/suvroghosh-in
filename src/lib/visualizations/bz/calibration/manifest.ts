import rawManifest from '../../../../../static/data/bz-v2-calibration.json';
import {
	canonicalBZJSONStringify,
	type BZCheckpointProvenanceDescriptorV1
} from '../checkpoints/codec';
import { orderedBZInterventions } from '../interventions';
import type { BZIntervention, BZPalette, BZSetup, BZViewMode, CalibrationStatus } from '../types';
import { assertValidBZSetup, cloneBZSetup } from '../validation';
import {
	BZ_V2_CHECKPOINT_VERSION,
	BZ_V2_DISPLAY_VERSION,
	BZ_V2_ENGINE_VERSION,
	BZ_V2_SCHEMA_VERSION,
	type BZAssetRecordV2,
	type BZCalibrationManifestV2,
	type BZCalibrationRecordV2,
	type BZDisplayProfileV2,
	type BZObservationWindowV2,
	type BZPerformanceReportV2,
	type BZPresetV2
} from '../v2-types';

const ROOT_KEYS = [
	'schemaVersion',
	'engineVersion',
	'displayVersion',
	'generatedAt',
	'generatedBy',
	'literatureBasis',
	'numericalMethod',
	'boundaryMethod',
	'checksumAlgorithms',
	'search',
	'displayProfiles',
	'presets',
	'calibrations',
	'checkpoints',
	'assets',
	'performance',
	'articleClaims'
] as const;

const PERFORMANCE_KEYS = [
	'browser',
	'gpu',
	'stateGrid',
	'displayResolution',
	'durationSeconds',
	'medianFps',
	'medianStepsPerSecond',
	'telemetryHz',
	'fullStateReadbacks',
	'scientificTextureBytes',
	'displayTextureBytes',
	'notes'
] as const;

const CPU_GPU_UNMEASURED_KEYS = ['status', 'pass', 'reason', 'observables'] as const;
const CPU_GPU_MEASURED_KEYS = [
	'status',
	'pass',
	'evidencePath',
	'evidenceSha256',
	'grid',
	'modelStep',
	'modelTime',
	'cpuPrecision',
	'gpuPrecision',
	'textureFormat',
	'scopeKind',
	'scope',
	'numericalCases',
	'displayCases',
	'observables'
] as const;
const REQUIRED_NUMERICAL_PARITY_CASE_IDS = new Set([
	'declared-intervention-schedule-64',
	'mature-checkpoint-upload',
	'mature-checkpoint-continuation'
]);
const REQUIRED_DISPLAY_PARITY_CASE_IDS = new Set([
	'scientific-u',
	'luminous-publication',
	'ferroin-representative',
	'phase-spectrum'
]);

const EXPECTED_CHECKSUM_ALGORITHMS = Object.freeze({
	checkpointFile: 'sha256-bzcp-complete-v1',
	cpuReferenceState: 'sha256-f64le-state-v1',
	browserCheckpointState: 'sha256-f32le-state-v1',
	canonicalDocuments: 'sha256-canonical-json-v1',
	assets: 'sha256'
});

const HEX_SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u;
const STATUS = new Set<CalibrationStatus>(['candidate', 'validated', 'rejected']);
const SOURCE_SEMANTICS = new Set([
	'none',
	'finite-initial-perturbation',
	'declared-periodic-external-source',
	'autonomous-heterogeneous-source'
]);
const PALETTES = new Set<BZPalette>([
	'ferroin',
	'cerium',
	'phase-spectrum',
	'scientific',
	'high-contrast'
]);
// V2 display modes are included here before all of them are exposed by the V1
// BZViewMode union. Keeping the manifest validator forward-compatible avoids a
// second list of calibrated ranges or view defaults elsewhere in the runtime.
const VIEWS = new Set<string>([
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
]);

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object.`);
	}
	return value as UnknownRecord;
}

function array(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
	return value;
}

function text(value: unknown, label: string, maximum = 10_000): string {
	if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
		throw new RangeError(`${label} must be a non-empty string.`);
	}
	return value;
}

function stableId(value: unknown, label: string): string {
	const result = text(value, label, 128);
	if (!SAFE_ID.test(result))
		throw new RangeError(`${label} must be a lowercase stable identifier.`);
	return result;
}

function finite(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new RangeError(`${label} must be finite.`);
	}
	return value;
}

function nonNegative(value: unknown, label: string): number {
	const result = finite(value, label);
	if (result < 0) throw new RangeError(`${label} must be non-negative.`);
	return result;
}

function positive(value: unknown, label: string): number {
	const result = finite(value, label);
	if (result <= 0) throw new RangeError(`${label} must be positive.`);
	return result;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
	if (!Number.isSafeInteger(value) || (value as number) < minimum) {
		throw new RangeError(`${label} must be a safe integer greater than or equal to ${minimum}.`);
	}
	return value as number;
}

function boolean(value: unknown, label: string): boolean {
	if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean.`);
	return value;
}

function sha256(value: unknown, label: string, nullable = false): string | null {
	if (nullable && value === null) return null;
	if (typeof value !== 'string' || !HEX_SHA256.test(value)) {
		throw new RangeError(`${label} must be a lowercase SHA-256 digest.`);
	}
	return value;
}

function timestamp(value: unknown, label: string): string {
	const result = text(value, label, 64);
	if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) {
		throw new RangeError(`${label} must be an ISO-8601 UTC timestamp.`);
	}
	return result;
}

function status(value: unknown, label: string): CalibrationStatus {
	if (typeof value !== 'string' || !STATUS.has(value as CalibrationStatus)) {
		throw new RangeError(`${label} is unsupported.`);
	}
	return value as CalibrationStatus;
}

function exactKeys(value: Readonly<UnknownRecord>, keys: readonly string[], label: string): void {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
		throw new RangeError(`${label} does not match the V2 manifest schema.`);
	}
}

function setup(value: unknown, label: string): BZSetup {
	const candidate = record(value, label) as unknown as BZSetup;
	assertValidBZSetup(candidate);
	return cloneBZSetup(candidate);
}

function interventions(value: unknown, label: string): readonly BZIntervention[] {
	const source = array(value, label) as unknown as BZIntervention[];
	const ordered = orderedBZInterventions(source);
	if (canonicalBZJSONStringify(source) !== canonicalBZJSONStringify(ordered)) {
		throw new RangeError(`${label} must be in canonical step and sequence order.`);
	}
	return ordered;
}

function observationWindow(value: unknown, label: string): BZObservationWindowV2 {
	const candidate = record(value, label);
	const result: BZObservationWindowV2 = {
		startStep: safeInteger(candidate.startStep, `${label} start step`),
		endStep: safeInteger(candidate.endStep, `${label} end step`),
		startTime: nonNegative(candidate.startTime, `${label} start time`),
		endTime: nonNegative(candidate.endTime, `${label} end time`),
		sampleEverySteps: safeInteger(candidate.sampleEverySteps, `${label} sample interval`, 1)
	};
	if (result.endStep <= result.startStep || result.endTime <= result.startTime) {
		throw new RangeError(`${label} must have a non-empty increasing interval.`);
	}
	return result;
}

function assertWindowMatchesSetup(
	window: Readonly<BZObservationWindowV2>,
	modelSetup: Readonly<BZSetup>,
	label: string
): void {
	if (
		!Object.is(window.startTime, window.startStep * modelSetup.timestep) ||
		!Object.is(window.endTime, window.endStep * modelSetup.timestep)
	) {
		throw new RangeError(`${label} times must equal step × the fixed setup timestep.`);
	}
}

function checkpoint(value: unknown, label: string): BZCheckpointProvenanceDescriptorV1 {
	const candidate = record(value, label);
	const id = stableId(candidate.id, `${label} id`);
	const sourcePresetId = stableId(candidate.sourcePresetId, `${label} source preset id`);
	if (
		candidate.version !== BZ_V2_CHECKPOINT_VERSION ||
		candidate.encoding !== 'bzcp-f32le-v1' ||
		candidate.losslessForStoredRepresentation !== true
	) {
		throw new RangeError(`${label} has an unsupported checkpoint encoding.`);
	}
	const path = text(candidate.path, `${label} path`, 1_024);
	if (!path.startsWith('/') || path.includes('..')) {
		throw new RangeError(`${label} path must be absolute and traversal-free.`);
	}
	const width = safeInteger(candidate.width, `${label} width`, 2);
	const height = safeInteger(candidate.height, `${label} height`, 2);
	if (width !== height) throw new RangeError(`${label} must use a square BZ state grid.`);
	const modelStep = safeInteger(candidate.modelStep, `${label} model step`);
	const modelTime = nonNegative(candidate.modelTime, `${label} model time`);
	const byteLength = safeInteger(candidate.byteLength, `${label} byte length`, 1);
	if (candidate.engineVersion !== BZ_V2_ENGINE_VERSION) {
		throw new RangeError(`${label} engine version is unsupported.`);
	}
	const checkpointSetup = setup(candidate.setup, `${label} setup`);
	if (
		candidate.seed !== checkpointSetup.seed ||
		candidate.modelVersion !== checkpointSetup.modelVersion ||
		candidate.equationsId !== checkpointSetup.equationsId
	) {
		throw new RangeError(`${label} model, seed or setup provenance is inconsistent.`);
	}
	if (checkpointSetup.gridSize !== width) {
		throw new RangeError(`${label} setup and stored-state grid sizes differ.`);
	}
	const checkpointInterventions = interventions(candidate.interventions, `${label} interventions`);
	return {
		id,
		sourcePresetId,
		version: BZ_V2_CHECKPOINT_VERSION,
		path,
		encoding: 'bzcp-f32le-v1',
		losslessForStoredRepresentation: true,
		width,
		height,
		modelStep,
		modelTime,
		byteLength,
		sha256: sha256(candidate.sha256, `${label} file checksum`) as string,
		fieldSha256F64Reference: sha256(
			candidate.fieldSha256F64Reference,
			`${label} CPU Float64 checksum`
		),
		setupChecksum: sha256(candidate.setupChecksum, `${label} setup checksum`) as string,
		interventionLogChecksum: sha256(
			candidate.interventionLogChecksum,
			`${label} intervention log checksum`
		) as string,
		browserStateSha256: sha256(
			candidate.browserStateSha256,
			`${label} browser Float32 checksum`
		) as string,
		engineVersion: BZ_V2_ENGINE_VERSION,
		generatedBy: text(candidate.generatedBy, `${label} generator`, 256),
		generatedAt: timestamp(candidate.generatedAt, `${label} generation time`),
		setup: checkpointSetup,
		seed: checkpointSetup.seed,
		interventions: checkpointInterventions,
		modelVersion: checkpointSetup.modelVersion,
		equationsId: checkpointSetup.equationsId,
		validationRecordId: stableId(candidate.validationRecordId, `${label} validation record id`)
	};
}

function displayProfile(value: unknown, label: string): BZDisplayProfileV2 {
	const candidate = record(value, label);
	stableId(candidate.id, `${label} id`);
	text(candidate.title, `${label} title`, 256);
	if (candidate.version !== BZ_V2_DISPLAY_VERSION) {
		throw new RangeError(`${label} display version is unsupported.`);
	}
	if (
		candidate.style !== 'luminous-composite' &&
		candidate.style !== 'ferroin-proxy' &&
		candidate.style !== 'phase-spectrum' &&
		candidate.style !== 'scientific'
	) {
		throw new RangeError(`${label} style is unsupported.`);
	}
	if (!PALETTES.has(candidate.palette as BZPalette)) {
		throw new RangeError(`${label} palette is unsupported.`);
	}
	if (typeof candidate.defaultView !== 'string' || !VIEWS.has(candidate.defaultView)) {
		throw new RangeError(`${label} default view is unsupported.`);
	}
	if (
		candidate.rangeMode !== 'fixed' &&
		candidate.rangeMode !== 'global' &&
		candidate.rangeMode !== 'auto'
	) {
		throw new RangeError(`${label} range mode is unsupported.`);
	}
	const ranges = record(candidate.ranges, `${label} ranges`);
	for (const [name, rawRange] of Object.entries(ranges)) {
		const range = record(rawRange, `${label} ${name} range`);
		const minimum = finite(range.minimum, `${label} ${name} minimum`);
		const maximum = finite(range.maximum, `${label} ${name} maximum`);
		if (maximum <= minimum) throw new RangeError(`${label} ${name} range must increase.`);
		if (
			range.units !== 'dimensionless' &&
			range.units !== 'dimensionless-rate' &&
			range.units !== 'radians'
		) {
			throw new RangeError(`${label} ${name} range units are unsupported.`);
		}
	}
	if (candidate.rangeMode === 'fixed' && Object.keys(ranges).length === 0) {
		throw new RangeError(`${label} fixed display profile must declare calibrated ranges.`);
	}
	const phase = record(candidate.phase, `${label} phase coordinate`);
	finite(phase.centreU, `${label} phase centre U`);
	finite(phase.centreV, `${label} phase centre V`);
	positive(phase.scaleU, `${label} phase scale U`);
	positive(phase.scaleV, `${label} phase scale V`);
	for (const property of ['bloom', 'highlight'] as const) {
		nonNegative(candidate[property], `${label} ${property}`);
	}
	for (const property of ['exposure', 'saturation', 'frontScale', 'contrast', 'gamma'] as const) {
		positive(candidate[property], `${label} ${property}`);
	}
	const bloomThreshold = nonNegative(candidate.bloomThreshold, `${label} bloom threshold`);
	if (bloomThreshold > 1) {
		throw new RangeError(`${label} bloom threshold must lie from zero to one.`);
	}
	nonNegative(candidate.bloomRadius, `${label} bloom radius`);
	const ferroinMix = record(candidate.ferroinMix, `${label} ferroin mix`);
	exactKeys(
		ferroinMix,
		['recoveryWeight', 'activatorLuminanceWeight', 'gradientHighlightWeight'],
		`${label} ferroin mix`
	);
	for (const property of [
		'recoveryWeight',
		'activatorLuminanceWeight',
		'gradientHighlightWeight'
	] as const) {
		nonNegative(ferroinMix[property], `${label} ferroin mix ${property}`);
	}
	const luminousMix = record(candidate.luminousMix, `${label} luminous mix`);
	exactKeys(luminousMix, ['phaseWeight', 'recoveryWeight', 'frontWeight'], `${label} luminous mix`);
	for (const property of ['phaseWeight', 'recoveryWeight', 'frontWeight'] as const) {
		nonNegative(luminousMix[property], `${label} luminous mix ${property}`);
	}
	if (
		candidate.interpolation !== 'mask-aware-manual-bilinear' ||
		candidate.toneMap !== 'aces-fitted' ||
		candidate.outputTransfer !== 'srgb'
	) {
		throw new RangeError(`${label} rendering transfer contract is unsupported.`);
	}
	text(candidate.disclosure, `${label} disclosure`);
	return candidate as unknown as BZDisplayProfileV2;
}

function preset(value: unknown, label: string): BZPresetV2 {
	const candidate = record(value, label);
	if (candidate.schemaVersion !== BZ_V2_SCHEMA_VERSION) {
		throw new RangeError(`${label} schema version is unsupported.`);
	}
	stableId(candidate.id, `${label} id`);
	text(candidate.title, `${label} title`, 256);
	text(candidate.shortDescription, `${label} short description`);
	const modelSetup = setup(candidate.setup, `${label} setup`);
	if (
		candidate.model !== modelSetup.model ||
		candidate.modelVersion !== modelSetup.modelVersion ||
		candidate.equationsId !== modelSetup.equationsId ||
		candidate.initialCondition !== modelSetup.initialCondition
	) {
		throw new RangeError(`${label} model or initial-condition summary differs from its setup.`);
	}
	interventions(candidate.initialInterventions, `${label} initial interventions`);
	if (
		typeof candidate.sourceSemantics !== 'string' ||
		!SOURCE_SEMANTICS.has(candidate.sourceSemantics)
	) {
		throw new RangeError(`${label} source semantics are unsupported.`);
	}
	const warmup = record(candidate.warmupPolicy, `${label} warmup policy`);
	if (warmup.kind === 'none') {
		text(warmup.reason, `${label} no-warmup reason`);
	} else if (warmup.kind === 'fixed-steps') {
		const steps = safeInteger(warmup.steps, `${label} warmup steps`);
		if (!Object.is(warmup.modelTime, steps * modelSetup.timestep)) {
			throw new RangeError(`${label} warmup time must equal steps × timestep.`);
		}
		if (warmup.source !== 'cpu-f64-reference' && warmup.source !== 'gpu-f32-publication') {
			throw new RangeError(`${label} warmup source is unsupported.`);
		}
	} else if (warmup.kind === 'checkpoint') {
		stableId(warmup.checkpointId, `${label} warmup checkpoint id`);
		nonNegative(warmup.modelTime, `${label} warmup checkpoint time`);
		if (warmup.genesisAvailable !== true) {
			throw new RangeError(`${label} checkpoint must retain a replayable genesis.`);
		}
	} else {
		throw new RangeError(`${label} warmup policy is unsupported.`);
	}
	if (candidate.optionalCheckpoint !== null) {
		checkpoint(candidate.optionalCheckpoint, `${label} checkpoint`);
	}
	stableId(candidate.displayProfileId, `${label} display profile id`);
	stableId(candidate.calibrationRecordId, `${label} calibration record id`);
	const presetStatus = status(candidate.validationStatus, `${label} validation status`);
	const summary = record(candidate.validationSummary, `${label} validation summary`);
	if (status(summary.status, `${label} validation-summary status`) !== presetStatus) {
		throw new RangeError(`${label} validation summary and preset status differ.`);
	}
	text(summary.headline, `${label} validation headline`);
	for (const [name, entries] of [
		['passed criteria', summary.passedCriteria],
		['failed criteria', summary.failedCriteria]
	] as const) {
		for (const entry of array(entries, `${label} ${name}`)) text(entry, `${label} ${name} entry`);
	}
	record(summary.measurements, `${label} validation measurements`);
	const window = observationWindow(candidate.observationWindow, `${label} observation window`);
	assertWindowMatchesSetup(window, modelSetup, `${label} observation window`);
	const reproducibility = record(candidate.reproducibility, `${label} reproducibility`);
	text(reproducibility.seed, `${label} reproducibility seed`, 256);
	if (
		reproducibility.seed !== modelSetup.seed ||
		reproducibility.engineVersion !== BZ_V2_ENGINE_VERSION
	) {
		throw new RangeError(`${label} reproducibility identity differs from its setup or engine.`);
	}
	sha256(reproducibility.setupChecksum, `${label} reproducibility setup checksum`);
	sha256(reproducibility.interventionLogChecksum, `${label} intervention checksum`);
	text(reproducibility.command, `${label} reproducibility command`);
	text(candidate.articleClaimBoundary, `${label} article claim boundary`);
	boolean(candidate.hero, `${label} hero flag`);
	if (
		candidate.id === 'classic-target-rings' &&
		candidate.sourceSemantics !== 'declared-periodic-external-source'
	) {
		throw new RangeError('Classic Target Rings must declare its repeated external source.');
	}
	return candidate as unknown as BZPresetV2;
}

function calibration(value: unknown, label: string): BZCalibrationRecordV2 {
	const candidate = record(value, label);
	stableId(candidate.id, `${label} id`);
	stableId(candidate.presetId, `${label} preset id`);
	status(candidate.status, `${label} status`);
	text(candidate.statusReason, `${label} status reason`);
	const modelSetup = setup(candidate.setup, `${label} setup`);
	interventions(candidate.interventions, `${label} interventions`);
	const window = observationWindow(candidate.observationWindow, `${label} observation window`);
	assertWindowMatchesSetup(window, modelSetup, `${label} observation window`);
	let previousTime = Number.NEGATIVE_INFINITY;
	for (const sampledTime of array(candidate.sampledTimes, `${label} sampled times`)) {
		const value = nonNegative(sampledTime, `${label} sampled time`);
		if (value <= previousTime || value < window.startTime || value > window.endTime) {
			throw new RangeError(
				`${label} sampled times must be unique, increasing and inside the window.`
			);
		}
		previousTime = value;
	}
	record(candidate.metrics, `${label} metrics`);
	const criterionIds = new Set<string>();
	for (const [index, rawCriterion] of array(candidate.criteria, `${label} criteria`).entries()) {
		const criterion = record(rawCriterion, `${label} criterion ${index}`);
		const id = stableId(criterion.id, `${label} criterion ${index} id`);
		if (criterionIds.has(id)) throw new RangeError(`${label} has duplicate criterion id ${id}.`);
		criterionIds.add(id);
		if (criterion.kind !== 'prerequisite' && criterion.kind !== 'validation') {
			throw new RangeError(`${label} criterion ${id} kind is unsupported.`);
		}
		text(criterion.description, `${label} criterion ${id} description`);
		boolean(criterion.pass, `${label} criterion ${id} result`);
		record(criterion.evidence, `${label} criterion ${id} evidence`);
	}
	for (const [index, rawComparison] of array(
		candidate.convergence,
		`${label} convergence`
	).entries()) {
		const comparison = record(rawComparison, `${label} convergence ${index}`);
		text(comparison.comparison, `${label} convergence comparison`);
		text(comparison.reference, `${label} convergence reference`);
		text(comparison.observable, `${label} convergence observable`);
		nonNegative(comparison.relativeDifference, `${label} convergence relative difference`);
		nonNegative(comparison.tolerance, `${label} convergence tolerance`);
		boolean(comparison.pass, `${label} convergence result`);
	}
	cpuGpuParity(candidate.cpuGpuParity, `${label} CPU/GPU parity`);
	const displayIndependence = record(
		candidate.displayIndependence,
		`${label} display independence`
	);
	sha256(displayIndependence.stateChecksumBefore, `${label} display-before checksum`);
	sha256(displayIndependence.stateChecksumAfter, `${label} display-after checksum`);
	boolean(displayIndependence.pass, `${label} display-independence result`);
	const provenance = record(candidate.provenance, `${label} provenance`);
	for (const [key, entry] of Object.entries(provenance)) {
		if (
			entry !== null &&
			typeof entry !== 'string' &&
			typeof entry !== 'number' &&
			typeof entry !== 'boolean'
		) {
			throw new TypeError(`${label} provenance ${key} must be a scalar.`);
		}
		if (typeof entry === 'number') finite(entry, `${label} provenance ${key}`);
	}
	return candidate as unknown as BZCalibrationRecordV2;
}

function cpuGpuParity(value: unknown, label: string): Readonly<UnknownRecord> {
	const candidate = record(value, label);
	boolean(candidate.pass, `${label} result`);
	if (candidate.status === 'not-measured') {
		exactKeys(candidate, CPU_GPU_UNMEASURED_KEYS, label);
		if (candidate.pass !== false)
			throw new RangeError(`${label} cannot pass before it is measured.`);
		text(candidate.reason, `${label} unmeasured reason`);
		if (array(candidate.observables, `${label} observables`).length !== 0) {
			throw new RangeError(`${label} unmeasured evidence cannot contain observables.`);
		}
		return candidate;
	}
	if (candidate.status !== 'measured') throw new RangeError(`${label} status is unsupported.`);
	exactKeys(candidate, CPU_GPU_MEASURED_KEYS, label);
	const evidencePath = text(candidate.evidencePath, `${label} evidence path`, 1_024);
	if (!evidencePath.startsWith('/') || evidencePath.includes('..')) {
		throw new RangeError(`${label} evidence path must be absolute and traversal-free.`);
	}
	sha256(candidate.evidenceSha256, `${label} evidence checksum`);
	const grid = safeInteger(candidate.grid, `${label} grid`, 2);
	safeInteger(candidate.modelStep, `${label} model step`);
	nonNegative(candidate.modelTime, `${label} model time`);
	if (candidate.cpuPrecision !== 'float64') {
		throw new RangeError(`${label} CPU precision must be Float64.`);
	}
	if (candidate.gpuPrecision !== 'float32' && candidate.gpuPrecision !== 'float16') {
		throw new RangeError(`${label} GPU precision is unsupported.`);
	}
	if (candidate.textureFormat !== 'RGBA32F' && candidate.textureFormat !== 'RGBA16F') {
		throw new RangeError(`${label} texture format is unsupported.`);
	}
	if (
		(candidate.textureFormat === 'RGBA32F') !== (candidate.gpuPrecision === 'float32') ||
		(candidate.textureFormat === 'RGBA16F') !== (candidate.gpuPrecision === 'float16')
	) {
		throw new RangeError(`${label} texture format and GPU precision differ.`);
	}
	if (
		candidate.scopeKind !== 'implementation-and-display-64' &&
		candidate.scopeKind !== 'mature-checkpoint-continuation-256'
	) {
		throw new RangeError(`${label} scope kind is unsupported.`);
	}
	text(candidate.scope, `${label} scope`);
	const numericalCaseIds = new Set<string>();
	for (const [index, rawCase] of array(
		candidate.numericalCases,
		`${label} numerical cases`
	).entries()) {
		const parityCase = record(rawCase, `${label} numerical case ${index}`);
		exactKeys(
			parityCase,
			['id', 'gridSize', 'step', 'modelTime', 'error', 'pass'],
			`${label} numerical case ${index}`
		);
		const id = stableId(parityCase.id, `${label} numerical case ${index} id`);
		if (numericalCaseIds.has(id)) throw new RangeError(`${label} duplicates numerical case ${id}.`);
		numericalCaseIds.add(id);
		safeInteger(parityCase.gridSize, `${label} numerical case ${id} grid`, 2);
		safeInteger(parityCase.step, `${label} numerical case ${id} step`);
		nonNegative(parityCase.modelTime, `${label} numerical case ${id} model time`);
		const error = record(parityCase.error, `${label} numerical case ${id} error`);
		exactKeys(error, ['maxAbsolute', 'rms', 'samples'], `${label} numerical case ${id} error`);
		nonNegative(error.maxAbsolute, `${label} numerical case ${id} maximum error`);
		nonNegative(error.rms, `${label} numerical case ${id} RMS error`);
		safeInteger(error.samples, `${label} numerical case ${id} samples`, 1);
		boolean(parityCase.pass, `${label} numerical case ${id} result`);
	}
	if (candidate.scopeKind === 'mature-checkpoint-continuation-256') {
		if (grid !== 256) throw new RangeError(`${label} mature continuation scope must use 256².`);
		for (const id of REQUIRED_NUMERICAL_PARITY_CASE_IDS) {
			if (!numericalCaseIds.has(id))
				throw new RangeError(`${label} is missing numerical case ${id}.`);
		}
	} else {
		if (grid !== 64) throw new RangeError(`${label} implementation scope must use 64².`);
		if (!numericalCaseIds.has('base-fixed-step-64')) {
			throw new RangeError(`${label} is missing its fixed-step 64² implementation case.`);
		}
	}
	const displayCaseIds = new Set<string>();
	for (const [index, rawCase] of array(
		candidate.displayCases,
		`${label} display cases`
	).entries()) {
		const parityCase = record(rawCase, `${label} display case ${index}`);
		exactKeys(parityCase, ['id', 'error', 'pass'], `${label} display case ${index}`);
		const id = stableId(parityCase.id, `${label} display case ${index} id`);
		if (displayCaseIds.has(id)) throw new RangeError(`${label} duplicates display case ${id}.`);
		displayCaseIds.add(id);
		const error = record(parityCase.error, `${label} display case ${id} error`);
		exactKeys(
			error,
			['maximumByteDifference', 'meanByteDifference', 'samples'],
			`${label} display case ${id} error`
		);
		nonNegative(error.maximumByteDifference, `${label} display case ${id} maximum difference`);
		nonNegative(error.meanByteDifference, `${label} display case ${id} mean difference`);
		safeInteger(error.samples, `${label} display case ${id} samples`, 1);
		boolean(parityCase.pass, `${label} display case ${id} result`);
	}
	if (
		displayCaseIds.size !== REQUIRED_DISPLAY_PARITY_CASE_IDS.size ||
		![...REQUIRED_DISPLAY_PARITY_CASE_IDS].every((id) => displayCaseIds.has(id))
	) {
		throw new RangeError(`${label} display cases differ from the required view contract.`);
	}
	const observables = array(candidate.observables, `${label} observables`);
	if (observables.length === 0)
		throw new RangeError(`${label} must contain numerical observables.`);
	let everyObservablePasses = true;
	for (const [index, rawObservable] of observables.entries()) {
		const observable = record(rawObservable, `${label} observable ${index}`);
		exactKeys(
			observable,
			['name', 'value', 'tolerance', 'samples', 'pass'],
			`${label} observable ${index}`
		);
		text(observable.name, `${label} observable ${index} name`, 256);
		const value = nonNegative(observable.value, `${label} observable ${index} value`);
		const tolerance = nonNegative(observable.tolerance, `${label} observable ${index} tolerance`);
		safeInteger(observable.samples, `${label} observable ${index} samples`, 1);
		const observablePass = boolean(observable.pass, `${label} observable ${index} result`);
		if (observablePass !== value <= tolerance) {
			throw new RangeError(`${label} observable ${index} pass flag is inconsistent.`);
		}
		everyObservablePasses &&= observablePass;
	}
	if (candidate.pass !== everyObservablePasses) {
		throw new RangeError(`${label} aggregate pass flag is inconsistent.`);
	}
	return candidate;
}

function asset(value: unknown, label: string): BZAssetRecordV2 {
	const candidate = record(value, label);
	stableId(candidate.id, `${label} id`);
	for (const key of ['path', 'metadataPath'] as const) {
		const path = text(candidate[key], `${label} ${key}`, 1_024);
		if (!path.startsWith('/') || path.includes('..')) {
			throw new RangeError(`${label} ${key} must be absolute and traversal-free.`);
		}
	}
	safeInteger(candidate.width, `${label} width`, 1);
	safeInteger(candidate.height, `${label} height`, 1);
	safeInteger(candidate.stateGrid, `${label} state grid`, 2);
	stableId(candidate.presetId, `${label} preset id`);
	if (candidate.checkpointId !== null) stableId(candidate.checkpointId, `${label} checkpoint id`);
	if (typeof candidate.view !== 'string' || !VIEWS.has(candidate.view)) {
		throw new RangeError(`${label} view is unsupported.`);
	}
	stableId(candidate.displayProfileId, `${label} display profile id`);
	sha256(candidate.sha256, `${label} checksum`);
	return candidate as unknown as BZAssetRecordV2;
}

function performance(value: unknown, label: string): BZPerformanceReportV2 {
	const candidate = record(value, label);
	exactKeys(candidate, PERFORMANCE_KEYS, label);
	text(candidate.browser, `${label} browser`);
	text(candidate.gpu, `${label} GPU`);
	safeInteger(candidate.stateGrid, `${label} state grid`, 2);
	text(candidate.displayResolution, `${label} display resolution`);
	const durationSeconds = positive(candidate.durationSeconds, `${label} duration`);
	if (durationSeconds < 30) {
		throw new RangeError(`${label} duration must cover at least 30 measured seconds.`);
	}
	nonNegative(candidate.medianFps, `${label} median FPS`);
	nonNegative(candidate.medianStepsPerSecond, `${label} median steps per second`);
	nonNegative(candidate.telemetryHz, `${label} telemetry frequency`);
	safeInteger(candidate.fullStateReadbacks, `${label} full-state readbacks`);
	safeInteger(candidate.scientificTextureBytes, `${label} scientific texture bytes`);
	safeInteger(candidate.displayTextureBytes, `${label} display texture bytes`);
	text(candidate.notes, `${label} notes`);
	return candidate as unknown as BZPerformanceReportV2;
}

function uniqueById<T extends { readonly id: string }>(
	entries: readonly T[],
	label: string
): Map<string, T> {
	const result = new Map<string, T>();
	for (const entry of entries) {
		if (result.has(entry.id)) throw new RangeError(`${label} contains duplicate id ${entry.id}.`);
		result.set(entry.id, entry);
	}
	return result;
}

function sameDocument(left: unknown, right: unknown): boolean {
	return canonicalBZJSONStringify(left) === canonicalBZJSONStringify(right);
}

function assertCrossReferences(manifest: Readonly<BZCalibrationManifestV2>): void {
	const profiles = uniqueById(manifest.displayProfiles, 'Display profiles');
	const presets = uniqueById(manifest.presets, 'Presets');
	const calibrations = uniqueById(manifest.calibrations, 'Calibrations');
	const checkpoints = uniqueById(
		manifest.checkpoints as readonly BZCheckpointProvenanceDescriptorV1[],
		'Checkpoints'
	);
	uniqueById(manifest.assets, 'Assets');
	for (const preset of manifest.presets) {
		const profile = profiles.get(preset.displayProfileId);
		if (!profile) throw new RangeError(`${preset.id} references a missing display profile.`);
		const calibrationRecord = calibrations.get(preset.calibrationRecordId);
		if (!calibrationRecord || calibrationRecord.presetId !== preset.id) {
			throw new RangeError(`${preset.id} references a missing or foreign calibration record.`);
		}
		if (
			preset.validationStatus !== calibrationRecord.status ||
			preset.validationSummary.status !== calibrationRecord.status ||
			!sameDocument(preset.setup, calibrationRecord.setup) ||
			!sameDocument(preset.initialInterventions, calibrationRecord.interventions) ||
			!sameDocument(preset.observationWindow, calibrationRecord.observationWindow)
		) {
			throw new RangeError(`${preset.id} duplicates calibration values inconsistently.`);
		}
		const warmupCheckpointId =
			preset.warmupPolicy.kind === 'checkpoint' ? preset.warmupPolicy.checkpointId : null;
		const embeddedCheckpoint =
			preset.optionalCheckpoint as BZCheckpointProvenanceDescriptorV1 | null;
		const embeddedCheckpointId = embeddedCheckpoint?.id ?? null;
		if (warmupCheckpointId !== embeddedCheckpointId) {
			throw new RangeError(`${preset.id} checkpoint warmup and descriptor differ.`);
		}
		if (embeddedCheckpoint) {
			const canonicalCheckpoint = checkpoints.get(embeddedCheckpoint.id);
			if (!canonicalCheckpoint || !sameDocument(canonicalCheckpoint, embeddedCheckpoint)) {
				throw new RangeError(
					`${preset.id} embeds a checkpoint that differs from the canonical record.`
				);
			}
			if (
				canonicalCheckpoint.width !== preset.setup.gridSize ||
				preset.warmupPolicy.kind !== 'checkpoint' ||
				canonicalCheckpoint.modelTime !== preset.warmupPolicy.modelTime ||
				canonicalCheckpoint.modelTime !== canonicalCheckpoint.modelStep * preset.setup.timestep ||
				canonicalCheckpoint.sourcePresetId !== preset.id ||
				canonicalCheckpoint.validationRecordId !== preset.calibrationRecordId ||
				canonicalCheckpoint.seed !== preset.setup.seed ||
				!sameDocument(canonicalCheckpoint.setup, preset.setup) ||
				!sameDocument(canonicalCheckpoint.interventions, preset.initialInterventions) ||
				canonicalCheckpoint.setupChecksum !== preset.reproducibility.setupChecksum ||
				canonicalCheckpoint.interventionLogChecksum !==
					preset.reproducibility.interventionLogChecksum
			) {
				throw new RangeError(
					`${preset.id} checkpoint dimensions, time, checksums or provenance differ from its preset.`
				);
			}
		}
		if (preset.hero && preset.validationStatus !== 'validated') {
			throw new RangeError(`${preset.id} cannot be promoted to hero while it remains unvalidated.`);
		}
		if (preset.validationStatus === 'validated') {
			const failedCriteria = calibrationRecord.criteria.filter((criterion) => !criterion.pass);
			const validationCriteria = calibrationRecord.criteria.filter(
				(criterion) => criterion.kind === 'validation'
			);
			const parity = calibrationRecord.cpuGpuParity as Readonly<Record<string, unknown>>;
			if (preset.hero && parity.scopeKind === 'mature-checkpoint-continuation-256') {
				if (!embeddedCheckpoint) {
					throw new RangeError(`${preset.id} mature parity requires an authenticated checkpoint.`);
				}
				const parityCases = array(
					parity.numericalCases,
					`${preset.id} mature numerical parity cases`
				).map((entry, index) =>
					record(entry, `${preset.id} mature numerical parity case ${index}`)
				);
				const scheduledCase = parityCases.find(
					(entry) => entry.id === 'declared-intervention-schedule-64'
				);
				const uploadCase = parityCases.find((entry) => entry.id === 'mature-checkpoint-upload');
				const continuationCase = parityCases.find(
					(entry) => entry.id === 'mature-checkpoint-continuation'
				);
				if (!scheduledCase || !uploadCase || !continuationCase) {
					throw new RangeError(`${preset.id} mature parity cases are incomplete.`);
				}
				if (
					parity.grid !== 256 ||
					parity.modelStep !== continuationCase.step ||
					parity.modelTime !== continuationCase.modelTime ||
					scheduledCase.gridSize !== 64 ||
					scheduledCase.modelTime !== (scheduledCase.step as number) * preset.setup.timestep ||
					uploadCase.gridSize !== 256 ||
					uploadCase.step !== embeddedCheckpoint.modelStep ||
					uploadCase.modelTime !== embeddedCheckpoint.modelTime ||
					continuationCase.gridSize !== 256 ||
					(continuationCase.step as number) < embeddedCheckpoint.modelStep + 64 ||
					continuationCase.modelTime !== (continuationCase.step as number) * preset.setup.timestep
				) {
					throw new RangeError(
						`${preset.id} mature parity does not match its 256² checkpoint and fixed-step continuation contract.`
					);
				}
			} else if (preset.hero) {
				const parityCases = array(
					parity.numericalCases,
					`${preset.id} implementation numerical parity cases`
				).map((entry, index) =>
					record(entry, `${preset.id} implementation numerical parity case ${index}`)
				);
				const baseCase = parityCases.find((entry) => entry.id === 'base-fixed-step-64');
				const scheduleCase = parityCases.find(
					(entry) => entry.id === 'declared-intervention-schedule-64'
				);
				if (!baseCase || (preset.initialInterventions.length > 0 && !scheduleCase)) {
					throw new RangeError(`${preset.id} implementation parity cases are incomplete.`);
				}
				if (
					parity.scopeKind !== 'implementation-and-display-64' ||
					parity.grid !== 64 ||
					baseCase.gridSize !== 64 ||
					baseCase.modelTime !== (baseCase.step as number) * preset.setup.timestep ||
					(preset.initialInterventions.length > 0 &&
						(scheduleCase?.gridSize !== 64 ||
							scheduleCase?.modelTime !== (scheduleCase?.step as number) * preset.setup.timestep))
				) {
					throw new RangeError(
						`${preset.id} implementation parity does not cover its 64² fixed-step and declared schedule contract.`
					);
				}
			}
			if (
				manifest.search.status !== 'complete' ||
				failedCriteria.length > 0 ||
				validationCriteria.length === 0 ||
				calibrationRecord.convergence.length === 0 ||
				calibrationRecord.convergence.some((comparison) => !comparison.pass) ||
				parity.pass !== true ||
				!calibrationRecord.displayIndependence.pass ||
				preset.validationSummary.failedCriteria.length > 0 ||
				profile.rangeMode !== 'fixed' ||
				(preset.hero && preset.optionalCheckpoint === null)
			) {
				throw new RangeError(
					`${preset.id} cannot be promoted to validated before search, criteria, convergence, parity, display independence, fixed ranges and hero checkpoint requirements pass.`
				);
			}
			if (preset.hero) {
				const validationGates = record(
					calibrationRecord.metrics.validationGates,
					`${preset.id} validation gates`
				);
				const checkpointPoster = manifest.assets.find(
					(entry) => entry.id === `bz-v2-${preset.id}-checkpoint-poster`
				);
				if (
					validationGates.checkpointPosterMetadata !== true ||
					!embeddedCheckpoint ||
					!checkpointPoster ||
					checkpointPoster.presetId !== preset.id ||
					checkpointPoster.checkpointId !== embeddedCheckpoint.id ||
					checkpointPoster.stateGrid !== preset.setup.gridSize ||
					checkpointPoster.displayProfileId !== preset.displayProfileId ||
					checkpointPoster.view !== 'luminous-composite' ||
					checkpointPoster.width !== checkpointPoster.height
				) {
					throw new RangeError(
						`${preset.id} is a validated hero without its exact authenticated checkpoint poster.`
					);
				}
			}
		}
	}
	for (const calibration of manifest.calibrations) {
		if (!presets.has(calibration.presetId)) {
			throw new RangeError(`${calibration.id} references a missing preset.`);
		}
	}
	for (const entry of manifest.assets) {
		if (!presets.has(entry.presetId))
			throw new RangeError(`${entry.id} references a missing preset.`);
		if (!profiles.has(entry.displayProfileId)) {
			throw new RangeError(`${entry.id} references a missing display profile.`);
		}
		if (entry.checkpointId !== null && !checkpoints.has(entry.checkpointId)) {
			throw new RangeError(`${entry.id} references a missing checkpoint.`);
		}
	}
	for (const checkpointId of checkpoints.keys()) {
		if (!manifest.presets.some((entry) => entry.optionalCheckpoint?.id === checkpointId)) {
			throw new RangeError(`Checkpoint ${checkpointId} is orphaned from every preset.`);
		}
	}
}

function deepFreeze<T>(value: T, seen: Set<object> = new Set()): T {
	if (value === null || typeof value !== 'object' || seen.has(value as object)) return value;
	seen.add(value as object);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
	return Object.freeze(value);
}

/**
 * Parse the one public V2 calibration document. This facade validates identity,
 * cross-references and promotion gates; it does not supply fallback presets or
 * turn absent calibration data into a validated claim.
 */
export function parseBZCalibrationManifestV2(value: unknown): BZCalibrationManifestV2 {
	const source = record(value, 'BZ V2 calibration manifest');
	exactKeys(source, ROOT_KEYS, 'BZ V2 calibration manifest');
	if (
		source.schemaVersion !== BZ_V2_SCHEMA_VERSION ||
		source.engineVersion !== BZ_V2_ENGINE_VERSION ||
		source.displayVersion !== BZ_V2_DISPLAY_VERSION
	) {
		throw new RangeError('BZ V2 manifest schema, engine or display version is unsupported.');
	}
	timestamp(source.generatedAt, 'BZ V2 manifest generation time');
	text(source.generatedBy, 'BZ V2 manifest generator', 256);
	for (const [index, rawBasis] of array(source.literatureBasis, 'Literature basis').entries()) {
		const basis = record(rawBasis, `Literature basis ${index}`);
		text(basis.label, `Literature basis ${index} label`);
		const url = text(basis.url, `Literature basis ${index} URL`, 2_048);
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			throw new RangeError(`Literature basis ${index} URL is invalid.`);
		}
		if (parsed.protocol !== 'https:') {
			throw new RangeError(`Literature basis ${index} URL must use HTTPS.`);
		}
	}
	text(source.numericalMethod, 'Numerical method');
	text(source.boundaryMethod, 'Boundary method');
	const checksumAlgorithms = record(source.checksumAlgorithms, 'Checksum algorithms');
	if (!sameDocument(checksumAlgorithms, EXPECTED_CHECKSUM_ALGORITHMS)) {
		throw new RangeError('BZ V2 manifest checksum algorithms differ from the versioned contract.');
	}
	const search = record(source.search, 'Search provenance');
	if (
		search.status !== 'not-run' &&
		search.status !== 'in-progress' &&
		search.status !== 'complete'
	) {
		throw new RangeError('Search provenance status is unsupported.');
	}
	text(search.validationBoundary, 'Search validation boundary');
	const articleClaims = record(source.articleClaims, 'Article claims');
	if (typeof articleClaims.validationBoundary !== 'string') {
		throw new RangeError('Article claims must declare a validation boundary.');
	}
	for (const [key, claim] of Object.entries(articleClaims)) text(claim, `Article claim ${key}`);

	const parsed: BZCalibrationManifestV2 = {
		schemaVersion: BZ_V2_SCHEMA_VERSION,
		engineVersion: BZ_V2_ENGINE_VERSION,
		displayVersion: BZ_V2_DISPLAY_VERSION,
		generatedAt: source.generatedAt as string,
		generatedBy: source.generatedBy as string,
		literatureBasis: source.literatureBasis as BZCalibrationManifestV2['literatureBasis'],
		numericalMethod: source.numericalMethod as string,
		boundaryMethod: source.boundaryMethod as string,
		checksumAlgorithms: checksumAlgorithms as Readonly<Record<string, string>>,
		search,
		displayProfiles: array(source.displayProfiles, 'Display profiles').map((entry, index) =>
			displayProfile(entry, `Display profile ${index}`)
		),
		presets: array(source.presets, 'Presets').map((entry, index) =>
			preset(entry, `Preset ${index}`)
		),
		calibrations: array(source.calibrations, 'Calibrations').map((entry, index) =>
			calibration(entry, `Calibration ${index}`)
		),
		checkpoints: array(source.checkpoints, 'Checkpoints').map((entry, index) =>
			checkpoint(entry, `Checkpoint ${index}`)
		),
		assets: array(source.assets, 'Assets').map((entry, index) => asset(entry, `Asset ${index}`)),
		performance: array(source.performance, 'Performance reports').map((entry, index) =>
			performance(entry, `Performance report ${index}`)
		),
		articleClaims: articleClaims as Readonly<Record<string, string>>
	};
	assertCrossReferences(parsed);
	// Clone through canonical JSON before freezing so caller-owned objects cannot
	// mutate the trusted manifest after validation.
	return deepFreeze(
		JSON.parse(canonicalBZJSONStringify(parsed)) as unknown as BZCalibrationManifestV2
	);
}

/** The public JSON is the sole authored source; this module only validates it. */
export const BZ_V2_CALIBRATION_MANIFEST = parseBZCalibrationManifestV2(rawManifest);

export function bzV2PresetById(id: string): BZPresetV2 | null {
	return BZ_V2_CALIBRATION_MANIFEST.presets.find((entry) => entry.id === id) ?? null;
}

export function bzV2CalibrationById(id: string): BZCalibrationRecordV2 | null {
	return BZ_V2_CALIBRATION_MANIFEST.calibrations.find((entry) => entry.id === id) ?? null;
}

export function bzV2CheckpointById(id: string): BZCheckpointProvenanceDescriptorV1 | null {
	return (
		(BZ_V2_CALIBRATION_MANIFEST.checkpoints as readonly BZCheckpointProvenanceDescriptorV1[]).find(
			(entry) => entry.id === id
		) ?? null
	);
}

export function bzV2DisplayProfileById(id: string): BZDisplayProfileV2 | null {
	return BZ_V2_CALIBRATION_MANIFEST.displayProfiles.find((entry) => entry.id === id) ?? null;
}

export type { BZPalette, BZViewMode };
