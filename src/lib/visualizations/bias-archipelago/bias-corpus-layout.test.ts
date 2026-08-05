import { describe, expect, it } from 'vitest';
import biasesData from '$lib/data/bias-archipelago/biases.json';
import layoutData from '$lib/data/bias-archipelago/layout.generated.json';
import { biasSimilarity } from './bias-similarity';
import { DEFAULT_REGION_PINS } from './bias-terrain';
import type { Bias, BiasLayout } from './bias-types';

const biases = biasesData as Bias[];
const layout = layoutData as BiasLayout;
const pointById = new Map(layout.points.map((point) => [point.id, point]));

function mean(values: readonly number[]) {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pearson(left: readonly number[], right: readonly number[]) {
	const leftMean = mean(left);
	const rightMean = mean(right);
	const covariance = mean(
		left.map((value, index) => (value - leftMean) * (right[index] - rightMean))
	);
	const leftVariance = mean(left.map((value) => (value - leftMean) ** 2));
	const rightVariance = mean(right.map((value) => (value - rightMean) ** 2));
	return covariance / Math.sqrt(leftVariance * rightVariance);
}

function spatialDistance(leftId: string, rightId: string) {
	const left = pointById.get(leftId);
	const right = pointById.get(rightId);
	if (!left || !right) throw new Error(`Missing committed coordinate for ${leftId} or ${rightId}.`);
	return Math.hypot(left.x - right.x, left.y - right.y);
}

describe('Bias Archipelago committed corpus geography', () => {
	it('keeps functional resemblance materially associated with geographic proximity', () => {
		const pairs: { similarity: number; distance: number }[] = [];
		for (let left = 0; left < biases.length; left += 1) {
			for (let right = left + 1; right < biases.length; right += 1) {
				pairs.push({
					similarity: biasSimilarity(biases[left], biases[right]),
					distance: spatialDistance(biases[left].id, biases[right].id)
				});
			}
		}

		const correlation = pearson(
			pairs.map((pair) => pair.similarity),
			pairs.map((pair) => pair.distance)
		);
		const strongest = [...pairs]
			.sort((left, right) => right.similarity - left.similarity)
			.slice(0, Math.ceil(pairs.length * 0.05));
		const unrelated = pairs.filter((pair) => pair.similarity === 0);

		expect(correlation).toBeLessThanOrEqual(-0.4);
		expect(
			mean(strongest.map((pair) => pair.distance)) / mean(unrelated.map((pair) => pair.distance))
		).toBeLessThan(0.5);
	});

	it('makes spatial neighbours more similar than arbitrary corpus pairs', () => {
		const globalSimilarities: number[] = [];
		const localSimilarities: number[] = [];
		for (const bias of biases) {
			const candidates = biases
				.filter((candidate) => candidate.id !== bias.id)
				.map((candidate) => ({
					similarity: biasSimilarity(bias, candidate),
					distance: spatialDistance(bias.id, candidate.id)
				}));
			globalSimilarities.push(...candidates.map((candidate) => candidate.similarity));
			localSimilarities.push(
				...candidates
					.sort((left, right) => left.distance - right.distance)
					.slice(0, 5)
					.map((candidate) => candidate.similarity)
			);
		}

		expect(mean(localSimilarities)).toBeGreaterThan(mean(globalSimilarities) * 1.8);
	});

	it('preserves the inspected pins and exactly nine deep formations', () => {
		for (const [id, pin] of Object.entries(DEFAULT_REGION_PINS)) {
			expect(pointById.get(id)).toMatchObject(pin);
		}
		expect(layout.formations).toHaveLength(9);
		expect(new Set(layout.formations.map((formation) => formation.id)).size).toBe(9);
	});
});
