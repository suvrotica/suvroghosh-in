import { describe, expect, it, vi } from 'vitest';
import {
	canvasToPngBlob,
	chartSamplesToCsv,
	copyTextLocally,
	createStateExport,
	drawCompositeSnapshot,
	sanitizeFilename,
	serializeStateExport,
	snapshotFilename,
	STATE_EXPORT_SCHEMA_VERSION,
	stateFilename,
	type SnapshotLayer,
	type StateExportInput
} from './export';

function exportInput(): StateExportInput {
	return {
		parameters: { m1: 1, m2: 1.5, l1: 0.9, l2: 1.1, g: 9.81 },
		initialState: {
			theta1: (120 * Math.PI) / 180,
			omega1: 0,
			theta2: (-10 * Math.PI) / 180,
			omega2: 0
		},
		currentState: { theta1: 0.7, omega1: -1.2, theta2: -0.4, omega2: 0.8 },
		simulationTime: 12.5,
		integrator: 'rk4',
		timestep: 1 / 240,
		mode: 'shadow',
		preset: 'classic-chaos',
		experimentSettings: { perturbationDimension: 'theta1', perturbationMagnitude: 1e-7 }
	};
}

describe('state and chart exports', () => {
	it('includes the versioned model, parameters, both states, and timing metadata', () => {
		const input = exportInput();
		const exported = createStateExport(input);
		expect(exported.schemaVersion).toBe(STATE_EXPORT_SCHEMA_VERSION);
		expect(exported.parameters).toEqual(input.parameters);
		expect(exported.initialState).toEqual(input.initialState);
		expect(exported.currentState).toEqual(input.currentState);
		expect(exported.simulationTime).toBe(12.5);
		expect(exported.integrator).toBe('rk4');
		expect(exported.timestep).toBe(1 / 240);
		expect(JSON.parse(serializeStateExport(input))).toEqual(exported);
	});

	it('rejects corrupt state exports instead of writing non-finite JSON', () => {
		const input = exportInput();
		expect(() => createStateExport({ ...input, simulationTime: Number.NaN })).toThrow(RangeError);
		expect(() =>
			createStateExport({
				...input,
				experimentSettings: { unsafe: Number.POSITIVE_INFINITY }
			})
		).toThrow(RangeError);
		expect(() =>
			createStateExport({ ...input, integrator: 'bogus' as StateExportInput['integrator'] })
		).toThrow(RangeError);
	});

	it('copies a bounded, representative CSV including the first and last visible samples', () => {
		const samples = Array.from({ length: 100 }, (_, time) => ({ time, separation: time / 10 }));
		const csv = chartSamplesToCsv(samples, { columns: ['separation'], maxRows: 5 });
		const rows = csv.split('\n');
		expect(rows).toHaveLength(6);
		expect(rows[0]).toBe('time,separation');
		expect(rows[1]).toBe('0,0');
		expect(rows.at(-1)).toBe('99,9.9');
		expect(() => chartSamplesToCsv(samples, { maxRows: Number.NaN })).not.toThrow();
	});
});

describe('local image-export helpers', () => {
	it('sanitizes paths and creates concise parameter filenames', () => {
		expect(sanitizeFilename('../A perilous: file?.png')).toBe('A-perilous--file-.png');
		expect(sanitizeFilename('CON.txt')).toBe('double-pendulum');
		const initial = exportInput().initialState;
		expect(snapshotFilename(initial)).toBe('double-pendulum-chaos-theta1-120-theta2--10.png');
		expect(stateFilename(initial)).toBe('double-pendulum-state-theta1-120-theta2--10.json');
	});

	it('composites trail and mechanism layers in order, without drawing the control interface', () => {
		const calls: string[] = [];
		const context = {
			canvas: { width: 1200, height: 630 },
			globalAlpha: 1,
			globalCompositeOperation: 'source-over',
			fillStyle: '',
			textBaseline: 'top',
			font: '',
			save: vi.fn(() => calls.push('save')),
			restore: vi.fn(() => calls.push('restore')),
			fillRect: vi.fn(() => calls.push('background')),
			drawImage: vi.fn((source: { id: string }) => calls.push(source.id)),
			fillText: vi.fn((text: string) => calls.push(text))
		} as unknown as CanvasRenderingContext2D;
		const layers = [
			{ source: { id: 'trail' } as unknown as CanvasImageSource },
			{ source: { id: 'mechanism' } as unknown as CanvasImageSource }
		] satisfies SnapshotLayer[];
		drawCompositeSnapshot(context, layers, { title: 'Double pendulum', footer: 'RK4 · 1/240 s' });
		expect(calls).toEqual([
			'save',
			'background',
			'trail',
			'mechanism',
			'Double pendulum',
			'RK4 · 1/240 s',
			'restore'
		]);
	});

	it('encodes via a local OffscreenCanvas-compatible API when available', async () => {
		const expected = new Blob(['png'], { type: 'image/png' });
		const canvas = {
			convertToBlob: vi.fn(async () => expected)
		} as unknown as OffscreenCanvas;
		await expect(canvasToPngBlob(canvas)).resolves.toBe(expected);
	});

	it('reports clipboard unavailability outside a browser instead of pretending to copy', async () => {
		await expect(copyTextLocally('time,separation\n0,0')).rejects.toThrow('unavailable');
	});
});
