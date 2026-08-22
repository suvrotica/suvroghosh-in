import { describe, expect, it } from 'vitest';
import { evaluateExpression, magnitude } from './complex';
import { parseExpression } from './expression';
import { DOMAIN_COLORING_PRESETS, domainColoringPreset } from './presets';
import type { ComplexFeature, DomainBounds, PresetCategory } from './types';

const TAU = Math.PI * 2;

const OLD_PRESETS = new Map([
	['identity', 'z'],
	['squaring', 'z^2'],
	['reciprocal', '1 / z'],
	['roots-of-unity', 'z^3 - 1'],
	['sine', 'sin(z)'],
	['exponential', 'exp(z)'],
	['logarithm', 'log(z)'],
	['square-root', 'sqrt(z)'],
	['rational-map', '(z^2 - 1) / (z^2 + 1)']
]);

const CATEGORY_COUNTS: Readonly<Record<PresetCategory, number>> = {
	'Start here': 4,
	'Zeros, poles, and critical points': 8,
	'Classical maps': 2,
	'Periodicity and growth': 5,
	'Removable and essential singularities': 3,
	'Principal branches and sheets': 6,
	'Non-holomorphic control': 1
};

function features(id: string, kind: ComplexFeature['kind']): readonly ComplexFeature[] {
	return domainColoringPreset(id)!.features.filter((candidate) => candidate.kind === kind);
}

function expectPoint(candidate: ComplexFeature, re: number, im: number, precision = 12): void {
	expect(candidate.z.re).toBeCloseTo(re, precision);
	expect(candidate.z.im).toBeCloseTo(im, precision);
}

function generated(id: string, familyId: string, bounds: DomainBounds, limit: number) {
	const family = domainColoringPreset(id)!.featureFamilies!.find(
		(candidate) => candidate.id === familyId
	);
	expect(family).toBeDefined();
	return family!.generate(bounds, limit);
}

describe('expanded domain-colouring preset registry', () => {
	it('contains the requested 29 examples in seven accessible groups', () => {
		expect(DOMAIN_COLORING_PRESETS).toHaveLength(29);
		expect(new Set(DOMAIN_COLORING_PRESETS.map((preset) => preset.id)).size).toBe(29);

		for (const [category, expected] of Object.entries(CATEGORY_COUNTS)) {
			expect(
				DOMAIN_COLORING_PRESETS.filter((preset) => preset.category === category).length,
				category
			).toBe(expected);
		}
	});

	it('preserves the stable IDs and expressions of the original nine presets', () => {
		for (const [id, expression] of OLD_PRESETS) {
			expect(domainColoringPreset(id)?.expression).toBe(expression);
		}
	});

	it('gives every preset safe syntax and complete bounded display defaults', () => {
		const featureIds = new Set<string>();
		for (const candidate of DOMAIN_COLORING_PRESETS) {
			expect(() => parseExpression(candidate.expression), candidate.id).not.toThrow();
			expect(candidate.articleAnchor, candidate.id).toMatch(/^#[a-z0-9-]+$/u);
			expect(candidate.view.spanRe, candidate.id).toBeGreaterThan(0);
			expect(candidate.view.spanIm, candidate.id).toBeGreaterThan(0);
			expect(candidate.camera.distance, candidate.id).toBeGreaterThan(0);
			expect(candidate.camera.targetX, candidate.id).toBe(candidate.view.centerRe);
			expect(candidate.camera.targetZ, candidate.id).toBe(candidate.view.centerIm);
			expect(candidate.height.lens, candidate.id).toBe('log-magnitude');
			expect(candidate.height.compression, candidate.id).toBe('linear');
			expect(candidate.height.logCap, candidate.id).toBeGreaterThan(0);
			expect(candidate.height.verticalScale, candidate.id).toBeGreaterThan(0);
			expect(candidate.height.componentScale, candidate.id).toBeGreaterThan(0);
			expect(candidate.height.componentCap, candidate.id).toBeGreaterThan(0);

			for (const known of candidate.features) {
				expect(Number.isFinite(known.z.re), known.id).toBe(true);
				expect(Number.isFinite(known.z.im), known.id).toBe(true);
				expect(featureIds.has(known.id), known.id).toBe(false);
				featureIds.add(known.id);
			}
		}

		expect(domainColoringPreset('essential-exponential')?.quality).toBe('low');
		expect(domainColoringPreset('essential-sine')?.quality).toBe('low');
		expect(domainColoringPreset('conjugate')).toMatchObject({
			holomorphic: false,
			mathematicalClass: 'antiholomorphic'
		});
	});
});

describe('finite preset feature truths', () => {
	it('records multiplicities and finite critical points without conflating them', () => {
		expect(features('identity', 'zero')[0].order).toBe(1);
		expect(features('squaring', 'zero')[0].order).toBe(2);
		expect(features('cubing', 'zero')[0].order).toBe(3);

		const quadraticZeros = features('quadratic-pair', 'zero');
		expect(quadraticZeros).toHaveLength(2);
		expectPoint(quadraticZeros[0], 0, 1);
		expectPoint(quadraticZeros[1], 0, -1);
		expectPoint(features('quadratic-pair', 'critical')[0], 0, 0);

		const mixedZeros = features('mixed-multiplicity', 'zero');
		expect(mixedZeros.map((candidate) => candidate.order)).toEqual([2, 3]);
		const isolatedMixedCritical = features('mixed-multiplicity', 'critical').find(
			(candidate) => candidate.id === 'mixed-critical-fifth'
		)!;
		expectPoint(isolatedMixedCritical, 1 / 5, 0);
	});

	it('records the rational and classical zero-pole constellations', () => {
		expect(features('rational-map', 'zero')).toHaveLength(2);
		expect(features('rational-map', 'pole')).toHaveLength(2);
		expect(features('rational-map', 'critical')).toHaveLength(1);
		expect(features('fifth-rational-map', 'zero')).toHaveLength(5);
		expect(features('fifth-rational-map', 'pole')).toHaveLength(5);
		expect(features('five-poles', 'pole')).toHaveLength(5);

		const joukowski = domainColoringPreset('joukowski')!;
		expect(joukowski.features.map((candidate) => candidate.kind).sort()).toEqual([
			'critical',
			'critical',
			'pole',
			'zero',
			'zero'
		]);
		expectPoint(features('joukowski', 'pole')[0], 0, 0);
		expect(
			features('joukowski', 'critical')
				.map((candidate) => candidate.z.re)
				.sort()
		).toEqual([-1, 1]);
	});

	it('places every finite zero marker at a numerical zero of its parsed expression', () => {
		for (const candidate of DOMAIN_COLORING_PRESETS) {
			const ast = parseExpression(candidate.expression);
			for (const zero of candidate.features.filter((known) => known.kind === 'zero')) {
				const value = evaluateExpression(ast, zero.z);
				expect(magnitude(value), `${candidate.id}: ${zero.id}`).toBeLessThan(1e-9);
			}
		}
	});

	it('keeps branch points and essential singularities distinct from meromorphic poles', () => {
		expect(features('square-root', 'zero')).toHaveLength(0);
		expect(features('square-root', 'branch-point')).toHaveLength(1);
		expect(features('cube-root', 'branch-point')).toHaveLength(1);
		expect(features('essential-exponential', 'pole')).toHaveLength(0);
		expect(features('essential-exponential', 'essential')).toHaveLength(1);
		expect(features('essential-sine', 'essential')).toHaveLength(1);
		expect(features('essential-sine', 'accumulation')).toHaveLength(1);
		expectPoint(features('self-power', 'critical')[0], 1 / Math.E, 0);
	});
});

describe('bounds-aware feature families', () => {
	const realBounds: DomainBounds = { minRe: -4, maxRe: 4, minIm: -1, maxIm: 1 };

	it('generates the periodic sine and tangent families only inside visible bounds', () => {
		const sineZeros = generated('sine', 'sine-zeros', realBounds, 20);
		expect(sineZeros.map((candidate) => candidate.z.re)).toEqual([-Math.PI, 0, Math.PI]);

		const sineCriticals = generated('sine', 'sine-criticals', realBounds, 20);
		expect(sineCriticals.map((candidate) => candidate.z.re)).toEqual([-Math.PI / 2, Math.PI / 2]);

		const tangentPoles = generated('tangent', 'tangent-poles', realBounds, 20);
		expect(tangentPoles).toHaveLength(2);
		for (const candidate of tangentPoles) {
			expect(candidate.z.re).toBeGreaterThanOrEqual(realBounds.minRe);
			expect(candidate.z.re).toBeLessThanOrEqual(realBounds.maxRe);
			expect(candidate.z.im).toBe(0);
		}
	});

	it('excludes the analytically filled sinc origin from its zero family', () => {
		const zeros = generated('sinc', 'sinc-zeros', realBounds, 20);
		expect(zeros).toHaveLength(2);
		expect(zeros.every((candidate) => candidate.z.re !== 0)).toBe(true);
		expect(features('sinc', 'removable')).toHaveLength(1);
	});

	it('generates vertical exponential zeros and respects a caller marker cap', () => {
		const bounds: DomainBounds = { minRe: -1, maxRe: 1, minIm: -20, maxIm: 20 };
		const zeros = generated('exponential-minus-one', 'exp-minus-one-zeros', bounds, 3);
		expect(zeros).toHaveLength(3);
		expect(zeros.every((candidate) => candidate.z.re === 0)).toBe(true);
		for (const candidate of zeros) {
			expect(candidate.z.im / TAU).toBeCloseTo(Math.round(candidate.z.im / TAU), 12);
		}
	});

	it('produces genuine reciprocal-sine zeros near its annotated accumulation point', () => {
		const bounds: DomainBounds = { minRe: -0.4, maxRe: 0.4, minIm: -0.1, maxIm: 0.1 };
		const zeros = generated('essential-sine', 'reciprocal-sine-zeros', bounds, 9);
		expect(zeros).toHaveLength(9);
		for (const candidate of zeros) {
			expect(candidate.z.re).toBeGreaterThanOrEqual(bounds.minRe);
			expect(candidate.z.re).toBeLessThanOrEqual(bounds.maxRe);
			expect(candidate.z.re).not.toBe(0);
			expect(Math.abs(Math.sin(1 / candidate.z.re))).toBeLessThan(1e-10);
		}
	});

	it('rejects irrelevant axes and invalid bounds and globally caps generated markers', () => {
		const offAxis: DomainBounds = { minRe: -4, maxRe: 4, minIm: 1, maxIm: 2 };
		expect(generated('sine', 'sine-zeros', offAxis, 20)).toEqual([]);
		const invalid: DomainBounds = { minRe: 2, maxRe: -2, minIm: -1, maxIm: 1 };
		expect(generated('sine', 'sine-zeros', invalid, 20)).toEqual([]);
		const huge: DomainBounds = { minRe: -10_000, maxRe: 10_000, minIm: -1, maxIm: 1 };
		expect(generated('sine', 'sine-zeros', huge, 10_000)).toHaveLength(256);
	});
});

describe('curated branch cuts and sheet eligibility', () => {
	it('limits sheet construction to square root, cube root, and logarithm', () => {
		expect(
			DOMAIN_COLORING_PRESETS.filter((candidate) => candidate.sheets).map((candidate) => [
				candidate.id,
				candidate.sheets!.kind
			])
		).toEqual([
			['logarithm', 'log'],
			['square-root', 'sqrt'],
			['cube-root', 'cuberoot']
		]);
	});

	it('uses the negative-real principal cut for the single-branch examples', () => {
		for (const id of ['logarithm', 'square-root', 'cube-root', 'imaginary-power', 'self-power']) {
			const cuts = domainColoringPreset(id)!.cuts!;
			expect(cuts).toHaveLength(1);
			expect(cuts[0]).toMatchObject({
				kind: 'ray',
				origin: { re: 0, im: 0 },
				direction: { re: -1, im: 0 }
			});
		}
	});

	it('records both components of the literal sqrt(z^2 - 1) cut preimage', () => {
		const cuts = domainColoringPreset('sqrt-quadratic')!.cuts!;
		expect(cuts.map((cut) => cut.kind)).toEqual(['segment', 'real-preimage']);
		const segment = cuts[0];
		expect(segment).toMatchObject({
			kind: 'segment',
			from: { re: -1, im: 0 },
			to: { re: 1, im: 0 }
		});
		const implicit = cuts[1];
		expect(implicit.kind).toBe('real-preimage');
		if (implicit.kind === 'real-preimage') {
			expect(implicit.test({ re: 0, im: 3 })).toBe(0);
			expect(implicit.test({ re: 0.25, im: 3 })).not.toBe(0);
		}
	});
});
