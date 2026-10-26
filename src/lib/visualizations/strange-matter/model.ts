/** Browser-independent artwork settings. Shared links contain only bounded scalar values. */
export type WorldId = 'liquid' | 'bloom' | 'current' | 'tunnel';
export type PaletteId = 'opal' | 'ember' | 'aurora' | 'ultraviolet' | 'monochrome';
export type Framing = 'landscape' | 'square' | 'portrait';

export interface DesignState {
	world: WorldId;
	seed: number;
	shape: number;
	energy: number;
	detail: number;
	glow: number;
	speed: number;
	palette: PaletteId;
	framing: Framing;
	view: { yaw: number; pitch: number; distance: number };
	time: number;
}

export const WORLDS = [
	{
		id: 'liquid',
		name: 'Liquid Knot',
		subtitle: 'Sculpted light. Impossible folds.',
		number: '01'
	},
	{
		id: 'bloom',
		name: 'Alien Bloom',
		subtitle: 'Something unfamiliar, coming alive.',
		number: '02'
	},
	{
		id: 'current',
		name: 'Neon Current',
		subtitle: 'A thousand threads. One strange pulse.',
		number: '03'
	},
	{
		id: 'tunnel',
		name: 'Impossible Tunnel',
		subtitle: 'Lose yourself in the in-between.',
		number: '04'
	}
] as const satisfies readonly { id: WorldId; name: string; subtitle: string; number: string }[];

export const PALETTES = [
	{ id: 'opal', name: 'Electric opal', colors: ['#81f0dc', '#b4b0ff', '#ff91ba', '#f8cb93'] },
	{ id: 'ember', name: 'Solar flare', colors: ['#ff553d', '#ff9f57', '#ffda8a', '#d457be'] },
	{ id: 'aurora', name: 'Northern lights', colors: ['#8dffc7', '#41d7dc', '#6396ff', '#bd8cff'] },
	{ id: 'ultraviolet', name: 'After hours', colors: ['#b194ff', '#e489f9', '#ff7cab', '#75b5ff'] },
	{ id: 'monochrome', name: 'Silver study', colors: ['#f8ead2', '#b9d1db', '#8398b4', '#f5f3ed'] }
] as const satisfies readonly { id: PaletteId; name: string; colors: readonly string[] }[];

export const DEFAULT_STATE: Readonly<DesignState> = {
	world: 'liquid',
	seed: 270627,
	shape: 58,
	energy: 38,
	detail: 62,
	glow: 48,
	speed: 28,
	palette: 'opal',
	framing: 'landscape',
	view: { yaw: 0, pitch: 0.12, distance: 5.8 },
	time: 0
};

const FRAMINGS: readonly Framing[] = ['landscape', 'square', 'portrait'];
const CONTROL_KEYS = ['shape', 'energy', 'detail', 'glow', 'speed'] as const;
const MAX_SEED = 0xffffffff;
const MAX_LINK_LENGTH = 512;

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.round(Math.min(max, Math.max(min, value)) * 100_000) / 100_000;
}

function seedNumber(value: unknown): number {
	return Math.floor(bounded(value, DEFAULT_STATE.seed, 1, MAX_SEED));
}

/** Invalid individual values fall back to the art-directed default, rather than coercing strings. */
export function normalizeState(input: unknown): DesignState {
	const value = record(input);
	const view = record(value.view);
	const controls = Object.fromEntries(
		CONTROL_KEYS.map((key) => [key, bounded(value[key], DEFAULT_STATE[key], 0, 100)])
	) as Pick<DesignState, (typeof CONTROL_KEYS)[number]>;
	return {
		world: WORLDS.some((world) => world.id === value.world)
			? (value.world as WorldId)
			: DEFAULT_STATE.world,
		seed: seedNumber(value.seed),
		...controls,
		palette: PALETTES.some((palette) => palette.id === value.palette)
			? (value.palette as PaletteId)
			: DEFAULT_STATE.palette,
		framing: FRAMINGS.includes(value.framing as Framing)
			? (value.framing as Framing)
			: DEFAULT_STATE.framing,
		view: {
			yaw: bounded(view.yaw, DEFAULT_STATE.view.yaw, -Math.PI * 2, Math.PI * 2),
			pitch: bounded(view.pitch, DEFAULT_STATE.view.pitch, -1.3, 1.3),
			distance: bounded(view.distance, DEFAULT_STATE.view.distance, 2.6, 12)
		},
		time: bounded(value.time, 0, 0, 86_400)
	};
}

/** Mulberry32: deterministic and local; used for composition, never for security. */
export function seededRandom(seed: number): () => number {
	let state = seedNumber(seed) >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), state | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
	};
}

/** Compact versioned payload. URLSearchParams handles escaping it as the `art` value. */
export function encodeState(input: DesignState): string {
	const state = normalizeState(input);
	return [
		1,
		WORLDS.findIndex((world) => world.id === state.world),
		state.seed.toString(36),
		...CONTROL_KEYS.map((key) => state[key]),
		PALETTES.findIndex((palette) => palette.id === state.palette),
		FRAMINGS.indexOf(state.framing),
		state.view.yaw,
		state.view.pitch,
		state.view.distance,
		state.time
	].join(':');
}

/** A malformed or future-version link recovers to a complete, independent default state. */
export function decodeState(encoded: string | null): DesignState {
	if (typeof encoded !== 'string' || encoded.length > MAX_LINK_LENGTH)
		return normalizeState(DEFAULT_STATE);
	const parts = encoded.split(':');
	if (parts.length !== 14 || parts[0] !== '1' || !/^[0-9a-z]{1,7}$/.test(parts[2]))
		return normalizeState(DEFAULT_STATE);
	const numeric = parts.slice(3);
	if (!/^[0-3]$/.test(parts[1]) || numeric.some((part) => !/^-?\d+(?:\.\d+)?$/.test(part)))
		return normalizeState(DEFAULT_STATE);
	const values = numeric.map(Number);
	if (values.some((value) => !Number.isFinite(value))) return normalizeState(DEFAULT_STATE);
	return normalizeState({
		world: WORLDS[Number(parts[1])]?.id,
		seed: parseInt(parts[2], 36),
		shape: values[0],
		energy: values[1],
		detail: values[2],
		glow: values[3],
		speed: values[4],
		palette: PALETTES[values[5]]?.id,
		framing: FRAMINGS[values[6]],
		view: { yaw: values[7], pitch: values[8], distance: values[9] },
		time: values[10]
	});
}

/** Explore the selected world; bounds favour readable silhouettes and controlled highlights. */
export function surpriseState(current: DesignState, optionalSeed?: number): DesignState {
	const safe = normalizeState(current);
	const nextSeed =
		optionalSeed === undefined
			? 1 + Math.floor(seededRandom(safe.seed)() * (MAX_SEED - 1))
			: seedNumber(optionalSeed);
	const random = seededRandom(nextSeed);
	const between = (min: number, max: number) => Math.round(min + random() * (max - min));
	return normalizeState({
		...safe,
		seed: nextSeed,
		shape: between(22, 86),
		energy: between(22, 68),
		detail: between(42, 78),
		glow: between(24, 62),
		speed: between(18, 46),
		palette: PALETTES[Math.floor(random() * PALETTES.length)].id,
		view: { yaw: between(-25, 25) / 100, pitch: between(-12, 30) / 100, distance: 5.8 },
		time: 0
	});
}

export function framingRatio(framing: Framing): number {
	return framing === 'portrait' ? 4 / 5 : framing === 'square' ? 1 : 16 / 10;
}

/** Export dimensions share the exact same ratio as the compositional preview. */
export function exportDimensions(
	framing: Framing,
	longEdge = 2400
): { width: number; height: number } {
	const size = Math.round(bounded(longEdge, 2400, 640, 3840));
	const ratio = framingRatio(framing);
	return ratio < 1
		? { width: Math.round(size * ratio), height: size }
		: { width: size, height: Math.round(size / ratio) };
}

export const PRESETS: readonly { id: string; name: string; state: DesignState }[] = [
	{ id: 'soft-machinery', name: 'Soft machinery', state: normalizeState(DEFAULT_STATE) },
	{
		id: 'molten-orbit',
		name: 'Molten orbit',
		state: normalizeState({
			...DEFAULT_STATE,
			seed: 48122,
			shape: 79,
			energy: 53,
			palette: 'ember',
			glow: 36
		})
	},
	{
		id: 'other-garden',
		name: 'The other garden',
		state: normalizeState({
			...DEFAULT_STATE,
			world: 'bloom',
			seed: 39001,
			shape: 63,
			energy: 35,
			detail: 70,
			palette: 'aurora'
		})
	},
	{
		id: 'night-flower',
		name: 'Night flower',
		state: normalizeState({
			...DEFAULT_STATE,
			world: 'bloom',
			seed: 71824,
			shape: 35,
			energy: 49,
			detail: 58,
			palette: 'ultraviolet',
			glow: 39
		})
	},
	{
		id: 'signal-drift',
		name: 'Signal drift',
		state: normalizeState({
			...DEFAULT_STATE,
			world: 'current',
			seed: 18904,
			shape: 46,
			energy: 42,
			detail: 67,
			palette: 'aurora',
			glow: 52
		})
	},
	{
		id: 'ghost-frequency',
		name: 'Ghost frequency',
		state: normalizeState({
			...DEFAULT_STATE,
			world: 'current',
			seed: 82711,
			shape: 79,
			energy: 59,
			detail: 48,
			palette: 'ultraviolet',
			glow: 38
		})
	},
	{
		id: 'event-horizon',
		name: 'Event horizon',
		state: normalizeState({
			...DEFAULT_STATE,
			world: 'tunnel',
			seed: 27589,
			shape: 59,
			energy: 45,
			detail: 62,
			palette: 'opal',
			glow: 40
		})
	},
	{
		id: 'solar-passage',
		name: 'Solar passage',
		state: normalizeState({
			...DEFAULT_STATE,
			world: 'tunnel',
			seed: 99012,
			shape: 28,
			energy: 63,
			detail: 71,
			palette: 'ember',
			glow: 45
		})
	}
];
