import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
	BZFastCpuSolver,
	BZ_SCHEMA_VERSION,
	DEFAULT_OREGONATOR_SETUP,
	annularBZOrientation,
	bzRadialProfile,
	circularDishWallDistance,
	coefficientOfVariation,
	checkpointDescriptorV2,
	detectBZPhaseCores,
	encodeBZCheckpointV1,
	findBZRadialPeaks,
	matchBZCore,
	oregonatorRecoveredEquilibrium,
	unwrapAngle
} from '../src/lib/visualizations/bz/index.ts';
import type {
	BZFieldState,
	BZIntervention,
	BZSetup,
	OregonatorSetup
} from '../src/lib/visualizations/bz/types.ts';
import type { BZCoreTrackPoint, BZPhaseCore } from '../src/lib/visualizations/bz/v2-analysis.ts';
import type { BZV2PhaseCoordinate } from '../src/lib/visualizations/bz/v2-types.ts';

type Hero = 'spiral' | 'garden' | 'target' | 'all';

const args = new Set(process.argv.slice(2));
const hero = valueArgument('--hero') as Hero | null;
const selectedHero: Hero =
	hero && ['spiral', 'garden', 'target', 'all'].includes(hero) ? hero : 'all';
const quick = args.has('--quick');
const write = args.has('--write');
const trace = args.has('--trace');
const emitCheckpoint = args.has('--emit-checkpoint');
const grid = numberArgument('--grid') ?? (quick ? 48 : 64);
const requestedDuration = numberArgument('--duration');
const requestedDomain = numberArgument('--domain') ?? 20;
const requestedTimestep = numberArgument('--timestep');
const spiralSeed = valueArgument('--seed') ?? 'phase-quadrants';
const cutTime = numberArgument('--cut-time') ?? 0.45;
const requestedPhaseU = numberArgument('--phase-u');
const requestedPhaseV = numberArgument('--phase-v');
const requestedObservationStart = numberArgument('--observation-start');
const requestedAnnulusRadius = numberArgument('--annulus-radius') ?? 2.1;
const requestedAnnulusWidth = numberArgument('--annulus-width') ?? 0.8;
const requestedSourceRadius = numberArgument('--source-radius') ?? 0.05;
const requestedSourceAmount = numberArgument('--source-amount') ?? 0.9;
const requestedSourcePeriod = numberArgument('--source-period');
const requestedSourceEnd = numberArgument('--source-end');
const outputDirectory = path.join(process.cwd(), 'artifacts', 'bz-v2-search');
const publicCheckpointDirectory = path.join(
	process.cwd(),
	'static',
	'data',
	'bz-v2',
	'checkpoints'
);
const outputName = valueArgument('--output-name') ?? 'results';
const generatedAt = valueArgument('--generated-at') ?? '2026-08-08T00:00:00.000Z';
if (!/^[a-z0-9][a-z0-9._-]*$/u.test(outputName)) throw new RangeError('--output-name is invalid.');

const phaseCoordinate: BZV2PhaseCoordinate = Object.freeze({
	centreU: 0.011605268043856337,
	centreV: 0.011605268043856337,
	scaleU: 0.42,
	scaleV: 0.12
});

const candidateLimit = numberArgument('--limit');
const candidateOffset = numberArgument('--offset') ?? 0;
const directEpsilon = numberArgument('--epsilon');
const directQ = numberArgument('--q');
const directF = numberArgument('--f');
if (
	[directEpsilon, directQ, directF].some((value) => value !== null) &&
	[directEpsilon, directQ, directF].some((value) => value === null)
) {
	throw new RangeError('--epsilon, --q and --f must be supplied together.');
}
const candidates = (
	directEpsilon !== null && directQ !== null && directF !== null
		? [{ epsilon: directEpsilon, q: directQ, f: directF }]
		: quick
			? [
					{ epsilon: 0.05, q: 0.002, f: 1.4 },
					{ epsilon: 0.05, q: 0.002, f: 1.8 },
					{ epsilon: 0.05, q: 0.002, f: 2.0 },
					{ epsilon: 0.05, q: 0.002, f: 2.1 },
					{ epsilon: 0.05, q: 0.002, f: 2.2 },
					{ epsilon: 0.05, q: 0.002, f: 2.3 },
					{ epsilon: 0.08, q: 0.002, f: 1.4 },
					{ epsilon: 0.02, q: 0.002, f: 1.4 },
					{ epsilon: 0.02, q: 0.002, f: 2.4 },
					{ epsilon: 0.05, q: 0.002, f: 2.4 },
					{ epsilon: 0.05, q: 0.002, f: 2.6 },
					{ epsilon: 0.08, q: 0.002, f: 2.4 }
				]
			: cartesian(
					[0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08],
					[0.001, 0.0015, 0.002, 0.003],
					[1.2, 1.4, 1.6, 1.8, 2.1, 2.4, 2.6]
				)
).slice(candidateOffset, candidateOffset + (candidateLimit ?? Number.POSITIVE_INFINITY));

const startedAt = performance.now();
const results: unknown[] = [];
const checkpointCaptures: Array<{
	hero: Exclude<Hero, 'all'>;
	setup: BZSetup;
	interventions: readonly BZIntervention[];
	step: number;
	state: BZFieldState;
}> = [];
for (const parameters of candidates) {
	if (trace) console.error('candidate:start', parameters);
	const timestep = requestedTimestep ?? Math.min(0.0005, parameters.epsilon * 0.025);
	if (selectedHero === 'spiral' || selectedHero === 'all') {
		results.push(
			safely(
				() =>
					runSpiral(parameters, grid, timestep, requestedDuration ?? (quick ? 6 : 15), spiralSeed),
				'persistent-single-spiral',
				parameters
			)
		);
	}
	if (selectedHero === 'garden' || selectedHero === 'all') {
		results.push(
			safely(
				() => runGarden(parameters, grid, timestep, requestedDuration ?? (quick ? 4 : 15)),
				'spiral-garden',
				parameters
			)
		);
	}
	if (selectedHero === 'target' || selectedHero === 'all') {
		for (const sourcePeriod of requestedSourcePeriod !== null
			? [requestedSourcePeriod]
			: quick
				? [2.5, 3.5]
				: [1.1, 1.5, 2, 2.5, 3, 3.5, 4]) {
			results.push(
				safely(
					() =>
						runTarget(
							parameters,
							grid,
							timestep,
							requestedDuration ?? (quick ? 4 : 8),
							sourcePeriod
						),
					'classic-target-rings',
					parameters
				)
			);
		}
	}
}

const checkpointDescriptors: unknown[] = [];
if (emitCheckpoint) {
	await mkdir(publicCheckpointDirectory, { recursive: true });
	for (const capture of checkpointCaptures) {
		const checkpointId = `${capture.hero}-256-v2`;
		const validationRecordId = `${capture.hero}-validation-v2`;
		const encoded = await encodeBZCheckpointV1({
			checkpointId,
			sourcePresetId: capture.hero,
			setup: capture.setup,
			interventions: capture.interventions,
			warmupStep: capture.step,
			cpuFloat64State: capture.state,
			validationRecordId,
			generatedBy: 'scripts/search-bz-regimes.ts',
			generatedAt
		});
		const filename = `${checkpointId}.bzcp`;
		await writeFile(path.join(publicCheckpointDirectory, filename), encoded.bytes);
		checkpointDescriptors.push(
			checkpointDescriptorV2(encoded, `/data/bz-v2/checkpoints/${filename}`)
		);
	}
}

const artifact = {
	schemaVersion: 2,
	command: process.argv.join(' '),
	stage: quick
		? 'coarse-smoke'
		: grid < 128
			? 'coarse-search'
			: grid < 256
				? 'objective-refinement'
				: 'publication-refinement',
	grid,
	phaseCoordinate,
	literatureGuidedBox: {
		epsilon: [0.005, 0.08],
		q: [0.0005, 0.004],
		f: [1.2, 2.6],
		diffusionU: 1,
		diffusionV: 0,
		domainSize: [16, 40]
	},
	pruning:
		'Abort on the first non-finite or negative corrector value; retain only finite regimes with objective radial or phase evidence.',
	workerPolicy:
		'At most two independent candidates; this command defaults to one to preserve an interactive workstation.',
	durationMs: Math.round(performance.now() - startedAt),
	checkpointDescriptors,
	results
};

if (write) {
	await mkdir(outputDirectory, { recursive: true });
	await writeFile(
		path.join(outputDirectory, `${outputName}.json`),
		`${JSON.stringify(artifact, null, 2)}\n`
	);
	await writeFile(path.join(outputDirectory, `${outputName}.html`), calibrationGallery(artifact));
	console.log(
		`Wrote ${path.relative(process.cwd(), outputDirectory)} with ${results.length} objective runs.`
	);
} else {
	console.log(JSON.stringify(artifact, null, 2));
}

function baseSetup(
	parameters: OregonatorSetup['parameters'],
	gridSize: number,
	timestep: number,
	initialCondition: OregonatorSetup['initialCondition']
): OregonatorSetup {
	const domainSize = requestedDomain;
	return {
		...DEFAULT_OREGONATOR_SETUP,
		parameters,
		gridSize,
		domainSize,
		activeRadius: domainSize * 0.46,
		timestep,
		initialCondition,
		seed: `bz-v2-${initialCondition}-${parameters.epsilon}-${parameters.q}-${parameters.f}`
	};
}

function runSpiral(
	parameters: OregonatorSetup['parameters'],
	gridSize: number,
	timestep: number,
	duration: number,
	initialCondition: string
) {
	const preparedCut = initialCondition === 'cut-after-plane-wave';
	const setup = baseSetup(
		parameters,
		gridSize,
		timestep,
		(preparedCut ? 'plane-wave' : initialCondition) as OregonatorSetup['initialCondition']
	);
	const coordinate = phaseCoordinateFor(parameters);
	const equilibrium = oregonatorRecoveredEquilibrium(parameters);
	const preparation: readonly BZIntervention[] = preparedCut
		? [
				{
					schemaVersion: BZ_SCHEMA_VERSION,
					sequence: 0,
					step: Math.round(cutTime / timestep),
					kind: 'cut',
					// Reset the upper half of a mature planar wave. This leaves one
					// interior free tip; no spiral arm is painted into the field.
					from: [0, 0.75],
					to: [1, 0.75],
					width: 0.25,
					targetU: equilibrium.u,
					targetV: equilibrium.v,
					strength: 1
				}
			]
		: [];
	const solver = new BZFastCpuSolver(setup, { interventions: preparation });
	const sampleEvery = Math.max(1, Math.round(0.05 / timestep));
	const endStep = Math.round(duration / timestep);
	const observationStart =
		requestedObservationStart ??
		(preparedCut ? Math.max(cutTime + 0.35, 2) : Math.min(0.75, duration * 0.2));
	const observationStartStep = Math.round(observationStart / timestep);
	const maximumTrackDistance = (setup.domainSize / setup.gridSize) * 2.75;
	const coreCounts: number[] = [];
	type Track = {
		points: BZCoreTrackPoint[];
		orientations: Array<{ step: number; modelTime: number; wrapped: number; unwrapped: number }>;
	};
	const tracks: Track[] = [];
	let activeTrack: Track | null = null;
	const started = performance.now();
	for (let step = 0; step <= endStep; step += sampleEvery) {
		if (trace) console.error('spiral:sample', { step, solverStep: solver.stepIndex });
		if (step > solver.stepIndex) solver.step(step - solver.stepIndex);
		if (trace) console.error('spiral:advanced', { step });
		const cores = detectBZPhaseCores(solver.state, setup, coordinate, Math.PI, 0.025);
		if (trace) console.error('spiral:cores', { step, count: cores.length });
		const interior = cores.filter(
			(core) => circularDishWallDistance([core.x, core.y], setup) > 1.5
		);
		if (step < observationStartStep) continue;
		coreCounts.push(interior.length);
		let core: BZPhaseCore | null = null;
		if (activeTrack) {
			core = matchBZCore(activeTrack.points.at(-1)!, interior, maximumTrackDistance);
			if (!core) activeTrack = null;
		}
		if (!activeTrack && interior.length > 0) {
			core = interior.reduce((best, candidate) =>
				Math.hypot(candidate.x, candidate.y) < Math.hypot(best.x, best.y) ? candidate : best
			);
			activeTrack = { points: [], orientations: [] };
			tracks.push(activeTrack);
		}
		if (activeTrack && core) {
			activeTrack.points.push({ ...core, step, modelTime: solver.modelTime });
			const orientation = annularBZOrientation(
				solver.state,
				setup,
				coordinate,
				[core.x, core.y],
				requestedAnnulusRadius,
				requestedAnnulusWidth
			);
			if (orientation !== null) {
				const previous = activeTrack.orientations.at(-1);
				activeTrack.orientations.push({
					step,
					modelTime: solver.modelTime,
					wrapped: orientation,
					unwrapped: previous ? unwrapAngle(previous.unwrapped, orientation) : orientation
				});
			}
		}
	}
	const bestTrack = tracks.reduce<Track | null>(
		(best, track) => (!best || track.points.length > best.points.length ? track : best),
		null
	);
	const firstOrientation = bestTrack?.orientations.at(0)?.unwrapped ?? 0;
	const lastOrientation = bestTrack?.orientations.at(-1)?.unwrapped ?? firstOrientation;
	const cumulativeAngle = Math.abs(lastOrientation - firstOrientation);
	const rotations = cumulativeAngle / (2 * Math.PI);
	const rotationPeriods = bestTrack ? completedRotationPeriods(bestTrack.orientations) : [];
	const rotationPeriodMean =
		rotationPeriods.length > 0
			? rotationPeriods.reduce((sum, period) => sum + period, 0) / rotationPeriods.length
			: null;
	const rotationPeriodCv =
		rotationPeriods.length > 1 ? coefficientOfVariation(rotationPeriods) : null;
	const maximumOrientationIncrement = bestTrack
		? bestTrack.orientations.reduce(
				(maximum, sample, index, samples) =>
					index === 0
						? maximum
						: Math.max(maximum, Math.abs(sample.unwrapped - samples[index - 1].unwrapped)),
				0
			)
		: 0;
	const detectedFraction = (bestTrack?.points.length ?? 0) / Math.max(1, coreCounts.length);
	const exactlyOneCoreFraction =
		coreCounts.filter((count) => count === 1).length / Math.max(1, coreCounts.length);
	const minimumWallDistance = bestTrack
		? Math.min(
				...bestTrack.points.map((point) => circularDishWallDistance([point.x, point.y], setup))
			)
		: Number.POSITIVE_INFINITY;
	const maximumCoreRadius = bestTrack
		? Math.max(...bestTrack.points.map((point) => Math.hypot(point.x, point.y)))
		: 0;
	const centralFraction = bestTrack
		? bestTrack.points.filter((point) => Math.hypot(point.x, point.y) < setup.activeRadius * 0.45)
				.length / bestTrack.points.length
		: 0;
	captureCheckpoint('persistent-single-spiral', solver, preparation);
	return {
		hero: 'persistent-single-spiral',
		parameters,
		setup,
		preparation,
		observationStart,
		orientationAnnulus: { radius: requestedAnnulusRadius, width: requestedAnnulusWidth },
		duration,
		finite: true,
		rotations,
		cumulativeAngle,
		rotationPeriods,
		rotationPeriodMean,
		rotationPeriodCv,
		maximumOrientationIncrement,
		detectedFraction,
		exactlyOneCoreFraction,
		centralFraction,
		minimumWallDistance,
		maximumCoreRadius,
		firstStepWithCore: bestTrack?.points.at(0)?.step ?? null,
		lastStepWithCore: bestTrack?.points.at(-1)?.step ?? null,
		minimumCoreCount: Math.min(...coreCounts),
		maximumCoreCount: Math.max(...coreCounts),
		trackSegments: tracks.map((track) => ({
			samples: track.points.length,
			startStep: track.points.at(0)?.step ?? null,
			endStep: track.points.at(-1)?.step ?? null,
			rotations:
				Math.abs(
					(track.orientations.at(-1)?.unwrapped ?? 0) - (track.orientations.at(0)?.unwrapped ?? 0)
				) /
				(2 * Math.PI)
		})),
		pass:
			rotations >= 3 &&
			detectedFraction >= 0.9 &&
			exactlyOneCoreFraction >= 0.8 &&
			rotationPeriods.length >= 2 &&
			(rotationPeriodCv === null || rotationPeriodCv <= 0.25) &&
			maximumOrientationIncrement < Math.PI / 2 &&
			minimumWallDistance > 1.5,
		durationMs: Math.round(performance.now() - started),
		samples: bestTrack
			? bestTrack.points.filter((_, index) => index < 8 || index === bestTrack.points.length - 1)
			: []
	};
}

function completedRotationPeriods(
	samples: readonly Readonly<{ modelTime: number; unwrapped: number }>[]
): number[] {
	if (samples.length < 2) return [];
	const displacement = samples.at(-1)!.unwrapped - samples[0].unwrapped;
	const direction = Math.sign(displacement);
	if (direction === 0) return [];
	const crossingTimes: number[] = [];
	let nextTurn = 1;
	for (let index = 1; index < samples.length; index += 1) {
		const previous = direction * (samples[index - 1].unwrapped - samples[0].unwrapped);
		const current = direction * (samples[index].unwrapped - samples[0].unwrapped);
		while (current >= nextTurn * 2 * Math.PI) {
			const target = nextTurn * 2 * Math.PI;
			const fraction = current === previous ? 0 : (target - previous) / (current - previous);
			crossingTimes.push(
				samples[index - 1].modelTime +
					fraction * (samples[index].modelTime - samples[index - 1].modelTime)
			);
			nextTurn += 1;
		}
	}
	return crossingTimes.slice(1).map((time, index) => time - crossingTimes[index]);
}

function runGarden(
	parameters: OregonatorSetup['parameters'],
	gridSize: number,
	timestep: number,
	duration: number
) {
	const setup = baseSetup(parameters, gridSize, timestep, 'multi-spiral-seed');
	const coordinate = phaseCoordinateFor(parameters);
	const solver = new BZFastCpuSolver(setup);
	const sampleEvery = Math.max(1, Math.round(0.1 / timestep));
	const endStep = Math.round(duration / timestep);
	const observationStart = requestedObservationStart ?? Math.min(2, duration * 0.2);
	const observationStartStep = Math.round(observationStart / timestep);
	const maximumTrackDistance = (setup.domainSize / setup.gridSize) * 4;
	const counts: number[] = [];
	let minimumSeparation = Number.POSITIVE_INFINITY;
	let minimumWallDistance = Number.POSITIVE_INFINITY;
	type GardenTrack = {
		points: BZCoreTrackPoint[];
		orientations: Array<{ modelTime: number; unwrapped: number }>;
		lastSample: number;
	};
	const tracks: GardenTrack[] = [];
	let sampleIndex = -1;
	const started = performance.now();
	for (let step = 0; step <= endStep; step += sampleEvery) {
		if (step > solver.stepIndex) solver.step(step - solver.stepIndex);
		if (step < observationStartStep) continue;
		sampleIndex += 1;
		const cores = detectBZPhaseCores(solver.state, setup, coordinate, Math.PI, 0.025).filter(
			(core) => circularDishWallDistance([core.x, core.y], setup) > 1.25
		);
		counts.push(cores.length);
		const candidates = tracks
			.flatMap((track, trackIndex) =>
				track.lastSample === sampleIndex - 1
					? cores.flatMap((core, coreIndex) => {
							const previous = track.points.at(-1)!;
							const distance = Math.hypot(previous.x - core.x, previous.y - core.y);
							return core.charge === previous.charge && distance <= maximumTrackDistance
								? [{ trackIndex, coreIndex, distance }]
								: [];
						})
					: []
			)
			.sort((left, right) => left.distance - right.distance);
		const assignedTracks = new Set<number>();
		const assignedCores = new Set<number>();
		for (const candidate of candidates) {
			if (assignedTracks.has(candidate.trackIndex) || assignedCores.has(candidate.coreIndex))
				continue;
			assignedTracks.add(candidate.trackIndex);
			assignedCores.add(candidate.coreIndex);
			appendGardenTrackSample(
				tracks[candidate.trackIndex],
				cores[candidate.coreIndex],
				step,
				solver.modelTime,
				solver.state,
				setup,
				coordinate,
				sampleIndex
			);
		}
		for (let coreIndex = 0; coreIndex < cores.length; coreIndex += 1) {
			if (assignedCores.has(coreIndex)) continue;
			const track: GardenTrack = { points: [], orientations: [], lastSample: sampleIndex };
			tracks.push(track);
			appendGardenTrackSample(
				track,
				cores[coreIndex],
				step,
				solver.modelTime,
				solver.state,
				setup,
				coordinate,
				sampleIndex
			);
		}
		for (let left = 0; left < cores.length; left += 1) {
			minimumWallDistance = Math.min(
				minimumWallDistance,
				circularDishWallDistance([cores[left].x, cores[left].y], setup)
			);
			for (let right = left + 1; right < cores.length; right += 1) {
				minimumSeparation = Math.min(
					minimumSeparation,
					Math.hypot(cores[left].x - cores[right].x, cores[left].y - cores[right].y)
				);
			}
		}
	}
	const persistentTracks = tracks.filter(
		(track) =>
			track.points.length >= counts.length * 0.9 &&
			track.points.at(0)?.step === observationStartStep &&
			track.points.at(-1)?.step === endStep
	);
	const persistentFraction =
		counts.filter((count) => count >= 3).length / Math.max(1, counts.length);
	const characteristicPeriodReference = 2.75;
	const survivalTimes = persistentTracks.map(
		(track) => track.points.at(-1)!.modelTime - track.points[0].modelTime
	);
	const measuredRotations = persistentTracks.map((track) =>
		track.orientations.length > 1
			? Math.abs(track.orientations.at(-1)!.unwrapped - track.orientations[0].unwrapped) /
				(2 * Math.PI)
			: 0
	);
	captureCheckpoint('spiral-garden', solver, []);
	return {
		hero: 'spiral-garden',
		parameters,
		setup,
		observationStart,
		duration,
		finite: true,
		minimumCoreCount: Math.min(...counts),
		maximumCoreCount: Math.max(...counts),
		persistentFraction,
		persistentTrackCount: persistentTracks.length,
		characteristicPeriodReference,
		minimumSurvivalTime: survivalTimes.length > 0 ? Math.min(...survivalTimes) : 0,
		measuredRotations,
		minimumMeasuredRotations: measuredRotations.length > 0 ? Math.min(...measuredRotations) : 0,
		minimumSeparation,
		minimumWallDistance,
		trackSummaries: persistentTracks.map((track) => ({
			charge: track.points[0].charge,
			samples: track.points.length,
			start: track.points[0].modelTime,
			end: track.points.at(-1)!.modelTime,
			rotations:
				track.orientations.length > 1
					? Math.abs(track.orientations.at(-1)!.unwrapped - track.orientations[0].unwrapped) /
						(2 * Math.PI)
					: 0
		})),
		pass:
			persistentTracks.length >= 3 &&
			persistentFraction >= 0.9 &&
			Math.min(...survivalTimes) >= characteristicPeriodReference * 3 &&
			minimumSeparation > 0.6 &&
			minimumWallDistance > 1.25,
		durationMs: Math.round(performance.now() - started)
	};

	function appendGardenTrackSample(
		track: GardenTrack,
		core: BZPhaseCore,
		step: number,
		modelTime: number,
		state: Readonly<ReturnType<BZFastCpuSolver['snapshot']>>,
		gardenSetup: Readonly<BZSetup>,
		gardenCoordinate: Readonly<BZV2PhaseCoordinate>,
		currentSample: number
	) {
		track.points.push({ ...core, step, modelTime });
		track.lastSample = currentSample;
		const orientation = annularBZOrientation(
			state,
			gardenSetup,
			gardenCoordinate,
			[core.x, core.y],
			2,
			0.8
		);
		if (orientation === null) return;
		const previous = track.orientations.at(-1);
		track.orientations.push({
			modelTime,
			unwrapped: previous ? unwrapAngle(previous.unwrapped, orientation) : orientation
		});
	}
}

function runTarget(
	parameters: OregonatorSetup['parameters'],
	gridSize: number,
	timestep: number,
	duration: number,
	sourcePeriod: number
) {
	const setup = baseSetup(parameters, gridSize, timestep, 'periodic-source');
	const equilibrium = oregonatorRecoveredEquilibrium(parameters);
	const periodSteps = Math.round(sourcePeriod / timestep);
	const endStep = Math.round(duration / timestep);
	const sourceEndTime = requestedSourceEnd ?? Math.max(duration, 60);
	const sourceEndStep = Math.round(sourceEndTime / timestep);
	const observationStart = requestedObservationStart ?? 0;
	const observationStartStep = Math.round(observationStart / timestep);
	const source: BZIntervention = {
		schemaVersion: BZ_SCHEMA_VERSION,
		sequence: 0,
		step: 0,
		kind: 'pacemaker',
		center: [0.5, 0.5],
		radius: requestedSourceRadius,
		amount: requestedSourceAmount,
		sourceMode: 'state-reset',
		targetU: 0.8,
		targetV: equilibrium.v * 0.75,
		strength: 1,
		periodSteps,
		endStep: sourceEndStep
	};
	const solver = new BZFastCpuSolver(setup, { interventions: [source] });
	const sampleEvery = Math.max(1, Math.round(0.05 / timestep));
	const peakCounts: number[] = [];
	const peakSnapshots: Array<{ time: number; radii: number[] }> = [];
	const radialBins = Math.max(24, Math.floor(gridSize / 2));
	const radialBinWidth = setup.activeRadius / radialBins;
	const minimumFrontSpacing = Math.max(1.5, (setup.domainSize / setup.gridSize) * 3);
	const minimumSeparationBins = Math.max(2, Math.ceil(minimumFrontSpacing / radialBinWidth));
	const sourceExclusionRadius = requestedSourceRadius * setup.domainSize + minimumFrontSpacing;
	type RadialTrack = {
		points: Array<{ time: number; radius: number; prominence: number }>;
		lastSample: number;
	};
	const tracks: RadialTrack[] = [];
	let sampleIndex = -1;
	const maximumTrackDisplacement = Math.max(radialBinWidth * 2.5, setup.domainSize / gridSize);
	let maximumPeaks = 0;
	let maximumOuterRadius = 0;
	let minimumObservedSpacing = Number.POSITIVE_INFINITY;
	let threeFrontWindowStart: number | null = null;
	let threeFrontWindowEnd: number | null = null;
	const started = performance.now();
	for (let step = 0; step <= endStep; step += sampleEvery) {
		if (step > solver.stepIndex) solver.step(step - solver.stepIndex);
		if (step < observationStartStep) continue;
		sampleIndex += 1;
		const peaks = findBZRadialPeaks(
			bzRadialProfile(solver.state, setup, 'u', radialBins),
			0.035,
			minimumSeparationBins
		).filter(
			(peak) =>
				peak.radius > sourceExclusionRadius &&
				peak.radius < setup.activeRadius - minimumFrontSpacing
		);
		const radii = peaks.map((peak) => peak.radius);
		const associations = tracks
			.flatMap((track, trackIndex) =>
				track.lastSample === sampleIndex - 1
					? peaks.flatMap((peak, peakIndex) => {
							const previous = track.points.at(-1)!.radius;
							const displacement = peak.radius - previous;
							return displacement >= -radialBinWidth && displacement <= maximumTrackDisplacement
								? [{ trackIndex, peakIndex, distance: Math.abs(displacement) }]
								: [];
						})
					: []
			)
			.sort((left, right) => left.distance - right.distance);
		const assignedTracks = new Set<number>();
		const assignedPeaks = new Set<number>();
		for (const association of associations) {
			if (assignedTracks.has(association.trackIndex) || assignedPeaks.has(association.peakIndex))
				continue;
			assignedTracks.add(association.trackIndex);
			assignedPeaks.add(association.peakIndex);
			const track = tracks[association.trackIndex];
			const peak = peaks[association.peakIndex];
			track.points.push({
				time: solver.modelTime,
				radius: peak.radius,
				prominence: peak.prominence
			});
			track.lastSample = sampleIndex;
		}
		for (let peakIndex = 0; peakIndex < peaks.length; peakIndex += 1) {
			if (assignedPeaks.has(peakIndex)) continue;
			tracks.push({
				points: [
					{
						time: solver.modelTime,
						radius: peaks[peakIndex].radius,
						prominence: peaks[peakIndex].prominence
					}
				],
				lastSample: sampleIndex
			});
		}
		peakCounts.push(peaks.length);
		maximumPeaks = Math.max(maximumPeaks, peaks.length);
		const outer = radii.at(-1) ?? null;
		if (outer !== null) {
			maximumOuterRadius = Math.max(maximumOuterRadius, outer);
		}
		for (let index = 1; index < radii.length; index += 1) {
			minimumObservedSpacing = Math.min(minimumObservedSpacing, radii[index] - radii[index - 1]);
		}
		if (peaks.length >= 3) {
			threeFrontWindowStart ??= solver.modelTime;
			threeFrontWindowEnd = solver.modelTime;
			if (peakSnapshots.length < 12 || step === endStep)
				peakSnapshots.push({ time: solver.modelTime, radii });
		}
	}
	const simultaneousFraction = peakCounts.filter((count) => count >= 3).length / peakCounts.length;
	const sourceFirings = Math.floor(endStep / periodSteps) + 1;
	const sourceFiringsInWindow = Math.max(
		0,
		Math.floor(endStep / periodSteps) - Math.ceil(observationStartStep / periodSteps) + 1
	);
	const trackSummaries = tracks
		.filter((track) => track.points.length >= 5)
		.map((track) => {
			const first = track.points[0];
			const last = track.points.at(-1)!;
			let outward = 0;
			for (let index = 1; index < track.points.length; index += 1) {
				if (track.points[index].radius >= track.points[index - 1].radius - radialBinWidth)
					outward += 1;
			}
			return {
				samples: track.points.length,
				startTime: first.time,
				endTime: last.time,
				startRadius: first.radius,
				endRadius: last.radius,
				netDisplacement: last.radius - first.radius,
				meanSpeed: (last.radius - first.radius) / (last.time - first.time),
				outwardFraction: outward / Math.max(1, track.points.length - 1),
				meanProminence:
					track.points.reduce((sum, point) => sum + point.prominence, 0) / track.points.length
			};
		});
	const outwardTracks = trackSummaries.filter(
		(track) =>
			track.netDisplacement >= radialBinWidth * 2 &&
			track.meanSpeed > 0 &&
			track.outwardFraction >= 0.8
	);
	const meanWaveSpeed =
		outwardTracks.length > 0
			? outwardTracks.reduce((sum, track) => sum + track.meanSpeed, 0) / outwardTracks.length
			: null;
	const wallReflectionTracks = trackSummaries.filter(
		(track) =>
			track.startRadius > setup.activeRadius - minimumFrontSpacing * 2 &&
			track.netDisplacement < -radialBinWidth * 2
	).length;
	captureCheckpoint('classic-target-rings', solver, [source]);
	return {
		hero: 'classic-target-rings',
		parameters,
		setup,
		duration,
		observationStart,
		sourcePeriod,
		periodSteps,
		sourceFirings,
		sourceFiringsInWindow,
		sourceEndTime,
		sourceEndStep,
		minimumFrontSpacing,
		sourceExclusionRadius,
		radialBinWidth,
		finite: true,
		maximumSignificantPeaks: maximumPeaks,
		simultaneousThreePeakFraction: simultaneousFraction,
		maximumOuterRadius,
		wallMargin: setup.activeRadius - maximumOuterRadius,
		minimumObservedSpacing,
		meanWaveSpeed,
		outwardTrackCount: outwardTracks.length,
		wallReflectionTracks,
		threeFrontWindowStart,
		threeFrontWindowEnd,
		pass:
			sourceFirings >= 3 &&
			sourceFiringsInWindow >= 2 &&
			maximumPeaks >= 3 &&
			simultaneousFraction > 0.05 &&
			minimumObservedSpacing >= minimumFrontSpacing &&
			outwardTracks.length >= 3 &&
			wallReflectionTracks === 0 &&
			maximumOuterRadius < setup.activeRadius - minimumFrontSpacing,
		durationMs: Math.round(performance.now() - started),
		peakTracks: peakSnapshots.slice(-12),
		trackSummaries: outwardTracks.slice(-12)
	};
}

function captureCheckpoint(
	heroId: Exclude<Hero, 'all'>,
	solver: BZFastCpuSolver,
	interventions: readonly BZIntervention[]
): void {
	if (!emitCheckpoint) return;
	if (solver.setup.gridSize !== 256) {
		throw new RangeError('--emit-checkpoint requires the live 256² calibration grid.');
	}
	checkpointCaptures.push({
		hero: heroId,
		setup: solver.setup,
		interventions,
		step: solver.stepIndex,
		state: solver.snapshot()
	});
}

function cartesian(epsilons: number[], qs: number[], fs: number[]) {
	return epsilons.flatMap((epsilon) => qs.flatMap((q) => fs.map((f) => ({ epsilon, q, f }))));
}

function phaseCoordinateFor(parameters: OregonatorSetup['parameters']): BZV2PhaseCoordinate {
	const equilibrium = oregonatorRecoveredEquilibrium(parameters);
	return {
		...phaseCoordinate,
		centreU: requestedPhaseU ?? equilibrium.u,
		centreV: requestedPhaseV ?? equilibrium.v
	};
}

function safely<T>(
	run: () => T,
	heroId: string,
	parameters: OregonatorSetup['parameters']
): T | Record<string, unknown> {
	try {
		return run();
	} catch (error) {
		return {
			hero: heroId,
			parameters,
			finite: false,
			pass: false,
			rejectedBy: error instanceof Error ? error.name : 'unknown-error',
			reason: error instanceof Error ? error.message : String(error)
		};
	}
}

function valueArgument(name: string): string | null {
	const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
	return direct ? direct.slice(name.length + 1) : null;
}

function numberArgument(name: string): number | null {
	const value = valueArgument(name);
	if (value === null) return null;
	const number = Number(value);
	if (!Number.isFinite(number)) throw new RangeError(`${name} must be finite.`);
	return number;
}

function calibrationGallery(artifact: Readonly<Record<string, unknown>>): string {
	const rows = (artifact.results as Array<Record<string, unknown>>)
		.map(
			(result) =>
				`<tr><td>${escapeHtml(String(result.hero))}</td><td><code>${escapeHtml(JSON.stringify(result.parameters))}</code></td><td>${result.pass ? 'PASS' : 'candidate'}</td><td><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></td></tr>`
		)
		.join('');
	return `<!doctype html><meta charset="utf-8"><title>BZ V2 calibration gallery</title><style>body{font:14px system-ui;background:#101417;color:#e9ece8;margin:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #394349;padding:.6rem;vertical-align:top}pre{max-height:18rem;overflow:auto;white-space:pre-wrap}code{color:#efb47e}</style><h1>BZ V2 internal calibration gallery</h1><p>Objective numerical summaries; never a visual-only classifier.</p><table><thead><tr><th>Hero</th><th>Parameters</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!
	);
}
