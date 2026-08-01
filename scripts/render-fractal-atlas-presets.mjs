import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createServer } from 'vite';

const WIDTH = 360;
const HEIGHT = 220;
const OUTPUT_DIRECTORY = path.resolve('static/images/fractal-atlas/presets');
const REQUESTED_PRESET_ID = process.env.FRACTAL_ATLAS_PRESET_ID?.trim();
const RASTER_FAMILIES = new Set([
	'mandelbrot',
	'julia',
	'multibrot',
	'burning-ship',
	'tricorn',
	'phoenix',
	'newton'
]);

const vite = await createServer({
	server: { middlewareMode: true },
	appType: 'custom',
	logLevel: 'error'
});

try {
	const [{ ATLAS_PRESETS }, { renderCpuFractal }, recursive, lsystem] = await Promise.all([
		vite.ssrLoadModule('/src/lib/visualizations/fractal-atlas/presets.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/fractal-atlas/render/cpu.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/fractal-atlas/recursive.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/fractal-atlas/lsystem.ts')
	]);

	await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
	const presets = REQUESTED_PRESET_ID
		? ATLAS_PRESETS.filter((preset) => preset.id === REQUESTED_PRESET_ID)
		: ATLAS_PRESETS;
	if (REQUESTED_PRESET_ID && presets.length === 0) {
		throw new Error(`Unknown Fractal Atlas preset: ${REQUESTED_PRESET_ID}`);
	}
	for (const preset of presets) {
		const output = path.join(OUTPUT_DIRECTORY, `${preset.id}.webp`);
		let image;

		if (RASTER_FAMILIES.has(preset.state.family)) {
			const thumbnailState =
				preset.group === 'precision-demonstrations'
					? {
							...preset.state,
							// The portable CPU thumbnail deliberately shows the same exact centre at a
							// parent scale. The live card loads the stored deep span and extended tier.
							spanY: 2.4e-5,
							precisionMode: 'float'
						}
					: preset.state;
			const frame = renderCpuFractal(thumbnailState, WIDTH, HEIGHT, {
				maxPixels: WIDTH * HEIGHT,
				maxIterations:
					preset.group === 'precision-demonstrations'
						? Math.min(1_600, preset.state.maxIterations)
						: Math.min(300, preset.state.maxIterations)
			});
			image = sharp(frame.data, {
				raw: { width: frame.width, height: frame.height, channels: 4 }
			});
		} else if (preset.state.family === 'buddhabrot') {
			image = sharp(renderBuddhabrot(preset.state), {
				raw: { width: WIDTH, height: HEIGHT, channels: 4 }
			});
		} else if (preset.state.family === 'barnsley-fern') {
			const points = recursive.generateBarnsleyFern(95_000, `${preset.id}:thumbnail`);
			image = sharp(renderPointCloud(points, 'fern'), {
				raw: { width: WIDTH, height: HEIGHT, channels: 4 }
			});
		} else if (preset.state.family === 'sierpinski') {
			const points = recursive.sierpinskiChaosGame(70_000, `${preset.id}:thumbnail`);
			image = sharp(renderPointCloud(points, 'triangle'), {
				raw: { width: WIDTH, height: HEIGHT, channels: 4 }
			});
		} else {
			const segments = lsystem.expandLSystemState(preset.state.lSystem).segments;
			image = sharp(renderSegments(segments), {
				raw: { width: WIDTH, height: HEIGHT, channels: 4 }
			});
		}

		await image
			.resize(WIDTH, HEIGHT, { fit: 'fill' })
			.webp({ quality: 82, effort: 5, smartSubsample: true })
			.toFile(output);
		process.stdout.write(`Rendered ${path.relative(process.cwd(), output)}\n`);
	}
} finally {
	await vite.close();
}

function createCanvas() {
	const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
	for (let y = 0; y < HEIGHT; y += 1) {
		for (let x = 0; x < WIDTH; x += 1) {
			const offset = (y * WIDTH + x) * 4;
			const grid = (x % 45 === 0 || y % 44 === 0) && x > 8 && y > 8 ? 4 : 0;
			data[offset] = 7 + grid;
			data[offset + 1] = 9 + grid;
			data[offset + 2] = 18 + grid * 2;
			data[offset + 3] = 255;
		}
	}
	return data;
}

function writePixel(data, x, y, red, green, blue, alpha = 1) {
	const px = Math.round(x);
	const py = Math.round(y);
	if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) return;
	const offset = (py * WIDTH + px) * 4;
	const amount = Math.max(0, Math.min(1, alpha));
	data[offset] = Math.round(data[offset] * (1 - amount) + red * amount);
	data[offset + 1] = Math.round(data[offset + 1] * (1 - amount) + green * amount);
	data[offset + 2] = Math.round(data[offset + 2] * (1 - amount) + blue * amount);
	data[offset + 3] = 255;
}

function boundsOfPoints(points) {
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const point of points) {
		minX = Math.min(minX, point.x);
		maxX = Math.max(maxX, point.x);
		minY = Math.min(minY, point.y);
		maxY = Math.max(maxY, point.y);
	}
	return { minX, maxX, minY, maxY };
}

function project(x, y, bounds, padding = 14) {
	const spanX = Math.max(1e-12, bounds.maxX - bounds.minX);
	const spanY = Math.max(1e-12, bounds.maxY - bounds.minY);
	const scale = Math.min((WIDTH - padding * 2) / spanX, (HEIGHT - padding * 2) / spanY);
	const occupiedWidth = spanX * scale;
	const occupiedHeight = spanY * scale;
	return {
		x: (WIDTH - occupiedWidth) / 2 + (x - bounds.minX) * scale,
		y: HEIGHT - ((HEIGHT - occupiedHeight) / 2 + (y - bounds.minY) * scale)
	};
}

function renderPointCloud(points, kind) {
	const data = createCanvas();
	const visible = points.slice(Math.min(20, points.length));
	const bounds = boundsOfPoints(visible);
	for (const point of visible) {
		const mapped = project(point.x, point.y, bounds, 13);
		const tone =
			kind === 'fern'
				? point.transformIndex === 0
					? [201, 172, 99]
					: point.transformIndex === 1
						? [67, 157, 112]
						: [100, 197, 145]
				: [
						[75, 162, 168],
						[192, 149, 86],
						[117, 88, 177]
					][point.transformIndex % 3];
		writePixel(data, mapped.x, mapped.y, tone[0], tone[1], tone[2], 0.72);
	}
	return data;
}

function renderSegments(segments) {
	const data = createCanvas();
	const points = segments.flatMap((segment) => [segment.from, segment.to]);
	const bounds = boundsOfPoints(points);
	for (let index = 0; index < segments.length; index += 1) {
		const from = project(segments[index].from.x, segments[index].from.y, bounds, 14);
		const to = project(segments[index].to.x, segments[index].to.y, bounds, 14);
		const tone = index / Math.max(1, segments.length - 1);
		drawLine(
			data,
			from.x,
			from.y,
			to.x,
			to.y,
			Math.round(93 + tone * 132),
			Math.round(110 + tone * 74),
			Math.round(178 - tone * 65)
		);
	}
	return data;
}

function drawLine(data, x0, y0, x1, y1, red, green, blue) {
	const distance = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
	for (let step = 0; step <= distance; step += 1) {
		const amount = step / distance;
		const x = x0 + (x1 - x0) * amount;
		const y = y0 + (y1 - y0) * amount;
		writePixel(data, x, y, red, green, blue, 0.92);
		writePixel(data, x + 1, y, red, green, blue, 0.25);
	}
}

function hashSeed(value) {
	let hash = 2166136261;
	for (const character of value) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function seededRandom(seed) {
	let state = hashSeed(seed) || 0x9e3779b9;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 4_294_967_296;
	};
}

function renderBuddhabrot(state) {
	const data = createCanvas();
	const red = new Uint32Array(WIDTH * HEIGHT);
	const green = new Uint32Array(WIDTH * HEIGHT);
	const blue = new Uint32Array(WIDTH * HEIGHT);
	const random = seededRandom(`${state.seed}:preset-thumbnail`);
	const spanX = state.spanY * (WIDTH / HEIGHT);
	const minRe = state.center.re - spanX / 2;
	const minIm = state.center.im - state.spanY / 2;
	const orbit = new Float64Array(180 * 2);

	for (let sample = 0; sample < 145_000; sample += 1) {
		const cRe = -2.15 + random() * 3.05;
		const cIm = -1.35 + random() * 2.7;
		let zRe = 0;
		let zIm = 0;
		let length = 0;
		let escaped = false;
		for (; length < 180; length += 1) {
			const nextRe = zRe * zRe - zIm * zIm + cRe;
			zIm = 2 * zRe * zIm + cIm;
			zRe = nextRe;
			orbit[length * 2] = zRe;
			orbit[length * 2 + 1] = zIm;
			if (zRe * zRe + zIm * zIm > 16) {
				escaped = true;
				break;
			}
		}
		if (!escaped || length < 3) continue;
		for (let step = 0; step <= length; step += 1) {
			const x = Math.floor(((orbit[step * 2] - minRe) / spanX) * WIDTH);
			const y = Math.floor((1 - (orbit[step * 2 + 1] - minIm) / state.spanY) * HEIGHT);
			if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
			const index = y * WIDTH + x;
			if (length < 24) blue[index] += 1;
			else if (length < 72) green[index] += 1;
			else red[index] += 1;
		}
	}

	let maximum = 1;
	for (let index = 0; index < red.length; index += 1) {
		maximum = Math.max(maximum, red[index], green[index], blue[index]);
	}
	const denominator = Math.log1p(maximum);
	for (let index = 0; index < red.length; index += 1) {
		if (red[index] + green[index] + blue[index] === 0) continue;
		const offset = index * 4;
		data[offset] = Math.max(data[offset], Math.round((Math.log1p(red[index]) / denominator) * 230));
		data[offset + 1] = Math.max(
			data[offset + 1],
			Math.round((Math.log1p(green[index]) / denominator) * 205)
		);
		data[offset + 2] = Math.max(
			data[offset + 2],
			Math.round((Math.log1p(blue[index]) / denominator) * 245)
		);
	}
	return data;
}
