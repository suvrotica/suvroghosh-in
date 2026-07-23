import { describe, expect, it } from 'vitest';
import { SpatialIndex } from './spatial-index';
import type { TextObject } from './model';

const timestamp = '2026-07-23T12:00:00.000Z';

function object(id: string, x: number, y: number, hidden = false): TextObject {
	return {
		id,
		type: 'text',
		x,
		y,
		width: 40,
		height: 20,
		rotation: 0,
		opacity: 1,
		locked: false,
		hidden,
		zIndex: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
		text: id,
		color: '#222222',
		fontSize: 16,
		fontFamily: 'sans',
		align: 'left'
	};
}

describe('SpatialIndex', () => {
	it('culls objects across positive and negative grid cells', () => {
		const index = new SpatialIndex(100);
		index.rebuild([
			object('left', -125, -10),
			object('centre', 15, 15),
			object('far', 2_000, 2_000),
			object('hidden', 20, 20, true)
		]);
		expect(
			index
				.search({ minX: -150, minY: -50, maxX: 100, maxY: 100 })
				.map((item) => item.id)
				.sort()
		).toEqual(['centre', 'left']);
	});

	it('updates memberships without leaving stale hits', () => {
		const index = new SpatialIndex(100);
		index.insert(object('moving', 0, 0));
		index.insert(object('moving', 1_000, 1_000));
		expect(index.search({ minX: -10, minY: -10, maxX: 100, maxY: 100 })).toHaveLength(0);
		expect(index.search({ minX: 990, minY: 990, maxX: 1_100, maxY: 1_100 })).toHaveLength(1);
		index.remove('moving');
		expect(index.search({ minX: 990, minY: 990, maxX: 1_100, maxY: 1_100 })).toHaveLength(0);
	});
});
