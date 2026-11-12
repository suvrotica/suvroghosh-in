import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, generateScene, SCENE_FAMILIES, type Point, type SceneFamily } from './scene';

function contains(points: readonly Point[], x: number, y: number) {
	let inside = false;
	for (let i = 0, previous = points.length - 1; i < points.length; previous = i, i += 1) {
		const [ax, ay] = points[previous];
		const [bx, by] = points[i];
		if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay)) inside = !inside;
	}
	return inside;
}

describe('Bengali painting composition', () => {
	const families = Object.keys(SCENE_FAMILIES) as SceneFamily[];

	it.each(families)(
		'%s repeats its shapes and changes its placements with a new seed',
		(family) => {
			const original = generateScene(family, DEFAULT_SEED);
			const repeated = generateScene(family, DEFAULT_SEED);
			const different = generateScene(family, 'other-day-25');
			expect(repeated).toEqual(original);
			expect(different.figures.map(({ x, y }) => [x, y])).not.toEqual(
				original.figures.map(({ x, y }) => [x, y])
			);
			expect(new Set(original.shapes.map(({ id }) => id)).size).toBe(original.shapes.length);
			expect(original.focal.x).toBeGreaterThan(500);
			expect(original.focal.x).toBeLessThan(700);
		}
	);

	it.each(families)('%s attaches figure anchors to modeled surfaces', (family) => {
		for (const seed of [
			DEFAULT_SEED,
			'ghat-8',
			'veranda-12',
			'pond-46',
			'other-day-25',
			'street-11'
		]) {
			const scene = generateScene(family, seed);
			for (const figure of scene.figures) {
				const contactY = figure.y - figure.height * (figure.pose === 'sit' ? 0.39 : 0.009);
				const support = scene.shapes.findIndex(
					(shape) => shape.objectId === figure.surface && contains(shape.points, figure.x, contactY)
				);
				expect(support, `${seed} ${figure.id} on ${figure.surface}`).toBeGreaterThanOrEqual(0);
				const figureLayer = scene.shapes.findIndex((shape) => shape.objectId === figure.id);
				expect(figureLayer).toBeGreaterThan(support);
			}
		}
	});

	it('opens on a shopping bag, produce stall, and ordinary clear daylight', () => {
		const opening = generateScene('street', DEFAULT_SEED);
		expect(opening.light.weather).toBe('clear daylight');
		expect(opening.figures.map(({ activity }) => activity)).toContain(
			'walking with a shopping bag'
		);
		expect(opening.figures.map(({ activity }) => activity)).toContain('arranging vegetables');
		expect(opening.description).toContain('under an awning');
	});
});
