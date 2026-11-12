import { clamp, randomStream } from './brush-random';

export type Pigment = readonly [number, number, number];
export type PaintCanvas = HTMLCanvasElement | OffscreenCanvas;
export type PaintContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function getPaintContext(canvas: PaintCanvas): PaintContext | null {
	const context = canvas.getContext('2d');
	return context && 'fillRect' in context ? context : null;
}

export interface StrokeMaterial {
	fill: Path2D;
	bristles: Path2D | null;
	ridge: Path2D | null;
	shadow: string;
	highlight: string;
}

export function pigmentColor(color: Pigment, opacity: number, shift = 0): string {
	const red = Math.round(clamp(color[0] + shift, 0, 255));
	const green = Math.round(clamp(color[1] + shift, 0, 255));
	const blue = Math.round(clamp(color[2] + shift * 0.92, 0, 255));
	return `rgba(${red},${green},${blue},${opacity.toFixed(3)})`;
}

export function makeStrokeMaterial(
	key: number,
	length: number,
	width: number,
	bend: number,
	texture: number,
	pigment: Pigment,
	light: number,
	bristleCoverage: number
): StrokeMaterial {
	const random = randomStream(key);
	const half = length / 2;
	const radius = width / 2;
	const edge = (random() - 0.5) * radius * (0.26 + texture * 0.38);
	const heel = radius * (0.54 + random() * 0.4);
	const tip = radius * (0.47 + random() * 0.47);
	const lower = radius * (0.73 + random() * 0.28);
	const split = (0.04 + random() * 0.21) * length * texture;
	const crown = bend - radius * (0.92 + random() * 0.21);
	const fill = new Path2D();
	fill.moveTo(-half, -heel * 0.5);
	fill.quadraticCurveTo(-half * 0.98, -heel, -half * 0.78, -heel);
	fill.bezierCurveTo(-half * 0.51, crown + edge, half * 0.23, crown - edge, half * 0.75, -tip);
	fill.lineTo(half * 0.88, -tip * 0.92 + edge);
	fill.quadraticCurveTo(half * 1.02, -tip * 0.71, half, -tip * 0.23);
	fill.lineTo(half - split * 0.63, -tip * 0.08);
	fill.lineTo(half * 0.99, tip * 0.13);
	fill.lineTo(half - split, tip * 0.29);
	fill.lineTo(half * 0.96, tip * 0.52);
	fill.quadraticCurveTo(half * 0.96, tip * 0.88, half * 0.76, tip * 0.94);
	fill.bezierCurveTo(
		half * 0.34,
		bend + lower,
		-half * 0.39,
		bend + lower + edge,
		-half * 0.81,
		heel * 0.84
	);
	fill.quadraticCurveTo(-half * 1.05, heel * 0.65, -half, -heel * 0.5);
	fill.closePath();

	let bristles: Path2D | null = null;
	let ridge: Path2D | null = null;
	if (
		texture > 0 &&
		width > 2.9 &&
		length > 8 &&
		random() < (0.32 + texture * 0.61) * bristleCoverage
	) {
		bristles = new Path2D();
		const strands = width < 7 ? 2 : Math.min(6, 2 + Math.floor(width / 5));
		for (let index = 0; index < strands; index += 1) {
			const offset = (0.08 + 0.83 * ((index + random() * 0.55) / strands) - 0.5) * width;
			const start = -half * (0.25 + random() * 0.62);
			const end = Math.max(start + length * 0.12, half * (random() * 1.24 - 0.38));
			bristles.moveTo(start, offset + bend * (1 - (start / half) ** 2) * 0.68);
			bristles.quadraticCurveTo(
				(start + end) / 2,
				offset + bend * (1 - ((start + end) / length) ** 2) * 1.13,
				end,
				offset + bend * (1 - (end / half) ** 2) * 0.68
			);
		}

		ridge = new Path2D();
		const start = -half * (0.46 + random() * 0.34);
		const end = half * (0.17 + random() * 0.46);
		const offset = -radius * (0.38 + random() * 0.39);
		ridge.moveTo(start, offset + bend * 0.4);
		ridge.quadraticCurveTo((start + end) / 2, offset + bend * 1.33, end, offset + bend * 0.59);
	}

	return {
		fill,
		bristles,
		ridge,
		shadow: pigmentColor(pigment, texture * 0.28, -33),
		highlight: pigmentColor(pigment, texture * (0.19 + 0.16 * light), 38)
	};
}

// A single low-contrast linen tile, drawn in world coordinates at every resolution.
let linen: PaintCanvas | null = null;
const linenPatterns = new WeakMap<PaintContext, CanvasPattern>();

function makeLinen(): PaintCanvas {
	const canvas =
		typeof document === 'undefined'
			? new OffscreenCanvas(281, 263)
			: document.createElement('canvas');
	canvas.width = 281;
	canvas.height = 263;
	const context = getPaintContext(canvas);
	if (!context) return canvas;

	const image = context.createImageData(canvas.width, canvas.height);
	const random = randomStream(39153);
	const warp = Array.from({ length: canvas.width }, () => random() - 0.5);
	const weft = Array.from({ length: canvas.height }, () => random() - 0.5);
	const tau = 2 * Math.PI;

	for (let y = 0; y < canvas.height; y += 1) {
		const threadY = Math.sin((y * tau * 83) / canvas.height);
		for (let x = 0; x < canvas.width; x += 1) {
			const threadX = Math.sin((x * tau * 81) / canvas.width);
			const twist = Math.sin(tau * ((x * 15) / canvas.width + (y * 19) / canvas.height));
			const grain =
				threadX * (0.32 + 0.17 * threadY) +
				threadY * (0.23 - 0.1 * threadX) +
				twist * 0.05 +
				warp[x] * 0.15 +
				weft[y] * 0.12 +
				(random() - 0.5) * 0.34;
			const index = 4 * (y * canvas.width + x);
			const tint = grain > 0 ? 247 : 54;
			image.data[index] = tint;
			image.data[index + 1] = grain > 0 ? 237 : 41;
			image.data[index + 2] = grain > 0 ? 214 : 29;
			image.data[index + 3] = Math.round(Math.abs(grain) * 76);
		}
	}

	context.putImageData(image, 0, 0);
	return canvas;
}

export function applyLinen(
	context: PaintContext,
	x: number,
	y: number,
	width: number,
	height: number,
	strength: number
): void {
	if (strength <= 0) return;
	linen ??= makeLinen();
	let pattern = linenPatterns.get(context);
	if (!pattern) {
		pattern = context.createPattern(linen, 'repeat') ?? undefined;
		if (pattern) linenPatterns.set(context, pattern);
	}
	if (!pattern) return;

	context.globalAlpha = strength;
	context.fillStyle = pattern;
	context.fillRect(x, y, width, height);
	context.globalAlpha = 1;
}
