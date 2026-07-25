import type { ModelInputGains } from './types';

export const DEFAULT_DT_MS = 0.025;
export const DEFAULT_DURATION_MS = 1_000;
export const DEFAULT_DISPLAY_SAMPLE_INTERVAL_MS = 0.1;
export const DEFAULT_NOISE_SEED = 1_337;
export const DEFAULT_PAIRED_PULSE_ISI_MS = 12;

export const ALLOWED_DT_MS = [0.01, 0.025, 0.05, 0.1] as const;
export const ALLOWED_DURATION_MS = [250, 500, 1_000, 2_000] as const;

export const DEFAULT_MODEL_INPUT_GAINS: Readonly<ModelInputGains> = Object.freeze({
	'mcculloch-pitts': 1,
	lif: 500,
	izhikevich: 15,
	'fitzhugh-nagumo': 0.8,
	'hodgkin-huxley': 20
});

export const DEFAULT_GAINS = DEFAULT_MODEL_INPUT_GAINS;

export const MODEL_INPUT_GAIN_RANGES: Readonly<
	Record<keyof ModelInputGains, readonly [number, number]>
> = Object.freeze({
	'mcculloch-pitts': [0, 2],
	lif: [0, 1_000],
	izhikevich: [0, 30],
	'fitzhugh-nagumo': [0, 2],
	'hodgkin-huxley': [0, 40]
});

export const FARADAY_CONSTANT_C_PER_MOL = 96_485.332_12;
export const AVOGADRO_CONSTANT_PER_MOL = 6.022_140_76e23;
export const SODIUM_IONS_PER_ATP = 3;
export const DEFAULT_DELTA_G_ATP_KJ_PER_MOL = 50;
export const DELTA_G_ATP_RANGE_KJ_PER_MOL = [45, 60] as const;

export const REDUCED_MODEL_ENERGY_REASON =
	'Biological energy: not identifiable from this model’s state equations.';

export const HH_ENERGY_CAVEAT =
	'ATP-equivalent sodium-restoration estimate only; it is not total neuronal metabolic expenditure and omits geometry, synapses, calcium, glia, resting maintenance beyond the matched baseline, and other cellular costs.';
