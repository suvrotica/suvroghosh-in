import { ANOMALY_MULTIPLIERS, DENSITY_MULTIPLIERS, LANDMARK_MULTIPLIERS } from './constants';
import { rotateDirection, rotateEdges } from './directions';
import type {
	CityConfig,
	Direction,
	EdgeSignature,
	Rotation,
	TilePrototype,
	TileVariant
} from './types';

const ROTATIONS = [0, 1, 2, 3] as const;
const HALF_TURNS = [0, 1] as const;

function edge(overrides: Partial<EdgeSignature> = {}): EdgeSignature {
	return {
		passage: 'closed',
		water: 'dry',
		drain: 'none',
		face: 'neutral',
		clearance: 0,
		...overrides
	};
}

function edges(
	north: Partial<EdgeSignature> = {},
	east: Partial<EdgeSignature> = {},
	south: Partial<EdgeSignature> = {},
	west: Partial<EdgeSignature> = {}
): [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature] {
	return [edge(north), edge(east), edge(south), edge(west)];
}

function passage(kind: 'foot' | 'lane' | 'road' | 'tram') {
	return {
		passage: kind,
		clearance: (kind === 'foot' ? 0 : kind === 'lane' ? 1 : 2) as 0 | 1 | 2
	};
}

function fabric(
	id: string,
	weight: number,
	rotations: readonly Rotation[],
	tileEdges: TilePrototype['edges'],
	tags: readonly string[],
	renderer = id
): TilePrototype {
	return {
		id,
		pass: 'fabric',
		weight,
		rotations,
		edges: tileEdges,
		tags,
		renderer
	};
}

function occupation(
	id: string,
	weight: number,
	rotations: readonly Rotation[],
	face: 'neutral' | 'wall' | 'entrance' | 'shopfront' | 'garage-door',
	tags: readonly string[],
	allowedSubstrates: readonly string[],
	renderer = id
): TilePrototype {
	const oriented = face !== 'neutral' && face !== 'wall';
	return {
		id,
		pass: 'occupation',
		weight,
		rotations,
		edges: oriented
			? edges({ face }, { face: 'wall' }, { face: 'wall' }, { face: 'wall' })
			: edges({ face }, { face }, { face }, { face }),
		tags,
		allowedSubstrates,
		renderer,
		...(oriented ? { orientation: 0 as Direction } : {})
	};
}

/**
 * Authored urban-fabric prototypes. Road geometry remains local: boundary portals constrain only
 * the exterior sockets and do not encode a hidden complete street plan.
 */
export const FABRIC_PROTOTYPES: readonly TilePrototype[] = [
	fabric('buildable-parcel', 14, [0], edges(), ['buildable', 'parcel'], 'parcel'),
	fabric('open-patch', 3.2, [0], edges(), ['open', 'courtyard'], 'open-patch'),
	fabric('tree-patch', 1.6, [0], edges(), ['open', 'tree-substrate'], 'tree-patch'),
	fabric('lane-straight', 6.4, HALF_TURNS, edges(passage('lane'), {}, passage('lane')), [
		'walkable',
		'lane',
		'route'
	]),
	fabric('lane-corner', 4.7, ROTATIONS, edges(passage('lane'), passage('lane')), [
		'walkable',
		'lane',
		'route',
		'junction'
	]),
	fabric('lane-tee', 2.5, ROTATIONS, edges(passage('lane'), passage('lane'), {}, passage('lane')), [
		'walkable',
		'lane',
		'route',
		'junction'
	]),
	fabric(
		'lane-crossing',
		1.2,
		[0],
		edges(passage('lane'), passage('lane'), passage('lane'), passage('lane')),
		['walkable', 'lane', 'route', 'junction']
	),
	fabric('road-straight', 3.5, HALF_TURNS, edges(passage('road'), {}, passage('road')), [
		'walkable',
		'road',
		'vehicle-access',
		'route'
	]),
	fabric('road-corner', 2.3, ROTATIONS, edges(passage('road'), passage('road')), [
		'walkable',
		'road',
		'vehicle-access',
		'route',
		'junction'
	]),
	fabric(
		'road-tee',
		1.25,
		ROTATIONS,
		edges(passage('road'), passage('road'), {}, passage('road')),
		['walkable', 'road', 'vehicle-access', 'route', 'junction']
	),
	fabric(
		'road-crossing',
		0.7,
		[0],
		edges(passage('road'), passage('road'), passage('road'), passage('road')),
		['walkable', 'road', 'vehicle-access', 'route', 'junction']
	),
	fabric('lane-road-transition', 1.8, ROTATIONS, edges(passage('lane'), {}, passage('road')), [
		'walkable',
		'lane',
		'road',
		'vehicle-access',
		'route',
		'transition'
	]),
	fabric('footpath-straight', 1.8, HALF_TURNS, edges(passage('foot'), {}, passage('foot')), [
		'walkable',
		'footpath',
		'route'
	]),
	fabric('footpath-corner', 1.2, ROTATIONS, edges(passage('foot'), passage('foot')), [
		'walkable',
		'footpath',
		'route'
	]),
	fabric('tram-road-straight', 0.8, HALF_TURNS, edges(passage('tram'), {}, passage('tram')), [
		'walkable',
		'road',
		'tram',
		'vehicle-access',
		'route'
	]),
	fabric('tram-road-corner', 0.2, ROTATIONS, edges(passage('tram'), passage('tram')), [
		'walkable',
		'road',
		'tram',
		'vehicle-access',
		'route',
		'junction'
	]),
	fabric(
		'pond-interior',
		1.1,
		[0],
		edges({ water: 'pond' }, { water: 'pond' }, { water: 'pond' }, { water: 'pond' }),
		['pond', 'water'],
		'pond-interior'
	),
	fabric(
		'pond-bank',
		1.3,
		ROTATIONS,
		edges({ water: 'pond' }, { water: 'bank' }, { water: 'bank' }, { water: 'bank' }),
		['pond-bank', 'open'],
		'pond-bank'
	),
	fabric(
		'pond-corner',
		0.8,
		ROTATIONS,
		edges({ water: 'pond' }, { water: 'pond' }, { water: 'bank' }, { water: 'bank' }),
		['pond-bank', 'open'],
		'pond-corner'
	)
];

export const OCCUPATION_PROTOTYPES: readonly TilePrototype[] = [
	occupation(
		'empty',
		4,
		[0],
		'neutral',
		['empty'],
		['buildable', 'open', 'walkable', 'pond', 'pond-bank', 'tree-substrate']
	),
	occupation(
		'partial-parcel',
		2.1,
		[0],
		'wall',
		['occupied', 'building', 'partial'],
		['buildable']
	),
	occupation(
		'old-house',
		8,
		ROTATIONS,
		'entrance',
		['occupied', 'building', 'house', 'service-frontage'],
		['buildable']
	),
	occupation(
		'crumbling-house',
		3.4,
		ROTATIONS,
		'entrance',
		['occupied', 'building', 'house', 'crumbling', 'service-frontage'],
		['buildable']
	),
	occupation(
		'verandah-house',
		3.8,
		ROTATIONS,
		'entrance',
		['occupied', 'building', 'house', 'verandah', 'service-frontage'],
		['buildable']
	),
	occupation(
		'balcony-house',
		3.1,
		ROTATIONS,
		'entrance',
		['occupied', 'building', 'house', 'balcony', 'service-frontage'],
		['buildable']
	),
	occupation(
		'corner-house',
		2.1,
		ROTATIONS,
		'entrance',
		['occupied', 'building', 'house', 'corner-house', 'service-frontage'],
		['buildable']
	),
	occupation(
		'sweet-shop',
		2,
		ROTATIONS,
		'shopfront',
		['occupied', 'building', 'shop', 'sweet-shop', 'service', 'service-frontage'],
		['buildable']
	),
	occupation(
		'tea-stall',
		2.3,
		ROTATIONS,
		'shopfront',
		['occupied', 'stall', 'tea-stall', 'service', 'service-frontage'],
		['buildable', 'open', 'walkable']
	),
	occupation(
		'garage',
		1.6,
		ROTATIONS,
		'garage-door',
		['occupied', 'building', 'garage', 'service', 'vehicle-frontage'],
		['buildable']
	),
	occupation(
		'workshop',
		1.8,
		ROTATIONS,
		'garage-door',
		['occupied', 'building', 'workshop', 'service', 'vehicle-frontage'],
		['buildable']
	),
	occupation(
		'temple',
		0.72,
		ROTATIONS,
		'entrance',
		['occupied', 'building', 'temple', 'landmark', 'service-frontage'],
		['buildable', 'open']
	),
	occupation(
		'tree',
		2.2,
		[0],
		'neutral',
		['tree', 'open-space'],
		['buildable', 'open', 'pond-bank', 'tree-substrate']
	),
	occupation(
		'permanent-sand-pile',
		0.75,
		[0],
		'neutral',
		['sand', 'obstruction'],
		['buildable', 'open', 'walkable']
	),
	occupation(
		'flyover-pillar',
		0.45,
		[0],
		'neutral',
		['pillar', 'infrastructure', 'obstruction'],
		['buildable', 'open', 'walkable']
	),
	occupation(
		'tram-stop',
		0.55,
		ROTATIONS,
		'entrance',
		['tram-stop', 'service', 'service-frontage'],
		['tram']
	),
	occupation(
		'pond-ghat',
		0.6,
		ROTATIONS,
		'entrance',
		['ghat', 'service-frontage', 'open-space'],
		['pond-bank']
	)
];

export function expandPrototypes(prototypes: readonly TilePrototype[]): readonly TileVariant[] {
	const variants: TileVariant[] = [];
	for (const prototype of prototypes) {
		for (const rotation of prototype.rotations) {
			variants.push({
				index: variants.length,
				id: `${prototype.id}@${rotation}`,
				prototypeId: prototype.id,
				pass: prototype.pass,
				weight: prototype.weight,
				rotation,
				edges: rotateEdges(prototype.edges, rotation),
				tags: prototype.tags,
				allowedSubstrates: prototype.allowedSubstrates,
				forbiddenSubstrates: prototype.forbiddenSubstrates,
				rarityGroup: prototype.rarityGroup,
				renderer: prototype.renderer,
				...(prototype.orientation === undefined
					? {}
					: { orientation: rotateDirection(prototype.orientation, rotation) })
			});
		}
	}
	return variants;
}

export function createFabricCatalog(config: CityConfig): readonly TileVariant[] {
	const base = expandPrototypes(FABRIC_PROTOTYPES);
	return base.map((variant) => ({
		...variant,
		weight:
			variant.weight *
			(variant.tags.includes('tram') && config.tramPreference === 'high' ? 4.5 : 1) *
			(variant.tags.includes('open') && config.density === 'dense' ? 0.65 : 1)
	}));
}

export function createOccupationCatalog(config: CityConfig): readonly TileVariant[] {
	const density = DENSITY_MULTIPLIERS[config.density];
	const landmarks = LANDMARK_MULTIPLIERS[config.landmarkFrequency];
	const obstructionFrequency = ANOMALY_MULTIPLIERS[config.anomalyAppetite] * 0.24;
	const base = expandPrototypes(OCCUPATION_PROTOTYPES);
	return base.map((variant) => ({
		...variant,
		weight:
			variant.weight *
			(variant.tags.includes('occupied') ? density : 1 / Math.sqrt(density)) *
			(variant.tags.includes('landmark') ? landmarks : 1) *
			(variant.tags.includes('obstruction') ? obstructionFrequency : 1)
	}));
}

export function variantsByPrototype(
	variants: readonly TileVariant[],
	prototypeId: string
): readonly TileVariant[] {
	return variants.filter((variant) => variant.prototypeId === prototypeId);
}

export function findVariant(
	variants: readonly TileVariant[],
	prototypeId: string,
	rotation?: Rotation
): TileVariant | undefined {
	return variants.find(
		(variant) =>
			variant.prototypeId === prototypeId &&
			(rotation === undefined || variant.rotation === rotation)
	);
}
