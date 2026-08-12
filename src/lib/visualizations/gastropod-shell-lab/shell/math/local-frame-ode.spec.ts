import { describe, expect, it } from 'vitest';
import { constantOdeLaw, integrateLocalFrame, type LocalFrameOdeState } from './local-frame-ode';
import { distance3 } from './vector';

describe('local-frame RK4', () => {
	it('converges at fourth order for a constant-curvature circle case', () => {
		const initial: LocalFrameOdeState = {
			center: { x: 0, y: 0, z: 0 },
			tangent: { x: 1, y: 0, z: 0 },
			e1: { x: 0, y: 1, z: 0 },
			e2: { x: 0, y: 0, z: 1 },
			scale: 1
		};
		const laws = {
			speed: constantOdeLaw(1),
			growthRate: constantOdeLaw(0),
			curvature1: constantOdeLaw(Math.PI / 2),
			curvature2: constantOdeLaw(0),
			twistRate: constantOdeLaw(0)
		};
		const target = { x: 2 / Math.PI, y: 2 / Math.PI, z: 0 };
		const coarse = integrateLocalFrame(initial, laws, 9).at(-1)!;
		const fine = integrateLocalFrame(initial, laws, 17).at(-1)!;
		const coarseError = distance3(coarse.center, target);
		const fineError = distance3(fine.center, target);
		expect(fineError).toBeLessThan(coarseError);
		expect(fineError).toBeLessThan(coarseError / 8);
	});

	it('integrates exponential scale exactly to RK4 accuracy', () => {
		const samples = integrateLocalFrame(
			{
				center: { x: 0, y: 0, z: 0 },
				tangent: { x: 1, y: 0, z: 0 },
				e1: { x: 0, y: 1, z: 0 },
				e2: { x: 0, y: 0, z: 1 },
				scale: 0.5
			},
			{
				speed: constantOdeLaw(0),
				growthRate: constantOdeLaw(1.3),
				curvature1: constantOdeLaw(0),
				curvature2: constantOdeLaw(0),
				twistRate: constantOdeLaw(0)
			},
			65
		);
		expect(Math.abs(samples.at(-1)!.scale - 0.5 * Math.exp(1.3))).toBeLessThan(1e-8);
	});
});
