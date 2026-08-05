import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'static', 'images', 'gradient-descent-landscapes.png');

const GOLD = '#d8ad58';
const PAPER = '#f0eadc';
const MUTED = '#a9b0b3';

function clamp(value, minimum = 0, maximum = 1) {
	return Math.min(maximum, Math.max(minimum, value));
}

function mixHex(from, to, amount) {
	const t = clamp(amount);
	const parse = (hex) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
	const a = parse(from);
	const b = parse(to);
	const channel = (index) =>
		Math.round(a[index] + (b[index] - a[index]) * t)
			.toString(16)
			.padStart(2, '0');
	return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function rosenbrock(x, y) {
	return (1 - x) ** 2 + 100 * (y - x * x) ** 2;
}

function rosenbrockGradient(x, y) {
	return [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)];
}

function himmelblau(x, y) {
	return (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2;
}

function heightScale(loss) {
	return clamp(Math.log1p(loss) / Math.log1p(2_500));
}

function projectRosenbrock(x, y, loss = rosenbrock(x, y)) {
	const u = (x + 2) / 4 - 0.5;
	const v = (y + 1) / 4 - 0.5;
	return {
		x: 565 + (u - v) * 500,
		y: 472 + (u + v) * 150 - heightScale(loss) * 175
	};
}

function svgPoint(point) {
	return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

function buildRosenbrockSurface() {
	const columns = 44;
	const rows = 34;
	const cells = [];

	for (let row = 0; row < rows; row += 1) {
		const y0 = -1 + (row / rows) * 4;
		const y1 = -1 + ((row + 1) / rows) * 4;
		for (let column = 0; column < columns; column += 1) {
			const x0 = -2 + (column / columns) * 4;
			const x1 = -2 + ((column + 1) / columns) * 4;
			const losses = [
				rosenbrock(x0, y0),
				rosenbrock(x1, y0),
				rosenbrock(x1, y1),
				rosenbrock(x0, y1)
			];
			const points = [
				projectRosenbrock(x0, y0, losses[0]),
				projectRosenbrock(x1, y0, losses[1]),
				projectRosenbrock(x1, y1, losses[2]),
				projectRosenbrock(x0, y1, losses[3])
			];
			const meanHeight = losses.reduce((sum, value) => sum + heightScale(value), 0) / 4;
			const diagonalLight = (column / columns) * 0.12 + (1 - row / rows) * 0.08;
			cells.push({
				depth: column + row,
				points,
				fill: mixHex('#66706b', '#12171c', clamp(meanHeight * 0.88 + diagonalLight))
			});
		}
	}

	cells.sort((left, right) => left.depth - right.depth);
	return cells
		.map(
			(cell) =>
				`<polygon points="${cell.points.map(svgPoint).join(' ')}" fill="${cell.fill}" stroke="#c9d0c5" stroke-opacity="0.19" stroke-width="0.62"/>`
		)
		.join('\n');
}

function calculateDescent() {
	const learningRate = 0.001;
	const updates = 3_200;
	let x = -1.2;
	let y = 1;
	const samples = [{ iteration: 0, x, y, loss: rosenbrock(x, y) }];

	for (let iteration = 1; iteration <= updates; iteration += 1) {
		const [gradientX, gradientY] = rosenbrockGradient(x, y);
		x -= learningRate * gradientX;
		y -= learningRate * gradientY;
		if (iteration % 16 === 0 || iteration === updates) {
			samples.push({ iteration, x, y, loss: rosenbrock(x, y) });
		}
	}

	return { learningRate, updates, samples, endpoint: samples.at(-1) };
}

function buildDescentPath(descent) {
	const points = descent.samples.map((sample) => {
		const projected = projectRosenbrock(sample.x, sample.y, sample.loss);
		return { x: projected.x, y: projected.y - 5 };
	});
	const pathData = points
		.map((point, index) => `${index === 0 ? 'M' : 'L'} ${svgPoint(point)}`)
		.join(' ');
	const start = points[0];
	const end = points.at(-1);

	return `
		<path d="${pathData}" fill="none" stroke="#090c0f" stroke-opacity="0.8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
		<path d="${pathData}" fill="none" stroke="${GOLD}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
		<circle cx="${start.x.toFixed(2)}" cy="${start.y.toFixed(2)}" r="8" fill="#11161b" stroke="${PAPER}" stroke-width="2"/>
		<circle cx="${end.x.toFixed(2)}" cy="${end.y.toFixed(2)}" r="9" fill="${GOLD}" stroke="#fff4ce" stroke-width="2.4"/>
		<circle cx="${end.x.toFixed(2)}" cy="${end.y.toFixed(2)}" r="15" fill="none" stroke="${GOLD}" stroke-opacity="0.45" stroke-width="1.4"/>
	`;
}

function interpolateContourPoint(first, second, level) {
	const denominator = second.value - first.value;
	const amount = denominator === 0 ? 0.5 : clamp((level - first.value) / denominator);
	return {
		x: first.x + (second.x - first.x) * amount,
		y: first.y + (second.y - first.y) * amount
	};
}

function buildHimmelblauContours() {
	const left = 893;
	const top = 372;
	const width = 245;
	const height = 174;
	const grid = 48;
	const levels = [2, 10, 30, 70, 140];
	const mapPoint = ({ x, y }) => ({
		x: left + ((x + 5) / 10) * width,
		y: top + (1 - (y + 5) / 10) * height
	});
	const segments = [];

	for (const [levelIndex, level] of levels.entries()) {
		for (let row = 0; row < grid; row += 1) {
			const y0 = -5 + (row / grid) * 10;
			const y1 = -5 + ((row + 1) / grid) * 10;
			for (let column = 0; column < grid; column += 1) {
				const x0 = -5 + (column / grid) * 10;
				const x1 = -5 + ((column + 1) / grid) * 10;
				const corners = [
					{ x: x0, y: y0, value: himmelblau(x0, y0) },
					{ x: x1, y: y0, value: himmelblau(x1, y0) },
					{ x: x1, y: y1, value: himmelblau(x1, y1) },
					{ x: x0, y: y1, value: himmelblau(x0, y1) }
				];
				const crossings = [];
				for (const [startIndex, endIndex] of [
					[0, 1],
					[1, 2],
					[2, 3],
					[3, 0]
				]) {
					const start = corners[startIndex];
					const end = corners[endIndex];
					if (
						(start.value < level && end.value >= level) ||
						(end.value < level && start.value >= level)
					) {
						crossings.push(mapPoint(interpolateContourPoint(start, end, level)));
					}
				}

				if (crossings.length === 2) {
					segments.push({ levelIndex, from: crossings[0], to: crossings[1] });
				} else if (crossings.length === 4) {
					const centreBelow = himmelblau((x0 + x1) / 2, (y0 + y1) / 2) < level;
					const pairs = centreBelow
						? [
								[0, 1],
								[2, 3]
							]
						: [
								[0, 3],
								[1, 2]
							];
					for (const [fromIndex, toIndex] of pairs) {
						segments.push({
							levelIndex,
							from: crossings[fromIndex],
							to: crossings[toIndex]
						});
					}
				}
			}
		}
	}

	const contourLines = segments
		.map(
			({ levelIndex, from, to }) =>
				`<line x1="${from.x.toFixed(2)}" y1="${from.y.toFixed(2)}" x2="${to.x.toFixed(2)}" y2="${to.y.toFixed(2)}" stroke="${levelIndex === 0 ? GOLD : PAPER}" stroke-opacity="${levelIndex === 0 ? 0.95 : 0.42}" stroke-width="${levelIndex === 0 ? 1.8 : 1}"/>`
		)
		.join('\n');
	const minima = [
		[3, 2],
		[-2.805118, 3.131312],
		[-3.77931, -3.283186],
		[3.584428, -1.848126]
	]
		.map(([x, y], index) => {
			const point = mapPoint({ x, y });
			return `<g><circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.2" fill="${GOLD}" stroke="#151a1f" stroke-width="1.2"/><text x="${(point.x + 7).toFixed(2)}" y="${(point.y + 3).toFixed(2)}" fill="${PAPER}" font-size="9" font-family="Arial, sans-serif">${index + 1}</text></g>`;
		})
		.join('\n');

	return `
		<g aria-label="Calculated contours of Himmelblau's function">
			<rect x="875" y="333" width="281" height="232" rx="3" fill="#0b0f13" fill-opacity="0.9" stroke="#758087" stroke-opacity="0.58"/>
			<text x="893" y="356" fill="${MUTED}" font-size="11" font-family="Arial, sans-serif" font-weight="700" letter-spacing="1.8">HIMMELBLAU BASIN SURVEY</text>
			<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#11171c" stroke="#657078" stroke-width="0.8"/>
			${contourLines}
			${minima}
			<text x="1127" y="540" fill="${MUTED}" font-size="10" font-family="Georgia, serif" font-style="italic">x</text>
			<text x="899" y="386" fill="${MUTED}" font-size="10" font-family="Georgia, serif" font-style="italic">y</text>
			<text x="893" y="558" fill="${MUTED}" font-size="9.5" font-family="Arial, sans-serif">actual level sets · four minima</text>
		</g>
	`;
}

function buildSvg(descent) {
	const endpoint = descent.endpoint;
	return `<?xml version="1.0" encoding="UTF-8"?>
	<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title description">
		<title id="title">The Landscape of Error</title>
		<desc id="description">An oblique calculated Rosenbrock surface, a gold gradient-descent path, and a contour survey of Himmelblau's function.</desc>
		<defs>
			<linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#090c10"/>
				<stop offset="0.56" stop-color="#171d22"/>
				<stop offset="1" stop-color="#080b0e"/>
			</linearGradient>
			<radialGradient id="surveyGlow" cx="0.44" cy="0.62" r="0.58">
				<stop offset="0" stop-color="#d8ad58" stop-opacity="0.13"/>
				<stop offset="1" stop-color="#d8ad58" stop-opacity="0"/>
			</radialGradient>
			<filter id="grain" x="0" y="0" width="100%" height="100%">
				<feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" seed="1847" stitchTiles="stitch"/>
				<feColorMatrix type="saturate" values="0"/>
				<feComponentTransfer><feFuncA type="table" tableValues="0 0.075"/></feComponentTransfer>
			</filter>
			<filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
				<feGaussianBlur stdDeviation="3" result="blur"/>
				<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
			</filter>
		</defs>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background)"/>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#surveyGlow)"/>
		<g opacity="0.97">${buildRosenbrockSurface()}</g>
		<g filter="url(#goldGlow)">${buildDescentPath(descent)}</g>
		${buildHimmelblauContours()}
		<rect x="0" y="0" width="1200" height="244" fill="#080b0f" fill-opacity="0.82"/>
		<g transform="translate(55 258)">
			<rect width="283" height="31" rx="3" fill="#090d10" fill-opacity="0.84" stroke="#737b7d" stroke-opacity="0.4"/>
			<text x="13" y="21" fill="${PAPER}" font-family="Georgia, 'Times New Roman', serif" font-size="13">L(x,y) = (1−x)² + 100(y−x²)²</text>
		</g>
		<path d="M 54 32 H 1146" stroke="${GOLD}" stroke-width="1" stroke-opacity="0.65"/>
		<text x="56" y="69" fill="${GOLD}" font-family="Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="3.4">AN INTERACTIVE OPTIMISATION ATLAS</text>
		<text x="54" y="140" fill="${PAPER}" font-family="Georgia, 'Times New Roman', serif" font-size="66" font-weight="700" letter-spacing="-1.5">The Landscape of Error</text>
		<text x="57" y="188" fill="#d9dcd8" font-family="Arial, sans-serif" font-size="27" font-weight="500" letter-spacing="0.15">An Interactive Atlas of Gradient Descent</text>
		<text x="58" y="216" fill="#899195" font-family="Arial, sans-serif" font-size="10.5" font-weight="700" letter-spacing="2.25">LEARNING RATES · CURVATURE · MOMENTUM · NOISE · SADDLES</text>
		<g transform="translate(55 546)">
			<rect x="0" y="0" width="354" height="49" rx="3" fill="#0a0e12" fill-opacity="0.86" stroke="#778087" stroke-opacity="0.42"/>
			<circle cx="18" cy="18" r="5" fill="${GOLD}"/>
			<text x="31" y="22" fill="${PAPER}" font-family="Arial, sans-serif" font-size="12.5" font-weight="700">ROSENBROCK · η = ${descent.learningRate} · ${descent.updates.toLocaleString('en-GB')} updates</text>
			<text x="18" y="40" fill="${MUTED}" font-family="Arial, sans-serif" font-size="10.5">calculated endpoint (${endpoint.x.toFixed(3)}, ${endpoint.y.toFixed(3)}) · loss ${endpoint.loss.toExponential(2)}</text>
		</g>
		<text x="56" y="608" fill="#767f83" font-family="Arial, sans-serif" font-size="9.5" letter-spacing="1.7">RAW LOSS CALCULATIONS · LOG-COMPRESSED DISPLAY HEIGHT</text>
		<text x="1145" y="608" text-anchor="end" fill="${PAPER}" font-family="Georgia, 'Times New Roman', serif" font-size="20" font-weight="700">SuvroGhosh.IN</text>
		<rect width="${WIDTH}" height="${HEIGHT}" filter="url(#grain)" opacity="0.7"/>
		<rect x="12" y="12" width="1176" height="606" fill="none" stroke="#9aa09e" stroke-opacity="0.28"/>
	</svg>`;
}

async function main() {
	const descent = calculateDescent();
	const svg = buildSvg(descent);
	await mkdir(path.dirname(OUTPUT), { recursive: true });
	const result = await sharp(Buffer.from(svg))
		.png({ palette: true, colors: 192, compressionLevel: 9, effort: 10, dither: 0.65 })
		.toFile(OUTPUT);

	if (result.width !== WIDTH || result.height !== HEIGHT) {
		throw new Error(
			`Poster dimensions were ${result.width}×${result.height}; expected ${WIDTH}×${HEIGHT}.`
		);
	}
	if (result.size >= 500 * 1024) {
		throw new Error(`Poster is ${result.size} bytes; it must remain below 500 kB.`);
	}

	const digest = createHash('sha256')
		.update(await readFile(OUTPUT))
		.digest('hex');
	console.log(
		`Rendered ${path.relative(ROOT, OUTPUT)} (${result.width}×${result.height}, ${result.size} bytes, sha256 ${digest}).`
	);
}

await main();
