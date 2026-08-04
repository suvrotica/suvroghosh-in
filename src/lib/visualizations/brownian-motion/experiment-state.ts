import { MODEL_REGISTRY, type ProcessParameterMap } from './model-registry';
import type { CircleObstacle } from './models/obstacles';
import {
	PROCESS_IDS,
	type BoundaryMode,
	type InitialCondition,
	type ProcessId,
	type RectangleBounds
} from './types';

export const BROWNIAN_EXPERIMENT_URL_VERSION = 2 as const;
export const BROWNIAN_QUERY_PREFIX = 'bm_';

const LEGACY_BROWNIAN_EXPERIMENT_URL_VERSION = 1;
const DEFAULT_INITIAL_CONDITION: InitialCondition = Object.freeze({ x: 0, y: 0, spread: 0 });
const DEFAULT_BOUNDARY_BOUNDS: RectangleBounds = Object.freeze({
	minX: -6,
	maxX: 6,
	minY: -4,
	maxY: 4
});
const DEFAULT_PHYSICAL_VALUES: ExperimentPhysicalValues = Object.freeze({
	temperatureKelvin: 298.15,
	viscosityPas: 0.00089,
	radiusMetres: 0.5e-6
});
const MAXIMUM_OBSTACLES = 32;

export type LaboratoryDiagnostic =
	| 'trajectory'
	| 'distribution'
	| 'msd'
	| 'autocorrelation'
	| 'phase-space'
	| 'first-passage';

export interface ExperimentCameraState {
	readonly centreX: number;
	readonly centreY: number;
	readonly zoom: number;
	readonly autoFit: boolean;
}

export interface ExperimentPhysicalValues {
	readonly temperatureKelvin: number;
	readonly viscosityPas: number;
	readonly radiusMetres: number;
}

export interface BrownianExperimentUrlState {
	readonly version: typeof BROWNIAN_EXPERIMENT_URL_VERSION;
	readonly processId: ProcessId;
	readonly seed: string;
	readonly timestep: number;
	readonly particleCount: number;
	/** Finite observation horizon used by the censored first-passage ensemble. */
	readonly observationHorizon?: number;
	readonly parameters: Readonly<Record<string, unknown>>;
	readonly initialCondition: InitialCondition;
	readonly boundaryMode: BoundaryMode;
	/** Present exactly when a finite boundary mode needs a rectangle. */
	readonly boundaryBounds?: RectangleBounds;
	readonly diagnostic: LaboratoryDiagnostic;
	readonly preset?: string;
	readonly physicalUnits: boolean;
	readonly physicalValues: ExperimentPhysicalValues;
	readonly camera: ExperimentCameraState;
}

/**
 * The encoder accepts the pre-v2 in-memory shape while callers migrate. A
 * decoded state is always complete and normalised to the current version.
 */
export type BrownianExperimentUrlInputState = Omit<
	BrownianExperimentUrlState,
	'initialCondition' | 'physicalUnits' | 'physicalValues'
> &
	Partial<
		Pick<BrownianExperimentUrlState, 'initialCondition' | 'physicalUnits' | 'physicalValues'>
	>;

const DIAGNOSTICS = [
	'trajectory',
	'distribution',
	'msd',
	'autocorrelation',
	'phase-space',
	'first-passage'
] as const satisfies readonly LaboratoryDiagnostic[];

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function finiteValue(value: unknown, minimum: number, maximum: number, fallback: number): number {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim() !== ''
				? Number(value)
				: Number.NaN;
	return Number.isFinite(parsed) ? clamp(parsed, minimum, maximum) : fallback;
}

function finiteNumber(
	value: string | null,
	minimum: number,
	maximum: number,
	fallback: number
): number {
	if (value === null) return fallback;
	return finiteValue(value, minimum, maximum, fallback);
}

function compactNumber(value: number): string {
	return String(Object.is(value, -0) ? 0 : value);
}

function compactTuple(values: readonly number[]): string {
	return values.map(compactNumber).join(',');
}

function normaliseInitialCondition(value?: InitialCondition): InitialCondition {
	return {
		x: finiteValue(value?.x, -1_000, 1_000, DEFAULT_INITIAL_CONDITION.x),
		y: finiteValue(value?.y, -1_000, 1_000, DEFAULT_INITIAL_CONDITION.y),
		spread: finiteValue(value?.spread, 0, 1_000, DEFAULT_INITIAL_CONDITION.spread)
	};
}

function decodeInitialCondition(raw: string | null): InitialCondition {
	if (raw === null) return { ...DEFAULT_INITIAL_CONDITION };
	const values = raw.split(',');
	return normaliseInitialCondition({
		x: finiteValue(values[0], -1_000, 1_000, DEFAULT_INITIAL_CONDITION.x),
		y: finiteValue(values[1], -1_000, 1_000, DEFAULT_INITIAL_CONDITION.y),
		spread: finiteValue(values[2], 0, 1_000, DEFAULT_INITIAL_CONDITION.spread)
	});
}

function normaliseBoundaryBounds(value?: RectangleBounds): RectangleBounds {
	const candidate = {
		minX: finiteValue(value?.minX, -1_000, 1_000, DEFAULT_BOUNDARY_BOUNDS.minX),
		maxX: finiteValue(value?.maxX, -1_000, 1_000, DEFAULT_BOUNDARY_BOUNDS.maxX),
		minY: finiteValue(value?.minY, -1_000, 1_000, DEFAULT_BOUNDARY_BOUNDS.minY),
		maxY: finiteValue(value?.maxY, -1_000, 1_000, DEFAULT_BOUNDARY_BOUNDS.maxY)
	};
	if (candidate.maxX <= candidate.minX || candidate.maxY <= candidate.minY) {
		return { ...DEFAULT_BOUNDARY_BOUNDS };
	}
	return candidate;
}

function decodeBoundaryBounds(raw: string | null): RectangleBounds {
	if (raw === null) return { ...DEFAULT_BOUNDARY_BOUNDS };
	const values = raw.split(',');
	return normaliseBoundaryBounds({
		minX: finiteValue(values[0], -1_000, 1_000, DEFAULT_BOUNDARY_BOUNDS.minX),
		maxX: finiteValue(values[1], -1_000, 1_000, DEFAULT_BOUNDARY_BOUNDS.maxX),
		minY: finiteValue(values[2], -1_000, 1_000, DEFAULT_BOUNDARY_BOUNDS.minY),
		maxY: finiteValue(values[3], -1_000, 1_000, DEFAULT_BOUNDARY_BOUNDS.maxY)
	});
}

function normaliseObstacle(value: unknown): CircleObstacle | null {
	if (!value || typeof value !== 'object') return null;
	const obstacle = value as Partial<CircleObstacle>;
	const numeric = (candidate: unknown): number =>
		typeof candidate === 'string' && candidate.trim() === '' ? Number.NaN : Number(candidate);
	const x = numeric(obstacle.x);
	const y = numeric(obstacle.y);
	const radius = numeric(obstacle.radius);
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return null;
	return {
		x: clamp(x, -1_000, 1_000),
		y: clamp(y, -1_000, 1_000),
		radius: clamp(radius, 0.0001, 1_000)
	};
}

function normaliseObstacles(value: unknown): CircleObstacle[] {
	if (!Array.isArray(value)) return [];
	return value
		.slice(0, MAXIMUM_OBSTACLES)
		.map(normaliseObstacle)
		.filter((obstacle): obstacle is CircleObstacle => obstacle !== null);
}

function encodeObstacles(value: unknown): string {
	return normaliseObstacles(value)
		.map((obstacle) => compactTuple([obstacle.x, obstacle.y, obstacle.radius]))
		.join(';');
}

function decodeObstacles(raw: string | null): CircleObstacle[] {
	if (!raw) return [];
	return raw
		.split(';')
		.slice(0, MAXIMUM_OBSTACLES)
		.map((tuple) => {
			const values = tuple.split(',');
			if (values.length !== 3) return null;
			return normaliseObstacle({ x: values[0], y: values[1], radius: values[2] });
		})
		.filter((obstacle): obstacle is CircleObstacle => obstacle !== null);
}

function normalisePhysicalValues(
	value?: Partial<Record<keyof ExperimentPhysicalValues, unknown>>
): ExperimentPhysicalValues {
	return {
		temperatureKelvin: finiteValue(
			value?.temperatureKelvin,
			273.15,
			373.15,
			DEFAULT_PHYSICAL_VALUES.temperatureKelvin
		),
		viscosityPas: finiteValue(
			value?.viscosityPas,
			0.0002,
			0.005,
			DEFAULT_PHYSICAL_VALUES.viscosityPas
		),
		radiusMetres: finiteValue(
			value?.radiusMetres,
			0.05e-6,
			2e-6,
			DEFAULT_PHYSICAL_VALUES.radiusMetres
		)
	};
}

function decodePhysicalValues(url: URL): ExperimentPhysicalValues {
	const tuple = url.searchParams.get('bm_phys')?.split(',');
	return normalisePhysicalValues({
		temperatureKelvin: tuple?.[0] ?? url.searchParams.get('bm_p_temperatureKelvin') ?? undefined,
		viscosityPas: tuple?.[1] ?? url.searchParams.get('bm_p_viscosityPas') ?? undefined,
		radiusMetres: tuple?.[2] ?? url.searchParams.get('bm_p_radiusMetres') ?? undefined
	});
}

function cloneDefaultParameters<Id extends ProcessId>(id: Id): ProcessParameterMap[Id] {
	return JSON.parse(
		JSON.stringify(MODEL_REGISTRY[id].defaultParameters)
	) as ProcessParameterMap[Id];
}

export function removeBrownianExperimentParameters(url: URL): URL {
	for (const key of [...url.searchParams.keys()]) {
		if (key.startsWith(BROWNIAN_QUERY_PREFIX)) url.searchParams.delete(key);
	}
	return url;
}

export function cleanBrownianExperimentUrl(input: string | URL): URL {
	return removeBrownianExperimentParameters(new URL(input));
}

export function encodeBrownianExperimentUrl(
	base: string | URL,
	state: BrownianExperimentUrlInputState
): URL {
	const url = removeBrownianExperimentParameters(new URL(base));
	url.searchParams.set('bm_v', String(BROWNIAN_EXPERIMENT_URL_VERSION));
	url.searchParams.set('bm_mode', state.processId);
	url.searchParams.set('bm_seed', state.seed.trim().slice(0, 64));
	url.searchParams.set('bm_dt', state.timestep.toPrecision(6));
	url.searchParams.set('bm_n', String(Math.round(state.particleCount)));
	if (state.processId === 'first-passage' && state.observationHorizon !== undefined) {
		url.searchParams.set(
			'bm_horizon',
			compactNumber(finiteValue(state.observationHorizon, 0.25, 60, 8))
		);
	}
	url.searchParams.set('bm_boundary', state.boundaryMode);
	const initialCondition = normaliseInitialCondition(state.initialCondition);
	url.searchParams.set(
		'bm_init',
		compactTuple([initialCondition.x, initialCondition.y, initialCondition.spread])
	);
	if (state.boundaryMode !== 'unbounded') {
		const bounds = normaliseBoundaryBounds(state.boundaryBounds);
		url.searchParams.set(
			'bm_bounds',
			compactTuple([bounds.minX, bounds.maxX, bounds.minY, bounds.maxY])
		);
	}
	url.searchParams.set('bm_diag', state.diagnostic);
	if (state.preset) url.searchParams.set('bm_preset', state.preset.slice(0, 64));
	for (const [key, value] of Object.entries(state.parameters)) {
		if (key === 'temperatureKelvin' || key === 'viscosityPas' || key === 'radiusMetres') {
			continue;
		}
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			url.searchParams.set(`bm_p_${key}`, String(value));
		}
	}
	const obstacles = encodeObstacles(state.parameters.obstacles);
	if (obstacles) url.searchParams.set('bm_obs', obstacles);
	const physicalUnits = state.physicalUnits === true;
	url.searchParams.set('bm_physical', physicalUnits ? '1' : '0');
	const physicalValues = normalisePhysicalValues(
		state.physicalValues ?? {
			temperatureKelvin: Number(state.parameters.temperatureKelvin),
			viscosityPas: Number(state.parameters.viscosityPas),
			radiusMetres: Number(state.parameters.radiusMetres)
		}
	);
	if (physicalUnits || state.physicalValues) {
		url.searchParams.set(
			'bm_phys',
			compactTuple([
				physicalValues.temperatureKelvin,
				physicalValues.viscosityPas,
				physicalValues.radiusMetres
			])
		);
	}
	url.searchParams.set(
		'bm_cam',
		[
			state.camera.centreX.toFixed(3),
			state.camera.centreY.toFixed(3),
			state.camera.zoom.toFixed(3),
			state.camera.autoFit ? '1' : '0'
		].join(',')
	);
	return url;
}

/**
 * Decodes and validates only supported, reproducible state. Invalid individual
 * values are clamped or replaced; an invalid version/process rejects the whole
 * Brownian payload without disturbing unrelated query parameters.
 */
export function decodeBrownianExperimentUrl(
	input: string | URL
): BrownianExperimentUrlState | null {
	const url = new URL(input);
	const encodedVersion = Number(url.searchParams.get('bm_v'));
	if (
		encodedVersion !== LEGACY_BROWNIAN_EXPERIMENT_URL_VERSION &&
		encodedVersion !== BROWNIAN_EXPERIMENT_URL_VERSION
	) {
		return null;
	}
	const requestedProcess = url.searchParams.get('bm_mode');
	if (!requestedProcess || !PROCESS_IDS.includes(requestedProcess as ProcessId)) return null;
	const processId = requestedProcess as ProcessId;
	const definition = MODEL_REGISTRY[processId];
	const preset = url.searchParams.get('bm_preset')?.slice(0, 64) || undefined;
	let parameters = cloneDefaultParameters(processId) as unknown as Record<string, unknown>;

	for (const [key, fallback] of Object.entries(parameters)) {
		const raw = url.searchParams.get(`bm_p_${key}`);
		if (raw === null) continue;
		if (typeof fallback === 'number') {
			const control = definition.controls.find((candidate) => candidate.key === key);
			const parsed = Number(raw);
			if (Number.isFinite(parsed)) {
				parameters[key] = clamp(
					parsed,
					control?.minimum ?? -1_000_000,
					control?.maximum ?? 1_000_000
				);
			}
		} else if (typeof fallback === 'boolean') {
			parameters[key] = raw === 'true';
		} else if (typeof fallback === 'string') {
			const control = definition.controls.find((candidate) => candidate.key === key);
			const allowed = control?.options?.map((option) => String(option.value));
			if (!allowed || allowed.includes(raw)) parameters[key] = raw.slice(0, 64);
		}
	}
	if (Object.prototype.hasOwnProperty.call(parameters, 'obstacles')) {
		parameters.obstacles = decodeObstacles(url.searchParams.get('bm_obs'));
	}

	const timestep = finiteNumber(url.searchParams.get('bm_dt'), 0.0001, 0.05, 1 / 120);
	if (
		definition.validate(parameters as never, timestep).some((issue) => issue.severity === 'error')
	) {
		parameters = cloneDefaultParameters(processId) as unknown as Record<string, unknown>;
	}

	const maximumParticles = processId === 'fractional-brownian' ? 256 : 20_000;
	const particleCount = Math.round(
		finiteNumber(url.searchParams.get('bm_n'), 1, maximumParticles, 1)
	);
	const observationHorizon =
		processId === 'first-passage'
			? finiteNumber(url.searchParams.get('bm_horizon'), 0.25, 60, 8)
			: undefined;
	if (processId === 'fractional-brownian') parameters.trajectories = particleCount;

	const boundaryCandidate = url.searchParams.get('bm_boundary');
	const boundaryMode: BoundaryMode =
		boundaryCandidate === 'reflecting' ||
		boundaryCandidate === 'periodic' ||
		boundaryCandidate === 'absorbing'
			? boundaryCandidate
			: 'unbounded';
	const boundaryBounds =
		boundaryMode === 'unbounded'
			? undefined
			: decodeBoundaryBounds(url.searchParams.get('bm_bounds'));
	const initialCondition = decodeInitialCondition(url.searchParams.get('bm_init'));
	const physicalFlag = url.searchParams.get('bm_physical');
	const physicalUnits =
		physicalFlag === '1' || physicalFlag === 'true'
			? true
			: physicalFlag === '0' || physicalFlag === 'false'
				? false
				: encodedVersion === LEGACY_BROWNIAN_EXPERIMENT_URL_VERSION &&
					preset === 'colloidal-bead-water';
	const physicalValues = decodePhysicalValues(url);
	if (physicalUnits && processId === 'free-brownian') {
		parameters.temperatureKelvin = physicalValues.temperatureKelvin;
		parameters.viscosityPas = physicalValues.viscosityPas;
		parameters.radiusMetres = physicalValues.radiusMetres;
	}
	const diagnosticCandidate = url.searchParams.get('bm_diag');
	const diagnostic: LaboratoryDiagnostic = DIAGNOSTICS.includes(
		diagnosticCandidate as LaboratoryDiagnostic
	)
		? (diagnosticCandidate as LaboratoryDiagnostic)
		: 'trajectory';
	const cameraValues = url.searchParams.get('bm_cam')?.split(',');
	const camera: ExperimentCameraState = {
		centreX: finiteNumber(cameraValues?.[0] ?? null, -100, 100, 0),
		centreY: finiteNumber(cameraValues?.[1] ?? null, -100, 100, 0),
		zoom: finiteNumber(cameraValues?.[2] ?? null, 0.25, 12, 1),
		autoFit: cameraValues?.[3] !== '0'
	};

	return {
		version: BROWNIAN_EXPERIMENT_URL_VERSION,
		processId,
		seed: url.searchParams.get('bm_seed')?.trim().slice(0, 64) || 'indecision-1827',
		timestep,
		particleCount,
		observationHorizon,
		parameters,
		initialCondition,
		boundaryMode,
		boundaryBounds,
		diagnostic,
		preset,
		physicalUnits,
		physicalValues,
		camera
	};
}
