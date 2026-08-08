import { createBZRandom } from './prng';
import { assertValidBZSetup } from './validation';
import type { BZSetup } from './types';

export interface BZMaskPair {
	readonly domainMask: Uint8Array;
	readonly mask: Uint8Array;
}

export function cellCoordinate(index: number, size: number, domainSize: number): number {
	return ((index + 0.5) / size - 0.5) * domainSize;
}

export function createDomainMask(setup: Readonly<BZSetup>): Uint8Array {
	assertValidBZSetup(setup);
	const size = setup.gridSize;
	const mask = new Uint8Array(size * size);
	if (setup.geometry === 'square') {
		mask.fill(1);
		return mask;
	}
	const radiusSquared = setup.activeRadius * setup.activeRadius;
	for (let row = 0; row < size; row += 1) {
		const y = cellCoordinate(row, size, setup.domainSize);
		for (let column = 0; column < size; column += 1) {
			const x = cellCoordinate(column, size, setup.domainSize);
			mask[row * size + column] = x * x + y * y <= radiusSquared ? 1 : 0;
		}
	}
	return mask;
}

function removeDisk(
	mask: Uint8Array,
	size: number,
	domainSize: number,
	centerX: number,
	centerY: number,
	radius: number
): void {
	const radiusSquared = radius * radius;
	for (let row = 0; row < size; row += 1) {
		const dy = cellCoordinate(row, size, domainSize) - centerY;
		for (let column = 0; column < size; column += 1) {
			const dx = cellCoordinate(column, size, domainSize) - centerX;
			if (dx * dx + dy * dy <= radiusSquared) mask[row * size + column] = 0;
		}
	}
}

export function createBZMasks(setup: Readonly<BZSetup>): BZMaskPair {
	const domainMask = createDomainMask(setup);
	const mask = new Uint8Array(domainMask);
	const scale = setup.geometry === 'circular-dish' ? setup.activeRadius : setup.domainSize / 2;
	if (setup.maskPreset === 'central-obstacle') {
		removeDisk(mask, setup.gridSize, setup.domainSize, 0, 0, scale * 0.13);
	} else if (setup.maskPreset === 'seeded-obstacles') {
		const random = createBZRandom(setup.seed, 'obstacles');
		const count = Math.max(3, Math.min(12, Math.round(setup.gridSize / 32)));
		for (let obstacle = 0; obstacle < count; obstacle += 1) {
			const angle = random.range(0, 2 * Math.PI);
			const distance = Math.sqrt(random.next()) * scale * 0.64;
			removeDisk(
				mask,
				setup.gridSize,
				setup.domainSize,
				Math.cos(angle) * distance,
				Math.sin(angle) * distance,
				random.range(scale * 0.035, scale * 0.08)
			);
		}
	}
	return { domainMask, mask };
}
