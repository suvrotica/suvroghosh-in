import { describe, expect, it } from 'vitest';
import {
	boundsFromPoints,
	documentBounds,
	objectBounds,
	screenToWorld,
	simplifyStroke,
	snap,
	worldToScreen,
	zoomAround
} from './geometry';
import { createEmptyDocument, type TextObject } from './model';

const timestamp = '2026-07-23T12:00:00.000Z';

function textObject(values: Partial<TextObject> = {}): TextObject {
	return {
		id: 'text-1',
		type: 'text',
		x: 10,
		y: 20,
		width: 100,
		height: 40,
		rotation: 0,
		opacity: 1,
		locked: false,
		hidden: false,
		zIndex: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
		text: 'A note',
		color: '#221f1a',
		fontSize: 18,
		fontFamily: 'serif',
		align: 'left',
		...values
	};
}

describe('canvas geometry', () => {
	it('round-trips between world and screen coordinates', () => {
		const viewport = { x: -320, y: 180, zoom: 2.5 };
		const world = { x: 46.25, y: -19.5 };
		expect(screenToWorld(worldToScreen(world, viewport), viewport)).toEqual(world);
	});

	it('keeps the world point under the cursor fixed while zooming', () => {
		const viewport = { x: 80, y: 40, zoom: 1 };
		const cursor = { x: 320, y: 240 };
		const worldBefore = screenToWorld(cursor, viewport);
		const next = zoomAround(viewport, cursor, 3);
		expect(screenToWorld(cursor, next)).toEqual(worldBefore);
		expect(next.zoom).toBe(3);
	});

	it('computes axis-aligned bounds for rotated objects', () => {
		const bounds = objectBounds(textObject({ width: 100, height: 40, rotation: 90 }));
		expect(bounds.minX).toBeCloseTo(40);
		expect(bounds.maxX).toBeCloseTo(80);
		expect(bounds.minY).toBeCloseTo(-10);
		expect(bounds.maxY).toBeCloseTo(90);
	});

	it('simplifies nearly straight strokes while preserving endpoints', () => {
		const points = Array.from({ length: 50 }, (_, index) => ({
			x: index,
			y: Math.sin(index) * 0.02,
			pressure: 0.5,
			time: index
		}));
		const simplified = simplifyStroke(points, 0.1);
		expect(simplified).toHaveLength(2);
		expect(simplified[0].x).toBe(0);
		expect(simplified.at(-1)?.x).toBe(49);
	});

	it('ignores hidden objects when fitting document bounds', () => {
		const note = createEmptyDocument('Bounds', 'note-bounds');
		note.objects = [textObject(), textObject({ id: 'hidden', x: 50_000, y: 50_000, hidden: true })];
		expect(documentBounds(note, 0)).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 60 });
		expect(boundsFromPoints([], 20)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
		expect(snap(47, 16)).toBe(48);
	});
});
