/** Browser-independent settings for the Fractal Trip instrument. */
export type FamilyId =
	| 'mandelbrot'
	| 'julia'
	| 'burning-ship'
	| 'tricorn'
	| 'newton'
	| 'mandelbulb'
	| 'mandelbox';
export type PaletteId = 'copper' | 'opal' | 'ultraviolet' | 'ember' | 'lagoon' | 'ink';
export type Quality = 'auto' | 'saver' | 'high';
export interface Complex {
	re: number;
	im: number;
}
export interface FractalState {
	version: 1;
	family: FamilyId;
	power: number;
	seedRe: number;
	seedIm: number;
	seedZ: number;
	bulbJulia: boolean;
	roots: Complex[];
	relaxation: number;
	foldScale: number;
	foldLimit: number;
	minRadius: number;
	palette: PaletteId;
	relief: number;
	roughness: number;
	glow: number;
	lightAngle: number;
	speed: number;
	quality: Quality;
	centerRe: number;
	centerIm: number;
	span: number;
	rotation: number;
	yaw: number;
	pitch: number;
	distance: number;
	journeyTime: number;
}

export const FAMILIES: readonly {
	id: FamilyId;
	name: string;
	kind: '2d' | '3d';
	description: string;
	formula: string;
}[] = [
	{
		id: 'mandelbrot',
		name: 'Mandelbrot',
		kind: '2d',
		description: 'Zoom into branching coastlines. Power changes the number of lobes.',
		formula: 'zₙ₊₁ = zₙᵖ + c, z₀ = 0'
	},
	{
		id: 'julia',
		name: 'Julia',
		kind: '2d',
		description: 'Move the seed to reshape a whole field of spirals.',
		formula: 'zₙ₊₁ = zₙᵖ + c, z₀ = pixel'
	},
	{
		id: 'burning-ship',
		name: 'Burning Ship',
		kind: '2d',
		description: 'Fold both coordinates into towers and fine ridges.',
		formula: 'zₙ₊₁ = (|Re zₙ| + i|Im zₙ|)ᵖ + c'
	},
	{
		id: 'tricorn',
		name: 'Tricorn',
		kind: '2d',
		description: 'Conjugation turns the familiar boundary into a different family.',
		formula: 'zₙ₊₁ = conjugate(zₙ)ᵖ + c'
	},
	{
		id: 'newton',
		name: 'Newton',
		kind: '2d',
		description: 'Move roots and watch their coloured convergence regions meet.',
		formula: 'zₙ₊₁ = zₙ − λ f(zₙ)/f′(zₙ), f(z) = ∏(z − rⱼ)'
	},
	{
		id: 'mandelbulb',
		name: 'Mandelbulb',
		kind: '3d',
		description: 'Orbit a three-dimensional fractal with folded, sculptural surfaces.',
		formula: 'vₙ₊₁ = sphericalPower(vₙ, p) + c'
	},
	{
		id: 'mandelbox',
		name: 'Mandelbox',
		kind: '3d',
		description: 'Change the box and sphere folds to uncover carved structures.',
		formula: 'vₙ₊₁ = s · sphereFold(boxFold(vₙ)) + c'
	}
];

export const PALETTES: readonly { id: PaletteId; name: string; colors: readonly string[] }[] = [
	{
		id: 'copper',
		name: 'Copper & cyan',
		colors: ['#071c28', '#177d8e', '#93e5dc', '#c7663b', '#ffdfac']
	},
	{ id: 'opal', name: 'Opal', colors: ['#11162e', '#7692c4', '#d0b8f0', '#b4ecdc', '#fff0ce'] },
	{
		id: 'ultraviolet',
		name: 'Ultraviolet',
		colors: ['#080b27', '#3532a0', '#a64dd8', '#f692cc', '#e5e8ff']
	},
	{ id: 'ember', name: 'Ember', colors: ['#160c14', '#682039', '#c34531', '#f49b4b', '#fff0b5'] },
	{ id: 'lagoon', name: 'Lagoon', colors: ['#061526', '#104a78', '#158f9b', '#78d9bc', '#e5f8d2'] },
	{ id: 'ink', name: 'Ink & gold', colors: ['#080d17', '#25364f', '#617483', '#c3974f', '#fce5a2'] }
];

export function paletteRGB(id: PaletteId): readonly (readonly [number, number, number])[] {
	const palette = PALETTES.find((entry) => entry.id === id) ?? PALETTES[0];
	return palette.colors.map(
		(hex) =>
			[
				parseInt(hex.slice(1, 3), 16) / 255,
				parseInt(hex.slice(3, 5), 16) / 255,
				parseInt(hex.slice(5, 7), 16) / 255
			] as const
	);
}

/** Hard state floor. minimumSpan additionally respects the actual float pixel grid. */
export const MIN_SPAN = 1e-4;
export const MAX_SPAN = 8;
export const MAX_ENCODED_STATE_LENGTH = 8192;

export function regularRoots(count: number): Complex[] {
	const n = Math.max(3, Math.min(6, Math.round(Number.isFinite(count) ? count : 3)));
	return Array.from({ length: n }, (_, index) => ({
		re: Math.cos((index * 2 * Math.PI) / n),
		im: Math.sin((index * 2 * Math.PI) / n)
	}));
}

export const DEFAULT_STATE: FractalState = {
	version: 1,
	family: 'mandelbrot',
	power: 2,
	seedRe: -0.8,
	seedIm: 0.156,
	seedZ: 0,
	bulbJulia: false,
	roots: regularRoots(3),
	relaxation: 1,
	foldScale: -1.8,
	foldLimit: 1,
	minRadius: 0.5,
	palette: 'copper',
	relief: 0.62,
	roughness: 0.4,
	glow: 0.15,
	lightAngle: 2.3,
	speed: 1,
	quality: 'auto',
	centerRe: -0.743643887,
	centerIm: 0.131825904,
	span: 0.018,
	rotation: 0,
	yaw: 0.4,
	pitch: 0.2,
	distance: 4.1,
	journeyTime: 0
};

export function defaultForFamily(family: FamilyId): FractalState {
	const state: FractalState = { ...DEFAULT_STATE, roots: regularRoots(3), family };
	switch (family) {
		case 'julia':
			return { ...state, centerRe: 0, centerIm: 0, span: 3.2, palette: 'opal' };
		case 'burning-ship':
			return { ...state, centerRe: -1.76, centerIm: -0.035, span: 0.18, palette: 'ember' };
		case 'tricorn':
			return { ...state, centerRe: -0.25, centerIm: 0, span: 3.3, palette: 'ultraviolet' };
		case 'newton':
			return { ...state, centerRe: 0, centerIm: 0, span: 3.2, palette: 'lagoon', relief: 0.35 };
		case 'mandelbulb':
			return {
				...state,
				power: 8,
				seedRe: 0.2,
				seedIm: 0.1,
				seedZ: -0.2,
				palette: 'opal',
				distance: 4.1,
				relief: 0.8
			};
		case 'mandelbox':
			return { ...state, palette: 'ink', distance: 7.2, yaw: 0.65, pitch: 0.3, relief: 0.7 };
		default:
			return state;
	}
}

const families = new Set<string>(FAMILIES.map(({ id }) => id));
const palettes = new Set<string>(PALETTES.map(({ id }) => id));
const qualities = new Set<string>(['auto', 'saver', 'high']);
const TAU = 2 * Math.PI;
function finite(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(min, Math.min(max, value))
		: fallback;
}
function angle(value: unknown, fallback: number): number {
	const result = finite(value, fallback, -1e6, 1e6);
	if (result >= 0 && result < TAU) return result;
	return ((result % TAU) + TAU) % TAU;
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Copy only finite, bounded, known fields; URL data can never supply executable code. */
export function normalizeState(input: unknown): FractalState {
	if (!isRecord(input) || (input.version !== undefined && input.version !== 1)) {
		return defaultForFamily('mandelbrot');
	}
	const family =
		typeof input.family === 'string' && families.has(input.family)
			? (input.family as FamilyId)
			: 'mandelbrot';
	const state = defaultForFamily(family);
	state.power = Math.round(finite(input.power, state.power, 2, family === 'mandelbulb' ? 10 : 8));
	state.seedRe = finite(input.seedRe, state.seedRe, -2, 2);
	state.seedIm = finite(input.seedIm, state.seedIm, -2, 2);
	state.seedZ = finite(input.seedZ, state.seedZ, -2, 2);
	state.bulbJulia = typeof input.bulbJulia === 'boolean' ? input.bulbJulia : state.bulbJulia;
	if (Array.isArray(input.roots) && input.roots.length >= 3 && input.roots.length <= 6) {
		const fallback = regularRoots(input.roots.length);
		state.roots = input.roots.map((value, index) =>
			isRecord(value)
				? {
						re: finite(value.re, fallback[index].re, -2, 2),
						im: finite(value.im, fallback[index].im, -2, 2)
					}
				: fallback[index]
		);
	}
	state.relaxation = finite(input.relaxation, state.relaxation, 0.25, 1.5);
	state.foldScale = finite(input.foldScale, state.foldScale, -2.5, -1.2);
	state.foldLimit = finite(input.foldLimit, state.foldLimit, 0.5, 1.5);
	state.minRadius = finite(input.minRadius, state.minRadius, 0.2, 0.8);
	state.palette =
		typeof input.palette === 'string' && palettes.has(input.palette)
			? (input.palette as PaletteId)
			: state.palette;
	state.relief = finite(input.relief, state.relief, 0, 1.5);
	state.roughness = finite(input.roughness, state.roughness, 0.1, 1);
	state.glow = finite(input.glow, state.glow, 0, 1);
	state.lightAngle = angle(input.lightAngle, state.lightAngle);
	state.speed = finite(input.speed, state.speed, 0.1, 1.5);
	state.quality =
		typeof input.quality === 'string' && qualities.has(input.quality)
			? (input.quality as Quality)
			: state.quality;
	state.centerRe = finite(input.centerRe, state.centerRe, -4, 4);
	state.centerIm = finite(input.centerIm, state.centerIm, -4, 4);
	state.span = finite(input.span, state.span, MIN_SPAN, MAX_SPAN);
	state.rotation = angle(input.rotation, state.rotation);
	state.yaw = angle(input.yaw, state.yaw);
	state.pitch = finite(input.pitch, state.pitch, -0.95, 0.95);
	state.distance = finite(input.distance, state.distance, 1.5, 8);
	state.journeyTime = finite(input.journeyTime, state.journeyTime, 0, 3600);
	return state;
}

export function encodeState(state: FractalState): string {
	// Normalization leaves only ASCII keys, identifiers, booleans and numbers.
	return btoa(JSON.stringify(normalizeState(state)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}

export function decodeState(value: string | null): FractalState | null {
	if (!value || value.length > MAX_ENCODED_STATE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value))
		return null;
	try {
		const raw: unknown = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
		if (
			!isRecord(raw) ||
			raw.version !== 1 ||
			typeof raw.family !== 'string' ||
			!families.has(raw.family)
		)
			return null;
		return normalizeState(raw);
	} catch {
		return null;
	}
}

/** Conservative spacing for a highp float shader, separate from the serialisation floor. */
export function minimumSpan(state: FractalState, renderHeight = 720): number {
	const height = finite(renderHeight, 720, 1, 4096);
	const magnitude = Math.max(1, Math.abs(state.centerRe), Math.abs(state.centerIm));
	return Math.max(MIN_SPAN, 4 * 2 ** -23 * magnitude * height);
}

export function pointAt(
	state: FractalState,
	xNormalized: number,
	yNormalized: number,
	aspect: number
): Complex {
	const ratio = finite(aspect, 1, 0.1, 10);
	const x = (finite(xNormalized, 0.5, 0, 1) - 0.5) * state.span * ratio;
	const y = (0.5 - finite(yNormalized, 0.5, 0, 1)) * state.span;
	const cosine = Math.cos(state.rotation);
	const sine = Math.sin(state.rotation);
	return { re: state.centerRe + x * cosine - y * sine, im: state.centerIm + x * sine + y * cosine };
}

/** factor < 1 zooms in, preserving the complex point under a top-left-origin pointer. */
export function zoomAt(
	state: FractalState,
	xNormalized: number,
	yNormalized: number,
	factor: number,
	aspect: number
): FractalState {
	const base = normalizeState(state);
	const before = pointAt(base, xNormalized, yNormalized, aspect);
	const next = {
		...base,
		span: finite(base.span * finite(factor, 1, 0.05, 20), base.span, MIN_SPAN, MAX_SPAN)
	};
	const after = pointAt(next, xNormalized, yNormalized, aspect);
	return normalizeState({
		...next,
		centerRe: next.centerRe + before.re - after.re,
		centerIm: next.centerIm + before.im - after.im
	});
}

/** Positive deltas are the pointer's screen movement: the picture follows the hand. */
export function panView(
	state: FractalState,
	dxNormalized: number,
	dyNormalized: number,
	aspect: number
): FractalState {
	const base = normalizeState(state);
	const ratio = finite(aspect, 1, 0.1, 10);
	const x = finite(dxNormalized, 0, -2, 2) * base.span * ratio;
	const y = -finite(dyNormalized, 0, -2, 2) * base.span;
	return normalizeState({
		...base,
		centerRe: base.centerRe - x * Math.cos(base.rotation) + y * Math.sin(base.rotation),
		centerIm: base.centerIm - x * Math.sin(base.rotation) - y * Math.cos(base.rotation)
	});
}

export const PRESETS: readonly {
	id: string;
	name: string;
	description: string;
	family: FamilyId;
	state: FractalState;
}[] = [
	{
		id: 'copper-coast',
		name: 'Copper coast',
		description: 'Fine Mandelbrot filaments in copper and cyan.',
		family: 'mandelbrot',
		state: defaultForFamily('mandelbrot')
	},
	{
		id: 'whole-set',
		name: 'The whole set',
		description: 'Start with the familiar Mandelbrot outline.',
		family: 'mandelbrot',
		state: { ...defaultForFamily('mandelbrot'), centerRe: -0.5, centerIm: 0, span: 2.8 }
	},
	{
		id: 'cubic',
		name: 'Cubic',
		description: 'A cubic Multibrot with a different arrangement of lobes.',
		family: 'mandelbrot',
		state: {
			...defaultForFamily('mandelbrot'),
			power: 3,
			centerRe: 0,
			centerIm: 0,
			span: 3,
			palette: 'ultraviolet'
		}
	},
	{
		id: 'julia-lace',
		name: 'Julia lace',
		description: 'A fixed seed makes branching Julia forms.',
		family: 'julia',
		state: defaultForFamily('julia')
	},
	{
		id: 'ember-ridges',
		name: 'Ember ridges',
		description: 'Explore the folded edge of the Burning Ship.',
		family: 'burning-ship',
		state: defaultForFamily('burning-ship')
	},
	{
		id: 'tricorn',
		name: 'Three corners',
		description: 'The conjugate quadratic family.',
		family: 'tricorn',
		state: defaultForFamily('tricorn')
	},
	{
		id: 'root-garden',
		name: 'Root garden',
		description: 'Three roots divide the plane into coloured basins.',
		family: 'newton',
		state: defaultForFamily('newton')
	},
	{
		id: 'opal-bulb',
		name: 'Opal bulb',
		description: 'A true three-dimensional power-eight Mandelbulb.',
		family: 'mandelbulb',
		state: defaultForFamily('mandelbulb')
	},
	{
		id: 'gold-vault',
		name: 'Gold vault',
		description: 'Box and sphere folds carve a three-dimensional Mandelbox.',
		family: 'mandelbox',
		state: defaultForFamily('mandelbox')
	}
];

/** Stay near curated settings; mutation never changes the selected equation family. */
export function varyState(state: FractalState, random: () => number = Math.random): FractalState {
	const base = normalizeState(state);
	const sample = () => finite(random(), 0.5, 0, 0.999999);
	const next = {
		...base,
		palette: PALETTES[Math.floor(sample() * PALETTES.length)].id,
		lightAngle: sample() * TAU,
		relief: 0.3 + sample() * 0.65
	};
	if (base.family === 'julia') {
		const seeds = [
			[-0.8, 0.156],
			[-0.7269, 0.1889],
			[-0.4, 0.6],
			[0.285, 0.01]
		];
		const seed = seeds[Math.floor(sample() * seeds.length)];
		next.seedRe = seed[0];
		next.seedIm = seed[1];
		next.centerRe = 0;
		next.centerIm = 0;
		next.span = 3.2;
	} else if (base.family === 'newton') {
		next.roots = regularRoots(3 + Math.floor(sample() * 4));
		next.relaxation = 0.8 + sample() * 0.35;
	} else if (base.family === 'mandelbulb') {
		next.power = 4 + Math.floor(sample() * 6);
		next.yaw = sample() * TAU;
	} else if (base.family === 'mandelbox') {
		next.foldScale = -1.6 - sample() * 0.6;
		next.minRadius = 0.35 + sample() * 0.25;
		next.yaw = sample() * TAU;
	} else {
		next.rotation = sample() * TAU;
	}
	return normalizeState(next);
}

function multiply(a: Complex, b: Complex): Complex {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function integerPower(z: Complex, power: number): Complex {
	let result: Complex = { re: 1, im: 0 };
	for (let i = 0; i < power; i++) result = multiply(result, z);
	return result;
}

/** Small CPU reference for tests and meaningful numerical checks, never a full-frame renderer. */
export function iterate2D(
	state: FractalState,
	point: Complex,
	limit = 128
): {
	value: Complex;
	iterations: number;
	escaped: boolean;
	converged: boolean;
	rootIndex: number | null;
} {
	const settings = normalizeState(state);
	const maximum = Math.round(finite(limit, 128, 1, 4096));
	let z =
		settings.family === 'julia' || settings.family === 'newton' ? { ...point } : { re: 0, im: 0 };
	const c = settings.family === 'julia' ? { re: settings.seedRe, im: settings.seedIm } : point;
	if (settings.family === 'mandelbulb' || settings.family === 'mandelbox')
		throw new Error('iterate2D requires a planar family.');
	for (let iteration = 0; iteration < maximum; iteration++) {
		if (settings.family === 'newton') {
			const rootIndex = settings.roots.findIndex(
				(root) => Math.hypot(z.re - root.re, z.im - root.im) < 1e-6
			);
			if (rootIndex !== -1)
				return { value: z, iterations: iteration, escaped: false, converged: true, rootIndex };
			// f and f′ accumulated together, avoiding the reciprocal singularity at a root.
			let f: Complex = { re: 1, im: 0 };
			let derivative: Complex = { re: 0, im: 0 };
			for (const root of settings.roots) {
				const factor = { re: z.re - root.re, im: z.im - root.im };
				const product = multiply(derivative, factor);
				derivative = { re: product.re + f.re, im: product.im + f.im };
				f = multiply(f, factor);
			}
			const denominator = derivative.re ** 2 + derivative.im ** 2;
			if (denominator < 1e-20)
				return {
					value: z,
					iterations: iteration,
					escaped: false,
					converged: false,
					rootIndex: null
				};
			z = {
				re:
					z.re -
					(settings.relaxation * (f.re * derivative.re + f.im * derivative.im)) / denominator,
				im:
					z.im - (settings.relaxation * (f.im * derivative.re - f.re * derivative.im)) / denominator
			};
		} else {
			if (settings.family === 'burning-ship') z = { re: Math.abs(z.re), im: Math.abs(z.im) };
			if (settings.family === 'tricorn') z = { re: z.re, im: -z.im };
			const powered = integerPower(z, settings.power);
			z = { re: powered.re + c.re, im: powered.im + c.im };
		}
		if (!Number.isFinite(z.re) || !Number.isFinite(z.im) || z.re ** 2 + z.im ** 2 > 256) {
			return {
				value: z,
				iterations: iteration + 1,
				escaped: true,
				converged: false,
				rootIndex: null
			};
		}
	}
	return { value: z, iterations: maximum, escaped: false, converged: false, rootIndex: null };
}
