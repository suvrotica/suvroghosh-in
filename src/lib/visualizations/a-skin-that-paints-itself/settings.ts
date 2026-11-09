import type { PresetId } from '../how-spots-and-stripes-form/types.ts';

export const WIDTH_MIN = 24;
export const WIDTH_MAX = 100;
export const WIDTH_STEP = 4;
export const LENGTH = 76.8;
export const REFERENCE_WIDTH = 40;
export const TAPER_TIP_WIDTH = 8;
export const OBSERVATION_TIME = 60;
export const SEED_MAX = 999999;

export type SkinShape = 'straight' | 'tapered';
export type SkinAppearance = PresetId;

export interface SkinSettings {
	shape: SkinShape;
	widthPercent: number;
	appearance: SkinAppearance;
	seed: number;
}

export const DEFAULT_SETTINGS: Readonly<SkinSettings> = Object.freeze({
	shape: 'straight',
	widthPercent: WIDTH_MIN,
	appearance: 'stripes',
	seed: 1952
});

export const SHAPE_PRESETS = {
	broad: { shape: 'straight', widthPercent: WIDTH_MAX },
	narrow: { shape: 'straight', widthPercent: WIDTH_MIN },
	tapered: { shape: 'tapered', widthPercent: 80 }
} as const;
