import { CIE_D65_SAMPLES } from './colour-data';

/**
 * Local plane film: air / a lossless, nondispersive n=1.333 film / air.
 * Incidence is measured from the surface normal in the air. Light is unpolarised.
 *
 * The amplitude sum is (r01 + r12 exp(i phi)) / (1 + r01*r12 exp(i phi)).
 * In a symmetric air/film/air stack r12=-r01, so its squared magnitude is
 * 4R sin²(phi/2) / ((1-R)² + 4R sin²(phi/2)), separately for s and p.
 * phi=4 pi n d cos(thetaFilm)/lambda. This includes repeated internal reflections
 * and the opposite interface phases; it approaches zero as thickness vanishes.
 * Derivation/conventions: S. J. Byrnes, Multilayer optical calculations (2020),
 * https://arxiv.org/abs/1603.02720, sections 2 and 4.
 *
 * Colour integrates official CIE 1931 2° observer × D65 × reflectance at 5 nm
 * intervals over 380-780 nm, with trapezoidal endpoints and Y(white)=1.
 * The full CIE dataset extends farther; our bounded visible sampling is an
 * approximation. XYZ-to-linear-sRGB uses the D65 matrix in CSS Color 4:
 * https://www.w3.org/TR/css-color-4/#color-conversion-code
 * No artist-selected wavelength-to-rainbow palette enters this calculation.
 */
export const FILM_REFRACTIVE_INDEX = 1.333;
export const MAX_THICKNESS_NM = 1200;
// The local-plane approximation stops before the grazing singular limit.
// On a sphere this clamps only r>sin(85°), the outer 0.38% of projected radius.
// Beyond this angle the 5 nm spectral quadrature also needs finer resolution.
export const MAX_ANGLE_DEG = 85;
export const LUT_WIDTH = 1025;
export const LUT_HEIGHT = 257;

export type LinearRgb = [number, number, number];

export interface ColourLut {
	/** RGBA8, RGB encoded as sRGB; alpha is opaque. Rows start at angle zero. */
	data: Uint8Array;
	width: number;
	height: number;
	maxThicknessNm: number;
	maxAngleDeg: number;
}

interface InterfaceOptics {
	cosFilm: number;
	sReflectance: number;
	pReflectance: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const bounded = (value: number, maximum: number) =>
	clamp(Number.isFinite(value) ? value : 0, 0, maximum);

function interfaceOptics(angleDeg: number): InterfaceOptics {
	const theta = (angleDeg * Math.PI) / 180;
	const cosAir = Math.cos(theta);
	const cosFilm = Math.sqrt(1 - (Math.sin(theta) / FILM_REFRACTIVE_INDEX) ** 2);
	const nCosFilm = FILM_REFRACTIVE_INDEX * cosFilm;
	const nCosAir = FILM_REFRACTIVE_INDEX * cosAir;
	return {
		cosFilm,
		sReflectance: ((cosAir - nCosFilm) / (cosAir + nCosFilm)) ** 2,
		pReflectance: ((nCosAir - cosFilm) / (nCosAir + cosFilm)) ** 2
	};
}

function reflectedPower(thicknessNm: number, wavelengthNm: number, optics: InterfaceOptics) {
	const halfPhase =
		(2 * Math.PI * FILM_REFRACTIVE_INDEX * thicknessNm * optics.cosFilm) / wavelengthNm;
	const interference = 4 * Math.sin(halfPhase) ** 2;
	const s = optics.sReflectance * interference;
	const p = optics.pReflectance * interference;
	return (
		0.5 * (s / ((1 - optics.sReflectance) ** 2 + s) + p / ((1 - optics.pReflectance) ** 2 + p))
	);
}

/** Spectral reflected fraction, 0-1. Valid for d>=0, |angle|<90°, lambda>0. */
export function reflectance(thicknessNm: number, angleDeg: number, wavelengthNm: number): number {
	if (
		!Number.isFinite(thicknessNm) ||
		thicknessNm < 0 ||
		!Number.isFinite(angleDeg) ||
		Math.abs(angleDeg) >= 90 ||
		!Number.isFinite(wavelengthNm) ||
		wavelengthNm <= 0
	) {
		throw new RangeError('Film reflectance needs finite d≥0, |angle|<90°, and wavelength>0.');
	}
	return reflectedPower(thicknessNm, wavelengthNm, interfaceOptics(angleDeg));
}

const whiteY = CIE_D65_SAMPLES.reduce(
	(sum, sample, index) =>
		sum + sample[2] * sample[4] * (index === 0 || index === CIE_D65_SAMPLES.length - 1 ? 0.5 : 1),
	0
);

// The constant 5 nm quadrature spacing cancels in the white-normalised ratio.
const spectralWeights = CIE_D65_SAMPLES.map(([wavelength, x, y, z, power], index) => {
	const factor = (power / whiteY) * (index === 0 || index === CIE_D65_SAMPLES.length - 1 ? 0.5 : 1);
	return [wavelength, x * factor, y * factor, z * factor] as const;
});

function xyzToDisplayRgb(x: number, y: number, z: number): LinearRgb {
	const rgb: LinearRgb = [
		3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
		-0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
		0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z
	];
	// Spectral colours can exceed the sRGB gamut. Reduce chroma towards the
	// same-luminance neutral only as far as required. Independent RGB clipping
	// would arbitrarily alter their hue and luminance. This mapping is a display
	// compromise, not an additional optical effect or a universal colour standard.
	const neutral = clamp(y, 0, 1);
	let chroma = 1;
	for (const channel of rgb) {
		if (channel < 0) chroma = Math.min(chroma, neutral / (neutral - channel));
		if (channel > 1) chroma = Math.min(chroma, (1 - neutral) / (channel - neutral));
	}
	return rgb.map((channel) => clamp(neutral + chroma * (channel - neutral), 0, 1)) as LinearRgb;
}

/**
 * Integrate one bounded reflected-power sample per CIE table wavelength.
 * Exported to make the spectral-to-display boundary independently testable.
 */
export function spectrumColour(reflectedSamples: readonly number[]): LinearRgb {
	if (
		reflectedSamples.length !== spectralWeights.length ||
		reflectedSamples.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
	) {
		throw new RangeError(`Expected ${spectralWeights.length} reflected fractions between 0 and 1.`);
	}
	let x = 0;
	let y = 0;
	let z = 0;
	for (let index = 0; index < spectralWeights.length; index++) {
		const [, wx, wy, wz] = spectralWeights[index];
		const reflected = reflectedSamples[index];
		x += reflected * wx;
		y += reflected * wy;
		z += reflected * wz;
	}
	return xyzToDisplayRgb(x, y, z);
}

function colourAt(thicknessNm: number, optics: InterfaceOptics): LinearRgb {
	let x = 0;
	let y = 0;
	let z = 0;
	for (const [wavelength, wx, wy, wz] of spectralWeights) {
		const reflected = reflectedPower(thicknessNm, wavelength, optics);
		x += reflected * wx;
		y += reflected * wy;
		z += reflected * wz;
	}
	return xyzToDisplayRgb(x, y, z);
}

/**
 * Linear sRGB under D65, with no exposure boost. UI inputs are bounded to the
 * demonstrated domain: d=0-1200 nm, |angle|=0-85°. Nonfinite inputs become zero.
 */
export function filmColour(thicknessNm: number, angleDeg: number): LinearRgb {
	return colourAt(
		bounded(thicknessNm, MAX_THICKNESS_NM),
		interfaceOptics(bounded(Math.abs(angleDeg), MAX_ANGLE_DEG))
	);
}

export function linearToSrgb(value: number): number {
	return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

export function srgbToLinear(value: number): number {
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Build once per renderer mount. 1025×257 RGBA8 = 1,053,700 bytes, ~21.34M spectral
 * samples. x runs d=0→1200 nm; y runs angle=0→85°. RGB is sRGB-encoded to retain
 * precision in dark reflections. Use ordinary RGBA texture storage, LINEAR
 * filtering, CLAMP_TO_EDGE, and decode after sampling. Do not use SRGB8_ALPHA8
 * unless the CPU sampler is also changed to interpolate decoded texels.
 *
 * Texture coordinates for normalised (u,v) are
 * ((u*(width-1)+0.5)/width, (v*(height-1)+0.5)/height).
 */
export function createColourLut(): ColourLut {
	const data = new Uint8Array(LUT_WIDTH * LUT_HEIGHT * 4);
	for (let row = 0; row < LUT_HEIGHT; row++) {
		const optics = interfaceOptics((row / (LUT_HEIGHT - 1)) * MAX_ANGLE_DEG);
		for (let column = 0; column < LUT_WIDTH; column++) {
			const rgb = colourAt((column / (LUT_WIDTH - 1)) * MAX_THICKNESS_NM, optics);
			const offset = (row * LUT_WIDTH + column) * 4;
			for (let channel = 0; channel < 3; channel++) {
				data[offset + channel] = Math.round(linearToSrgb(rgb[channel]) * 255);
			}
			data[offset + 3] = 255;
		}
	}
	return {
		data,
		width: LUT_WIDTH,
		height: LUT_HEIGHT,
		maxThicknessNm: MAX_THICKNESS_NM,
		maxAngleDeg: MAX_ANGLE_DEG
	};
}

/** CPU equivalent of bilinear RGBA8 texture lookup followed by sRGB decoding. */
export function sampleColourLut(lut: ColourLut, thicknessNm: number, angleDeg: number): LinearRgb {
	const x = (bounded(thicknessNm, lut.maxThicknessNm) / lut.maxThicknessNm) * (lut.width - 1);
	const y = (bounded(Math.abs(angleDeg), lut.maxAngleDeg) / lut.maxAngleDeg) * (lut.height - 1);
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(x0 + 1, lut.width - 1);
	const y1 = Math.min(y0 + 1, lut.height - 1);
	const tx = x - x0;
	const ty = y - y0;
	const rgb: LinearRgb = [0, 0, 0];
	for (let channel = 0; channel < 3; channel++) {
		const bottom =
			lut.data[(y0 * lut.width + x0) * 4 + channel] * (1 - tx) +
			lut.data[(y0 * lut.width + x1) * 4 + channel] * tx;
		const top =
			lut.data[(y1 * lut.width + x0) * 4 + channel] * (1 - tx) +
			lut.data[(y1 * lut.width + x1) * 4 + channel] * tx;
		rgb[channel] = srgbToLinear((bottom * (1 - ty) + top * ty) / 255);
	}
	return rgb;
}
