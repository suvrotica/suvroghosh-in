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
});
