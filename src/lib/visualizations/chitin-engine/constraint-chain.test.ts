import { describe, expect, it } from 'vitest';
import {
	cloneConstraintChain,
	constraintChainMaxLengthError,
	createConstraintChain,
	stepConstraintChain
} from './constraint-chain';

describe('Chitin flexible-appendage constraint chain', () => {
	it('uses typed arrays, pins the root, and keeps link lengths bounded', () => {
		const state = createConstraintChain({ x: 0, y: 0 }, [0.5, 0.4, 0.3, 0.2], {
			direction: { x: 1, y: 0 },
			initialCurve: 0.35
		});
		expect(state.positions).toBeInstanceOf(Float32Array);
		expect(state.previous).toBeInstanceOf(Float32Array);
		expect(state.lengths).toBeInstanceOf(Float32Array);

		for (let frame = 0; frame < 120; frame += 1) {
			stepConstraintChain(
				state,
				{ x: 1.25, y: -0.75 },
				{
					deltaTime: 1 / 60,
					acceleration: { x: 0.2, y: 1.8 },
					iterations: 12
				}
			);
		}
		expect(state.positions[0]).toBeCloseTo(1.25, 6);
		expect(state.positions[1]).toBeCloseTo(-0.75, 6);
		expect(state.previous[0]).toBeCloseTo(1.25, 6);
		expect(state.previous[1]).toBeCloseTo(-0.75, 6);
		expect(constraintChainMaxLengthError(state)).toBeLessThan(2e-3);
	});

	it('clamps a restored-tab delta to the configured maximum', () => {
		const initial = createConstraintChain({ x: 0, y: 0 }, [1, 1, 1], {
			initialCurve: -0.5
		});
		// Give both copies identical remembered velocity.
		initial.previous[6] -= 0.2;
		const hugeDelta = cloneConstraintChain(initial);
		const cappedDelta = cloneConstraintChain(initial);
		const first = stepConstraintChain(
			hugeDelta,
			{ x: 0, y: 0 },
			{
				deltaTime: 400,
				maxDeltaTime: 1 / 40,
				acceleration: { x: 0, y: 4 },
				iterations: 10
			}
		);
		const second = stepConstraintChain(
			cappedDelta,
			{ x: 0, y: 0 },
			{
				deltaTime: 1 / 40,
				maxDeltaTime: 1 / 40,
				acceleration: { x: 0, y: 4 },
				iterations: 10
			}
		);
		expect(first.deltaTime).toBe(1 / 40);
		expect([...hugeDelta.positions]).toEqual([...cappedDelta.positions]);
		expect([...hugeDelta.previous]).toEqual([...cappedDelta.previous]);
		expect(second.deltaTime).toBe(first.deltaTime);
	});

	it('repairs coincident and non-finite nodes deterministically', () => {
		const first = createConstraintChain({ x: 0, y: 0 }, [1, 1, 1]);
		first.positions.fill(Number.NaN);
		first.previous.fill(Number.POSITIVE_INFINITY);
		const second = cloneConstraintChain(first);
		stepConstraintChain(first, { x: 2, y: 3 }, { deltaTime: Number.POSITIVE_INFINITY });
		stepConstraintChain(second, { x: 2, y: 3 }, { deltaTime: Number.POSITIVE_INFINITY });
		expect([...first.positions]).toEqual([...second.positions]);
		expect([...first.previous]).toEqual([...second.previous]);
		expect([...first.positions, ...first.previous].every(Number.isFinite)).toBe(true);
	});
});
