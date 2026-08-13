import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { EigenvalueDecomposition, SingularValueDecomposition, WrapperMatrix1D } from 'ml-matrix';

const width = 1200;
const height = 630;
const dimension = 48;
const destination = path.join(
	process.cwd(),
	'static',
	'images',
	'visualizations',
	'random-matrix-shape',
	'the-matrix-is-random.png'
);

function xmur3(text) {
	let hash = 1779033703 ^ text.length;
	for (let index = 0; index < text.length; index += 1) {
		hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
		hash = (hash << 13) | (hash >>> 19);
	}
	return () => {
		hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
		hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
		return (hash ^= hash >>> 16) >>> 0;
	};
}

function mulberry32(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function gaussian(random) {
	const first = Math.max(Number.EPSILON, random());
	const second = random();
	return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}

function mix(left, right, amount) {
	return left.map((channel, index) => Math.round(channel + (right[index] - channel) * amount));
}

function colour(value) {
	const neutral = [225, 220, 201];
	const negative = [27, 126, 143];
	const positive = [222, 139, 61];
	const amount = Math.pow(clamp(Math.abs(value) / 2.6, 0, 1), 0.72);
	return `rgb(${mix(neutral, value < 0 ? negative : positive, amount).join(' ')})`;
}

const seed = xmur3('the-matrix-is-random-poster-v1')();
const random = mulberry32(seed);
const values = new Float64Array(dimension * dimension);
for (let index = 0; index < values.length; index += 1) {
	values[index] = gaussian(random) / Math.sqrt(dimension);
}

const matrix = new WrapperMatrix1D(values, { rows: dimension });
const evd = new EigenvalueDecomposition(matrix);
const svd = new SingularValueDecomposition(matrix, { autoTranspose: true });

const heatmapX = 66;
const heatmapY = 205;
const heatmapSize = 350;
const cell = heatmapSize / dimension;
const rawScale = Math.sqrt(dimension);
const heatmap = [];
for (let row = 0; row < dimension; row += 1) {
	for (let column = 0; column < dimension; column += 1) {
		const value = values[row * dimension + column] * rawScale;
		heatmap.push(
			`<rect x="${(heatmapX + column * cell).toFixed(2)}" y="${(heatmapY + row * cell).toFixed(
				2
			)}" width="${(cell + 0.18).toFixed(2)}" height="${(cell + 0.18).toFixed(
				2
			)}" fill="${colour(value)}"/>`
		);
	}
}

const plotX = 570;
const plotY = 208;
const plotSize = 325;
const plotCenterX = plotX + plotSize / 2;
const plotCenterY = plotY + plotSize / 2;
const plotScale = plotSize * 0.43;
const eigenDots = evd.realEigenvalues.map((real, index) => {
	const imaginary = evd.imaginaryEigenvalues[index];
	const x = plotCenterX + real * plotScale;
	const y = plotCenterY - imaginary * plotScale;
	return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.5" fill="#f0d5a5" stroke="#07171d" stroke-width="1"/>`;
});

const ridgeX = 965;
const ridgeY = 218;
const ridgeWidth = 176;
const ridgeHeight = 306;
const largest = svd.diagonal[0] || 1;
const ridgePoints = svd.diagonal
	.map((value, index) => {
		const x = ridgeX + (index / Math.max(1, svd.diagonal.length - 1)) * ridgeWidth;
		const y = ridgeY + ridgeHeight - (value / largest) * ridgeHeight;
		return `${x.toFixed(2)},${y.toFixed(2)}`;
	})
	.join(' ');

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<rect width="1200" height="630" fill="#07171d"/>
	<path d="M0 152H1200" stroke="#294048" stroke-width="1"/>
	<text x="66" y="64" fill="#82c9c7" font-family="Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="3">INTERACTIVE SPECTRAL LABORATORY</text>
	<text x="66" y="113" fill="#f5f0e2" font-family="Georgia, serif" font-size="42" font-weight="700">The Matrix Is Random.</text>
	<text x="573" y="113" fill="#e5a75f" font-family="Georgia, serif" font-size="40" font-weight="700">Why Does It Have a Shape?</text>

	<text x="66" y="184" fill="#abc0c3" font-family="Arial, sans-serif" font-size="14" letter-spacing="1.4">ENTRIES · ONE MATRIX</text>
	<rect x="${heatmapX - 1}" y="${heatmapY - 1}" width="${heatmapSize + 2}" height="${heatmapSize + 2}" fill="none" stroke="#48636a" stroke-width="2"/>
	${heatmap.join('')}
	<text x="66" y="584" fill="#9bb0b4" font-family="Arial, sans-serif" font-size="14">The face looks like static.</text>

	<text x="570" y="184" fill="#abc0c3" font-family="Arial, sans-serif" font-size="14" letter-spacing="1.4">EIGENVALUES · COLLECTIVE GEOMETRY</text>
	<rect x="${plotX}" y="${plotY}" width="${plotSize}" height="${plotSize}" fill="#0b2026" stroke="#48636a" stroke-width="2"/>
	<line x1="${plotCenterX}" y1="${plotY}" x2="${plotCenterX}" y2="${plotY + plotSize}" stroke="#36525a" stroke-width="1"/>
	<line x1="${plotX}" y1="${plotCenterY}" x2="${plotX + plotSize}" y2="${plotCenterY}" stroke="#36525a" stroke-width="1"/>
	<circle cx="${plotCenterX}" cy="${plotCenterY}" r="${plotScale}" fill="none" stroke="#4ca6a4" stroke-width="2" stroke-dasharray="7 7"/>
	${eigenDots.join('')}
	<text x="570" y="584" fill="#9bb0b4" font-family="Arial, sans-serif" font-size="14">The spectrum remembers a disk.</text>

	<text x="965" y="184" fill="#abc0c3" font-family="Arial, sans-serif" font-size="14" letter-spacing="1.4">SINGULAR VALUES</text>
	<rect x="${ridgeX}" y="${ridgeY}" width="${ridgeWidth}" height="${ridgeHeight}" fill="#0b2026" stroke="#48636a" stroke-width="2"/>
	<path d="M${ridgeX} ${ridgeY + ridgeHeight}H${ridgeX + ridgeWidth}" stroke="#36525a"/>
	<polyline points="${ridgePoints}" fill="none" stroke="#e5a75f" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
	<circle cx="${ridgeX}" cy="${ridgeY}" r="4.5" fill="#f0d5a5"/>
	<text x="965" y="552" fill="#9bb0b4" font-family="Arial, sans-serif" font-size="14">Stretching</text>
	<text x="965" y="572" fill="#9bb0b4" font-family="Arial, sans-serif" font-size="14">has a profile.</text>

	<text x="1139" y="608" text-anchor="end" fill="#6f898f" font-family="Arial, sans-serif" font-size="12">seed: the-matrix-is-random-poster-v1 · n = 48 · variance = 1/n</text>
</svg>`;

await fs.mkdir(path.dirname(destination), { recursive: true });
await sharp(Buffer.from(svg))
	.png({ compressionLevel: 9, palette: true, quality: 92, colours: 192 })
	.toFile(destination);

const stat = await fs.stat(destination);
console.log(`${path.relative(process.cwd(), destination)} ${stat.size} bytes`);
