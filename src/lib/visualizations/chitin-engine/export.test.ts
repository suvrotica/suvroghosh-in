import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENOME } from './genome';
import {
	canvasToBlob,
	composeContactSheet,
	createExportFilename,
	createGenomeJsonBlob,
	downloadBlob,
	planExportDimensions,
	sanitizeDownloadFilename,
	sanitizeFilenamePart
} from './export';

function fakeContext(): CanvasRenderingContext2D {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		setTransform: vi.fn(),
		clearRect: vi.fn(),
		fillRect: vi.fn(),
		strokeRect: vi.fn(),
		beginPath: vi.fn(),
		rect: vi.fn(),
		clip: vi.fn(),
		fillText: vi.fn(),
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 1,
		font: '',
		textBaseline: 'alphabetic',
		globalAlpha: 1
	} as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(context: CanvasRenderingContext2D): HTMLCanvasElement {
	return {
		width: 1,
		height: 1,
		getContext: vi.fn(() => context)
	} as unknown as HTMLCanvasElement;
}

describe('Chitin export safety', () => {
	it('plans genuine 1x/2x/4x dimensions and downgrades before unsafe allocation', () => {
		const full = planExportDimensions(1_000, 500, 4);
		expect(full).toMatchObject({
			safe: true,
			requestedScale: 4,
			scale: 4,
			width: 4_000,
			height: 2_000,
			downgraded: false
		});
		expect(full.rgbaBytes).toBe(4_000 * 2_000 * 4);

		const fallback = planExportDimensions(1_000, 500, 4, { maxLongestEdge: 2_500 });
		expect(fallback).toMatchObject({ safe: true, scale: 2, downgraded: true });
		const impossible = planExportDimensions(20_000, 20_000, 4);
		expect(impossible.safe).toBe(false);
		expect(impossible.width).toBe(20_000);
		expect(planExportDimensions(Number.NaN, 100, 2).safe).toBe(false);
	});

	it('produces filesystem-safe bounded filenames', () => {
		expect(sanitizeFilenamePart(' Glassback / Knife:Mite ')).toBe('glassback-knife-mite');
		expect(sanitizeDownloadFilename('../../A Bad<>.PNG')).toBe('a-bad.png');
		expect(createExportFilename('Glassback Knifemite', 'glassback-1847')).toBe(
			'chitin-engine-glassback-knifemite-glassback-1847.png'
		);
		expect(createExportFilename('<script>', '../seed', 'json')).toBe(
			'chitin-engine-script-seed.json'
		);
	});

	it('encodes callback and promise canvas APIs with clear failures', async () => {
		const callbackBlob = new Blob(['callback'], { type: 'image/png' });
		await expect(canvasToBlob({ toBlob: (callback) => callback(callbackBlob) })).resolves.toBe(
			callbackBlob
		);
		const convertedBlob = new Blob(['converted'], { type: 'image/png' });
		await expect(canvasToBlob({ convertToBlob: vi.fn(async () => convertedBlob) })).resolves.toBe(
			convertedBlob
		);
		await expect(canvasToBlob({ toBlob: (callback) => callback(null) })).rejects.toThrow(
			'no image data'
		);
		await expect(canvasToBlob({})).rejects.toThrow('does not support image export');
	});

	it('revokes temporary object URLs and serializes genome-only JSON', async () => {
		const click = vi.fn();
		const remove = vi.fn();
		const append = vi.fn();
		const documentObject = {
			createElement: vi.fn(() => ({
				href: '',
				download: '',
				rel: '',
				style: { display: '' },
				click,
				remove
			})),
			body: { append }
		} as unknown as Document;
		const urlObject = {
			createObjectURL: vi.fn(() => 'blob:fixture'),
			revokeObjectURL: vi.fn()
		} as unknown as Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
		const filename = downloadBlob(new Blob(['x']), '../../Unsafe Name.PNG', {
			document: documentObject,
			url: urlObject
		});
		expect(filename).toBe('unsafe-name.png');
		expect(click).toHaveBeenCalledOnce();
		expect(remove).toHaveBeenCalledOnce();
		expect(urlObject.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');

		const genomeBlob = createGenomeJsonBlob(DEFAULT_GENOME);
		const payload = JSON.parse(await genomeBlob.text()) as Record<string, unknown>;
		expect(payload.format).toBe('suvro-chitin-genome');
		expect(payload).toHaveProperty('genome');
		expect(payload).not.toHaveProperty('pose');
	});

	it('composes tiles sequentially and releases the backing canvas on demand', async () => {
		const context = fakeContext();
		const canvas = fakeCanvas(context);
		const createCanvas = vi.fn((width: number, height: number) => {
			canvas.width = width;
			canvas.height = height;
			return canvas;
		});
		const order: number[] = [];
		const tiles = Array.from({ length: 4 }, (_, index) => ({
			value: { index },
			name: `Specimen ${index}`,
			seed: `seed-${index}`,
			world: 'flooded-gantry'
		}));
		const resource = await composeContactSheet({
			tiles,
			tileWidth: 100,
			tileHeight: 80,
			padding: 10,
			gap: 5,
			labelHeight: 24,
			scale: 2,
			createCanvas,
			renderTile: async (_renderContext, _tile, frame) => {
				order.push(frame.index);
			}
		});
		expect(order).toEqual([0, 1, 2, 3]);
		expect(resource.columns).toBe(2);
		expect(resource.rows).toBe(2);
		expect(resource.plan).toMatchObject({ scale: 2, width: 450, height: 370 });
		expect(canvas.width).toBe(450);
		expect(canvas.height).toBe(370);
		resource.release();
		expect(canvas.width).toBe(1);
		expect(canvas.height).toBe(1);
		resource.release();
	});

	it('rejects invalid or oversized sheets before retaining a canvas', async () => {
		const context = fakeContext();
		const canvas = fakeCanvas(context);
		const createCanvas = vi.fn(() => canvas);
		const tile = { value: 1, name: 'A', seed: 'a', world: 'world' };
		await expect(
			composeContactSheet({
				tiles: Array.from({ length: 5 }, () => tile),
				createCanvas,
				renderTile: vi.fn()
			})
		).rejects.toThrow('exactly 4, 6, or 9');
		expect(createCanvas).not.toHaveBeenCalled();

		await expect(
			composeContactSheet({
				tiles: Array.from({ length: 4 }, () => tile),
				tileWidth: 2_048,
				tileHeight: 2_048,
				scale: 4,
				memoryLimits: { maxLongestEdge: 1_000 },
				createCanvas,
				renderTile: vi.fn()
			})
		).rejects.toThrow('longest edge');
		expect(createCanvas).not.toHaveBeenCalled();
	});
});
