export const MONDRIAN_GENERATOR_VERSION = 1 as const;

export const MAX_PANELS = 30 as const;
export const MIN_PANELS = 6 as const;

export type ColorEmphasis = 'balanced' | 'red' | 'yellow' | 'blue';

export type PresetId = 'balanced' | 'spare' | 'red-accent' | 'dense';

export type PaletteColorKey = 'warm-white' | 'near-black' | 'red' | 'yellow' | 'blue' | 'quiet-gray';

export type RegionColorKey = 'warm-white' | 'red' | 'yellow' | 'blue';

export interface RgbColor {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly hex: string;
}

/**
 * Product palette choices inspired by Mondrian's rectilinear abstractions.
 * These are tuned digital colors for screen clarity and oil-surface shading,
 * not historically verified pigment measurements.
 */
export const MONDRIAN_PALETTE: Readonly<Record<PaletteColorKey, RgbColor>> = {
	'warm-white': { r: 243, g: 239, b: 227, hex: '#F3EFE3' },
	'near-black': { r: 23, g: 23, b: 20, hex: '#171714' },
	red: { r: 200, g: 59, b: 48, hex: '#C83B30' },
	yellow: { r: 232, g: 190, b: 53, hex: '#E8BE35' },
	blue: { r: 36, g: 82, b: 148, hex: '#245294' },
	'quiet-gray': { r: 216, g: 213, b: 204, hex: '#D8D5CC' }
};

export interface MondrianParameters {
	readonly panels: number;
	readonly unevenSpacing: number;
	readonly colorArea: number;
	readonly lineWidth: number;
	readonly paintTexture: number;
	readonly paintingTime: number;
	readonly colorEmphasis: ColorEmphasis;
}

export interface MondrianState extends MondrianParameters {
	readonly version: typeof MONDRIAN_GENERATOR_VERSION;
	readonly seed: number;
	readonly aspectRatio: number;
}

export interface KnobSpec<K extends keyof MondrianParameters = keyof MondrianParameters> {
	readonly key: K;
	readonly label: string;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	readonly defaultValue: number;
	readonly unit: string;
	readonly minLabel?: string;
	readonly maxLabel?: string;
	readonly description: string;
}

export const KNOB_SPECS: readonly KnobSpec<
	'panels' | 'unevenSpacing' | 'colorArea' | 'lineWidth' | 'paintTexture' | 'paintingTime'
>[] = [
	{
		key: 'panels',
		label: 'Panels',
		min: MIN_PANELS,
		max: MAX_PANELS,
		step: 1,
		defaultValue: 14,
		unit: '',
		description: 'Adds or removes rectangular divisions while keeping earlier splits intact.'
	},
	{
		key: 'unevenSpacing',
		label: 'Uneven spacing',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 65,
		unit: '%',
		description:
			'Changes the relative sizes of regions while keeping the same subdivision structure.'
	},
	{
		key: 'colorArea',
		label: 'Color area',
		min: 0,
		max: 60,
		step: 1,
		defaultValue: 28,
		unit: '%',
		description: 'Targets how much of the canvas area carries red, yellow, and blue.'
	},
	{
		key: 'lineWidth',
		label: 'Line width',
		min: 0.25,
		max: 1.5,
		step: 0.05,
		defaultValue: 0.7,
		unit: '%',
		minLabel: 'Thin',
		maxLabel: 'Bold',
		description: 'Makes the black boundaries thinner or bolder without moving any line.'
	},
	{
		key: 'paintTexture',
		label: 'Paint texture',
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 40,
		unit: '%',
		description:
			'Adjusts canvas weave, directional brush marks, and shallow ridges without altering layout.'
	},
	{
		key: 'paintingTime',
		label: 'Painting time',
		min: 3,
		max: 18,
		step: 1,
		defaultValue: 8,
		unit: 's',
		description:
			'Sets the brush-pass reveal duration while keeping the finished artwork identical.'
	}
] as const;

export interface MondrianPreset {
	readonly id: PresetId;
	readonly label: string;
	readonly description: string;
	readonly parameters: MondrianParameters;
}

export const MONDRIAN_PRESETS: readonly MondrianPreset[] = [
	{
		id: 'balanced',
		label: 'Balanced',
		description: 'Open warm-white space balanced with selective primary blocks and medium lines.',
		parameters: {
			panels: 14,
			unevenSpacing: 65,
			colorArea: 28,
			lineWidth: 0.7,
			paintTexture: 40,
			paintingTime: 8,
			colorEmphasis: 'balanced'
		}
	},
	{
		id: 'spare',
		label: 'Spare',
		description: 'Fewer divisions, thinner lines, and generous white space around quiet accents.',
		parameters: {
			panels: 9,
			unevenSpacing: 72,
			colorArea: 14,
			lineWidth: 0.5,
			paintTexture: 36,
			paintingTime: 7,
			colorEmphasis: 'balanced'
		}
	},
	{
		id: 'red-accent',
		label: 'Red accent',
		description: 'Gives red primary weight while keeping smaller blue or yellow counterweights.',
		parameters: {
			panels: 14,
			unevenSpacing: 68,
			colorArea: 26,
			lineWidth: 0.75,
			paintTexture: 44,
			paintingTime: 8,
			colorEmphasis: 'red'
		}
	},
	{
		id: 'dense',
		label: 'Dense',
		description: 'Adds finer subdivisions and smaller color blocks across a tighter line network.',
		parameters: {
			panels: 24,
			unevenSpacing: 58,
			colorArea: 34,
			lineWidth: 0.6,
			paintTexture: 42,
			paintingTime: 10,
			colorEmphasis: 'balanced'
		}
	}
] as const;

/** Curated and verified initial seed for first-visit playback and the worked visual experiment. */
export const INITIAL_CURATED_SEED = 100779;

export const DEFAULT_ASPECT_RATIO = 1.5;

export const DEFAULT_MONDRIAN_STATE: MondrianState = {
	version: MONDRIAN_GENERATOR_VERSION,
	seed: INITIAL_CURATED_SEED,
	aspectRatio: DEFAULT_ASPECT_RATIO,
	...MONDRIAN_PRESETS[0].parameters
};

export type SplitOrientation = 'vertical' | 'horizontal';

export interface NormalizedRect {
	readonly id: string;
	readonly index: number;
	readonly x0: number;
	readonly y0: number;
	readonly x1: number;
	readonly y1: number;
	readonly width: number;
	readonly height: number;
	readonly area: number;
	readonly depth: number;
}

export interface BoundarySegment {
	readonly id: string;
	readonly orientation: SplitOrientation;
	/** Position along the perpendicular axis (x for vertical, y for horizontal) in [0, 1]. */
	readonly coord: number;
	/** Start coordinate along the segment axis in [0, 1]. */
	readonly start: number;
	/** End coordinate along the segment axis in [0, 1]. */
	readonly end: number;
	readonly length: number;
	readonly splitOrder: number;
}

export interface LayoutLimitNotice {
	readonly clamped: boolean;
	readonly effectiveLineWidth: number;
	readonly reason: string | null;
}

export interface LayoutModel {
	readonly seed: number;
	readonly panels: number;
	readonly unevenSpacing: number;
	readonly aspectRatio: number;
	readonly lineWidth: number;
	readonly effectiveLineWidth: number;
	readonly lineThicknessX: number;
	readonly lineThicknessY: number;
	readonly regions: readonly NormalizedRect[];
	readonly boundaries: readonly BoundarySegment[];
	readonly candidateIndex: number;
	readonly limitNotice: LayoutLimitNotice;
}

export interface ColoredRegion extends NormalizedRect {
	readonly color: RegionColorKey;
}

export interface ColorAssignment {
	readonly regions: readonly ColoredRegion[];
	readonly colorByRegionId: Readonly<Record<string, RegionColorKey>>;
	readonly targetColorAreaPct: number;
	readonly actualColorAreaPct: number;
	readonly primaryCounts: Readonly<Record<'red' | 'yellow' | 'blue', number>>;
	readonly primaryAreaPct: Readonly<Record<'red' | 'yellow' | 'blue', number>>;
}

export interface CompositionModel {
	readonly state: MondrianState;
	readonly layout: LayoutModel;
	readonly colors: ColorAssignment;
	readonly description: string;
}

export interface RegionPaintPass {
	readonly regionId: string;
	readonly passIndex: number;
	readonly coat: 1 | 2;
	readonly orientation: SplitOrientation;
	/** +1 sweeps start->end, -1 sweeps end->start. */
	readonly direction: 1 | -1;
	readonly startProgress: number;
	readonly endProgress: number;
}

export interface BoundaryPaintPass {
	readonly boundaryId: string;
	readonly orientation: SplitOrientation;
	readonly direction: 1 | -1;
	readonly startProgress: number;
	readonly endProgress: number;
}

export interface PaintTimeline {
	readonly durationSeconds: number;
	readonly regionPasses: readonly RegionPaintPass[];
	readonly boundaryPasses: readonly BoundaryPaintPass[];
	readonly settleStartProgress: number;
}
