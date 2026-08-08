import { describe, expect, it } from 'vitest';
import { DEFAULT_OREGONATOR_SETUP } from './constants';
import { BZFastCpuSolver } from './fast-solver';
import { BZCpuSolver } from './solver';

describe('BZFastCpuSolver', () => {
	it('matches the audited Float64 reference kernel exactly over a short replay', () => {
		const setup = { ...DEFAULT_OREGONATOR_SETUP, gridSize: 24, domainSize: 12, activeRadius: 5.6 };
		const reference = new BZCpuSolver(setup);
		const fast = new BZFastCpuSolver(setup);
		reference.step(32);
		fast.step(32);
		expect(Array.from(fast.state.u)).toEqual(Array.from(reference.state.u));
		expect(Array.from(fast.state.v)).toEqual(Array.from(reference.state.v));
	});

	it('keeps the new phase and multi-core recipes finite without clipping', () => {
		for (const initialCondition of ['phase-quadrants', 'multi-spiral-seed'] as const) {
			const setup = {
				...DEFAULT_OREGONATOR_SETUP,
				gridSize: 40,
				domainSize: 16,
				activeRadius: 7.5,
				initialCondition
			};
			const solver = new BZFastCpuSolver(setup);
			solver.step(10);
			expect([...solver.state.u, ...solver.state.v].every(Number.isFinite)).toBe(true);
		}
	});
});
