import { PIGMENTS } from './colors';
import type { ColorHarmony, SimulationSettings } from './types';

export class SeededRandom {
	private state: number;

	constructor(seed: number | string) {
		const text = String(seed);
		let hash = 2_166_136_261;
		for (let index = 0; index < text.length; index += 1) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 16_777_619);
		}
		this.state = hash >>> 0;
	}

	next() {
		this.state += 0x6d2b79f5;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	}

	between(minimum: number, maximum: number) {
		return minimum + (maximum - minimum) * this.next();
	}

	integer(minimum: number, maximum: number) {
		return Math.floor(this.between(minimum, maximum + 1));
	}

	pick<T>(values: readonly T[]): T {
		return values[Math.min(values.length - 1, Math.floor(this.next() * values.length))];
	}
}

const HARMONY_PALETTES: Record<ColorHarmony, readonly string[]> = {
	analogous: ['ultramarine', 'cobalt', 'cerulean', 'viridian', 'paynes-grey'],
	earth: ['yellow-ochre', 'burnt-sienna', 'burnt-umber', 'sap-green', 'paynes-grey'],
	monsoon: ['paynes-grey', 'viridian', 'burnt-sienna', 'cobalt', 'yellow-ochre'],
	complementary: ['ultramarine', 'burnt-sienna', 'cadmium-red', 'sap-green', 'indian-yellow'],
	quiet: ['cobalt', 'yellow-ochre', 'burnt-umber', 'paynes-grey', 'titanium-white']
};

export function paletteForHarmony(harmony: ColorHarmony, seed: number, count = 5) {
	const random = new SeededRandom(seed);
	const source = [...HARMONY_PALETTES[harmony]];
	for (let index = source.length - 1; index > 0; index -= 1) {
		const swap = random.integer(0, index);
		[source[index], source[swap]] = [source[swap], source[index]];
	}
	return source.slice(0, Math.min(Math.max(2, count), source.length));
}

export function newRandomSeed() {
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		const values = new Uint32Array(1);
		crypto.getRandomValues(values);
		return values[0];
	}
	return Math.floor(Math.random() * 4_294_967_295);
}

export function surpriseSettings(current: SimulationSettings, seed: number): SimulationSettings {
	const random = new SeededRandom(seed);
	const harmony = random.pick<ColorHarmony>([
		'analogous',
		'earth',
		'monsoon',
		'complementary',
		'quiet'
	]);
	const mode = random.pick(['watercolor', 'oil', 'hybrid'] as const);
	const paletteIds = paletteForHarmony(harmony, seed, random.integer(3, 5));
	const primaryPigmentId = random.pick(paletteIds);
	const secondaryPigmentId = random.pick(paletteIds.filter((id) => id !== primaryPigmentId));

	return {
		...current,
		mode,
		brush:
			mode === 'oil'
				? random.pick(['round', 'flat', 'knife', 'dry'])
				: random.pick(['round', 'wash', 'dropper', 'flat']),
		brushSize: random.between(22, 72),
		pigmentAmount: random.between(0.42, 0.82),
		transparency: random.between(0.12, 0.58),
		waterAmount: mode === 'oil' ? random.between(0.08, 0.32) : random.between(0.48, 0.88),
		diffusion: mode === 'oil' ? random.between(0.08, 0.3) : random.between(0.52, 0.86),
		surfaceMoisture: random.between(0.18, 0.68),
		dryingSpeed: random.between(0.18, 0.62),
		viscosity: mode === 'watercolor' ? random.between(0.12, 0.36) : random.between(0.62, 0.9),
		flowStrength: random.between(0.3, 0.76),
		turbulence: random.between(0.08, 0.48),
		granulation: random.between(0.3, 0.82),
		edgeDarkening: random.between(0.3, 0.82),
		mixingStrength: random.between(0.28, 0.7),
		textureStrength: random.between(0.32, 0.76),
		primaryPigmentId,
		secondaryPigmentId,
		paletteIds,
		colorMode: random.pick(['single', 'gradient', 'controlled-random', 'shuffle']),
		background: {
			...current.background,
			mode: random.pick(['pigment-cloud', 'atmospheric-wash', 'random-pigments', 'wet-field']),
			seed,
			regions: random.integer(3, 8),
			harmony,
			moisture: random.between(0.35, 0.82),
			turbulence: random.between(0.12, 0.58),
			scale: random.between(0.65, 1.55),
			symmetry: random.between(0, 0.42),
			intensity: random.between(0.26, 0.66)
		}
	};
}

export function isSafeRandomSettings(settings: SimulationSettings) {
	const finiteValues = [
		settings.brushSize,
		settings.pigmentAmount,
		settings.waterAmount,
		settings.diffusion,
		settings.dryingSpeed,
		settings.viscosity,
		settings.flowStrength,
		settings.turbulence,
		settings.granulation,
		settings.background.moisture,
		settings.background.intensity
	];
	return (
		finiteValues.every(Number.isFinite) &&
		settings.brushSize >= 8 &&
		settings.brushSize <= 120 &&
		settings.diffusion >= 0 &&
		settings.diffusion <= 1 &&
		settings.viscosity >= 0 &&
		settings.viscosity <= 1 &&
		settings.background.regions >= 2 &&
		settings.background.regions <= 12 &&
		settings.paletteIds.every((id) => PIGMENTS.some((pigment) => pigment.id === id))
	);
}
