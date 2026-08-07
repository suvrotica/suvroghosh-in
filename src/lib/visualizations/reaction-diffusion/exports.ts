import { MAX_MEASUREMENT_HISTORY } from './constants';
import {
	REACTION_DIFFUSION_ENGINE_VERSION,
	REACTION_DIFFUSION_MODEL_ID,
	REACTION_DIFFUSION_SCHEMA_VERSION
} from './types';
import { calculateFieldMetrics } from './metrics';
import { orderedInterventions } from './interventions';
import { assertValidSetup, cloneSetup } from './setup';
import type {
	DisplayMode,
	EngineKind,
	ExperimentRecord,
	FieldState,
	GrayScottSetup,
	Intervention,
	MeasurementSample,
	PaletteId
} from './types';

const ENGINES = new Set<EngineKind>(['gpu-f16', 'gpu-f32', 'cpu-reference']);
const DISPLAY_MODES = new Set<DisplayMode>([
	'v',
	'u',
	'composite',
	'u-minus-v',
	'reaction-rate',
	'v-diffusion',
	'v-derivative'
]);
const PALETTES = new Set<PaletteId>(['mineral', 'cividis', 'high-contrast', 'diverging']);

export interface ExperimentRecordInput {
	readonly setup: GrayScottSetup;
	readonly state: Readonly<FieldState>;
	readonly engine?: EngineKind;
	readonly step: number;
	readonly interventions?: readonly Readonly<Intervention>[];
	readonly history?: readonly Readonly<MeasurementSample>[];
	readonly displayMode?: DisplayMode;
	readonly palette?: PaletteId;
}

function cloneMeasurement(sample: Readonly<MeasurementSample>): MeasurementSample {
	return { ...sample };
}

const FIELD_METRIC_KEYS = [
	'meanU',
	'meanV',
	'varianceV',
	'meanReactionRate',
	'minimumU',
	'maximumU',
	'minimumV',
	'maximumV',
	'activeCells'
] as const;
const MEASUREMENT_NUMBER_KEYS = ['step', 'modelTime'] as const;
const MEASUREMENT_NULLABLE_KEYS = [
	'dominantWavelength',
	'residualU',
	'residualV',
	'comparisonDifference'
] as const;

function validateFieldMetricsValue(value: unknown, path: string, issues: string[]): void {
	if (!isRecord(value)) {
		issues.push(`${path} must be an object.`);
		return;
	}
	for (const key of FIELD_METRIC_KEYS) {
		if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
			issues.push(`${path}.${key} must be a finite number.`);
		}
	}
	if (
		typeof value.activeCells === 'number' &&
		(!Number.isSafeInteger(value.activeCells) || value.activeCells <= 0)
	) {
		issues.push(`${path}.activeCells must be a positive safe integer.`);
	}
	if (typeof value.varianceV === 'number' && value.varianceV < 0) {
		issues.push(`${path}.varianceV cannot be negative.`);
	}
	if (
		typeof value.minimumU === 'number' &&
		typeof value.maximumU === 'number' &&
		value.minimumU > value.maximumU
	) {
		issues.push(`${path} has reversed U bounds.`);
	}
	if (
		typeof value.minimumV === 'number' &&
		typeof value.maximumV === 'number' &&
		value.minimumV > value.maximumV
	) {
		issues.push(`${path} has reversed V bounds.`);
	}
}

function validateMeasurementValue(value: unknown, path: string, issues: string[]): void {
	validateFieldMetricsValue(value, path, issues);
	if (!isRecord(value)) return;
	for (const key of MEASUREMENT_NUMBER_KEYS) {
		if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
			issues.push(`${path}.${key} must be a finite number.`);
		}
	}
	for (const key of MEASUREMENT_NULLABLE_KEYS) {
		if (value[key] !== null && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) {
			issues.push(`${path}.${key} must be finite or null.`);
		}
	}
	if (typeof value.step === 'number' && (!Number.isSafeInteger(value.step) || value.step < 0)) {
		issues.push(`${path}.step must be a non-negative safe integer.`);
	}
	if (typeof value.modelTime === 'number' && value.modelTime < 0) {
		issues.push(`${path}.modelTime cannot be negative.`);
	}
	if (typeof value.dominantWavelength === 'number' && value.dominantWavelength <= 0) {
		issues.push(`${path}.dominantWavelength must be positive when present.`);
	}
}

function assertMeasurement(sample: Readonly<MeasurementSample>, path: string): void {
	const issues: string[] = [];
	validateMeasurementValue(sample, path, issues);
	if (issues.length > 0) throw new RangeError(issues.join(' '));
}

export function createExperimentRecord(input: Readonly<ExperimentRecordInput>): ExperimentRecord {
	assertValidSetup(input.setup);
	if (input.state.size !== input.setup.gridSize) {
		throw new RangeError('Experiment field and setup grid sizes differ.');
	}
	if (!Number.isSafeInteger(input.step) || input.step < 0) {
		throw new RangeError('Experiment step must be a non-negative safe integer.');
	}
	const engine = input.engine ?? 'cpu-reference';
	if (!ENGINES.has(engine)) throw new RangeError('Experiment engine is not recognised.');
	const displayMode = input.displayMode ?? 'v';
	const palette = input.palette ?? 'mineral';
	if (!DISPLAY_MODES.has(displayMode) || !PALETTES.has(palette)) {
		throw new RangeError('Experiment display settings are not recognised.');
	}
	const history = (input.history ?? []).slice(-MAX_MEASUREMENT_HISTORY).map((sample, index) => {
		assertMeasurement(sample, `history[${index}]`);
		return cloneMeasurement(sample);
	});
	return {
		schemaVersion: REACTION_DIFFUSION_SCHEMA_VERSION,
		engineVersion: REACTION_DIFFUSION_ENGINE_VERSION,
		model: REACTION_DIFFUSION_MODEL_ID,
		setup: cloneSetup(input.setup),
		engine,
		step: input.step,
		modelTime: input.step * input.setup.timestep,
		interventions: orderedInterventions(input.interventions ?? []),
		measurements: calculateFieldMetrics(input.state),
		history,
		display: { mode: displayMode, palette }
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export interface ExperimentValidationResult {
	readonly valid: boolean;
	readonly issues: readonly string[];
	readonly record?: ExperimentRecord;
}

function finiteRecordNumbers(value: unknown, path: string, issues: string[]): void {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) issues.push(`${path} is not finite.`);
		return;
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index += 1) {
			finiteRecordNumbers(value[index], `${path}[${index}]`, issues);
		}
		return;
	}
	if (isRecord(value)) {
		for (const [key, entry] of Object.entries(value)) {
			finiteRecordNumbers(entry, path ? `${path}.${key}` : key, issues);
		}
	}
}

export function validateExperimentRecord(value: unknown): ExperimentValidationResult {
	const issues: string[] = [];
	if (!isRecord(value)) return { valid: false, issues: ['Experiment record must be an object.'] };
	if (value.schemaVersion !== REACTION_DIFFUSION_SCHEMA_VERSION) {
		issues.push('Experiment schema version is unsupported.');
	}
	if (value.engineVersion !== REACTION_DIFFUSION_ENGINE_VERSION) {
		issues.push('Experiment engine version is unsupported.');
	}
	if (value.model !== REACTION_DIFFUSION_MODEL_ID)
		issues.push('Experiment model identifier is invalid.');
	const normalizedSetup = value.setup;
	try {
		if (!isRecord(normalizedSetup)) throw new TypeError('Setup is not an object.');
		assertValidSetup(normalizedSetup as unknown as GrayScottSetup);
	} catch (error) {
		issues.push(error instanceof Error ? error.message : 'Experiment setup is invalid.');
	}
	if (typeof value.engine !== 'string' || !ENGINES.has(value.engine as EngineKind)) {
		issues.push('Experiment engine is invalid.');
	}
	if (!Number.isSafeInteger(value.step) || (value.step as number) < 0) {
		issues.push('Experiment step is invalid.');
	}
	if (
		typeof value.modelTime !== 'number' ||
		!Number.isFinite(value.modelTime) ||
		value.modelTime < 0
	) {
		issues.push('Experiment model time is invalid.');
	}
	if (!Array.isArray(value.interventions))
		issues.push('Experiment interventions must be an array.');
	else {
		try {
			const ordered = orderedInterventions(value.interventions as unknown as Intervention[]);
			for (let index = 0; index < ordered.length; index += 1) {
				const original = value.interventions[index] as Intervention | undefined;
				if (
					original === undefined ||
					original.step !== ordered[index].step ||
					original.sequence !== ordered[index].sequence
				) {
					issues.push('Experiment interventions are not in canonical step/sequence order.');
					break;
				}
			}
		} catch (error) {
			issues.push(error instanceof Error ? error.message : 'Experiment interventions are invalid.');
		}
	}
	validateFieldMetricsValue(value.measurements, 'measurements', issues);
	if (!Array.isArray(value.history) || value.history.length > MAX_MEASUREMENT_HISTORY) {
		issues.push('Experiment measurement history is invalid.');
	} else {
		let previousStep = -1;
		for (let index = 0; index < value.history.length; index += 1) {
			const sample = value.history[index];
			validateMeasurementValue(sample, `history[${index}]`, issues);
			if (isRecord(sample) && typeof sample.step === 'number') {
				if (sample.step < previousStep) {
					issues.push('Experiment measurement history is not in ascending step order.');
					break;
				}
				previousStep = sample.step;
			}
		}
	}
	if (!isRecord(value.display)) issues.push('Experiment display settings are invalid.');
	else {
		if (!DISPLAY_MODES.has(value.display.mode as DisplayMode))
			issues.push('Display mode is invalid.');
		if (!PALETTES.has(value.display.palette as PaletteId))
			issues.push('Display palette is invalid.');
	}
	if (
		isRecord(value.setup) &&
		typeof value.setup.timestep === 'number' &&
		typeof value.step === 'number' &&
		typeof value.modelTime === 'number'
	) {
		const expectedTime = value.step * value.setup.timestep;
		const tolerance = Number.EPSILON * Math.max(1, Math.abs(expectedTime)) * 8;
		if (Math.abs(value.modelTime - expectedTime) > tolerance) {
			issues.push('Experiment model time does not match step × timestep.');
		}
	}
	finiteRecordNumbers(value, '', issues);
	if (issues.length > 0) return { valid: false, issues };
	return { valid: true, issues, record: value as unknown as ExperimentRecord };
}

export function assertValidExperimentRecord(value: unknown): asserts value is ExperimentRecord {
	const result = validateExperimentRecord(value);
	if (!result.valid)
		throw new TypeError(`Invalid reaction–diffusion experiment: ${result.issues.join(' ')}`);
}

export function serializeExperimentRecord(
	record: Readonly<ExperimentRecord>,
	indentation = 2
): string {
	assertValidExperimentRecord(record);
	const safeIndentation = Number.isInteger(indentation) ? Math.min(4, Math.max(0, indentation)) : 2;
	return JSON.stringify(record, null, safeIndentation);
}

export function parseExperimentRecord(text: string): ExperimentRecord {
	if (text.length > 5_000_000) throw new RangeError('Experiment document is too large.');
	const value: unknown = JSON.parse(text);
	assertValidExperimentRecord(value);
	return value;
}

const CSV_COLUMNS = [
	'step',
	'modelTime',
	'meanU',
	'meanV',
	'varianceV',
	'meanReactionRate',
	'minimumU',
	'maximumU',
	'minimumV',
	'maximumV',
	'activeCells',
	'dominantWavelength',
	'residualU',
	'residualV',
	'comparisonDifference'
] as const satisfies readonly (keyof MeasurementSample)[];

function csvNumber(value: number | null): string {
	if (value === null) return '';
	if (!Number.isFinite(value)) throw new RangeError('CSV cannot contain a non-finite measurement.');
	if (Object.is(value, -0)) return '0';
	return Number.parseFloat(value.toPrecision(12)).toString();
}

export function measurementsToCsv(samples: readonly Readonly<MeasurementSample>[]): string {
	const rows = [CSV_COLUMNS.join(',')];
	for (const [index, sample] of samples.entries()) {
		assertMeasurement(sample, `samples[${index}]`);
		rows.push(CSV_COLUMNS.map((column) => csvNumber(sample[column])).join(','));
	}
	return rows.join('\n');
}

function scientific(value: number): string {
	return Number.parseFloat(value.toPrecision(8)).toString();
}

export function experimentSummaryText(record: Readonly<ExperimentRecord>): string {
	assertValidExperimentRecord(record);
	return [
		'Gray–Scott reaction–diffusion experiment',
		`Step: ${record.step}`,
		`Model time: ${scientific(record.modelTime)}`,
		`Feed F: ${scientific(record.setup.feed)}`,
		`Kill k: ${scientific(record.setup.kill)}`,
		`Diffusion U / V: ${scientific(record.setup.diffusionU)} / ${scientific(record.setup.diffusionV)}`,
		`Boundary / mask: ${record.setup.boundary} / ${record.setup.maskPreset}`,
		`Grid / domain: ${record.setup.gridSize} × ${record.setup.gridSize} / ${scientific(record.setup.domainWidth)}`,
		`Timestep / integrator: ${scientific(record.setup.timestep)} / ${record.setup.integrator}`,
		`Seed: ${record.setup.seed}`,
		`Mean U / V: ${scientific(record.measurements.meanU)} / ${scientific(record.measurements.meanV)}`,
		`Variance V: ${scientific(record.measurements.varianceV)}`,
		`Interventions: ${record.interventions.length}`,
		`Engine: ${record.engine} (${record.engineVersion})`
	].join('\n');
}

export function experimentMethodsText(record: Readonly<ExperimentRecord>): string {
	assertValidExperimentRecord(record);
	return [
		'Methods — Gray–Scott reaction–diffusion field',
		'',
		'The dimensionless fields obey ∂u/∂t = Du∇²u − uv² + F(1−u) and ∂v/∂t = Dv∇²v + uv² − (F+k)v.',
		`Space was discretised on a ${record.setup.gridSize} × ${record.setup.gridSize} row-major square grid of width ${scientific(record.setup.domainWidth)} with a five-point Laplacian.`,
		`The ${record.setup.boundary} outer boundary and ${record.setup.maskPreset} impermeable-mask geometry were used. Mask faces carried zero normal flux.`,
		`Time integration used fixed-step ${record.setup.integrator} with Δt=${scientific(record.setup.timestep)}; concentrations were not silently clamped.`,
		`The deterministic seed was “${record.setup.seed}”. ${record.interventions.length} intervention event(s) were replayed in step/sequence order immediately before their recorded integration steps.`,
		`Recorded model time was ${scientific(record.modelTime)} using ${record.engine} and engine contract ${record.engineVersion}.`,
		'Floating-point results may differ slightly across browsers and GPU hardware; CPU replay is deterministic for the same JavaScript runtime and inputs.'
	].join('\n');
}
