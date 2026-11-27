import {
	CURATED_STUDY_SEEDS,
	GROUND_BASE_RGB,
	type ColorFieldState,
	type PaintingModel,
	type PigmentSwatch,
	type StudyId,
	type StudySpec
} from './types.ts';

export function srgbToLinear(cByte: number): number {
	const c = Math.max(0, Math.min(255, cByte)) / 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgbByte(lin: number): number {
	if (!Number.isFinite(lin)) return lin === Number.POSITIVE_INFINITY ? 255 : 0;
	const clamped = lin <= 0 ? 0 : lin >= 1 ? 1 : lin;
	const s = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
	return Math.max(0, Math.min(255, Math.round(s * 255)));
}

const SRGB_LUT_MAX = 16383;
const LINEAR_TO_SRGB_LUT = (() => {
	const lut = new Uint8Array(SRGB_LUT_MAX + 1);
	for (let i = 0; i <= SRGB_LUT_MAX; i++) {
		lut[i] = linearToSrgbByte(i / SRGB_LUT_MAX);
	}
	return lut;
})();

export function linearToSrgbByteFast(lin: number): number {
	if (!Number.isFinite(lin)) return lin === Number.POSITIVE_INFINITY ? 255 : 0;
	if (lin <= 0) return 0;
	if (lin >= 1) return 255;
	return LINEAR_TO_SRGB_LUT[Math.round(lin * SRGB_LUT_MAX)]!;
}

export function rgbToOklab(rByte: number, gByte: number, bByte: number): [number, number, number] {
	const r = srgbToLinear(rByte);
	const g = srgbToLinear(gByte);
	const b = srgbToLinear(bByte);

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

export function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

	return [
		Math.max(0.005, Math.min(1, rLin)),
		Math.max(0.005, Math.min(1, gLin)),
		Math.max(0.005, Math.min(1, bLin))
	];
}

export function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
	const [rLin, gLin, bLin] = oklabToLinearRgb(L, a, b);
	return [linearToSrgbByte(rLin), linearToSrgbByte(gLin), linearToSrgbByte(bLin)];
}

function parseHexRgb(hex: string): readonly [number, number, number] {
	const clean = hex.replace('#', '');
	const r = Number.parseInt(clean.slice(0, 2), 16);
	const g = Number.parseInt(clean.slice(2, 4), 16);
	const b = Number.parseInt(clean.slice(4, 6), 16);
	return [r, g, b];
}

function makeSwatch(
	id: string,
	label: string,
	hex: string,
	shiftOklab: readonly [number, number, number] = [0.022, 0.012, 0.014]
): PigmentSwatch {
	const rgb = parseHexRgb(hex);
	const lr = srgbToLinear(rgb[0]);
	const lg = srgbToLinear(rgb[1]);
	const lb = srgbToLinear(rgb[2]);
	const linearRgb: readonly [number, number, number] = [lr, lg, lb];
	const absorption: readonly [number, number, number] = [
		-Math.log(Math.max(0.018, lr)),
		-Math.log(Math.max(0.018, lg)),
		-Math.log(Math.max(0.018, lb))
	];
	const [L, a, b] = rgbToOklab(rgb[0], rgb[1], rgb[2]);
	const [sr, sg, sb] = oklabToLinearRgb(
		Math.max(0.08, Math.min(0.95, L + shiftOklab[0])),
		a + shiftOklab[1],
		b + shiftOklab[2]
	);
	const shiftLinearRgb: readonly [number, number, number] = [sr - lr, sg - lg, sb - lb];
	return {
		id,
		label,
		hex,
		rgb,
		linearRgb,
		absorption,
		shiftLinearRgb
	};
}

export const STUDY_BY_ID: Readonly<Record<StudyId, StudySpec>> = {
	'rothko-nocturne': {
		id: 'rothko-nocturne',
		label: 'Rothko Nocturne',
		shortLabel: 'Rothko Nocturne',
		archetype: 'stacked-multiform',
		description:
			'Stacked softly feathered horizontal rectangles in Venetian maroon, burnt sienna, and smoked indigo hovering over warm primed cotton.',
		defaultSeed: CURATED_STUDY_SEEDS['rothko-nocturne'],
		groundHex: '#E8E0D2',
		groundBaseRgb: GROUND_BASE_RGB,
		palette: [
			makeSwatch('venetian-maroon', 'Venetian Maroon', '#6E2326', [0.026, 0.014, 0.008]),
			makeSwatch('burnt-sienna', 'Burnt Sienna Rust', '#B54B2E', [0.028, 0.012, 0.018]),
			makeSwatch('smoked-indigo', 'Smoked Indigo Plum', '#2B253A', [0.024, 0.008, -0.014]),
			makeSwatch('amber-ochre', 'Warm Amber Ochre', '#C98A3A', [0.024, 0.008, 0.016]),
			makeSwatch('charcoal-umber', 'Charcoal Umber', '#2A221F', [0.02, 0.006, 0.006]),
			makeSwatch('pale-gold-haze', 'Pale Gold Haze', '#DEC28A', [-0.022, 0.008, 0.014])
		]
	},
	'frankenthaler-wash': {
		id: 'frankenthaler-wash',
		label: 'Frankenthaler Wash',
		shortLabel: 'Frankenthaler Wash',
		archetype: 'soak-stain',
		description:
			'Asymmetric fluid soak-stain washes of cerulean, terracotta rose, and sage viridian bleeding directly into unprimed warm cotton duck.',
		defaultSeed: CURATED_STUDY_SEEDS['frankenthaler-wash'],
		groundHex: '#E9DFCD',
		groundBaseRgb: [233, 223, 205],
		palette: [
			makeSwatch('cerulean-wash', 'Cerulean Wash', '#3B7DA8', [0.026, -0.012, -0.018]),
			makeSwatch('terracotta-rose', 'Terracotta Rose', '#C86552', [0.026, 0.016, 0.012]),
			makeSwatch('sage-viridian', 'Sage Viridian', '#5A866D', [0.024, -0.014, 0.01]),
			makeSwatch('raw-sienna-gold', 'Raw Sienna Gold', '#C99546', [0.024, 0.01, 0.016]),
			makeSwatch('deep-cobalt', 'Deep Cobalt', '#284B7A', [0.026, -0.008, -0.018]),
			makeSwatch('warm-apricot', 'Warm Apricot', '#DDA378', [-0.02, 0.012, 0.014])
		]
	},
	'ochre-horizon': {
		id: 'ochre-horizon',
		label: 'Ochre Horizon',
		shortLabel: 'Ochre Horizon',
		archetype: 'stacked-multiform',
		description:
			'Sunlit horizontal bands of raw ochre, burnt coral, and slate mist layered over pale chalk-primed linen.',
		defaultSeed: CURATED_STUDY_SEEDS['ochre-horizon'],
		groundHex: '#EFE8DA',
		groundBaseRgb: [239, 232, 218],
		palette: [
			makeSwatch('raw-ochre', 'Raw Ochre', '#C88B36', [0.024, 0.008, 0.018]),
			makeSwatch('burnt-coral', 'Burnt Coral', '#BF593E', [0.026, 0.016, 0.012]),
			makeSwatch('slate-mist', 'Slate Mist', '#576E82', [0.024, -0.008, -0.014]),
			makeSwatch('deep-umber', 'Deep Umber', '#4E3A2E', [0.022, 0.008, 0.008]),
			makeSwatch('saffron-glow', 'Saffron Glow', '#DFB55B', [-0.022, 0.006, 0.016]),
			makeSwatch('chalk-cream', 'Chalk Cream', '#D6C4A4', [-0.02, 0.006, 0.012])
		]
	},
	'cobalt-veil': {
		id: 'cobalt-veil',
		label: 'Cobalt Veil',
		shortLabel: 'Cobalt Veil',
		archetype: 'soak-stain',
		description:
			'Translucent cool veils of ultramarine, Prussian teal, and violet slate drifting across cool stone-toned cotton.',
		defaultSeed: CURATED_STUDY_SEEDS['cobalt-veil'],
		groundHex: '#E8E7E0',
		groundBaseRgb: [232, 231, 224],
		palette: [
			makeSwatch('ultramarine', 'Ultramarine', '#2E5090', [0.026, -0.008, -0.02]),
			makeSwatch('prussian-teal', 'Prussian Teal', '#256470', [0.024, -0.014, -0.012]),
			makeSwatch('violet-slate', 'Violet Slate', '#584C72', [0.024, 0.01, -0.016]),
			makeSwatch('celadon-mist', 'Celadon Mist', '#7B9B8E', [-0.022, -0.012, 0.008]),
			makeSwatch('indigo-night', 'Indigo Night', '#1E2C4A', [0.024, 0.006, -0.016]),
			makeSwatch('pale-ice', 'Pale Ice Blue', '#B3C6D0', [-0.022, -0.008, -0.012])
		]
	},
	'terra-stillness': {
		id: 'terra-stillness',
		label: 'Terra Stillness',
		shortLabel: 'Terra Stillness',
		archetype: 'stacked-multiform',
		description:
			'Quiet mineral earth fields in terracotta clay, olive earth, and warm sand resting on raw canvas.',
		defaultSeed: CURATED_STUDY_SEEDS['terra-stillness'],
		groundHex: '#EAE1D1',
		groundBaseRgb: [234, 225, 209],
		palette: [
			makeSwatch('terracotta-clay', 'Terracotta Clay', '#A64D38', [0.026, 0.014, 0.012]),
			makeSwatch('olive-earth', 'Olive Earth', '#676C42', [0.024, -0.01, 0.014]),
			makeSwatch('warm-sand', 'Warm Sand', '#CFA96E', [-0.02, 0.008, 0.014]),
			makeSwatch('espresso-umber', 'Espresso Umber', '#3B2C24', [0.022, 0.008, 0.008]),
			makeSwatch('iron-violet', 'Iron Violet', '#64454B', [0.024, 0.012, -0.006]),
			makeSwatch('limestone-buff', 'Limestone Buff', '#C9B898', [-0.02, 0.006, 0.012])
		]
	}
} as const;

export const STUDIES: readonly StudySpec[] = [
	STUDY_BY_ID['rothko-nocturne'],
	STUDY_BY_ID['frankenthaler-wash'],
	STUDY_BY_ID['ochre-horizon'],
	STUDY_BY_ID['cobalt-veil'],
	STUDY_BY_ID['terra-stillness']
] as const;

export const STUDY_LIST: readonly StudySpec[] = STUDIES;

export const STUDY_INDEX: Readonly<Record<StudyId, number>> = {
	'rothko-nocturne': 0,
	'frankenthaler-wash': 1,
	'ochre-horizon': 2,
	'cobalt-veil': 3,
	'terra-stillness': 4
} as const;

export function describePaintingAccessible(state: ColorFieldState, model: PaintingModel): string {
	const spec = Object.prototype.hasOwnProperty.call(STUDY_BY_ID, state.studyId)
		? STUDY_BY_ID[state.studyId]
		: STUDY_BY_ID['rothko-nocturne'];

	const regionCount = model.regions.length;
	const pigmentLabels = model.regions.slice(0, 4).map((r) => r.pigment.label.toLowerCase());
	const pigmentPhrase =
		pigmentLabels.length >= 2
			? `${pigmentLabels.slice(0, -1).join(', ')}, and ${pigmentLabels[pigmentLabels.length - 1]}`
			: (pigmentLabels[0] ?? 'layered studio pigments');

	const edgeWord =
		state.edgeSoftness <= 12
			? 'crisp sharp'
			: state.edgeSoftness <= 45
				? 'lightly feathered'
				: state.edgeSoftness <= 75
					? 'softened'
					: 'widely diffused';

	const transWord =
		state.transparency <= 25
			? 'dense low-transparency'
			: state.transparency <= 65
				? 'translucent layered'
				: 'airy high-transparency';

	const texturePhrase =
		state.canvasTexture === 0
			? 'flat untextured ground'
			: `unbleached woven cotton-duck canvas (${state.canvasTexture}% texture)`;

	const archetypePhrase =
		spec.archetype === 'stacked-multiform'
			? 'stacked horizontal color-field composition'
			: 'soak-stain organic color-field composition';

	return `${spec.label} non-figurative ${archetypePhrase} (seed ${state.seed}) on ${texturePhrase}: ${regionCount} color areas at ${state.areaSize}% size with ${edgeWord} edges (${state.edgeSoftness}% edge softness) and ${transWord} glaze passes (${state.transparency}% paint transparency) in ${pigmentPhrase}.`;
}
