import { describe, expect, it } from 'vitest';
import {
	createEmptyDocument,
	type ImageObject,
	type ShapeObject,
	type StrokeObject
} from './model';
import { CanvasRenderer } from './renderer';

const timestamp = '2026-07-23T12:00:00.000Z';

function image(locked = false): ImageObject {
	return {
		id: 'image-under-stroke',
		type: 'image',
		x: 40,
		y: 80,
		width: 24,
		height: 24,
		rotation: 0,
		opacity: 1,
		locked,
		hidden: false,
		zIndex: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
		src: 'data:image/webp;base64,UklGRg==',
		alt: 'Reference tile'
	};
}

function diagonalStroke(): StrokeObject {
	return {
		id: 'diagonal-stroke',
		type: 'stroke',
		tool: 'charcoal',
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		sourceWidth: 100,
		sourceHeight: 100,
		rotation: 0,
		opacity: 1,
		locked: false,
		hidden: false,
		zIndex: 2,
		createdAt: timestamp,
		updatedAt: timestamp,
		points: [
			{ x: 0, y: 0, pressure: 0.5, time: 0 },
			{ x: 100, y: 100, pressure: 0.5, time: 1 }
		],
		style: {
			color: '#2b241c',
			size: 6,
			opacity: 1,
			texture: 0,
			smoothing: 0.5,
			pressure: 1,
			pressureCurve: 1
		}
	};
}

function outlineShape(shape: 'rectangle' | 'ellipse'): ShapeObject {
	return {
		id: `outline-${shape}`,
		type: 'shape',
		shape,
		x: 0,
		y: 40,
		width: 120,
		height: 100,
		rotation: 0,
		opacity: 1,
		locked: false,
		hidden: false,
		zIndex: 2,
		createdAt: timestamp,
		updatedAt: timestamp,
		from: { x: 0, y: 0 },
		to: { x: 120, y: 100 },
		stroke: '#2b241c',
		strokeWidth: 2
	};
}

describe('CanvasRenderer hit testing', () => {
	it('does not treat empty space inside a diagonal stroke AABB as solid', () => {
		const note = createEmptyDocument('Hit test', 'note-hit-test');
		note.objects = [image(), diagonalStroke()];
		const hit = new CanvasRenderer().hitTest(note, { x: 50, y: 90 }, 2);
		expect(hit?.id).toBe('image-under-stroke');
	});

	it('returns locked objects so the editor can select and unlock them', () => {
		const note = createEmptyDocument('Locked hit test', 'note-locked-hit-test');
		note.objects = [image(true)];
		const hit = new CanvasRenderer().hitTest(note, { x: 52, y: 92 }, 2);
		expect(hit?.locked).toBe(true);
	});

	it.each(['rectangle', 'ellipse'] as const)(
		'does not treat the interior of an unfilled %s as opaque',
		(shape) => {
			const note = createEmptyDocument('Outline hit test', `note-outline-${shape}`);
			note.objects = [image(), outlineShape(shape)];
			const hit = new CanvasRenderer().hitTest(note, { x: 52, y: 92 }, 2);
			expect(hit?.id).toBe('image-under-stroke');
		}
	);

	it('does not over-select far inside the long axis of a thin ellipse', () => {
		const note = createEmptyDocument('Thin ellipse', 'note-thin-ellipse');
		const ellipse = outlineShape('ellipse');
		ellipse.width = 1_000;
		ellipse.height = 20;
		note.objects = [ellipse];
		const hit = new CanvasRenderer().hitTest(note, { x: 900, y: 50 }, 3);
		expect(hit).toBeNull();
	});
});
