import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WindField } from './WindField';

describe('WindField', () => {
	it('is deterministic and independent of sample order', () => {
		const first = new WindField('hooghly-evening');
		const second = new WindField('hooghly-evening');
		const positions = [
			new Vector3(-91.25, 17, 208.5),
			new Vector3(12, 84, -33),
			new Vector3(310, 205, 99)
		];
		const expected = positions.map((position, index) =>
			first.sample(position, 12.25 + index * 0.7).toArray()
		);

		second.sample(new Vector3(9_000, 400, -7_000), 90);
		const actual = positions.map((position, index) =>
			second.sample(position, 12.25 + index * 0.7).toArray()
		);
		expect(actual).toEqual(expected);
	});

	it('remains spatially and temporally continuous across cache boundaries', () => {
		const wind = new WindField('college-street-pages', { gridCellSize: 32 });
		const beforeCell = wind.sample(new Vector3(31.999, 73, -64.001), 7.5);
		const afterCell = wind.sample(new Vector3(32.001, 73, -63.999), 7.5);
		const beforeFrame = wind.sample(new Vector3(18, 73, -42), 8 - 1e-5);
		const afterFrame = wind.sample(new Vector3(18, 73, -42), 8 + 1e-5);

		expect(beforeCell.distanceTo(afterCell)).toBeLessThan(0.002);
		expect(beforeFrame.distanceTo(afterFrame)).toBeLessThan(0.001);
	});

	it('adds a useful thermal core surrounded by mild sinking air', () => {
		const wind = new WindField('maidan-afternoon', { prevailingDirection: 0 });
		wind.addThermal({
			id: 'sunlit-maidan',
			center: new Vector3(40, 10, -20),
			radius: 24,
			height: 150,
			strength: 3.8
		});
		const base = new WindField('maidan-afternoon', { prevailingDirection: 0 });
		const centre = wind.sample(new Vector3(40, 45, -20), 4);
		const centreBase = base.sample(new Vector3(40, 45, -20), 4);
		const ring = wind.sample(new Vector3(40 + 24 * 1.18, 45, -20), 4);
		const ringBase = base.sample(new Vector3(40 + 24 * 1.18, 45, -20), 4);

		expect(centre.y - centreBase.y).toBeGreaterThan(2.5);
		expect(ring.y - ringBase.y).toBeLessThan(-0.25);
		expect(ring.y - ringBase.y).toBeGreaterThan(-1.2);
	});

	it('folds extreme altitude back with progressive sink rather than a ceiling', () => {
		const wind = new WindField('high-haze');
		const atCeiling = wind.sample(new Vector3(0, 420, 0), 3);
		const wellAbove = wind.sample(new Vector3(0, 600, 0), 3);

		expect(wellAbove.y).toBeLessThan(atCeiling.y - 2);
		expect(Math.hypot(wellAbove.x, wellAbove.z)).toBeGreaterThan(
			Math.hypot(atCeiling.x, atCeiling.z)
		);
	});
});
