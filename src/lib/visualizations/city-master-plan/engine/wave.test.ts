import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../../utils/seeded-random';
import { BitSet } from './bitset';
import { buildCompatibilityMasks } from './compatibility';
import { propagateWave, runWaveCollapse } from './wave';
import type { EdgeSignature, TileVariant } from './types';

const closed: EdgeSignature = {
	passage: 'closed',
	water: 'dry',
	drain: 'none',
	face: 'neutral',
	clearance: 0
};
const lane: EdgeSignature = {
	passage: 'lane',
	water: 'dry',
	drain: 'none',
	face: 'neutral',
	clearance: 1
};

function variant(index: number, id: string, west: EdgeSignature, east: EdgeSignature): TileVariant {
	return {
		index,
		id: `${id}@0`,
		prototypeId: id,
		pass: 'fabric',
		weight: 1,
		rotation: 0,
		edges: [closed, east, closed, west],
		tags: [],
		renderer: id
	};
}

describe('queue propagation', () => {
	const variants = [
		variant(0, 'closed', closed, closed),
		variant(1, 'line', lane, lane),
		variant(2, 'left-cap', closed, lane),
		variant(3, 'right-cap', lane, closed)
	];
	const masks = buildCompatibilityMasks(variants);

	it('removes incompatible neighbours, reaches a fixed point, and preserves singleton cells', () => {
		const wave = [BitSet.from(4, [2]), BitSet.full(4), BitSet.full(4)];
		const first = propagateWave(wave, [0], 3, 1, masks);
		expect(first.contradictionIndex).toBe(-1);
		expect(wave[0].singletonIndex()).toBe(2);
		expect(wave[1].toArray()).toEqual([1, 3]);
		const snapshot = wave.map((cell) => cell.clone());
		const second = propagateWave(wave, [0, 1, 2], 3, 1, masks);
		expect(second.contradictionIndex).toBe(-1);
		expect(wave.every((cell, index) => cell.equals(snapshot[index]))).toBe(true);
	});

	it('returns the exact zero-candidate cell as a contradiction', () => {
		const wave = [BitSet.from(4, [2]), BitSet.from(4, [0])];
		const result = propagateWave(wave, [0], 2, 1, masks);
		expect(result.contradictionIndex).toBe(1);
		expect(wave[1].isEmpty()).toBe(true);
	});
});

describe('bounded deterministic search', () => {
	it('backtracks, removes a failed branch, and does not repeat it', () => {
		const variants = [
			variant(0, 'closed', closed, closed),
			variant(1, 'line', lane, lane),
			variant(2, 'left-cap', closed, lane),
			variant(3, 'right-cap', lane, closed)
		];
		const initial = [BitSet.from(4, [0, 2]), BitSet.from(4, [0, 1]), BitSet.from(4, [3])];
		let result = runWaveCollapse({
			width: 3,
			height: 1,
			pass: 'fabric',
			variants,
			initialWave: initial,
			random: new SeededRandom('known-miniature'),
			tieBreakerSeed: 'known-miniature',
			maxBacktracks: 4,
			hardStepBudget: 100
		});
		if (result.backtracks === 0) {
			result = runWaveCollapse({
				width: 3,
				height: 1,
				pass: 'fabric',
				variants,
				initialWave: initial,
				random: new SeededRandom('known-miniature-alternate'),
				tieBreakerSeed: 'known-miniature-alternate',
				maxBacktracks: 4,
				hardStepBudget: 100
			});
		}
		expect(result.variantIndices).toHaveLength(3);
		expect(result.events.filter((event) => event.type === 'backtrack').length).toBe(
			result.backtracks
		);
		expect(result.backtracks).toBeLessThanOrEqual(4);
		expect(result.wave.every((cell) => cell.isSingleton())).toBe(true);
	});

	it('respects a zero backtrack budget and repairs contradictions instead', () => {
		const variants = [variant(0, 'closed', closed, closed), variant(1, 'line', lane, lane)];
		const result = runWaveCollapse({
			width: 2,
			height: 1,
			pass: 'fabric',
			variants,
			initialWave: [BitSet.from(2, [1]), BitSet.from(2, [0])],
			random: new SeededRandom('patch-now'),
			tieBreakerSeed: 'patch-now',
			maxBacktracks: 0,
			hardStepBudget: 20
		});
		expect(result.backtracks).toBe(0);
		expect(result.patches).toHaveLength(1);
		expect(result.wave.every((cell) => cell.isSingleton())).toBe(true);
	});
});
