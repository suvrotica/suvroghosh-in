import { GENOME_GROUPS, copyGenomeGroup, type MutableGenome } from './genome-groups';
import { normalizeGenome, validateGenome } from './genome';
import { createNamedStream, deterministicId, hashString32, normalizeSeed } from './seed';
import type { CreatureGenome, GenomeGroup, GenomeIssue } from './types';

export type CrossoverParent = 'a' | 'b';

export type CrossoverOptions = Readonly<{
	groupSources?: Readonly<Partial<Record<GenomeGroup, CrossoverParent>>>;
}>;

export type CrossoverResult = Readonly<{
	genome: CreatureGenome;
	index: number;
	sourceByGroup: Readonly<Record<GenomeGroup, CrossoverParent>>;
	repairs: readonly GenomeIssue[];
}>;

function normalizedIndex(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1_000_000_000, Math.max(0, Math.round(value)));
}

/** Applies the same compatibility rules used by imports and direct editing. */
export function repairCrossoverGenome(
	value: unknown,
	fallback: CreatureGenome
): Readonly<{ genome: CreatureGenome; repairs: readonly GenomeIssue[] }> {
	const validated = validateGenome(value, normalizeGenome(fallback));
	return Object.freeze({ genome: validated.genome, repairs: Object.freeze([...validated.issues]) });
}

/** Deterministic whole-block crossover; no scalar soup and no ambient entropy. */
export function crossoverGenomes(
	parentAInput: CreatureGenome,
	parentBInput: CreatureGenome,
	childIndex: number,
	options: CrossoverOptions = {}
): CrossoverResult {
	const parentA = normalizeGenome(parentAInput);
	const parentB = normalizeGenome(parentBInput);
	const index = normalizedIndex(childIndex);
	const pairSeed = [
		hashString32(parentA.seed),
		hashString32(parentB.seed),
		hashString32(JSON.stringify(parentA)),
		hashString32(JSON.stringify(parentB))
	].join(':');
	const namespace = `crossover:${index}`;
	const stream = createNamedStream(pairSeed, namespace);
	const sourceByGroup = {} as Record<GenomeGroup, CrossoverParent>;
	const mutable: MutableGenome = {
		...parentA,
		seed: normalizeSeed(`x${index}-${deterministicId(pairSeed, namespace)}-${parentA.seed}`),
		preset: 'unfiled-specimen'
	};

	for (const group of GENOME_GROUPS) {
		const forced = options.groupSources?.[group];
		const source: CrossoverParent =
			forced === 'a' || forced === 'b' ? forced : stream.boolean() ? 'a' : 'b';
		sourceByGroup[group] = source;
		copyGenomeGroup(mutable, source === 'a' ? parentA : parentB, group);
	}

	const repaired = repairCrossoverGenome(mutable, parentA);
	return Object.freeze({
		genome: repaired.genome,
		index,
		sourceByGroup: Object.freeze(sourceByGroup),
		repairs: repaired.repairs
	});
}

export const crossoverGenome = crossoverGenomes;
