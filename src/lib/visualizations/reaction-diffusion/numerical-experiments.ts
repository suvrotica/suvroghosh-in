import { gridSpacing, stabilityNumber } from './constants';
import { ReactionDiffusionCpuEngine } from './engine';
import { calculateFieldMetrics } from './metrics';
import { cloneFieldState } from './initial';
import type { FieldMetrics, FieldState, GrayScottSetup } from './types';

export type NumericalExperimentKind = 'timestep' | 'resolution' | 'integrator' | 'unsafe';

export interface NumericalTrajectorySample {
	readonly modelTime: number;
	readonly baselineMeanU: number;
	readonly baselineMeanV: number;
	readonly comparisonMeanU: number | null;
	readonly comparisonMeanV: number | null;
	readonly referenceMeanV: number | null;
	readonly fieldDifference: number | null;
}

export interface NumericalComparisonResult {
	readonly kind: NumericalExperimentKind;
	readonly modelTime: number;
	readonly l2Difference: number | null;
	readonly maximumDifference: number | null;
	readonly meanUDifference: number | null;
	readonly meanVDifference: number | null;
	readonly baselineReferenceL2: number | null;
	readonly comparisonReferenceL2: number | null;
	readonly baselineMu: number;
	readonly comparisonMu: number;
	readonly baselineRuntimeMs: number;
	readonly comparisonRuntimeMs: number;
	readonly trajectory: readonly NumericalTrajectorySample[];
	readonly outcome: string;
	readonly failed: boolean;
	readonly failureModelTime: number | null;
}

interface RunSample {
	readonly modelTime: number;
	readonly metrics: FieldMetrics;
	readonly field: FieldState;
}

interface ControlledRun {
	readonly field: FieldState;
	readonly metrics: FieldMetrics;
	readonly samples: readonly RunSample[];
	readonly runtimeMs: number;
	readonly failed: boolean;
	readonly failure: string;
	readonly failureModelTime: number | null;
}

function now(): number {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * Restrict piecewise-constant fine-cell values onto an equal-width coarse grid.
 * Each output is the area-weighted mean over one coarse cell. This conserves the
 * domain mean and naturally becomes exact block averaging for integer ratios.
 */
export function conservativelyRestrictCellValues(
	values: Readonly<Float64Array>,
	sourceSize: number,
	targetSize: number
): Float64Array {
	if (!Number.isInteger(sourceSize) || !Number.isInteger(targetSize)) {
		throw new RangeError('Grid sizes must be integers.');
	}
	if (sourceSize < 1 || targetSize < 1 || targetSize > sourceSize) {
		throw new RangeError('Conservative restriction requires 1 ≤ targetSize ≤ sourceSize.');
	}
	if (values.length !== sourceSize * sourceSize) {
		throw new RangeError('Source field length must equal sourceSize².');
	}
	if (sourceSize === targetSize) return new Float64Array(values);

	const result = new Float64Array(targetSize * targetSize);
	const coarseWidthInFineCells = sourceSize / targetSize;
	const inverseCoarseArea = 1 / (coarseWidthInFineCells * coarseWidthInFineCells);

	for (let targetRow = 0; targetRow < targetSize; targetRow += 1) {
		const rowStart = targetRow * coarseWidthInFineCells;
		const rowEnd = (targetRow + 1) * coarseWidthInFineCells;
		const firstSourceRow = Math.floor(rowStart);
		const lastSourceRow = Math.min(sourceSize - 1, Math.ceil(rowEnd) - 1);

		for (let targetColumn = 0; targetColumn < targetSize; targetColumn += 1) {
			const columnStart = targetColumn * coarseWidthInFineCells;
			const columnEnd = (targetColumn + 1) * coarseWidthInFineCells;
			const firstSourceColumn = Math.floor(columnStart);
			const lastSourceColumn = Math.min(sourceSize - 1, Math.ceil(columnEnd) - 1);
			let integral = 0;

			for (let sourceRow = firstSourceRow; sourceRow <= lastSourceRow; sourceRow += 1) {
				const rowOverlap = Math.min(rowEnd, sourceRow + 1) - Math.max(rowStart, sourceRow);
				for (
					let sourceColumn = firstSourceColumn;
					sourceColumn <= lastSourceColumn;
					sourceColumn += 1
				) {
					const columnOverlap =
						Math.min(columnEnd, sourceColumn + 1) - Math.max(columnStart, sourceColumn);
					integral += values[sourceRow * sourceSize + sourceColumn] * rowOverlap * columnOverlap;
				}
			}

			result[targetRow * targetSize + targetColumn] = integral * inverseCoarseArea;
		}
	}

	return result;
}

function fieldDifference(a: Readonly<FieldState>, b: Readonly<FieldState>) {
	const coarse = a.size <= b.size ? a : b;
	const fine = a.size <= b.size ? b : a;
	const restrictedFine =
		fine.size === coarse.size
			? fine.v
			: conservativelyRestrictCellValues(fine.v, fine.size, coarse.size);
	let squared = 0;
	let maximum = 0;
	let count = 0;
	for (let row = 0; row < coarse.size; row += 1) {
		for (let column = 0; column < coarse.size; column += 1) {
			const coarseIndex = row * coarse.size + column;
			const delta = restrictedFine[coarseIndex] - coarse.v[coarseIndex];
			squared += delta * delta;
			maximum = Math.max(maximum, Math.abs(delta));
			count += 1;
		}
	}
	return { l2: Math.sqrt(squared / Math.max(1, count)), maximum };
}

function runControlled(
	setup: Readonly<GrayScottSetup>,
	modelTime: number,
	rejectUnsafe: boolean,
	sampleCount = 8
): ControlledRun {
	const engine = new ReactionDiffusionCpuEngine(setup, { rejectUnsafe });
	const samples: RunSample[] = [
		{
			modelTime: 0,
			metrics: calculateFieldMetrics(engine.state),
			field: cloneFieldState(engine.state)
		}
	];
	let failed = false;
	let failure = '';
	let failureModelTime: number | null = null;
	const started = now();
	for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
		const targetTime = (modelTime * sampleIndex) / sampleCount;
		const targetStep = Math.round(targetTime / setup.timestep);
		try {
			engine.step(Math.max(0, targetStep - engine.stepIndex));
		} catch (error) {
			failed = true;
			failure = error instanceof Error ? error.message : 'invalid raw numerical state';
			failureModelTime = engine.modelTime;
			break;
		}
		samples.push({
			modelTime: engine.modelTime,
			metrics: calculateFieldMetrics(engine.state),
			field: cloneFieldState(engine.state)
		});
	}
	const runtimeMs = now() - started;
	const field = cloneFieldState(engine.state);
	return {
		field,
		metrics: calculateFieldMetrics(field),
		samples,
		runtimeMs,
		failed,
		failure,
		failureModelTime
	};
}

/** Run one small controlled numerical comparison at equal requested model time. */
export function runNumericalComparison(
	baseSetup: Readonly<GrayScottSetup>,
	kind: NumericalExperimentKind
): NumericalComparisonResult {
	const physical: GrayScottSetup = {
		...baseSetup,
		gridSize: 32,
		domainWidth: 32,
		maskPreset: 'open-square',
		boundary: 'periodic',
		initialCondition: 'central-soft-disk',
		seed: 'numerical-honesty-1'
	};
	let baselineSetup: GrayScottSetup;
	let comparisonSetup: GrayScottSetup;
	let referenceSetup: GrayScottSetup | null = null;
	let modelTime = 20;
	if (kind === 'timestep') {
		baselineSetup = { ...physical, timestep: 0.5, integrator: 'heun' };
		comparisonSetup = { ...physical, timestep: 0.25, integrator: 'heun' };
	} else if (kind === 'resolution') {
		baselineSetup = { ...physical, gridSize: 24, timestep: 0.25, integrator: 'heun' };
		comparisonSetup = { ...physical, gridSize: 48, timestep: 0.25, integrator: 'heun' };
		modelTime = 12;
	} else if (kind === 'integrator') {
		baselineSetup = { ...physical, timestep: 0.25, integrator: 'euler' };
		comparisonSetup = { ...physical, timestep: 0.25, integrator: 'heun' };
		referenceSetup = { ...physical, timestep: 0.0625, integrator: 'heun' };
	} else {
		const ceiling =
			(0.25 * gridSpacing(physical) ** 2) /
			Math.max(physical.diffusionU, physical.diffusionV, 1e-12);
		baselineSetup = { ...physical, timestep: 0.5, integrator: 'heun' };
		comparisonSetup = { ...physical, timestep: ceiling * 1.6, integrator: 'heun' };
	}

	const baseline = runControlled(baselineSetup, modelTime, kind !== 'unsafe');
	const comparison = runControlled(comparisonSetup, modelTime, kind !== 'unsafe');
	const reference = referenceSetup ? runControlled(referenceSetup, modelTime, true) : null;
	const delta =
		!baseline.failed && !comparison.failed
			? fieldDifference(baseline.field, comparison.field)
			: null;
	const baselineReference = reference ? fieldDifference(baseline.field, reference.field).l2 : null;
	const comparisonReference = reference
		? fieldDifference(comparison.field, reference.field).l2
		: null;
	const trajectory: NumericalTrajectorySample[] = baseline.samples.map((sample, index) => {
		const other = comparison.samples[index] ?? null;
		const referenceSample = reference?.samples[index] ?? null;
		return {
			modelTime: sample.modelTime,
			baselineMeanU: sample.metrics.meanU,
			baselineMeanV: sample.metrics.meanV,
			comparisonMeanU: other?.metrics.meanU ?? null,
			comparisonMeanV: other?.metrics.meanV ?? null,
			referenceMeanV: referenceSample?.metrics.meanV ?? null,
			fieldDifference: other ? fieldDifference(sample.field, other.field).l2 : null
		};
	});
	const failed = baseline.failed || comparison.failed || Boolean(reference?.failed);
	const failureModelTime =
		comparison.failureModelTime ?? baseline.failureModelTime ?? reference?.failureModelTime ?? null;
	let outcome: string;
	if (kind === 'unsafe') {
		outcome = failed
			? `The raw unsafe solver stopped at model time ${failureModelTime?.toPrecision(4) ?? 'unknown'}: ${comparison.failure || baseline.failure}. No state was clipped or repaired.`
			: 'The short unsafe run remained finite, but μ exceeds the conservative ceiling; survival is not evidence of convergence.';
	} else if (kind === 'resolution') {
		outcome =
			'The same physical width and continuous deterministic disturbance were sampled at two h values. The V-field norm compares coarse cell-centred values with area-weighted fine-cell averages restricted onto the same coarse physical grid.';
	} else if (kind === 'integrator') {
		outcome = `Against the Heun Δt/4 reference, Euler error is ${baselineReference?.toExponential(3)} and Heun error is ${comparisonReference?.toExponential(3)} in the reported V-field L² norm.`;
	} else {
		outcome =
			'Both Heun runs reached equal model time. Their field and metric trajectories measure timestep sensitivity.';
	}
	return {
		kind,
		modelTime,
		l2Difference: delta?.l2 ?? null,
		maximumDifference: delta?.maximum ?? null,
		meanUDifference:
			!baseline.failed && !comparison.failed
				? comparison.metrics.meanU - baseline.metrics.meanU
				: null,
		meanVDifference:
			!baseline.failed && !comparison.failed
				? comparison.metrics.meanV - baseline.metrics.meanV
				: null,
		baselineReferenceL2: baselineReference,
		comparisonReferenceL2: comparisonReference,
		baselineMu: stabilityNumber(baselineSetup),
		comparisonMu: stabilityNumber(comparisonSetup),
		baselineRuntimeMs: baseline.runtimeMs,
		comparisonRuntimeMs: comparison.runtimeMs,
		trajectory,
		outcome,
		failed,
		failureModelTime
	};
}
