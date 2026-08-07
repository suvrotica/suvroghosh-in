import { describe, expect, it } from 'vitest';
import { DEFAULT_REACTION_DIFFUSION_SETUP } from './constants';
import {
	classifyMatrixStability,
	findHomogeneousEquilibria,
	reactionJacobian,
	scanMatrixDispersion
} from './stability';

describe('homogeneous equilibria and linear stability', () => {
	it('14. always finds the feed equilibrium at U=1, V=0', () => {
		const equilibria = findHomogeneousEquilibria(DEFAULT_REACTION_DIFFUSION_SETUP);
		expect(equilibria[0]).toEqual({ id: 'feed', u: 1, v: 0 });
	});

	it('15. returns non-trivial equilibria only when the quadratic discriminant permits them', () => {
		const permitted = findHomogeneousEquilibria({ feed: 0.04, kill: 0.02 });
		expect(permitted).toHaveLength(3);
		for (const equilibrium of permitted.slice(1)) {
			expect(equilibrium.u * equilibrium.v).toBeCloseTo(0.06, 14);
		}
		const forbidden = findHomogeneousEquilibria({ feed: 0.04, kill: 0.08 });
		expect(forbidden).toEqual([{ id: 'feed', u: 1, v: 0 }]);
	});

	it('16. matches every analytic reaction-Jacobian entry', () => {
		const u = 0.4;
		const v = 0.25;
		const feed = 0.03;
		const kill = 0.06;
		const reading = reactionJacobian({ u, v }, { feed, kill });
		expect(reading.matrix).toEqual([-v * v - feed, -2 * u * v, v * v, 2 * u * v - feed - kill]);
	});

	it('17. classifies synthetic 2×2 matrices with known stable, unstable, and marginal spectra', () => {
		expect(classifyMatrixStability([-1, 0, 0, -2])).toBe('stable');
		expect(classifyMatrixStability([1, 0, 0, -2])).toBe('unstable');
		expect(classifyMatrixStability([0, 0, 0, -2])).toBe('near-boundary');
	});

	it('18. distinguishes stable, q=0 unstable, and diffusion-driven dispersion relations', () => {
		const stable = scanMatrixDispersion([-1, 0, 0, -2], 0.1, 1, {
			qMaximum: 10,
			samples: 256
		});
		expect(stable.classification).toBe('linearly-stable');
		expect(stable.fastestQ).toBeNull();

		const reactionUnstable = scanMatrixDispersion([1, 0, 0, -2], 0.1, 1, {
			qMaximum: 10,
			samples: 256
		});
		expect(reactionUnstable.classification).toBe('reaction-unstable');
		expect(reactionUnstable.fastestQ).toBeNull();

		const turing = scanMatrixDispersion([1, -2, 2, -3], 0.01, 1, {
			qMaximum: 10,
			samples: 1_001
		});
		expect(turing.qZeroGrowthRate).toBeLessThan(0);
		expect(turing.maximumGrowthRate).toBeGreaterThan(0);
		expect(turing.classification).toBe('classical-diffusion-driven');
		expect(turing.fastestQ).toBeGreaterThan(0);
	});
});
