import { wrapAngle } from './analysis';
import {
	assertFiniteState,
	assertValidParameters,
	cloneState,
	type IntegratorKind,
	type PendulumMode,
	type PendulumParameters,
	type PendulumPresetId,
	type PendulumState
} from './types';

export const STATE_EXPORT_SCHEMA_VERSION = 1;
export const MAX_CSV_ROWS = 5_000;
const EXPORT_INTEGRATORS = new Set<IntegratorKind>(['rk4', 'euler']);
const EXPORT_MODES = new Set<PendulumMode>([
	'lab',
	'shadow',
	'atlas',
	'phase-space',
	'lying-integrator',
	'choir'
]);

export interface StateExportInput {
	parameters: Readonly<PendulumParameters>;
	initialState: Readonly<PendulumState>;
	currentState: Readonly<PendulumState>;
	simulationTime: number;
	integrator: IntegratorKind;
	timestep: number;
	mode: PendulumMode;
	preset?: PendulumPresetId;
	experimentSettings?: Readonly<Record<string, unknown>>;
}

export interface PendulumStateExport {
	schemaVersion: typeof STATE_EXPORT_SCHEMA_VERSION;
	kind: 'suvroghosh.in/double-pendulum-state';
	model: 'ideal-planar-double-pendulum';
	units: {
		angle: 'radian';
		angularVelocity: 'radian/second';
		mass: 'kilogram';
		length: 'metre';
		time: 'second';
	};
	parameters: PendulumParameters;
	initialState: PendulumState;
	currentState: PendulumState;
	simulationTime: number;
	integrator: IntegratorKind;
	timestep: number;
	mode: PendulumMode;
	preset?: PendulumPresetId;
	experimentSettings: Record<string, unknown>;
}

function cloneJsonSettings(
	value: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> {
	if (value === undefined) return {};
	const seen = new Set<object>();
	const visit = (candidate: unknown, path: string): unknown => {
		if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') {
			return candidate;
		}
		if (typeof candidate === 'number') {
			if (!Number.isFinite(candidate)) {
				throw new RangeError(`${path} contains a non-finite number.`);
			}
			return candidate;
		}
		if (Array.isArray(candidate)) {
			if (seen.has(candidate)) throw new TypeError(`${path} contains a circular reference.`);
			seen.add(candidate);
			const result = candidate.map((item, index) => visit(item, `${path}[${index}]`));
			seen.delete(candidate);
			return result;
		}
		if (typeof candidate === 'object') {
			if (seen.has(candidate)) throw new TypeError(`${path} contains a circular reference.`);
			seen.add(candidate);
			const result: Record<string, unknown> = {};
			for (const [key, item] of Object.entries(candidate)) {
				if (typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol')
					continue;
				result[key] = visit(item, `${path}.${key}`);
			}
			seen.delete(candidate);
			return result;
		}
		throw new TypeError(`${path} is not JSON-safe.`);
	};
	return visit(value, 'experimentSettings') as Record<string, unknown>;
}

export function createStateExport(input: Readonly<StateExportInput>): PendulumStateExport {
	assertValidParameters(input.parameters);
	assertFiniteState(input.initialState, 'Initial export state');
	assertFiniteState(input.currentState, 'Current export state');
	if (!Number.isFinite(input.simulationTime) || input.simulationTime < 0) {
		throw new RangeError('Export simulation time must be finite and non-negative.');
	}
	if (!Number.isFinite(input.timestep) || input.timestep <= 0) {
		throw new RangeError('Export timestep must be finite and positive.');
	}
	if (!EXPORT_INTEGRATORS.has(input.integrator)) {
		throw new RangeError('Export integrator must be RK4 or Euler.');
	}
	if (!EXPORT_MODES.has(input.mode)) throw new RangeError('Export mode is not recognised.');
	const result: PendulumStateExport = {
		schemaVersion: STATE_EXPORT_SCHEMA_VERSION,
		kind: 'suvroghosh.in/double-pendulum-state',
		model: 'ideal-planar-double-pendulum',
		units: {
			angle: 'radian',
			angularVelocity: 'radian/second',
			mass: 'kilogram',
			length: 'metre',
			time: 'second'
		},
		parameters: { ...input.parameters },
		initialState: cloneState(input.initialState),
		currentState: cloneState(input.currentState),
		simulationTime: input.simulationTime,
		integrator: input.integrator,
		timestep: input.timestep,
		mode: input.mode,
		experimentSettings: cloneJsonSettings(input.experimentSettings)
	};
	if (input.preset !== undefined) result.preset = input.preset;
	return result;
}

export const buildStateExport = createStateExport;

export function serializeStateExport(input: Readonly<StateExportInput>, indentation = 2): string {
	const safeIndentation = Number.isInteger(indentation) ? Math.min(4, Math.max(0, indentation)) : 2;
	return JSON.stringify(createStateExport(input), null, safeIndentation);
}

export interface ChartDataSample {
	time: number;
	theta1?: number;
	omega1?: number;
	theta2?: number;
	omega2?: number;
	energy?: number;
	energyError?: number;
	separation?: number;
	scaledSeparation?: number;
	lyapunovEstimate?: number;
}

export type ChartDataColumn = keyof ChartDataSample;

const CHART_COLUMN_ORDER: readonly ChartDataColumn[] = [
	'time',
	'theta1',
	'omega1',
	'theta2',
	'omega2',
	'energy',
	'energyError',
	'separation',
	'scaledSeparation',
	'lyapunovEstimate'
];
const CHART_COLUMNS = new Set<ChartDataColumn>(CHART_COLUMN_ORDER);

function csvNumber(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) return '';
	if (Object.is(value, -0)) return '0';
	return Number.parseFloat(value.toPrecision(12)).toString();
}

function sampledIndices(length: number, maximumRows: number): number[] {
	if (length <= maximumRows) return Array.from({ length }, (_, index) => index);
	const indices = new Array<number>(maximumRows);
	for (let index = 0; index < maximumRows; index += 1) {
		indices[index] = Math.round((index * (length - 1)) / (maximumRows - 1));
	}
	return indices;
}

/** Copy-friendly, deterministically down-sampled chart data. */
export function chartSamplesToCsv(
	samples: readonly Readonly<ChartDataSample>[],
	options: { columns?: readonly ChartDataColumn[]; maxRows?: number } = {}
): string {
	const requestedMaximum = options.maxRows;
	const maximumRows = Math.min(
		MAX_CSV_ROWS,
		Math.max(
			2,
			Math.floor(
				requestedMaximum !== undefined && Number.isFinite(requestedMaximum)
					? requestedMaximum
					: MAX_CSV_ROWS
			)
		)
	);
	const requestedColumns = options.columns?.filter((column) => CHART_COLUMNS.has(column));
	const columns =
		requestedColumns && requestedColumns.length > 0
			? [...new Set(requestedColumns)]
			: CHART_COLUMN_ORDER.filter(
					(column) => column === 'time' || samples.some((sample) => sample[column] !== undefined)
				);
	if (!columns.includes('time')) columns.unshift('time');
	const rows = [columns.join(',')];
	for (const index of sampledIndices(samples.length, maximumRows)) {
		const sample = samples[index];
		rows.push(columns.map((column) => csvNumber(sample?.[column])).join(','));
	}
	return rows.join('\n');
}

export const samplesToCsv = chartSamplesToCsv;

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export function sanitizeFilename(
	input: string,
	fallback = 'double-pendulum',
	maxLength = 96
): string {
	const normalized = input
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.replace(/[\\/:*?"<>|]/gu, '-')
		.replace(/\p{Cc}/gu, '-')
		.replace(/\s+/gu, '-')
		.replace(/[^a-z0-9._-]+/giu, '-')
		.replace(/^[.\s-]+|[.\s-]+$/gu, '');
	let safe = normalized.slice(0, Math.max(1, maxLength)).replace(/[.\s-]+$/gu, '');
	if (!safe || WINDOWS_RESERVED_NAME.test(safe)) safe = fallback;
	return safe;
}

function degreeToken(angle: number): string {
	const degrees = (wrapAngle(angle) * 180) / Math.PI;
	const rounded = Math.round(degrees * 100) / 100;
	return Object.is(rounded, -0) ? '0' : rounded.toString();
}

export function snapshotFilename(state: Readonly<PendulumState>, extension = 'png'): string {
	assertFiniteState(state);
	const safeExtension = sanitizeFilename(extension.replace(/^\.+/u, ''), 'png', 8);
	return sanitizeFilename(
		`double-pendulum-chaos-theta1-${degreeToken(state.theta1)}-theta2-${degreeToken(state.theta2)}.${safeExtension}`
	);
}

export function stateFilename(state?: Readonly<PendulumState>): string {
	if (!state) return 'double-pendulum-chaos-state.json';
	return snapshotFilename(state, 'json').replace(
		'double-pendulum-chaos-',
		'double-pendulum-state-'
	);
}

export interface SnapshotLayer {
	source: CanvasImageSource;
	opacity?: number;
	compositeOperation?: GlobalCompositeOperation;
}

export interface SnapshotDrawOptions {
	background?: string;
	title?: string;
	footer?: string;
	padding?: number;
	foreground?: string;
}

/** Draw already-rendered trail and mechanism layers into one export context. */
export function drawCompositeSnapshot(
	context: CanvasRenderingContext2D,
	layers: readonly Readonly<SnapshotLayer>[],
	options: Readonly<SnapshotDrawOptions> = {}
): void {
	const { width, height } = context.canvas;
	if (width <= 0 || height <= 0) throw new RangeError('Snapshot canvas must have a size.');
	context.save();
	try {
		context.globalAlpha = 1;
		context.globalCompositeOperation = 'source-over';
		context.fillStyle = options.background ?? '#101418';
		context.fillRect(0, 0, width, height);
		for (const layer of layers) {
			context.globalAlpha = Math.min(1, Math.max(0, layer.opacity ?? 1));
			context.globalCompositeOperation = layer.compositeOperation ?? 'source-over';
			context.drawImage(layer.source, 0, 0, width, height);
		}
		context.globalAlpha = 1;
		context.globalCompositeOperation = 'source-over';
		context.fillStyle = options.foreground ?? '#f3eee3';
		context.textBaseline = 'top';
		const padding = Math.max(12, options.padding ?? Math.round(width * 0.025));
		if (options.title) {
			context.font = `600 ${Math.max(16, Math.round(width * 0.022))}px system-ui, sans-serif`;
			context.fillText(options.title, padding, padding, width - padding * 2);
		}
		if (options.footer) {
			context.globalAlpha = 0.76;
			context.font = `400 ${Math.max(11, Math.round(width * 0.011))}px ui-monospace, monospace`;
			context.textBaseline = 'bottom';
			context.fillText(options.footer, padding, height - padding, width - padding * 2);
		}
	} finally {
		context.restore();
	}
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
	if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
		return canvas.convertToBlob({ type: 'image/png' });
	}
	if (typeof (canvas as HTMLCanvasElement).toBlob !== 'function') {
		throw new Error('This browser cannot encode a Canvas snapshot as PNG.');
	}
	return new Promise<Blob>((resolve, reject) => {
		(canvas as HTMLCanvasElement).toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(new Error('The browser could not encode the PNG snapshot.'));
		}, 'image/png');
	});
}

export function downloadBlob(blob: Blob, filename: string): void {
	if (
		typeof document === 'undefined' ||
		typeof URL === 'undefined' ||
		typeof URL.createObjectURL !== 'function'
	) {
		throw new Error('Downloads are available only in a browser.');
	}
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = sanitizeFilename(filename);
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadStateExport(input: Readonly<StateExportInput>, filename?: string): void {
	const json = serializeStateExport(input);
	downloadBlob(
		new Blob([json], { type: 'application/json;charset=utf-8' }),
		filename ?? stateFilename(input.initialState)
	);
}

/** Clipboard first, with the traditional hidden-textarea fallback when it is unavailable. */
export async function copyTextLocally(text: string): Promise<'clipboard' | 'fallback'> {
	if (typeof text !== 'string') throw new TypeError('Copied data must be text.');
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return 'clipboard';
		} catch {
			// Continue to the local DOM fallback.
		}
	}
	if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
		throw new Error('Clipboard copying is unavailable in this browser.');
	}
	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.readOnly = true;
	textarea.style.position = 'fixed';
	textarea.style.opacity = '0';
	document.body.append(textarea);
	textarea.select();
	try {
		if (!document.execCommand('copy')) throw new Error('The browser refused the copy command.');
		return 'fallback';
	} finally {
		textarea.remove();
	}
}

export async function copyChartData(
	samples: readonly Readonly<ChartDataSample>[],
	options: { columns?: readonly ChartDataColumn[]; maxRows?: number } = {}
): Promise<'clipboard' | 'fallback'> {
	return copyTextLocally(chartSamplesToCsv(samples, options));
}
