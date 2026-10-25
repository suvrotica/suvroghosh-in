import { describe, expect, it } from 'vitest';
import { brownConrady, defaultParameters, effects, mapPoint, sanitiseParameters } from './model';

describe('lens and mirror image geometry', () => {
	it('keeps every neutral, unreflected preset identical to the source', () => {
		for (const effect of effects) {
			const p = { ...defaultParameters(effect.id), strength: 0, mirror: false };
			for (const [u, v] of [
				[0, 0],
				[0.13, 0.72],
				[0.5, 0.5],
				[1, 1]
			]) {
				const result = mapPoint(u, v, 1.4, effect.id, p);
				expect(result[0]).toBeCloseTo(u, 10);
				expect(result[1]).toBeCloseTo(v, 10);
			}
		}
	});
	it('has opposite radial lookup directions for barrel and pincushion', () => {
		const p = defaultParameters('barrel');
		expect(mapPoint(0.8, 0.7, 1, 'barrel', p)[0]).toBeGreaterThan(0.8);
		expect(mapPoint(0.8, 0.7, 1, 'pincushion', p)[0]).toBeLessThan(0.8);
		expect(mapPoint(0.5, 0.5, 1, 'barrel', p)).toEqual([0.5, 0.5]);
	});
	it('normalises isotropically on portrait and landscape images', () => {
		for (const aspect of [16 / 9, 9 / 16]) {
			const p = defaultParameters();
			const ax = Math.min(1, aspect),
				ay = Math.min(1, 1 / aspect);
			const horizontal = mapPoint(0.5 + 0.15 / ax, 0.5, aspect, 'barrel', p);
			const vertical = mapPoint(0.5, 0.5 + 0.15 / ay, aspect, 'barrel', p);
			expect((horizontal[0] - 0.5) * ax).toBeCloseTo((vertical[1] - 0.5) * ay, 10);
		}
	});
	it('moves the optical centre without translating the identity state', () => {
		const p = { ...defaultParameters(), centerX: 0.2, centerY: 0.3 };
		expect(mapPoint(0.2, 0.3, 1, 'barrel', p)).toEqual([0.2, 0.3]);
		expect(mapPoint(0.2, 0.3, 1, 'original', p)).toEqual([0.2, 0.3]);
	});
	it('flips asymmetric coordinates once in a flat mirror', () => {
		const p = defaultParameters('flat');
		const once = mapPoint(0.13, 0.72, 1, 'flat', p);
		expect(once[0]).toBeCloseTo(0.87);
		expect(once[1]).toBeCloseTo(0.72);
		const twice = mapPoint(once[0], once[1], 1, 'flat', p);
		expect(twice[0]).toBeCloseTo(0.13);
	});
	it('numerically inverts the forward Brown–Conrady model', () => {
		const p = {
			...defaultParameters(),
			advanced: true,
			k1: 0.08,
			k2: 0.005,
			k3: 0.0005,
			p1: 0.01,
			p2: -0.015
		};
		for (const [x, y] of [
			[0, 0],
			[0.3, 0.5],
			[-0.5, 0.4],
			[0.8, -0.7]
		]) {
			const [dx, dy] = brownConrady(x, y, p);
			const [u, v] = mapPoint(dx / 2 + 0.5, dy / 2 + 0.5, 1, 'barrel', p);
			expect(u).toBeCloseTo(x / 2 + 0.5, 6);
			expect(v).toBeCloseTo(y / 2 + 0.5, 6);
		}
	});
	it('keeps all permitted extreme presets finite', () => {
		for (const effect of effects)
			for (const aspect of [0.1, 1, 10])
				for (const advanced of [false, true]) {
					const p = {
						...defaultParameters(effect.id),
						strength: 1,
						radius: 0.2,
						scale: 0.6,
						centerX: 0,
						centerY: 1,
						k1: -0.12,
						k2: -0.02,
						k3: -0.002,
						p1: 0.04,
						p2: -0.04,
						advanced
					};
					for (const [u, v] of [
						[0, 0],
						[1, 0],
						[0.5, 0.5],
						[1, 1]
					])
						expect(mapPoint(u, v, aspect, effect.id, p).every(Number.isFinite)).toBe(true);
				}
	});
	it('keeps every curved radial preset monotonic at maximum strength', () => {
		for (const effect of [
			'barrel',
			'pincushion',
			'moustache',
			'fisheye',
			'convex',
			'concave',
			'cylindrical'
		] as const) {
			for (const radius of [0.2, 0.72, 1.5]) {
				const p = { ...defaultParameters(effect), strength: 1, radius, mirror: false };
				let previous = -Infinity;
				for (let i = 0; i <= 200; i++) {
					const source = mapPoint(i / 200, 0.5, 1, effect, p)[0];
					expect(source).toBeGreaterThan(previous);
					previous = source;
				}
			}
		}
	});
	it('marks noninvertible advanced regions unavailable instead of folding them', () => {
		const p = {
			...defaultParameters(),
			advanced: true,
			k1: -0.12,
			k2: -0.02,
			k3: -0.002,
			p1: 0,
			p2: 0
		};
		const source = mapPoint(1.5, 0.5, 1, 'barrel', p);
		expect(source[0]).toBeGreaterThan(1);
		expect(source.every(Number.isFinite)).toBe(true);
	});
	it('sanitises nonfinite and excessive URL parameters', () => {
		const p = sanitiseParameters({
			strength: Infinity,
			centerX: -40,
			radius: 10,
			k1: Number.NaN,
			phase: 900
		});
		expect(p.strength).toBe(defaultParameters().strength);
		expect(p.centerX).toBe(0);
		expect(p.radius).toBe(1.5);
		expect(p.k1).toBe(0);
		expect(p.phase).toBe(Math.PI * 2);
	});
});
