import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const width = 1600;
const height = 900;
const pixels = new Uint8ClampedArray(width * height * 4);
const output = path.resolve('static/images/fractal-atlas.png');

const palette = [
	[7, 9, 20],
	[26, 24, 67],
	[67, 42, 123],
	[42, 91, 142],
	[186, 145, 83],
	[218, 91, 49],
	[244, 220, 171]
];

function interpolate(stops, value) {
	const wrapped = ((value % 1) + 1) % 1;
	const scaled = wrapped * (stops.length - 1);
	const index = Math.min(stops.length - 2, Math.floor(scaled));
	const amount = scaled - index;
	return stops[index].map((channel, channelIndex) =>
		Math.round(channel + (stops[index + 1][channelIndex] - channel) * amount)
	);
}

function orbitValue(re, im, cRe, cIm, maxIterations = 420) {
	let zRe = re;
	let zIm = im;
	let iteration = 0;
	for (; iteration < maxIterations; iteration += 1) {
		const nextRe = zRe * zRe - zIm * zIm + cRe;
		zIm = 2 * zRe * zIm + cIm;
		zRe = nextRe;
		const magnitudeSquared = zRe * zRe + zIm * zIm;
		if (magnitudeSquared > 256) {
			const smooth = iteration + 1 - Math.log2(Math.max(1, Math.log2(Math.sqrt(magnitudeSquared))));
			return { escaped: true, smooth };
		}
	}
	return { escaped: false, smooth: iteration };
}

function mandelbrotAt(x, y) {
	const spanY = 2.68;
	const spanX = spanY * (width / height);
	const cRe = -0.54 + (x / width - 0.5) * spanX;
	const cIm = (0.5 - y / height) * spanY;
	return orbitValue(0, 0, cRe, cIm);
}

function juliaAt(x, y, centreX, centreY, radius) {
	const localX = (x - centreX) / radius;
	const localY = (centreY - y) / radius;
	return orbitValue(localX * 1.62, localY * 1.62, -0.123, 0.745, 360);
}

function setPixel(x, y, red, green, blue, alpha = 255) {
	const offset = (y * width + x) * 4;
	pixels[offset] = red;
	pixels[offset + 1] = green;
	pixels[offset + 2] = blue;
	pixels[offset + 3] = alpha;
}

for (let y = 0; y < height; y += 1) {
	for (let x = 0; x < width; x += 1) {
		const result = mandelbrotAt(x, y);
		if (!result.escaped) {
			const vignette = Math.hypot(x / width - 0.43, y / height - 0.5);
			const interior = Math.max(3, Math.round(16 - vignette * 12));
			setPixel(x, y, interior, interior + 1, interior + 6);
			continue;
		}

		const colour = interpolate(palette, result.smooth * 0.037);
		const edge = Math.min(1, result.smooth / 24);
		const vignette = 1 - 0.38 * Math.hypot(x / width - 0.45, y / height - 0.5);
		setPixel(
			x,
			y,
			Math.round(colour[0] * edge * vignette),
			Math.round(colour[1] * edge * vignette),
			Math.round(colour[2] * edge * vignette)
		);
	}
}

const lensX = 1285;
const lensY = 246;
const lensRadius = 205;
for (let y = lensY - lensRadius - 8; y <= lensY + lensRadius + 8; y += 1) {
	for (let x = lensX - lensRadius - 8; x <= lensX + lensRadius + 8; x += 1) {
		if (x < 0 || x >= width || y < 0 || y >= height) continue;
		const distance = Math.hypot(x - lensX, y - lensY);
		if (distance > lensRadius + 6) continue;
		if (distance > lensRadius) {
			const glow = Math.max(0, 1 - (distance - lensRadius) / 6);
			setPixel(x, y, 193, 154, 93, Math.round(255 * glow));
			continue;
		}

		const result = juliaAt(x, y, lensX, lensY, lensRadius);
		if (!result.escaped) {
			setPixel(x, y, 5, 6, 14);
		} else {
			const colour = interpolate(palette, result.smooth * 0.044 + 0.08);
			const rim = Math.min(1, (lensRadius - distance) / 7);
			setPixel(
				x,
				y,
				Math.round(colour[0] * (0.85 + 0.15 * rim)),
				Math.round(colour[1] * (0.85 + 0.15 * rim)),
				Math.round(colour[2] * (0.85 + 0.15 * rim))
			);
		}
	}
}

// Restrained atlas ticks and one critical-orbit trace.
for (let x = 84; x < width - 84; x += 96) {
	for (let y = 62; y < 72; y += 1) setPixel(x, y, 190, 158, 102, 210);
}
for (let y = 94; y < height - 70; y += 82) {
	for (let x = 58; x < 68; x += 1) setPixel(x, y, 190, 158, 102, 210);
}

let orbitRe = 0;
let orbitIm = 0;
const orbitC = { re: -0.743, im: 0.132 };
for (let index = 0; index < 18; index += 1) {
	const px = Math.round(((orbitRe + 2.93) / 5.36) * width);
	const py = Math.round((0.5 - orbitIm / 2.68) * height);
	for (let dy = -2; dy <= 2; dy += 1) {
		for (let dx = -2; dx <= 2; dx += 1) {
			if (px + dx >= 0 && px + dx < width && py + dy >= 0 && py + dy < height) {
				setPixel(px + dx, py + dy, 242, 196, 112);
			}
		}
	}
	const nextRe = orbitRe * orbitRe - orbitIm * orbitIm + orbitC.re;
	orbitIm = 2 * orbitRe * orbitIm + orbitC.im;
	orbitRe = nextRe;
}

await fs.mkdir(path.dirname(output), { recursive: true });
await sharp(pixels, { raw: { width, height, channels: 4 } })
	.png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 92 })
	.toFile(output);

const info = await sharp(output).metadata();
console.log(`Wrote ${output} (${info.width}×${info.height}).`);
