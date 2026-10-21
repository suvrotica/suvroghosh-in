import { MAX_TIME, snapshotAt } from './engine';
import { ageColour, pathLengths, pointOnPath, queuePath } from './drawing';
import { MODEL_VERSION, POLICY_LABELS, PRESETS } from './presets';
import type { Run, Snapshot } from './types';

export const CANONICAL_URL = 'https://www.suvroghosh.in/blog/visualizations/the-shape-of-waiting';
const number = (value: number | null) => (value === null ? '—' : value.toFixed(1));

/** One frozen horizon supplies both the receipt plate and its machine-readable companion. */
export function receiptReport(run: Run, baseline: Run | null, time: number, replayUrl: string) {
	const horizon = Math.min(MAX_TIME, Math.max(0, Number.isFinite(time) ? time : 0));
	const snapshot = snapshotAt(run, horizon);
	const base = baseline ? snapshotAt(baseline, horizon) : null;
	const settings = { ...run.settings };
	const baseSettings = baseline ? { ...baseline.settings } : null;
	return {
		schemaVersion: 1,
		modelVersion: MODEL_VERSION,
		title: 'The Shape of Waiting',
		canonicalUrl: CANONICAL_URL,
		replayUrl,
		replay: {
			version: MODEL_VERSION,
			settings,
			baseline: baseSettings,
			time: horizon
		},
		scenario: PRESETS.find((preset) => preset.id === run.settings.scenario)?.label,
		settings,
		seed: run.settings.seed,
		arrivalWindow: run.settings.window,
		requestedTime: horizon,
		snapshotTime: snapshot.time,
		finalSimulatedTime: run.endTime,
		status: run.status,
		limitReason: run.limitReason,
		completion: snapshot.final
			? 'resolved cohort'
			: run.status === 'limit' && snapshot.time >= run.endTime
				? 'computation limit reached; unresolved waits remain'
				: 'provisional; unresolved waits or future arrivals remain',
		metrics: snapshot.metrics,
		baseline:
			baseline && base
				? {
						settings: baseSettings,
						metrics: base.metrics,
						snapshotTime: base.time,
						finalSimulatedTime: baseline.endTime,
						completion: base.final ? 'resolved cohort' : 'provisional',
						limitReason: baseline.limitReason
					}
				: null,
		definitions: {
			wait: 'Simulated minutes from queue entry to service start, among people whose service has started. Includes people currently in service.',
			pending: 'People still waiting have only a current age; their eventual wait is unresolved.',
			quantile: 'Hyndman–Fan type 7; linear interpolation at (n−1)p.',
			abandonment:
				'Separate competing outcome; rate denominator is all attended arrivals by the snapshot time.',
			overtaken:
				'Fraction of service starters passed by at least one later arrival before their own service start.',
			classGap: 'Highest minus lowest class P90 among classes with service starters.',
			batch:
				'Members start and finish together; one server is occupied for setup plus summed member work.',
			noShow: 'Clinic scheduled absences do not join or consume service capacity.',
			scope:
				'Synthetic, initially empty finite session. Not a steady-state estimate or measured institutional performance.'
		}
	};
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
	ctx.strokeStyle = '#243a3235';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();
}

/** Same identities, fixed age colours and path geometry as the interactive stage. */
function drawQueue(
	ctx: CanvasRenderingContext2D,
	snapshot: Snapshot,
	x: number,
	y: number,
	width: number,
	height: number
) {
	ctx.save();
	ctx.translate(x, y);
	const path = queuePath(width, height),
		lengths = pathLengths(path);
	ctx.strokeStyle = '#243a3220';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	path.forEach((point, index) => {
		if (index) ctx.lineTo(point.x, point.y);
		else ctx.moveTo(point.x, point.y);
	});
	ctx.stroke();
	const total = lengths[lengths.length - 1] ?? 1;
	const population = snapshot.waiting.length;
	const count = Math.min(250, population);
	const indices = Array.from({ length: count }, (_, index) =>
		Math.floor((index * population) / count)
	);
	const oldestIndex = snapshot.waiting.findIndex((person) => person.id === snapshot.oldest?.id);
	if (oldestIndex >= 0 && !indices.includes(oldestIndex)) indices.push(oldestIndex);
	const occupiedLength = Math.min(total, Math.max(0, population - 1) * 16);
	indices
		.sort((a, b) => a - b)
		.forEach((index) => {
			const person = snapshot.waiting[index];
			const point = pointOnPath(
				path,
				lengths,
				population > 1 ? (index / (population - 1)) * occupiedLength : 0
			);
			ctx.fillStyle = ageColour(person.wait);
			ctx.beginPath();
			if (person.classId === 2) {
				ctx.moveTo(point.x, point.y - 4.8);
				ctx.lineTo(point.x + 4.8, point.y);
				ctx.lineTo(point.x, point.y + 4.8);
				ctx.lineTo(point.x - 4.8, point.y);
				ctx.closePath();
			} else if (person.classId === 1) ctx.rect(point.x - 3.5, point.y - 3.5, 7, 7);
			else ctx.arc(point.x, point.y, 3.8, 0, Math.PI * 2);
			ctx.fill();
			if (person.id === snapshot.oldest?.id) {
				ctx.strokeStyle = '#243a32';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
				ctx.stroke();
			}
		});
	ctx.textAlign = 'center';
	ctx.fillStyle = '#243a32';
	ctx.font = '54px Georgia';
	ctx.fillText(String(snapshot.metrics.waiting), width / 2, height / 2 - 6);
	ctx.font = '11px monospace';
	ctx.fillText('STILL WAITING', width / 2, height / 2 + 17);
	ctx.fillStyle = '#a63f2c';
	ctx.font = '12px monospace';
	ctx.fillText(`Oldest: ${number(snapshot.metrics.oldestAge)} min`, width / 2, height / 2 + 43);
	if (snapshot.metrics.waiting > 250) {
		ctx.fillStyle = '#5c6c62';
		ctx.font = '9px monospace';
		ctx.fillText(`${indices.length} sampled marks / exact counts retained`, width / 2, height - 4);
	}
	ctx.restore();
}

/** Deterministic browser Canvas plate; used for downloads and publication assets. */
export function receiptCanvas(
	run: Run,
	baseline: Run | null,
	time: number,
	replayUrl: string,
	width = 1600,
	height = 1000
): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx)
		throw new Error(
			'Canvas export is unavailable in this browser. The JSON receipt is still available.'
		);
	const w = 1200,
		h = (height * w) / width;
	ctx.scale(width / w, width / w);
	ctx.fillStyle = '#f4f0e6';
	ctx.fillRect(0, 0, w, h);
	const snapshot = snapshotAt(run, time),
		m = snapshot.metrics;
	const base = baseline ? snapshotAt(baseline, time) : null;
	function fittedText(text: string, x: number, y: number, available = 1104) {
		const currentFont = ctx!.font;
		let size = Number.parseFloat(currentFont) || 10;
		while (ctx!.measureText(text).width > available && size > 7) {
			size -= 0.5;
			ctx!.font = currentFont.replace(/^\d+(?:\.\d+)?px/, `${size}px`);
		}
		ctx!.fillText(text, x, y, available);
		ctx!.font = currentFont;
	}
	ctx.fillStyle = '#243a32';
	ctx.font = '10px monospace';
	ctx.fillText('THE EVERYDAY SYSTEMS LABORATORY / NO. 008', 48, 31);
	ctx.textAlign = 'right';
	ctx.fillText(`SEED ${run.settings.seed} / ${MODEL_VERSION}`, 1152, 31);
	ctx.textAlign = 'left';
	line(ctx, 48, 45, 1152, 45);
	ctx.font = '54px Georgia';
	ctx.fillText('The Shape of Waiting.', 48, 105);
	ctx.font = '12px monospace';
	ctx.fillStyle = '#5c6c62';
	fittedText(
		`${PRESETS.find((p) => p.id === run.settings.scenario)?.label.toUpperCase()} / ${POLICY_LABELS[run.settings.policy].toUpperCase()}`,
		50,
		133
	);
	const chartY = 164,
		chartHeight = Math.max(180, h - 368);
	drawQueue(ctx, snapshot, 40, chartY - 6, 610, chartHeight);
	line(ctx, 680, chartY - 12, 680, chartY + chartHeight);
	const plotX = 724,
		plotY = chartY + 38,
		plotW = 400,
		plotH = chartHeight - 91;
	ctx.fillStyle = '#243a32';
	ctx.font = '10px monospace';
	ctx.fillText('THE DISTRIBUTION / SERVICE STARTERS', plotX, chartY + 2);
	const waits = snapshot.people
		.filter((person) => person.state === 'completed' || person.state === 'in-service')
		.map((person) => person.wait);
	const max = Math.max(
		30,
		Math.ceil(Math.max(...waits, ...snapshot.waiting.map((p) => p.wait), 0) / 10) * 10
	);
	const bins = Array<number>(16).fill(0);
	for (const wait of waits) bins[Math.min(15, Math.floor((wait / max) * 16))]++;
	const highest = Math.max(1, ...bins);
	bins.forEach((count, index) => {
		ctx.fillStyle = ageColour(((index + 0.5) / 16) * max);
		const bh = (count / highest) * plotH;
		ctx.fillRect(plotX + (index / 16) * plotW + 1, plotY + plotH - bh, plotW / 16 - 3, bh);
	});
	line(ctx, plotX, plotY + plotH, plotX + plotW, plotY + plotH);
	ctx.fillStyle = '#5c6c62';
	ctx.font = '10px monospace';
	ctx.fillText('0', plotX, plotY + plotH + 16);
	ctx.textAlign = 'right';
	ctx.fillText(`${max} min`, plotX + plotW, plotY + plotH + 16);
	ctx.textAlign = 'left';
	ctx.fillText(`${highest} people / tallest bin`, plotX, plotY - 9);
	for (const person of snapshot.waiting) {
		const px = plotX + (person.wait / max) * plotW;
		ctx.strokeStyle = ageColour(person.wait);
		ctx.beginPath();
		ctx.moveTo(px, plotY + plotH + 28);
		ctx.lineTo(px, plotY + plotH + 36);
		ctx.stroke();
	}
	ctx.fillStyle = '#5c6c62';
	ctx.fillText(`${m.waiting} unresolved waiting ages`, plotX, plotY + plotH + 51);
	const metricsY = h - 167;
	line(ctx, 48, metricsY - 18, 1152, metricsY - 18);
	const values = [
		['MEAN', number(m.mean)],
		['MEDIAN', number(m.median)],
		['P90', number(m.p90)],
		['MAXIMUM', number(m.max)],
		['ABANDONED', `${m.abandoned} / ${m.arrived}`]
	];
	values.forEach(([label, value], index) => {
		const x = 48 + index * 226;
		ctx.fillStyle = '#5c6c62';
		ctx.font = '10px monospace';
		ctx.fillText(label, x, metricsY);
		ctx.fillStyle = '#243a32';
		ctx.font = '30px monospace';
		ctx.fillText(value, x, metricsY + 37);
	});
	ctx.fillStyle = '#a63f2c';
	ctx.font = '10px monospace';
	const classLine = m.classes
		.map((entry, index) => `P${index + 1} ${number(entry.p90)} (n=${entry.n})`)
		.join(' | ');
	fittedText(
		`CLASS P90 / ${classLine} | GAP ${number(m.classGap)} min${base ? ` (A: ${number(base.metrics.classGap)})` : ''}`,
		48,
		h - 112
	);
	const compare = base
		? `A: ${POLICY_LABELS[baseline!.settings.policy]} → B: ${POLICY_LABELS[run.settings.policy]} | mean ${number(base.metrics.mean)} → ${number(m.mean)} | P90 ${number(base.metrics.p90)} → ${number(m.p90)}`
		: `${run.settings.servers} counters | ${run.settings.arrivalRate} arrivals/hour | service mean ${run.settings.meanService} min | CV ${run.settings.variability}`;
	fittedText(compare, 48, h - 97);
	line(ctx, 48, h - 83, 1152, h - 83);
	ctx.fillStyle = '#243a32';
	ctx.font = '10px monospace';
	const status = snapshot.final
		? 'RESOLVED COHORT'
		: run.status === 'limit' && snapshot.time >= run.endTime
			? 'COMPUTATION LIMIT'
			: 'PROVISIONAL SNAPSHOT';
	fittedText(
		`${status} | n=${m.started} service starters | ${m.waiting} unresolved | ${m.noShows} no-shows | t=${snapshot.time.toFixed(1)} min / arrivals ${run.settings.window} min`,
		48,
		h - 66
	);
	ctx.fillStyle = '#5c6c62';
	ctx.font = '9px monospace';
	fittedText(
		'Wait = entry to service start, minutes. Type-7 quantiles. Synthetic finite session; abandonment is a separate outcome.',
		48,
		h - 45
	);
	fittedText(
		'suvroghosh.in/blog/visualizations/the-shape-of-waiting · Downloaded PNG metadata: Replay URL · Full receipt: companion JSON.',
		48,
		h - 27
	);
	// Preserve the complete replay in the accessible canvas name as well as JSON.
	canvas.setAttribute('aria-label', `Waiting receipt. ${replayUrl}`);
	return canvas;
}

export async function receiptPng(
	run: Run,
	baseline: Run | null,
	time: number,
	replayUrl: string
): Promise<Blob> {
	const canvas = receiptCanvas(run, baseline, time, replayUrl);
	const png = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be encoded.'))),
			'image/png'
		)
	);
	const bytes = withPngReplayMetadata(new Uint8Array(await png.arrayBuffer()), replayUrl);
	return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
}

/** Add the complete, machine-readable ASCII URL without shrinking the printed receipt. */
export function withPngReplayMetadata(png: Uint8Array, replayUrl: string): Uint8Array {
	if (replayUrl.length > 8192 || /[^\x20-\x7e]/.test(replayUrl)) {
		throw new Error('The replay URL must be bounded ASCII text.');
	}
	const signature = [137, 80, 78, 71, 13, 10, 26, 10];
	if (signature.some((byte, index) => png[index] !== byte))
		throw new Error('Invalid PNG signature.');
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	let offset = 8;
	while (offset + 12 <= png.length) {
		const length = view.getUint32(offset);
		if (offset + length + 12 > png.length) throw new Error('Truncated PNG chunk.');
		const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
		if (type === 'IEND' && length === 0) {
			const payload = new TextEncoder().encode(`Replay\0${replayUrl}`);
			const chunk = new Uint8Array(payload.length + 12);
			const chunkView = new DataView(chunk.buffer);
			chunkView.setUint32(0, payload.length);
			chunk.set([116, 69, 88, 116], 4); // tEXt
			chunk.set(payload, 8);
			let crc = 0xffffffff;
			for (const byte of chunk.subarray(4, chunk.length - 4)) {
				crc ^= byte;
				for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
			}
			chunkView.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
			const result = new Uint8Array(png.length + chunk.length);
			result.set(png.subarray(0, offset));
			result.set(chunk, offset);
			result.set(png.subarray(offset), offset + chunk.length);
			return result;
		}
		offset += length + 12;
	}
	throw new Error('PNG end chunk is missing.');
}
