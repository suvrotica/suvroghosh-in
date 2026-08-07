import type { PaletteFamily, PaletteValidationIssue } from './types';

export type Rgb = Readonly<{ r: number; g: number; b: number }>;
export type Oklab = Readonly<{ l: number; a: number; b: number }>;

export function normalizeHex(colour: string): string | null {
	const value = colour.trim();
	if (/^#[\da-f]{6}$/iu.test(value)) return value.toUpperCase();
	if (/^#[\da-f]{3}$/iu.test(value)) {
		return `#${[...value.slice(1)].map((digit) => digit.repeat(2)).join('')}`.toUpperCase();
	}
	return null;
}

export function hexToRgb(colour: string): Rgb | null {
	const normalized = normalizeHex(colour);
	if (!normalized) return null;
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16)
	};
}

function linearChannel(value: number): number {
	const channel = value / 255;
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(colour: string): number {
	const rgb = hexToRgb(colour);
	if (!rgb) return Number.NaN;
	return (
		0.2126 * linearChannel(rgb.r) + 0.7152 * linearChannel(rgb.g) + 0.0722 * linearChannel(rgb.b)
	);
}

export function contrastRatio(foreground: string, background: string): number {
	const first = relativeLuminance(foreground);
	const second = relativeLuminance(background);
	if (!Number.isFinite(first) || !Number.isFinite(second)) return 0;
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function hexToOklab(colour: string): Oklab | null {
	const rgb = hexToRgb(colour);
	if (!rgb) return null;
	const red = linearChannel(rgb.r);
	const green = linearChannel(rgb.g);
	const blue = linearChannel(rgb.b);
	const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
	const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
	const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
	return {
		l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	};
}

export function perceptualDistance(first: string, second: string): number {
	const left = hexToOklab(first);
	const right = hexToOklab(second);
	if (!left || !right) return 0;
	return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}

export function validatePaletteFamily(
	palette: PaletteFamily,
	options: Readonly<{
		minimumContrast?: number;
		minimumGroundDistance?: number;
		minimumInkDistance?: number;
		minimumLabelContrast?: number;
		minimumAccentContrast?: number;
	}> = {}
): PaletteValidationIssue[] {
	const minimumContrast = options.minimumContrast ?? 4.5;
	const minimumGroundDistance = options.minimumGroundDistance ?? 0.28;
	const minimumInkDistance = options.minimumInkDistance ?? 0.08;
	const minimumLabelContrast = options.minimumLabelContrast ?? 4.5;
	const minimumAccentContrast = options.minimumAccentContrast ?? 3;
	const issues: PaletteValidationIssue[] = [];
	const galleryColours = [
		...palette.walls,
		...palette.frames.flatMap((frame) => [frame.outer, frame.inner]),
		...palette.mats,
		palette.labelInk,
		...(palette.accent ? [palette.accent] : [])
	];
	for (const colour of galleryColours) {
		if (normalizeHex(colour)) continue;
		issues.push({
			paletteId: palette.id,
			groundId: 'gallery',
			pairIndex: -1,
			kind: 'format',
			message: `Gallery colour ${colour} is not a hexadecimal colour.`
		});
	}
	for (const wall of palette.walls) {
		const labelRatio = contrastRatio(palette.labelInk, wall);
		if (labelRatio < minimumLabelContrast) {
			issues.push({
				paletteId: palette.id,
				groundId: 'gallery-label',
				pairIndex: -1,
				kind: 'contrast',
				message: `${palette.labelInk} on wall ${wall} is ${labelRatio.toFixed(2)}:1.`,
				actual: labelRatio,
				minimum: minimumLabelContrast
			});
		}
		if (palette.accent) {
			const accentRatio = contrastRatio(palette.accent, wall);
			if (accentRatio < minimumAccentContrast) {
				issues.push({
					paletteId: palette.id,
					groundId: 'gallery-accent',
					pairIndex: -1,
					kind: 'contrast',
					message: `${palette.accent} on wall ${wall} is ${accentRatio.toFixed(2)}:1.`,
					actual: accentRatio,
					minimum: minimumAccentContrast
				});
			}
		}
	}

	for (const ground of palette.grounds) {
		if (!normalizeHex(ground.colour)) {
			issues.push({
				paletteId: palette.id,
				groundId: ground.id,
				pairIndex: -1,
				kind: 'format',
				message: `Ground ${ground.colour} is not a hexadecimal colour.`
			});
		}
		if (ground.pairs.length === 0) {
			issues.push({
				paletteId: palette.id,
				groundId: ground.id,
				pairIndex: -1,
				kind: 'missing-pair',
				message: 'Every ground requires at least one compatible ink pair.'
			});
		}

		for (const [pairIndex, pair] of ground.pairs.entries()) {
			for (const ink of [pair.primary, pair.secondary].filter((value): value is string =>
				Boolean(value)
			)) {
				if (!normalizeHex(ink)) {
					issues.push({
						paletteId: palette.id,
						groundId: ground.id,
						pairIndex,
						kind: 'format',
						message: `Ink ${ink} is not a hexadecimal colour.`
					});
					continue;
				}
				const ratio = contrastRatio(ink, ground.colour);
				if (ratio < minimumContrast) {
					issues.push({
						paletteId: palette.id,
						groundId: ground.id,
						pairIndex,
						kind: 'contrast',
						message: `${ink} on ${ground.colour} is ${ratio.toFixed(2)}:1.`,
						actual: ratio,
						minimum: minimumContrast
					});
				}
				const distance = perceptualDistance(ink, ground.colour);
				if (distance < minimumGroundDistance) {
					issues.push({
						paletteId: palette.id,
						groundId: ground.id,
						pairIndex,
						kind: 'perceptual-separation',
						message: `${ink} is too perceptually close to ${ground.colour}.`,
						actual: distance,
						minimum: minimumGroundDistance
					});
				}
			}
			if (pair.secondary) {
				const distance = perceptualDistance(pair.primary, pair.secondary);
				if (distance < minimumInkDistance) {
					issues.push({
						paletteId: palette.id,
						groundId: ground.id,
						pairIndex,
						kind: 'perceptual-separation',
						message: 'Primary and secondary inks are not perceptually distinct.',
						actual: distance,
						minimum: minimumInkDistance
					});
				}
			}
		}
	}
	return issues;
}

export function validatePaletteCollection(
	palettes: readonly PaletteFamily[]
): PaletteValidationIssue[] {
	return palettes.flatMap((palette) => validatePaletteFamily(palette));
}
