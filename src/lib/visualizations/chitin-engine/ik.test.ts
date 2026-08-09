import { describe, expect, it } from 'vitest';
import { jointBendAngle, solveFabrik } from './ik';

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
	return Math.hypot(right.x - left.x, right.y - left.y);
}

function expectBoneLengths(
	joints: readonly { x: number; y: number }[],
	lengths: readonly number[]
): void {
	for (let index = 0; index < lengths.length; index += 1) {
		expect(distance(joints[index], joints[index + 1])).toBeCloseTo(lengths[index], 6);
	}
}

describe('Chitin FABRIK solver', () => {
	it('converges on a reachable target while preserving every bone length', () => {
		const result = solveFabrik({ x: 0, y: 0 }, { x: 2.1, y: 0.8 }, [1, 0.9, 0.8], {
			preferredBend: 1,
			tolerance: 1e-5,
			maxIterations: 48
		});
		expect(result.reached).toBe(true);
		expect(result.unreachable).toBe(false);
		expect(result.error).toBeLessThanOrEqual(1e-5);
		expectBoneLengths(result.joints, result.boneLengths);
	});

	it('extends an unreachable chain towards the target without elastic bones', () => {
		const result = solveFabrik({ x: 1, y: -2 }, { x: 20, y: -2 }, [2, 1.5, 0.5]);
		expect(result.unreachable).toBe(true);
		expect(result.reached).toBe(false);
		expect(result.joints.at(-1)).toEqual({ x: 5, y: -2 });
		expectBoneLengths(result.joints, result.boneLengths);
	});

	it('enforces bounded joint bends and mirrors the preferred solution coherently', () => {
		const limits = [{ minimum: 0.35, maximum: 1.2 }];
		const upper = solveFabrik({ x: 0, y: 0 }, { x: 1.45, y: 0 }, [1, 1], {
			preferredBend: 1,
			jointLimits: limits,
			maxIterations: 64
		});
		const lower = solveFabrik({ x: 0, y: 0 }, { x: 1.45, y: 0 }, [1, 1], {
			preferredBend: -1,
			jointLimits: limits,
			maxIterations: 64
		});
		const upperBend = jointBendAngle(upper.joints, 1);
		const lowerBend = jointBendAngle(lower.joints, 1);
		expect(upperBend).toBeGreaterThanOrEqual(0.35 - 1e-6);
		expect(upperBend).toBeLessThanOrEqual(1.2 + 1e-6);
		expect(lowerBend).toBeLessThanOrEqual(-0.35 + 1e-6);
		expect(lowerBend).toBeGreaterThanOrEqual(-1.2 - 1e-6);
		expect(upper.joints[1].x).toBeCloseTo(lower.joints[1].x, 5);
		expect(upper.joints[1].y).toBeCloseTo(-lower.joints[1].y, 5);
		expectBoneLengths(upper.joints, [1, 1]);
		expectBoneLengths(lower.joints, [1, 1]);
	});

	it('repairs hostile input and remains finite through repeated target updates', () => {
		let previous: readonly { x: number; y: number }[] | undefined;
		for (let index = 0; index < 200; index += 1) {
			const result = solveFabrik(
				{ x: Number.NaN, y: 0 },
				{ x: Math.cos(index * 0.13) * 1.8, y: Math.sin(index * 0.13) * 1.1 },
				[1, Number.POSITIVE_INFINITY, -0.8],
				{ preferredBend: -1, initialJoints: previous, maxIterations: 20 }
			);
			expect(result.joints.flatMap((joint) => [joint.x, joint.y]).every(Number.isFinite)).toBe(
				true
			);
			expectBoneLengths(result.joints, result.boneLengths);
			previous = result.joints;
		}
	});
});
