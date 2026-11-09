import type { SkinDomain, SkinFields } from './model.ts';

export type SkinViewMode = 'pigment' | 'activator' | 'inhibitor';

export const PIGMENT_THRESHOLD = 0;
export const PIGMENT_HALF_TRANSITION = 0.16;
export const SIGNAL_LIMIT = 1;
const IVORY = [239, 227, 197];
const CHARCOAL = [40, 47, 44];
const SIGNAL_NEGATIVE = [53, 111, 155];
const SIGNAL_ZERO = [233, 225, 206];
const SIGNAL_POSITIVE = [171, 71, 34];

function smoothstep(value: number): number {
	const t = Math.max(0, Math.min(1, value));
	return t * t * (3 - 2 * t);
}

/** Both views share one mask, one physical scale and the same scalar-to-colour transfer. */
export function renderSkinField(
	fields: SkinFields,
	domain: SkinDomain,
	mode: SkinViewMode,
	scale = 4
): Uint8ClampedArray<ArrayBuffer> {
	const { nx, ny, mask } = domain;
	const width = nx * scale;
	const height = ny * scale;
	const result = new Uint8ClampedArray(width * height * 4);
	const values = mode === 'inhibitor' ? fields.v : fields.u;
	for (let y = 0; y < height; y++) {
		const cellY = Math.floor(y / scale);
		const sy = Math.max(0, Math.min(ny - 1, (y + 0.5) / scale - 0.5));
		const y0 = Math.floor(sy);
		const y1 = Math.min(ny - 1, y0 + 1);
		const fy = sy - y0;
		for (let x = 0; x < width; x++) {
			if (!mask[cellY * nx + Math.floor(x / scale)]) continue;
			const sx = Math.max(0, Math.min(nx - 1, (x + 0.5) / scale - 0.5));
			const x0 = Math.floor(sx);
			const x1 = Math.min(nx - 1, x0 + 1);
			const fx = sx - x0;
			const a = y0 * nx + x0;
			const b = y0 * nx + x1;
			const c = y1 * nx + x0;
			const d = y1 * nx + x1;
			const wa = mask[a] * (1 - fx) * (1 - fy);
			const wb = mask[b] * fx * (1 - fy);
			const wc = mask[c] * (1 - fx) * fy;
			const wd = mask[d] * fx * fy;
			// Ignore samples outside the stepped mask. The pixel stays inside its original cell.
			const value =
				((wa ? wa * values[a] : 0) +
					(wb ? wb * values[b] : 0) +
					(wc ? wc * values[c] : 0) +
					(wd ? wd * values[d] : 0)) /
				(wa + wb + wc + wd);
			const pigment = mode === 'pigment';
			const from = pigment ? IVORY : SIGNAL_ZERO;
			const to = pigment ? CHARCOAL : value < 0 ? SIGNAL_NEGATIVE : SIGNAL_POSITIVE;
			const t = pigment
				? smoothstep(
						(value - PIGMENT_THRESHOLD + PIGMENT_HALF_TRANSITION) / (2 * PIGMENT_HALF_TRANSITION)
					)
				: Math.min(1, Math.abs(value) / SIGNAL_LIMIT);
			const offset = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel++) {
				result[offset + channel] = from[channel] + t * (to[channel] - from[channel]);
			}
			result[offset + 3] = 255;
		}
	}
	return result;
}
