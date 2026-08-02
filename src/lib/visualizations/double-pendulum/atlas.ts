import { lowerBobSeparation } from './analysis';
import { createRk4Workspace, rk4StepInto } from './integrators';
import type { Rk4Workspace } from './integrators';
import type { PendulumParameters, PendulumState } from './types';

export const ATLAS_LIMITS = {
	minResolution: 2,
	maxResolution: 256,
	maxCells: 65_536,
	maxRowsPerChunk: 4,
	minMass: 1e-4,
	maxMass: 100,
	minLength: 1e-3,
	maxLength: 100,
	minGravity: 1e-3,
	maxGravity: 100,
	maxAngularVelocity: 50,
	minPerturbation: 1e-12,
	maxPerturbation: 1e-2,
	minDivergenceThreshold: 1e-8,
	maxDivergenceThreshold: 100,
	minTime: 0.01,
	maxTime: 60,
	minDt: 1 / 2_000,
	maxDt: 1 / 30,
	maxStepsPerCell: 15_000,
	maxTotalCellSteps: 120_000_000,
	maxCacheEntries: 8
} as const;

export type AtlasPerturbationDimension = keyof PendulumState;

export interface AtlasAngularBounds {
	theta1Min: number;
	theta1Max: number;
	theta2Min: number;
	theta2Max: number;
}

export interface AtlasPerturbation {
	dimension: AtlasPerturbationDimension;
	magnitude: number;
}

/** Every field that changes the numerical experiment is explicit and cacheable. */
export interface AtlasSettings {
	bounds: AtlasAngularBounds;
	width: number;
	height: number;
	parameters: PendulumParameters;
	omega1: number;
	omega2: number;
	perturbation: AtlasPerturbation;
	divergenceThreshold: number;
	maxTime: number;
	dt: number;
	/** Scheduling only; deliberately excluded from the scientific cache key. */
	rowsPerChunk: number;
}

export interface AtlasCellResult {
	/** Simulated seconds until the selected lower-bob threshold is crossed. */
	horizon: number;
	/** True when the pair retained agreement through the whole time cap. */
	capped: boolean;
	steps: number;
}

export interface AtlasCellAngles {
	theta1: number;
	theta2: number;
}

export interface AtlasRowChunk {
	rowStart: number;
	rowCount: number;
	width: number;
	totalRows: number;
	completedRows: number;
	progress: number;
	horizons: Float32Array;
	capped: Uint8Array;
}

export interface AtlasGridResult {
	width: number;
	height: number;
	horizons: Float32Array;
	capped: Uint8Array;
}

interface AtlasCellWorkspace {
	primary: PendulumState;
	shadow: PendulumState;
	nextPrimary: PendulumState;
	nextShadow: PendulumState;
	primaryRk4: Rk4Workspace;
	shadowRk4: Rk4Workspace;
}

/**
 * Validates and snapshots settings before expensive allocation or computation.
 * Invalid requests are rejected; values are never silently clamped because that
 * would make the legend describe a different experiment from the one performed.
 */
export function validateAtlasSettings(value: unknown): AtlasSettings {
	if (!isRecord(value)) throw new TypeError('Atlas settings must be an object.');
	const bounds = requireRecord(value.bounds, 'bounds');
	const parameters = requireRecord(value.parameters, 'parameters');
	const perturbation = requireRecord(value.perturbation, 'perturbation');

	const theta1Min = boundedNumber(bounds.theta1Min, -Math.PI, Math.PI, 'bounds.theta1Min');
	const theta1Max = boundedNumber(bounds.theta1Max, -Math.PI, Math.PI, 'bounds.theta1Max');
	const theta2Min = boundedNumber(bounds.theta2Min, -Math.PI, Math.PI, 'bounds.theta2Min');
	const theta2Max = boundedNumber(bounds.theta2Max, -Math.PI, Math.PI, 'bounds.theta2Max');
	if (theta1Min >= theta1Max) throw new RangeError('theta1Min must be less than theta1Max.');
	if (theta2Min >= theta2Max) throw new RangeError('theta2Min must be less than theta2Max.');

	const width = boundedInteger(
		value.width,
		ATLAS_LIMITS.minResolution,
		ATLAS_LIMITS.maxResolution,
		'width'
	);
	const height = boundedInteger(
		value.height,
		ATLAS_LIMITS.minResolution,
		ATLAS_LIMITS.maxResolution,
		'height'
	);
	const cells = width * height;
	if (cells > ATLAS_LIMITS.maxCells) {
		throw new RangeError(`Atlas grids may contain at most ${ATLAS_LIMITS.maxCells} cells.`);
	}

	const m1 = boundedNumber(
		parameters.m1,
		ATLAS_LIMITS.minMass,
		ATLAS_LIMITS.maxMass,
		'parameters.m1'
	);
	const m2 = boundedNumber(
		parameters.m2,
		ATLAS_LIMITS.minMass,
		ATLAS_LIMITS.maxMass,
		'parameters.m2'
	);
	const l1 = boundedNumber(
		parameters.l1,
		ATLAS_LIMITS.minLength,
		ATLAS_LIMITS.maxLength,
		'parameters.l1'
	);
	const l2 = boundedNumber(
		parameters.l2,
		ATLAS_LIMITS.minLength,
		ATLAS_LIMITS.maxLength,
		'parameters.l2'
	);
	const g = boundedNumber(
		parameters.g,
		ATLAS_LIMITS.minGravity,
		ATLAS_LIMITS.maxGravity,
		'parameters.g'
	);
	const omega1 = boundedNumber(
		value.omega1,
		-ATLAS_LIMITS.maxAngularVelocity,
		ATLAS_LIMITS.maxAngularVelocity,
		'omega1'
	);
	const omega2 = boundedNumber(
		value.omega2,
		-ATLAS_LIMITS.maxAngularVelocity,
		ATLAS_LIMITS.maxAngularVelocity,
		'omega2'
	);

	if (!isPerturbationDimension(perturbation.dimension)) {
		throw new TypeError('perturbation.dimension must name theta1, omega1, theta2, or omega2.');
	}
	const magnitude = boundedNumber(
		perturbation.magnitude,
		ATLAS_LIMITS.minPerturbation,
		ATLAS_LIMITS.maxPerturbation,
		'perturbation.magnitude'
	);
	const divergenceThreshold = boundedNumber(
		value.divergenceThreshold,
		ATLAS_LIMITS.minDivergenceThreshold,
		ATLAS_LIMITS.maxDivergenceThreshold,
		'divergenceThreshold'
	);
	const maxTime = boundedNumber(
		value.maxTime,
		ATLAS_LIMITS.minTime,
		ATLAS_LIMITS.maxTime,
		'maxTime'
	);
	const dt = boundedNumber(value.dt, ATLAS_LIMITS.minDt, ATLAS_LIMITS.maxDt, 'dt');
	if (dt > maxTime) throw new RangeError('dt must not exceed the atlas time cap.');
	const stepsPerCell = Math.ceil(maxTime / dt);
	if (stepsPerCell > ATLAS_LIMITS.maxStepsPerCell) {
		throw new RangeError(
			`Atlas experiments may use at most ${ATLAS_LIMITS.maxStepsPerCell} steps per cell.`
		);
	}
	if (stepsPerCell * cells > ATLAS_LIMITS.maxTotalCellSteps) {
		throw new RangeError(
			`This resolution and time-step combination exceeds the ${ATLAS_LIMITS.maxTotalCellSteps.toLocaleString('en')} cell-step safety cap.`
		);
	}
	const rowsPerChunk = boundedInteger(
		value.rowsPerChunk,
		1,
		ATLAS_LIMITS.maxRowsPerChunk,
		'rowsPerChunk'
	);

	return {
		bounds: { theta1Min, theta1Max, theta2Min, theta2Max },
		width,
		height,
		parameters: { m1, m2, l1, l2, g },
		omega1,
		omega2,
		perturbation: { dimension: perturbation.dimension, magnitude },
		divergenceThreshold,
		maxTime,
		dt,
		rowsPerChunk
	};
}

export function isAtlasSettings(value: unknown): value is AtlasSettings {
	try {
		validateAtlasSettings(value);
		return true;
	} catch {
		return false;
	}
}

/** Returns the angular centre represented by a map cell (row zero is the top). */
export function atlasCellAngles(
	settingsInput: AtlasSettings,
	column: number,
	row: number
): AtlasCellAngles {
	const settings = validateAtlasSettings(settingsInput);
	boundedInteger(column, 0, settings.width - 1, 'column');
	boundedInteger(row, 0, settings.height - 1, 'row');
	const horizontal = (column + 0.5) / settings.width;
	const vertical = (row + 0.5) / settings.height;
	return {
		theta1:
			settings.bounds.theta1Min +
			horizontal * (settings.bounds.theta1Max - settings.bounds.theta1Min),
		theta2:
			settings.bounds.theta2Max - vertical * (settings.bounds.theta2Max - settings.bounds.theta2Min)
	};
}

/**
 * Runs one deterministic primary/shadow experiment. Crossing time is linearly
 * interpolated between fixed RK4 samples; a capped result is exactly maxTime.
 */
export function computePredictionHorizon(
	settingsInput: AtlasSettings,
	theta1: number,
	theta2: number
): AtlasCellResult {
	const settings = validateAtlasSettings(settingsInput);
	boundedNumber(theta1, settings.bounds.theta1Min, settings.bounds.theta1Max, 'theta1');
	boundedNumber(theta2, settings.bounds.theta2Min, settings.bounds.theta2Max, 'theta2');
	return computePredictionHorizonValidated(settings, theta1, theta2, createAtlasCellWorkspace());
}

function computePredictionHorizonValidated(
	settings: AtlasSettings,
	theta1: number,
	theta2: number,
	workspace: AtlasCellWorkspace
): AtlasCellResult {
	let primary = workspace.primary;
	primary.theta1 = theta1;
	primary.omega1 = settings.omega1;
	primary.theta2 = theta2;
	primary.omega2 = settings.omega2;
	let shadow = workspace.shadow;
	copyState(primary, shadow);
	shadow[settings.perturbation.dimension] += settings.perturbation.magnitude;
	let nextPrimary = workspace.nextPrimary;
	let nextShadow = workspace.nextShadow;

	let previousSeparation = lowerBobSeparation(primary, shadow, settings.parameters);
	assertFiniteSeparation(previousSeparation);
	if (previousSeparation >= settings.divergenceThreshold) {
		return { horizon: 0, capped: false, steps: 0 };
	}

	let elapsed = 0;
	let steps = 0;
	const maximumSteps = Math.ceil(settings.maxTime / settings.dt);
	const completionTolerance = Math.max(Number.EPSILON, settings.maxTime * Number.EPSILON * 8);
	for (let stepIndex = 0; stepIndex < maximumSteps; stepIndex += 1) {
		const remaining = settings.maxTime - elapsed;
		if (remaining <= completionTolerance) break;
		const stepDt = Math.min(settings.dt, remaining);
		rk4StepInto(primary, settings.parameters, stepDt, nextPrimary, workspace.primaryRk4);
		rk4StepInto(shadow, settings.parameters, stepDt, nextShadow, workspace.shadowRk4);
		steps += 1;
		assertFiniteState(nextPrimary);
		assertFiniteState(nextShadow);

		const previousPrimary = primary;
		primary = nextPrimary;
		nextPrimary = previousPrimary;
		const previousShadow = shadow;
		shadow = nextShadow;
		nextShadow = previousShadow;

		const separation = lowerBobSeparation(primary, shadow, settings.parameters);
		assertFiniteSeparation(separation);
		if (separation >= settings.divergenceThreshold) {
			const increase = separation - previousSeparation;
			const fraction =
				increase > 0 ? clamp01((settings.divergenceThreshold - previousSeparation) / increase) : 1;
			return {
				horizon: Math.min(settings.maxTime, elapsed + stepDt * fraction),
				capped: false,
				steps
			};
		}

		previousSeparation = separation;
		elapsed += stepDt;
	}

	return { horizon: settings.maxTime, capped: true, steps };
}

/** Computes a bounded contiguous row batch suitable for one transferable message. */
export function computeAtlasRows(
	settingsInput: AtlasSettings,
	rowStart: number,
	rowCount: number
): AtlasRowChunk {
	const settings = validateAtlasSettings(settingsInput);
	boundedInteger(rowStart, 0, settings.height - 1, 'rowStart');
	boundedInteger(rowCount, 1, ATLAS_LIMITS.maxRowsPerChunk, 'rowCount');
	if (rowStart + rowCount > settings.height) {
		throw new RangeError('The requested atlas row chunk extends beyond the grid.');
	}

	const horizons = new Float32Array(settings.width * rowCount);
	const capped = new Uint8Array(settings.width * rowCount);
	const cellWorkspace = createAtlasCellWorkspace();
	let offset = 0;
	for (let localRow = 0; localRow < rowCount; localRow += 1) {
		const row = rowStart + localRow;
		for (let column = 0; column < settings.width; column += 1) {
			const angles = atlasCellAnglesUnchecked(settings, column, row);
			const result = computePredictionHorizonValidated(
				settings,
				angles.theta1,
				angles.theta2,
				cellWorkspace
			);
			horizons[offset] = result.horizon;
			capped[offset] = result.capped ? 1 : 0;
			offset += 1;
		}
	}

	const completedRows = rowStart + rowCount;
	return {
		rowStart,
		rowCount,
		width: settings.width,
		totalRows: settings.height,
		completedRows,
		progress: completedRows / settings.height,
		horizons,
		capped
	};
}

/** Stable key containing every field that changes the numerical experiment. */
export function atlasCacheKey(settingsInput: AtlasSettings): string {
	const settings = validateAtlasSettings(settingsInput);
	return `double-pendulum-atlas-v1:${JSON.stringify([
		settings.bounds.theta1Min,
		settings.bounds.theta1Max,
		settings.bounds.theta2Min,
		settings.bounds.theta2Max,
		settings.width,
		settings.height,
		settings.parameters.m1,
		settings.parameters.m2,
		settings.parameters.l1,
		settings.parameters.l2,
		settings.parameters.g,
		settings.omega1,
		settings.omega2,
		settings.perturbation.dimension,
		settings.perturbation.magnitude,
		settings.divergenceThreshold,
		settings.maxTime,
		settings.dt
	])}`;
}

/** Small LRU cache for completed grids; values are copied to avoid detached buffers. */
export class AtlasMemoryCache {
	private readonly entries = new Map<string, AtlasGridResult>();

	constructor(private readonly maxEntries = 4) {
		boundedInteger(maxEntries, 1, ATLAS_LIMITS.maxCacheEntries, 'maxEntries');
	}

	get size(): number {
		return this.entries.size;
	}

	get(settings: AtlasSettings): AtlasGridResult | undefined {
		const key = atlasCacheKey(settings);
		const stored = this.entries.get(key);
		if (!stored) return undefined;
		this.entries.delete(key);
		this.entries.set(key, stored);
		return cloneGrid(stored);
	}

	set(settingsInput: AtlasSettings, result: AtlasGridResult): void {
		const settings = validateAtlasSettings(settingsInput);
		validateGrid(settings, result);
		const key = atlasCacheKey(settings);
		this.entries.delete(key);
		this.entries.set(key, cloneGrid(result));
		while (this.entries.size > this.maxEntries) {
			const oldestKey = this.entries.keys().next().value as string | undefined;
			if (oldestKey === undefined) break;
			this.entries.delete(oldestKey);
		}
	}

	delete(settings: AtlasSettings): boolean {
		return this.entries.delete(atlasCacheKey(settings));
	}

	clear(): void {
		this.entries.clear();
	}
}

function atlasCellAnglesUnchecked(
	settings: AtlasSettings,
	column: number,
	row: number
): AtlasCellAngles {
	const horizontal = (column + 0.5) / settings.width;
	const vertical = (row + 0.5) / settings.height;
	return {
		theta1:
			settings.bounds.theta1Min +
			horizontal * (settings.bounds.theta1Max - settings.bounds.theta1Min),
		theta2:
			settings.bounds.theta2Max - vertical * (settings.bounds.theta2Max - settings.bounds.theta2Min)
	};
}

function createAtlasCellWorkspace(): AtlasCellWorkspace {
	return {
		primary: emptyState(),
		shadow: emptyState(),
		nextPrimary: emptyState(),
		nextShadow: emptyState(),
		primaryRk4: createRk4Workspace(),
		shadowRk4: createRk4Workspace()
	};
}

function emptyState(): PendulumState {
	return { theta1: 0, omega1: 0, theta2: 0, omega2: 0 };
}

function copyState(source: Readonly<PendulumState>, target: PendulumState): void {
	target.theta1 = source.theta1;
	target.omega1 = source.omega1;
	target.theta2 = source.theta2;
	target.omega2 = source.omega2;
}

function validateGrid(settings: AtlasSettings, result: AtlasGridResult): void {
	if (result.width !== settings.width || result.height !== settings.height) {
		throw new RangeError('Cached atlas dimensions do not match the experiment settings.');
	}
	const cells = settings.width * settings.height;
	if (!(result.horizons instanceof Float32Array) || result.horizons.length !== cells) {
		throw new RangeError('Cached atlas horizons have the wrong length.');
	}
	if (!(result.capped instanceof Uint8Array) || result.capped.length !== cells) {
		throw new RangeError('Cached atlas cap markers have the wrong length.');
	}
	if (
		!result.horizons.every(
			(value) =>
				Number.isFinite(value) &&
				value >= 0 &&
				value <= settings.maxTime + Math.max(1e-7, settings.maxTime * 1e-6)
		)
	) {
		throw new RangeError('Cached atlas horizons contain an invalid value.');
	}
	if (!result.capped.every((value) => value === 0 || value === 1)) {
		throw new RangeError('Cached atlas cap markers must be zero or one.');
	}
}

function cloneGrid(result: AtlasGridResult): AtlasGridResult {
	return {
		width: result.width,
		height: result.height,
		horizons: result.horizons.slice(),
		capped: result.capped.slice()
	};
}

function assertFiniteState(state: Readonly<PendulumState>): void {
	if (
		!Number.isFinite(state.theta1) ||
		!Number.isFinite(state.omega1) ||
		!Number.isFinite(state.theta2) ||
		!Number.isFinite(state.omega2)
	) {
		throw new Error('Atlas integration became non-finite. Try a smaller timestep.');
	}
}

function assertFiniteSeparation(value: number): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error('Atlas lower-bob separation became non-finite.');
	}
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedNumber(value: unknown, minimum: number, maximum: number, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new TypeError(`${label} must be a finite number.`);
	}
	if (value < minimum || value > maximum) {
		throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
	}
	return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
	if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer.`);
	const number = Number(value);
	if (number < minimum || number > maximum) {
		throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
	}
	return number;
}

function isPerturbationDimension(value: unknown): value is AtlasPerturbationDimension {
	return value === 'theta1' || value === 'omega1' || value === 'theta2' || value === 'omega2';
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
