import { describe, expect, it } from 'vitest';
import {
	buildBiasLayout,
	buildBiasNeighbourhoods,
	createBiasEmbedding,
	createGaussianTerrain,
	embeddingStress,
	TERRAIN_HEIGHT_MEANING
} from './bias-terrain';
import type { Bias } from './bias-types';

function fixture(id: string, group: string): Bias {
	return {
		id,
		name: id,
		aliases: [],
		definition: `Definition for ${id}.`,
		example: `Example for ${id}.`,
		mechanisms: [`${group}-mechanism`, 'finite-attention'],
		tasks: [`${group}-task`],
		triggers: [`${group}-trigger`],
		targets: [`${group}-target`],
		manifestations: [`${group}-manifestation`],
		temporalStage: [`${group}-stage`],
		scale: ['individual'],
		conditions: ['uncertainty'],
		lineages: [{ tradition: `${group}-lineage`, weight: 1 }],
		evidenceNote: 'Fixture evidence note.',
		evidenceStatus: 'well-established',
		canonicalSources: [`https://example.org/${id}`],
		family: `${group}-family`
	};
}

const BIASES = [
	fixture('prior-a', 'prior'),
	fixture('prior-b', 'prior'),
	fixture('memory-a', 'memory'),
	fixture('memory-b', 'memory'),
	fixture('social-a', 'social'),
	fixture('social-b', 'social'),
	fixture('loss-a', 'loss'),
	fixture('loss-b', 'loss')
];

describe('Bias Archipelago deterministic embedding', () => {
	it('is deterministic, input-order independent, bounded, and lowers weighted stress', () => {
		const initial = createBiasEmbedding(BIASES, { seed: 'fixture-map', iterations: 0 });
		const first = createBiasEmbedding(BIASES, { seed: 'fixture-map', iterations: 320 });
		const second = createBiasEmbedding([...BIASES].reverse(), {
			seed: 'fixture-map',
			iterations: 320
		});

		expect(first).toEqual(second);
		expect(embeddingStress(BIASES, first)).toBeLessThan(embeddingStress(BIASES, initial));
		for (const point of Object.values(first)) {
			expect(point.x).toBeGreaterThanOrEqual(0.06);
			expect(point.x).toBeLessThanOrEqual(0.94);
			expect(point.y).toBeGreaterThanOrEqual(0.06);
			expect(point.y).toBeLessThanOrEqual(0.94);
		}
	});

	it('keeps manual pins exact and ignores changes to research lineage', () => {
		const pins = { 'prior-a': { x: 0.21, y: 0.73 } } as const;
		const baseline = createBiasEmbedding(BIASES, { seed: 'pinned', iterations: 240, pins });
		const changedLineages = BIASES.map((bias) => ({
			...bias,
			lineages: [{ tradition: `unrelated-${bias.id}`, weight: 1 }]
		}));

		expect(baseline['prior-a']).toEqual(pins['prior-a']);
		expect(createBiasEmbedding(changedLineages, { seed: 'pinned', iterations: 240, pins })).toEqual(
			baseline
		);
	});

	it('precomputes stable, similarity-ranked neighbourhoods', () => {
		const neighbours = buildBiasNeighbourhoods(BIASES, 3);
		expect(neighbours['prior-a'][0]).toEqual({ id: 'prior-b', similarity: 1 });
		expect(neighbours['prior-a']).toHaveLength(3);
		for (const list of Object.values(neighbours)) {
			for (let index = 1; index < list.length; index += 1) {
				expect(list[index - 1].similarity).toBeGreaterThanOrEqual(list[index].similarity);
			}
		}
	});
});

describe('Bias Archipelago Gaussian terrain', () => {
	it('sums equal Gaussian peaks into a finite deterministic density grid', () => {
		const points = [
			{ x: 0.49, y: 0.5 },
			{ x: 0.51, y: 0.5 },
			{ x: 0.5, y: 0.52 }
		];
		const first = createGaussianTerrain(points, { width: 31, height: 21, sigma: 0.08 });
		const second = createGaussianTerrain(points, { width: 31, height: 21, sigma: 0.08 });
		const centre = first.values[10 * first.width + 15];
		const corner = first.values[0];

		expect(first).toEqual(second);
		expect(first.values).toHaveLength(31 * 21);
		expect(first.values.every(Number.isFinite)).toBe(true);
		expect(centre).toBeGreaterThan(corner);
		expect(first.max).toBeGreaterThan(1);
		expect(first.meaning).toBe(TERRAIN_HEIGHT_MEANING);
	});

	it('assembles committed-layout data with points, labels, neighbours, and terrain', () => {
		const options = {
			seed: 'complete-layout',
			iterations: 180,
			pins: { 'prior-a': { x: 0.2, y: 0.2 } },
			width: 24,
			height: 18,
			familyLabels: { 'prior-family': 'Prior preservation' },
			formationForFamily: {
				'prior-family': 'prior-formation',
				'memory-family': 'memory-formation',
				'social-family': 'social-formation',
				'loss-family': 'loss-formation'
			},
			formationLabels: { 'prior-formation': 'Prior-belief preservation' }
		} as const;
		const layout = buildBiasLayout(BIASES, options);

		expect(layout).toEqual(buildBiasLayout([...BIASES].reverse(), options));
		expect(layout.points).toHaveLength(BIASES.length);
		expect(layout.points.find((point) => point.id === 'prior-a')).toMatchObject({
			x: 0.2,
			y: 0.2,
			family: 'prior-family',
			labelPriority: 0
		});
		expect(layout.points.every((point) => point.elevation >= 0 && point.elevation <= 1)).toBe(true);
		expect(new Set(layout.points.map((point) => point.labelPriority))).toEqual(new Set([0, 1, 2]));
		expect(layout.families.find((label) => label.id === 'prior-family')?.label).toBe(
			'Prior preservation'
		);
		expect(layout.formations.find((label) => label.id === 'prior-formation')?.label).toBe(
			'Prior-belief preservation'
		);
		expect(layout.terrain.values).toHaveLength(24 * 18);
		expect(layout.algorithm.name).toBe('weighted-jaccard-stress-v2');
		expect(layout.algorithm.pinnedIds).toEqual(['prior-a']);
	});
});
