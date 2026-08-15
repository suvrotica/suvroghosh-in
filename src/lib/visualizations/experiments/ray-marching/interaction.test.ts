import { describe, expect, it } from 'vitest';
import {
	RAY_MARCHING_DRAG_THRESHOLD_PX,
	isRayMarchingDrag,
	normalizeRayMarchingPointer,
	shaderPointerInFramebuffer
} from './interaction';

const rect = { left: 100, top: 50, width: 400, height: 200 };

describe('ray-marching pointer normalisation', () => {
	it('maps the measured top-left DOM corner to bottom-origin shader coordinates', () => {
		expect(normalizeRayMarchingPointer(100, 50, rect)).toEqual({ x: 0, y: 1, domY: 0 });
		expect(normalizeRayMarchingPointer(500, 250, rect)).toEqual({ x: 1, y: 0, domY: 1 });
		expect(normalizeRayMarchingPointer(300, 150, rect)).toEqual({
			x: 0.5,
			y: 0.5,
			domY: 0.5
		});
	});

	it('clamps client coordinates outside the canvas rectangle', () => {
		expect(normalizeRayMarchingPointer(-10_000, 10_000, rect)).toEqual({
			x: 0,
			y: 0,
			domY: 1
		});
	});

	it('uses backing-buffer dimensions only after CSS-space normalisation', () => {
		const pointer = normalizeRayMarchingPointer(400, 100, rect);
		expect(pointer).toEqual({ x: 0.75, y: 0.75, domY: 0.25 });
		expect(shaderPointerInFramebuffer(pointer, 800, 400)).toEqual([600, 300]);
	});

	it('survives an unusable DOMRect without NaN coordinates', () => {
		const pointer = normalizeRayMarchingPointer(0.5, 0.5, {
			left: Number.NaN,
			top: Number.NaN,
			width: 0,
			height: Number.NaN
		});
		expect(pointer).toEqual({ x: 0.5, y: 0.5, domY: 0.5 });
	});

	it('distinguishes a short pulse click from a camera drag by Euclidean movement', () => {
		const start = { clientX: 40, clientY: 40 };
		expect(
			isRayMarchingDrag(start, {
				clientX: 40 + RAY_MARCHING_DRAG_THRESHOLD_PX,
				clientY: 40
			})
		).toBe(false);
		expect(isRayMarchingDrag(start, { clientX: 46, clientY: 46 })).toBe(true);
	});
});
