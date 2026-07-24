import type { SketchArtwork } from '$lib/sketches/types';
import type {
	ArtworkPlacement,
	FrameDimensions,
	MuseumLayout,
	MuseumRoomLayout,
	MuseumWall
} from './museum-types';

export const ROOM_WIDTH = 15;
export const ROOM_DEPTH = 10.5;
export const ROOM_HEIGHT = 6.4;
export const EYE_HEIGHT = 1.68;
export const ART_EYE_LINE = 2.55;
export const DOOR_WIDTH = 2.6;
export const WORKS_PER_ROOM = 10;
export const PLAQUE_HEIGHT = 0.38;
export const PLAQUE_GAP = 0.18;

const BENCH_WIDTH = 2.7;
const BENCH_DEPTH = 0.78;
const BENCH_Z_RATIO = 0.1;
const GUIDED_PATH_SAMPLE_SPACING = 0.12;
const WALL_ORDER: readonly MuseumWall[] = ['north', 'east', 'south', 'west'];
const ROOM_NAMES = [
	'Opening Gallery',
	'North Gallery',
	'East Gallery',
	'Long Gallery',
	'Garden Gallery',
	'West Gallery'
] as const;

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(maximum, Math.max(minimum, value));

export function calculateFrameDimensions(aspectRatio: number): FrameDimensions {
	const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
	const maximumArtWidth = 2.55;
	const maximumArtHeight = 2.5;

	let artWidth: number;
	let artHeight: number;
	if (safeAspect >= 1) {
		artWidth = maximumArtWidth;
		artHeight = artWidth / safeAspect;
		if (artHeight < 1.2) {
			artHeight = 1.2;
			artWidth = Math.min(maximumArtWidth, artHeight * safeAspect);
		}
	} else {
		artHeight = maximumArtHeight;
		artWidth = artHeight * safeAspect;
		if (artWidth < 1.15) {
			artWidth = 1.15;
			artHeight = Math.min(maximumArtHeight, artWidth / safeAspect);
		}
	}

	const railWidth = clamp(Math.min(artWidth, artHeight) * 0.115, 0.16, 0.25);
	return {
		artWidth,
		artHeight,
		outerWidth: artWidth + railWidth * 2,
		outerHeight: artHeight + railWidth * 2,
		railWidth
	};
}

export function calculatePlaqueLayout(frame: FrameDimensions) {
	const width = Math.min(1.25, Math.max(0.76, frame.outerWidth * 0.46));
	return {
		width,
		height: PLAQUE_HEIGHT,
		centerX: 0,
		centerY: -frame.outerHeight / 2 - PLAQUE_GAP - PLAQUE_HEIGHT / 2
	};
}

export function calculateArtworkFootprint(frame: FrameDimensions) {
	const plaque = calculatePlaqueLayout(frame);
	return {
		minX: Math.min(-frame.outerWidth / 2, plaque.centerX - plaque.width / 2),
		maxX: Math.max(frame.outerWidth / 2, plaque.centerX + plaque.width / 2),
		minY: Math.min(-frame.outerHeight / 2, plaque.centerY - plaque.height / 2),
		maxY: Math.max(frame.outerHeight / 2, plaque.centerY + plaque.height / 2)
	};
}

function roomCoordinate(index: number): readonly [number, number] {
	let column = 0;
	let row = 0;
	for (let step = 1; step <= index; step += 1) {
		if (step % 2 === 1) row += 1;
		else column += step % 4 === 2 ? 1 : -1;
	}
	return [column * ROOM_WIDTH, -row * ROOM_DEPTH];
}

function wallBetween(from: readonly [number, number], to: readonly [number, number]): MuseumWall {
	if (to[0] > from[0]) return 'east';
	if (to[0] < from[0]) return 'west';
	if (to[1] > from[1]) return 'south';
	return 'north';
}

function groupArtworks(artworks: readonly SketchArtwork[]): SketchArtwork[][] {
	const ordered = [...artworks].sort(
		(left, right) =>
			Number(right.featured) - Number(left.featured) || left.slug.localeCompare(right.slug, 'en')
	);
	const manualGroups = new Map<string, SketchArtwork[]>();
	const automatic: SketchArtwork[] = [];

	for (const artwork of ordered) {
		const manualRoom = artwork.room?.trim();
		if (!manualRoom) {
			automatic.push(artwork);
			continue;
		}
		const group = manualGroups.get(manualRoom) ?? [];
		group.push(artwork);
		manualGroups.set(manualRoom, group);
	}

	const groups: SketchArtwork[][] = [];
	for (const roomName of [...manualGroups.keys()].sort((a, b) => a.localeCompare(b, 'en'))) {
		const roomArtworks = manualGroups.get(roomName) ?? [];
		for (let index = 0; index < roomArtworks.length; index += WORKS_PER_ROOM) {
			groups.push(roomArtworks.slice(index, index + WORKS_PER_ROOM));
		}
	}
	for (let index = 0; index < automatic.length; index += WORKS_PER_ROOM) {
		groups.push(automatic.slice(index, index + WORKS_PER_ROOM));
	}

	return groups.length > 0 ? groups : [[]];
}

function buildRooms(groups: readonly SketchArtwork[][]): MuseumRoomLayout[] {
	const rooms: MuseumRoomLayout[] = groups.map((group, index) => {
		const manualName = group[0]?.room?.trim();
		return {
			id: `gallery-${index + 1}`,
			name:
				manualName ||
				ROOM_NAMES[index] ||
				`Gallery ${new Intl.NumberFormat('en', { minimumIntegerDigits: 2 }).format(index + 1)}`,
			index,
			center: roomCoordinate(index),
			width: ROOM_WIDTH,
			depth: ROOM_DEPTH,
			height: ROOM_HEIGHT,
			connections: [],
			artworkSlugs: group.map((artwork) => artwork.slug)
		};
	});

	for (let index = 1; index < rooms.length; index += 1) {
		const previous = rooms[index - 1];
		const current = rooms[index];
		const previousWall = wallBetween(previous.center, current.center);
		const currentWall = wallBetween(current.center, previous.center);
		previous.connections.push({ wall: previousWall, toRoomId: current.id });
		current.connections.push({ wall: currentWall, toRoomId: previous.id });
	}

	return rooms;
}

interface WallSlot {
	wall: MuseumWall;
	offset: number;
}

function roomSlots(room: MuseumRoomLayout): WallSlot[] {
	const connectedWalls = new Set(room.connections.map((connection) => connection.wall));
	const slots: WallSlot[] = [];

	for (const wall of WALL_ORDER) {
		const isLongWall = wall === 'north' || wall === 'south';
		const offsets = connectedWalls.has(wall)
			? isLongWall
				? [-4.45, 4.45]
				: [-3.25, 3.25]
			: isLongWall
				? [-5.25, -1.75, 1.75, 5.25]
				: [-3.3, 0, 3.3];
		for (const offset of offsets) slots.push({ wall, offset });
	}

	return slots.sort((left, right) => {
		const leftConnected = connectedWalls.has(left.wall) ? 1 : 0;
		const rightConnected = connectedWalls.has(right.wall) ? 1 : 0;
		return (
			leftConnected - rightConnected ||
			WALL_ORDER.indexOf(left.wall) - WALL_ORDER.indexOf(right.wall)
		);
	});
}

function placeOnWall(
	room: MuseumRoomLayout,
	wall: MuseumWall,
	offset: number,
	frame: FrameDimensions
): Pick<ArtworkPlacement, 'position' | 'rotationY' | 'viewPosition'> {
	const [centerX, centerZ] = room.center;
	const wallInset = 0.16;
	const viewingDistance = 2.45;
	const centerY = clamp(
		ART_EYE_LINE,
		frame.outerHeight / 2 + 0.45,
		ROOM_HEIGHT - frame.outerHeight / 2 - 0.8
	);

	switch (wall) {
		case 'north': {
			const z = centerZ - room.depth / 2 + wallInset;
			return {
				position: [centerX + offset, centerY, z],
				rotationY: 0,
				viewPosition: [centerX + offset, EYE_HEIGHT, z + viewingDistance]
			};
		}
		case 'south': {
			const z = centerZ + room.depth / 2 - wallInset;
			return {
				position: [centerX - offset, centerY, z],
				rotationY: Math.PI,
				viewPosition: [centerX - offset, EYE_HEIGHT, z - viewingDistance]
			};
		}
		case 'east': {
			const x = centerX + room.width / 2 - wallInset;
			return {
				position: [x, centerY, centerZ + offset],
				rotationY: -Math.PI / 2,
				viewPosition: [x - viewingDistance, EYE_HEIGHT, centerZ + offset]
			};
		}
		case 'west': {
			const x = centerX - room.width / 2 + wallInset;
			return {
				position: [x, centerY, centerZ - offset],
				rotationY: Math.PI / 2,
				viewPosition: [x + viewingDistance, EYE_HEIGHT, centerZ - offset]
			};
		}
	}
}

export function createMuseumLayout(artworks: readonly SketchArtwork[]): MuseumLayout {
	const groups = groupArtworks(artworks);
	const rooms = buildRooms(groups);
	const artworkBySlug = new Map(artworks.map((artwork) => [artwork.slug, artwork]));
	const placements: ArtworkPlacement[] = [];

	for (const room of rooms) {
		const slots = roomSlots(room);
		for (const [index, slug] of room.artworkSlugs.entries()) {
			const artwork = artworkBySlug.get(slug);
			if (!artwork) continue;
			const slot = slots[index];
			if (!slot) {
				throw new Error(`Room ${room.id} has more artworks than its safe wall layout supports.`);
			}
			const frame = calculateFrameDimensions(artwork.source.width / artwork.source.height);
			placements.push({
				artwork,
				roomId: room.id,
				wall: slot.wall,
				frame,
				...placeOnWall(room, slot.wall, slot.offset, frame)
			});
		}
	}

	const [startX, startZ] = rooms[0].center;
	return {
		rooms,
		placements,
		startPosition: [startX, EYE_HEIGHT, startZ + ROOM_DEPTH * 0.28]
	};
}

export function activeRoomIdsFor(layout: MuseumLayout, roomId: string) {
	const room = layout.rooms.find((candidate) => candidate.id === roomId) ?? layout.rooms[0];
	return room
		? new Set([room.id, ...room.connections.map((connection) => connection.toRoomId)])
		: new Set<string>();
}

export function isWalkable(layout: MuseumLayout, x: number, z: number, margin = 0.48) {
	for (const room of layout.rooms) {
		const [centerX, centerZ] = room.center;
		if (
			Math.abs(x - centerX) <= room.width / 2 - margin &&
			Math.abs(z - centerZ) <= room.depth / 2 - margin
		) {
			const benchCenterZ = centerZ + room.depth * BENCH_Z_RATIO;
			const insideBench =
				Math.abs(x - centerX) <= BENCH_WIDTH / 2 + margin &&
				Math.abs(z - benchCenterZ) <= BENCH_DEPTH / 2 + margin;
			if (!insideBench) return true;
		}
	}

	for (let index = 1; index < layout.rooms.length; index += 1) {
		const previous = layout.rooms[index - 1];
		const current = layout.rooms[index];
		const midpointX = (previous.center[0] + current.center[0]) / 2;
		const midpointZ = (previous.center[1] + current.center[1]) / 2;
		const horizontal = previous.center[1] === current.center[1];
		const passageHalfLength = margin + 0.05;
		const doorHalfWidth = Math.max(0.1, DOOR_WIDTH / 2 - margin);
		const halfWidth = horizontal ? passageHalfLength : doorHalfWidth;
		const halfDepth = horizontal ? doorHalfWidth : passageHalfLength;
		if (Math.abs(x - midpointX) <= halfWidth && Math.abs(z - midpointZ) <= halfDepth) {
			return true;
		}
	}

	return false;
}

export function isWalkableSegment(
	layout: MuseumLayout,
	from: readonly [x: number, z: number],
	to: readonly [x: number, z: number],
	margin = 0.48
) {
	const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
	const samples = Math.max(1, Math.ceil(distance / GUIDED_PATH_SAMPLE_SPACING));
	for (let index = 0; index <= samples; index += 1) {
		const progress = index / samples;
		const x = from[0] + (to[0] - from[0]) * progress;
		const z = from[1] + (to[1] - from[1]) * progress;
		if (!isWalkable(layout, x, z, margin)) return false;
	}
	return true;
}

export function ensureWalkableViewPosition(
	layout: MuseumLayout,
	roomId: string,
	position: readonly [x: number, y: number, z: number],
	margin = 0.48
): readonly [x: number, y: number, z: number] {
	const room = layout.rooms.find((candidate) => candidate.id === roomId) ?? layout.rooms[0];
	if (!room) return position;

	const [centerX, centerZ] = room.center;
	const minX = centerX - room.width / 2 + margin;
	const maxX = centerX + room.width / 2 - margin;
	const minZ = centerZ - room.depth / 2 + margin;
	const maxZ = centerZ + room.depth / 2 - margin;
	const x = clamp(position[0], minX, maxX);
	const z = clamp(position[2], minZ, maxZ);
	if (isWalkable(layout, x, z, margin)) return [x, EYE_HEIGHT, z];

	const benchCenterZ = centerZ + room.depth * BENCH_Z_RATIO;
	const clearance = 0.08;
	const candidates: Array<readonly [number, number]> = [
		[x, benchCenterZ - BENCH_DEPTH / 2 - margin - clearance],
		[x, benchCenterZ + BENCH_DEPTH / 2 + margin + clearance],
		[centerX - BENCH_WIDTH / 2 - margin - clearance, z],
		[centerX + BENCH_WIDTH / 2 + margin + clearance, z],
		[centerX, centerZ]
	];
	const walkable = candidates
		.map(
			([candidateX, candidateZ]) =>
				[clamp(candidateX, minX, maxX), clamp(candidateZ, minZ, maxZ)] as const
		)
		.filter(([candidateX, candidateZ]) => isWalkable(layout, candidateX, candidateZ, margin))
		.sort(
			(left, right) =>
				Math.hypot(left[0] - position[0], left[1] - position[2]) -
				Math.hypot(right[0] - position[0], right[1] - position[2])
		);
	const [safeX, safeZ] = walkable[0] ?? [centerX, centerZ];
	return [safeX, EYE_HEIGHT, safeZ];
}
