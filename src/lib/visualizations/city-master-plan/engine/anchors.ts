import { DEFAULT_CITY_CONFIG } from './constants';
import type {
	AnchorDefinition,
	AnchorFootprintCell,
	AnchorId,
	AnchorPlacement,
	CityConfig,
	Direction,
	Rotation
} from './types';

export const ANCHORS: readonly AnchorDefinition[] = [
	{
		id: 'sweet-shop',
		label: 'Sweet shop',
		shortLabel: 'Sweet shop',
		pass: 'occupation',
		rotations: [0, 1, 2, 3],
		footprint: [{ dx: 0, dy: 0, role: 'shop' }],
		requiredSubstrate: ['buildable'],
		forcedPrototypeId: 'sweet-shop',
		frontageRequired: true,
		description: 'A small shop with one public-facing counter.',
		possibilityEffect:
			'Pins a buildable parcel and asks the frontage side for a footpath, lane, road, or courtyard.'
	},
	{
		id: 'tea-stall',
		label: 'Tea stall',
		shortLabel: 'Tea stall',
		pass: 'occupation',
		rotations: [0, 1, 2, 3],
		footprint: [{ dx: 0, dy: 0, role: 'stall' }],
		requiredSubstrate: ['buildable', 'open', 'walkable'],
		forcedPrototypeId: 'tea-stall',
		frontageRequired: true,
		description: 'A compact tea stall that tolerates an unusually wide range of addresses.',
		possibilityEffect: 'Favours pedestrian lanes, houses, and other small services nearby.'
	},
	{
		id: 'old-house',
		label: 'Old house',
		shortLabel: 'Old house',
		pass: 'occupation',
		rotations: [0, 1, 2, 3],
		footprint: [{ dx: 0, dy: 0, role: 'house' }],
		requiredSubstrate: ['buildable'],
		forcedPrototypeId: 'old-house',
		frontageRequired: true,
		description: 'An old house with one entrance and no global influence over the road system.',
		possibilityEffect: 'Requires local frontage and mildly favours other occupied parcels.'
	},
	{
		id: 'temple',
		label: 'Temple',
		shortLabel: 'Temple',
		pass: 'occupation',
		rotations: [0, 1, 2, 3],
		footprint: [{ dx: 0, dy: 0, role: 'landmark' }],
		requiredSubstrate: ['buildable', 'open'],
		forcedPrototypeId: 'temple',
		frontageRequired: true,
		description: 'An ordinary civic landmark, never used as a collision gag.',
		possibilityEffect: 'Encourages an accessible open edge without demanding a ceremonial avenue.'
	},
	{
		id: 'pond',
		label: 'Pond',
		shortLabel: 'Pond',
		pass: 'fabric',
		rotations: [0, 1],
		footprint: [
			{ dx: 0, dy: 0, role: 'water' },
			{ dx: 1, dy: 0, role: 'water' },
			{ dx: 0, dy: 1, role: 'water' },
			{ dx: 1, dy: 1, role: 'water' },
			{ dx: 0, dy: 2, role: 'bank' },
			{ dx: 1, dy: 2, role: 'bank' }
		],
		requiredSubstrate: ['pond', 'pond-bank'],
		forcedPrototypeId: 'pond-interior',
		frontageRequired: false,
		description: 'A two-by-three water-and-bank footprint rather than a single blue square.',
		possibilityEffect: 'Excludes buildings and bends access and drainage around a fixed low area.'
	},
	{
		id: 'garage',
		label: 'Garage',
		shortLabel: 'Garage',
		pass: 'occupation',
		rotations: [0, 1, 2, 3],
		footprint: [{ dx: 0, dy: 0, role: 'garage' }],
		requiredSubstrate: ['buildable'],
		forcedPrototypeId: 'garage',
		frontageRequired: true,
		description: 'A shuttered garage that needs vehicle-accessible frontage.',
		possibilityEffect: 'Asks its frontage for a lane or road and competes with closed parcels.'
	},
	{
		id: 'tram-stop',
		label: 'Tram stop',
		shortLabel: 'Tram stop',
		pass: 'occupation',
		rotations: [0, 1, 2, 3],
		footprint: [{ dx: 0, dy: 0, role: 'stop' }],
		requiredSubstrate: ['tram'],
		forcedPrototypeId: 'tram-stop',
		frontageRequired: false,
		description: 'A stop on a tram-bearing road segment.',
		possibilityEffect:
			'Pins local rails and permits tram boundary portals, exposing the limits of local continuity.'
	},
	{
		id: 'banyan-tree',
		label: 'Banyan tree',
		shortLabel: 'Banyan',
		pass: 'occupation',
		rotations: [0],
		footprint: [{ dx: 0, dy: 0, role: 'tree' }],
		requiredSubstrate: ['buildable', 'open', 'pond-bank', 'tree-substrate'],
		forcedPrototypeId: 'tree',
		frontageRequired: false,
		description: 'A large fictional tree that preserves a pocket of open ground.',
		possibilityEffect:
			'Favours foot access and open space while discouraging dense occupation nearby.'
	},
	{
		id: 'flyover-pillar',
		label: 'Flyover pillar',
		shortLabel: 'Pillar',
		pass: 'occupation',
		rotations: [0],
		footprint: [{ dx: 0, dy: 0, role: 'pillar' }],
		requiredSubstrate: ['buildable', 'open', 'walkable'],
		forcedPrototypeId: 'flyover-pillar',
		frontageRequired: false,
		description: 'One immovable structural fact looking for a compatible neighbourhood.',
		possibilityEffect:
			'Reserves clearance locally and raises the chance of a building-around-pillar patch.'
	},
	{
		id: 'sand-pile',
		label: 'Permanent sand pile',
		shortLabel: 'Sand pile',
		pass: 'occupation',
		rotations: [0],
		footprint: [{ dx: 0, dy: 0, role: 'sand' }],
		requiredSubstrate: ['buildable', 'open', 'walkable'],
		forcedPrototypeId: 'permanent-sand-pile',
		frontageRequired: false,
		description: 'Construction material whose temporary status has become a civic tradition.',
		possibilityEffect:
			'Obstructs one local route and makes the movement network negotiate around it.'
	}
];

export const ANCHOR_BY_ID: Readonly<Record<AnchorId, AnchorDefinition>> = Object.fromEntries(
	ANCHORS.map((anchor) => [anchor.id, anchor])
) as Record<AnchorId, AnchorDefinition>;

export function rotateAnchorFootprint(
	footprint: readonly AnchorFootprintCell[],
	rotation: Rotation
): readonly AnchorFootprintCell[] {
	const rotated = footprint.map((cell) => {
		switch (rotation) {
			case 0:
				return { ...cell };
			case 1:
				return { dx: -cell.dy, dy: cell.dx, role: cell.role };
			case 2:
				return { dx: -cell.dx, dy: -cell.dy, role: cell.role };
			case 3:
				return { dx: cell.dy, dy: -cell.dx, role: cell.role };
		}
	});
	const minimumX = Math.min(...rotated.map((cell) => cell.dx));
	const minimumY = Math.min(...rotated.map((cell) => cell.dy));
	return rotated.map((cell) => ({
		...cell,
		dx: cell.dx - minimumX,
		dy: cell.dy - minimumY
	}));
}

export function anchorFootprintSize(anchor: AnchorDefinition, rotation: Rotation) {
	const cells = rotateAnchorFootprint(anchor.footprint, rotation);
	return {
		width: Math.max(...cells.map((cell) => cell.dx)) + 1,
		height: Math.max(...cells.map((cell) => cell.dy)) + 1
	};
}

export function clampAnchorPlacement(
	placement: AnchorPlacement,
	width: number,
	height: number
): AnchorPlacement {
	const definition = ANCHOR_BY_ID[placement.id] ?? ANCHOR_BY_ID[DEFAULT_CITY_CONFIG.anchor.id];
	const rotation = (
		definition.rotations.includes(placement.rotation) ? placement.rotation : definition.rotations[0]
	) as Rotation;
	const size = anchorFootprintSize(definition, rotation);
	return {
		id: definition.id,
		rotation,
		x: clampInteger(placement.x, 0, Math.max(0, width - size.width)),
		y: clampInteger(placement.y, 0, Math.max(0, height - size.height))
	};
}

export function anchorFrontageDirection(anchor: AnchorPlacement): Direction {
	return anchor.rotation;
}

export function meetsRequiredSubstrate(
	definition: AnchorDefinition,
	tags: readonly string[]
): boolean {
	return (
		!definition.requiredSubstrate ||
		definition.requiredSubstrate.length === 0 ||
		definition.requiredSubstrate.some((required) => tags.includes(required))
	);
}

export function providesPedestrianFrontage(tags: readonly string[]): boolean {
	return tags.includes('walkable') || tags.includes('open') || tags.includes('courtyard');
}

export function anchorCells(
	placement: AnchorPlacement
): readonly (AnchorFootprintCell & { x: number; y: number })[] {
	const definition = ANCHOR_BY_ID[placement.id];
	return rotateAnchorFootprint(definition.footprint, placement.rotation).map((cell) => ({
		...cell,
		x: placement.x + cell.dx,
		y: placement.y + cell.dy
	}));
}

export function cloneCityConfig(config: CityConfig): CityConfig {
	return { ...config, anchor: { ...config.anchor } };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
	if (!Number.isFinite(value)) return minimum;
	return Math.max(minimum, Math.min(maximum, Math.round(value)));
}
