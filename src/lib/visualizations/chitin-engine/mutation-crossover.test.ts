import { describe, expect, it } from 'vitest';
import { buildBodyGraph, validateBodyGraph } from './body-grammar';
import { crossoverGenomes } from './crossover';
import { GENOME_GROUP_FIELDS, GENOME_GROUPS } from './genome-groups';
import { DEFAULT_GENOME, normalizeGenome } from './genome';
import { DEFAULT_MUTATION_LOCKS, mutateGenome } from './mutation';
import { genomeForPreset } from './presets';
import type { GenomeGroup, MutationLocks } from './types';

function locks(overrides: Partial<MutationLocks>): MutationLocks {
	return Object.freeze({ ...DEFAULT_MUTATION_LOCKS, ...overrides });
}

describe('Chitin Engine deterministic mutation', () => {
	it('assigns every mutable genome field to exactly one coherent block', () => {
		const grouped = GENOME_GROUPS.flatMap((group) => [...GENOME_GROUP_FIELDS[group]]);
		const expected = Object.keys(DEFAULT_GENOME).filter(
			(key) => !['schemaVersion', 'seed', 'preset'].includes(key)
		);
		expect(new Set(grouped).size).toBe(grouped.length);
		expect([...grouped].sort()).toEqual(expected.sort());
	});

	it('replays exactly and derives independent children from the mutation index', () => {
		const first = mutateGenome(DEFAULT_GENOME, 7, 0.42);
		const replay = mutateGenome(DEFAULT_GENOME, 7, 0.42);
		const sibling = mutateGenome(DEFAULT_GENOME, 8, 0.42);
		expect(replay).toEqual(first);
		expect(sibling.genome.seed).not.toBe(first.genome.seed);
		expect(first.index).toBe(7);
		expect(first.changedGroups.length).toBeGreaterThan(0);
	});

	it('keeps child identities distinct even when the parent seed fills its size limit', () => {
		const parent = normalizeGenome({ ...DEFAULT_GENOME, seed: 'a'.repeat(64) });
		expect(mutateGenome(parent, 11, 0.4).genome.seed).not.toBe(
			mutateGenome(parent, 12, 0.4).genome.seed
		);
	});

	it('preserves locked blocks and treats zero radius as identity', () => {
		const parent = normalizeGenome(DEFAULT_GENOME);
		const result = mutateGenome(parent, 3, 1, locks({ body: true, limbs: true, senses: true }));
		for (const group of ['body', 'limbs', 'senses'] as const) {
			for (const key of GENOME_GROUP_FIELDS[group]) expect(result.genome[key]).toBe(parent[key]);
		}
		expect(result.changedGroups).not.toContain('body');
		expect(result.changedGroups).not.toContain('limbs');
		expect(result.changedGroups).not.toContain('senses');
		expect(mutateGenome(parent, 9, 0).genome).toEqual(parent);
		expect(mutateGenome(parent, 9, 0).changedGroups).toEqual([]);
	});

	it('keeps high-radius children structurally valid', () => {
		for (let index = 0; index < 8; index += 1) {
			const child = mutateGenome(DEFAULT_GENOME, index, 1).genome;
			const graph = buildBodyGraph(child);
			expect(validateBodyGraph(graph, child).valid).toBe(true);
		}
	});

	it('can restore eyes atomically after an eyeless lineage', () => {
		const eyeless = genomeForPreset('methane-lantern-crawler');
		const child = mutateGenome(eyeless, 4, 1, locks({ body: true })).genome;
		expect(child.eyeCount).toBeGreaterThan(0);
		expect(child.eyeLayout).not.toBe('none');
	});

	it('leaves every group untouched when all locks are active', () => {
		const allLocked = Object.fromEntries(GENOME_GROUPS.map((group) => [group, true])) as Record<
			GenomeGroup,
			boolean
		>;
		const result = mutateGenome(DEFAULT_GENOME, 4, 1, allLocked);
		expect(result.genome).toEqual(normalizeGenome(DEFAULT_GENOME));
		expect(result.changedGroups).toEqual([]);
	});
});

describe('Chitin Engine deterministic block crossover', () => {
	it('replays whole-group inheritance for the same parent pair and child index', () => {
		const parentA = genomeForPreset('basalt-widow');
		const parentB = genomeForPreset('reactor-mantis');
		const options = {
			groupSources: {
				body: 'a',
				armour: 'b',
				limbs: 'a',
				senses: 'b',
				ornaments: 'b',
				surface: 'b',
				motion: 'a',
				color: 'b',
				world: 'a'
			} as const
		};
		const first = crossoverGenomes(parentA, parentB, 5, options);
		const replay = crossoverGenomes(parentA, parentB, 5, options);
		expect(replay).toEqual(first);
		expect(first.genome.bodyPlan).toBe(parentA.bodyPlan);
		expect(first.genome.material).toBe(parentB.material);
		expect(first.genome.gait).toBe(parentA.gait);
	});

	it('repairs incompatible modules after block inheritance', () => {
		const arachnid = genomeForPreset('basalt-widow');
		const insect = genomeForPreset('reactor-mantis');
		const child = crossoverGenomes(arachnid, insect, 1, {
			groupSources: { body: 'a', limbs: 'a', senses: 'b', ornaments: 'b' }
		});
		expect(child.genome.bodyPlan).toBe('terrestrial-arachnid');
		expect(child.genome.walkingLegPairs).toBe(4);
		expect(child.genome.antennaCount).toBe(0);
		expect(child.genome.wingMode).toBe('none');
		expect(child.repairs.length).toBeGreaterThan(0);
		expect(validateBodyGraph(buildBodyGraph(child.genome), child.genome).valid).toBe(true);
	});

	it('includes both complete long-seed parents in child identity', () => {
		const parentA = normalizeGenome({ ...DEFAULT_GENOME, seed: 'a'.repeat(64) });
		const parentB = normalizeGenome({ ...DEFAULT_GENOME, seed: 'b'.repeat(64) });
		const alternateB = normalizeGenome({ ...DEFAULT_GENOME, seed: 'c'.repeat(64) });
		expect(crossoverGenomes(parentA, parentB, 2).genome.seed).not.toBe(
			crossoverGenomes(parentA, alternateB, 2).genome.seed
		);
	});
});
