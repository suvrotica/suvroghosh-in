import { describe, expect, it } from 'vitest';
import type { SketchArtwork } from '$lib/sketches/types';
import {
	activeRoomIdsFor,
	calculateArtworkFootprint,
	calculateFrameDimensions,
	calculatePlaqueLayout,
	createMuseumLayout,
	ensureWalkableViewPosition,
	isWalkable,
	isWalkableSegment
} from './museum-layout';

function artwork(slug: string, width: number, height: number, room: string | null = null) {
	return {
		slug,
		title: slug,
		description: '',
		alt: '',
		date: null,
		medium: null,
		orientation: width === height ? 'square' : width > height ? 'landscape' : 'portrait',
		room,
		featured: false,
		needsMetadata: false,
		canvasMode: 'ink',
		source: { src: `/sketch/${slug}.png`, width, height, bytes: 1 },
		variants: {
			thumbnail: { src: '', width, height, bytes: 1 },
			preview: { src: '', width, height, bytes: 1 },
			museum: { src: '', width, height, bytes: 1 },
			detail: { src: '', width, height, bytes: 1 }
		}
	} satisfies SketchArtwork;
}

describe('museum frame dimensions', () => {
	it.each([
		['portrait', 800, 1200],
		['landscape', 1400, 800],
		['square', 1000, 1000]
	])('creates a valid %s frame', (_name, width, height) => {
		const frame = calculateFrameDimensions(width / height);
		expect(frame.artWidth).toBeGreaterThan(0);
		expect(frame.artHeight).toBeGreaterThan(0);
		expect(frame.outerWidth).toBeGreaterThan(frame.artWidth);
		expect(frame.outerHeight).toBeGreaterThan(frame.artHeight);
		expect(frame.outerWidth).toBeLessThanOrEqual(3.1);
	});

	it.each([
		['portrait', 800, 1200],
		['landscape', 1400, 800],
		['square', 1000, 1000]
	])('keeps the %s plaque centred inside the frame width', (_name, width, height) => {
		const frame = calculateFrameDimensions(width / height);
		const plaque = calculatePlaqueLayout(frame);
		const footprint = calculateArtworkFootprint(frame);

		expect(plaque.centerX).toBe(0);
		expect(plaque.centerX - plaque.width / 2).toBeGreaterThanOrEqual(-frame.outerWidth / 2);
		expect(plaque.centerX + plaque.width / 2).toBeLessThanOrEqual(frame.outerWidth / 2);
		expect(plaque.centerY + plaque.height / 2).toBeLessThan(-frame.outerHeight / 2);
		expect(footprint.minX).toBeCloseTo(-frame.outerWidth / 2);
		expect(footprint.maxX).toBeCloseTo(frame.outerWidth / 2);
	});
});

describe('museum room layout', () => {
	const collection = Array.from({ length: 28 }, (_, index) =>
		artwork(`work-${String(index + 1).padStart(2, '0')}`, 800 + (index % 3) * 200, 1200)
	);
	const mixedAspectCollection = Array.from({ length: 28 }, (_, index) => {
		const [width, height] = [
			[800, 1200],
			[1400, 800],
			[1000, 1000]
		][index % 3];
		return artwork(`mixed-${String(index + 1).padStart(2, '0')}`, width, height);
	});

	it('is deterministic and creates connected rooms as the collection grows', () => {
		const first = createMuseumLayout(collection);
		const second = createMuseumLayout([...collection].reverse());
		expect(first).toEqual(second);
		expect(first.rooms).toHaveLength(3);
		expect(first.rooms[0].connections).toHaveLength(1);
		expect(first.rooms[1].connections).toHaveLength(2);
	});

	it('activates only the current room and its immediate neighbours', () => {
		const layout = createMuseumLayout(collection);
		expect([...activeRoomIdsFor(layout, 'gallery-2')]).toEqual([
			'gallery-2',
			'gallery-1',
			'gallery-3'
		]);
		expect([...activeRoomIdsFor(layout, 'gallery-1')]).toEqual(['gallery-1', 'gallery-2']);
	});

	it.each([
		['portrait-weighted', collection],
		['portrait, landscape, and square', mixedAspectCollection]
	])('keeps complete artwork footprints from overlapping for %s rooms', (_name, artworks) => {
		const layout = createMuseumLayout(artworks);
		for (const room of layout.rooms) {
			for (const wall of ['north', 'east', 'south', 'west'] as const) {
				const placements = layout.placements.filter(
					(placement) => placement.roomId === room.id && placement.wall === wall
				);
				for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
					for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
						const left = placements[leftIndex];
						const right = placements[rightIndex];
						const leftAxis =
							wall === 'north' || wall === 'south' ? left.position[0] : left.position[2];
						const rightAxis =
							wall === 'north' || wall === 'south' ? right.position[0] : right.position[2];
						const leftFootprint = calculateArtworkFootprint(left.frame);
						const rightFootprint = calculateArtworkFootprint(right.frame);
						const leftWidth = leftFootprint.maxX - leftFootprint.minX;
						const rightWidth = rightFootprint.maxX - rightFootprint.minX;
						const minimumGap = (leftWidth + rightWidth) / 2 + 0.2;
						expect(Math.abs(leftAxis - rightAxis)).toBeGreaterThanOrEqual(minimumGap);
					}
				}
			}
		}
	});

	it('honours manual room labels without changing the per-room cap', () => {
		const manuallyAssigned = Array.from({ length: 12 }, (_, index) =>
			artwork(`manual-${index}`, 900, 1200, 'Quiet Room')
		);
		const layout = createMuseumLayout(manuallyAssigned);
		expect(layout.rooms).toHaveLength(2);
		expect(layout.rooms.every((room) => room.name === 'Quiet Room')).toBe(true);
		expect(layout.rooms.every((room) => room.artworkSlugs.length <= 10)).toBe(true);
	});

	it('keeps guided movement inside rooms and clear of the central bench', () => {
		const layout = createMuseumLayout(collection);
		const opening = layout.rooms[0];
		const second = layout.rooms[1];
		const third = layout.rooms[2];
		const doorway = [
			(opening.center[0] + second.center[0]) / 2,
			(opening.center[1] + second.center[1]) / 2
		] as const;

		expect(isWalkable(layout, opening.center[0], opening.center[1])).toBe(true);
		expect(isWalkable(layout, opening.center[0], opening.center[1] + opening.depth * 0.1)).toBe(
			false
		);
		expect(isWalkable(layout, second.center[0], second.center[1] + second.depth * 0.1)).toBe(false);
		expect(isWalkable(layout, doorway[0], doorway[1])).toBe(true);
		expect(
			isWalkableSegment(
				layout,
				[opening.center[0] + 4, opening.center[1] - 2],
				[opening.center[0] + 4, opening.center[1] + 2]
			)
		).toBe(true);
		expect(
			isWalkableSegment(
				layout,
				[opening.center[0], opening.center[1]],
				[opening.center[0], opening.center[1] + 2.4]
			)
		).toBe(false);
		expect(isWalkableSegment(layout, opening.center, third.center)).toBe(false);
	});

	it('repairs an unsafe focus endpoint and keeps generated view positions walkable', () => {
		const layout = createMuseumLayout(collection);
		const room = layout.rooms[0];
		const unsafe = [room.center[0], 1.68, room.center[1] + room.depth * 0.1] as const;
		const safe = ensureWalkableViewPosition(layout, room.id, unsafe);

		expect(isWalkable(layout, safe[0], safe[2])).toBe(true);
		for (const placement of layout.placements) {
			const endpoint = ensureWalkableViewPosition(layout, placement.roomId, placement.viewPosition);
			expect(isWalkable(layout, endpoint[0], endpoint[2])).toBe(true);
		}
	});
});
