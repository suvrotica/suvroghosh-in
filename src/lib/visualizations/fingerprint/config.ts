export type Preset = 'arch' | 'loop' | 'whorl';

export interface Settings {
	preset: Preset;
	spacing: number;
	position: number;
	timing: number;
	width: number;
	noise: number;
	seed: number;
}

export const MODEL_VERSION = 'fingertip-surface-v1';
export const KINETICS = { a: 0.001, K: 0.001, r: 0.75, mu: 0.4, nu: 5.5, D: 180 } as const;
export const LENGTH = 600;
export const RADIUS = 240;
export const END_TIME = 1_000;
export const BASE_CELL_SIZE = 2;
export const BASE_TIME_STEP = 0.5;
export const RAMP_DURATION = 100;
export const NOISE_LENGTH = 24;

export const LIMITS = {
	spacing: { min: 0.92, max: 1.12, step: 0.01 },
	position: { min: -0.15, max: 0.15, step: 0.01 },
	timing: { min: -24, max: 24, step: 1 },
	width: { min: 0.94, max: 1.08, step: 0.01 },
	noise: { min: 0, max: 0.02, step: 0.001 },
	seed: { min: 0, max: 4_294_967_295, step: 1 }
} as const;

export function positionRange(preset: Preset) {
	return preset === 'arch' ? { ...LIMITS.position, min: 0, max: 0 } : LIMITS.position;
}

export function timingRange(preset: Preset) {
	return preset === 'arch' ? { ...LIMITS.timing, min: 0 } : LIMITS.timing;
}

const BASE = { spacing: 1, position: 0, timing: 0, width: 1, noise: 0.012 };
export const PRESETS: Readonly<Record<Preset, Readonly<Settings>>> = {
	arch: { preset: 'arch', ...BASE, seed: 59 },
	loop: { preset: 'loop', ...BASE, seed: 7 },
	whorl: { preset: 'whorl', ...BASE, seed: 29 }
};
export const DEFAULT_SETTINGS = PRESETS.loop;

export function normalizeSettings(input: Settings): Settings {
	const preset = input.preset === 'arch' || input.preset === 'whorl' ? input.preset : 'loop';
	function bounded(key: Exclude<keyof Settings, 'preset'>, range: { min: number; max: number }) {
		const value = Number.isFinite(input[key]) ? input[key] : PRESETS[preset][key];
		return Math.min(range.max, Math.max(range.min, value));
	}
	return {
		preset,
		spacing: bounded('spacing', LIMITS.spacing),
		position: preset === 'arch' ? 0 : bounded('position', positionRange(preset)),
		timing: bounded('timing', timingRange(preset)),
		width: bounded('width', LIMITS.width),
		noise: bounded('noise', LIMITS.noise),
		seed: Math.floor(bounded('seed', LIMITS.seed))
	};
}

export function nailOnset(settings: Settings) {
	return settings.preset === 'arch' ? 100 : 50;
}

export function creaseOnset(settings: Settings) {
	return (settings.preset === 'arch' ? 0 : 50) + settings.timing;
}

export function initiationAnchors(settings: Settings) {
	const z = (settings.preset === 'whorl' ? 0.8 : 0.64) * LENGTH;
	return {
		pad:
			settings.preset === 'arch'
				? null
				: {
						theta:
							(settings.preset === 'whorl' ? 0 : Math.PI / 2 - (1.5 * z) / LENGTH) +
							settings.position,
						z
					},
		nail: { theta: Math.PI / 2, z: LENGTH + RADIUS * settings.width * Math.SQRT1_2 },
		crease: { theta: 0, z: 0 }
	};
}

export function meshDimensions(radius: number, meshScale = 1) {
	const capRows = Math.round(((Math.PI / 2) * radius * meshScale) / BASE_CELL_SIZE);
	const cylinderRows = Math.round((LENGTH * meshScale) / BASE_CELL_SIZE);
	return {
		columns: Math.round((Math.PI * radius * meshScale) / BASE_CELL_SIZE),
		rows: capRows + cylinderRows,
		capRows,
		radius,
		length: LENGTH
	};
}

export type Mesh = ReturnType<typeof meshDimensions>;

export function settingsRecord(input: Settings) {
	const settings = normalizeSettings(input);
	const radius = RADIUS * settings.width;
	return {
		model: MODEL_VERSION,
		settings,
		kinetics: { ...KINETICS },
		surface: { kind: 'hemicylinder and spherical quadrant', radius, length: LENGTH },
		diffusion: { activator: settings.spacing ** 2, inhibitor: settings.spacing ** 2 * KINETICS.D },
		initiation: {
			profile: settings.preset,
			padAmplitude: settings.preset === 'arch' ? 0 : 0.1,
			nailOnset: nailOnset(settings),
			creaseOnset: creaseOnset(settings),
			boundaryRamp: RAMP_DURATION,
			nailBoundary: settings.preset === 'arch' ? 'cap only' : 'cap and upper half of cylinder',
			noiseLength: NOISE_LENGTH
		},
		numerical: {
			scheme: 'finite volume with Douglas alternating direction implicit diffusion',
			quality: 'standard',
			meshScale: 1,
			mesh: meshDimensions(radius),
			timeStep: BASE_TIME_STEP,
			endTime: END_TIME
		}
	};
}
