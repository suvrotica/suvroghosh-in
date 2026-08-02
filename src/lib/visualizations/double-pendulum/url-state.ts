import { wrapAngle } from './analysis';
import { MAX_TIMESTEP, MIN_TIMESTEP } from './integrators';
import { createDefaultConfiguration, isPresetId } from './presets';
import {
	cloneState,
	type AtlasConfiguration,
	type ConfigurationResult,
	type IntegratorKind,
	type PendulumConfiguration,
	type PendulumMode,
	type PendulumParameters,
	type PendulumState,
	type PerturbationDimension,
	type StateIssue
} from './types';

export const URL_STATE_VERSION = 1;
export const MAX_URL_STATE_LENGTH = 12_000;

const MODES = new Set<PendulumMode>(['lab', 'shadow', 'atlas', 'phase-space', 'lying-integrator']);
const INTEGRATORS = new Set<IntegratorKind>(['rk4']);
const PERTURBATION_DIMENSIONS = new Set<PerturbationDimension>([
	'theta1',
	'omega1',
	'theta2',
	'omega2'
]);

const SAFE = Object.freeze({
	angularVelocity: 100,
	atlasAngularVelocity: 50,
	massMin: 0.01,
	massMax: 50,
	lengthMin: 0.02,
	lengthMax: 20,
	gravityMin: 0.05,
	gravityMax: 50,
	speedMin: 0.1,
	speedMax: 4,
	trailMax: 4_800,
	perturbationMin: 1e-12,
	perturbationMax: 1e-2,
	atlasResolutionMin: 16,
	atlasResolutionMax: 256,
	atlasThresholdMin: 1e-6,
	atlasThresholdMax: 20,
	atlasTimeCapMin: 0.1,
	atlasTimeCapMax: 60,
	atlasTimestepMin: 1 / 2_000,
	atlasTimestepMax: 1 / 30,
	atlasMaxStepsPerCell: 15_000,
	atlasMaxTotalCellSteps: 120_000_000
});

export function cloneConfiguration(
	configuration: Readonly<PendulumConfiguration>
): PendulumConfiguration {
	return {
		...configuration,
		initialState: cloneState(configuration.initialState),
		parameters: { ...configuration.parameters },
		atlas: { ...configuration.atlas }
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issue(issues: StateIssue[], path: string, value: unknown, message: string): void {
	issues.push({ path, value, message });
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNumber(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	path: string,
	issues: StateIssue[]
): number {
	if (value === undefined) return fallback;
	const parsed = finiteNumber(value);
	if (parsed === null) {
		issue(issues, path, value, 'Expected a finite number; the safe fallback was used.');
		return fallback;
	}
	const clamped = Math.min(maximum, Math.max(minimum, parsed));
	if (clamped !== parsed) {
		issue(issues, path, value, `Clamped to the safe range ${minimum}–${maximum}.`);
	}
	return clamped;
}

function readInteger(
	value: unknown,
	fallback: number,
	minimum: number,
	maximum: number,
	path: string,
	issues: StateIssue[]
): number {
	const number = readNumber(value, fallback, minimum, maximum, path, issues);
	const integer = Math.round(number);
	if (value !== undefined && integer !== number) {
		issue(issues, path, value, 'Rounded to the nearest safe integer.');
	}
	return integer;
}

function readAngle(value: unknown, fallback: number, path: string, issues: StateIssue[]): number {
	if (value === undefined) return fallback;
	const parsed = finiteNumber(value);
	if (parsed === null) {
		issue(issues, path, value, 'Expected a finite angle in radians; the fallback was used.');
		return fallback;
	}
	return boundedAngle(parsed);
}

function boundedAngle(value: number): number {
	if (value >= -Math.PI && value <= Math.PI) return Object.is(value, -0) ? 0 : value;
	return wrapAngle(value);
}

function readEnum<T extends string>(
	value: unknown,
	fallback: T,
	allowed: ReadonlySet<T>,
	path: string,
	issues: StateIssue[]
): T {
	if (value === undefined) return fallback;
	if (typeof value === 'string' && allowed.has(value as T)) return value as T;
	issue(issues, path, value, 'Unknown option; the safe fallback was used.');
	return fallback;
}

function normalizeState(
	value: unknown,
	fallback: Readonly<PendulumState>,
	path: string,
	issues: StateIssue[]
): PendulumState {
	if (!isRecord(value)) {
		if (value !== undefined) issue(issues, path, value, 'State must be an object.');
		return cloneState(fallback);
	}
	return {
		theta1: readAngle(value.theta1, fallback.theta1, `${path}.theta1`, issues),
		omega1: readNumber(
			value.omega1,
			fallback.omega1,
			-SAFE.angularVelocity,
			SAFE.angularVelocity,
			`${path}.omega1`,
			issues
		),
		theta2: readAngle(value.theta2, fallback.theta2, `${path}.theta2`, issues),
		omega2: readNumber(
			value.omega2,
			fallback.omega2,
			-SAFE.angularVelocity,
			SAFE.angularVelocity,
			`${path}.omega2`,
			issues
		)
	};
}

function normalizeParameters(
	value: unknown,
	fallback: Readonly<PendulumParameters>,
	issues: StateIssue[]
): PendulumParameters {
	if (!isRecord(value)) {
		if (value !== undefined) issue(issues, 'parameters', value, 'Parameters must be an object.');
		return { ...fallback };
	}
	return {
		m1: readNumber(value.m1, fallback.m1, SAFE.massMin, SAFE.massMax, 'parameters.m1', issues),
		m2: readNumber(value.m2, fallback.m2, SAFE.massMin, SAFE.massMax, 'parameters.m2', issues),
		l1: readNumber(value.l1, fallback.l1, SAFE.lengthMin, SAFE.lengthMax, 'parameters.l1', issues),
		l2: readNumber(value.l2, fallback.l2, SAFE.lengthMin, SAFE.lengthMax, 'parameters.l2', issues),
		g: readNumber(value.g, fallback.g, SAFE.gravityMin, SAFE.gravityMax, 'parameters.g', issues)
	};
}

function normalizeAtlas(
	value: unknown,
	fallback: Readonly<AtlasConfiguration>,
	issues: StateIssue[]
): AtlasConfiguration {
	if (!isRecord(value)) {
		if (value !== undefined) issue(issues, 'atlas', value, 'Atlas settings must be an object.');
		return { ...fallback };
	}
	let theta1Min = readAngle(value.theta1Min, fallback.theta1Min, 'atlas.theta1Min', issues);
	let theta1Max = readAngle(value.theta1Max, fallback.theta1Max, 'atlas.theta1Max', issues);
	let theta2Min = readAngle(value.theta2Min, fallback.theta2Min, 'atlas.theta2Min', issues);
	let theta2Max = readAngle(value.theta2Max, fallback.theta2Max, 'atlas.theta2Max', issues);

	// +π wraps to −π, but it is a meaningful inclusive upper atlas boundary.
	if (value.theta1Max === Math.PI) theta1Max = Math.PI;
	if (value.theta2Max === Math.PI) theta2Max = Math.PI;
	if (!(theta1Min < theta1Max)) {
		issue(issues, 'atlas.theta1Bounds', [theta1Min, theta1Max], 'Invalid bounds were reset.');
		theta1Min = fallback.theta1Min;
		theta1Max = fallback.theta1Max;
	}
	if (!(theta2Min < theta2Max)) {
		issue(issues, 'atlas.theta2Bounds', [theta2Min, theta2Max], 'Invalid bounds were reset.');
		theta2Min = fallback.theta2Min;
		theta2Max = fallback.theta2Max;
	}

	const atlas: AtlasConfiguration = {
		theta1Min,
		theta1Max,
		theta2Min,
		theta2Max,
		resolution: readInteger(
			value.resolution,
			fallback.resolution,
			SAFE.atlasResolutionMin,
			SAFE.atlasResolutionMax,
			'atlas.resolution',
			issues
		),
		fixedOmega1: readNumber(
			value.fixedOmega1,
			fallback.fixedOmega1,
			-SAFE.atlasAngularVelocity,
			SAFE.atlasAngularVelocity,
			'atlas.fixedOmega1',
			issues
		),
		fixedOmega2: readNumber(
			value.fixedOmega2,
			fallback.fixedOmega2,
			-SAFE.atlasAngularVelocity,
			SAFE.atlasAngularVelocity,
			'atlas.fixedOmega2',
			issues
		),
		perturbationDimension: readEnum(
			value.perturbationDimension,
			fallback.perturbationDimension,
			PERTURBATION_DIMENSIONS,
			'atlas.perturbationDimension',
			issues
		),
		perturbationMagnitude: readNumber(
			value.perturbationMagnitude,
			fallback.perturbationMagnitude,
			SAFE.perturbationMin,
			SAFE.perturbationMax,
			'atlas.perturbationMagnitude',
			issues
		),
		divergenceThreshold: readNumber(
			value.divergenceThreshold,
			fallback.divergenceThreshold,
			SAFE.atlasThresholdMin,
			SAFE.atlasThresholdMax,
			'atlas.divergenceThreshold',
			issues
		),
		timeCap: readNumber(
			value.timeCap,
			fallback.timeCap,
			SAFE.atlasTimeCapMin,
			SAFE.atlasTimeCapMax,
			'atlas.timeCap',
			issues
		),
		timestep: readNumber(
			value.timestep,
			fallback.timestep,
			SAFE.atlasTimestepMin,
			SAFE.atlasTimestepMax,
			'atlas.timestep',
			issues
		)
	};
	const maximumStepCount = Math.min(
		SAFE.atlasMaxStepsPerCell,
		Math.floor(SAFE.atlasMaxTotalCellSteps / (atlas.resolution * atlas.resolution))
	);
	const maximumSafeTimeCap = maximumStepCount * atlas.timestep;
	if (atlas.timeCap > maximumSafeTimeCap) {
		issue(
			issues,
			'atlas.timeCap',
			atlas.timeCap,
			'Time cap was reduced to keep the atlas experiment within its bounded work budget.'
		);
		atlas.timeCap = maximumSafeTimeCap;
	}

	if (value.selectedTheta1 !== undefined) {
		const selected = finiteNumber(value.selectedTheta1);
		if (selected === null) {
			issue(
				issues,
				'atlas.selectedTheta1',
				value.selectedTheta1,
				'Expected a finite selected angle; the selection was omitted.'
			);
			if (fallback.selectedTheta1 !== undefined) atlas.selectedTheta1 = fallback.selectedTheta1;
		} else {
			atlas.selectedTheta1 = Math.min(theta1Max, Math.max(theta1Min, boundedAngle(selected)));
		}
	} else if (fallback.selectedTheta1 !== undefined) {
		atlas.selectedTheta1 = fallback.selectedTheta1;
	}
	if (value.selectedTheta2 !== undefined) {
		const selected = finiteNumber(value.selectedTheta2);
		if (selected === null) {
			issue(
				issues,
				'atlas.selectedTheta2',
				value.selectedTheta2,
				'Expected a finite selected angle; the selection was omitted.'
			);
			if (fallback.selectedTheta2 !== undefined) atlas.selectedTheta2 = fallback.selectedTheta2;
		} else {
			atlas.selectedTheta2 = Math.min(theta2Max, Math.max(theta2Min, boundedAngle(selected)));
		}
	} else if (fallback.selectedTheta2 !== undefined) {
		atlas.selectedTheta2 = fallback.selectedTheta2;
	}
	return atlas;
}

export function normalizeConfiguration(
	input: unknown,
	fallback: Readonly<PendulumConfiguration> = createDefaultConfiguration()
): ConfigurationResult {
	const issues: StateIssue[] = [];
	if (!isRecord(input)) {
		if (input !== undefined) issue(issues, '', input, 'Configuration must be an object.');
		return {
			configuration: cloneConfiguration(fallback),
			issues,
			unsupportedVersion: false
		};
	}

	let preset = fallback.preset;
	if (input.preset !== undefined) {
		if (isPresetId(input.preset)) preset = input.preset;
		else issue(issues, 'preset', input.preset, 'Unknown preset; the known fallback was used.');
	}
	const configuration: PendulumConfiguration = {
		mode: readEnum(input.mode, fallback.mode, MODES, 'mode', issues),
		preset,
		initialState: normalizeState(input.initialState, fallback.initialState, 'initialState', issues),
		parameters: normalizeParameters(input.parameters, fallback.parameters, issues),
		integrator: readEnum(input.integrator, fallback.integrator, INTEGRATORS, 'integrator', issues),
		timestep: readNumber(
			input.timestep,
			fallback.timestep,
			MIN_TIMESTEP,
			MAX_TIMESTEP,
			'timestep',
			issues
		),
		speed: readNumber(input.speed, fallback.speed, SAFE.speedMin, SAFE.speedMax, 'speed', issues),
		trailLength: readInteger(
			input.trailLength,
			fallback.trailLength,
			120,
			SAFE.trailMax,
			'trailLength',
			issues
		),
		perturbationDimension: readEnum(
			input.perturbationDimension,
			fallback.perturbationDimension,
			PERTURBATION_DIMENSIONS,
			'perturbationDimension',
			issues
		),
		perturbationMagnitude: readNumber(
			input.perturbationMagnitude,
			fallback.perturbationMagnitude,
			SAFE.perturbationMin,
			SAFE.perturbationMax,
			'perturbationMagnitude',
			issues
		),
		atlas: normalizeAtlas(input.atlas, fallback.atlas, issues)
	};
	return { configuration, issues, unsupportedVersion: false };
}

function numberText(value: number): string {
	return Object.is(value, -0) ? '0' : value.toString();
}

export function serializeUrlState(input: Readonly<PendulumConfiguration>): URLSearchParams {
	const configuration = normalizeConfiguration(input, createDefaultConfiguration()).configuration;
	const { initialState: state, parameters, atlas } = configuration;
	const params = new URLSearchParams();
	params.set('v', String(URL_STATE_VERSION));
	params.set('mode', configuration.mode);
	params.set('preset', configuration.preset);
	params.set('th1', numberText(state.theta1));
	params.set('om1', numberText(state.omega1));
	params.set('th2', numberText(state.theta2));
	params.set('om2', numberText(state.omega2));
	params.set('m1', numberText(parameters.m1));
	params.set('m2', numberText(parameters.m2));
	params.set('l1', numberText(parameters.l1));
	params.set('l2', numberText(parameters.l2));
	params.set('g', numberText(parameters.g));
	params.set('int', configuration.integrator);
	params.set('dt', numberText(configuration.timestep));
	params.set('speed', numberText(configuration.speed));
	params.set('trail', String(configuration.trailLength));
	params.set('pdim', configuration.perturbationDimension);
	params.set('eps', numberText(configuration.perturbationMagnitude));
	params.set('a1min', numberText(atlas.theta1Min));
	params.set('a1max', numberText(atlas.theta1Max));
	params.set('a2min', numberText(atlas.theta2Min));
	params.set('a2max', numberText(atlas.theta2Max));
	params.set('ares', String(atlas.resolution));
	params.set('aom1', numberText(atlas.fixedOmega1));
	params.set('aom2', numberText(atlas.fixedOmega2));
	params.set('apdim', atlas.perturbationDimension);
	params.set('aeps', numberText(atlas.perturbationMagnitude));
	params.set('ath', numberText(atlas.divergenceThreshold));
	params.set('acap', numberText(atlas.timeCap));
	params.set('adt', numberText(atlas.timestep));
	if (atlas.selectedTheta1 !== undefined) params.set('sel1', numberText(atlas.selectedTheta1));
	if (atlas.selectedTheta2 !== undefined) params.set('sel2', numberText(atlas.selectedTheta2));
	return params;
}

function queryFromString(source: string): string {
	const question = source.indexOf('?');
	let query = question >= 0 ? source.slice(question + 1) : source.replace(/^\?/u, '');
	const hash = query.indexOf('#');
	if (hash >= 0) query = query.slice(0, hash);
	return query;
}

function getFirst(params: URLSearchParams, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = params.get(key);
		if (value !== null) return value;
	}
	return undefined;
}

function numericText(value: string | undefined): number | string | undefined {
	if (value === undefined) return undefined;
	if (value.trim() === '' || value.length > 64) return value;
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.trim())) return value;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : value;
}

function legacyMode(value: string | undefined): string | undefined {
	if (value === 'pendulum-lab') return 'lab';
	if (value === 'shadow-futures') return 'shadow';
	if (value === 'prediction-horizon-atlas') return 'atlas';
	if (value === 'phase-space-observatory') return 'phase-space';
	return value;
}

export function parseUrlState(
	source: string | URL | URLSearchParams,
	fallback: Readonly<PendulumConfiguration> = createDefaultConfiguration()
): ConfigurationResult {
	const query =
		typeof source === 'string'
			? queryFromString(source)
			: source instanceof URL
				? source.search.slice(1)
				: source.toString();
	if (query.length > MAX_URL_STATE_LENGTH) {
		return {
			configuration: cloneConfiguration(fallback),
			issues: [
				{
					path: '',
					value: `${query.length} characters`,
					message: `URL state exceeds the ${MAX_URL_STATE_LENGTH}-character safety limit.`
				}
			],
			unsupportedVersion: false
		};
	}
	const params = new URLSearchParams(query);
	const rawVersion = getFirst(params, 'v', 'version');
	const version = rawVersion === undefined ? URL_STATE_VERSION : numericText(rawVersion);
	if (version !== URL_STATE_VERSION) {
		return {
			configuration: cloneConfiguration(fallback),
			issues: [
				{
					path: 'version',
					value: rawVersion,
					message: `Unsupported URL state version; version ${URL_STATE_VERSION} defaults were restored.`
				}
			],
			unsupportedVersion: true
		};
	}

	const candidate = {
		mode: legacyMode(getFirst(params, 'mode')),
		preset: getFirst(params, 'preset'),
		initialState: {
			theta1: numericText(getFirst(params, 'th1', 'theta1')),
			omega1: numericText(getFirst(params, 'om1', 'omega1')),
			theta2: numericText(getFirst(params, 'th2', 'theta2')),
			omega2: numericText(getFirst(params, 'om2', 'omega2'))
		},
		parameters: {
			m1: numericText(getFirst(params, 'm1')),
			m2: numericText(getFirst(params, 'm2')),
			l1: numericText(getFirst(params, 'l1')),
			l2: numericText(getFirst(params, 'l2')),
			g: numericText(getFirst(params, 'g'))
		},
		integrator: getFirst(params, 'int', 'integrator'),
		timestep: numericText(getFirst(params, 'dt', 'timestep')),
		speed: numericText(getFirst(params, 'speed')),
		trailLength: numericText(getFirst(params, 'trail', 'trailLength')),
		perturbationDimension: getFirst(params, 'pdim', 'perturbationDimension'),
		perturbationMagnitude: numericText(getFirst(params, 'eps', 'perturbationMagnitude')),
		atlas: {
			theta1Min: numericText(getFirst(params, 'a1min')),
			theta1Max: numericText(getFirst(params, 'a1max')),
			theta2Min: numericText(getFirst(params, 'a2min')),
			theta2Max: numericText(getFirst(params, 'a2max')),
			resolution: numericText(getFirst(params, 'ares')),
			fixedOmega1: numericText(getFirst(params, 'aom1')),
			fixedOmega2: numericText(getFirst(params, 'aom2')),
			perturbationDimension: getFirst(params, 'apdim'),
			perturbationMagnitude: numericText(getFirst(params, 'aeps')),
			divergenceThreshold: numericText(getFirst(params, 'ath')),
			timeCap: numericText(getFirst(params, 'acap')),
			timestep: numericText(getFirst(params, 'adt')),
			selectedTheta1: numericText(getFirst(params, 'sel1')),
			selectedTheta2: numericText(getFirst(params, 'sel2'))
		}
	};
	return normalizeConfiguration(candidate, fallback);
}

export const serializeConfiguration = serializeUrlState;
export const parseConfiguration = parseUrlState;

export function configurationFromUrl(
	source: string | URL | URLSearchParams,
	fallback?: Readonly<PendulumConfiguration>
): PendulumConfiguration {
	return parseUrlState(source, fallback).configuration;
}
