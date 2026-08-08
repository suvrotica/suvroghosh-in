import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

const root = process.cwd();
const dataPath = path.join(root, 'static', 'data', 'bz-preset-calibration.json');
const checkMode = process.argv.includes('--check');
const unsupportedArguments = process.argv.slice(2).filter((argument) => argument !== '--check');

if (unsupportedArguments.length > 0) {
	throw new Error(`Unknown argument(s): ${unsupportedArguments.join(', ')}`);
}

const vite = await createServer({
	root,
	appType: 'custom',
	server: { middlewareMode: true, hmr: false },
	logLevel: 'error'
});

let core;
try {
	core = await vite.ssrLoadModule('/src/lib/visualizations/bz/index.ts');
} finally {
	await vite.close();
}

const definitions = calibrationDefinitions(core);
const calibrationStartedAt = performance.now();
const calibrations = [];

for (const definition of definitions) {
	console.log(
		`Calibrating ${definition.id}: ${definition.steps} Heun steps on ${definition.setup.gridSize} x ${definition.setup.gridSize}...`
	);
	const startedAt = performance.now();
	const solver = new core.BZCpuSolver(definition.setup);
	const initialState = solver.snapshot();
	const initialMetrics = core.activeAreaMetrics(initialState);
	const runtimeEvidence = runWithObserver(core, definition, solver);
	const state = solver.snapshot();
	const metrics = core.activeAreaMetrics(state);
	const timestepAssessment = jsonTimestepAssessment(core.assessBZTimestep(definition.setup));
	const evidence = scientificEvidence(
		core,
		definition,
		initialState,
		state,
		initialMetrics,
		metrics,
		runtimeEvidence
	);
	const objectiveCriteria = objectiveCriteriaFor(
		definition,
		timestepAssessment,
		inspectActiveState(core, state),
		evidence
	);
	const status = statusFromCriteria(objectiveCriteria);
	const measuredDurationMs = Math.round(performance.now() - startedAt);

	if (solver.stepIndex !== definition.steps) {
		throw new Error(
			`${definition.id} stopped at step ${solver.stepIndex}, not ${definition.steps}.`
		);
	}
	if (Math.abs(solver.modelTime - definition.modelTime) > 1e-12) {
		throw new Error(
			`${definition.id} stopped at model time ${solver.modelTime}, not ${definition.modelTime}.`
		);
	}

	const row = {
		id: definition.id,
		title: definition.title,
		sourcePresetId: definition.sourcePresetId,
		expectedQualitativeBehaviour: definition.expectedQualitativeBehaviour,
		status,
		statusReason: statusReason(status, objectiveCriteria),
		model: definition.setup.model,
		modelVersion: definition.setup.modelVersion,
		equationsId: definition.setup.equationsId,
		setup: definition.setup,
		grid: {
			width: definition.setup.gridSize,
			height: definition.setup.gridSize,
			spacing: core.gridSpacing(definition.setup)
		},
		seed: definition.setup.seed,
		timestep: definition.setup.timestep,
		steps: definition.steps,
		modelTime: solver.modelTime,
		timestepAssessment,
		initialFieldSha256: fieldChecksum(initialState),
		fieldSha256: fieldChecksum(state),
		initialMetrics,
		metrics,
		evidence,
		objectiveCriteria,
		measuredDurationMs
	};
	calibrations.push(row);
	console.log(
		`  ${status} in ${measuredDurationMs} ms; variance(u)=${metrics.varianceU.toExponential(4)}; ${row.fieldSha256.slice(0, 12)}`
	);
}

const artifact = {
	schemaVersion: 1,
	engineVersion: core.BZ_ENGINE_VERSION,
	models: [
		{
			model: 'oregonator',
			modelVersion: core.OREGONATOR_MODEL_VERSION,
			equationsId: core.OREGONATOR_EQUATIONS_ID
		},
		{
			model: 'schnakenberg',
			modelVersion: core.SCHNAKENBERG_MODEL_VERSION,
			equationsId: core.SCHNAKENBERG_EQUATIONS_ID
		}
	],
	method: 'Float64 CPU reference, fixed-step Heun RK2, second-order five-point Laplacian',
	claim:
		'Each row is a deterministic finite-time observation for the exact setup shown. It is not a universal phase label, reagent reconstruction, or claim about unobserved long-time morphology.',
	checksum: {
		algorithm: 'sha256-f64le-v1',
		domainTag: 'bz-field-sha256-f64le-v1\\0',
		byteOrder:
			'UTF-8 domain tag, UInt32LE grid size, u Float64LE values, v Float64LE values, domainMask bytes, active mask bytes'
	},
	reproducibility: {
		deterministicInputs:
			'Every setup, named seed, fixed timestep, step count, model version, equations identifier, and engine version is recorded.',
		scope:
			'Checksums describe the Float64 CPU reference replay. GPU arithmetic may differ across vendors and precision tiers.',
		checkCommand: 'node scripts/calibrate-bz-presets.mjs --check'
	},
	durationPolicy:
		'Wall-clock measuredDurationMs fields are diagnostic and inherently machine-dependent. --check excludes only fields with that exact name; all scientific fields, criteria, and checksums are compared.',
	statusPolicy: {
		validated: 'Every prerequisite and validation criterion passed at the declared finite time.',
		candidate:
			'All prerequisites passed, but at least one named validation criterion was not established in this finite run.',
		rejected: 'At least one numerical or analytical prerequisite failed.'
	},
	measuredDurationMs: Math.round(performance.now() - calibrationStartedAt),
	calibrations
};

const serialized = `${JSON.stringify(artifact, null, 2)}\n`;

if (checkMode) {
	let stored;
	try {
		stored = JSON.parse(await fs.readFile(dataPath, 'utf8'));
	} catch (error) {
		if (error?.code === 'ENOENT') {
			throw new Error(
				`${path.relative(root, dataPath)} does not exist; run the calibrator once without --check.`,
				{ cause: error }
			);
		}
		throw error;
	}
	const expectedSemantic = JSON.stringify(withoutMeasuredDurations(stored));
	const actualSemantic = JSON.stringify(withoutMeasuredDurations(artifact));
	if (actualSemantic !== expectedSemantic) {
		const difference = firstDifference(
			withoutMeasuredDurations(stored),
			withoutMeasuredDurations(artifact)
		);
		throw new Error(
			`BZ preset calibration is stale at ${difference.path}: stored ${formatDifferenceValue(difference.expected)}, recomputed ${formatDifferenceValue(difference.actual)}.`
		);
	}
	console.log(
		`Verified ${path.relative(root, dataPath)}: deterministic scientific output matches (${calibrations.length} rows; wall duration excluded).`
	);
} else {
	await fs.mkdir(path.dirname(dataPath), { recursive: true });
	await fs.writeFile(dataPath, serialized);
	console.log(
		`Wrote ${path.relative(root, dataPath)} with ${calibrations.length} calibration rows.`
	);
}

function calibrationDefinitions(bz) {
	const definition = (id, sourcePresetId, modelTime, setupOverrides, validationTarget) => {
		const preset = bz.getBZPreset(sourcePresetId);
		const setup = cloneSetupWithOverrides(preset.setup, setupOverrides);
		const steps = Math.round(modelTime / setup.timestep);
		if (Math.abs(steps * setup.timestep - modelTime) > 1e-12) {
			throw new Error(`${id} model time is not an exact multiple of its fixed timestep.`);
		}
		return {
			id,
			title: preset.title,
			sourcePresetId,
			expectedQualitativeBehaviour: preset.expectedQualitativeBehaviour,
			setup,
			steps,
			modelTime,
			validationTarget
		};
	};

	return [
		definition('well-mixed-clock', 'well-mixed-clock', 14, { gridSize: 48 }, 'well-mixed-clock'),
		definition(
			'target-waves',
			'zhabotinsky-dish',
			0.25,
			{ gridSize: 48, domainSize: 12, activeRadius: 5.6 },
			'target-waves'
		),
		definition(
			'broken-front-spiral',
			'broken-front-spiral',
			0.75,
			{ gridSize: 48, domainSize: 12, activeRadius: 5.6 },
			'broken-front-spiral'
		),
		definition(
			'collision-annihilation',
			'collision-annihilation',
			0.8,
			{ gridSize: 48, domainSize: 12, activeRadius: 5.6 },
			'collision-annihilation'
		),
		definition(
			'stable-uniform-state',
			'stable-uniform-state',
			20,
			{ gridSize: 48 },
			'stable-uniform-state'
		),
		definition(
			'diffusion-driven-spots',
			'diffusion-driven-spots',
			60,
			{ gridSize: 64 },
			'diffusion-driven-spots'
		)
	];
}

function cloneSetupWithOverrides(setup, overrides) {
	return {
		...setup,
		...overrides,
		parameters: { ...setup.parameters, ...(overrides.parameters ?? {}) }
	};
}

function runWithObserver(bz, definition, solver) {
	if (definition.validationTarget === 'well-mixed-clock') {
		const probeIndex = solver.state.mask.findIndex((active) => active === 1);
		let minimumU = solver.state.u[probeIndex];
		let maximumU = minimumU;
		let minimumV = solver.state.v[probeIndex];
		let maximumV = minimumV;
		let previousPreviousU = solver.state.u[probeIndex];
		let previousU = previousPreviousU;
		let previousV = solver.state.v[probeIndex];
		const localMaximaU = [];
		const localMinimaU = [];
		for (let step = 1; step <= definition.steps; step += 1) {
			solver.step();
			const currentU = solver.state.u[probeIndex];
			const currentV = solver.state.v[probeIndex];
			minimumU = Math.min(minimumU, currentU);
			maximumU = Math.max(maximumU, currentU);
			minimumV = Math.min(minimumV, currentV);
			maximumV = Math.max(maximumV, currentV);
			if (step >= 2) {
				const extremumStep = step - 1;
				const reading = {
					step: extremumStep,
					modelTime: extremumStep * definition.setup.timestep,
					u: previousU,
					v: previousV
				};
				if (previousU > previousPreviousU && previousU >= currentU) {
					localMaximaU.push(reading);
				}
				if (previousU < previousPreviousU && previousU <= currentU) {
					localMinimaU.push(reading);
				}
			}
			previousPreviousU = previousU;
			previousU = currentU;
			previousV = currentV;
		}
		return {
			probeIndex,
			minimumU,
			maximumU,
			rangeU: maximumU - minimumU,
			minimumV,
			maximumV,
			rangeV: maximumV - minimumV,
			localMaximaU,
			localMinimaU
		};
	}

	if (definition.validationTarget === 'collision-annihilation') {
		const sampleEverySteps = 20;
		const centralHalfWidth = bz.gridSpacing(definition.setup) * 1.5;
		let peakCentralU = maximumUInVerticalBand(bz, solver.state, definition.setup, centralHalfWidth);
		let peakCentralStep = 0;
		while (solver.stepIndex < definition.steps) {
			const count = Math.min(sampleEverySteps, definition.steps - solver.stepIndex);
			solver.step(count);
			const centralU = maximumUInVerticalBand(bz, solver.state, definition.setup, centralHalfWidth);
			if (centralU > peakCentralU) {
				peakCentralU = centralU;
				peakCentralStep = solver.stepIndex;
			}
		}
		return {
			sampleEverySteps,
			centralHalfWidth,
			peakCentralU,
			peakCentralStep,
			peakCentralModelTime: peakCentralStep * definition.setup.timestep,
			finalCentralU: maximumUInVerticalBand(bz, solver.state, definition.setup, centralHalfWidth)
		};
	}

	solver.step(definition.steps);
	return {};
}

function scientificEvidence(
	bz,
	definition,
	initialState,
	state,
	initialMetrics,
	metrics,
	runtimeEvidence
) {
	if (definition.validationTarget === 'well-mixed-clock') {
		return {
			trace: runtimeEvidence,
			finalSpatialVarianceU: metrics.varianceU,
			finalSpatialVarianceV: metrics.varianceV
		};
	}

	if (definition.validationTarget === 'target-waves') {
		const excitationThresholdU = 0.2;
		const initialGeometry = excitationGeometry(
			bz,
			initialState,
			definition.setup,
			excitationThresholdU
		);
		const finalGeometry = excitationGeometry(bz, state, definition.setup, excitationThresholdU);
		return {
			excitationThresholdU,
			initialExcitedCells: initialGeometry.cells,
			finalExcitedCells: finalGeometry.cells,
			initialMaximumExcitedRadius: initialGeometry.maximumRadius,
			finalMaximumExcitedRadius: finalGeometry.maximumRadius,
			radialAdvance: finalGeometry.maximumRadius - initialGeometry.maximumRadius
		};
	}

	if (definition.validationTarget === 'broken-front-spiral') {
		const excitationThresholdU = 0.2;
		return {
			excitationThresholdU,
			initialExcitation: excitationGeometry(
				bz,
				initialState,
				definition.setup,
				excitationThresholdU
			),
			finalExcitation: excitationGeometry(bz, state, definition.setup, excitationThresholdU),
			objectiveRotationMeasurement:
				'Not available: this tractable run does not include a phase-winding core tracker over a complete rotation.'
		};
	}

	if (definition.validationTarget === 'collision-annihilation') {
		return {
			...runtimeEvidence,
			centralDecayFromPeak: runtimeEvidence.peakCentralU - runtimeEvidence.finalCentralU,
			transmissionMeasurement:
				'Not available: central-band decay alone does not prove that no transmitted front survives outside the interaction band.'
		};
	}

	if (definition.validationTarget === 'stable-uniform-state') {
		return {
			dispersion: dispersionSummary(bz.scanSchnakenbergDispersion(definition.setup)),
			maximumAbsoluteDriftU: maximumAbsoluteActiveDifference(initialState.u, state.u, state.mask),
			maximumAbsoluteDriftV: maximumAbsoluteActiveDifference(initialState.v, state.v, state.mask),
			finalSpatialVarianceU: metrics.varianceU,
			finalSpatialVarianceV: metrics.varianceV
		};
	}

	const thresholdU = metrics.meanU + Math.sqrt(metrics.varianceU);
	return {
		dispersion: dispersionSummary(bz.scanSchnakenbergDispersion(definition.setup)),
		varianceAmplificationU: metrics.varianceU / initialMetrics.varianceU,
		varianceAmplificationV: metrics.varianceV / initialMetrics.varianceV,
		meanDriftU: metrics.meanU - initialMetrics.meanU,
		meanDriftV: metrics.meanV - initialMetrics.meanV,
		contrastU: metrics.maximumU - metrics.minimumU,
		highUThreshold: thresholdU,
		highUComponents: connectedComponentsAboveThreshold(state, thresholdU)
	};
}

function objectiveCriteriaFor(definition, timestepAssessment, stateInspection, evidence) {
	const criteria = [
		{
			id: 'timestep-not-unsafe',
			kind: 'prerequisite',
			description: 'The declared fixed step is not classified as unsafe by the core assessment.',
			pass: timestepAssessment.state !== 'unsafe',
			evidence: {
				state: timestepAssessment.state,
				diffusionRatio: timestepAssessment.diffusionRatio,
				reactionScale: timestepAssessment.reactionScale
			}
		},
		{
			id: 'finite-active-field',
			kind: 'prerequisite',
			description:
				'Every active u and v value is finite and no value is below the core negative tolerance.',
			pass:
				stateInspection.nonFiniteValues === 0 && stateInspection.valuesBelowNegativeTolerance === 0,
			evidence: stateInspection
		}
	];

	if (definition.validationTarget === 'well-mixed-clock') {
		const maxima = evidence.trace.localMaximaU;
		const minima = evidence.trace.localMinimaU;
		const peakPeriods = maxima
			.slice(1)
			.map((reading, index) => reading.modelTime - maxima[index].modelTime);
		const lastTwoPeriods = peakPeriods.slice(-2);
		const periodRelativeDifference =
			lastTwoPeriods.length === 2
				? Math.abs(lastTwoPeriods[1] - lastTwoPeriods[0]) /
					Math.max(Math.abs((lastTwoPeriods[0] + lastTwoPeriods[1]) / 2), Number.EPSILON)
				: null;
		const lastTwoMaxima = maxima.slice(-2);
		const phaseStateRecurrenceDistance =
			lastTwoMaxima.length === 2
				? Math.hypot(
						lastTwoMaxima[1].u - lastTwoMaxima[0].u,
						lastTwoMaxima[1].v - lastTwoMaxima[0].v
					)
				: null;
		criteria.push(
			{
				id: 'spatially-uniform',
				kind: 'validation',
				description: 'Spatial variance remains at round-off scale at the observation time.',
				pass: evidence.finalSpatialVarianceU < 1e-26 && evidence.finalSpatialVarianceV < 1e-26,
				evidence: {
					maximumAllowedVariance: 1e-26,
					varianceU: evidence.finalSpatialVarianceU,
					varianceV: evidence.finalSpatialVarianceV
				}
			},
			{
				id: 'local-state-changes',
				kind: 'validation',
				description: 'A local u trace spans more than 0.05 during the finite-time run.',
				pass: evidence.trace.rangeU > 0.05,
				evidence: { minimumRangeU: 0.05, measuredRangeU: evidence.trace.rangeU }
			},
			{
				id: 'repeatable-local-cycle',
				kind: 'validation',
				description:
					'The trace contains at least four maxima and minima; its final two peak periods agree within 1%, and successive peak phase states recur within 1e-4.',
				pass:
					maxima.length >= 4 &&
					minima.length >= 4 &&
					periodRelativeDifference !== null &&
					periodRelativeDifference <= 0.01 &&
					phaseStateRecurrenceDistance !== null &&
					phaseStateRecurrenceDistance <= 1e-4,
				evidence: {
					minimumMaxima: 4,
					minimumMinima: 4,
					measuredMaxima: maxima.length,
					measuredMinima: minima.length,
					peakPeriods,
					maximumRelativePeriodDifference: 0.01,
					measuredRelativePeriodDifference: periodRelativeDifference,
					maximumPhaseStateRecurrenceDistance: 1e-4,
					measuredPhaseStateRecurrenceDistance: phaseStateRecurrenceDistance,
					lastTwoMaxima
				}
			}
		);
	} else if (definition.validationTarget === 'target-waves') {
		criteria.push({
			id: 'outward-front-advance',
			kind: 'validation',
			description: 'The outermost u > 0.2 excitation advances radially by more than 0.5.',
			pass: evidence.radialAdvance > 0.5 && evidence.finalExcitedCells > 0,
			evidence: {
				minimumAdvance: 0.5,
				measuredAdvance: evidence.radialAdvance,
				initialRadius: evidence.initialMaximumExcitedRadius,
				finalRadius: evidence.finalMaximumExcitedRadius,
				finalExcitedCells: evidence.finalExcitedCells
			}
		});
	} else if (definition.validationTarget === 'broken-front-spiral') {
		criteria.push(
			{
				id: 'broken-front-remains-active',
				kind: 'validation',
				description:
					'The broken-front recipe has u > 0.2 cells initially and at the observation time.',
				pass: evidence.initialExcitation.cells > 0 && evidence.finalExcitation.cells > 0,
				evidence: {
					initialExcitedCells: evidence.initialExcitation.cells,
					finalExcitedCells: evidence.finalExcitation.cells
				}
			},
			{
				id: 'persistent-rotating-core',
				kind: 'validation',
				description:
					'A phase-winding core is tracked through a complete rotation at the declared setup.',
				pass: false,
				evidence: { reason: evidence.objectiveRotationMeasurement }
			}
		);
	} else if (definition.validationTarget === 'collision-annihilation') {
		criteria.push(
			{
				id: 'fronts-reach-interaction-band',
				kind: 'validation',
				description: 'The sampled maximum u in the central interaction band exceeds 0.2.',
				pass: evidence.peakCentralU > 0.2,
				evidence: {
					thresholdU: 0.2,
					peakCentralU: evidence.peakCentralU,
					peakCentralStep: evidence.peakCentralStep,
					peakCentralModelTime: evidence.peakCentralModelTime
				}
			},
			{
				id: 'central-excitation-decays',
				kind: 'validation',
				description:
					'The central-band maximum falls below 0.2 after having exceeded that threshold.',
				pass: evidence.peakCentralU > 0.2 && evidence.finalCentralU < 0.2,
				evidence: {
					thresholdU: 0.2,
					peakCentralU: evidence.peakCentralU,
					finalCentralU: evidence.finalCentralU,
					decayFromPeak: evidence.centralDecayFromPeak
				}
			},
			{
				id: 'no-transmitted-front',
				kind: 'validation',
				description: 'No transmitted excitation survives beyond the central collision.',
				pass: false,
				evidence: { reason: evidence.transmissionMeasurement }
			}
		);
	} else if (definition.validationTarget === 'stable-uniform-state') {
		criteria.push(
			{
				id: 'linear-dispersion-stable',
				kind: 'prerequisite',
				description: 'The core dispersion scan classifies the setup as linearly stable.',
				pass: evidence.dispersion.classification === 'linearly-stable',
				evidence: evidence.dispersion
			},
			{
				id: 'uniform-equilibrium-remains-uniform',
				kind: 'validation',
				description:
					'Spatial variances stay below 1e-24 and maximum active-cell drift stays below 1e-10.',
				pass:
					evidence.finalSpatialVarianceU < 1e-24 &&
					evidence.finalSpatialVarianceV < 1e-24 &&
					evidence.maximumAbsoluteDriftU < 1e-10 &&
					evidence.maximumAbsoluteDriftV < 1e-10,
				evidence: {
					maximumAllowedVariance: 1e-24,
					maximumAllowedDrift: 1e-10,
					varianceU: evidence.finalSpatialVarianceU,
					varianceV: evidence.finalSpatialVarianceV,
					maximumAbsoluteDriftU: evidence.maximumAbsoluteDriftU,
					maximumAbsoluteDriftV: evidence.maximumAbsoluteDriftV
				}
			}
		);
	} else {
		criteria.push(
			{
				id: 'classical-diffusion-driven-band',
				kind: 'prerequisite',
				description:
					'The equilibrium is reaction-stable with a resolved nonzero growing diffusion band.',
				pass:
					evidence.dispersion.classification === 'classical-diffusion-driven' &&
					evidence.dispersion.resolved,
				evidence: evidence.dispersion
			},
			{
				id: 'finite-mode-amplification',
				kind: 'validation',
				description: 'Seeded spatial variance in u amplifies by at least a factor of 10.',
				pass: evidence.varianceAmplificationU >= 10,
				evidence: {
					minimumAmplification: 10,
					measuredAmplificationU: evidence.varianceAmplificationU,
					measuredAmplificationV: evidence.varianceAmplificationV,
					contrastU: evidence.contrastU
				}
			},
			{
				id: 'spot-morphology-objective',
				kind: 'validation',
				description:
					'Mature spot morphology is established independently of thresholded high-u pixel components.',
				pass: false,
				evidence: {
					...evidence.highUComponents,
					reason:
						'Disconnected one-sigma components support spatial structure but do not alone establish mature, persistent spot morphology.'
				}
			}
		);
	}

	return criteria;
}

function statusFromCriteria(criteria) {
	if (criteria.some((criterion) => criterion.kind === 'prerequisite' && !criterion.pass)) {
		return 'rejected';
	}
	return criteria.every((criterion) => criterion.pass) ? 'validated' : 'candidate';
}

function statusReason(status, criteria) {
	const failed = criteria.filter((criterion) => !criterion.pass).map((criterion) => criterion.id);
	if (status === 'validated') return 'All declared finite-time criteria passed.';
	if (status === 'rejected') return `Prerequisite failure: ${failed.join(', ')}.`;
	return `Finite-time candidate; validation criterion not established: ${failed.join(', ')}.`;
}

function jsonTimestepAssessment(assessment) {
	return {
		...assessment,
		diffusionLimit: Number.isFinite(assessment.diffusionLimit) ? assessment.diffusionLimit : null,
		diffusionLimitMeaning: Number.isFinite(assessment.diffusionLimit)
			? 'finite explicit five-point diffusion bound'
			: 'unbounded because both declared diffusion coefficients are zero'
	};
}

function inspectActiveState(bz, state) {
	let activeCells = 0;
	let nonFiniteValues = 0;
	let valuesBelowNegativeTolerance = 0;
	const negativeTolerance = bz.BZ_SAFE_LIMITS.negativeTolerance;
	for (let index = 0; index < state.u.length; index += 1) {
		if (!state.mask[index]) continue;
		activeCells += 1;
		if (!Number.isFinite(state.u[index])) nonFiniteValues += 1;
		if (!Number.isFinite(state.v[index])) nonFiniteValues += 1;
		if (state.u[index] < -negativeTolerance) valuesBelowNegativeTolerance += 1;
		if (state.v[index] < -negativeTolerance) valuesBelowNegativeTolerance += 1;
	}
	return {
		activeCells,
		checkedValues: activeCells * 2,
		nonFiniteValues,
		negativeTolerance,
		valuesBelowNegativeTolerance
	};
}

function excitationGeometry(bz, state, setup, thresholdU) {
	let cells = 0;
	let minimumRadius = Number.POSITIVE_INFINITY;
	let maximumRadius = 0;
	for (let row = 0; row < state.size; row += 1) {
		const y = bz.cellCoordinate(row, state.size, setup.domainSize);
		for (let column = 0; column < state.size; column += 1) {
			const index = row * state.size + column;
			if (!state.mask[index] || state.u[index] <= thresholdU) continue;
			const x = bz.cellCoordinate(column, state.size, setup.domainSize);
			const radius = Math.hypot(x, y);
			cells += 1;
			minimumRadius = Math.min(minimumRadius, radius);
			maximumRadius = Math.max(maximumRadius, radius);
		}
	}
	return {
		cells,
		minimumRadius: cells > 0 ? minimumRadius : null,
		maximumRadius: cells > 0 ? maximumRadius : null
	};
}

function maximumUInVerticalBand(bz, state, setup, halfWidth) {
	let maximum = Number.NEGATIVE_INFINITY;
	for (let column = 0; column < state.size; column += 1) {
		const x = bz.cellCoordinate(column, state.size, setup.domainSize);
		if (Math.abs(x) > halfWidth) continue;
		for (let row = 0; row < state.size; row += 1) {
			const index = row * state.size + column;
			if (state.mask[index]) maximum = Math.max(maximum, state.u[index]);
		}
	}
	return maximum;
}

function maximumAbsoluteActiveDifference(before, after, mask) {
	let maximum = 0;
	for (let index = 0; index < before.length; index += 1) {
		if (mask[index]) maximum = Math.max(maximum, Math.abs(after[index] - before[index]));
	}
	return maximum;
}

function dispersionSummary(reading) {
	return {
		classification: reading.classification,
		zeroModeGrowth: reading.zeroModeGrowth,
		maximumGrowth: reading.maximumGrowth,
		fastestWavenumber: reading.fastestWavenumber,
		predictedWavelength: reading.predictedWavelength,
		nyquistWavenumber: reading.nyquistWavenumber,
		resolved: reading.resolved
	};
}

function connectedComponentsAboveThreshold(state, threshold) {
	const seen = new Uint8Array(state.u.length);
	const componentSizes = [];
	const queue = new Int32Array(state.u.length);
	for (let start = 0; start < state.u.length; start += 1) {
		if (seen[start] || !state.mask[start] || state.u[start] <= threshold) continue;
		let head = 0;
		let tail = 0;
		let size = 0;
		seen[start] = 1;
		queue[tail++] = start;
		while (head < tail) {
			const index = queue[head++];
			size += 1;
			const row = Math.floor(index / state.size);
			const column = index % state.size;
			for (const [rowOffset, columnOffset] of [
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1]
			]) {
				const nextRow = row + rowOffset;
				const nextColumn = column + columnOffset;
				if (nextRow < 0 || nextRow >= state.size || nextColumn < 0 || nextColumn >= state.size) {
					continue;
				}
				const next = nextRow * state.size + nextColumn;
				if (seen[next] || !state.mask[next] || state.u[next] <= threshold) continue;
				seen[next] = 1;
				queue[tail++] = next;
			}
		}
		componentSizes.push(size);
	}
	componentSizes.sort((left, right) => right - left);
	return {
		connectivity: 'four-neighbour',
		threshold,
		count: componentSizes.length,
		largestCellCounts: componentSizes.slice(0, 12),
		totalHighUCells: componentSizes.reduce((sum, size) => sum + size, 0)
	};
}

function fieldChecksum(state) {
	const hash = crypto.createHash('sha256');
	hash.update(Buffer.from('bz-field-sha256-f64le-v1\0', 'utf8'));
	const size = Buffer.allocUnsafe(4);
	size.writeUInt32LE(state.size, 0);
	hash.update(size);
	hashFloat64LittleEndian(hash, state.u);
	hashFloat64LittleEndian(hash, state.v);
	hash.update(
		Buffer.from(state.domainMask.buffer, state.domainMask.byteOffset, state.domainMask.byteLength)
	);
	hash.update(Buffer.from(state.mask.buffer, state.mask.byteOffset, state.mask.byteLength));
	return hash.digest('hex');
}

function hashFloat64LittleEndian(hash, values) {
	const bytes = Buffer.allocUnsafe(values.length * Float64Array.BYTES_PER_ELEMENT);
	for (let index = 0; index < values.length; index += 1) {
		bytes.writeDoubleLE(values[index], index * Float64Array.BYTES_PER_ELEMENT);
	}
	hash.update(bytes);
}

function withoutMeasuredDurations(value) {
	if (Array.isArray(value)) return value.map(withoutMeasuredDurations);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => key !== 'measuredDurationMs')
				.map(([key, entry]) => [key, withoutMeasuredDurations(entry)])
		);
	}
	return value;
}

function firstDifference(expected, actual, currentPath = '$') {
	if (Object.is(expected, actual)) return null;
	if (
		typeof expected !== 'object' ||
		expected === null ||
		typeof actual !== 'object' ||
		actual === null
	) {
		return { path: currentPath, expected, actual };
	}
	const expectedKeys = Object.keys(expected);
	const actualKeys = Object.keys(actual);
	if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
		return { path: `${currentPath} keys`, expected: expectedKeys, actual: actualKeys };
	}
	for (const key of expectedKeys) {
		const difference = firstDifference(expected[key], actual[key], `${currentPath}.${key}`);
		if (difference) return difference;
	}
	return { path: currentPath, expected, actual };
}

function formatDifferenceValue(value) {
	const serializedValue = JSON.stringify(value);
	if (serializedValue === undefined) return String(value);
	return serializedValue.length > 180 ? `${serializedValue.slice(0, 177)}...` : serializedValue;
}
