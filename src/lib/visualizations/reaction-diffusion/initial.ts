import { SeededRandom } from '../../utils/seeded-random';
import { createMask } from './mask';
import { assertValidSetup } from './setup';
import type { FieldState, GrayScottSetup } from './types';

function smoothstep(edge0: number, edge1: number, value: number): number {
	const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
	return x * x * (3 - 2 * x);
}

export function cloneFieldState(state: Readonly<FieldState>): FieldState {
	return {
		size: state.size,
		u: new Float64Array(state.u),
		v: new Float64Array(state.v),
		mask: new Uint8Array(state.mask)
	};
}

export function assertValidFieldState(state: Readonly<FieldState>): void {
	if (!Number.isInteger(state.size) || state.size < 2)
		throw new RangeError('Field size is invalid.');
	const length = state.size * state.size;
	if (state.u.length !== length || state.v.length !== length || state.mask.length !== length) {
		throw new RangeError('Field arrays do not match the declared square grid size.');
	}
}

export function createInitialField(setup: Readonly<GrayScottSetup>): FieldState {
	assertValidSetup(setup);
	const size = setup.gridSize;
	const length = size * size;
	const u = new Float64Array(length);
	const v = new Float64Array(length);
	const mask = createMask(size, setup.maskPreset, setup.seed);
	u.fill(1);
	const random = new SeededRandom(setup.seed).fork('reaction-diffusion-initial');
	const coordinate = (index: number): number => (2 * (index + 0.5)) / size - 1;

	const pulse = (index: number, weight: number): void => {
		if (!mask[index] || weight <= 0) return;
		const jitter = (random.next() - 0.5) * 0.012;
		const amount = Math.max(0, weight + jitter);
		v[index] = 0.25 + 0.35 * amount;
		u[index] = 1 - (0.42 + 0.2 * amount);
	};

	for (let row = 0; row < size; row += 1) {
		const y = coordinate(row);
		for (let column = 0; column < size; column += 1) {
			const x = coordinate(column);
			const index = row * size + column;
			let weight = 0;
			switch (setup.initialCondition) {
				case 'central-soft-disk': {
					const radius = Math.hypot(x, y);
					weight = 1 - smoothstep(0.1, 0.22, radius);
					break;
				}
				case 'central-square':
					weight = Math.max(Math.abs(x), Math.abs(y)) <= 0.16 ? 1 : 0;
					break;
				case 'ring': {
					const radius = Math.hypot(x, y);
					weight = 1 - smoothstep(0.035, 0.09, Math.abs(radius - 0.3));
					break;
				}
				case 'horizontal-front':
					weight = Math.abs(y) <= 0.065 && Math.abs(x) <= 0.75 ? 1 : 0;
					break;
				case 'two-spots':
					weight = Math.hypot(x + 0.32, y) <= 0.13 || Math.hypot(x - 0.32, y) <= 0.13 ? 1 : 0;
					break;
				case 'noise-patch':
					weight = Math.abs(x) <= 0.22 && Math.abs(y) <= 0.22 ? random.next() : 0;
					break;
				case 'sparse-points':
					weight = random.chance(0.0018) ? 1 : 0;
					break;
				case 'blank-feed':
				case 'hand-painted':
					weight = 0;
					break;
			}
			pulse(index, weight);
		}
	}
	return { size, u, v, mask };
}
