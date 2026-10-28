import { describe, expect, it } from 'vitest';
import { PaperPlaneVisual } from './PaperPlane';

describe('folded paper-plane visual', () => {
	it('documents +Z as its nose and includes visible paper thickness', () => {
		const plane = new PaperPlaneVisual();
		expect(plane.object.userData.forwardAxis).toBe('+Z');
		expect(plane.mesh.geometry.userData.paperThicknessM).toBeGreaterThan(0);
		expect(plane.mesh.material.roughness).toBeGreaterThan(0.9);
		expect(plane.mesh.material.metalness).toBe(0);
		plane.dispose();
	});

	it('flexes outer wing vertices under gust load while retaining the centre fold', () => {
		const plane = new PaperPlaneVisual();
		const positions = plane.mesh.geometry.getAttribute('position');
		let outerIndex = 0;
		for (let index = 1; index < positions.count; index += 1) {
			if (Math.abs(positions.getX(index)) > Math.abs(positions.getX(outerIndex)))
				outerIndex = index;
		}
		const before = positions.getY(outerIndex);
		plane.update({ gustLoad: 1, creaseLevel: 0.2, elapsedSeconds: 1 });
		expect(positions.getY(outerIndex)).toBeLessThan(before);
		plane.dispose();
	});

	it('has outward top and bottom normals for the single-sided contour prepass', () => {
		const plane = new PaperPlaneVisual();
		const normals = plane.mesh.geometry.getAttribute('normal');
		// Every authored fold has a top triangle followed by its bottom triangle.
		for (let face = 0; face < 6; face += 1) {
			expect(normals.getY(face * 6)).toBeGreaterThan(0);
			expect(normals.getY(face * 6 + 3)).toBeLessThan(0);
		}
		expect(plane.mesh.material.transmission).toBe(0);
		plane.dispose();
	});

	it('keeps the perimeter ink attached when the wings flex', () => {
		const plane = new PaperPlaneVisual();
		const ink = plane.object.children[1] as import('three').LineSegments;
		const positions = ink.geometry.getAttribute('position');
		let outerIndex = 0;
		for (let index = 0; index < positions.count; index += 1) {
			if (Math.abs(positions.getX(index)) > Math.abs(positions.getX(outerIndex)))
				outerIndex = index;
		}
		const before = positions.getY(outerIndex);
		const spineBefore = positions.getY(0);
		plane.update({ gustLoad: 1 });
		expect(positions.getY(outerIndex)).toBeCloseTo(before - 0.025);
		expect(positions.getY(0)).toBe(spineBefore);
		plane.update({ gustLoad: 0 });
		expect(positions.getY(outerIndex)).toBeCloseTo(before);
		plane.dispose();
	});
});
