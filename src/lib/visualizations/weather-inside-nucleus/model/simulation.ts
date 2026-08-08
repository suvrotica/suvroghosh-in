import { SeededRandom } from '$lib/utils/seeded-random';
import {
	downstreamStep,
	hazardProbability,
	licensingStep,
	nuclearStep,
	occupancyStep,
	promoterActivationRate,
	receptorStep,
	unitRoundoff,
	waitingTimeFromUniform
} from './equations';
import {
	contactPropensity,
	createModelParameters,
	DEFAULT_INITIAL_STATE,
	ENSEMBLE_SIZE,
	MODEL_VERSION,
	signalInput
} from './parameters';
import {
	checkedUniform,
	createModelRandomStreams,
	sampleBinomial,
	samplePoisson,
	validateUint32Seed
} from './stochastic';
import type {
	BinaryState,
	EnsembleOptions,
	EnsembleResult,
	EnsembleSummary,
	InitialModelState,
	MatchedEnsembleResult,
	ModelParameters,
	ModelTimeline,
	RunSummary,
	SimulationOptions,
	SimulationResult
} from './types';

const MAX_ENSEMBLE_RUNS = 4_096;

export function simulateSingle(options: SimulationOptions): SimulationResult {
	const seed = validateUint32Seed(options.seed);
	const parameters = createModelParameters(options.parameters ?? {});
	const initial = createInitialState(options.initialState);
	const streams = createModelRandomStreams(seed);
	const dt = parameters.timestep;
	const stepCount = Math.round(parameters.duration / dt);
	const sampleEverySteps = Math.round(parameters.sampleInterval / dt);
	const sampleCount = Math.round(parameters.duration / parameters.sampleInterval) + 1;
	const timeline = createTimeline(sampleCount);
	const stationaryNearPropensity = contactPropensity(parameters.geometryBias, parameters);

	let receptor = initial.receptorActivity;
	let downstream = initial.downstreamActivity;
	let nuclear = initial.nuclearActivity;
	let occupancy = initial.occupancy;
	let licensing = initial.licensing;
	let contact: BinaryState =
		initial.contactState ?? (checkedUniform(streams.contact) < stationaryNearPropensity ? 1 : 0);
	let promoter: BinaryState = initial.promoterState;
	let rnaCount = initial.rnaCount;

	const contactTransitionTimes: number[] = [];
	const burstStartTimes: number[] = promoter === 1 ? [0] : [];
	const burstEndTimes: number[] = [];
	const completedBurstDurations: number[] = [];
	const initiationTimes: number[] = [];
	let activeBurstStart: number | null = promoter === 1 ? 0 : null;
	let promoterOnTime = 0;
	let nearTime = 0;
	let closeEncounterCount = contact;
	let receptorIntegral = 0;
	let downstreamIntegral = 0;
	let nuclearIntegral = 0;
	let occupancyIntegral = 0;

	let sampleIndex = 0;
	writeTimelineSample(
		timeline,
		sampleIndex,
		0,
		parameters,
		stationaryNearPropensity,
		receptor,
		downstream,
		nuclear,
		occupancy,
		licensing,
		contact,
		promoter,
		rnaCount
	);

	for (let step = 0; step < stepCount; step += 1) {
		const startTime = step * dt;
		const midpointTime = startTime + dt / 2;
		const input = signalInput(midpointTime, parameters);

		const previousReceptor = receptor;
		const previousDownstream = downstream;
		const previousNuclear = nuclear;
		const previousOccupancy = occupancy;

		receptor = unitRoundoff(receptorStep(receptor, input, parameters, dt), 'receptor activity');
		downstream = unitRoundoff(
			downstreamStep(downstream, (previousReceptor + receptor) / 2, parameters, dt),
			'downstream activity'
		);
		nuclear = unitRoundoff(
			nuclearStep(nuclear, (previousDownstream + downstream) / 2, parameters, dt),
			'nuclear activity'
		);
		occupancy = unitRoundoff(
			occupancyStep(occupancy, (previousNuclear + nuclear) / 2, parameters, dt),
			'occupancy propensity'
		);

		receptorIntegral += ((previousReceptor + receptor) * dt) / 2;
		downstreamIntegral += ((previousDownstream + downstream) * dt) / 2;
		nuclearIntegral += ((previousNuclear + nuclear) * dt) / 2;
		occupancyIntegral += ((previousOccupancy + occupancy) * dt) / 2;

		const previousContact = contact;
		const contactRate =
			contact === 1
				? parameters.contactSwitchingRate * (1 - stationaryNearPropensity)
				: parameters.contactSwitchingRate * stationaryNearPropensity;
		const contactUniform = checkedUniform(streams.contact);
		let contactTransitionOffset: number | null = null;
		if (contactRate > 0 && contactUniform < hazardProbability(contactRate, dt)) {
			contactTransitionOffset = Math.min(dt, waitingTimeFromUniform(contactRate, contactUniform));
			contact = contact === 1 ? 0 : 1;
			contactTransitionTimes.push(startTime + contactTransitionOffset);
			if (contact === 1) closeEncounterCount += 1;
		}

		if (contactTransitionOffset === null) {
			licensing = licensingStep(licensing, contact, parameters, dt);
			if (contact === 1) nearTime += dt;
		} else {
			licensing = licensingStep(licensing, previousContact, parameters, contactTransitionOffset);
			licensing = licensingStep(licensing, contact, parameters, dt - contactTransitionOffset);
			nearTime += previousContact === 1 ? contactTransitionOffset : dt - contactTransitionOffset;
		}
		licensing = unitRoundoff(licensing, 'licensing state');

		const previousPromoter = promoter;
		const promoterRate =
			promoter === 1
				? parameters.promoterDeactivationRate
				: promoterActivationRate(occupancy, licensing, parameters);
		const promoterUniform = checkedUniform(streams.promoter);
		let promoterTransitionOffset: number | null = null;
		if (promoterRate > 0 && promoterUniform < hazardProbability(promoterRate, dt)) {
			promoterTransitionOffset = Math.min(
				dt,
				waitingTimeFromUniform(promoterRate, promoterUniform)
			);
			promoter = promoter === 1 ? 0 : 1;
			const eventTime = startTime + promoterTransitionOffset;
			if (promoter === 1) {
				activeBurstStart = eventTime;
				burstStartTimes.push(eventTime);
			} else {
				burstEndTimes.push(eventTime);
				if (activeBurstStart !== null) {
					completedBurstDurations.push(eventTime - activeBurstStart);
				}
				activeBurstStart = null;
			}
		}

		let activeStartOffset = 0;
		let activeDuration: number;
		if (promoterTransitionOffset === null) {
			activeDuration = promoter === 1 ? dt : 0;
		} else if (previousPromoter === 0) {
			activeStartOffset = promoterTransitionOffset;
			activeDuration = dt - promoterTransitionOffset;
		} else {
			activeDuration = promoterTransitionOffset;
		}
		promoterOnTime += activeDuration;

		if (rnaCount > 0 && parameters.rnaDegradationRate > 0) {
			const degraded = sampleBinomial(
				rnaCount,
				hazardProbability(parameters.rnaDegradationRate, dt),
				streams.degradation
			);
			rnaCount -= degraded;
		}

		if (activeDuration > 0 && parameters.transcriptionInitiationRate > 0) {
			const initiated = samplePoisson(
				parameters.transcriptionInitiationRate * activeDuration,
				streams.initiation
			);
			if (initiated > 0) {
				const timesThisStep = new Array<number>(initiated);
				for (let event = 0; event < initiated; event += 1) {
					timesThisStep[event] =
						startTime + activeStartOffset + checkedUniform(streams.initiation) * activeDuration;
				}
				timesThisStep.sort((left, right) => left - right);
				initiationTimes.push(...timesThisStep);
				rnaCount += initiated;
				if (!Number.isSafeInteger(rnaCount) || rnaCount > 0xffff_ffff) {
					throw new Error('RNA count exceeded its bounded unsigned-integer representation.');
				}
			}
		}

		if ((step + 1) % sampleEverySteps === 0) {
			sampleIndex += 1;
			writeTimelineSample(
				timeline,
				sampleIndex,
				(step + 1) * dt,
				parameters,
				stationaryNearPropensity,
				receptor,
				downstream,
				nuclear,
				occupancy,
				licensing,
				contact,
				promoter,
				rnaCount
			);
		}
	}

	if (sampleIndex !== sampleCount - 1) {
		throw new Error('Timeline sampling did not end on the configured duration.');
	}

	const summary = createRunSummary({
		seed,
		burstStartTimes,
		burstEndTimes,
		completedBurstDurations,
		initiationTimes,
		promoterOnTime,
		nearTime,
		closeEncounterCount,
		duration: parameters.duration,
		receptorIntegral,
		downstreamIntegral,
		nuclearIntegral,
		occupancyIntegral
	});

	return {
		modelVersion: MODEL_VERSION,
		seed,
		parameters,
		timeline,
		contactTransitionTimes: Float64Array.from(contactTransitionTimes),
		burstStartTimes: Float64Array.from(burstStartTimes),
		burstEndTimes: Float64Array.from(burstEndTimes),
		completedBurstDurations: Float64Array.from(completedBurstDurations),
		initiationTimes: Float64Array.from(initiationTimes),
		summary
	};
}

export function deriveEnsembleSeeds(rootSeed: number, count = ENSEMBLE_SIZE): Uint32Array {
	const seed = validateUint32Seed(rootSeed);
	validateEnsembleCount(count);
	const seeds = new Uint32Array(count);
	seeds[0] = seed;
	const used = new Set<number>([seed]);
	const random = new SeededRandom(seed).fork('weather-inside-nucleus:ensemble-seeds');
	for (let index = 1; index < count; index += 1) {
		let candidate = random.nextUint32();
		while (used.has(candidate)) candidate = random.nextUint32();
		seeds[index] = candidate;
		used.add(candidate);
	}
	return seeds;
}

export function simulateEnsemble(options: EnsembleOptions): EnsembleResult {
	const parameters = createModelParameters(options.parameters ?? {});
	const rootSeed = validateUint32Seed(options.rootSeed);
	const count = options.seeds ? options.seeds.length : (options.count ?? ENSEMBLE_SIZE);
	validateEnsembleCount(count);
	if (options.count !== undefined && options.seeds && options.count !== options.seeds.length) {
		throw new RangeError('An explicit ensemble count must match the supplied seed count.');
	}
	const seeds = options.seeds
		? Uint32Array.from(options.seeds, (value) => validateUint32Seed(value))
		: deriveEnsembleSeeds(rootSeed, count);
	const runs = Array.from(seeds, (seed) => simulateSingle({ seed, parameters }));
	return assembleEnsembleResult(parameters, rootSeed, seeds, runs);
}

export function simulateMatchedEnsembles(options: {
	rootSeed: number;
	baseline: Readonly<ModelParameters> | Partial<ModelParameters>;
	intervention: Readonly<ModelParameters> | Partial<ModelParameters>;
	count?: number;
}): MatchedEnsembleResult {
	const seeds = deriveEnsembleSeeds(options.rootSeed, options.count ?? ENSEMBLE_SIZE);
	const baseline = simulateEnsemble({
		rootSeed: options.rootSeed,
		parameters: options.baseline,
		seeds
	});
	const intervention = simulateEnsemble({
		rootSeed: options.rootSeed,
		parameters: options.intervention,
		seeds
	});
	return { seeds, baseline, intervention };
}

function createInitialState(overrides: Partial<InitialModelState> = {}): InitialModelState {
	const state = { ...DEFAULT_INITIAL_STATE, ...overrides };
	for (const [name, value] of Object.entries(state)) {
		if (name === 'contactState' || name === 'promoterState' || name === 'rnaCount') continue;
		if (!Number.isFinite(value) || Number(value) < 0 || Number(value) > 1) {
			throw new RangeError(`${name} must be finite and within [0, 1].`);
		}
	}
	if (state.contactState !== undefined && state.contactState !== 0 && state.contactState !== 1) {
		throw new RangeError('contactState must be zero, one, or omitted for a stationary draw.');
	}
	if (state.promoterState !== 0 && state.promoterState !== 1) {
		throw new RangeError('promoterState must be zero or one.');
	}
	if (!Number.isSafeInteger(state.rnaCount) || state.rnaCount < 0 || state.rnaCount > 0xffff_ffff) {
		throw new RangeError('rnaCount must be an unsigned 32-bit integer.');
	}
	return state;
}

function createTimeline(length: number): ModelTimeline {
	return {
		time: new Float64Array(length),
		signalInput: new Float64Array(length),
		receptorActivity: new Float64Array(length),
		downstreamActivity: new Float64Array(length),
		nuclearActivity: new Float64Array(length),
		occupancy: new Float64Array(length),
		licensing: new Float64Array(length),
		contactPropensity: new Float64Array(length),
		contactState: new Uint8Array(length),
		promoterState: new Uint8Array(length),
		rnaCount: new Uint32Array(length)
	};
}

function writeTimelineSample(
	timeline: ModelTimeline,
	index: number,
	time: number,
	parameters: Readonly<ModelParameters>,
	stationaryNearPropensity: number,
	receptor: number,
	downstream: number,
	nuclear: number,
	occupancy: number,
	licensing: number,
	contact: BinaryState,
	promoter: BinaryState,
	rnaCount: number
): void {
	timeline.time[index] = time;
	timeline.signalInput[index] = signalInput(time, parameters);
	timeline.receptorActivity[index] = receptor;
	timeline.downstreamActivity[index] = downstream;
	timeline.nuclearActivity[index] = nuclear;
	timeline.occupancy[index] = occupancy;
	timeline.licensing[index] = licensing;
	timeline.contactPropensity[index] = stationaryNearPropensity;
	timeline.contactState[index] = contact;
	timeline.promoterState[index] = promoter;
	timeline.rnaCount[index] = rnaCount;
}

function createRunSummary(input: {
	seed: number;
	burstStartTimes: readonly number[];
	burstEndTimes: readonly number[];
	completedBurstDurations: readonly number[];
	initiationTimes: readonly number[];
	promoterOnTime: number;
	nearTime: number;
	closeEncounterCount: number;
	duration: number;
	receptorIntegral: number;
	downstreamIntegral: number;
	nuclearIntegral: number;
	occupancyIntegral: number;
}): RunSummary {
	const burstCount = input.burstStartTimes.length;
	return {
		seed: input.seed,
		hadBurst: burstCount > 0,
		burstCount,
		completedBurstCount: input.completedBurstDurations.length,
		censoredBurstCount: burstCount - input.completedBurstDurations.length,
		initiationCount: input.initiationTimes.length,
		firstBurstTime: input.burstStartTimes[0] ?? null,
		firstInitiationTime: input.initiationTimes[0] ?? null,
		promoterOnTime: input.promoterOnTime,
		nearTime: input.nearTime,
		nearFraction: input.nearTime / input.duration,
		closeEncounterCount: input.closeEncounterCount,
		meanCompletedBurstDuration: meanOrNull(input.completedBurstDurations),
		meanInitiationsPerBurst: burstCount > 0 ? input.initiationTimes.length / burstCount : null,
		receptorActivityIntegral: input.receptorIntegral,
		downstreamActivityIntegral: input.downstreamIntegral,
		nuclearActivityIntegral: input.nuclearIntegral,
		occupancyIntegral: input.occupancyIntegral
	};
}

function assembleEnsembleResult(
	parameters: Readonly<ModelParameters>,
	rootSeed: number,
	seeds: Uint32Array,
	runs: readonly SimulationResult[]
): EnsembleResult {
	const count = runs.length;
	const burstCounts = new Uint16Array(count);
	const initiationCounts = new Uint32Array(count);
	const firstBurstTimes = new Float64Array(count);
	const firstBurstCensored = new Uint8Array(count);
	const nearFractions = new Float64Array(count);
	let burstingRunCount = 0;
	let totalBurstCount = 0;
	let totalInitiationCount = 0;
	let totalNearFraction = 0;
	let restrictedFirstBurstTotal = 0;
	let completedBurstDurationTotal = 0;
	let completedBurstCount = 0;
	let promoterOnTimeTotal = 0;
	const observedFirstBurstTimes: number[] = [];

	for (let index = 0; index < count; index += 1) {
		const run = runs[index];
		const summary = run.summary;
		if (summary.burstCount > 0xffff) {
			throw new Error('Burst count exceeded its bounded unsigned-integer representation.');
		}
		burstCounts[index] = summary.burstCount;
		initiationCounts[index] = summary.initiationCount;
		nearFractions[index] = summary.nearFraction;
		totalBurstCount += summary.burstCount;
		totalInitiationCount += summary.initiationCount;
		totalNearFraction += summary.nearFraction;
		promoterOnTimeTotal += summary.promoterOnTime;
		for (const duration of run.completedBurstDurations) {
			completedBurstDurationTotal += duration;
			completedBurstCount += 1;
		}
		if (summary.firstBurstTime === null) {
			firstBurstTimes[index] = Number.NaN;
			firstBurstCensored[index] = 1;
			restrictedFirstBurstTotal += parameters.duration;
		} else {
			firstBurstTimes[index] = summary.firstBurstTime;
			observedFirstBurstTimes.push(summary.firstBurstTime);
			restrictedFirstBurstTotal += summary.firstBurstTime;
			burstingRunCount += 1;
		}
	}

	observedFirstBurstTimes.sort((left, right) => left - right);
	const summary: EnsembleSummary = {
		runCount: count,
		burstingRunCount,
		silentRunCount: count - burstingRunCount,
		burstFraction: burstingRunCount / count,
		meanBurstCount: totalBurstCount / count,
		meanInitiationCount: totalInitiationCount / count,
		meanNearFraction: totalNearFraction / count,
		medianFirstBurstTimeAmongBursting: medianOrNull(observedFirstBurstTimes),
		restrictedMeanTimeToFirstBurst: restrictedFirstBurstTotal / count,
		meanCompletedBurstDuration:
			completedBurstCount > 0 ? completedBurstDurationTotal / completedBurstCount : null,
		meanInitiationsPerPromoterOnMinute:
			promoterOnTimeTotal > 0 ? totalInitiationCount / promoterOnTimeTotal : null
	};

	return {
		modelVersion: MODEL_VERSION,
		parameters,
		rootSeed,
		seeds,
		runs,
		burstCounts,
		initiationCounts,
		firstBurstTimes,
		firstBurstCensored,
		nearFractions,
		summary
	};
}

function validateEnsembleCount(count: number): void {
	if (!Number.isSafeInteger(count) || count < 1 || count > MAX_ENSEMBLE_RUNS) {
		throw new RangeError(`Ensemble count must be an integer within [1, ${MAX_ENSEMBLE_RUNS}].`);
	}
}

function meanOrNull(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	let total = 0;
	for (const value of values) total += value;
	return total / values.length;
}

function medianOrNull(sortedValues: readonly number[]): number | null {
	if (sortedValues.length === 0) return null;
	const middle = Math.floor(sortedValues.length / 2);
	return sortedValues.length % 2 === 0
		? (sortedValues[middle - 1] + sortedValues[middle]) / 2
		: sortedValues[middle];
}
