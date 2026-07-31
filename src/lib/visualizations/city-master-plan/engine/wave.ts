import { SeededRandom } from '../../../utils/seeded-random';
import { BitSet } from './bitset';
import {
	buildCompatibilityMasks,
	unionCompatibleMasks,
	type DirectionalCompatibility
} from './compatibility';
import {
	coordinateForIndex,
	DIRECTION_NAMES,
	neighbourIndex,
	oppositeDirection
} from './directions';
import { weightedCandidateChoice, weightedShannonEntropy } from './entropy';
import { hashUnit } from './hash';
import {
	municipalMessage,
	synthesizeMunicipalPatch,
	type MunicipalPatchInput
} from './municipalPatch';
import type {
	Direction,
	EdgeSignature,
	GenerationEvent,
	MunicipalPatch,
	TileVariant
} from './types';

export interface PropagationResult {
	contradictionIndex: number;
	changedIndices: readonly number[];
	forcedIndices: readonly number[];
	removedCandidates: number;
	processedCells: number;
}

export interface WaveCollapseOptions {
	width: number;
	height: number;
	pass: 'fabric' | 'occupation';
	variants: readonly TileVariant[];
	initialWave?: readonly BitSet[];
	random: SeededRandom;
	tieBreakerSeed: string;
	maxBacktracks: number;
	hardStepBudget: number;
	existingPatches?: readonly MunicipalPatch[];
	conflictTags?: (cellIndex: number, wave: readonly BitSet[]) => readonly string[];
	emit?: (event: GenerationEvent) => void;
}

export interface WaveCollapseResult {
	variantIndices: Int32Array;
	wave: readonly BitSet[];
	patched: Uint8Array;
	patches: readonly MunicipalPatch[];
	events: readonly GenerationEvent[];
	steps: number;
	backtracks: number;
	contradictions: number;
	propagatedCells: number;
	removedCandidates: number;
	terminatedByBudget: boolean;
}

interface DecisionSnapshot {
	wave: BitSet[];
	patched: Uint8Array;
	patchCount: number;
	cellIndex: number;
	chosenVariant: number;
	rngStateAfterChoice: number;
}

export function createInitialWave(cellCount: number, variantCount: number): BitSet[] {
	return Array.from({ length: cellCount }, () => BitSet.full(variantCount));
}

export function constrainCell(wave: BitSet[], cellIndex: number, allowed: BitSet): boolean {
	if (cellIndex < 0 || cellIndex >= wave.length) {
		throw new RangeError(`Wave cell ${cellIndex} is outside the grid.`);
	}
	return wave[cellIndex].intersect(allowed);
}

export function propagateWave(
	wave: BitSet[],
	initialQueue: readonly number[],
	width: number,
	height: number,
	compatibility: DirectionalCompatibility,
	patched = new Uint8Array(wave.length)
): PropagationResult {
	const queued = new Uint8Array(wave.length);
	const queue: number[] = [];
	for (const index of initialQueue) {
		if (index < 0 || index >= wave.length || queued[index] !== 0) continue;
		queue.push(index);
		queued[index] = 1;
	}
	const changed = new Set<number>();
	const forced = new Set<number>();
	let removedCandidates = 0;
	let processedCells = 0;

	for (let cursor = 0; cursor < queue.length; cursor += 1) {
		const current = queue[cursor];
		queued[current] = 0;
		processedCells += 1;
		if (patched[current] !== 0) continue;
		if (wave[current].isEmpty()) {
			return {
				contradictionIndex: current,
				changedIndices: [...changed],
				forcedIndices: [...forced],
				removedCandidates,
				processedCells
			};
		}

		for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
			const direction = rawDirection as Direction;
			const neighbour = neighbourIndex(current, direction, width, height);
			if (neighbour < 0 || patched[neighbour] !== 0) continue;
			const before = wave[neighbour].count();
			const allowed = unionCompatibleMasks(wave[current], direction, compatibility);
			if (!wave[neighbour].intersect(allowed)) continue;
			const after = wave[neighbour].count();
			removedCandidates += before - after;
			changed.add(neighbour);
			if (before > 1 && after === 1) forced.add(neighbour);
			if (after === 0) {
				return {
					contradictionIndex: neighbour,
					changedIndices: [...changed],
					forcedIndices: [...forced],
					removedCandidates,
					processedCells
				};
			}
			if (queued[neighbour] === 0) {
				queue.push(neighbour);
				queued[neighbour] = 1;
			}
		}
	}
	return {
		contradictionIndex: -1,
		changedIndices: [...changed],
		forcedIndices: [...forced],
		removedCandidates,
		processedCells
	};
}

export function runWaveCollapse(options: WaveCollapseOptions): WaveCollapseResult {
	const { width, height, pass, variants, random, tieBreakerSeed, maxBacktracks, hardStepBudget } =
		options;
	const cellCount = width * height;
	if (variants.length === 0) throw new Error(`The ${pass} catalogue is empty.`);
	const wave = options.initialWave
		? options.initialWave.map((candidates) => candidates.clone())
		: createInitialWave(cellCount, variants.length);
	if (wave.length !== cellCount) {
		throw new RangeError(`Expected ${cellCount} wave cells, received ${wave.length}.`);
	}
	const compatibility = buildCompatibilityMasks(variants);
	let patched = new Uint8Array(cellCount);
	const patches = [...(options.existingPatches ?? [])];
	const generatedPatches: MunicipalPatch[] = [];
	const events: GenerationEvent[] = [];
	const decisionStack: DecisionSnapshot[] = [];
	const maximumSnapshots = Math.max(1, maxBacktracks + 1);
	let steps = 0;
	let backtracks = 0;
	let contradictions = 0;
	let propagatedCells = 0;
	let removedCandidates = 0;
	let terminatedByBudget = false;

	const emit = (event: GenerationEvent) => {
		events.push(event);
		options.emit?.(event);
	};
	const progress = () => collapsedRatio(wave, patched);

	let propagation = propagateWave(
		wave,
		wave.map((_, index) => index),
		width,
		height,
		compatibility,
		patched
	);
	propagatedCells += propagation.processedCells;
	removedCandidates += propagation.removedCandidates;
	let contradictionIndex = propagation.contradictionIndex;

	while (true) {
		if (steps >= hardStepBudget) {
			terminatedByBudget = true;
			patchAllUnresolved();
			break;
		}

		if (contradictionIndex >= 0) {
			contradictions += 1;
			emit({
				type: 'contradiction',
				pass,
				step: steps,
				cell: coordinateForIndex(contradictionIndex, width),
				message: 'No ordinary tile satisfies the neighbouring edge demands.',
				progress: progress()
			});

			const restored = tryBacktrack();
			if (restored) {
				contradictionIndex = restored.contradictionIndex;
				continue;
			}
			const patchIndex =
				contradictionIndex >= 0 ? contradictionIndex : firstEmptyCell(wave, patched);
			if (patchIndex >= 0) applyPatch(patchIndex);
			contradictionIndex = -1;
			continue;
		}

		const observation = selectObservationCell(wave, patched, variants, tieBreakerSeed, steps);
		if (observation.index < 0) break;
		if (observation.entropy === Number.NEGATIVE_INFINITY) {
			contradictionIndex = observation.index;
			continue;
		}

		const before = wave[observation.index].clone();
		const chosen = weightedCandidateChoice(before, variants, random.next());
		const stateAfterChoice = random.getState();
		if (maxBacktracks > 0) {
			decisionStack.push({
				wave: cloneWave(wave),
				patched: new Uint8Array(patched),
				patchCount: generatedPatches.length,
				cellIndex: observation.index,
				chosenVariant: chosen,
				rngStateAfterChoice: stateAfterChoice
			});
			if (decisionStack.length > maximumSnapshots) decisionStack.shift();
		}
		wave[observation.index].clear();
		wave[observation.index].add(chosen);
		steps += 1;
		const observationTrace = compactObservationTrace(
			observation.index,
			before,
			wave,
			patched,
			variants,
			compatibility,
			width,
			height
		);
		emit({
			type: 'observe',
			pass,
			step: steps,
			cell: coordinateForIndex(observation.index, width),
			entropy: observation.entropy,
			candidateCount: before.count(),
			chosenVariantId: variants[chosen].id,
			chosenWeight: variants[chosen].weight * before.observationWeightScale(chosen),
			candidateFamilies: observationTrace.candidateFamilies,
			exclusionReasons: observationTrace.exclusionReasons,
			progress: progress()
		});
		propagation = propagateWave(wave, [observation.index], width, height, compatibility, patched);
		propagatedCells += propagation.processedCells;
		removedCandidates += propagation.removedCandidates;
		if (propagation.changedIndices.length > 0) {
			emit({
				type: 'propagate',
				pass,
				step: steps,
				changedCells: propagation.changedIndices.map((index) => coordinateForIndex(index, width)),
				forcedCells: propagation.forcedIndices.map((index) => coordinateForIndex(index, width)),
				removedCandidates: propagation.removedCandidates,
				progress: progress()
			});
		}
		contradictionIndex = propagation.contradictionIndex;
	}

	auditFinalResolution();

	const variantIndices = new Int32Array(cellCount);
	for (let index = 0; index < cellCount; index += 1) {
		const singleton = wave[index].singletonIndex();
		variantIndices[index] = singleton >= 0 ? singleton : bestFallbackVariant(index);
	}
	return {
		variantIndices,
		wave,
		patched,
		patches: generatedPatches,
		events,
		steps,
		backtracks,
		contradictions,
		propagatedCells,
		removedCandidates,
		terminatedByBudget
	};

	function tryBacktrack(): PropagationResult | null {
		while (backtracks < maxBacktracks && decisionStack.length > 0) {
			const decision = decisionStack.pop()!;
			for (let index = 0; index < wave.length; index += 1) {
				wave[index] = decision.wave[index].clone();
			}
			patched = new Uint8Array(decision.patched);
			generatedPatches.splice(decision.patchCount);
			random.setState(decision.rngStateAfterChoice);
			const removedId = variants[decision.chosenVariant].id;
			wave[decision.cellIndex].remove(decision.chosenVariant);
			backtracks += 1;
			steps += 1;
			emit({
				type: 'backtrack',
				pass,
				step: steps,
				cell: coordinateForIndex(decision.cellIndex, width),
				removedVariantId: removedId,
				remainingCandidates: wave[decision.cellIndex].count(),
				message: 'The first application was returned for correction.',
				progress: progress()
			});
			if (wave[decision.cellIndex].isEmpty()) continue;
			const result = propagateWave(
				wave,
				[decision.cellIndex],
				width,
				height,
				compatibility,
				patched
			);
			propagatedCells += result.processedCells;
			removedCandidates += result.removedCandidates;
			return result;
		}
		return null;
	}

	function applyPatch(cellIndex: number): void {
		const patchInput: MunicipalPatchInput = {
			seed: tieBreakerSeed,
			cell: coordinateForIndex(cellIndex, width),
			pass,
			demandedEdges: demandedEdgesForCell(cellIndex, wave, patched, width, height, variants),
			conflictTags: options.conflictTags?.(cellIndex, wave),
			previousPatches: patches.concat(generatedPatches)
		};
		const patch = synthesizeMunicipalPatch(patchInput);
		generatedPatches.push(patch);
		patched[cellIndex] = 1;
		const fallback = bestFallbackVariant(cellIndex);
		wave[cellIndex].clear();
		wave[cellIndex].add(fallback);
		decisionStack.length = 0;
		steps += 1;
		emit({
			type: 'patch',
			pass,
			step: steps,
			patch,
			message: municipalMessage(patch),
			progress: progress()
		});
	}

	function patchAllUnresolved(): void {
		for (let index = 0; index < cellCount; index += 1) {
			if (patched[index] !== 0 || wave[index].isSingleton()) continue;
			applyPatch(index);
		}
	}

	/**
	 * A propagation can stop as soon as it discovers a zero-candidate neighbour. Repairing that
	 * neighbour exempts it from the ordinary socket rules, but cells later in the abandoned queue
	 * have not necessarily seen the choice that caused the contradiction. Audit the final, small
	 * grid once so every remaining disagreement becomes an explicit municipal patch rather than an
	 * unrecorded invalid adjacency.
	 */
	function auditFinalResolution(): void {
		for (let index = 0; index < cellCount; index += 1) {
			if (patched[index] !== 0 || wave[index].isSingleton()) continue;
			recordResidualContradiction(index, 'An unresolved cell remained after collapse.');
			applyPatch(index);
		}

		for (let index = 0; index < cellCount; index += 1) {
			if (patched[index] !== 0) continue;
			const variant = wave[index].singletonIndex();
			for (const direction of [1, 2] as const) {
				const neighbour = neighbourIndex(index, direction, width, height);
				if (neighbour < 0 || patched[neighbour] !== 0) continue;
				const neighbourVariant = wave[neighbour].singletonIndex();
				if (
					variant >= 0 &&
					neighbourVariant >= 0 &&
					compatibility[direction][variant].has(neighbourVariant)
				) {
					continue;
				}
				recordResidualContradiction(
					neighbour,
					'A residual socket disagreement required retrospective permission.'
				);
				applyPatch(neighbour);
			}
		}

		refreshPatchExteriorEdges();
	}

	function recordResidualContradiction(cellIndex: number, message: string): void {
		contradictions += 1;
		emit({
			type: 'contradiction',
			pass,
			step: steps,
			cell: coordinateForIndex(cellIndex, width),
			message,
			progress: progress()
		});
	}

	function refreshPatchExteriorEdges(): void {
		for (const patch of generatedPatches) {
			const cellIndex = patch.cell.y * width + patch.cell.x;
			const demanded = demandedEdgesForCell(cellIndex, wave, patched, width, height, variants);
			patch.demandedEdges = demanded.map((edge) => ({ ...edge }));
			patch.selectedEdges = demanded.map((edge) => ({
				...edge,
				// A repair is an adapter, not a second occupied frontage.
				face: 'neutral'
			}));
		}
	}

	function bestFallbackVariant(cellIndex: number): number {
		let bestIndex = 0;
		let bestScore = Number.NEGATIVE_INFINITY;
		for (const variant of variants) {
			let score = Math.log(Math.max(Number.EPSILON, variant.weight));
			for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
				const direction = rawDirection as Direction;
				const neighbour = neighbourIndex(cellIndex, direction, width, height);
				if (neighbour < 0 || patched[neighbour] !== 0) continue;
				const reciprocal = oppositeDirection(direction);
				for (const neighbourVariant of wave[neighbour].values()) {
					const neighbourEdge = variants[neighbourVariant].edges[reciprocal];
					const ownEdge = variant.edges[direction];
					if (
						ownEdge.passage === neighbourEdge.passage &&
						(ownEdge.water === neighbourEdge.water ||
							ownEdge.water === 'bank' ||
							neighbourEdge.water === 'bank')
					) {
						score += 2;
						break;
					}
				}
			}
			if (score > bestScore) {
				bestScore = score;
				bestIndex = variant.index;
			}
		}
		return bestIndex;
	}
}

function compactObservationTrace(
	cellIndex: number,
	candidates: BitSet,
	wave: readonly BitSet[],
	patched: Uint8Array,
	variants: readonly TileVariant[],
	compatibility: DirectionalCompatibility,
	width: number,
	height: number
): { candidateFamilies: readonly string[]; exclusionReasons: readonly string[] } {
	const allCandidateFamilies = [
		...new Set([...candidates.values()].map((index) => variants[index].prototypeId))
	];
	const candidateFamilies = allCandidateFamilies.slice(0, 8);
	const present = new Set(allCandidateFamilies);
	const byFamily = new Map<string, TileVariant[]>();
	for (const variant of variants) {
		const family = byFamily.get(variant.prototypeId) ?? [];
		family.push(variant);
		byFamily.set(variant.prototypeId, family);
	}

	const absentFamilies = [...byFamily.entries()]
		.filter(([family]) => !present.has(family))
		.sort(
			([firstName, first], [secondName, second]) =>
				Math.max(...second.map((variant) => variant.weight)) -
					Math.max(...first.map((variant) => variant.weight)) || firstName.localeCompare(secondName)
		);
	const exclusionReasons: string[] = [];
	for (const [family, familyVariants] of absentFamilies) {
		for (let rawDirection = 0; rawDirection < 4; rawDirection += 1) {
			const direction = rawDirection as Direction;
			const neighbour = neighbourIndex(cellIndex, direction, width, height);
			if (neighbour < 0 || patched[neighbour] !== 0 || wave[neighbour].isEmpty()) continue;
			const canMeetNeighbour = familyVariants.some((variant) => {
				const allowed = compatibility[direction][variant.index];
				for (const neighbourVariant of wave[neighbour].values()) {
					if (allowed.has(neighbourVariant)) return true;
				}
				return false;
			});
			if (canMeetNeighbour) continue;
			const neighbourFamilies = [
				...new Set([...wave[neighbour].values()].map((index) => variants[index].prototypeId))
			]
				.slice(0, 2)
				.join(' or ');
			exclusionReasons.push(
				`${family} lost every rotation because its ${DIRECTION_NAMES[direction]} edge cannot meet the neighbouring ${neighbourFamilies || 'remaining tile'} family.`
			);
			break;
		}
		if (exclusionReasons.length >= 3) break;
	}
	return { candidateFamilies, exclusionReasons };
}

export function selectObservationCell(
	wave: readonly BitSet[],
	patched: Uint8Array,
	variants: readonly TileVariant[],
	tieBreakerSeed: string,
	step: number
): { index: number; entropy: number } {
	let bestIndex = -1;
	let bestEntropy = Number.POSITIVE_INFINITY;
	for (let index = 0; index < wave.length; index += 1) {
		if (patched[index] !== 0 || wave[index].isSingleton()) continue;
		if (wave[index].isEmpty()) return { index, entropy: Number.NEGATIVE_INFINITY };
		const entropy =
			weightedShannonEntropy(wave[index], variants) + hashUnit(tieBreakerSeed, step, index) * 1e-9;
		if (entropy < bestEntropy) {
			bestEntropy = entropy;
			bestIndex = index;
		}
	}
	return { index: bestIndex, entropy: bestEntropy };
}

export function demandedEdgesForCell(
	cellIndex: number,
	wave: readonly BitSet[],
	patched: Uint8Array,
	width: number,
	height: number,
	variants: readonly TileVariant[]
): readonly EdgeSignature[] {
	return Array.from({ length: 4 }, (_, rawDirection) => {
		const direction = rawDirection as Direction;
		const neighbour = neighbourIndex(cellIndex, direction, width, height);
		if (neighbour < 0 || patched[neighbour] !== 0) {
			return {
				passage: 'closed',
				water: 'dry',
				drain: 'none',
				face: 'neutral',
				clearance: 0
			} satisfies EdgeSignature;
		}
		const neighbourVariant = wave[neighbour].singletonIndex();
		if (neighbourVariant < 0) {
			const first = wave[neighbour].values().next().value as number | undefined;
			if (first === undefined) {
				return {
					passage: 'closed',
					water: 'dry',
					drain: 'none',
					face: 'neutral',
					clearance: 0
				} satisfies EdgeSignature;
			}
			return { ...variants[first].edges[oppositeDirection(direction)] };
		}
		return { ...variants[neighbourVariant].edges[oppositeDirection(direction)] };
	});
}

function cloneWave(wave: readonly BitSet[]): BitSet[] {
	return wave.map((candidates) => candidates.clone());
}

function firstEmptyCell(wave: readonly BitSet[], patched: Uint8Array): number {
	for (let index = 0; index < wave.length; index += 1) {
		if (patched[index] === 0 && wave[index].isEmpty()) return index;
	}
	return -1;
}

function collapsedRatio(wave: readonly BitSet[], patched: Uint8Array): number {
	let collapsed = 0;
	for (let index = 0; index < wave.length; index += 1) {
		if (patched[index] !== 0 || wave[index].isSingleton()) collapsed += 1;
	}
	return collapsed / Math.max(1, wave.length);
}
