import { describe, expect, it } from 'vitest';
import { createFamilyDefaultState } from './families';
import {
	createFractalPngExportPlan,
	drawFractalPngCaption,
	PNG_EXPORT_MAX_DIMENSION,
	PNG_EXPORT_MAX_PIXELS,
	renderFractalPngTiles
} from './png-export';

describe('Fractal Atlas PNG caption', () => {
	it('draws the opt-in title, formula and coordinate inside the requested bitmap', () => {
		const drawn: string[] = [];
		const context = {
			fillStyle: '',
			font: '',
			textAlign: 'left',
			textBaseline: 'alphabetic',
			save() {},
			restore() {},
			fillRect() {},
			measureText(text: string) {
				return { width: text.length * 7 };
			},
			fillText(text: string) {
				drawn.push(text);
			}
		} as unknown as CanvasRenderingContext2D;

		drawFractalPngCaption(context, 1200, 800, {
			title: 'The Fractal Atlas: A Field Guide to Infinity',
			formula: 'zₙ₊₁ = zₙ² + c',
			coordinate: 'centre −0.743643887037151 + 0.13182590420533i'
		});

		expect(drawn).toEqual([
			'The Fractal Atlas: A Field Guide to Infinity',
			'zₙ₊₁ = zₙ² + c',
			'centre −0.743643887037151 + 0.13182590420533i'
		]);
	});
});

describe('Fractal Atlas tiled PNG planning', () => {
	it('covers odd dimensions exactly with bounded edge tiles', () => {
		const state = createFamilyDefaultState('mandelbrot');
		const plan = createFractalPngExportPlan(state, {
			width: 101,
			height: 65,
			tileSize: 32
		});

		expect(plan.totalTiles).toBe(12);
		expect(plan.tiles.at(-1)).toEqual({
			index: 11,
			x: 96,
			y: 64,
			width: 5,
			height: 1
		});
		expect(plan.tiles.reduce((pixels, tile) => pixels + tile.width * tile.height, 0)).toBe(
			101 * 65
		);
		expect(
			new Set(
				plan.tiles.flatMap((tile) =>
					Array.from({ length: tile.height }, (_, localY) =>
						Array.from(
							{ length: tile.width },
							(_, localX) => `${tile.x + localX}:${tile.y + localY}`
						)
					).flat()
				)
			).size
		).toBe(101 * 65);
	});

	it('rejects fractional, oversized, over-budget, and unsupported plans', () => {
		const state = createFamilyDefaultState('mandelbrot');
		expect(() => createFractalPngExportPlan(state, { width: 10.5, height: 10 })).toThrow(
			/width must be an integer/
		);
		expect(() =>
			createFractalPngExportPlan(state, {
				width: PNG_EXPORT_MAX_DIMENSION + 1,
				height: 1
			})
		).toThrow(/width must be an integer/);
		expect(() =>
			createFractalPngExportPlan(state, {
				width: 2_000,
				height: 2_000,
				maxPixels: 1_000_000
			})
		).toThrow(/pixel safety cap/);
		expect(() =>
			createFractalPngExportPlan(state, {
				width: 100,
				height: 100,
				maximumIterations: 0
			})
		).toThrow(/maximumIterations must be an integer/);
		expect(() =>
			createFractalPngExportPlan(createFamilyDefaultState('buddhabrot'), {
				width: 100,
				height: 100
			})
		).toThrow(/family-specific progressive or vector exporter/);
		expect(PNG_EXPORT_MAX_PIXELS).toBeLessThanOrEqual(
			PNG_EXPORT_MAX_DIMENSION * PNG_EXPORT_MAX_DIMENSION
		);
	});

	it('reports the effective iteration ceiling and every binding reason', () => {
		const state = {
			...createFamilyDefaultState('mandelbrot'),
			maxIterations: 10_000
		};
		const plan = createFractalPngExportPlan(state, {
			width: 4_000,
			height: 2_000,
			maximumIterations: 1_000
		});

		expect(plan.iterations.requested).toBe(10_000);
		expect(plan.iterations.effective).toBe(50);
		expect(plan.iterations.capped).toBe(true);
		expect(plan.iterations.reasons).toEqual([
			'caller maximum of 1,000 iterations',
			'sampler maximum of 2,048 iterations',
			'400,000,000 pixel-iteration export work budget'
		]);
	});
});

describe('Fractal Atlas tiled PNG cancellation', () => {
	it('stops between completed tiles with an AbortError', async () => {
		const state = {
			...createFamilyDefaultState('mandelbrot'),
			maxIterations: 8
		};
		const plan = createFractalPngExportPlan(state, {
			width: 64,
			height: 32,
			tileSize: 32
		});
		const controller = new AbortController();
		const writtenTiles: number[] = [];

		await expect(
			renderFractalPngTiles(state, plan, {
				signal: controller.signal,
				writeTile(tile) {
					writtenTiles.push(tile.index);
				},
				onProgress(progress) {
					if (progress.completedTiles === 1) controller.abort();
				}
			})
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(writtenTiles).toEqual([0]);
	});
});
