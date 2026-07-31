import { describe, expect, it } from 'vitest';
import { synthesizeMunicipalPatch } from './municipalPatch';
import type { EdgeSignature } from './types';

const closed: EdgeSignature = {
	passage: 'closed',
	water: 'dry',
	drain: 'none',
	face: 'neutral',
	clearance: 0
};

function demands(overrides: Partial<EdgeSignature>): EdgeSignature[] {
	return [{ ...closed, ...overrides }, closed, closed, closed];
}

describe('municipal patch synthesis', () => {
	const cases = [
		{
			type: 'balcony-over-lane',
			tags: ['balcony', 'structure-mass'],
			demands: demands({ passage: 'lane', clearance: 1 })
		},
		{
			type: 'lane-through-bedroom',
			tags: ['house', 'bedroom', 'residential'],
			demands: demands({ passage: 'road', clearance: 2 })
		},
		{
			type: 'pole-through-verandah',
			tags: ['utility', 'electric-pole', 'verandah'],
			demands: demands({})
		},
		{
			type: 'uphill-drain',
			tags: ['drain', 'uphill', 'elevation-conflict'],
			demands: demands({ drain: 'channel' })
		},
		{
			type: 'tram-through-garage',
			tags: ['tram', 'garage'],
			demands: demands({ passage: 'tram', clearance: 2 })
		},
		{
			type: 'pond-lane-bridge',
			tags: ['pond', 'route'],
			demands: demands({ passage: 'foot', water: 'pond' })
		},
		{
			type: 'permanent-sand-occupation',
			tags: ['sand', 'route'],
			demands: demands({ passage: 'lane', clearance: 1 })
		},
		{
			type: 'building-around-pillar',
			tags: ['pillar', 'building', 'occupied'],
			demands: demands({})
		}
	] as const;

	for (const testCase of cases) {
		it(`selects ${testCase.type} and preserves every exterior demand`, () => {
			const patch = synthesizeMunicipalPatch({
				seed: `test-${testCase.type}`,
				cell: { x: 2, y: 3 },
				pass: testCase.type === 'uphill-drain' ? 'infrastructure' : 'occupation',
				demandedEdges: testCase.demands,
				conflictTags: testCase.tags
			});
			expect(patch.anomalyType).toBe(testCase.type);
			expect(patch.selectedEdges).toEqual(patch.demandedEdges);
			expect(patch.selectedEdges).toHaveLength(4);
			expect(patch.severity).toBeGreaterThan(0);
			expect(patch.violatedRules.length).toBeGreaterThan(0);
		});
	}

	it('uses construction tarpaulin only as a universal final adapter', () => {
		const patch = synthesizeMunicipalPatch({
			seed: 'no-specific-precedent',
			cell: { x: 0, y: 0 },
			pass: 'fabric',
			demandedEdges: demands({}),
			conflictTags: ['unclassified']
		});
		expect(patch.anomalyType).toBe('construction-tarpaulin');
	});

	it('is deterministic and penalises a repeatedly used family when alternatives exist', () => {
		const input = {
			seed: 'variety',
			cell: { x: 4, y: 5 },
			pass: 'occupation' as const,
			demandedEdges: demands({ passage: 'lane' as const, clearance: 1 as const }),
			conflictTags: [] as string[]
		};
		const first = synthesizeMunicipalPatch(input);
		const replay = synthesizeMunicipalPatch(input);
		expect(replay).toEqual(first);
		const repeated = Array.from({ length: 12 }, (_, index) => ({
			...first,
			id: `previous-${index}`
		}));
		const varied = synthesizeMunicipalPatch({ ...input, previousPatches: repeated });
		expect(['balcony-over-lane', 'lane-through-bedroom']).toContain(varied.anomalyType);
		expect(varied.anomalyType).not.toBe(first.anomalyType);
	});
});
