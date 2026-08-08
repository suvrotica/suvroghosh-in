import { computeBZDerivativeTerms } from './solver';
import { schnakenbergEquilibrium } from './reactions';
import { assertValidBZFieldState } from './initial-conditions';
import { assertValidBZSetup } from './validation';
import type { BZFieldState, BZPalette, BZSetup, BZViewMode } from './types';

export const BZ_DISPLAY_CONTRACT_VERSION = 'bz-display-v1' as const;

export interface BZDisplayMetadata {
	readonly label: string;
	readonly quantity: string;
	readonly signed: boolean;
	readonly description: string;
}

export const BZ_VIEW_METADATA: Readonly<Record<BZViewMode, BZDisplayMetadata>> = Object.freeze({
	dish: {
		label: 'Dish composite',
		quantity: '(u, v)',
		signed: false,
		description: 'A display-only colour composite of the two dimensionless fields.'
	},
	u: {
		label: 'Fast field u',
		quantity: 'u',
		signed: false,
		description: 'The activator-like Oregonator field or Schnakenberg u field.'
	},
	v: {
		label: 'Recovery field v',
		quantity: 'v',
		signed: false,
		description: 'The recovery-like Oregonator field or Schnakenberg v field.'
	},
	'reaction-u': {
		label: 'Reaction contribution',
		quantity: 'Rᵤ',
		signed: true,
		description: 'The local reaction contribution to the instantaneous u derivative.'
	},
	'diffusion-u': {
		label: 'Diffusion contribution',
		quantity: 'Dᵤ∇²u',
		signed: true,
		description: 'The signed five-point diffusion contribution to the u derivative.'
	},
	'net-u': {
		label: 'Net u derivative',
		quantity: '∂u/∂t',
		signed: true,
		description: 'Reaction and diffusion contributions added without display clamping.'
	},
	mask: {
		label: 'Physical mask',
		quantity: 'M',
		signed: false,
		description: 'Active chemistry, impermeable obstacles, and the exterior of the dish.'
	},
	'difference-from-mean': {
		label: 'u minus active-area mean',
		quantity: 'u − ū',
		signed: true,
		description: 'A signed view of spatial structure relative to the current active-area mean.'
	}
});

export interface BZRenderOptions {
	readonly view: BZViewMode;
	readonly palette: BZPalette;
	readonly width?: number;
	readonly height?: number;
	/** Display-only multiplier for signed derivative views. */
	readonly diagnosticScale?: number;
}

export interface BZPixelBuffer {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8ClampedArray;
}

type Rgb = readonly [number, number, number];

const OUTSIDE: Rgb = [8, 10, 13];
const OBSTACLE_A: Rgb = [34, 37, 39];
const OBSTACLE_B: Rgb = [48, 50, 51];
const FAILURE: Rgb = [255, 0, 255];

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function mix(low: Rgb, high: Rgb, amount: number): Rgb {
	const t = clamp01(amount);
	return [
		Math.round(low[0] + (high[0] - low[0]) * t),
		Math.round(low[1] + (high[1] - low[1]) * t),
		Math.round(low[2] + (high[2] - low[2]) * t)
	];
}

function threeStop(low: Rgb, middle: Rgb, high: Rgb, value: number): Rgb {
	return value < 0.5 ? mix(low, middle, value * 2) : mix(middle, high, value * 2 - 1);
}

function hueToRgb(hue: number): Rgb {
	const h = ((hue % 1) + 1) % 1;
	const channel = (offset: number) => {
		const k = (offset + h * 6) % 6;
		return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
	};
	return [channel(5), channel(3), channel(1)];
}

export function bzPaletteRgba(
	value: number,
	palette: BZPalette
): readonly [number, number, number, 255] {
	const t = clamp01(Number.isFinite(value) ? value : 0);
	let colour: Rgb;
	if (palette === 'cerium') {
		colour = threeStop([20, 16, 13], [121, 55, 31], [255, 226, 102], t);
	} else if (palette === 'phase-spectrum') {
		colour = mix([8, 10, 18], hueToRgb(0.68 - 0.82 * t), 0.82);
	} else if (palette === 'scientific') {
		colour = threeStop([0, 35, 70], [92, 111, 109], [253, 231, 71], t);
	} else if (palette === 'high-contrast') {
		colour = threeStop([0, 0, 0], [0, 196, 224], [255, 250, 230], t);
	} else {
		colour = threeStop([18, 9, 16], [117, 31, 48], [238, 199, 105], t);
	}
	return [colour[0], colour[1], colour[2], 255];
}

function signedColour(value: number): Rgb {
	return threeStop([35, 89, 173], [229, 226, 211], [183, 45, 42], clamp01(value));
}

function finiteRange(
	values: Float64Array,
	mask: Uint8Array
): { minimum: number; maximum: number; mean: number } {
	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	let sum = 0;
	let count = 0;
	for (let index = 0; index < values.length; index += 1) {
		if (!mask[index]) continue;
		const value = values[index];
		if (!Number.isFinite(value)) continue;
		minimum = Math.min(minimum, value);
		maximum = Math.max(maximum, value);
		sum += value;
		count += 1;
	}
	return count === 0
		? { minimum: 0, maximum: 1, mean: 0 }
		: { minimum, maximum, mean: sum / count };
}

function normalise(value: number, minimum: number, maximum: number): number {
	const range = maximum - minimum;
	return range > 1e-14 ? clamp01((value - minimum) / range) : 0.5;
}

function outputDimension(value: number | undefined, fallback: number, name: string): number {
	const dimension = value ?? fallback;
	if (!Number.isSafeInteger(dimension) || dimension < 1 || dimension > 8192) {
		throw new RangeError(`${name} must be an integer from 1 to 8192.`);
	}
	return dimension;
}

/**
 * Deterministic nearest-cell rendering used by the CPU fallback, PNG export,
 * solver-generated article plates, and GPU/CPU display-contract tests.
 */
export function renderBZPixelBuffer(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	options: Readonly<BZRenderOptions>
): BZPixelBuffer {
	assertValidBZFieldState(state);
	assertValidBZSetup(setup);
	if (state.size !== setup.gridSize) throw new RangeError('Field and BZ setup grid sizes differ.');
	const width = outputDimension(options.width, state.size, 'Display width');
	const height = outputDimension(options.height, state.size, 'Display height');
	if (width * height > 67_108_864) throw new RangeError('Display output exceeds the pixel budget.');

	const uRange = finiteRange(state.u, state.mask);
	const vRange = finiteRange(state.v, state.mask);
	const derivative = ['reaction-u', 'diffusion-u', 'net-u'].includes(options.view)
		? computeBZDerivativeTerms(state, setup)
		: null;
	const signedField =
		options.view === 'reaction-u'
			? derivative?.reactionU
			: options.view === 'diffusion-u'
				? derivative?.diffusionU
				: options.view === 'net-u'
					? derivative?.totalU
					: null;
	let signedExtent = 1;
	if (signedField) {
		for (let index = 0; index < signedField.length; index += 1) {
			if (state.mask[index] && Number.isFinite(signedField[index])) {
				signedExtent = Math.max(signedExtent, Math.abs(signedField[index]));
			}
		}
	}
	const diagnosticScale =
		typeof options.diagnosticScale === 'number' && Number.isFinite(options.diagnosticScale)
			? Math.max(1e-6, options.diagnosticScale)
			: 1;
	const equilibrium =
		setup.model === 'schnakenberg' ? schnakenbergEquilibrium(setup.parameters) : null;
	const data = new Uint8ClampedArray(width * height * 4);

	for (let outputRow = 0; outputRow < height; outputRow += 1) {
		const sourceRow = Math.min(state.size - 1, Math.floor((outputRow * state.size) / height));
		for (let outputColumn = 0; outputColumn < width; outputColumn += 1) {
			const sourceColumn = Math.min(
				state.size - 1,
				Math.floor((outputColumn * state.size) / width)
			);
			const index = sourceRow * state.size + sourceColumn;
			let colour: Rgb;
			if (!state.domainMask[index]) {
				colour = OUTSIDE;
			} else if (!state.mask[index]) {
				colour =
					(Math.floor(sourceRow / 2) + Math.floor(sourceColumn / 2)) % 2 === 0
						? OBSTACLE_A
						: OBSTACLE_B;
			} else if (!Number.isFinite(state.u[index]) || !Number.isFinite(state.v[index])) {
				colour = FAILURE;
			} else if (options.view === 'mask') {
				colour = [229, 226, 211];
			} else if (options.view === 'difference-from-mean') {
				const extent = Math.max(1e-12, uRange.maximum - uRange.minimum);
				colour = signedColour(0.5 + (state.u[index] - uRange.mean) / extent);
			} else if (signedField) {
				colour = signedColour(0.5 + (0.5 * diagnosticScale * signedField[index]) / signedExtent);
			} else if (options.view === 'u') {
				const rgba = bzPaletteRgba(
					normalise(state.u[index], uRange.minimum, uRange.maximum),
					options.palette
				);
				colour = [rgba[0], rgba[1], rgba[2]];
			} else if (options.view === 'v') {
				const rgba = bzPaletteRgba(
					normalise(state.v[index], vRange.minimum, vRange.maximum),
					options.palette
				);
				colour = [rgba[0], rgba[1], rgba[2]];
			} else {
				const u = normalise(state.u[index], uRange.minimum, uRange.maximum);
				const v = normalise(state.v[index], vRange.minimum, vRange.maximum);
				if (options.palette === 'phase-spectrum') {
					const centreU = equilibrium?.u ?? uRange.mean;
					const centreV = equilibrium?.v ?? vRange.mean;
					const phase =
						Math.atan2(state.v[index] - centreV, state.u[index] - centreU) / (2 * Math.PI) + 0.5;
					colour = mix([7, 9, 15], hueToRgb(phase), 0.72 + 0.24 * u);
				} else {
					const value = clamp01(0.72 * u + 0.28 * (1 - v));
					const rgba = bzPaletteRgba(value, options.palette);
					colour = [rgba[0], rgba[1], rgba[2]];
				}
			}
			const offset = (outputRow * width + outputColumn) * 4;
			data[offset] = colour[0];
			data[offset + 1] = colour[1];
			data[offset + 2] = colour[2];
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
}

export type BZCanvas = HTMLCanvasElement | OffscreenCanvas;

export function renderBZToCanvas<Canvas extends BZCanvas>(
	canvas: Canvas,
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	options: Readonly<BZRenderOptions>
): Canvas {
	const pixels = renderBZPixelBuffer(state, setup, options);
	canvas.width = pixels.width;
	canvas.height = pixels.height;
	const context = canvas.getContext('2d', { alpha: false }) as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
	if (!context) throw new Error('The browser could not create a 2D BZ display canvas.');
	const image = context.createImageData(pixels.width, pixels.height);
	image.data.set(pixels.data);
	context.putImageData(image, 0, 0);
	return canvas;
}

export function createBZExportCanvas(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	options: Readonly<BZRenderOptions>
): HTMLCanvasElement {
	if (typeof document === 'undefined')
		throw new Error('BZ PNG export requires a browser document.');
	return renderBZToCanvas(document.createElement('canvas'), state, setup, options);
}
