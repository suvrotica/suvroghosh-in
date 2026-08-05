import { describe, expect, it } from 'vitest';
import {
	BIAS_SIMILARITY_WEIGHTS,
	biasSimilarity,
	biasSimilarityBreakdown,
	jaccardSimilarity,
	pairwiseBiasSimilarities
} from './bias-similarity';
import type { Bias } from './bias-types';

function fixture(id: string, suffix = id): Bias {
	return {
		id,
		name: id,
		aliases: [],
		definition: `Definition for ${id}.`,
		example: `Example for ${id}.`,
		mechanisms: [`mechanism-${suffix}`],
		tasks: [`task-${suffix}`],
		triggers: [`trigger-${suffix}`],
		targets: [`target-${suffix}`],
		manifestations: [`manifestation-${suffix}`],
		temporalStage: [`temporal-${suffix}`],
		scale: ['individual'],
		conditions: ['uncertainty'],
		lineages: [{ tradition: `lineage-${suffix}`, weight: 1 }],
		evidenceNote: 'Fixture evidence note.',
		evidenceStatus: 'well-established',
		canonicalSources: [`https://example.org/${id}`],
		family: 'fixture-family'
	};
}

describe('Bias Archipelago similarity', () => {
	it('uses symmetric Jaccard overlap without treating two empty fields as evidence', () => {
		expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 12);
		expect(jaccardSimilarity(['a', 'a'], ['a'])).toBe(1);
		expect(jaccardSimilarity([], [])).toBe(0);
		expect(jaccardSimilarity(['a'], ['b'])).toBe(0);
	});

	it('applies the six functional weights exactly', () => {
		const left = fixture('left', 'left');
		const fields: Array<
			['mechanisms' | 'tasks' | 'triggers' | 'manifestations' | 'targets' | 'temporalStage', number]
		> = [
			['mechanisms', 0.35],
			['tasks', 0.2],
			['triggers', 0.15],
			['manifestations', 0.15],
			['targets', 0.1],
			['temporalStage', 0.05]
		];

		for (const [field, expected] of fields) {
			const right = fixture(`right-${field}`, 'right');
			right[field] = [...left[field]];
			expect(biasSimilarity(left, right), field).toBe(expected);
		}
		expect(BIAS_SIMILARITY_WEIGHTS).toEqual({
			mechanisms: 0.35,
			tasks: 0.2,
			triggers: 0.15,
			manifestations: 0.15,
			targets: 0.1,
			temporalStage: 0.05
		});
	});

	it('keeps lineage completely outside geography', () => {
		const left = fixture('left', 'shared');
		const right = fixture('right', 'shared');
		right.lineages = [
			{ tradition: 'an-unrelated-discipline', weight: 0.7 },
			{ tradition: 'another-discipline', weight: 0.3, note: 'Deliberately different.' }
		];

		expect(biasSimilarity(left, right)).toBe(1);
		expect(biasSimilarityBreakdown(left, right)).not.toHaveProperty('lineages');

		const unrelated = fixture('unrelated', 'unrelated');
		unrelated.lineages = [...left.lineages];
		expect(biasSimilarity(left, unrelated)).toBe(0);
	});

	it('emits stable unordered pairs regardless of input order', () => {
		const biases = [fixture('charlie', 'a'), fixture('alpha', 'a'), fixture('bravo', 'b')];
		expect(pairwiseBiasSimilarities(biases)).toEqual(
			pairwiseBiasSimilarities([...biases].reverse())
		);
		expect(
			pairwiseBiasSimilarities(biases).map(({ source, target }) => `${source}:${target}`)
		).toEqual(['alpha:bravo', 'alpha:charlie', 'bravo:charlie']);
	});
});
