import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { SketchArtwork } from '$lib/sketches/types';
import {
	DOOR_HEIGHT,
	DOOR_WIDTH,
	WAYFINDING_SIGN_CENTER_Y,
	WAYFINDING_SIGN_HEIGHT,
	WAYFINDING_SIGN_WALL_INSET,
	WAYFINDING_SIGN_WIDTH,
	activeRoomIdsFor,
	calculateArtworkFootprint,
	calculateFrameDimensions,
	calculatePlaqueLayout,
	createMuseumLayout,
	ensureWalkableViewPosition,
	focusedArtworkView,
	isWalkable,
	isWalkableSegment,
	roomOverviewLayout,
	roomWayfindingFor
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
	it.each([0.1, 0.25, 1, 4, 10])('preserves the artwork aspect ratio %s exactly', (aspect) => {
		const frame = calculateFrameDimensions(aspect);
		expect(frame.artWidth / frame.artHeight).toBeCloseTo(aspect, 10);
	});
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

	it.each([0.45, 0.8, 1.5, 2.4])(
		'fits all room works without overlapping frames or plaques at aspect %s',
		(aspect) => {
			const placements = createMuseumLayout(mixedAspectCollection).placements.slice(0, 10);
			const overview = roomOverviewLayout(placements, aspect);
			expect(overview.positions).toHaveLength(10);
			const boxes = overview.positions.map((item, index) => {
				const footprint = calculateArtworkFootprint(placements[index].frame);
				return {
					left: item.position[0] + footprint.minX,
					right: item.position[0] + footprint.maxX,
					bottom: item.position[1] + footprint.minY,
					top: item.position[1] + footprint.maxY
				};
			});
			for (const [index, box] of boxes.entries()) {
				expect(box.left).toBeGreaterThan(-overview.width / 2);
				expect(box.right).toBeLessThan(overview.width / 2);
				expect(box.bottom).toBeGreaterThan(-overview.height / 2);
				expect(box.top).toBeLessThan(overview.height / 2);
				for (const other of boxes.slice(index + 1)) {
					expect(
						box.right < other.left ||
							box.left > other.right ||
							box.top < other.bottom ||
							box.bottom > other.top
					).toBe(true);
				}
			}
		}
	);

	it.each([0.35, 0.6, 1, 1.8, 3])(
		'fits focused artwork and plaque in a viewport of aspect %s',
		(aspect) => {
			const layout = createMuseumLayout(mixedAspectCollection);
			for (const placement of layout.placements) {
				const fit = focusedArtworkView(layout, placement, aspect);
				const camera = new PerspectiveCamera(fit.fov, aspect, 0.08, 90);
				camera.position.set(...fit.position);
				camera.lookAt(...fit.target);
				camera.updateMatrixWorld();
				const bounds = calculateArtworkFootprint(placement.frame);
				for (const x of [bounds.minX, bounds.maxX]) {
					for (const y of [bounds.minY, bounds.maxY]) {
						const point = new Vector3(x, y, 0)
							.applyAxisAngle(new Vector3(0, 1, 0), placement.rotationY)
							.add(new Vector3(...placement.position))
							.project(camera);
						expect(Math.abs(point.x)).toBeLessThan(0.95);
						expect(Math.abs(point.y)).toBeLessThan(0.95);
					}
				}
			}
		}
	);

	it('keeps existing room membership when later imports have earlier alphabetic titles', () => {
		const ordered = collection.map((item, galleryOrder) => ({ ...item, galleryOrder }));
		const before = createMuseumLayout(ordered);
		const added = { ...artwork('a-new-drawing', 1200, 800), galleryOrder: ordered.length };
		const after = createMuseumLayout([added, ...ordered].reverse());
		for (const placement of before.placements) {
			expect(
				after.placements.find((item) => item.artwork.slug === placement.artwork.slug)?.roomId
			).toBe(placement.roomId);
		}
		expect(after.placements.at(-1)?.artwork.slug).toBe(added.slug);
	});

	it('scales the complete 81-work collection across nine connected rooms', () => {
		const expandedCollection = Array.from({ length: 81 }, (_, index) => {
			const [width, height] = [
				[800, 1200],
				[1400, 800],
				[1000, 1000]
			][index % 3];
			return artwork(`expanded-${String(index + 1).padStart(2, '0')}`, width, height);
		});
		const layout = createMuseumLayout(expandedCollection);

		expect(layout.rooms).toHaveLength(9);
		expect(layout.placements).toHaveLength(81);
		expect(layout.rooms.every((room) => room.artworkSlugs.length <= 10)).toBe(true);
		expect(layout.rooms.at(-1)?.name).toBe('Gallery 09');
		expect(layout.rooms[0].connections).toHaveLength(1);
		expect(layout.rooms.at(-1)?.connections).toHaveLength(1);
		expect(layout.rooms.slice(1, -1).every((room) => room.connections.length === 2)).toBe(true);
	});

	it.each([1000, 5000])(
		'places %s works exactly once while keeping active-room bounds',
		(count) => {
			const expanded = Array.from({ length: count }, (_, galleryOrder) => ({
				...artwork(`scale-${String(galleryOrder).padStart(5, '0')}`, 900, 1200),
				galleryOrder
			}));
			const layout = createMuseumLayout(expanded);
			expect(layout.rooms).toHaveLength(count / 10);
			expect(layout.placements).toHaveLength(count);
			expect(new Set(layout.placements.map((placement) => placement.artwork.slug)).size).toBe(
				count
			);
			expect(new Set(layout.rooms.map((room) => room.center.join(','))).size).toBe(
				layout.rooms.length
			);
			expect(layout.rooms.every((room) => room.artworkSlugs.length === 10)).toBe(true);
			for (const index of [0, Math.floor(layout.rooms.length / 2), layout.rooms.length - 1]) {
				const active = activeRoomIdsFor(layout, layout.rooms[index].id);
				expect(active.size).toBeLessThanOrEqual(3);
				const activeWorks = layout.rooms
					.filter((room) => active.has(room.id))
					.flatMap((room) => room.artworkSlugs);
				expect(activeWorks.length).toBeLessThanOrEqual(30);
			}
		}
	);

	it('activates only the current room and its immediate neighbours', () => {
		const layout = createMuseumLayout(collection);
		expect([...activeRoomIdsFor(layout, 'gallery-2')]).toEqual([
			'gallery-2',
			'gallery-1',
			'gallery-3'
		]);
		expect([...activeRoomIdsFor(layout, 'gallery-1')]).toEqual(['gallery-1', 'gallery-2']);
	});

	it('creates deterministic first, middle, and last room wayfinding', () => {
		const layout = createMuseumLayout(collection);
		const [first, middle, last] = layout.rooms;

		expect(roomWayfindingFor(layout, first.id)).toMatchObject([
			{
				id: 'gallery-1-next-gallery-2',
				roomId: first.id,
				targetRoomId: middle.id,
				targetRoomName: 'North Gallery',
				wall: 'north',
				direction: 'next',
				rotationY: 0
			}
		]);
		expect(roomWayfindingFor(layout, middle.id)).toMatchObject([
			{
				id: 'gallery-2-previous-gallery-1',
				roomId: middle.id,
				targetRoomId: first.id,
				targetRoomName: 'Opening Gallery',
				wall: 'south',
				direction: 'previous',
				rotationY: Math.PI
			},
			{
				id: 'gallery-2-next-gallery-3',
				roomId: middle.id,
				targetRoomId: last.id,
				targetRoomName: 'East Gallery',
				wall: 'east',
				direction: 'next',
				rotationY: -Math.PI / 2
			}
		]);
		expect(roomWayfindingFor(layout, last.id)).toMatchObject([
			{
				id: 'gallery-3-previous-gallery-2',
				roomId: last.id,
				targetRoomId: middle.id,
				targetRoomName: 'North Gallery',
				wall: 'west',
				direction: 'previous',
				rotationY: Math.PI / 2
			}
		]);

		expect(roomWayfindingFor(layout, 'missing-room')).toEqual([]);
		expect(roomWayfindingFor(createMuseumLayout([...collection].reverse()), middle.id)).toEqual(
			roomWayfindingFor(layout, middle.id)
		);
	});

	it('keeps wayfinding signs centred over doorway headers and inside their room walls', () => {
		const layout = createMuseumLayout(collection);

		expect(WAYFINDING_SIGN_WIDTH).toBeLessThanOrEqual(DOOR_WIDTH);
		expect(WAYFINDING_SIGN_CENTER_Y - WAYFINDING_SIGN_HEIGHT / 2).toBeGreaterThan(DOOR_HEIGHT);

		for (const room of layout.rooms) {
			for (const sign of roomWayfindingFor(layout, room.id)) {
				expect(sign.localPosition[1]).toBe(WAYFINDING_SIGN_CENTER_Y);
				switch (sign.wall) {
					case 'north':
						expect(sign.localPosition).toEqual([
							0,
							WAYFINDING_SIGN_CENTER_Y,
							-room.depth / 2 + WAYFINDING_SIGN_WALL_INSET
						]);
						expect(sign.rotationY).toBe(0);
						break;
					case 'south':
						expect(sign.localPosition).toEqual([
							0,
							WAYFINDING_SIGN_CENTER_Y,
							room.depth / 2 - WAYFINDING_SIGN_WALL_INSET
						]);
						expect(sign.rotationY).toBe(Math.PI);
						break;
					case 'east':
						expect(sign.localPosition).toEqual([
							room.width / 2 - WAYFINDING_SIGN_WALL_INSET,
							WAYFINDING_SIGN_CENTER_Y,
							0
						]);
						expect(sign.rotationY).toBe(-Math.PI / 2);
						break;
					case 'west':
						expect(sign.localPosition).toEqual([
							-room.width / 2 + WAYFINDING_SIGN_WALL_INSET,
							WAYFINDING_SIGN_CENTER_Y,
							0
						]);
						expect(sign.rotationY).toBe(Math.PI / 2);
						break;
				}
			}
		}
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

	it('backs guided views far enough away to include the complete frame and title plaque', () => {
		const layout = createMuseumLayout(mixedAspectCollection);

		for (const placement of layout.placements) {
			const distance = Math.hypot(
				placement.viewPosition[0] - placement.position[0],
				placement.viewPosition[2] - placement.position[2]
			);
			const footprint = calculateArtworkFootprint(placement.frame);
			const completeHangingHeight = footprint.maxY - footprint.minY;
			expect(distance).toBeGreaterThanOrEqual(completeHangingHeight * 1.1);
		}
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
