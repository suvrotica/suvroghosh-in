import { hashSeed } from '../seeded-random';
import type {
	FeatureStreamData,
	GenerationProgress,
	OrchestraSnapshot,
	SonicEvent,
	SonicEventType,
	SoundWorldPatch
} from '../types';
import { ORCHESTRA_MAPPING_VERSION } from '../versions';
import { getSoundWorldPatch } from './musical-worlds';

const GLOBAL_EVENT_DENSITY_CEILING = 12;
const COMPOSED_SUBDIVISION_SECONDS = 0.125;
const TARGET_MEDIAN_INTERVAL_SECONDS = 0.48;

interface EventCandidate {
	readonly index: number;
	readonly type: SonicEventType;
	readonly sourceFeature: string;
	readonly explanation: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function validateFeatures(features: FeatureStreamData): void {
	const count = features.pointCount;
	const scalarArrays: readonly ArrayLike<number>[] = [
		features.simulationSteps,
		features.simulationTimes,
		features.speed01,
		features.curvature01,
		features.stretching01,
		features.recurrence01,
		features.density01,
		features.region,
		features.sectionDirection,
		features.returnInterval01,
		features.noiseValue01,
		features.noiseGradient01,
		features.noiseCurlAngle01,
		features.noiseCellBoundary01
	];
	if (count < 2 || scalarArrays.some((array) => array.length !== count)) {
		throw new RangeError('Feature stream arrays do not share the declared point count.');
	}
	if (features.position01.length !== count * 3 || features.warpedPosition01.length !== count * 3) {
		throw new RangeError('Feature positions must be packed as x/y/z triples.');
	}
}

function collectCandidates(features: FeatureStreamData): EventCandidate[] {
	const candidates: EventCandidate[] = [];
	let previousRegion = features.region[0];
	let recurrenceArmed = true;
	let foldArmed = true;
	let cellularArmed = true;
	let lastCandidate = -8;
	for (let index = 1; index < features.pointCount; index += 1) {
		let candidate: EventCandidate | null = null;
		const crossing = features.sectionDirection[index];
		if (crossing !== 0) {
			candidate = {
				index,
				type: 'section-crossing',
				sourceFeature: 'sectionCrossing',
				explanation:
					crossing > 0
						? 'Forward crossing → resonator excitation'
						: 'Reverse crossing → answering resonator excitation'
			};
		} else if (recurrenceArmed && features.recurrence01[index] >= 0.84) {
			candidate = {
				index,
				type: 'recurrence',
				sourceFeature: 'recurrence01',
				explanation: 'Near recurrence → an earlier motif returns'
			};
			recurrenceArmed = false;
		} else if (cellularArmed && features.noiseCellBoundary01[index] >= 0.86) {
			candidate = {
				index,
				type: 'cell-boundary',
				sourceFeature: 'noise.cellBoundary01',
				explanation: 'Cellular boundary → percussive material accent'
			};
			cellularArmed = false;
		} else if (foldArmed && features.curvature01[index] >= 0.82) {
			candidate = {
				index,
				type: 'fold',
				sourceFeature: 'curvature01',
				explanation: 'Strong curvature → brighter, sharper attack'
			};
			foldArmed = false;
		} else if (features.region[index] !== previousRegion) {
			candidate = {
				index,
				type: 'region-transition',
				sourceFeature: 'region',
				explanation: `Region ${previousRegion + 1} → region ${features.region[index] + 1}`
			};
		}
		if (features.recurrence01[index] < 0.55) recurrenceArmed = true;
		if (features.curvature01[index] < 0.45) foldArmed = true;
		if (features.noiseCellBoundary01[index] < 0.62) cellularArmed = true;
		previousRegion = features.region[index];
		if (candidate && index - lastCandidate >= 4) {
			candidates.push(candidate);
			lastCandidate = index;
		}
	}
	return candidates;
}

function median(values: number[]): number {
	if (values.length === 0) return 1;
	values.sort((left, right) => left - right);
	const middle = Math.floor(values.length / 2);
	return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function calculateTimeScale(
	candidates: readonly EventCandidate[],
	features: FeatureStreamData
): number {
	const intervals: number[] = [];
	for (let index = 1; index < candidates.length; index += 1) {
		const interval =
			features.simulationTimes[candidates[index].index] -
			features.simulationTimes[candidates[index - 1].index];
		if (Number.isFinite(interval) && interval > 0) intervals.push(interval);
	}
	return TARGET_MEDIAN_INTERVAL_SECONDS / Math.max(1e-12, median(intervals));
}

function midiToFrequency(midi: number, cents: number): number {
	return 440 * 2 ** ((midi - 69 + cents / 100) / 12);
}

function pitchFor(
	patch: SoundWorldPatch,
	features: FeatureStreamData,
	index: number,
	type: SonicEventType
): number {
	const region = features.region[index];
	const height = features.position01[index * 3 + 2];
	const degreeOffset =
		type === 'recurrence' ? 0 : type === 'fold' ? 1 : type === 'cell-boundary' ? 2 : 0;
	const degree = (region + degreeOffset) % patch.scaleSemitones.length;
	const voicing = patch.voicing[region % patch.voicing.length];
	const octave = Math.min(2, Math.floor(height * 3)) * 12;
	const microtuningCents = (features.noiseValue01[index] - 0.5) * 8;
	return midiToFrequency(
		patch.baseMidi + patch.scaleSemitones[degree] + voicing + octave,
		microtuningCents
	);
}

function candidateTimes(
	candidates: readonly EventCandidate[],
	features: FeatureStreamData,
	snapshot: OrchestraSnapshot
): number[] {
	if (candidates.length === 0) return [];
	const firstSimulationTime = features.simulationTimes[candidates[0].index];
	const scale = calculateTimeScale(candidates, features) / snapshot.simulationRate;
	const rawTimes = candidates.map(
		(candidate) => (features.simulationTimes[candidate.index] - firstSimulationTime) * scale
	);
	if (snapshot.timingMode === 'raw') return rawTimes;
	const composed: number[] = [];
	for (let index = 0; index < rawTimes.length; index += 1) {
		const nearest =
			Math.round(rawTimes[index] / COMPOSED_SUBDIVISION_SECONDS) * COMPOSED_SUBDIVISION_SECONDS;
		const bounded = clamp(
			nearest,
			rawTimes[index] - COMPOSED_SUBDIVISION_SECONDS / 2,
			rawTimes[index] + COMPOSED_SUBDIVISION_SECONDS / 2
		);
		composed.push(
			index === 0 ? Math.max(0, bounded) : Math.max(composed[index - 1] + 0.001, bounded)
		);
	}
	return composed;
}

export interface BuildScoreOptions {
	readonly durationSeconds?: number;
	readonly mobile?: boolean;
	readonly onProgress?: (progress: GenerationProgress) => void;
}

export function buildScore(
	snapshot: OrchestraSnapshot,
	features: FeatureStreamData,
	options: BuildScoreOptions = {}
): SonicEvent[] {
	validateFeatures(features);
	if (snapshot.mappingVersion !== ORCHESTRA_MAPPING_VERSION) {
		throw new RangeError(`Unsupported score mapping version: ${snapshot.mappingVersion}`);
	}
	if (!Number.isFinite(snapshot.simulationRate) || snapshot.simulationRate <= 0) {
		throw new RangeError('Simulation rate must be finite and positive.');
	}
	const duration = options.durationSeconds ?? Number.POSITIVE_INFINITY;
	if (!(duration > 0)) throw new RangeError('Score duration must be positive.');
	const patch = getSoundWorldPatch(snapshot.soundWorld);
	const candidates = collectCandidates(features);
	const times = candidateTimes(candidates, features, snapshot);
	const rawTimes = candidateTimes(candidates, features, { ...snapshot, timingMode: 'raw' });
	// Sound worlds consume one structural event stream. Patch-specific ceilings are enforced
	// by voice allocation; structural thinning remains independent of orchestration.
	const densityCeiling = Math.min(GLOBAL_EVENT_DENSITY_CEILING, options.mobile ? 6 : 10);
	const minimumSpacing = 1 / densityCeiling;
	const events: SonicEvent[] = [];
	let lastAcceptedRawTime = Number.NEGATIVE_INFINITY;
	for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
		const candidate = candidates[candidateIndex];
		const time = times[candidateIndex];
		if (time > duration) break;
		if (rawTimes[candidateIndex] - lastAcceptedRawTime < minimumSpacing) continue;
		const index = candidate.index;
		const velocity01 = clamp(
			0.12 +
				features.speed01[index] * 0.42 +
				features.curvature01[index] * 0.2 +
				features.noiseGradient01[index] * 0.12,
			0.08,
			0.86
		);
		const event: SonicEvent = Object.freeze({
			id: `${ORCHESTRA_MAPPING_VERSION}:${snapshot.attractorId}:${features.simulationSteps[index]}:${candidate.type}`,
			simulationStep: features.simulationSteps[index],
			simulationTime: features.simulationTimes[index],
			time,
			type: candidate.type,
			pitchHz: pitchFor(patch, features, index, candidate.type),
			velocity01,
			duration: clamp(
				0.08 + features.returnInterval01[index] * 1.25 + features.density01[index] * 0.45,
				0.08,
				patch.envelope.maximum
			),
			pan: clamp((features.noiseCurlAngle01[index] - 0.5) * 1.3, -0.65, 0.65),
			height: clamp(features.position01[index * 3 + 2], 0, 1),
			curvature: clamp(features.curvature01[index], 0, 1),
			stretching: clamp(features.stretching01[index], 0, 1),
			recurrence: clamp(features.recurrence01[index], 0, 1),
			density: clamp(features.density01[index], 0, 1),
			noise: clamp(features.noiseValue01[index], 0, 1),
			region: features.region[index],
			sourceFeature: candidate.sourceFeature,
			explanation: candidate.explanation
		});
		events.push(event);
		lastAcceptedRawTime = rawTimes[candidateIndex];
		if (events.length % 128 === 0 || candidateIndex + 1 === candidates.length) {
			options.onProgress?.({
				phase: 'score',
				completed: candidateIndex + 1,
				total: candidates.length,
				progress01: (candidateIndex + 1) / Math.max(1, candidates.length)
			});
		}
	}
	return events;
}

function quantizedEventText(event: SonicEvent): string {
	const fixed = (value: number, digits: number): string => value.toFixed(digits);
	return [
		event.id,
		event.simulationStep,
		fixed(event.simulationTime, 9),
		fixed(event.time, 6),
		event.type,
		event.pitchHz === undefined ? '' : fixed(event.pitchHz, 5),
		fixed(event.velocity01, 6),
		fixed(event.duration, 6),
		fixed(event.pan, 6),
		fixed(event.height, 6),
		fixed(event.curvature, 6),
		fixed(event.stretching, 6),
		fixed(event.recurrence, 6),
		fixed(event.density, 6),
		fixed(event.noise, 6),
		event.region,
		event.sourceFeature
	].join('|');
}

export function stableScoreHash(events: readonly SonicEvent[]): string {
	let hash = 0x811c9dc5;
	for (const event of events) {
		hash = hashSeed(`${hash.toString(16)}:${quantizedEventText(event)}`);
	}
	return hash.toString(16).padStart(8, '0');
}
