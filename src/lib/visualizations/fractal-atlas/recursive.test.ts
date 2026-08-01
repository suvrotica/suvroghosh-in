import { describe, expect, it } from 'vitest';
import {
	LSystemLimitError,
	estimateLSystem,
	expandLSystem,
	lSystemSegments,
	parseProductionRules,
	validateLSystemDefinition
} from './lsystem';
import {
	BARNSLEY_FERN_TRANSFORMS,
	generateBarnsleyFern,
	recursiveSierpinskiTriangles,
	sierpinskiChaosGame,
	validateIFSTransforms
} from './recursive';

describe('restricted L-systems', () => {
	const koch = {
		axiom: 'F',
		rules: { F: 'F+F--F+F' },
		angleDegrees: 60,
		stepLength: 1
	};

	it('parses only restricted declarative productions', () => {
		expect(parseProductionRules('F -> F+F\nX = F[-X]+X')).toEqual({
			F: 'F+F',
			X: 'F[-X]+X'
		});
		expect(() => parseProductionRules('F -> eval(alert(1))')).toThrow(SyntaxError);
		expect(
			validateLSystemDefinition({
				...koch,
				rules: { F: 'F[+F' }
			}).valid
		).toBe(false);
	});

	it('estimates and expands the known Koch segment count', () => {
		const estimate = estimateLSystem(koch, 2);
		expect(estimate.segmentCount).toBe(16);
		const sequence = expandLSystem(koch, 2);
		expect([...sequence].filter((symbol) => symbol === 'F')).toHaveLength(16);
		expect(lSystemSegments(sequence, 60)).toHaveLength(16);
	});

	it('refuses explosive expansion before allocation', () => {
		const explosive = {
			axiom: 'F',
			rules: { F: 'FFFFFFFF' },
			angleDegrees: 0,
			stepLength: 1
		};
		const estimate = estimateLSystem(explosive, 8, {
			maxSymbols: 1_000,
			maxSegments: 1_000
		});
		expect(estimate.exceedsSymbolLimit).toBe(true);
		expect(() => expandLSystem(explosive, 8, { maxSymbols: 1_000, maxSegments: 1_000 })).toThrow(
			LSystemLimitError
		);
	});
});

describe('seeded IFS and Sierpiński constructions', () => {
	it('normalises valid transform probabilities', () => {
		const result = validateIFSTransforms(
			BARNSLEY_FERN_TRANSFORMS.map((transform) => ({
				...transform,
				probability: transform.probability * 10
			}))
		);
		expect(
			result.transforms.reduce((sum, transform) => sum + transform.probability, 0)
		).toBeCloseTo(1);
		expect(result.issues).toContain('IFS probabilities were normalised to a total of one.');
	});

	it('produces reproducible Barnsley and chaos-game point sequences', () => {
		expect(generateBarnsleyFern(20, 1234)).toEqual(generateBarnsleyFern(20, 1234));
		expect(generateBarnsleyFern(20, 1234)).not.toEqual(generateBarnsleyFern(20, 1235));
		expect(sierpinskiChaosGame(20, 'triangle')).toEqual(sierpinskiChaosGame(20, 'triangle'));
	});

	it('retains exactly three triangles per previous triangle', () => {
		expect(recursiveSierpinskiTriangles(0)).toHaveLength(1);
		expect(recursiveSierpinskiTriangles(3)).toHaveLength(27);
		expect(() => recursiveSierpinskiTriangles(12)).toThrow(RangeError);
	});
});
