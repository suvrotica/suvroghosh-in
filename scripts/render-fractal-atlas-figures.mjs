import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WIDTH = 1280;
const HEIGHT = 720;
const OUTPUT_DIRECTORY = path.resolve('static/images/fractal-atlas/figures');
const BACKGROUND = '#070912';
const PANEL = '#0D1020';
const PANEL_EDGE = '#34304D';
const INK = '#F2E9D5';
const MUTED = '#A8A6B6';
const BRASS = '#D4AE68';
const TEAL = '#5FB7B4';
const VIOLET = '#8D72CF';
const CORAL = '#DD7658';
const GREEN = '#7EBB8C';

const OBSERVATORY_PALETTE = [
	[7, 9, 20],
	[25, 52, 91],
	[46, 124, 138],
	[199, 179, 106],
	[243, 232, 200]
];

await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });

const outputs = [
	await renderOrbitFates(),
	await renderColourComparison(),
	await renderEscapeMapMutations(),
	await renderPrecisionDiagnostic()
];

for (const output of outputs) {
	const metadata = await sharp(output).metadata();
	const stats = await fs.stat(output);
	process.stdout.write(
		`Rendered ${path.relative(process.cwd(), output)} (${metadata.width}×${metadata.height}, ${formatBytes(stats.size)})\n`
	);
}

async function renderOrbitFates() {
	const output = path.join(OUTPUT_DIRECTORY, 'orbit-fates.webp');
	const panels = [
		{
			x: 44,
			status: '01 · ESCAPED',
			statusColor: CORAL,
			coordinate: 'c = 0.500000 + 0.500000i',
			result: '|z₅| = 3.549354 > 2',
			note: 'A finite witness: the orbit crossed the bailout circle.',
			orbit: mandelbrotOrbit(0.5, 0.5, 20),
			domain: 3.9,
			maxPoints: 6
		},
		{
			x: 442,
			status: '02 · PERIODIC INTERIOR',
			statusColor: GREEN,
			coordinate: 'c = −1.000000 + 0.000000i',
			result: '0 ↔ −1 · exact period 2',
			note: 'This orbit repeats exactly, so it cannot escape.',
			orbit: mandelbrotOrbit(-1, 0, 12),
			domain: 2.25,
			maxPoints: 8
		},
		{
			x: 840,
			status: '03 · UNRESOLVED AT CAP',
			statusColor: BRASS,
			coordinate: 'c = −0.743643887037151',
			coordinateSecondLine: '+ 0.131825904205330i',
			result: 'No escape by N = 240',
			note: 'Finite cap ≠ proof of Mandelbrot-set membership.',
			orbit: mandelbrotOrbit(-0.743643887037151, 0.13182590420533, 240),
			domain: 1.65,
			maxPoints: 241
		}
	];

	const panelMarkup = panels
		.map((panel, panelIndex) => {
			const plot = { x: panel.x + 30, y: 238, width: 332, height: 316 };
			const points = panel.orbit.points.slice(0, panel.maxPoints);
			const pathData = points
				.map((point, index) => {
					const projected = projectComplex(point.re, point.im, plot, panel.domain);
					return `${index === 0 ? 'M' : 'L'}${projected.x.toFixed(2)},${projected.y.toFixed(2)}`;
				})
				.join(' ');
			const dots = points
				.map((point, index) => {
					const projected = projectComplex(point.re, point.im, plot, panel.domain);
					const radius = index === 0 || index === points.length - 1 ? 4.6 : 2.25;
					const fill = index === points.length - 1 ? panel.statusColor : INK;
					return `<circle cx="${projected.x}" cy="${projected.y}" r="${radius}" fill="${fill}" opacity="${index < 3 ? 1 : 0.78}"/>`;
				})
				.join('');
			const bailoutRadius = (2 / (panel.domain * 2)) * plot.width;
			const origin = projectComplex(0, 0, plot, panel.domain);
			return `
				<clipPath id="plot-${panelIndex}"><rect x="${plot.x}" y="${plot.y}" width="${plot.width}" height="${plot.height}" rx="10"/></clipPath>
				<rect x="${panel.x}" y="148" width="384" height="524" rx="18" class="panel"/>
				<text x="${panel.x + 24}" y="184" class="eyebrow" fill="${panel.statusColor}">${panel.status}</text>
				<text x="${panel.x + 24}" y="213" class="mono coordinate">${panel.coordinate}</text>
				${panel.coordinateSecondLine ? `<text x="${panel.x + 24}" y="234" class="mono coordinate">${panel.coordinateSecondLine}</text>` : ''}
				<g clip-path="url(#plot-${panelIndex})">
					<rect x="${plot.x}" y="${plot.y}" width="${plot.width}" height="${plot.height}" rx="10" fill="#070A13"/>
					${plotGrid(plot)}
					<circle cx="${origin.x}" cy="${origin.y}" r="${bailoutRadius}" fill="none" stroke="${BRASS}" stroke-width="1.4" stroke-dasharray="7 7" opacity="0.52"/>
					<path d="${pathData}" fill="none" stroke="${panel.statusColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
					${dots}
				</g>
				<text x="${plot.x + 10}" y="${plot.y + 22}" class="micro" fill="${BRASS}">|z| = 2 bailout</text>
				<text x="${panel.x + 24}" y="590" class="mono result" fill="${panel.statusColor}">${panel.result}</text>
				<text x="${panel.x + 24}" y="620" class="note">${panel.note}</text>`;
		})
		.join('');

	const svg = figureSvg({
		index: 'PLATE 01',
		title: 'Three orbit fates',
		subtitle: 'The same recurrence, classified by what a finite computation can actually witness.',
		body: panelMarkup
	});
	await sharp(Buffer.from(svg)).webp({ quality: 90, effort: 6 }).toFile(output);
	return output;
}

async function renderColourComparison() {
	const output = path.join(OUTPUT_DIRECTORY, 'raw-bands-vs-smooth.webp');
	const imageWidth = 568;
	const imageHeight = 378;
	const view = {
		centerRe: -0.7435,
		centerIm: 0.1314,
		spanY: 0.025,
		maxIterations: 420,
		family: 'mandelbrot'
	};
	const pair = renderBandPair(imageWidth, imageHeight, view);
	const base = Buffer.from(
		figureSvg({
			index: 'PLATE 02',
			title: 'Raw bands versus smooth colouring',
			subtitle:
				'Identical coordinates and iterations; only the mapping from escape time to colour changes.',
			body: `
				<rect x="48" y="150" width="576" height="492" rx="18" class="panel"/>
				<rect x="656" y="150" width="576" height="492" rx="18" class="panel"/>
				<text x="72" y="184" class="eyebrow" fill="${CORAL}">DISCRETE ESCAPE BANDS</text>
				<text x="680" y="184" class="eyebrow" fill="${TEAL}">CONTINUOUS ESCAPE VALUE</text>
				<text x="72" y="616" class="mono result">colour = floor(n / 3)</text>
				<text x="680" y="616" class="mono result">ν = n + 1 − log₂(log₂ |zₙ|)</text>
				<rect x="52" y="202" width="568" height="378" rx="10" fill="none" stroke="${PANEL_EDGE}" stroke-width="1.5"/>
				<rect x="660" y="202" width="568" height="378" rx="10" fill="none" stroke="${PANEL_EDGE}" stroke-width="1.5"/>
				<text x="640" y="676" text-anchor="middle" class="mono footer">centre = −0.743500 + 0.131400i · spanY = 0.025000 · N = 420 · z₀ = 0</text>`
		})
	);
	await sharp(base)
		.composite([
			{ input: Buffer.from(pair.bands), raw: raw(imageWidth, imageHeight), left: 52, top: 202 },
			{ input: Buffer.from(pair.smooth), raw: raw(imageWidth, imageHeight), left: 660, top: 202 }
		])
		.webp({ quality: 90, effort: 6 })
		.toFile(output);
	return output;
}

async function renderEscapeMapMutations() {
	const output = path.join(OUTPUT_DIRECTORY, 'escape-map-mutations.webp');
	const imageWidth = 360;
	const imageHeight = 376;
	const panels = [
		{
			x: 44,
			family: 'mandelbrot',
			label: 'MANDELBROT',
			formula: 'zₙ₊₁ = zₙ² + c',
			mutation: 'ordinary quadratic map',
			color: TEAL,
			view: { centerRe: -0.5, centerIm: 0, spanY: 2.75, maxIterations: 300 }
		},
		{
			x: 460,
			family: 'tricorn',
			label: 'TRICORN',
			formula: 'zₙ₊₁ = conj(zₙ)² + c',
			mutation: 'conjugate before squaring',
			color: VIOLET,
			view: { centerRe: 0, centerIm: 0, spanY: 2.85, maxIterations: 300 }
		},
		{
			x: 876,
			family: 'burning-ship',
			label: 'BURNING SHIP',
			formula: 'zₙ₊₁ = (|Re zₙ| + i|Im zₙ|)² + c',
			mutation: 'absolute values before squaring',
			color: CORAL,
			view: { centerRe: -0.45, centerIm: -0.5, spanY: 2.35, maxIterations: 300 }
		}
	];
	const composites = [];
	for (const panel of panels) {
		const data = renderEscapeImage(imageWidth, imageHeight, {
			...panel.view,
			family: panel.family,
			coloring: 'smooth',
			paletteOffset: panel.family === 'tricorn' ? 0.11 : panel.family === 'burning-ship' ? 0.21 : 0
		});
		composites.push({
			input: Buffer.from(data),
			raw: raw(imageWidth, imageHeight),
			left: panel.x,
			top: 194
		});
	}
	const panelMarkup = panels
		.map(
			(panel) => `
				<rect x="${panel.x - 4}" y="150" width="368" height="510" rx="18" class="panel"/>
				<text x="${panel.x + 16}" y="181" class="eyebrow" fill="${panel.color}">${panel.label}</text>
				<rect x="${panel.x}" y="194" width="360" height="376" rx="10" fill="none" stroke="${PANEL_EDGE}" stroke-width="1.5"/>
				<text x="${panel.x + 16}" y="606" class="mono formula" fill="${INK}">${panel.formula}</text>
				<text x="${panel.x + 16}" y="634" class="note">${panel.mutation}</text>`
		)
		.join('');
	const base = Buffer.from(
		figureSvg({
			index: 'PLATE 03',
			title: 'Three escape maps, one mutation at a time',
			subtitle:
				'Every pixel supplies c and begins at z₀ = 0; the recurrence is the only structural change.',
			body:
				panelMarkup +
				`<text x="640" y="690" text-anchor="middle" class="mono footer">Rendered with the same palette and smooth escape-time rule · panel viewports are chosen to reveal each family</text>`
		})
	);
	await sharp(base).composite(composites).webp({ quality: 90, effort: 6 }).toFile(output);
	return output;
}

async function renderPrecisionDiagnostic() {
	const output = path.join(OUTPUT_DIRECTORY, 'precision-tier-diagnostic.webp');
	const imageWidth = 568;
	const imageHeight = 348;
	const view = {
		centerRe: -0.743643887037151,
		centerIm: 0.13182590420533,
		spanY: 2e-8,
		maxIterations: 1400,
		family: 'mandelbrot',
		coloring: 'smooth'
	};
	const floatCoordinates = coordinateCardinality(imageWidth, imageHeight, view, true);
	const referenceCoordinates = coordinateCardinality(imageWidth, imageHeight, view, false);
	const floatImage = renderEscapeImage(imageWidth, imageHeight, {
		...view,
		arithmetic: 'float32',
		paletteOffset: 0.12
	});
	const referenceImage = renderEscapeImage(imageWidth, imageHeight, {
		...view,
		arithmetic: 'double',
		paletteOffset: 0.12
	});
	const base = Buffer.from(
		figureSvg({
			index: 'PLATE 04',
			title: 'When nearby pixels become the same number',
			subtitle:
				'A deterministic arithmetic diagnostic at one deep viewport—not a device-speed benchmark.',
			body: `
				<rect x="48" y="150" width="576" height="474" rx="18" class="panel"/>
				<rect x="656" y="150" width="576" height="474" rx="18" class="panel"/>
				<text x="72" y="184" class="eyebrow" fill="${CORAL}">ORDINARY FLOAT32 · COLLAPSED</text>
				<text x="680" y="184" class="eyebrow" fill="${TEAL}">EXTENDED-TIER RECOVERY · REFERENCE</text>
				<rect x="52" y="202" width="568" height="348" rx="10" fill="none" stroke="${PANEL_EDGE}" stroke-width="1.5"/>
				<rect x="660" y="202" width="568" height="348" rx="10" fill="none" stroke="${PANEL_EDGE}" stroke-width="1.5"/>
				<text x="72" y="582" class="mono result" fill="${CORAL}">${floatCoordinates.x} distinct x / ${imageWidth} columns · ${floatCoordinates.y} distinct y / ${imageHeight} rows</text>
				<text x="680" y="582" class="mono result" fill="${TEAL}">${referenceCoordinates.x} distinct x / ${imageWidth} columns · ${referenceCoordinates.y} distinct y / ${imageHeight} rows</text>
				<text x="640" y="652" text-anchor="middle" class="mono footer">centre = −0.743643887037151 + 0.131825904205330i · spanY = 2×10⁻⁸ · N = 1400</text>
				<text x="640" y="683" text-anchor="middle" class="caveat">Right: binary64 reference arithmetic at this scale, illustrating the recovery target; not a claim about every GPU or tier.</text>`
		})
	);
	await sharp(base)
		.composite([
			{ input: Buffer.from(floatImage), raw: raw(imageWidth, imageHeight), left: 52, top: 202 },
			{
				input: Buffer.from(referenceImage),
				raw: raw(imageWidth, imageHeight),
				left: 660,
				top: 202
			}
		])
		.webp({ quality: 92, effort: 6 })
		.toFile(output);
	return output;
}

function renderBandPair(width, height, view) {
	const bands = new Uint8ClampedArray(width * height * 4);
	const smooth = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const c = pixelToComplex(x, y, width, height, view);
			const sample = iterateEscape(c.re, c.im, view.maxIterations, 'mandelbrot', 'double');
			const offset = (y * width + x) * 4;
			if (!sample.escaped) {
				writeRgb(bands, offset, [5, 7, 14]);
				writeRgb(smooth, offset, [5, 7, 14]);
				continue;
			}
			writeRgb(bands, offset, paletteAt((Math.floor(sample.iteration / 3) % 28) / 28, 1));
			writeRgb(smooth, offset, paletteAt(sample.smooth * 0.037, 1));
		}
	}
	return { bands, smooth };
}

function renderEscapeImage(width, height, options) {
	const data = new Uint8ClampedArray(width * height * 4);
	const arithmetic = options.arithmetic ?? 'double';
	const floatCache = arithmetic === 'float32' ? new Map() : null;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const point = pixelToComplex(x, y, width, height, options);
			const cRe = arithmetic === 'float32' ? Math.fround(point.re) : point.re;
			const cIm = arithmetic === 'float32' ? Math.fround(point.im) : point.im;
			const cacheKey = floatCache ? `${cRe},${cIm}` : '';
			let sample = floatCache?.get(cacheKey);
			if (!sample) {
				sample = iterateEscape(cRe, cIm, options.maxIterations, options.family, arithmetic);
				floatCache?.set(cacheKey, sample);
			}
			const offset = (y * width + x) * 4;
			if (!sample.escaped) {
				const grid = ((x + y) & 15) === 0 ? 2 : 0;
				writeRgb(data, offset, [5 + grid, 7 + grid, 14 + grid]);
				continue;
			}
			const value =
				options.coloring === 'bands'
					? (Math.floor(sample.iteration / 3) % 28) / 28
					: sample.smooth * 0.037;
			const edge = Math.min(1, sample.iteration / 18);
			const colour = paletteAt(value + (options.paletteOffset ?? 0), edge);
			writeRgb(data, offset, colour);
		}
	}
	return data;
}

function iterateEscape(cRe, cIm, maxIterations, family, arithmetic) {
	let zRe = 0;
	let zIm = 0;
	const f = arithmetic === 'float32' ? Math.fround : identity;
	for (let iteration = 0; iteration < maxIterations; iteration += 1) {
		let mapRe = zRe;
		let mapIm = zIm;
		if (family === 'tricorn') mapIm = f(-mapIm);
		if (family === 'burning-ship') {
			mapRe = f(Math.abs(mapRe));
			mapIm = f(Math.abs(mapIm));
		}
		const squaredRe = f(f(mapRe * mapRe) - f(mapIm * mapIm));
		const squaredIm = f(f(2 * mapRe) * mapIm);
		zRe = f(squaredRe + cRe);
		zIm = f(squaredIm + cIm);
		const magnitudeSquared = f(f(zRe * zRe) + f(zIm * zIm));
		if (magnitudeSquared > 256 || !Number.isFinite(magnitudeSquared)) {
			const magnitude = Math.sqrt(Math.max(256, magnitudeSquared));
			const smooth =
				iteration + 1 - Math.log2(Math.max(1, Math.log2(Math.max(1.0000001, magnitude))));
			return { escaped: true, iteration: iteration + 1, smooth };
		}
	}
	return { escaped: false, iteration: maxIterations, smooth: maxIterations };
}

function coordinateCardinality(width, height, view, float32) {
	const xs = new Set();
	const ys = new Set();
	for (let x = 0; x < width; x += 1) {
		const coordinate = pixelToComplex(x, 0, width, height, view).re;
		xs.add(float32 ? Math.fround(coordinate) : coordinate);
	}
	for (let y = 0; y < height; y += 1) {
		const coordinate = pixelToComplex(0, y, width, height, view).im;
		ys.add(float32 ? Math.fround(coordinate) : coordinate);
	}
	return { x: xs.size, y: ys.size };
}

function pixelToComplex(x, y, width, height, view) {
	const spanX = view.spanY * (width / height);
	return {
		re: view.centerRe + (x / Math.max(1, width - 1) - 0.5) * spanX,
		im: view.centerIm + (0.5 - y / Math.max(1, height - 1)) * view.spanY
	};
}

function mandelbrotOrbit(cRe, cIm, maxIterations) {
	const points = [];
	let re = 0;
	let im = 0;
	let escapedAt = null;
	for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
		points.push({ re, im, iteration });
		if (re * re + im * im > 4) {
			escapedAt = iteration;
			break;
		}
		const nextRe = re * re - im * im + cRe;
		im = 2 * re * im + cIm;
		re = nextRe;
	}
	return { points, escapedAt };
}

function paletteAt(value, brightness = 1) {
	const wrapped = ((value % 1) + 1) % 1;
	const scaled = wrapped * (OBSERVATORY_PALETTE.length - 1);
	const index = Math.min(OBSERVATORY_PALETTE.length - 2, Math.floor(scaled));
	const amount = scaled - index;
	return OBSERVATORY_PALETTE[index].map((channel, channelIndex) =>
		Math.round(
			(channel + (OBSERVATORY_PALETTE[index + 1][channelIndex] - channel) * amount) * brightness
		)
	);
}

function writeRgb(target, offset, color) {
	target[offset] = clampChannel(color[0]);
	target[offset + 1] = clampChannel(color[1]);
	target[offset + 2] = clampChannel(color[2]);
	target[offset + 3] = 255;
}

function plotGrid(plot) {
	const lines = [];
	for (let index = 1; index < 6; index += 1) {
		const x = plot.x + (plot.width * index) / 6;
		const y = plot.y + (plot.height * index) / 6;
		lines.push(
			`<line x1="${x}" y1="${plot.y}" x2="${x}" y2="${plot.y + plot.height}" class="grid-line"/>`,
			`<line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.width}" y2="${y}" class="grid-line"/>`
		);
	}
	lines.push(
		`<line x1="${plot.x + plot.width / 2}" y1="${plot.y}" x2="${plot.x + plot.width / 2}" y2="${plot.y + plot.height}" class="axis-line"/>`,
		`<line x1="${plot.x}" y1="${plot.y + plot.height / 2}" x2="${plot.x + plot.width}" y2="${plot.y + plot.height / 2}" class="axis-line"/>`
	);
	return lines.join('');
}

function projectComplex(re, im, plot, domain) {
	return {
		x: plot.x + ((re + domain) / (domain * 2)) * plot.width,
		y: plot.y + ((domain - im) / (domain * 2)) * plot.height
	};
}

function figureSvg({ index, title, subtitle, body }) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
		<defs>
			<radialGradient id="field" cx="50%" cy="0%" r="105%">
				<stop offset="0%" stop-color="#21183A"/>
				<stop offset="48%" stop-color="${BACKGROUND}"/>
				<stop offset="100%" stop-color="#05060C"/>
			</radialGradient>
			<pattern id="atlas-grid" width="48" height="48" patternUnits="userSpaceOnUse">
				<path d="M 48 0 L 0 0 0 48" fill="none" stroke="#8378A3" stroke-width="0.7" opacity="0.09"/>
				<circle cx="0" cy="0" r="1.2" fill="${BRASS}" opacity="0.18"/>
			</pattern>
			<style>
				.title { font-family: Georgia, 'Times New Roman', serif; font-size: 38px; font-weight: 600; fill: ${INK}; letter-spacing: -0.4px; }
				.subtitle { font-family: Arial, Helvetica, sans-serif; font-size: 16px; fill: ${MUTED}; letter-spacing: 0.2px; }
				.eyebrow { font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 2px; }
				.mono { font-family: 'Courier New', Courier, monospace; }
				.coordinate { font-size: 13px; fill: ${INK}; }
				.result { font-size: 14px; font-weight: 700; fill: ${INK}; }
				.formula { font-size: 15px; font-weight: 700; }
				.note { font-family: Arial, Helvetica, sans-serif; font-size: 12px; fill: ${MUTED}; }
				.footer { font-size: 13px; fill: ${MUTED}; }
				.caveat { font-family: Arial, Helvetica, sans-serif; font-size: 12px; fill: ${BRASS}; }
				.micro { font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 0.6px; }
				.panel { fill: ${PANEL}; stroke: ${PANEL_EDGE}; stroke-width: 1.25; }
				.grid-line { stroke: #8F88A2; stroke-width: 0.75; opacity: 0.16; }
				.axis-line { stroke: #D8D0BC; stroke-width: 1; opacity: 0.28; }
			</style>
		</defs>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#field)"/>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#atlas-grid)"/>
		<line x1="44" y1="126" x2="1236" y2="126" stroke="${BRASS}" stroke-width="1" opacity="0.42"/>
		<text x="46" y="43" class="eyebrow" fill="${BRASS}">${index} · THE FRACTAL ATLAS</text>
		<text x="44" y="84" class="title">${title}</text>
		<text x="44" y="112" class="subtitle">${subtitle}</text>
		${body}
	</svg>`;
}

function raw(width, height) {
	return { width, height, channels: 4 };
}

function formatBytes(value) {
	if (value < 1024) return `${value} B`;
	return `${(value / 1024).toFixed(1)} kB`;
}

function clampChannel(value) {
	return Math.max(0, Math.min(255, Math.round(value)));
}

function identity(value) {
	return value;
}
