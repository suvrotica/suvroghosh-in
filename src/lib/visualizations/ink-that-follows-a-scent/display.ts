import type { ChemotaxisRun } from './engine.ts';
import type { ChemicalField } from './field.ts';
import {
	LOGICAL_HEIGHT,
	LOGICAL_WIDTH,
	TRAIL_HEIGHT,
	TRAIL_WIDTH,
	type ChemicalFieldSnapshot,
	type DisplayOptions,
	type RunSnapshot
} from './types.ts';

const BG_R = 10;
const BG_G = 14;
const BG_B = 16;

/**
 * Renders a run's accumulated ink trails, faint moving particle heads, and optional
 * chemical concentration overlay into a reusable RGBA buffer (512 x 384 x 4).
 *
 * Strictly display-only: never modifies particle positions, chemical concentrations,
 * or persistent trail buffers.
 */
export function renderRunToRgba(
	run: ChemotaxisRun | RunSnapshot,
	field: ChemicalField | ChemicalFieldSnapshot,
	options: DisplayOptions = {},
	targetBuffer?: Uint8ClampedArray
): Uint8ClampedArray {
	const width = run.trailWidth || TRAIL_WIDTH;
	const height = run.trailHeight || TRAIL_HEIGHT;
	const out =
		targetBuffer && targetBuffer.length === width * height * 4
			? targetBuffer
			: new Uint8ClampedArray(width * height * 4);

	const showChemical = options.showChemical ?? false;
	const showParticles = options.showParticles ?? true;

	const trails = run.trailBuffer;
	const fieldW = field.width || LOGICAL_WIDTH;
	const fieldH = field.height || LOGICAL_HEIGHT;
	const combinedGrid = field.combinedGrid;

	for (let y = 0; y < height; y += 1) {
		const fy = ((y + 0.5) / height) * fieldH - 0.5;
		const fy0 = Math.max(0, Math.min(fieldH - 1, fy | 0));
		const fy1 = Math.min(fieldH - 1, fy0 + 1);
		const wy = Math.max(0, Math.min(1, fy - fy0));
		const fRow0 = fy0 * fieldW;
		const fRow1 = fy1 * fieldW;
		const tRow = y * width;

		for (let x = 0; x < width; x += 1) {
			const idx = tRow + x;
			const pOffset = idx << 2;

			let r = BG_R;
			let g = BG_G;
			let b = BG_B;

			if (showChemical) {
				const fx = ((x + 0.5) / width) * fieldW - 0.5;
				const fx0 = Math.max(0, Math.min(fieldW - 1, fx | 0));
				const fx1 = Math.min(fieldW - 1, fx0 + 1);
				const wx = Math.max(0, Math.min(1, fx - fx0));

				const c00 = combinedGrid[fRow0 + fx0];
				const c10 = combinedGrid[fRow0 + fx1];
				const c01 = combinedGrid[fRow1 + fx0];
				const c11 = combinedGrid[fRow1 + fx1];

				const top = c00 + (c10 - c00) * wx;
				const bot = c01 + (c11 - c01) * wx;
				const c = Math.max(0, Math.min(1, top + (bot - top) * wy));

				if (c > 0.005) {
					// Fixed [0, 1] scale warm amber-copper concentration wash
					const cShaped = c ** 0.85;
					const chemAlpha = 0.42 * cShaped;

					// Subtle contour lines at C = 0.25, 0.50, 0.75 to reveal gradient slopes
					const d25 = Math.abs(c - 0.25);
					const d50 = Math.abs(c - 0.5);
					const d75 = Math.abs(c - 0.75);
					const contourDist = Math.min(d25, d50, d75);
					const contourBoost = contourDist < 0.011 ? (1 - contourDist / 0.011) * 0.16 : 0;

					const cr = 74 + 181 * cShaped;
					const cg = 48 + 122 * cShaped;
					const cb = 26 + 50 * cShaped;

					const totalAlpha = Math.min(0.56, chemAlpha + contourBoost);
					r = r + (cr - r) * totalAlpha;
					g = g + (cg - g) * totalAlpha;
					b = b + (cb - b) * totalAlpha;
				}
			}

			const rawTrail = trails[idx];
			if (rawTrail > 0.001) {
				// Soft-shoulder exposure keeps dense hubs from turning into harsh white blocks
				const exp = 1 - Math.exp(-3.15 * rawTrail);
				// Warm off-white trail colour (#F0F1EC / #F4EFE6) with restrained amber highlights (#FFAA4C)
				const amberHighlight = exp * (1 - exp) * 1.45;
				const tr = 240 * exp + 255 * amberHighlight * 0.18;
				const tg = 236 * exp + 170 * amberHighlight * 0.14;
				const tb = 224 * exp + 76 * amberHighlight * 0.05;

				const blend = Math.min(0.94, exp * 0.94);
				r = r + (Math.min(244, tr) - r) * blend;
				g = g + (Math.min(239, tg) - g) * blend;
				b = b + (Math.min(228, tb) - b) * blend;
			}

			out[pOffset] = r;
			out[pOffset + 1] = g;
			out[pOffset + 2] = b;
			out[pOffset + 3] = 255;
		}
	}

	if (showParticles) {
		const pxArr = run.px;
		const pyArr = run.py;
		const count = run.particleCount;
		const scaleX = width / LOGICAL_WIDTH;
		const scaleY = height / LOGICAL_HEIGHT;
		// Faint moving particle heads so visitors can distinguish current positions from old marks
		const headAlpha = 0.28;
		const headR = 255;
		const headG = 212;
		const headB = 152;

		for (let i = 0; i < count; i += 1) {
			const hx = (pxArr[i] * scaleX) | 0;
			const hy = (pyArr[i] * scaleY) | 0;
			if (hx < 0 || hx >= width || hy < 0 || hy >= height) continue;
			const pIdx = (hy * width + hx) << 2;
			out[pIdx] = out[pIdx] + (headR - out[pIdx]) * headAlpha;
			out[pIdx + 1] = out[pIdx + 1] + (headG - out[pIdx + 1]) * headAlpha;
			out[pIdx + 2] = out[pIdx + 2] + (headB - out[pIdx + 2]) * headAlpha;
		}
	}

	return out;
}
