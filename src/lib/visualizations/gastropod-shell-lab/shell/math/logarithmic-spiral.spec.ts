import { describe, expect, it } from 'vitest';
import {
	expansionRateFromWhorl,
	logarithmicRadius,
	logarithmicTangentRadialAngle,
	TAU,
	whorlExpansionFromRate
} from './logarithmic-spiral';

describe('logarithmic spiral', () => {
	it('keeps the per-turn radial ratio to relative error below 1e-10', () => {
		const rate = expansionRateFromWhorl(2.37);
		for (let index = 0; index < 25; index += 1) {
			const theta = -12 + index * 0.23;
			const parameters = { expansionRate: rate, adultTheta: 8, adultRadius: 3 };
			const ratio =
				logarithmicRadius(theta + TAU, parameters) / logarithmicRadius(theta, parameters);
			expect(Math.abs(ratio / Math.exp(TAU * rate) - 1)).toBeLessThan(1e-10);
		}
	});

	it('has a constant tangent/radial angle and the correct circle limit', () => {
		const rate = 0.173;
		const expected = logarithmicTangentRadialAngle(rate);
		const epsilon = 1e-6;
		for (let index = 0; index < 25; index += 1) {
			const theta = -4 + index * 0.31;
			const radius = Math.exp(rate * theta);
			const nextRadius = Math.exp(rate * (theta + epsilon));
			const x = radius * Math.cos(theta);
			const y = radius * Math.sin(theta);
			const dx = (nextRadius * Math.cos(theta + epsilon) - x) / epsilon;
			const dy = (nextRadius * Math.sin(theta + epsilon) - y) / epsilon;
			const radialLength = Math.hypot(x, y);
			const tangentLength = Math.hypot(dx, dy);
			const measured = Math.acos((x * dx + y * dy) / (radialLength * tangentLength));
			expect(Math.abs(measured - expected)).toBeLessThan(1e-3);
		}
		expect(logarithmicTangentRadialAngle(0)).toBe(Math.PI / 2);
		expect(whorlExpansionFromRate(0)).toBe(1);
	});
});
