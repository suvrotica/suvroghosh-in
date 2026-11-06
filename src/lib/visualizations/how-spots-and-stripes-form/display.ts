import { FIXED_SIGNAL_SCALE_LIMIT } from './presets.ts';
import type { SimulationSnapshot, ViewMode } from './types.ts';

export const SIGNAL_COLOR_STOPS: readonly (readonly [number, number, number])[] = [
	[18, 32, 52], // -1.0: deep slate-navy (#122034)
	[45, 72, 102], // -0.5: steel blue (#2D4866)
	[106, 114, 120], //  0.0: neutral stone (#6A7278)
	[217, 134, 59], // +0.5: warm copper-ochre (#D9863B)
	[246, 232, 198] // +1.0: bright ivory-amber (#F6E8C6)
];

export const PIGMENT_HIGH_RGB: readonly [number, number, number] = [236, 179, 101]; // #ECB365
export const PIGMENT_LOW_RGB: readonly [number, number, number] = [26, 33, 38]; // #1A2126
export const MASK_OUTSIDE_RGB: readonly [number, number, number] = [16, 20, 22]; // #101416
export const MASK_BORDER_RGB: readonly [number, number, number] = [68, 79, 85]; // #444F55

export function sampleSignedSignalColor(
	value: number,
	scaleLimit = FIXED_SIGNAL_SCALE_LIMIT
): [number, number, number] {
	if (!Number.isFinite(value)) {
		return [140, 48, 48];
	}
	const normalized = Math.max(-1, Math.min(1, value / scaleLimit));
	const t = (normalized + 1) * 0.5 * (SIGNAL_COLOR_STOPS.length - 1);
	const lo = Math.min(SIGNAL_COLOR_STOPS.length - 1, Math.floor(t));
	const hi = Math.min(SIGNAL_COLOR_STOPS.length - 1, lo + 1);
	const frac = t - lo;
	return [
		Math.round(SIGNAL_COLOR_STOPS[lo][0] * (1 - frac) + SIGNAL_COLOR_STOPS[hi][0] * frac),
		Math.round(SIGNAL_COLOR_STOPS[lo][1] * (1 - frac) + SIGNAL_COLOR_STOPS[hi][1] * frac),
		Math.round(SIGNAL_COLOR_STOPS[lo][2] * (1 - frac) + SIGNAL_COLOR_STOPS[hi][2] * frac)
	];
}

export interface RenderFieldOptions {
	viewMode: ViewMode;
	pigmentThreshold?: number;
	scaleLimit?: number;
	target?: Uint8ClampedArray;
}

/**
 * Pure display mapping from simulation arrays (u, v, mask) to an RGBA pixel buffer.
 * Does not mutate any simulation array or state.
 */
export function renderFieldToRgba(
	snapshot: Pick<SimulationSnapshot, 'u' | 'v' | 'mask' | 'nx' | 'ny'>,
	options: RenderFieldOptions
): Uint8ClampedArray {
	const { u, v, mask, nx, ny } = snapshot;
	const total = nx * ny;
	const rgba =
		options.target && options.target.length === total * 4
			? options.target
			: new Uint8ClampedArray(total * 4);
	const threshold = options.pigmentThreshold ?? 0;
	const scaleLimit = options.scaleLimit ?? FIXED_SIGNAL_SCALE_LIMIT;
	const viewMode = options.viewMode;

	for (let y = 0; y < ny; y += 1) {
		for (let x = 0; x < nx; x += 1) {
			const idx = y * nx + x;
			const offset = idx * 4;

			if (!mask[idx]) {
				const touchesDomain =
					(x > 0 && mask[idx - 1] === 1) ||
					(x < nx - 1 && mask[idx + 1] === 1) ||
					(y > 0 && mask[idx - nx] === 1) ||
					(y < ny - 1 && mask[idx + nx] === 1);
				const bg = touchesDomain ? MASK_BORDER_RGB : MASK_OUTSIDE_RGB;
				rgba[offset] = bg[0];
				rgba[offset + 1] = bg[1];
				rgba[offset + 2] = bg[2];
				rgba[offset + 3] = 255;
				continue;
			}

			if (viewMode === 'pigment') {
				const colour = u[idx] >= threshold ? PIGMENT_HIGH_RGB : PIGMENT_LOW_RGB;
				rgba[offset] = colour[0];
				rgba[offset + 1] = colour[1];
				rgba[offset + 2] = colour[2];
				rgba[offset + 3] = 255;
			} else {
				const signal = viewMode === 'activator' ? u[idx] : v[idx];
				const [r, g, b] = sampleSignedSignalColor(signal, scaleLimit);
				rgba[offset] = r;
				rgba[offset + 1] = g;
				rgba[offset + 2] = b;
				rgba[offset + 3] = 255;
			}
		}
	}

	return rgba;
}
