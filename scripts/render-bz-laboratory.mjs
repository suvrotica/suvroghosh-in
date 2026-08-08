import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createServer } from 'vite';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const calibrationPath = path.join(root, 'static', 'data', 'bz-preset-calibration.json');
const imageDirectory = path.join(root, 'static', 'images');
const detailDirectory = path.join(imageDirectory, 'visualizations', 'belousov-zhabotinsky');

const outputPaths = Object.freeze({
	social: path.join(imageDirectory, 'belousov-zhabotinsky-laboratory.png'),
	poster: path.join(detailDirectory, 'bz-laboratory-poster.png'),
	target: path.join(detailDirectory, 'target-waves.png'),
	spiral: path.join(detailDirectory, 'spiral-wave.png'),
	comparison: path.join(detailDirectory, 'bz-turing-comparison.png')
});

const dimensions = Object.freeze({
	social: Object.freeze({ width: 1200, height: 630 }),
	poster: Object.freeze({ width: 1200, height: 1200 }),
	target: Object.freeze({ width: 1400, height: 860 }),
	spiral: Object.freeze({ width: 1400, height: 860 }),
	comparison: Object.freeze({ width: 1400, height: 820 })
});

const colours = Object.freeze({
	ink: '#090a0d',
	panel: '#121318',
	panelSoft: '#191a20',
	paper: '#f1e8d4',
	muted: '#aaa391',
	gold: '#d7a452',
	red: '#ba424c',
	cyan: '#68bbc1',
	line: '#3c3a39'
});

function escapeXml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function sha256(buffer) {
	return crypto.createHash('sha256').update(buffer).digest('hex');
}

function stateSha256(state) {
	const hash = crypto.createHash('sha256');
	hash.update('bz-field-sha256-f64le-v1\0', 'utf8');
	const grid = Buffer.allocUnsafe(4);
	grid.writeUInt32LE(state.size, 0);
	hash.update(grid);
	for (const values of [state.u, state.v]) {
		const bytes = Buffer.allocUnsafe(values.length * Float64Array.BYTES_PER_ELEMENT);
		for (let index = 0; index < values.length; index += 1) {
			bytes.writeDoubleLE(values[index], index * Float64Array.BYTES_PER_ELEMENT);
		}
		hash.update(bytes);
	}
	hash.update(Buffer.from(state.domainMask));
	hash.update(Buffer.from(state.mask));
	return hash.digest('hex');
}

function canonicalStatus(status) {
	return typeof status === 'string' ? status.trim().toUpperCase() : 'UNRECORDED';
}

function finiteNumber(value, label) {
	if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
	return value;
}

function positiveInteger(value, label) {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(`${label} must be a positive safe integer.`);
	}
	return value;
}

function calibrationRows(record) {
	const rows = record?.calibrations ?? record?.presets;
	if (!Array.isArray(rows)) {
		throw new TypeError('The BZ calibration record must contain a calibrations array.');
	}
	return rows;
}

function findRow(rows, aliases, label) {
	const row = rows.find((candidate) => aliases.includes(candidate?.id));
	if (!row) {
		throw new RangeError(`${label} calibration is missing (${aliases.join(' or ')}).`);
	}
	if (!row.setup || typeof row.setup !== 'object') {
		throw new TypeError(`${label} calibration does not contain its exact setup.`);
	}
	positiveInteger(row.steps, `${label} steps`);
	finiteNumber(row.modelTime, `${label} model time`);
	return row;
}

function criterionEvidence(row, id) {
	const criterion = row.objectiveCriteria?.find((candidate) => candidate?.id === id);
	if (!criterion || !criterion.evidence || typeof criterion.evidence !== 'object') {
		throw new RangeError(`${row.id} is missing evidence for ${id}.`);
	}
	return criterion.evidence;
}

function requirePassedCriterion(row, id) {
	const criterion = row.objectiveCriteria?.find((candidate) => candidate?.id === id);
	if (!criterion || criterion.pass !== true) {
		throw new Error(`${row.id} cannot support its publication label because ${id} did not pass.`);
	}
}

function assertPublicationContract(calibration, targetRow, spiralRow, turingRow) {
	if (calibration?.checksum?.algorithm !== 'sha256-f64le-v1') {
		throw new Error('BZ publication rendering requires the sha256-f64le-v1 field contract.');
	}
	for (const row of [targetRow, spiralRow, turingRow]) {
		if (!/^[0-9a-f]{64}$/.test(row.fieldSha256 ?? '')) {
			throw new Error(`${row.id} must provide a lowercase SHA-256 field checksum.`);
		}
		if (row.setup.geometry !== 'circular-dish' || row.setup.boundary !== 'no-flux') {
			throw new Error(`${row.id} must use the labelled circular no-flux domain.`);
		}
	}
	if (targetRow.setup.model !== 'oregonator' || spiralRow.setup.model !== 'oregonator') {
		throw new Error('Target and broken-front publication fields must use the Oregonator setup.');
	}
	if (turingRow.setup.model !== 'schnakenberg') {
		throw new Error('The Turing publication field must use the Schnakenberg setup.');
	}
	requirePassedCriterion(targetRow, 'outward-front-advance');
	requirePassedCriterion(turingRow, 'classical-diffusion-driven-band');
	requirePassedCriterion(turingRow, 'finite-mode-amplification');
}

function formatTime(value) {
	if (Math.abs(value) >= 100) return value.toFixed(0);
	if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, '');
	if (Math.abs(value) >= 1) return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
	return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function formatDt(value) {
	return Number(value).toPrecision(2).replace(/\.0+e/, 'e');
}

function svgBuffer(width, height, body) {
	return Buffer.from(
		`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
	);
}

function textSvg({ width, height, body }) {
	return svgBuffer(
		width,
		height,
		`<style>
		.title{font-family:Georgia,'Times New Roman',serif;font-weight:700;fill:${colours.paper}}
		.sans{font-family:Arial,Helvetica,sans-serif;fill:${colours.paper}}
		.mono{font-family:'Courier New',monospace;fill:${colours.muted};letter-spacing:1.5px}
		</style>${body}`
	);
}

function glassRimSvg(size, accent = colours.gold) {
	const centre = size / 2;
	const radius = size * 0.47;
	return svgBuffer(
		size,
		size,
		`<circle cx="${centre}" cy="${centre}" r="${radius + 3}" fill="none" stroke="#08090b" stroke-width="14" opacity="0.8"/>
		 <circle cx="${centre}" cy="${centre}" r="${radius}" fill="none" stroke="${accent}" stroke-width="3" opacity="0.92"/>
		 <circle cx="${centre}" cy="${centre}" r="${radius - 7}" fill="none" stroke="#fff6d5" stroke-width="1" opacity="0.18"/>`
	);
}

function fieldRaw(renderBZPixelBuffer, state, setup, size, view, palette) {
	const rendered = renderBZPixelBuffer(state, setup, {
		view,
		palette,
		width: size,
		height: size
	});
	return {
		input: Buffer.from(rendered.data.buffer, rendered.data.byteOffset, rendered.data.byteLength),
		raw: { width: rendered.width, height: rendered.height, channels: 4 }
	};
}

async function dishPng(renderBZPixelBuffer, state, setup, size, view, palette, accent) {
	const field = fieldRaw(renderBZPixelBuffer, state, setup, size, view, palette);
	return sharp(field.input, { raw: field.raw })
		.composite([{ input: glassRimSvg(size, accent), left: 0, top: 0 }])
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
}

function replay(BZCpuSolver, row, fractions) {
	const steps = positiveInteger(row.steps, `${row.id} steps`);
	const checkpoints = [...new Set(fractions.map((fraction) => Math.round(steps * fraction)))]
		.map((step) => Math.max(0, Math.min(steps, step)))
		.sort((a, b) => a - b);
	if (!checkpoints.includes(steps)) checkpoints.push(steps);

	const solver = new BZCpuSolver(row.setup);
	const snapshots = new Map([[0, solver.snapshot()]]);
	for (const checkpoint of checkpoints) {
		if (checkpoint > solver.stepIndex) solver.step(checkpoint - solver.stepIndex);
		snapshots.set(checkpoint, solver.snapshot());
	}

	if (solver.stepIndex !== steps) {
		throw new Error(`${row.id} replay stopped at step ${solver.stepIndex}, expected ${steps}.`);
	}
	const expectedTime = steps * row.setup.timestep;
	if (Math.abs(expectedTime - row.modelTime) > Math.max(1e-12, Math.abs(expectedTime) * 1e-12)) {
		throw new Error(
			`${row.id} model time mismatch: setup implies ${expectedTime}, record says ${row.modelTime}.`
		);
	}

	const finalState = snapshots.get(steps);
	const checksum = stateSha256(finalState);
	if (row.fieldSha256 && checksum !== row.fieldSha256) {
		throw new Error(
			`${row.id} field checksum mismatch: replay ${checksum}, calibration ${row.fieldSha256}.`
		);
	}

	return {
		row,
		setup: row.setup,
		steps,
		checkpoints,
		snapshots,
		finalState,
		checksum
	};
}

function frameLabel(run, step, index, labels) {
	return {
		index: String(index + 1).padStart(2, '0'),
		title: labels[index],
		time: `t ${formatTime(step * run.setup.timestep)} · n ${step.toLocaleString('en-US')}`
	};
}

async function renderThreeFramePlate({
	renderBZPixelBuffer,
	run,
	dimension,
	title,
	kicker,
	labels,
	view,
	palette,
	accent,
	footer
}) {
	const panelSize = 408;
	const panelTop = 166;
	const lefts = [48, 496, 944];
	const selectedSteps = [
		0,
		run.checkpoints.find((step) => step > 0 && step < run.steps),
		run.steps
	];
	if (selectedSteps[1] === undefined) selectedSteps[1] = Math.round(run.steps / 2);
	const dishes = await Promise.all(
		selectedSteps.map((step) =>
			dishPng(
				renderBZPixelBuffer,
				run.snapshots.get(step),
				run.setup,
				panelSize,
				view,
				palette,
				accent
			)
		)
	);
	const frames = selectedSteps.map((step, index) => frameLabel(run, step, index, labels));
	const status = canonicalStatus(run.row.status ?? run.row.validationStatus);
	const header = textSvg({
		width: dimension.width,
		height: dimension.height,
		body: `
		<rect width="${dimension.width}" height="${dimension.height}" fill="${colours.ink}"/>
		<rect x="0" y="0" width="12" height="${dimension.height}" fill="${accent}"/>
		<text class="mono" x="48" y="48" font-size="17">${escapeXml(kicker)} · FLOAT64 HEUN REPLAY</text>
		<text class="title" x="48" y="112" font-size="54">${escapeXml(title)}</text>
		<rect x="1112" y="32" width="240" height="42" rx="21" fill="${accent}" opacity="0.16" stroke="${accent}"/>
		<text class="mono" x="1232" y="59" text-anchor="middle" font-size="15" style="fill:${accent}">${escapeXml(status)}</text>
		${lefts
			.map((left, index) => {
				const frame = frames[index];
				return `<rect x="${left}" y="${panelTop}" width="${panelSize}" height="${panelSize}" rx="5" fill="${colours.panel}" stroke="${colours.line}"/>
				<text class="mono" x="${left}" y="620" font-size="16" style="fill:${accent}">${frame.index} / ${escapeXml(frame.title)}</text>
				<text class="sans" x="${left + panelSize / 2}" y="655" text-anchor="middle" font-size="19">${escapeXml(frame.time)}</text>`;
			})
			.join('')}
		<line x1="48" y1="706" x2="1352" y2="706" stroke="${colours.line}"/>
		<text class="sans" x="48" y="750" font-size="20">${escapeXml(footer)}</text>
		<text class="mono" x="48" y="798" font-size="15">MODEL ${escapeXml(run.setup.modelVersion)} · GRID ${run.setup.gridSize}² · Δt ${escapeXml(formatDt(run.setup.timestep))} · ${escapeXml(run.setup.boundary.toUpperCase())}</text>
		<text class="mono" x="1352" y="798" text-anchor="end" font-size="14">FINAL SHA-256 ${escapeXml(run.checksum.slice(0, 16))}…</text>`
	});

	return sharp(header)
		.composite(dishes.map((input, index) => ({ input, left: lefts[index], top: panelTop })))
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
}

async function renderSocial(renderBZPixelBuffer, targetRun) {
	const { width, height } = dimensions.social;
	const dishSize = 596;
	const dish = await dishPng(
		renderBZPixelBuffer,
		targetRun.finalState,
		targetRun.setup,
		dishSize,
		'dish',
		'ferroin',
		colours.gold
	);
	const overlay = textSvg({
		width,
		height,
		body: `
		<rect width="${width}" height="${height}" fill="${colours.ink}"/>
		<rect x="0" y="0" width="16" height="${height}" fill="${colours.red}"/>
		<path d="M560 0V630" stroke="${colours.line}" stroke-width="1"/>
		<text class="mono" x="62" y="76" font-size="17">NUMERICAL EXHIBIT · OREGONATOR</text>
		<text class="title" x="62" y="160" font-size="62">THE LUMINOUS</text>
		<text class="title" x="62" y="226" font-size="62" style="fill:${colours.gold}">CLOCK</text>
		<text class="sans" x="62" y="286" font-size="27">Belousov–Zhabotinsky</text>
		<text class="sans" x="62" y="323" font-size="27">reaction–diffusion laboratory</text>
		<rect x="62" y="375" width="410" height="1" fill="${colours.line}"/>
		<text class="mono" x="62" y="421" font-size="15">CIRCULAR NO-FLUX DISH</text>
		<text class="mono" x="62" y="451" font-size="15">FIXED-STEP HEUN · FLOAT64 CPU</text>
		<text class="mono" x="62" y="481" font-size="15">t = ${escapeXml(formatTime(targetRun.row.modelTime))} · GRID ${targetRun.setup.gridSize}²</text>
		<text class="sans" x="62" y="560" font-size="18" fill="${colours.muted}">Solver-generated field · not a photograph of chemicals</text>`
	});
	return sharp(overlay)
		.composite([{ input: dish, left: 588, top: 17 }])
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
}

async function renderPoster(renderBZPixelBuffer, targetRun) {
	const { width, height } = dimensions.poster;
	const dishSize = 950;
	const dish = await dishPng(
		renderBZPixelBuffer,
		targetRun.finalState,
		targetRun.setup,
		dishSize,
		'dish',
		'ferroin',
		colours.gold
	);
	const overlay = textSvg({
		width,
		height,
		body: `
		<rect width="${width}" height="${height}" fill="${colours.ink}"/>
		<rect x="0" y="0" width="${width}" height="14" fill="${colours.red}"/>
		<text class="mono" x="600" y="64" text-anchor="middle" font-size="17">SOLVER-GENERATED FIELD · OREGONATOR ${escapeXml(targetRun.setup.modelVersion)}</text>
		<text class="title" x="600" y="126" text-anchor="middle" font-size="58">THE LUMINOUS CLOCK</text>
		<line x1="140" y1="1080" x2="1060" y2="1080" stroke="${colours.line}"/>
		<text class="sans" x="600" y="1124" text-anchor="middle" font-size="22">Belousov–Zhabotinsky reaction–diffusion laboratory</text>
		<text class="mono" x="600" y="1162" text-anchor="middle" font-size="14">FLOAT64 HEUN · GRID ${targetRun.setup.gridSize}² · Δt ${escapeXml(formatDt(targetRun.setup.timestep))} · t = ${escapeXml(formatTime(targetRun.row.modelTime))}</text>`
	});
	return sharp(overlay)
		.composite([{ input: dish, left: 125, top: 128 }])
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
}

async function renderComparison(renderBZPixelBuffer, targetRun, turingRun) {
	const { width, height } = dimensions.comparison;
	const dishSize = 552;
	const [targetDish, turingDish] = await Promise.all([
		dishPng(
			renderBZPixelBuffer,
			targetRun.finalState,
			targetRun.setup,
			dishSize,
			'dish',
			'ferroin',
			colours.gold
		),
		dishPng(
			renderBZPixelBuffer,
			turingRun.finalState,
			turingRun.setup,
			dishSize,
			'difference-from-mean',
			'scientific',
			colours.cyan
		)
	]);
	const targetEvidence = criterionEvidence(targetRun.row, 'outward-front-advance');
	const turingEvidence = criterionEvidence(turingRun.row, 'finite-mode-amplification');
	const overlay = textSvg({
		width,
		height,
		body: `
		<rect width="${width}" height="${height}" fill="${colours.ink}"/>
		<rect x="0" y="0" width="12" height="${height}" fill="${colours.cyan}"/>
		<text class="mono" x="48" y="47" font-size="16">SAME MATHEMATICAL FAMILY · DIFFERENT DIAGNOSTIC</text>
		<text class="title" x="48" y="108" font-size="52">BZ wave versus Turing amplification</text>
		<line x1="700" y1="144" x2="700" y2="738" stroke="${colours.line}"/>
		<rect x="60" y="156" width="552" height="552" fill="${colours.panel}" stroke="${colours.line}"/>
		<rect x="788" y="156" width="552" height="552" fill="${colours.panel}" stroke="${colours.line}"/>
		<text class="mono" x="60" y="752" font-size="16" style="fill:${colours.gold}">OREGONATOR · EXCITABLE TRAVELLING FRONT</text>
		<text class="sans" x="60" y="784" font-size="18">t = ${escapeXml(formatTime(targetRun.row.modelTime))} · radius advance ${escapeXml(Number(targetEvidence.measuredAdvance).toFixed(3))} · ${escapeXml(canonicalStatus(targetRun.row.status ?? targetRun.row.validationStatus))}</text>
		<text class="mono" x="788" y="752" font-size="16" style="fill:${colours.cyan}">SCHNAKENBERG · NONZERO-MODE GROWTH</text>
		<text class="sans" x="788" y="784" font-size="18">t = ${escapeXml(formatTime(turingRun.row.modelTime))} · variance(u) ×${escapeXml(Number(turingEvidence.measuredAmplificationU).toFixed(2))} · ${escapeXml(canonicalStatus(turingRun.row.status ?? turingRun.row.validationStatus))}</text>`
	});
	return sharp(overlay)
		.composite([
			{ input: targetDish, left: 60, top: 156 },
			{ input: turingDish, left: 788, top: 156 }
		])
		.png({ compressionLevel: 9, adaptiveFiltering: true })
		.toBuffer();
}

async function verifyDimensions(buffer, expected, label) {
	const metadata = await sharp(buffer).metadata();
	if (metadata.width !== expected.width || metadata.height !== expected.height) {
		throw new Error(
			`${label} dimensions are ${metadata.width}×${metadata.height}, expected ${expected.width}×${expected.height}.`
		);
	}
}

async function writeOrCheck(name, buffer) {
	const targetPath = outputPaths[name];
	await verifyDimensions(buffer, dimensions[name], name);
	const expectedHash = sha256(buffer);
	if (checkOnly) {
		let existing;
		try {
			existing = await fs.readFile(targetPath);
		} catch (error) {
			if (error?.code === 'ENOENT')
				throw new Error(`${path.relative(root, targetPath)} is missing.`, { cause: error });
			throw error;
		}
		await verifyDimensions(existing, dimensions[name], `${name} on disk`);
		const actualHash = sha256(existing);
		if (!existing.equals(buffer)) {
			throw new Error(
				`${path.relative(root, targetPath)} is stale (expected ${expectedHash}, found ${actualHash}).`
			);
		}
		console.log(
			`checked ${path.relative(root, targetPath)} · ${dimensions[name].width}×${dimensions[name].height} · ${actualHash}`
		);
		return;
	}
	await fs.writeFile(targetPath, buffer);
	console.log(
		`wrote ${path.relative(root, targetPath)} · ${dimensions[name].width}×${dimensions[name].height} · ${buffer.byteLength} bytes · ${expectedHash}`
	);
}

const calibration = JSON.parse(await fs.readFile(calibrationPath, 'utf8'));
const rows = calibrationRows(calibration);
const targetRow = findRow(rows, ['target-waves', 'zhabotinsky-dish'], 'Target-wave');
const spiralRow = findRow(rows, ['broken-front-spiral'], 'Broken-front');
const turingRow = findRow(rows, ['diffusion-driven-spots'], 'Turing comparator');
assertPublicationContract(calibration, targetRow, spiralRow, turingRow);

// Vite loads the exact TypeScript implementation used by the interactive browser lab.
// The publication script contributes only deterministic layout, labels, and PNG encoding.
const vite = await createServer({
	root,
	appType: 'custom',
	server: { middlewareMode: true },
	logLevel: 'error'
});

let solverModule;
let displayModule;
try {
	[solverModule, displayModule] = await Promise.all([
		vite.ssrLoadModule('/src/lib/visualizations/bz/solver.ts'),
		vite.ssrLoadModule('/src/lib/visualizations/bz/display.ts')
	]);
} finally {
	await vite.close();
}

const { BZCpuSolver } = solverModule;
const { renderBZPixelBuffer } = displayModule;
const targetRun = replay(BZCpuSolver, targetRow, [0, 0.5, 1]);
const spiralRun = replay(BZCpuSolver, spiralRow, [0, 0.5, 1]);
const turingRun = replay(BZCpuSolver, turingRow, [0, 1]);
const targetAdvance = criterionEvidence(targetRow, 'outward-front-advance');
const brokenActivity = criterionEvidence(spiralRow, 'broken-front-remains-active');

const rendered = {
	social: await renderSocial(renderBZPixelBuffer, targetRun),
	poster: await renderPoster(renderBZPixelBuffer, targetRun),
	target: await renderThreeFramePlate({
		renderBZPixelBuffer,
		run: targetRun,
		dimension: dimensions.target,
		title: 'A radial excitation enters space',
		kicker: 'TARGET-WAVE OBSERVATION PLATE',
		labels: ['INITIAL PERTURBATION', 'OUTWARD TRANSIT', 'FINITE-TIME FIELD'],
		view: 'dish',
		palette: 'ferroin',
		accent: colours.gold,
		footer: `u > 0.2 radius ${Number(targetAdvance.initialRadius).toFixed(3)} → ${Number(targetAdvance.finalRadius).toFixed(3)}; measured advance ${Number(targetAdvance.measuredAdvance).toFixed(3)}.`
	}),
	spiral: await renderThreeFramePlate({
		renderBZPixelBuffer,
		run: spiralRun,
		dimension: dimensions.spiral,
		title: 'Broken front: the curling test',
		kicker: 'FREE-END OBSERVATION PLATE',
		labels: ['DECLARED SEED', 'FREE-END EVOLUTION', 'CALIBRATION ENDPOINT'],
		view: 'dish',
		palette: 'phase-spectrum',
		accent: colours.red,
		footer: `Finite-time candidate: excited cells ${brokenActivity.initialExcitedCells} → ${brokenActivity.finalExcitedCells}; persistent rotation is not validated.`
	}),
	comparison: await renderComparison(renderBZPixelBuffer, targetRun, turingRun)
};

if (!checkOnly) await fs.mkdir(detailDirectory, { recursive: true });
for (const name of ['social', 'poster', 'target', 'spiral', 'comparison']) {
	await writeOrCheck(name, rendered[name]);
}

console.log(
	`${checkOnly ? 'BZ publication assets are current' : 'BZ publication assets generated'} from ${path.relative(root, calibrationPath)}.`
);
console.log(
	`Raster stack ${process.platform}-${process.arch} · Sharp ${sharp.versions.sharp} · libvips ${sharp.versions.vips}.`
);
