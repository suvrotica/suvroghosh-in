export type SplatStyle = 'gaussian' | 'anisotropic' | 'surfel' | 'ink' | 'spark' | 'hybrid';

export interface SplatSettings {
	preset: string;
	style: SplatStyle;
	palette: string;
	seed: number;
	density: number;
	size: number;
	flow: number;
	speed: number;
	glow: number;
	scale: number;
	twist: number;
	curl: number;
	spread: number;
	hollow: number;
	symmetry: number;
	opacity: number;
	softness: number;
	elongation: number;
	orientation: number;
	hue: number;
	saturation: number;
	gradient: number;
	colorBy: 'position' | 'depth' | 'flow';
	turbulence: number;
	breathing: number;
	rotation: number;
	exposure: number;
	bloom: number;
	background: 'midnight' | 'ink' | 'plum';
	distance: number;
	quality: 'auto' | 'high' | 'medium' | 'low';
	pointer: boolean;
}

export type NumericSetting = {
	[K in keyof SplatSettings]: SplatSettings[K] extends number ? K : never;
}[keyof SplatSettings];

export const NUMERIC_LIMITS: Record<NumericSetting, { min: number; max: number; step: number }> = {
	seed: { min: 0, max: 4294967295, step: 1 },
	density: { min: 0.25, max: 1.5, step: 0.05 },
	size: { min: 0.3, max: 2.5, step: 0.05 },
	flow: { min: 0, max: 2, step: 0.05 },
	speed: { min: 0, max: 2, step: 0.05 },
	glow: { min: 0, max: 2, step: 0.05 },
	scale: { min: 0.6, max: 1.5, step: 0.05 },
	twist: { min: -2, max: 2, step: 0.05 },
	curl: { min: 0, max: 2, step: 0.05 },
	spread: { min: 0.2, max: 1.8, step: 0.05 },
	hollow: { min: 0, max: 1, step: 0.05 },
	symmetry: { min: 1, max: 8, step: 1 },
	opacity: { min: 0.1, max: 1, step: 0.05 },
	softness: { min: 0.2, max: 1, step: 0.05 },
	elongation: { min: 1, max: 5, step: 0.1 },
	orientation: { min: 0, max: 1, step: 0.05 },
	hue: { min: 0, max: 360, step: 1 },
	saturation: { min: 0, max: 1.5, step: 0.05 },
	gradient: { min: 0.2, max: 2, step: 0.05 },
	turbulence: { min: 0, max: 1.5, step: 0.05 },
	breathing: { min: 0, max: 1, step: 0.05 },
	rotation: { min: 0, max: 0.5, step: 0.01 },
	exposure: { min: 0.4, max: 2, step: 0.05 },
	bloom: { min: 0, max: 1.5, step: 0.05 },
	distance: { min: 4, max: 12, step: 0.1 }
};

export const PALETTES: {
	id: string;
	name: string;
	colors: [string, string, string, string, string];
}[] = [
	{
		id: 'spectral',
		name: 'Spectral',
		colors: ['#22e8e0', '#3980ff', '#9c50f5', '#ff5db6', '#ffd681']
	},
	{
		id: 'afterglow',
		name: 'Afterglow',
		colors: ['#6144ff', '#b93bdf', '#ff5788', '#ff975e', '#ffdf96']
	},
	{
		id: 'glacier',
		name: 'Glacier',
		colors: ['#18396e', '#2877de', '#25bfcf', '#8ff5db', '#ecfff1']
	},
	{ id: 'orchid', name: 'Orchid', colors: ['#453ab4', '#8c5de5', '#d57fdf', '#f5b4d5', '#ffedc9'] },
	{
		id: 'verdant',
		name: 'Verdant',
		colors: ['#145f68', '#00bda4', '#83e270', '#e4ee8a', '#ffe6a0']
	},
	{ id: 'ember', name: 'Ember', colors: ['#703da0', '#d94981', '#ff684a', '#ffb449', '#fff0b0'] }
];

export const STYLES: { id: SplatStyle; name: string; description: string }[] = [
	{ id: 'gaussian', name: 'Gaussian', description: 'Soft, translucent clouds of colour.' },
	{
		id: 'anisotropic',
		name: 'Anisotropic',
		description: 'Elongated marks following the sculpture’s flow.'
	},
	{ id: 'surfel', name: 'Surfel', description: 'Fine elliptical discs that reveal the surface.' },
	{ id: 'ink', name: 'Ink', description: 'Dense, painterly marks with textured edges.' },
	{ id: 'spark', name: 'Spark', description: 'Crisp luminous points with a delicate halo.' },
	{ id: 'hybrid', name: 'Hybrid', description: 'A soft cloud threaded with tiny sparks.' }
];

export const DEFAULT_SETTINGS: SplatSettings = {
	preset: 'aurora-knot',
	style: 'hybrid',
	palette: 'spectral',
	seed: 1847,
	density: 1,
	size: 1,
	flow: 0.6,
	speed: 0.5,
	glow: 0.6,
	scale: 1,
	twist: 0.25,
	curl: 0.4,
	spread: 0.85,
	hollow: 0.25,
	symmetry: 3,
	opacity: 0.65,
	softness: 0.8,
	elongation: 2.4,
	orientation: 0.1,
	hue: 0,
	saturation: 1,
	gradient: 1,
	colorBy: 'position',
	turbulence: 0.3,
	breathing: 0.2,
	rotation: 0.07,
	exposure: 1.1,
	bloom: 0.5,
	background: 'midnight',
	distance: 7,
	quality: 'auto',
	pointer: false
};

export const PRESETS: {
	id: string;
	name: string;
	kicker: string;
	description: string;
	accent: string;
	settings: Partial<SplatSettings>;
}[] = [
	{
		id: 'aurora-knot',
		name: 'Aurora Knot',
		kicker: '01 / INTERWOVEN LIGHT',
		description: 'Ribbons of colour, tied into an endless luminous knot.',
		accent: '#72e7da',
		settings: { style: 'hybrid', palette: 'spectral', symmetry: 3, curl: 0.4, twist: 0.25 }
	},
	{
		id: 'chromatic-nebula',
		name: 'Chromatic Nebula',
		kicker: '02 / A CLOUD WITHIN A CLOUD',
		description: 'Drifting veils surround a quiet pocket of deep space.',
		accent: '#b88ff6',
		settings: {
			style: 'gaussian',
			palette: 'orchid',
			spread: 1.25,
			size: 1.4,
			opacity: 0.45,
			hollow: 0.65,
			curl: 0.8,
			symmetry: 2,
			flow: 0.85,
			bloom: 0.65,
			twist: -0.25
		}
	},
	{
		id: 'liquid-bloom',
		name: 'Liquid Bloom',
		kicker: '03 / A SCULPTURE IN BREATH',
		description: 'Petal-like sheets unfold around a glowing heart.',
		accent: '#ffae9d',
		settings: {
			style: 'anisotropic',
			palette: 'afterglow',
			symmetry: 5,
			curl: 0.3,
			twist: 0.4,
			spread: 0.7,
			breathing: 0.6,
			elongation: 3.2,
			flow: 0.4
		}
	},
	{
		id: 'magnetic-storm',
		name: 'Magnetic Storm',
		kicker: '04 / INVISIBLE FORCES',
		description: 'Fine currents loop and spiral around an unseen field.',
		accent: '#a4e3ef',
		settings: {
			style: 'spark',
			palette: 'glacier',
			symmetry: 3,
			curl: 1.1,
			flow: 1.2,
			speed: 0.8,
			size: 0.8,
			spread: 0.55,
			turbulence: 0.7,
			glow: 0.8
		}
	},
	{
		id: 'prism-reef',
		name: 'Prism Reef',
		kicker: '05 / A GARDEN OF COLOUR',
		description: 'Jewel-like branches grow into a strange, delicate reef.',
		accent: '#d5ef9a',
		settings: {
			style: 'surfel',
			palette: 'verdant',
			symmetry: 6,
			curl: 0.25,
			spread: 0.65,
			twist: -0.2,
			size: 0.85,
			elongation: 1.5,
			flow: 0.3,
			hollow: 0.1
		}
	},
	{
		id: 'impossible-torus',
		name: 'Impossible Torus',
		kicker: '06 / AN ENDLESS RETURN',
		description: 'A folded ring carries little rivers through its own interior.',
		accent: '#ffbc72',
		settings: {
			style: 'ink',
			palette: 'ember',
			symmetry: 4,
			curl: 0.55,
			twist: 0.8,
			spread: 0.8,
			elongation: 2.8,
			hollow: 0.5,
			flow: 0.5,
			opacity: 0.7
		}
	}
];

const member = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T =>
	typeof value === 'string' && choices.includes(value as T) ? (value as T) : fallback;

export function normalizeSettings(input: unknown): SplatSettings {
	const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
	const next = { ...DEFAULT_SETTINGS };
	for (const key of Object.keys(NUMERIC_LIMITS) as NumericSetting[]) {
		const value = raw[key];
		if (typeof value !== 'number' || !Number.isFinite(value)) continue;
		const { min, max, step } = NUMERIC_LIMITS[key];
		next[key] = Math.max(min, Math.min(max, step === 1 ? Math.round(value) : value));
	}
	next.preset = member(
		raw.preset,
		PRESETS.map((preset) => preset.id),
		next.preset
	);
	next.style = member(
		raw.style,
		STYLES.map((style) => style.id),
		next.style
	);
	next.palette = member(
		raw.palette,
		PALETTES.map((palette) => palette.id),
		next.palette
	);
	next.colorBy = member(raw.colorBy, ['position', 'depth', 'flow'], next.colorBy);
	next.background = member(raw.background, ['midnight', 'ink', 'plum'], next.background);
	next.quality = member(raw.quality, ['auto', 'high', 'medium', 'low'], next.quality);
	if (typeof raw.pointer === 'boolean') next.pointer = raw.pointer;
	return next;
}

export function presetSettings(id: string, seed = DEFAULT_SETTINGS.seed): SplatSettings {
	const preset = PRESETS.find((item) => item.id === id) ?? PRESETS[0];
	return normalizeSettings({ ...DEFAULT_SETTINGS, ...preset.settings, preset: preset.id, seed });
}

const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof SplatSettings)[];

/** A bounded, versioned URL payload. No browser globals or persistence are required. */
export function encodeSettings(settings: SplatSettings): string {
	const clean = normalizeSettings(settings);
	return new URLSearchParams({
		v: '1',
		s: JSON.stringify(SETTINGS_KEYS.map((key) => clean[key]))
	}).toString();
}

export function decodeSettings(search: string): SplatSettings {
	if (typeof search !== 'string' || search.length > 4096) return { ...DEFAULT_SETTINGS };
	try {
		const params = new URLSearchParams(search.replace(/^\?/, ''));
		if (params.get('v') !== '1') return { ...DEFAULT_SETTINGS };
		const values: unknown = JSON.parse(params.get('s') ?? 'null');
		if (!Array.isArray(values) || values.length !== SETTINGS_KEYS.length)
			return { ...DEFAULT_SETTINGS };
		return normalizeSettings(Object.fromEntries(SETTINGS_KEYS.map((key, i) => [key, values[i]])));
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

function randomStream(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let n = state;
		n = Math.imul(n ^ (n >>> 15), n | 1);
		n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
		return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
	};
}

export function randomizeSettings(seed: number): SplatSettings {
	const random = randomStream(seed);
	const result = presetSettings(PRESETS[Math.floor(random() * PRESETS.length)].id, seed);
	return normalizeSettings({
		...result,
		palette: PALETTES[Math.floor(random() * PALETTES.length)].id,
		style: STYLES[Math.floor(random() * STYLES.length)].id,
		twist: random() * 1.8 - 0.9,
		curl: 0.2 + random() * 0.8,
		spread: 0.5 + random() * 0.7,
		hue: Math.floor(random() * 55),
		glow: 0.3 + random() * 0.6,
		flow: 0.35 + random() * 0.65,
		size: 0.7 + random() * 0.65,
		breathing: random() * 0.45
	});
}

type Vec3 = [number, number, number];
const TAU = Math.PI * 2;

/** Centre lines and surfaces use the same parameterization at every quality tier. */
function surface(
	preset: string,
	t: number,
	u: number,
	v: number,
	branch: number,
	s: SplatSettings
): Vec3 {
	const ct = Math.cos(t),
		st = Math.sin(t);
	const width = s.spread;
	switch (preset) {
		case 'chromatic-nebula': {
			const latitude = (u - 0.5) * Math.PI;
			const lobes = s.symmetry + 2;
			const ripple =
				0.14 * Math.sin(t * lobes + latitude * 4) +
				0.1 * Math.cos(latitude * (lobes + 2) - t * (lobes - 1));
			const r = 1.35 + ripple + v * width * 0.5 + s.hollow * 0.35;
			return [
				r * Math.cos(latitude) * ct,
				r * Math.sin(latitude) * 0.8,
				r * Math.cos(latitude) * st * 0.82 + 0.23 * Math.sin(t * 3 + latitude * 2)
			];
		}
		case 'liquid-bloom': {
			const radius = 0.2 + u * 1.65;
			const petal = Math.cos(t * s.symmetry + u * 2);
			const r = radius * (1 + 0.2 * petal);
			return [r * ct, u * u * 1.4 - 0.6 + petal * u * 0.35 + v * width * 0.12, r * st * 0.85];
		}
		case 'magnetic-storm': {
			const offset = (branch * TAU) / s.symmetry;
			const r = 0.45 + u * 1.55;
			const a = t + offset;
			const band = Math.sin(t * 2 + offset);
			return [
				r * Math.cos(a),
				band * (0.45 + u * 0.65) + v * width * 0.09,
				r * Math.sin(a) * 0.72 + Math.cos(t * 3 + offset) * 0.25
			];
		}
		case 'prism-reef': {
			const offset = (branch * TAU) / s.symmetry;
			const fork = Math.floor(u * 4);
			const length = (u * 4 - fork) * 0.72;
			const a = offset + fork * 0.34 + Math.sin(t * 2) * 0.08;
			const r = 0.22 + fork * 0.29 + length * 0.55;
			const tube = 0.055 + (1 - u) * 0.09;
			return [
				Math.cos(a) * r + ct * tube * width,
				-1.12 + fork * 0.43 + length + Math.sin(t * 3 + offset) * 0.12,
				Math.sin(a) * r + st * tube * width
			];
		}
		case 'impossible-torus': {
			const tube = (0.23 + Math.sin(t * s.symmetry) * 0.06) * width;
			const p = u * TAU;
			const r = 1.38 + tube * Math.cos(p) + 0.16 * Math.cos(t * 3);
			return [
				r * ct,
				tube * Math.sin(p) + 0.55 * Math.sin(t * 2),
				r * st * 0.8 + 0.17 * Math.cos(t * 3)
			];
		}
		default: {
			const ribbon = (u - 0.5) * width * (0.32 + 0.16 * Math.sin(t * 6));
			const phase = t * s.symmetry;
			const r = 1.05 + 0.36 * Math.cos(phase) + ribbon;
			return [
				r * ct,
				0.62 * Math.sin(phase) + ribbon * Math.sin(t * 2) + v * 0.035,
				r * st + ribbon * Math.cos(t * 2)
			];
		}
	}
}

function deform(point: Vec3, t: number, u: number, s: SplatSettings): Vec3 {
	let [x, y, z] = point;
	const twist = y * s.twist * 0.6;
	const c = Math.cos(twist),
		sn = Math.sin(twist);
	[x, z] = [x * c - z * sn, x * sn + z * c];
	const curl = s.curl * 0.12;
	x += Math.sin(y * 3 + t * 2) * curl;
	y += Math.cos(z * 3 + t) * curl;
	z += Math.sin(x * 3 - u * TAU) * curl;
	const radial = Math.hypot(x, y, z);
	const expansion = 1 + (s.hollow * 0.16) / Math.max(0.35, radial);
	return [x * s.scale * expansion, y * s.scale * expansion, z * s.scale * expansion];
}

export interface SplatGeometry {
	positions: Float32Array;
	tangents: Float32Array;
	coordinates: Float32Array;
	randoms: Float32Array;
}

/** Geometry builds only on structural changes; animated flow belongs to the GPU. */
export function generateSplats(settings: SplatSettings, count: number): SplatGeometry {
	const s = normalizeSettings(settings);
	const total = Number.isFinite(count) ? Math.max(0, Math.min(150000, Math.floor(count))) : 0;
	const positions = new Float32Array(total * 3);
	const tangents = new Float32Array(total * 3);
	const coordinates = new Float32Array(total);
	const randoms = new Float32Array(total);
	const random = randomStream(s.seed);
	for (let i = 0; i < total; i++) {
		const t = random() * TAU;
		const u = random();
		const v = (random() + random() + random() - 1.5) / 1.5;
		const branch = Math.floor(random() * s.symmetry);
		const p = deform(surface(s.preset, t, u, v, branch, s), t, u, s);
		const q = deform(surface(s.preset, t + 0.002, u, v, branch, s), t + 0.002, u, s);
		const dx = q[0] - p[0],
			dy = q[1] - p[1],
			dz = q[2] - p[2];
		const length = Math.hypot(dx, dy, dz) || 1;
		// A small population of coherent satellite wisps breaks the geometric outline.
		const satellite = random() > 0.955 ? 1 + random() * 0.28 * s.spread : 1;
		positions.set([p[0] * satellite, p[1] * satellite, p[2] * satellite], i * 3);
		tangents.set([dx / length, dy / length, dz / length], i * 3);
		coordinates[i] = ((t / TAU) * 0.75 + u * 0.25) % 1;
		randoms[i] = random();
	}
	return { positions, tangents, coordinates, randoms };
}
