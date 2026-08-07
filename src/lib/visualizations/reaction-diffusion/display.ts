import { gridSpacing } from './constants';
import { assertValidFieldState } from './initial';
import { assertValidSetup } from './setup';
import { fivePointLaplacianAtUnchecked } from './stencil';
import type { DisplayMode, FieldState, GrayScottSetup, PaletteId } from './types';

export const REACTION_DIFFUSION_DISPLAY_CONTRACT_VERSION = 'rd-display-v1' as const;
export const DEFAULT_REACTION_DIFFUSION_DIAGNOSTIC_SCALE = 12;

export interface DisplayModeMetadata {
	readonly label: string;
	readonly quantity: string;
	readonly signed: boolean;
	readonly description: string;
	readonly mapping: string;
}

export const DISPLAY_MODE_METADATA: Readonly<Record<DisplayMode, DisplayModeMetadata>> =
	Object.freeze({
		v: {
			label: 'V concentration',
			quantity: 'v',
			signed: false,
			description: 'Dimensionless autocatalytic-chemical concentration.',
			mapping: 'clamp(2v, 0, 1)'
		},
		u: {
			label: 'U concentration',
			quantity: 'u',
			signed: false,
			description: 'Dimensionless feed-chemical concentration.',
			mapping: 'clamp(u, 0, 1)'
		},
		composite: {
			label: 'U–V composite',
			quantity: '(u, v)',
			signed: false,
			description: 'A display-only RGB composite of both concentration fields.',
			mapping: 'RGB = clamp((u, 0.62u + 1.35v, 2v), 0, 1); palette-independent'
		},
		'u-minus-v': {
			label: 'Concentration difference',
			quantity: 'u − v',
			signed: true,
			description: 'The signed difference between the two concentration fields.',
			mapping: 'clamp(0.5 + 0.5(u − v), 0, 1); forced diverging palette'
		},
		'reaction-rate': {
			label: 'Autocatalytic reaction rate',
			quantity: 'uv²',
			signed: false,
			description: 'The local U consumption and V production term.',
			mapping: 'clamp(scale × uv², 0, 1)'
		},
		'v-diffusion': {
			label: 'V diffusion contribution',
			quantity: 'Dᵥ∇²v',
			signed: true,
			description: 'The signed diffusion contribution to ∂v/∂t.',
			mapping: 'clamp(0.5 + scale × Dᵥ∇²v, 0, 1); forced diverging palette'
		},
		'v-derivative': {
			label: 'Total V derivative',
			quantity: '∂v/∂t',
			signed: true,
			description: 'Diffusion, autocatalytic production, feed removal, and kill removal combined.',
			mapping: 'clamp(0.5 + scale × ∂v/∂t, 0, 1); forced diverging palette'
		}
	});

export const DISPLAY_MODE_INDEX: Readonly<Record<DisplayMode, number>> = Object.freeze({
	v: 0,
	u: 1,
	composite: 2,
	'u-minus-v': 3,
	'reaction-rate': 4,
	'v-diffusion': 5,
	'v-derivative': 6
});

export const PALETTE_INDEX: Readonly<Record<PaletteId, number>> = Object.freeze({
	mineral: 0,
	cividis: 1,
	'high-contrast': 2,
	diverging: 3
});

export const SIGNED_DISPLAY_MODES: ReadonlySet<DisplayMode> = new Set<DisplayMode>([
	'u-minus-v',
	'v-diffusion',
	'v-derivative'
]);

export interface ReactionDiffusionRenderOptions {
	readonly mode: DisplayMode;
	readonly palette: PaletteId;
	/** Display scaling only. This never changes solver state. */
	readonly diagnosticScale?: number;
}

export interface ReactionDiffusionCanvasRenderOptions extends ReactionDiffusionRenderOptions {
	readonly width?: number;
	readonly height?: number;
}

export type RgbaBytes = readonly [red: number, green: number, blue: number, alpha: 255];
type Rgb = readonly [red: number, green: number, blue: number];

function rgb(red: number, green: number, blue: number): Rgb {
	return [red / 255, green / 255, blue / 255];
}

// Palette anchors are canonical 8-bit sRGB values. GLSL divides the same anchors by 255.
const MINERAL_LOW = rgb(9, 14, 17);
const MINERAL_MIDDLE = rgb(71, 56, 33);
const MINERAL_HIGH = rgb(232, 224, 184);
const CIVIDIS_LOW = rgb(0, 32, 77);
const CIVIDIS_MIDDLE = rgb(99, 107, 110);
const CIVIDIS_HIGH = rgb(254, 232, 55);
const HIGH_CONTRAST_MIDDLE = rgb(0, 184, 224);
const HIGH_CONTRAST_HIGH = rgb(255, 245, 0);
const DIVERGING_LOW = rgb(31, 82, 184);
const DIVERGING_MIDDLE = rgb(232, 230, 214);
const DIVERGING_HIGH = rgb(184, 41, 26);
const OBSTACLE_DARK = rgb(20, 23, 26);
const OBSTACLE_LIGHT = rgb(36, 38, 41);
const NUMERICAL_FAILURE = rgb(255, 0, 255);

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function mixRgb(low: Rgb, high: Rgb, amount: number): Rgb {
	return [
		low[0] + (high[0] - low[0]) * amount,
		low[1] + (high[1] - low[1]) * amount,
		low[2] + (high[2] - low[2]) * amount
	];
}

function rgbBytes(colour: Rgb): RgbaBytes {
	return [
		Math.round(clamp01(colour[0]) * 255),
		Math.round(clamp01(colour[1]) * 255),
		Math.round(clamp01(colour[2]) * 255),
		255
	];
}

function mineral(value: number): Rgb {
	return value < 0.48
		? mixRgb(MINERAL_LOW, MINERAL_MIDDLE, value / 0.48)
		: mixRgb(MINERAL_MIDDLE, MINERAL_HIGH, (value - 0.48) / 0.52);
}

function cividis(value: number): Rgb {
	return value < 0.5
		? mixRgb(CIVIDIS_LOW, CIVIDIS_MIDDLE, value * 2)
		: mixRgb(CIVIDIS_MIDDLE, CIVIDIS_HIGH, value * 2 - 1);
}

function highContrast(value: number): Rgb {
	return value < 0.5
		? mixRgb([0, 0, 0], HIGH_CONTRAST_MIDDLE, value * 2)
		: mixRgb(HIGH_CONTRAST_MIDDLE, HIGH_CONTRAST_HIGH, value * 2 - 1);
}

function diverging(value: number): Rgb {
	return value < 0.5
		? mixRgb(DIVERGING_LOW, DIVERGING_MIDDLE, value * 2)
		: mixRgb(DIVERGING_MIDDLE, DIVERGING_HIGH, value * 2 - 1);
}

export function normalizeDiagnosticScale(value: number | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? value
		: DEFAULT_REACTION_DIFFUSION_DIAGNOSTIC_SCALE;
}

export function effectivePaletteForMode(mode: DisplayMode, palette: PaletteId): PaletteId {
	return SIGNED_DISPLAY_MODES.has(mode) ? 'diverging' : palette;
}

export function reactionDiffusionPaletteRgba(value: number, palette: PaletteId): RgbaBytes {
	const mapped = clamp01(Number.isFinite(value) ? value : 0);
	if (palette === 'cividis') return rgbBytes(cividis(mapped));
	if (palette === 'high-contrast') return rgbBytes(highContrast(mapped));
	if (palette === 'diverging') return rgbBytes(diverging(mapped));
	return rgbBytes(mineral(mapped));
}

function mappedValueAtUnchecked(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	index: number,
	options: Readonly<ReactionDiffusionRenderOptions>
): number | null {
	const u = state.u[index];
	const v = state.v[index];
	if (!Number.isFinite(u) || !Number.isFinite(v)) return Number.NaN;
	if (options.mode === 'composite') return null;
	if (options.mode === 'v') return clamp01(2 * v);
	if (options.mode === 'u') return clamp01(u);
	if (options.mode === 'u-minus-v') return clamp01(0.5 + 0.5 * (u - v));
	const scale = normalizeDiagnosticScale(options.diagnosticScale);
	const reaction = u * v * v;
	if (options.mode === 'reaction-rate') return clamp01(scale * reaction);
	const row = Math.floor(index / state.size);
	const column = index - row * state.size;
	const spacing = gridSpacing({ domainWidth: setup.domainWidth, gridSize: state.size });
	const laplacianV = fivePointLaplacianAtUnchecked(
		state.v,
		state.mask,
		state.size,
		row,
		column,
		setup.boundary,
		spacing,
		0
	);
	const diffusionV = setup.diffusionV * laplacianV;
	if (options.mode === 'v-diffusion') return clamp01(0.5 + scale * diffusionV);
	const derivativeV = diffusionV + reaction - (setup.feed + setup.kill) * v;
	return clamp01(0.5 + scale * derivativeV);
}

function rgbaAtUnchecked(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	index: number,
	options: Readonly<ReactionDiffusionRenderOptions>
): RgbaBytes {
	const row = Math.floor(index / state.size);
	const column = index - row * state.size;
	if (!state.mask[index]) {
		const hatch = (Math.floor(column / 2) + Math.floor(row / 2)) % 2;
		return rgbBytes(hatch === 0 ? OBSTACLE_DARK : OBSTACLE_LIGHT);
	}
	const u = state.u[index];
	const v = state.v[index];
	if (!Number.isFinite(u) || !Number.isFinite(v)) return rgbBytes(NUMERICAL_FAILURE);
	if (options.mode === 'composite') {
		return rgbBytes([clamp01(u), clamp01(0.62 * u + 1.35 * v), clamp01(2 * v)]);
	}
	const value = mappedValueAtUnchecked(state, setup, index, options);
	if (value === null || !Number.isFinite(value)) return rgbBytes(NUMERICAL_FAILURE);
	return reactionDiffusionPaletteRgba(
		value,
		effectivePaletteForMode(options.mode, options.palette)
	);
}

function validateDisplayInput(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	index?: number
): void {
	assertValidFieldState(state);
	assertValidSetup(setup);
	if (
		index !== undefined &&
		(!Number.isSafeInteger(index) || index < 0 || index >= state.u.length)
	) {
		throw new RangeError('Display sample index lies outside the field.');
	}
}

export function reactionDiffusionMappedValueAt(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	index: number,
	options: Readonly<ReactionDiffusionRenderOptions>
): number | null {
	validateDisplayInput(state, setup, index);
	return mappedValueAtUnchecked(state, setup, index, options);
}

export function reactionDiffusionDisplayRgbaAt(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	index: number,
	options: Readonly<ReactionDiffusionRenderOptions>
): RgbaBytes {
	validateDisplayInput(state, setup, index);
	return rgbaAtUnchecked(state, setup, index, options);
}

export interface ReactionDiffusionPixelBuffer {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8ClampedArray;
}

export interface ResampledSpectrumInput {
	readonly field: Float64Array;
	readonly mask: Uint8Array;
}

interface AxisOverlap {
	readonly sourceIndex: number;
	readonly weight: number;
}

function spectrumResamplingDimension(value: number, name: string): number {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new RangeError(`${name} must be a positive integer.`);
	}
	return value;
}

function spectrumAxisOverlaps(sourceSize: number, targetSize: number): AxisOverlap[][] {
	return Array.from({ length: targetSize }, (_, targetIndex) => {
		const start = (targetIndex * sourceSize) / targetSize;
		const end = ((targetIndex + 1) * sourceSize) / targetSize;
		const firstSourceIndex = Math.floor(start);
		const lastSourceIndex = Math.min(sourceSize - 1, Math.ceil(end) - 1);
		const overlaps: AxisOverlap[] = [];
		for (let sourceIndex = firstSourceIndex; sourceIndex <= lastSourceIndex; sourceIndex += 1) {
			const weight = Math.min(end, sourceIndex + 1) - Math.max(start, sourceIndex);
			if (weight > 0) overlaps.push({ sourceIndex, weight });
		}
		return overlaps;
	});
}

/**
 * Conservatively restricts a cell-centred field to a smaller FFT grid.
 *
 * Each target value is the exact source-cell overlap average over active source
 * area. A target mask cell is active iff it has positive active-area support;
 * unsupported cells are represented deterministically as field 0, mask 0.
 */
export function resampleSpectrumInput(
	field: Float64Array,
	mask: Uint8Array,
	sourceSize: number,
	targetSize: number
): ResampledSpectrumInput {
	const validatedSourceSize = spectrumResamplingDimension(sourceSize, 'Spectrum source size');
	const validatedTargetSize = spectrumResamplingDimension(targetSize, 'Spectrum target size');
	if (validatedTargetSize > validatedSourceSize) {
		throw new RangeError('Spectrum resampling only supports conservative grid reduction.');
	}
	if (field.length !== validatedSourceSize * validatedSourceSize || mask.length !== field.length) {
		throw new RangeError('Spectrum field and mask must match the declared square source grid.');
	}
	if (validatedSourceSize === validatedTargetSize) {
		for (let index = 0; index < field.length; index += 1) {
			if (mask[index] && !Number.isFinite(field[index])) {
				throw new RangeError('Spectrum requires finite values in active source cells.');
			}
		}
		return { field: field.slice(), mask: mask.slice() };
	}

	const outputField = new Float64Array(validatedTargetSize * validatedTargetSize);
	const outputMask = new Uint8Array(outputField.length);
	const axisOverlaps = spectrumAxisOverlaps(validatedSourceSize, validatedTargetSize);
	for (let targetRow = 0; targetRow < validatedTargetSize; targetRow += 1) {
		for (let targetColumn = 0; targetColumn < validatedTargetSize; targetColumn += 1) {
			let weightedSum = 0;
			let activeArea = 0;
			for (const rowOverlap of axisOverlaps[targetRow]) {
				for (const columnOverlap of axisOverlaps[targetColumn]) {
					const sourceIndex =
						rowOverlap.sourceIndex * validatedSourceSize + columnOverlap.sourceIndex;
					if (!mask[sourceIndex]) continue;
					const value = field[sourceIndex];
					if (!Number.isFinite(value)) {
						throw new RangeError('Spectrum requires finite values in active source cells.');
					}
					const overlapArea = rowOverlap.weight * columnOverlap.weight;
					weightedSum += value * overlapArea;
					activeArea += overlapArea;
				}
			}
			if (activeArea === 0) continue;
			const outputIndex = targetRow * validatedTargetSize + targetColumn;
			const average = weightedSum / activeArea;
			outputField[outputIndex] = average === 0 ? 0 : average;
			outputMask[outputIndex] = 1;
		}
	}
	return { field: outputField, mask: outputMask };
}

function outputDimension(value: number | undefined, fallback: number, name: string): number {
	const dimension = value ?? fallback;
	if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > 8_192) {
		throw new RangeError(`${name} must be an integer from 1 to 8192.`);
	}
	return dimension;
}

/** Deterministic nearest-cell RGBA rendering, independent of browser scaling and active engine. */
export function renderReactionDiffusionPixelBuffer(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	options: Readonly<ReactionDiffusionCanvasRenderOptions>
): ReactionDiffusionPixelBuffer {
	validateDisplayInput(state, setup);
	const width = outputDimension(options.width, state.size, 'Display width');
	const height = outputDimension(options.height, state.size, 'Display height');
	if (width * height > 67_108_864) throw new RangeError('Display output exceeds the pixel budget.');
	const data = new Uint8ClampedArray(width * height * 4);
	for (let outputRow = 0; outputRow < height; outputRow += 1) {
		const sourceRow = Math.min(state.size - 1, Math.floor((outputRow * state.size) / height));
		for (let outputColumn = 0; outputColumn < width; outputColumn += 1) {
			const sourceColumn = Math.min(
				state.size - 1,
				Math.floor((outputColumn * state.size) / width)
			);
			const colour = rgbaAtUnchecked(state, setup, sourceRow * state.size + sourceColumn, options);
			const offset = (outputRow * width + outputColumn) * 4;
			data[offset] = colour[0];
			data[offset + 1] = colour[1];
			data[offset + 2] = colour[2];
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
}

export type ReactionDiffusionCanvas = HTMLCanvasElement | OffscreenCanvas;

export function renderReactionDiffusionToCanvas<Canvas extends ReactionDiffusionCanvas>(
	canvas: Canvas,
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	options: Readonly<ReactionDiffusionCanvasRenderOptions>
): Canvas {
	const pixels = renderReactionDiffusionPixelBuffer(state, setup, options);
	canvas.width = pixels.width;
	canvas.height = pixels.height;
	const context = canvas.getContext('2d', { alpha: false }) as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
	if (!context) throw new Error('The browser could not create a 2D reaction–diffusion canvas.');
	const image = context.createImageData(pixels.width, pixels.height);
	image.data.set(pixels.data);
	context.putImageData(image, 0, 0);
	return canvas;
}

/** Browser convenience for PNG export; callers retain ownership of encoding and download. */
export function createReactionDiffusionExportCanvas(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	options: Readonly<ReactionDiffusionCanvasRenderOptions>
): HTMLCanvasElement {
	if (typeof document === 'undefined') {
		throw new Error('Reaction–diffusion export canvas creation requires a browser document.');
	}
	return renderReactionDiffusionToCanvas(document.createElement('canvas'), state, setup, options);
}
