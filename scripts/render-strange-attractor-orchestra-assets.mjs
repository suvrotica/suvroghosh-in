import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIRECTORY = path.join(
	ROOT,
	'static',
	'images',
	'visualizations',
	'strange-attractor-orchestra'
);
const MANIFEST_PATH = path.join(
	ROOT,
	'scripts',
	'strange-attractor-orchestra-assets.manifest.json'
);
const CHECK = process.argv.includes('--check');
const MANIFEST_SCHEMA_VERSION = 1;
const GENERATOR_PATH = 'scripts/render-strange-attractor-orchestra-assets.mjs';
const PNG_OPTIONS = Object.freeze({
	palette: true,
	colors: 160,
	compressionLevel: 9,
	effort: 10,
	dither: 0.12
});
const RENDER_CONTRACT = `sharp-svg-png-v1;${JSON.stringify(PNG_OPTIONS)}`;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SEED = 'langford-1847';
const STEP = 0.005;
const BURN_IN = 40_000;
const CALIBRATION = 2_048;
const POINTS = 13_500;
const INFLUENCE = 0.55;

const outputs = [
	{
		filename: 'the-strange-attractor-orchestra.png',
		width: 1200,
		height: 630,
		variant: 'social'
	},
	{ filename: 'langford-poster.png', width: 1440, height: 1080, variant: 'poster' }
];

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function sourceSha256(markup) {
	const normalizedMarkup = markup.replace(/\r\n?/g, '\n');
	return sha256(
		Buffer.from(`${MANIFEST_SCHEMA_VERSION}\0${RENDER_CONTRACT}\0${normalizedMarkup}`, 'utf8')
	);
}

function readPngDimensions(value) {
	if (
		value.length < 24 ||
		!value.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
		value.subarray(12, 16).toString('ascii') !== 'IHDR'
	) {
		return null;
	}
	return {
		width: value.readUInt32BE(16),
		height: value.readUInt32BE(20)
	};
}

function hashString(value) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

function hashLattice(x, y, z, seed) {
	let hash = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ Math.imul(z, 0x6c8e9cf5);
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x7feb352d);
	hash ^= hash >>> 15;
	hash = Math.imul(hash, 0x846ca68b);
	return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function fade(value) {
	return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(a, b, amount) {
	return a + (b - a) * amount;
}

function valueNoise(x, y, z, seed) {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = fade(x - ix);
	const fy = fade(y - iy);
	const fz = fade(z - iz);
	const corner = (dx, dy, dz) => hashLattice(ix + dx, iy + dy, iz + dz, seed) * 2 - 1;
	const lower = lerp(
		lerp(corner(0, 0, 0), corner(1, 0, 0), fx),
		lerp(corner(0, 1, 0), corner(1, 1, 0), fx),
		fy
	);
	const upper = lerp(
		lerp(corner(0, 0, 1), corner(1, 0, 1), fx),
		lerp(corner(0, 1, 1), corner(1, 1, 1), fx),
		fy
	);
	return lerp(lower, upper, fz);
}

function octaveNoise(x, y, z, seed) {
	let value = 0;
	let amplitude = 0.58;
	let scale = 1;
	let normalizer = 0;
	for (let octave = 0; octave < 4; octave += 1) {
		value += valueNoise(x * scale, y * scale, z * scale, seed + octave * 1_013) * amplitude;
		normalizer += amplitude;
		amplitude *= 0.5;
		scale *= 2;
	}
	return value / normalizer;
}

function curl(x, y, z, seed) {
	const epsilon = 0.018;
	const field = (channel, px, py, pz) => octaveNoise(px, py, pz, seed + channel * 77_441);
	const dAzDy = (field(2, x, y + epsilon, z) - field(2, x, y - epsilon, z)) / (2 * epsilon);
	const dAyDz = (field(1, x, y, z + epsilon) - field(1, x, y, z - epsilon)) / (2 * epsilon);
	const dAxDz = (field(0, x, y, z + epsilon) - field(0, x, y, z - epsilon)) / (2 * epsilon);
	const dAzDx = (field(2, x + epsilon, y, z) - field(2, x - epsilon, y, z)) / (2 * epsilon);
	const dAyDx = (field(1, x + epsilon, y, z) - field(1, x - epsilon, y, z)) / (2 * epsilon);
	const dAxDy = (field(0, x, y + epsilon, z) - field(0, x, y - epsilon, z)) / (2 * epsilon);
	const vector = [dAzDy - dAyDz, dAxDz - dAzDx, dAyDx - dAxDy];
	const magnitude = Math.hypot(...vector) || 1;
	const cap = Math.tanh(magnitude * 0.34) / magnitude;
	return vector.map((component) => component * cap);
}

function derivative([x, y, z]) {
	const a = 0.95;
	const b = 0.7;
	const c = 0.6;
	const d = 3.5;
	const e = 0.25;
	const f = 0.1;
	return [
		(z - b) * x - d * y,
		d * x + (z - b) * y,
		c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x
	];
}

function rk4(state) {
	const k1 = derivative(state);
	const k2 = derivative(state.map((value, index) => value + (STEP * k1[index]) / 2));
	const k3 = derivative(state.map((value, index) => value + (STEP * k2[index]) / 2));
	const k4 = derivative(state.map((value, index) => value + STEP * k3[index]));
	return state.map(
		(value, index) => value + (STEP * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index])) / 6
	);
}

function median(values) {
	const ordered = [...values].sort((a, b) => a - b);
	const middle = Math.floor(ordered.length / 2);
	return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function calibration(samples) {
	const medians = [0, 1, 2].map((axis) => median(samples.map((point) => point[axis])));
	const mads = [0, 1, 2].map((axis) =>
		median(samples.map((point) => Math.abs(point[axis] - medians[axis])))
	);
	return { medians, mads };
}

function normalized(point, robust) {
	return point.map((value, axis) =>
		Math.tanh((value - robust.medians[axis]) / (2.5 * (robust.mads[axis] + 1e-9)))
	);
}

function trajectory() {
	let state = [0.1, 0, 0];
	for (let step = 0; step < BURN_IN; step += 1) state = rk4(state);
	const calibrationSamples = [];
	for (let step = 0; step < CALIBRATION; step += 1) {
		state = rk4(state);
		calibrationSamples.push([...state]);
	}
	const robust = calibration(calibrationSamples);
	const raw = [];
	const warped = [];
	const seed = hashString(`${SEED}:noise-field`);
	for (let index = 0; index < POINTS; index += 1) {
		state = rk4(state);
		const point = normalized(state, robust);
		const phase = index * STEP * 0.07;
		const vector = curl(point[0] * 1.2, point[1] * 1.2, point[2] * 1.2 + phase, seed);
		raw.push(point);
		warped.push(point.map((value, axis) => value + vector[axis] * INFLUENCE * 0.24));
	}
	return { raw, warped };
}

function project(point, box) {
	const px = point[0] * 0.86 + point[2] * 0.22;
	const py = point[1] * 0.82 - point[2] * 0.18;
	return [box.x + box.width * (0.5 + px * 0.4), box.y + box.height * (0.5 + py * 0.4)];
}

function pathData(points, box, first = 0, last = points.length, stride = 1) {
	let value = '';
	for (let index = first; index < last; index += stride) {
		const [x, y] = project(points[index], box);
		value += `${value ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
	}
	return value;
}

function fieldContours(width, height, box) {
	const seed = hashString(`${SEED}:visual-decoration`);
	let paths = '';
	for (let line = 0; line < 15; line += 1) {
		let data = '';
		for (let sample = 0; sample <= 54; sample += 1) {
			const t = sample / 54;
			const baseY = (line + 0.65) / 15;
			const n = octaveNoise(t * 2.1, baseY * 2.4, 0.41, seed);
			const x = box.x + box.width * t;
			const y = box.y + box.height * (baseY + n * 0.035);
			data += `${sample ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
		}
		paths += `<path d="${data}" fill="none" stroke="${line % 3 === 0 ? '#5caeb4' : '#8b6f82'}" stroke-opacity="${line % 3 === 0 ? '0.12' : '0.07'}" stroke-width="1"/>`;
	}
	return paths;
}

function escapeXml(value) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function svg({ width, height, variant }, data) {
	const social = variant === 'social';
	const box = social
		? { x: width * 0.38, y: height * 0.06, width: width * 0.6, height: height * 0.88 }
		: { x: width * 0.08, y: height * 0.08, width: width * 0.84, height: height * 0.78 };
	const rawPath = pathData(data.raw, box, 0, data.raw.length, 2);
	const thirds = [
		0,
		Math.floor(data.warped.length / 3),
		Math.floor((2 * data.warped.length) / 3),
		data.warped.length
	];
	const transformedPaths = thirds
		.slice(0, -1)
		.map(
			(start, index) =>
				`<path d="${pathData(data.warped, box, start, thirds[index + 1], 2)}" fill="none" stroke="url(#braid-${index})" stroke-width="${social ? 2.1 : 2.6}" stroke-opacity="0.82" stroke-linecap="round" stroke-linejoin="round"/>`
		)
		.join('');
	const title = escapeXml('The Strange Attractor Orchestra');
	return `<?xml version="1.0" encoding="UTF-8"?>
	<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
		<title id="title">${title}</title>
		<desc id="desc">A deterministic Langford orbit, shown faintly in bone white, is braided through a stronger copper and mineral-cyan curl-weather transformation.</desc>
		<defs>
			<radialGradient id="bg" cx="0.72" cy="0.44" r="0.92"><stop offset="0" stop-color="#172329"/><stop offset="0.45" stop-color="#0a1115"/><stop offset="1" stop-color="#030709"/></radialGradient>
			<linearGradient id="braid-0" x1="0" x2="1"><stop stop-color="#5cbcc2"/><stop offset="1" stop-color="#8d7c9c"/></linearGradient>
			<linearGradient id="braid-1" x1="0" x2="1"><stop stop-color="#927b9c"/><stop offset="1" stop-color="#c88c61"/></linearGradient>
			<linearGradient id="braid-2" x1="0" x2="1"><stop stop-color="#c58a60"/><stop offset="1" stop-color="#78cbd0"/></linearGradient>
			<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${social ? 5 : 7}"/></filter>
			<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="2" seed="1847"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.055"/></feComponentTransfer></filter>
		</defs>
		<rect width="${width}" height="${height}" fill="url(#bg)"/>
		<rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.38"/>
		<g>${fieldContours(width, height, box)}</g>
		<path d="${pathData(data.warped, box, 0, data.warped.length, 5)}" fill="none" stroke="#6cbcc0" stroke-opacity="0.17" stroke-width="${social ? 12 : 17}" filter="url(#soft)"/>
		<path d="${rawPath}" fill="none" stroke="#e3dccb" stroke-opacity="0.28" stroke-width="${social ? 1 : 1.25}" stroke-dasharray="2 5"/>
		${transformedPaths}
		<g transform="translate(${social ? 55 : 85} ${social ? 51 : height - 146})">
			<text x="0" y="0" fill="#76c9cc" font-family="Arial, sans-serif" font-size="${social ? 12 : 15}" font-weight="700" letter-spacing="3">ORBIT → WEATHER → VOICE</text>
			<text x="0" y="${social ? 70 : 50}" fill="#f0ebde" font-family="Georgia, 'Times New Roman', serif" font-size="${social ? 55 : 49}" font-weight="700" letter-spacing="-1.5">${social ? 'The Strange' : title}</text>
			${social ? `<text x="0" y="126" fill="#f0ebde" font-family="Georgia, 'Times New Roman', serif" font-size="55" font-weight="700" letter-spacing="-1.5">Attractor Orchestra</text><text x="2" y="166" fill="#b9b6ad" font-family="Arial, sans-serif" font-size="22">When chaos learns to sing</text>` : `<text x="2" y="84" fill="#a6aaa5" font-family="Arial, sans-serif" font-size="18">Langford · curl weather · warp · ${SEED}</text>`}
		</g>
		<g transform="translate(${social ? 56 : width - 650} ${height - (social ? 54 : 62)})" font-family="Courier New, monospace" font-size="${social ? 11 : 14}" font-weight="700" letter-spacing="1.2">
			<circle cx="5" cy="-4" r="4" fill="none" stroke="#ded6c5"/><text x="17" y="0" fill="#9d9e97">RAW ORBIT</text>
			<rect x="${social ? 128 : 160}" y="-8" width="8" height="8" transform="rotate(45 ${social ? 132 : 164} -4)" fill="none" stroke="#72c5c9"/><text x="${social ? 145 : 180}" y="0" fill="#9d9e97">SEEDED CURL FIELD</text>
			<path d="M${social ? 300 : 370} -4 h22" stroke="#c68c65" stroke-width="2"/><text x="${social ? 330 : 402}" y="0" fill="#9d9e97">BRAIDED RESULT</text>
		</g>
		<rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="#d8d0bb" stroke-opacity="0.13"/>
	</svg>`;
}

function validatePng(definition, buffer) {
	const dimensions = readPngDimensions(buffer);
	if (dimensions?.width !== definition.width || dimensions.height !== definition.height) {
		throw new Error(
			`${definition.filename} is not a PNG with the expected ${definition.width}×${definition.height} dimensions.`
		);
	}
	if (buffer.byteLength >= 750 * 1024) {
		throw new Error(
			`${definition.filename} is ${buffer.byteLength} bytes; budget is below 750 kB.`
		);
	}
}

function manifestRecord(definition, markup, buffer) {
	return {
		filename: definition.filename,
		format: 'png',
		width: definition.width,
		height: definition.height,
		variant: definition.variant,
		sourceSha256: sourceSha256(markup),
		pngSha256: sha256(buffer),
		pngBytes: buffer.byteLength
	};
}

function assetManifest(records) {
	return {
		schemaVersion: MANIFEST_SCHEMA_VERSION,
		generator: GENERATOR_PATH,
		renderContract: RENDER_CONTRACT,
		seed: SEED,
		outputs: records
	};
}

async function readAssetManifest() {
	let contents;
	try {
		contents = await readFile(MANIFEST_PATH, 'utf8');
	} catch {
		throw new Error(
			`${path.relative(ROOT, MANIFEST_PATH)} is missing; run npm run strange-attractor-orchestra:assets.`
		);
	}
	try {
		return JSON.parse(contents);
	} catch {
		throw new Error(`${path.relative(ROOT, MANIFEST_PATH)} is not valid JSON.`);
	}
}

function assertManifestHeader(manifest) {
	if (
		!manifest ||
		typeof manifest !== 'object' ||
		manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION ||
		manifest.generator !== GENERATOR_PATH ||
		manifest.renderContract !== RENDER_CONTRACT ||
		manifest.seed !== SEED ||
		!Array.isArray(manifest.outputs)
	) {
		throw new Error(
			`${path.relative(ROOT, MANIFEST_PATH)} has a stale or invalid render contract; run npm run strange-attractor-orchestra:assets.`
		);
	}
}

function assertManifestRecord(recorded, actual, target) {
	const relativeTarget = path.relative(ROOT, target);
	if (!recorded || recorded.filename !== actual.filename) {
		throw new Error(`${relativeTarget} is missing from the deterministic asset manifest.`);
	}
	if (recorded.sourceSha256 !== actual.sourceSha256) {
		throw new Error(
			`${relativeTarget} has a stale render source; regenerate the deterministic assets.`
		);
	}
	if (
		recorded.format !== actual.format ||
		recorded.width !== actual.width ||
		recorded.height !== actual.height ||
		recorded.variant !== actual.variant ||
		recorded.pngSha256 !== actual.pngSha256 ||
		recorded.pngBytes !== actual.pngBytes
	) {
		throw new Error(
			`${relativeTarget} does not match its deterministic asset manifest; regenerate the assets.`
		);
	}
}

async function verifyOutput(definition, data, manifest, index) {
	const target = path.join(OUTPUT_DIRECTORY, definition.filename);
	let existing;
	try {
		existing = await readFile(target);
	} catch {
		throw new Error(
			`${path.relative(ROOT, target)} is missing; run npm run strange-attractor-orchestra:assets.`
		);
	}
	validatePng(definition, existing);
	// Native SVG rasterization depends on librsvg, Pango, and installed fonts, so Linux and
	// Windows do not produce the same pixels. Bind the platform-neutral SVG/render contract
	// to the exact reviewed PNG instead of rerasterizing during CI verification.
	const record = manifestRecord(definition, svg(definition, data), existing);
	assertManifestRecord(manifest.outputs[index], record, target);
	console.log(
		`Verified ${path.relative(ROOT, target)} (${definition.width}×${definition.height}, ${existing.byteLength} bytes, sha256 ${record.pngSha256}).`
	);
}

async function renderOutput(definition, data, sharp) {
	const markup = svg(definition, data);
	const buffer = await sharp(Buffer.from(markup)).png(PNG_OPTIONS).toBuffer();
	validatePng(definition, buffer);
	const target = path.join(OUTPUT_DIRECTORY, definition.filename);
	await writeFile(target, buffer);
	const record = manifestRecord(definition, markup, buffer);
	console.log(
		`Rendered ${path.relative(ROOT, target)} (${definition.width}×${definition.height}, ${buffer.byteLength} bytes, sha256 ${record.pngSha256}).`
	);
	return record;
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const data = trajectory();
if (CHECK) {
	const manifest = await readAssetManifest();
	assertManifestHeader(manifest);
	if (manifest.outputs.length !== outputs.length) {
		throw new Error(
			`${path.relative(ROOT, MANIFEST_PATH)} has an unexpected output count; regenerate the deterministic assets.`
		);
	}
	for (const [index, definition] of outputs.entries()) {
		await verifyOutput(definition, data, manifest, index);
	}
} else {
	const { default: sharp } = await import('sharp');
	const records = [];
	for (const definition of outputs) records.push(await renderOutput(definition, data, sharp));
	await writeFile(MANIFEST_PATH, `${JSON.stringify(assetManifest(records), null, '\t')}\n`, 'utf8');
	console.log(`Rendered ${path.relative(ROOT, MANIFEST_PATH)}.`);
}
