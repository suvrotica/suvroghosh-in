import type { Settings } from './config.ts';

export interface FingerprintFrame {
	columns: number;
	rows: number;
	capRows: number;
	radius: number;
	length: number;
	time: number;
	field: Float32Array;
}

export type WorkerRequest =
	| { type: 'start'; id: number; settings: Settings; active: boolean }
	| { type: 'activity'; id: number; active: boolean };

export type WorkerReply =
	| { type: 'frame'; id: number; frame: FingerprintFrame; complete: boolean }
	| { type: 'error'; id: number; message: string };

const HEADER = 28;
const MAGIC = 0x31525046; // FPR1
export const EXAMPLE_DIR = '/images/visualizations/how-fingerprints-form';

export function encodeFrame(frame: FingerprintFrame): ArrayBuffer {
	const buffer = new ArrayBuffer(HEADER + frame.field.length * 4);
	const data = new DataView(buffer);
	data.setUint32(0, MAGIC, true);
	data.setUint32(4, frame.columns, true);
	data.setUint32(8, frame.rows, true);
	data.setFloat32(12, frame.radius, true);
	data.setFloat32(16, frame.length, true);
	data.setFloat32(20, frame.time, true);
	data.setUint32(24, frame.capRows, true);
	for (let i = 0; i < frame.field.length; i++)
		data.setFloat32(HEADER + 4 * i, frame.field[i], true);
	return buffer;
}

export function decodeFrame(buffer: ArrayBuffer): FingerprintFrame {
	const data = new DataView(buffer);
	if (buffer.byteLength < HEADER || data.getUint32(0, true) !== MAGIC) {
		throw new Error('This example uses an unknown frame format.');
	}
	const columns = data.getUint32(4, true);
	const rows = data.getUint32(8, true);
	const radius = data.getFloat32(12, true);
	const length = data.getFloat32(16, true);
	const time = data.getFloat32(20, true);
	const capRows = data.getUint32(24, true);
	const count = columns * rows;
	if (
		columns < 2 ||
		rows < 2 ||
		capRows < 1 ||
		capRows >= rows ||
		count > 1_000_000 ||
		buffer.byteLength !== HEADER + count * 4 ||
		!Number.isFinite(radius) ||
		radius <= 0 ||
		!Number.isFinite(length) ||
		length <= 0 ||
		!Number.isFinite(time) ||
		time < 0
	)
		throw new Error('The saved example frame is incomplete.');
	const field = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		field[i] = data.getFloat32(HEADER + 4 * i, true);
		if (!Number.isFinite(field[i]) || field[i] < 0) throw new Error('The saved signal is invalid.');
	}
	return { columns, rows, capRows, radius, length, time, field };
}

export async function loadDefaultFrame(signal?: AbortSignal): Promise<FingerprintFrame> {
	const response = await fetch(`${EXAMPLE_DIR}/loop.bin`, { signal });
	if (!response.ok) throw new Error('The saved example could not be loaded.');
	return decodeFrame(await response.arrayBuffer());
}
