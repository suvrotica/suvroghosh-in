import { describe, expect, it } from 'vitest';
import { FAMILY_REGISTRY, createFamilyDefaultState } from './families';
import { ATLAS_PRESETS, createPresetState } from './presets';
import {
	MAX_LOCAL_STATE_LENGTH,
	MAX_STATE_ITERATIONS,
	cloneFractalState,
	normalizeFractalState,
	parseFractalState,
	parseLocalState,
	serializeFractalState,
	serializeLocalState
} from './state';

describe('family and preset registries', () => {
	it('provides one complete passport and valid default for every family', () => {
		expect(FAMILY_REGISTRY).toHaveLength(12);
		expect(new Set(FAMILY_REGISTRY.map((family) => family.id)).size).toBe(12);
		for (const family of FAMILY_REGISTRY) {
			expect(family.passport.formula.length).toBeGreaterThan(3);
			expect(family.passport.pixelRole.length).toBeGreaterThan(3);
			const result = normalizeFractalState(createFamilyDefaultState(family.id));
			expect(result.unsupportedVersion).toBe(false);
			expect(result.issues).toEqual([]);
		}
	});

	it('keeps deterministic preset states independent of callers', () => {
		expect(new Set(ATLAS_PRESETS.map((preset) => preset.id)).size).toBe(ATLAS_PRESETS.length);
		for (const preset of ATLAS_PRESETS) {
			expect(normalizeFractalState(preset.state).issues, preset.id).toEqual([]);
		}
		const first = createPresetState('seahorse-valley');
		first.center.re = 42;
		expect(createPresetState('seahorse-valley').center.re).toBe(-0.743643887037151);
	});
});

describe('Fractal Atlas state validation and serialisation', () => {
	it('round-trips complete readable URL state', () => {
		const original = createPresetState('seahorse-valley');
		original.coloring = 'orbit-trap';
		original.customPalette = [
			{ position: 0, color: '#000000' },
			{ position: 1, color: '#FFFFFF' }
		];
		original.phoenixPrevious = { re: 0.125, im: -0.25 };
		original.newtonRelaxation = 0.85;
		original.distanceLightAngle = Math.PI / 3;
		original.distanceLightStrength = 0.41;
		original.renderQuality = 'battery';
		const parsed = parseFractalState(serializeFractalState(original));
		expect(parsed.issues).toEqual([]);
		expect(parsed.state).toEqual(original);
	});

	it('round-trips an authoritative deep centre as decimal strings', () => {
		const original = createPresetState('seahorse-valley');
		original.spanY = 1e-30;
		original.precisionMode = 'auto';
		original.centerDecimal = {
			re: '-0.74364388703715100792301305236157',
			im: '0.13182590420532999943598128774412'
		};
		original.center = {
			re: Number(original.centerDecimal.re),
			im: Number(original.centerDecimal.im)
		};
		const serialized = serializeFractalState(original);
		expect(serialized.get('xd')).toBe(original.centerDecimal.re);
		expect(serialized.get('yd')).toBe(original.centerDecimal.im);
		const parsed = parseFractalState(serialized);
		expect(parsed.issues).toEqual([]);
		expect(parsed.state.centerDecimal).toEqual(original.centerDecimal);
		expect(parsed.state.spanY).toBe(1e-30);
		expect(parsed.state.precisionMode).toBe('auto');
	});

	it('round-trips an authoritative deep Julia parameter through URL and local JSON', () => {
		const original = createFamilyDefaultState('julia');
		original.juliaCDecimal = {
			re: '-0.1230000000000000000000000000000000001',
			im: '0.7450000000000000000000000000000000002'
		};
		original.juliaC = {
			re: Number(original.juliaCDecimal.re),
			im: Number(original.juliaCDecimal.im)
		};

		const query = serializeFractalState(original);
		expect(query.get('jrd')).toBe(original.juliaCDecimal.re);
		expect(query.get('jid')).toBe(original.juliaCDecimal.im);
		expect(parseFractalState(query).state.juliaCDecimal).toEqual(original.juliaCDecimal);
		expect(parseLocalState(serializeLocalState(original)).state.juliaCDecimal).toEqual(
			original.juliaCDecimal
		);
	});

	it('falls back or clamps corrupt and extreme query values', () => {
		const parsed = parseFractalState(
			'?v=1&f=mandelbrot&x=NaN&y=0&s=0&it=999999999&pal=unknown&flip=perhaps&prec=perturbation'
		);
		expect(parsed.state.center).toEqual({ re: -0.5, im: 0 });
		expect(parsed.state.spanY).toBe(createFamilyDefaultState('mandelbrot').spanY);
		expect(parsed.state.maxIterations).toBe(MAX_STATE_ITERATIONS);
		expect(parsed.state.paletteId).toBe('observatory');
		expect(parsed.state.flipY).toBe(false);
		expect(parsed.state.precisionMode).toBe('auto');
		expect(parsed.issues.some((entry) => entry.path === 'precisionMode')).toBe(true);
		expect(parsed.issues.length).toBeGreaterThanOrEqual(4);
	});

	it('rejects unsupported schema versions without partially applying them', () => {
		const parsed = parseFractalState('?v=99&f=julia&x=12&y=13');
		expect(parsed.unsupportedVersion).toBe(true);
		expect(parsed.state.family).toBe('mandelbrot');
		expect(parsed.state.center).toEqual({ re: -0.5, im: 0 });
	});

	it('bounds polynomial degree, palette stops, and explosive grammars', () => {
		const invalid = normalizeFractalState({
			...createFamilyDefaultState('newton'),
			customPalette: Array.from({ length: 20 }, (_, index) => ({
				position: index / 19,
				color: '#123456'
			})),
			polynomial: {
				coefficients: Array.from({ length: 20 }, () => ({ re: 1, im: 0 }))
			}
		});
		expect(invalid.state.customPalette?.length).toBeLessThanOrEqual(8);
		expect(invalid.state.polynomial?.coefficients).toHaveLength(4);
		expect(invalid.issues.length).toBeGreaterThan(0);

		const grammar = normalizeFractalState({
			...createFamilyDefaultState('l-system'),
			lSystem: {
				presetId: 'explosive',
				axiom: 'F',
				rules: { F: 'FFFFFFFF' },
				generations: 10,
				angleDegrees: 0,
				stepLength: 1,
				lineWidth: 1,
				colorByDepth: false
			}
		});
		expect(grammar.state.lSystem!.generations).toBeLessThan(10);
		expect(grammar.issues.some((entry) => entry.path === 'lSystem.generations')).toBe(true);
	});

	it('round-trips local JSON, clones deeply, and rejects oversized input', () => {
		const state = createPresetState('barnsley-fern');
		const parsed = parseLocalState(serializeLocalState(state));
		expect(parsed.state).toEqual(state);

		const clone = cloneFractalState(state);
		clone.ifs!.transforms[0].a = 99;
		expect(state.ifs!.transforms[0].a).not.toBe(99);

		const oversized = parseLocalState(' '.repeat(MAX_LOCAL_STATE_LENGTH + 1));
		expect(oversized.issues[0].severity).toBe('error');
	});

	it('migrates the compact legacy state shape safely', () => {
		const migrated = normalizeFractalState({
			version: 0,
			familyId: 'julia',
			plane: 'dynamical',
			viewport: {
				centerRe: '-0.123',
				centerIm: '0.745',
				width: '0.002'
			},
			juliaC: { re: '-1', im: '0' },
			calculation: { maxIterations: 700, bailout: 2 },
			colour: { method: 'smooth', paletteId: 'monsoon-ink' }
		});
		expect(migrated.migrated).toBe(true);
		expect(migrated.state.family).toBe('julia');
		expect(migrated.state.center).toEqual({ re: -0.123, im: 0.745 });
		expect(migrated.state.juliaC).toEqual({ re: -1, im: 0 });
		expect(migrated.state.maxIterations).toBe(700);
	});
});
