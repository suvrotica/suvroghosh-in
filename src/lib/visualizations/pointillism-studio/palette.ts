import { hashMarkSigned, hashMarkUnit } from './prng.ts';
import {
	INDEX_TO_SURFACE_CATEGORY,
	type CandidateMark,
	type ColoredMark,
	type SurfaceCategory
} from './types.ts';

function srgbToLinear(cByte: number): number {
	const c = cByte / 255;
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgbByte(lin: number): number {
	const clamped = lin <= 0 ? 0 : lin >= 1 ? 1 : lin;
	const s = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
	return Math.max(0, Math.min(255, Math.round(s * 255)));
}

function rgbToOklab(rByte: number, gByte: number, bByte: number): [number, number, number] {
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

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

	return [linearToSrgbByte(rLin), linearToSrgbByte(gLin), linearToSrgbByte(bLin)];
}

/**
 * Curated Neo-Impressionist neighboring hue offsets in OKLab (da, db, tiny dL).
 * Keeps Palette contrast (light-dark separation) and Color variation (neighboring hue diversity)
 * genuinely orthogonal while avoiding independent RGB confetti.
 */
function categoryHueNote(
	cat: SurfaceCategory,
	noteSelector: number,
	lit: number
): [number, number, number] {
	// Returns [dL_subtle, da, db] at unit variation strength
	if (cat === 'foliage') {
		if (lit < 0.52) {
			// Shaded canopy: cool viridian, teal-blue, and muted violet-green shadow notes
			if (noteSelector < 0.36) return [-0.012, -0.038, -0.028];
			if (noteSelector < 0.72) return [0.008, -0.046, 0.018];
			return [-0.015, 0.018, -0.038];
		}
		// Sunlit canopy: warm yellow-green, olive-gold, and fresh emerald notes
		if (noteSelector < 0.38) return [0.016, -0.032, 0.052];
		if (noteSelector < 0.72) return [-0.008, -0.048, 0.022];
		if (noteSelector < 0.9) return [0.018, 0.008, 0.048];
		return [-0.012, -0.024, -0.024];
	}

	if (cat === 'water') {
		// River & creek water: cerulean, deep teal, reflected olive, and sunlit warm stone flecks
		if (noteSelector < 0.34) return [-0.008, -0.022, -0.048];
		if (noteSelector < 0.64) return [0.006, -0.042, -0.014];
		if (noteSelector < 0.84) return [-0.006, -0.028, 0.028];
		return [0.018, 0.014, 0.042];
	}

	if (cat === 'limestone' || cat === 'wall') {
		if (lit < 0.58) {
			// Shaded limestone/stucco: cool lavender-slate, muted periwinkle, and warm buff notes
			if (noteSelector < 0.45) return [-0.01, 0.016, -0.038];
			if (noteSelector < 0.78) return [0.005, -0.01, -0.028];
			return [0.01, 0.012, 0.026];
		}
		// Sunlit wall/limestone: Naples cream, warm peach-ochre, and cool sky-reflected notes
		if (noteSelector < 0.44) return [0.012, 0.012, 0.038];
		if (noteSelector < 0.76) return [0.006, 0.024, 0.022];
		return [-0.008, -0.008, -0.03];
	}

	if (cat === 'path') {
		if (lit < 0.58) {
			// Dappled shaded walkway: cool violet-taupe, slate, and warm stone notes
			if (noteSelector < 0.48) return [-0.01, 0.018, -0.034];
			if (noteSelector < 0.8) return [0.004, -0.012, -0.024];
			return [0.01, 0.014, 0.028];
		}
		if (noteSelector < 0.45) return [0.01, 0.01, 0.032];
		if (noteSelector < 0.78) return [-0.006, 0.018, 0.014];
		return [-0.008, -0.008, -0.026];
	}

	if (cat === 'sky' || cat === 'cloud' || cat === 'distant-hill') {
		if (noteSelector < 0.42) return [0.008, -0.016, -0.032];
		if (noteSelector < 0.76) return [-0.006, 0.01, -0.028];
		return [0.01, -0.006, 0.022];
	}

	if (cat === 'person-skin') {
		// Controlled subtle warm/cool undertone variation so figures stay coherent and readable
		if (noteSelector < 0.48) return [0.006, 0.014, 0.014];
		if (noteSelector < 0.82) return [-0.005, 0.006, 0.018];
		return [-0.006, -0.004, -0.012];
	}

	if (cat === 'person-hair') {
		if (noteSelector < 0.5) return [0.006, 0.01, 0.014];
		return [-0.006, 0.004, -0.014];
	}

	if (cat === 'person-cloth' || cat === 'stall' || cat === 'sign' || cat === 'prop') {
		// Coordinated woven neighboring hues around the garment or object's local color
		if (noteSelector < 0.36) return [0.01, 0.028, 0.024];
		if (noteSelector < 0.7) return [-0.008, -0.024, 0.026];
		return [-0.006, 0.014, -0.032];
	}

	// terrain, roof, trunk, structure, furniture
	if (noteSelector < 0.38) return [0.01, 0.018, 0.034];
	if (noteSelector < 0.72) return [-0.008, -0.024, 0.022];
	return [-0.008, 0.012, -0.028];
}

export function assignMarkColors(
	candidates: readonly CandidateMark[],
	activeCount: number,
	seed: number,
	paletteContrast: number,
	colorVariation: number
): ColoredMark[] {
	const cNorm = Math.max(0, Math.min(100, paletteContrast)) / 100;
	const vNorm = Math.max(0, Math.min(100, colorVariation)) / 100;

	// Palette contrast: 45% -> ~1.04 natural daylight; 0% -> 0.64 soft; 100% -> 1.52 crisp light-dark separation
	const contrastGain = 0.64 + cNorm * 0.88;
	const pivotL = 0.6;

	// Color variation: 0% -> very close hues (0.08); 40% -> balanced optical family (0.95); 100% -> bold divisionism (2.15)
	const variationStrength = 0.08 + Math.pow(vNorm, 1.08) * 2.07;

	const count = Math.min(activeCount, candidates.length);
	const out = new Array<ColoredMark>(count);

	for (let i = 0; i < count; i++) {
		const cand = candidates[i]!;
		const id = cand.id;
		const cat = INDEX_TO_SURFACE_CATEGORY[cand.categoryIndex] ?? 'terrain';

		const [baseL, baseA, baseB] = rgbToOklab(cand.baseR, cand.baseG, cand.baseB);

		// 1. Apply Palette contrast strictly on perceptual Lightness around pivotL
		const deltaL = (baseL - pivotL) * contrastGain;
		// Soft-shoulder clamping so extreme contrast stays rich paint rather than pure #000/#FFF clipping
		const contrastedL = Math.max(0.14, Math.min(0.95, pivotL + Math.tanh(deltaL * 1.45) / 1.45));
		// Slight chroma lift at higher contrast so darks and lights don't turn chalky
		const chromaContrastScale = 0.9 + cNorm * 0.22;

		// 2. Apply Color variation strictly from the isolated 'color' PRNG stream
		const noteSel = hashMarkUnit(seed, 'color', id, 0);
		const fineJitterA = hashMarkSigned(seed, 'color', id, 1) * 0.012;
		const fineJitterB = hashMarkSigned(seed, 'color', id, 2) * 0.012;
		const subtleValueJitter = hashMarkSigned(seed, 'color', id, 3) * 0.016 * (0.4 + vNorm * 0.6);

		const [noteDL, noteDA, noteDB] = categoryHueNote(cat, noteSel, cand.lit);

		const finalL = Math.max(
			0.12,
			Math.min(0.96, contrastedL + noteDL * Math.min(1.2, variationStrength * 0.65) + subtleValueJitter)
		);
		const finalA = baseA * chromaContrastScale + (noteDA + fineJitterA) * variationStrength;
		const finalB = baseB * chromaContrastScale + (noteDB + fineJitterB) * variationStrength;

		const [r, g, b] = oklabToRgb(finalL, finalA, finalB);

		// Subtle intra-dab pigment variation (unmixed oil streak within the same dab)
		const rimShift = hashMarkSigned(seed, 'color', id, 4);
		const [rimR, rimG, rimB] = oklabToRgb(
			Math.max(0.1, Math.min(0.97, finalL - 0.018 + rimShift * 0.014)),
			finalA + rimShift * 0.009,
			finalB - rimShift * 0.009
		);

		out[i] = {
			candidate: cand,
			r,
			g,
			b,
			rimR,
			rimG,
			rimB
		};
	}

	return out;
}
