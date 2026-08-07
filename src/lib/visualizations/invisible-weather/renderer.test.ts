import { describe, expect, it, vi } from 'vitest';
import { frameAtPoint, renderArtwork, renderGallery } from './renderer';
import { createExhibitionRecipe, stateForPreset } from './recipes';
import type { Canvas2DContext } from './types';

function mockContext() {
	const calls: string[] = [];
	const method = (name: string) => vi.fn(() => calls.push(name));
	const context = {
		fillStyle: '',
		strokeStyle: '',
		globalAlpha: 1,
		lineWidth: 1,
		lineCap: 'butt',
		lineJoin: 'miter',
		shadowColor: '',
		shadowBlur: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 0,
		save: method('save'),
		restore: method('restore'),
		fillRect: method('fillRect'),
		strokeRect: method('strokeRect'),
		beginPath: method('beginPath'),
		closePath: method('closePath'),
		moveTo: method('moveTo'),
		lineTo: method('lineTo'),
		rect: method('rect'),
		roundRect: method('roundRect'),
		arc: method('arc'),
		ellipse: method('ellipse'),
		fill: method('fill'),
		stroke: method('stroke'),
		clip: method('clip'),
		translate: method('translate'),
		rotate: method('rotate'),
		createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
	} as unknown as Canvas2DContext;
	return { context, calls };
}

describe('Invisible Weather Canvas 2D renderer', () => {
	it('draws gallery and focus art through the same offscreen-safe context surface', () => {
		const recipe = createExhibitionRecipe({
			...stateForPreset('three-large-silences', 'renderer'),
			pathDensity: 0.2,
			pathLength: 8,
			grain: 0
		});
		const gallery = mockContext();
		renderGallery(gallery.context, recipe, {
			width: 900,
			height: 520,
			phase: 0,
			selectedArtwork: 1,
			pathBudget: 6,
			pathCache: new Map()
		});
		expect(gallery.calls.filter((call) => call === 'fillRect').length).toBeGreaterThan(6);
		expect(gallery.calls).toContain('stroke');
		expect(gallery.calls).toContain('clip');

		const focus = mockContext();
		renderArtwork(focus.context, recipe.artworks[0], {
			width: 1200,
			height: 900,
			phase: 0.4,
			pathBudget: 5
		});
		expect(focus.calls).toContain('clip');
		expect(focus.calls).toContain('stroke');
	});

	it('hit-tests normalized frame coordinates to stable artwork indices', () => {
		const recipe = createExhibitionRecipe(stateForPreset('monsoon-ledger', 'hit-test'));
		const frame = recipe.landscapeFrames[4];
		expect(
			frameAtPoint(recipe, frame.x + frame.width / 2, frame.y + frame.height / 2, 'landscape')
		).toBe(frame.artworkIndex);
		expect(frameAtPoint(recipe, 0, 0, 'landscape')).toBeNull();
	});

	it('adds the gentle wall spotlight only to dark-wall palette families', () => {
		const salon = createExhibitionRecipe(stateForPreset('salon-after-closing', 'spotlight'));
		const salonContext = mockContext();
		renderGallery(salonContext.context, salon, {
			width: 900,
			height: 520,
			phase: 0,
			pathBudget: 2
		});
		expect(salonContext.context.createRadialGradient).toHaveBeenCalledOnce();

		const quiet = createExhibitionRecipe(stateForPreset('nine-quiet-rooms', 'no-spotlight'));
		const quietContext = mockContext();
		renderGallery(quietContext.context, quiet, {
			width: 900,
			height: 520,
			phase: 0,
			pathBudget: 2
		});
		expect(quietContext.context.createRadialGradient).not.toHaveBeenCalled();
	});
});
