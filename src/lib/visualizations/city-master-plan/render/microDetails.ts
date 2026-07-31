import { hashParts32, hashUnit } from '../engine/hash';

export interface CityMicroDetails {
	microSeed: number;
	paintIndex: number;
	roofIndex: number;
	groundIndex: number;
	mossEdge: number;
	awningPattern: number;
	signShape: number;
	shutterState: number;
	crackBias: number;
	detailAngle: number;
	ripplePhase: number;
	wirePhase: number;
	hasPlant: boolean;
	hasLaundry: boolean;
	hasTank: boolean;
	stains: readonly [number, number, number, number];
}

const cache = new Map<string, CityMicroDetails>();
const MAX_CACHE_ENTRIES = 8_192;

function boundedIndex(value: number, count: number): number {
	return Math.min(count - 1, Math.floor(value * count));
}

/**
 * Decorative variation derived exactly from the city seed, cell, tile identity,
 * and a "detail" stream. It never participates in compatibility or scoring.
 */
export function cityMicroDetails(
	citySeed: string,
	x: number,
	y: number,
	tileId: string
): CityMicroDetails {
	const key = `${citySeed}\u001f${x}\u001f${y}\u001f${tileId}`;
	const cached = cache.get(key);
	if (cached) return cached;

	const unit = (part: string) => hashUnit(citySeed, x, y, tileId, 'detail', part);
	const details: CityMicroDetails = Object.freeze({
		microSeed: hashParts32(citySeed, x, y, tileId, 'detail'),
		paintIndex: boundedIndex(unit('paint'), 5),
		roofIndex: boundedIndex(unit('roof'), 4),
		groundIndex: boundedIndex(unit('ground'), 4),
		mossEdge: boundedIndex(unit('moss-edge'), 4),
		awningPattern: boundedIndex(unit('awning'), 4),
		signShape: boundedIndex(unit('sign'), 3),
		shutterState: boundedIndex(unit('shutters'), 4),
		crackBias: unit('crack-bias') * 2 - 1,
		detailAngle: unit('angle') * Math.PI * 2,
		ripplePhase: unit('ripple') * Math.PI * 2,
		wirePhase: unit('wire') * Math.PI * 2,
		hasPlant: unit('plant') > 0.58,
		hasLaundry: unit('laundry') > 0.7,
		hasTank: unit('tank') > 0.76,
		stains: Object.freeze([
			unit('stain-0'),
			unit('stain-1'),
			unit('stain-2'),
			unit('stain-3')
		]) as readonly [number, number, number, number]
	});

	if (cache.size >= MAX_CACHE_ENTRIES) {
		const firstKey = cache.keys().next().value;
		if (typeof firstKey === 'string') cache.delete(firstKey);
	}
	cache.set(key, details);
	return details;
}

export function clearCityMicroDetailCache(): void {
	cache.clear();
}
