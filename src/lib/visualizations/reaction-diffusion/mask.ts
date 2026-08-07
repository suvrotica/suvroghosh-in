import { SeededRandom } from '../../utils/seeded-random';
import type { MaskPreset } from './types';

export function createMask(size: number, preset: MaskPreset, seed = ''): Uint8Array {
	if (!Number.isInteger(size) || size < 2) throw new RangeError('Mask size must be at least two.');
	const mask = new Uint8Array(size * size);
	mask.fill(1);
	const coordinate = (index: number): number => (2 * (index + 0.5)) / size - 1;
	for (let row = 0; row < size; row += 1) {
		const y = coordinate(row);
		for (let column = 0; column < size; column += 1) {
			const x = coordinate(column);
			const radiusSquared = x * x + y * y;
			let active = true;
			switch (preset) {
				case 'open-square':
					break;
				case 'circular-vessel':
					active = radiusSquared <= 0.92 * 0.92;
					break;
				case 'narrow-channel':
					active = Math.abs(y) <= 0.18;
					break;
				case 'annulus':
					active = radiusSquared >= 0.32 * 0.32 && radiusSquared <= 0.92 * 0.92;
					break;
				case 'two-chambers': {
					const left = (x + 0.48) ** 2 + y * y <= 0.43 * 0.43;
					const right = (x - 0.48) ** 2 + y * y <= 0.43 * 0.43;
					const neck = Math.abs(x) <= 0.5 && Math.abs(y) <= 0.1;
					active = left || right || neck;
					break;
				}
				case 'obstacle-field':
					break;
			}
			mask[row * size + column] = active ? 1 : 0;
		}
	}
	if (preset === 'obstacle-field') {
		const random = new SeededRandom(seed).fork('reaction-diffusion-mask');
		const obstacleCount = Math.max(4, Math.round(size / 18));
		for (let obstacle = 0; obstacle < obstacleCount; obstacle += 1) {
			const x = random.range(-0.78, 0.78);
			const y = random.range(-0.78, 0.78);
			const radius = random.range(0.035, 0.095);
			for (let row = 0; row < size; row += 1) {
				const dy = coordinate(row) - y;
				for (let column = 0; column < size; column += 1) {
					const dx = coordinate(column) - x;
					if (dx * dx + dy * dy <= radius * radius) mask[row * size + column] = 0;
				}
			}
		}
	}
	return mask;
}
