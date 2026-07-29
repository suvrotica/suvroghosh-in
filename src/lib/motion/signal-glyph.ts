import { hashStringToSeed, mulberry32 } from './seed';

export const SIGNAL_GLYPH_VIEW_BOX = '0 0 160 88';

export type SignalGlyphVariant = 'trace' | 'orbit' | 'network' | 'contour';

export type SignalGlyphNode = Readonly<{
	x: number;
	y: number;
	r: number;
}>;

export type SignalGlyphModel = Readonly<{
	variant: SignalGlyphVariant;
	primaryPath: string;
	secondaryPath: string;
	nodes: readonly SignalGlyphNode[];
}>;

const variants: readonly SignalGlyphVariant[] = ['trace', 'orbit', 'network', 'contour'];

function rounded(value: number): number {
	return Math.round(value * 10) / 10;
}

function point(random: () => number, index: number) {
	return {
		x: rounded(12 + index * 27.2),
		y: rounded(18 + random() * 52)
	};
}

function traceGlyph(random: () => number): Omit<SignalGlyphModel, 'variant'> {
	const points = Array.from({ length: 6 }, (_, index) => point(random, index));
	const primaryPath = points
		.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
		.join(' ');
	const baseline = rounded(24 + random() * 38);

	return {
		primaryPath,
		secondaryPath: `M 8 ${baseline} H 152`,
		nodes: points
			.filter((_, index) => index === 1 || index === 4)
			.map(({ x, y }) => ({
				x,
				y,
				r: 2.4
			}))
	};
}

function orbitGlyph(random: () => number): Omit<SignalGlyphModel, 'variant'> {
	const centreX = rounded(76 + random() * 10);
	const centreY = rounded(42 + random() * 6);
	const radiusX = rounded(46 + random() * 13);
	const radiusY = rounded(18 + random() * 8);

	return {
		primaryPath: `M ${rounded(centreX - radiusX)} ${centreY} A ${radiusX} ${radiusY} 0 1 0 ${rounded(centreX + radiusX)} ${centreY} A ${radiusX} ${radiusY} 0 1 0 ${rounded(centreX - radiusX)} ${centreY}`,
		secondaryPath: `M ${rounded(centreX - radiusX * 0.72)} ${rounded(centreY + radiusY * 0.72)} Q ${centreX} ${rounded(centreY - radiusY * 1.45)} ${rounded(centreX + radiusX * 0.82)} ${rounded(centreY + radiusY * 0.44)}`,
		nodes: [
			{ x: rounded(centreX - radiusX), y: centreY, r: 2.6 },
			{ x: rounded(centreX + radiusX), y: centreY, r: 2.1 },
			{ x: centreX, y: rounded(centreY - radiusY), r: 1.8 }
		]
	};
}

function networkGlyph(random: () => number): Omit<SignalGlyphModel, 'variant'> {
	const points = Array.from({ length: 5 }, (_, index) => point(random, index));
	const centre = points[2];

	return {
		primaryPath: points.map(({ x, y }) => `M ${centre.x} ${centre.y} L ${x} ${y}`).join(' '),
		secondaryPath: points
			.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
			.join(' '),
		nodes: points.map(({ x, y }, index) => ({
			x,
			y,
			r: index === 2 ? 3 : 2
		}))
	};
}

function contourGlyph(random: () => number): Omit<SignalGlyphModel, 'variant'> {
	const y1 = rounded(24 + random() * 11);
	const y2 = rounded(53 + random() * 12);
	const bend1 = rounded(11 + random() * 13);
	const bend2 = rounded(10 + random() * 14);

	return {
		primaryPath: `M 8 ${y1} C 38 ${rounded(y1 - bend1)} 54 ${rounded(y1 + bend2)} 80 ${y1} S 124 ${rounded(y1 - bend2)} 152 ${rounded(y1 + bend1 * 0.45)}`,
		secondaryPath: `M 8 ${y2} C 37 ${rounded(y2 + bend2)} 58 ${rounded(y2 - bend1)} 84 ${y2} S 128 ${rounded(y2 + bend1)} 152 ${rounded(y2 - bend2 * 0.5)}`,
		nodes: [
			{ x: 80, y: y1, r: 2.2 },
			{ x: 84, y: y2, r: 1.8 }
		]
	};
}

/**
 * Returns an SSR-safe glyph from stable content identity. No clock, runtime
 * randomness, or browser API participates in the result.
 */
export function generateSignalGlyph(slug: string, category: string): SignalGlyphModel {
	const seed = hashStringToSeed(`${slug.trim()}\u001f${category.trim()}`);
	const random = mulberry32(seed);
	const variant = variants[seed % variants.length];

	const glyph =
		variant === 'trace'
			? traceGlyph(random)
			: variant === 'orbit'
				? orbitGlyph(random)
				: variant === 'network'
					? networkGlyph(random)
					: contourGlyph(random);

	return { variant, ...glyph };
}
