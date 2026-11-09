import { describe, expect, it } from 'vitest';
import {
	createSeededDisturbance,
	evaluateRightHandSide,
	solveUniformEquilibrium
} from '../how-spots-and-stripes-form/engine.ts';
import {
	createDomain,
	createReferenceConfig,
	createSkinConfig,
	DEFAULT_SETTINGS,
	fitReference,
	GRID_SPACING,
	initialSkinFields,
	LENGTH,
	OBSERVATION_TIME,
	referenceKey,
	SHAPE_PRESETS,
	SkinSolver,
	solveSkin,
	TAPER_TIP_WIDTH,
	WIDTH_MAX,
	WIDTH_MIN,
	WIDTH_STEP,
	type SkinDomain,
	type SkinSnapshot
} from './model.ts';
import { renderSkinField } from './display.ts';

describe('fixed physical lattice', () => {
	it('keeps length and numerical settings fixed across widths and resolves all supported masks', () => {
		const {
			shape: _shape,
			widthPercent: _width,
			...invariants
		} = createSkinConfig(DEFAULT_SETTINGS);
		for (const shape of ['straight', 'tapered'] as const) {
			for (let width = WIDTH_MIN; width <= WIDTH_MAX; width += WIDTH_STEP) {
				const config = createSkinConfig({ ...DEFAULT_SETTINGS, shape, widthPercent: width });
				const { shape: _candidateShape, widthPercent: _candidateWidth, ...fixed } = config;
				expect(fixed).toEqual(invariants);
				const domain = createDomain(config);
				expect(domain.nx * domain.gridSpacing).toBeCloseTo(LENGTH, 12);
				expect(Math.min(...domain.columnWidths)).toBeCloseTo(
					shape === 'tapered' ? TAPER_TIP_WIDTH : domain.width,
					12
				);
				for (let x = 0; x < domain.nx; x++) {
					let active = 0;
					for (let y = 0; y < domain.ny; y++) {
						active += domain.mask[y * domain.nx + x];
					}
					if (active < 10 || Math.abs(active * GRID_SPACING - domain.columnWidths[x]) > 1e-12) {
						throw new Error(
							`Unresolved or incorrectly described column ${x} at ${shape} ${width}%.`
						);
					}
				}
			}
		}
	});

	it('keeps the seeded starting field at common physical coordinates and interpolates it on refinement', () => {
		const narrowConfig = createSkinConfig({ ...DEFAULT_SETTINGS, appearance: 'spots' });
		const broadConfig = createReferenceConfig(narrowConfig);
		const narrowDomain = createDomain(narrowConfig);
		const broadDomain = createDomain(broadConfig);
		const narrow = initialSkinFields(narrowConfig, narrowDomain);
		const broad = initialSkinFields(broadConfig, broadDomain);
		for (let i = 0; i < narrowDomain.mask.length; i++) {
			if (narrowDomain.mask[i] && (narrow.u[i] !== broad.u[i] || narrow.v[i] !== broad.v[i])) {
				throw new Error(`Noise differs at shared lattice coordinate ${i}.`);
			}
		}
		const fineConfig = createSkinConfig(broadConfig, { gridSpacing: 0.4, timestep: 0.0025 });
		const fineDomain = createDomain(fineConfig);
		const fine = initialSkinFields(fineConfig, fineDomain);
		const knots = createSeededDisturbance(broadDomain.nx, broadDomain.ny, broadConfig.seed, 0.03);
		const s = solveUniformEquilibrium(broadConfig.patternBalance);
		// Fine cell (1,1) is at +1/4 of the coarse knot interval on both axes.
		for (const signal of ['u', 'v'] as const) {
			const knot = signal === 'u' ? knots.du : knots.dv;
			const expected =
				s + (9 * knot[0] + 3 * knot[1] + 3 * knot[broadDomain.nx] + knot[broadDomain.nx + 1]) / 16;
			expect(fine[signal][fineDomain.nx + 1]).toBeCloseTo(expected, 14);
		}
	});

	it('shares the reference for geometry only and separates chemistry, seed and numerical settings', () => {
		const config = createSkinConfig(DEFAULT_SETTINGS);
		const key = referenceKey(config);
		expect(referenceKey(createSkinConfig({ ...config, ...SHAPE_PRESETS.tapered }))).toBe(key);
		expect(referenceKey(createSkinConfig({ ...config, appearance: 'spots' }))).not.toBe(key);
		expect(referenceKey(createSkinConfig({ ...config, seed: config.seed + 1 }))).not.toBe(key);
		expect(referenceKey(createSkinConfig(config, { timestep: 0.005 }))).not.toBe(key);
	});
});

describe('signed no-flux Heun solver', () => {
	it('preserves a nonzero uniform equilibrium for every supported mask', () => {
		for (const shape of ['straight', 'tapered'] as const) {
			for (let widthPercent = WIDTH_MIN; widthPercent <= WIDTH_MAX; widthPercent += WIDTH_STEP) {
				const config = createSkinConfig({
					...DEFAULT_SETTINGS,
					shape,
					widthPercent,
					appearance: 'spots'
				});
				const equilibrium = solveUniformEquilibrium(config.patternBalance);
				const mask = createDomain(config).mask;
				const u = Float64Array.from(mask, (active) => (active ? equilibrium : 999));
				const v = Float64Array.from(mask, (active) => (active ? equilibrium : -999));
				const solver = new SkinSolver(config, { u, v });
				solver.step(10);
				const actual = solver.snapshot();
				for (let i = 0; i < mask.length; i++) {
					if (
						mask[i] &&
						(Math.abs(actual.u[i] - equilibrium) > 1e-12 ||
							Math.abs(actual.v[i] - equilibrium) > 1e-12)
					) {
						throw new Error(
							`Uniform equilibrium drifted at ${shape} ${widthPercent}% in cell ${i}.`
						);
					}
				}
			}
		}
	});

	it('conserves the active sum and reduces spatial variation with the reaction term removed', () => {
		for (const preset of Object.values(SHAPE_PRESETS)) {
			const config = createSkinConfig({ ...DEFAULT_SETTINGS, ...preset });
			const { mask, nx, ny, gridSpacing } = createDomain(config);
			const input = Float64Array.from(mask, (active, i) => (active ? Math.cos(i * 0.9) : 999));
			const combined = new Float64Array(mask.length);
			const reaction = new Float64Array(mask.length);
			const scratch = new Float64Array(mask.length);
			// Isolate the diffusion term from the exact RHS used by the solver.
			evaluateRightHandSide(input, input, mask, nx, ny, gridSpacing, 0, 9, 9, combined, scratch);
			evaluateRightHandSide(input, input, mask, nx, ny, gridSpacing, 0, 0, 0, reaction, scratch);
			let originalSum = 0;
			let diffusedSum = 0;
			let originalSquareSum = 0;
			let diffusedSquareSum = 0;
			for (let i = 0; i < mask.length; i++) {
				if (!mask[i]) continue;
				const after = input[i] + 0.01 * (combined[i] - reaction[i]);
				originalSum += input[i];
				diffusedSum += after;
				originalSquareSum += input[i] ** 2;
				diffusedSquareSum += after ** 2;
			}
			expect(diffusedSum).toBeCloseTo(originalSum, 10);
			// With the same sum and active area, the second moment orders the variances.
			expect(diffusedSquareSum).toBeLessThan(originalSquareSum);
		}
	});

	it('reproduces the same completed result through replay-sized step batches', () => {
		const config = createSkinConfig(DEFAULT_SETTINGS);
		const direct = solveSkin(config);
		const replay = new SkinSolver(config);
		while (replay.stepIndex < replay.totalSteps) replay.step(139);
		const result = replay.snapshot();
		expect(result.modelTime).toBe(OBSERVATION_TIME);
		expect(result.u).toEqual(direct.u);
		expect(result.v).toEqual(direct.v);
	}, 10000);

	it('rejects invalid settings and surfaces non-finite fields as explicit failures', () => {
		expect(() => createSkinConfig({ ...DEFAULT_SETTINGS, widthPercent: Infinity })).toThrow();
		expect(() => createSkinConfig({ ...DEFAULT_SETTINGS, seed: NaN })).toThrow();
		expect(() =>
			createSkinConfig(DEFAULT_SETTINGS, { gridSpacing: 0.4, timestep: 0.01 })
		).toThrow();
		const config = createSkinConfig(DEFAULT_SETTINGS);
		const domain = createDomain(config);
		const fields = initialSkinFields(config, domain);
		fields.u[domain.mask.indexOf(1)] = NaN;
		const solver = new SkinSolver(config, fields);
		expect(() => solver.step(1)).toThrow(/numerical bounds/);
		expect(() => solver.snapshot()).toThrow(/calculation failed/);
	});
});

function affineReference(): SkinSnapshot {
	const config = createReferenceConfig(createSkinConfig(DEFAULT_SETTINGS));
	const domain = createDomain(config);
	const { nx, ny, gridSpacing } = domain;
	const u = new Float64Array(nx * ny);
	const v = new Float64Array(nx * ny);
	for (let i = 0; i < u.length; i++) {
		const x = ((i % nx) + 0.5) * gridSpacing;
		const y = (Math.floor(i / nx) + 0.5 - ny / 2) * gridSpacing;
		u[i] = 0.02 * x + 0.03 * y;
		v[i] = -0.04 * x + 0.01 * y;
	}
	return { config, domain, u, v, modelTime: config.observationTime };
}

describe('fit a completed scalar field', () => {
	it('is the exact identity at reference geometry and returns independent buffers', () => {
		const reference = affineReference();
		const fitted = fitReference(reference, reference.domain);
		expect(fitted.u).toEqual(reference.u);
		expect(fitted.v).toEqual(reference.v);
		const source = reference.u[0];
		fitted.u[0] = 999;
		expect(reference.u[0]).toBe(source);
	});

	it('maps straight and tapered geometry analytically without evolving or mutating the source', () => {
		const reference = affineReference();
		const beforeU = reference.u.slice();
		const beforeV = reference.v.slice();
		for (const preset of [SHAPE_PRESETS.narrow, SHAPE_PRESETS.tapered]) {
			const target: SkinDomain = createDomain(createSkinConfig({ ...DEFAULT_SETTINGS, ...preset }));
			const fitted = fitReference(reference, target);
			const { nx, ny, gridSpacing, mask, columnWidths, referenceWidth } = target;
			for (let i = 0; i < mask.length; i++) {
				if (!mask[i]) continue;
				const column = i % nx;
				const x = (column + 0.5) * gridSpacing;
				const targetY = (Math.floor(i / nx) + 0.5 - ny / 2) * gridSpacing;
				const sourceY = (targetY * referenceWidth) / columnWidths[column];
				const expectedU = 0.02 * x + 0.03 * sourceY;
				const expectedV = -0.04 * x + 0.01 * sourceY;
				if (
					Math.abs(fitted.u[i] - expectedU) > 1e-12 ||
					Math.abs(fitted.v[i] - expectedV) > 1e-12
				) {
					throw new Error(`Fitting altered the expected affine samples in cell ${i}.`);
				}
			}
		}
		expect(reference.u).toEqual(beforeU);
		expect(reference.v).toEqual(beforeV);
		expect(() => fitReference({ ...reference, modelTime: 0 }, reference.domain)).toThrow(
			/completed broad/
		);
	});
});

it('renders the identity pair identically in every display mode without changing either field', () => {
	const reference = affineReference();
	const fitted = fitReference(reference, reference.domain);
	const beforeU = reference.u.slice();
	const beforeV = reference.v.slice();
	const images = (['pigment', 'activator', 'inhibitor'] as const).map((mode) => {
		const image = renderSkinField(reference, reference.domain, mode, 1);
		expect(renderSkinField(fitted, reference.domain, mode, 1)).toEqual(image);
		return image;
	});
	expect(images[0]).not.toEqual(images[1]);
	expect(images[1]).not.toEqual(images[2]);
	// Compare all arrays after changing views, including the separate fitted buffers.
	expect(reference.u).toEqual(beforeU);
	expect(reference.v).toEqual(beforeV);
	expect(fitted.u).toEqual(beforeU);
	expect(fitted.v).toEqual(beforeV);
});
