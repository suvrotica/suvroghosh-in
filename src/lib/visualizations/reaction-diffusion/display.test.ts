import { describe, expect, it } from 'vitest';
import {
	DEFAULT_REACTION_DIFFUSION_DIAGNOSTIC_SCALE,
	DISPLAY_MODE_INDEX,
	DISPLAY_MODE_METADATA,
	PALETTE_INDEX,
	REACTION_DIFFUSION_DISPLAY_CONTRACT_VERSION,
	effectivePaletteForMode,
	reactionDiffusionDisplayRgbaAt,
	reactionDiffusionMappedValueAt,
	reactionDiffusionPaletteRgba,
	renderReactionDiffusionPixelBuffer,
	renderReactionDiffusionToCanvas,
	resampleSpectrumInput
} from './display';
import { renderFragmentSource } from './gpu/shaders';
import type { DisplayMode, FieldState, GrayScottSetup, PaletteId } from './types';

const MODES = Object.keys(DISPLAY_MODE_INDEX) as DisplayMode[];
const PALETTES = Object.keys(PALETTE_INDEX) as PaletteId[];

function setup(overrides: Partial<GrayScottSetup> = {}): GrayScottSetup {
	return {
		feed: 0.03,
		kill: 0.05,
		diffusionU: 0.16,
		diffusionV: 0.08,
		timestep: 0.1,
		gridSize: 4,
		domainWidth: 4,
		boundary: 'periodic',
		maskPreset: 'open-square',
		initialCondition: 'blank-feed',
		seed: 'display-contract',
		integrator: 'heun',
		...overrides
	};
}

function uniformField(size = 4, u = 0.6, v = 0.2): FieldState {
	return {
		size,
		u: new Float64Array(size * size).fill(u),
		v: new Float64Array(size * size).fill(v),
		mask: new Uint8Array(size * size).fill(1)
	};
}

describe('rd-display-v1 scalar and palette contract', () => {
	it('documents and indexes every DisplayMode and PaletteId exactly once', () => {
		expect(REACTION_DIFFUSION_DISPLAY_CONTRACT_VERSION).toBe('rd-display-v1');
		expect(MODES).toHaveLength(7);
		expect(PALETTES).toHaveLength(4);
		expect(Object.keys(DISPLAY_MODE_METADATA).sort()).toEqual([...MODES].sort());
		expect(new Set(Object.values(DISPLAY_MODE_INDEX)).size).toBe(MODES.length);
		expect(new Set(Object.values(PALETTE_INDEX)).size).toBe(PALETTES.length);
	});

	it('maps all seven field quantities with the documented common diagnostic scale', () => {
		const state = uniformField();
		const model = setup();
		const value = (mode: DisplayMode) =>
			reactionDiffusionMappedValueAt(state, model, 5, { mode, palette: 'mineral' });

		expect(DEFAULT_REACTION_DIFFUSION_DIAGNOSTIC_SCALE).toBe(12);
		expect(value('v')).toBeCloseTo(0.4, 15);
		expect(value('u')).toBeCloseTo(0.6, 15);
		expect(value('composite')).toBeNull();
		expect(value('u-minus-v')).toBeCloseTo(0.7, 15);
		expect(value('reaction-rate')).toBeCloseTo(0.288, 15);
		expect(value('v-diffusion')).toBeCloseTo(0.5, 15);
		expect(value('v-derivative')).toBeCloseTo(0.596, 15);
	});

	it('uses the exact canonical endpoint colours for all four palettes', () => {
		expect(reactionDiffusionPaletteRgba(0, 'mineral')).toEqual([9, 14, 17, 255]);
		expect(reactionDiffusionPaletteRgba(1, 'mineral')).toEqual([232, 224, 184, 255]);
		expect(reactionDiffusionPaletteRgba(0, 'cividis')).toEqual([0, 32, 77, 255]);
		expect(reactionDiffusionPaletteRgba(1, 'cividis')).toEqual([254, 232, 55, 255]);
		expect(reactionDiffusionPaletteRgba(0, 'high-contrast')).toEqual([0, 0, 0, 255]);
		expect(reactionDiffusionPaletteRgba(1, 'high-contrast')).toEqual([255, 245, 0, 255]);
		expect(reactionDiffusionPaletteRgba(0, 'diverging')).toEqual([31, 82, 184, 255]);
		expect(reactionDiffusionPaletteRgba(1, 'diverging')).toEqual([184, 41, 26, 255]);
	});

	it('defines every mode/palette combination deterministically, including signed and composite rules', () => {
		const state = uniformField();
		const model = setup();
		for (const mode of MODES) {
			const colours = PALETTES.map((palette) =>
				reactionDiffusionDisplayRgbaAt(state, model, 5, { mode, palette })
			);
			for (const colour of colours) {
				expect(colour).toHaveLength(4);
				expect(
					colour.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
				).toBe(true);
			}
			if (DISPLAY_MODE_METADATA[mode].signed || mode === 'composite') {
				expect(colours.every((colour) => colour.join(',') === colours[0].join(','))).toBe(true);
			}
		}
		expect(effectivePaletteForMode('v-diffusion', 'mineral')).toBe('diverging');
		expect(effectivePaletteForMode('reaction-rate', 'cividis')).toBe('cividis');
		expect(
			reactionDiffusionDisplayRgbaAt(state, model, 5, {
				mode: 'composite',
				palette: 'mineral'
			})
		).toEqual([153, 164, 102, 255]);
	});
});

describe('deterministic CPU/Canvas display rendering', () => {
	it('renders row-major orientation, resolution-independent obstacle hatching, and numerical failures', () => {
		const state = uniformField();
		state.mask.fill(0);
		state.mask[5] = 1;
		state.u[5] = Number.NaN;
		const pixels = renderReactionDiffusionPixelBuffer(state, setup(), {
			mode: 'v',
			palette: 'mineral'
		});
		expect([...pixels.data.slice(0, 4)]).toEqual([20, 23, 26, 255]);
		expect([...pixels.data.slice(2 * 4, 3 * 4)]).toEqual([36, 38, 41, 255]);
		expect([...pixels.data.slice(5 * 4, 6 * 4)]).toEqual([255, 0, 255, 255]);
	});

	it('nearest-cell scales deterministically without changing source arrays', () => {
		const state = uniformField(2);
		state.v.set([0, 0.25, 0.5, 0.75]);
		const before = new Float64Array(state.v);
		const first = renderReactionDiffusionPixelBuffer(state, setup({ gridSize: 2 }), {
			mode: 'v',
			palette: 'cividis',
			width: 4,
			height: 4
		});
		const second = renderReactionDiffusionPixelBuffer(state, setup({ gridSize: 2 }), {
			mode: 'v',
			palette: 'cividis',
			width: 4,
			height: 4
		});
		expect(first.data).toEqual(second.data);
		expect([...first.data.slice(0, 4)]).toEqual([...reactionDiffusionPaletteRgba(0, 'cividis')]);
		expect([...first.data.slice((3 * 4 + 3) * 4, (3 * 4 + 4) * 4)]).toEqual([
			...reactionDiffusionPaletteRgba(1, 'cividis')
		]);
		expect(state.v).toEqual(before);
	});

	it('writes the canonical pixels into a supplied 2D canvas target', () => {
		let captured: Uint8ClampedArray | null = null;
		const context = {
			createImageData: (width: number, height: number) => ({
				width,
				height,
				data: new Uint8ClampedArray(width * height * 4)
			}),
			putImageData: (image: { data: Uint8ClampedArray }) => {
				captured = new Uint8ClampedArray(image.data);
			}
		};
		const canvas = {
			width: 0,
			height: 0,
			getContext: () => context
		} as unknown as HTMLCanvasElement;
		const state = uniformField(2);
		renderReactionDiffusionToCanvas(canvas, state, setup({ gridSize: 2 }), {
			mode: 'u',
			palette: 'mineral'
		});
		expect(canvas.width).toBe(2);
		expect(canvas.height).toBe(2);
		expect(captured).toEqual(
			renderReactionDiffusionPixelBuffer(state, setup({ gridSize: 2 }), {
				mode: 'u',
				palette: 'mineral'
			}).data
		);
	});
});

describe('conservative spectrum-grid restriction', () => {
	it('preserves the exact arrays at equal size without aliasing the caller buffers', () => {
		const field = Float64Array.from({ length: 16 }, (_, index) => index / 7);
		const mask = Uint8Array.from({ length: 16 }, (_, index) => (index % 3 === 0 ? 0 : 1));
		const restricted = resampleSpectrumInput(field, mask, 4, 4);

		expect(restricted.field).toEqual(field);
		expect(restricted.mask).toEqual(mask);
		expect(restricted.field).not.toBe(field);
		expect(restricted.mask).not.toBe(mask);
	});

	it('rejects non-finite active values even when no size reduction is needed', () => {
		const field = new Float64Array(16);
		const mask = new Uint8Array(16).fill(1);
		field[7] = Number.NaN;
		expect(() => resampleSpectrumInput(field, mask, 4, 4)).toThrow(/finite values/iu);

		mask[7] = 0;
		expect(resampleSpectrumInput(field, mask, 4, 4).field[7]).toBeNaN();
	});

	it('preserves constants and the domain mean across a non-integer reduction ratio', () => {
		const constant = new Float64Array(25).fill(0.37);
		const mask = new Uint8Array(25).fill(1);
		const constantResult = resampleSpectrumInput(constant, mask, 5, 3);
		expect([...constantResult.field].every((value) => Math.abs(value - 0.37) < 1e-15)).toBe(true);
		expect(constantResult.mask).toEqual(new Uint8Array(9).fill(1));

		const ramp = Float64Array.from({ length: 25 }, (_, index) => index - 6);
		const rampResult = resampleSpectrumInput(ramp, mask, 5, 3);
		const sourceMean = ramp.reduce((sum, value) => sum + value, 0) / ramp.length;
		const restrictedMean =
			rampResult.field.reduce((sum, value) => sum + value, 0) / rampResult.field.length;
		expect(restrictedMean).toBeCloseTo(sourceMean, 13);
	});

	it('averages only active overlap area and represents unsupported cells as exact zero', () => {
		const field = new Float64Array(16).fill(99);
		const mask = new Uint8Array(16);
		field[0] = 2;
		field[1] = 6;
		field[15] = 8;
		mask[0] = 1;
		mask[1] = 1;
		mask[15] = 1;

		const restricted = resampleSpectrumInput(field, mask, 4, 2);
		expect(restricted.field).toEqual(Float64Array.from([4, 0, 0, 8]));
		expect(restricted.mask).toEqual(Uint8Array.from([1, 0, 0, 1]));

		const partialField = new Float64Array(9);
		const partialMask = new Uint8Array(9);
		partialField[4] = 9;
		partialMask[4] = 1;
		const partial = resampleSpectrumInput(partialField, partialMask, 3, 2);
		expect(partial.field).toEqual(new Float64Array(4).fill(9));
		expect(partial.mask).toEqual(new Uint8Array(4).fill(1));
	});
});

describe('GLSL mirror of the canonical display contract', () => {
	it('contains every canonical scalar, palette, signed-mode, obstacle, and orientation rule', () => {
		expect(renderFragmentSource).toContain(REACTION_DIFFUSION_DISPLAY_CONTRACT_VERSION);
		expect(renderFragmentSource).toContain('if (uDisplayMode == 0) mapped = 2.0 * centre.g;');
		expect(renderFragmentSource).toContain('else if (uDisplayMode == 1) mapped = centre.r;');
		expect(renderFragmentSource).toContain(
			'else if (uDisplayMode == 3) mapped = 0.5 + 0.5 * (centre.r - centre.g);'
		);
		expect(renderFragmentSource).toContain(
			'else if (uDisplayMode == 4) mapped = autocatalysis * uDiagnosticScale;'
		);
		expect(renderFragmentSource).toContain(
			'else if (uDisplayMode == 5) mapped = 0.5 + diffusionV * uDiagnosticScale;'
		);
		expect(renderFragmentSource).toContain(
			'bool signedMode = uDisplayMode == 3 || uDisplayMode == 5 || uDisplayMode == 6;'
		);
		expect(renderFragmentSource).toContain('if (uPalette == 1) return cividis(value);');
		expect(renderFragmentSource).toContain('if (uPalette == 2) return highContrast(value);');
		expect(renderFragmentSource).toContain('if (uPalette == 3) return diverging(value);');
		expect(renderFragmentSource).toContain('? vec3(20.0, 23.0, 26.0) / 255.0');
		expect(renderFragmentSource).toContain(': vec3(36.0, 38.0, 41.0) / 255.0;');
		expect(renderFragmentSource).toContain(
			'clamp(uGridSize - 1 - int(floor(vUv.y * float(uGridSize))), 0, uGridSize - 1)'
		);
	});
});
