import {
	districtRouteSignature,
	hashDistrictSeed,
	type DistrictId,
	type DistrictRoute,
	type DistrictRouteNode,
	type LandmarkId,
	type TransitionVeil
} from './DistrictGraph';

export const DISTRICT_CHUNK_LENGTH_M = 96;
export const CHUNKS_PER_DISTRICT = 3;

export type WorldQualityTier = 'high' | 'balanced' | 'battery';
export type Vec3Tuple = readonly [x: number, y: number, z: number];

export type GroundKind =
	| 'patched-lane'
	| 'workshop-earth'
	| 'book-street'
	| 'rain-dark-road'
	| 'maidan-grass'
	| 'hooghly-water'
	| 'new-town-road';

export type BuildingStyle =
	| 'north-courtyard-house'
	| 'kumartuli-workshop'
	| 'college-arcade'
	| 'esplanade-commercial'
	| 'park-street-commercial'
	| 'river-warehouse'
	| 'new-town-office'
	| 'new-town-apartment';

export type RoofFeature =
	| 'water-tank'
	| 'aerial'
	| 'roof-garden'
	| 'bamboo-scaffold'
	| 'washing-line'
	| 'press-vent'
	| 'construction-crane';

export type PropKind =
	| 'tea-stall'
	| 'book-stack'
	| 'newspaper-bundle'
	| 'clay-armature'
	| 'clay-worktable'
	| 'handcart'
	| 'tram-rail'
	| 'tram-wire'
	| 'yellow-taxi'
	| 'city-bus'
	| 'bicycle'
	| 'scooter'
	| 'traffic-island'
	| 'rain-tree'
	| 'football-goal'
	| 'cricket-wicket'
	| 'ghat-step'
	| 'ferry'
	| 'jetty'
	| 'flower-basket'
	| 'office-planter'
	| 'median-tree'
	| 'page-swarm'
	| 'laundry-screen'
	| 'pigeon-screen'
	| 'rain-screen'
	| 'smoke-screen'
	| 'cloud-screen'
	| 'banyan-screen'
	| 'bridge-screen';

export type ActivityKind =
	| 'tea-pour'
	| 'bookseller-bundle'
	| 'conductor-argument'
	| 'traffic-whistle'
	| 'child-ball'
	| 'roof-watering'
	| 'adda'
	| 'clay-shaping'
	| 'newspaper-wind'
	| 'office-walk'
	| 'student-books'
	| 'delivery-load'
	| 'flower-selling'
	| 'ferry-wait';

export type AnimalKind =
	| 'street-dog'
	| 'parapet-cat'
	| 'crow'
	| 'pigeon'
	| 'myna'
	| 'black-kite'
	| 'goat'
	| 'egret'
	| 'pond-heron';

export interface BuildingBlueprint {
	readonly id: string;
	readonly style: BuildingStyle;
	readonly position: Vec3Tuple;
	/** Facade width, vertical height, and street-normal depth, in metres. */
	readonly size: Vec3Tuple;
	readonly rotationY: number;
	readonly floors: number;
	readonly washIndex: number;
	readonly hasBalcony: boolean;
	readonly hasShutters: boolean;
	readonly hasAwning: boolean;
	readonly dampMark: number;
	readonly roofFeature: RoofFeature | null;
	readonly imperfection: number;
}

export interface PropBlueprint {
	readonly id: string;
	readonly kind: PropKind;
	readonly position: Vec3Tuple;
	readonly rotationY: number;
	readonly scale: number;
	readonly motionPhase: number;
}

export interface SignBlueprint {
	readonly id: string;
	readonly bengali: BengaliSignText;
	readonly english: string | null;
	readonly position: Vec3Tuple;
	readonly rotationY: number;
	readonly color: string;
}

export interface ActivityBlueprint {
	readonly id: string;
	readonly kind: ActivityKind;
	readonly position: Vec3Tuple;
	readonly rotationY: number;
	/** 24 authored combinations of anatomy, clothing, age, hair, and posture. */
	readonly appearance: number;
	readonly motionPhase: number;
	readonly nearFieldGeometry: true;
	readonly isScoringObstacle: false;
}

export interface AnimalBlueprint {
	readonly id: string;
	readonly kind: AnimalKind;
	readonly position: Vec3Tuple;
	readonly rotationY: number;
	readonly appearance: number;
	readonly motionPhase: number;
	readonly nearFieldGeometry: true;
	readonly isScoringObstacle: false;
}

export interface LandmarkBlueprint {
	readonly id: LandmarkId;
	readonly prominence: 'hero' | 'horizon';
	readonly position: Vec3Tuple;
	readonly rotationY: number;
	readonly scale: number;
}

export interface DistrictChunkBlueprint {
	readonly id: string;
	readonly version: 1;
	readonly seed: string;
	readonly routeSignature: string;
	readonly globalChunkIndex: number;
	readonly routeCycle: number;
	readonly routeNode: DistrictRouteNode;
	readonly districtLocalChunk: number;
	readonly lengthM: typeof DISTRICT_CHUNK_LENGTH_M;
	readonly halfWidthM: number;
	readonly ground: GroundKind;
	readonly buildings: readonly BuildingBlueprint[];
	readonly props: readonly PropBlueprint[];
	readonly signs: readonly SignBlueprint[];
	readonly activities: readonly ActivityBlueprint[];
	readonly animals: readonly AnimalBlueprint[];
	readonly landmarks: readonly LandmarkBlueprint[];
	readonly signature: string;
}

export interface ChunkGrammarOptions {
	readonly quality?: WorldQualityTier;
}

const QUALITY_COUNTS: Readonly<
	Record<
		WorldQualityTier,
		{
			readonly building: number;
			readonly prop: number;
			readonly activity: number;
			readonly animal: number;
		}
	>
> = {
	high: { building: 14, prop: 22, activity: 5, animal: 4 },
	balanced: { building: 10, prop: 15, activity: 3, animal: 2 },
	battery: { building: 7, prop: 9, activity: 2, animal: 1 }
};

export const CURATED_BENGALI_SIGNS = {
	tea: 'চা',
	books: 'বই',
	sweets: 'মিষ্টি',
	medicine: 'ওষুধ',
	photocopy: 'ফটোকপি',
	riceAndDal: 'ভাত-ডাল',
	bookBinding: 'বই বাঁধাই',
	cycleRepair: 'সাইকেল মেরামত',
	oldBooks: 'পুরোনো বই',
	printingPress: 'ছাপাখানা',
	clayArt: 'মৃৎশিল্প',
	paintAndBrushes: 'রং-তুলি',
	food: 'খাবার',
	dharmatala: 'ধর্মতলা',
	restaurant: 'রেস্তোরাঁ',
	flowers: 'ফুল',
	ferryGhat: 'ফেরিঘাট',
	newTown: 'নিউ টাউন'
} as const;

export type BengaliSignText = (typeof CURATED_BENGALI_SIGNS)[keyof typeof CURATED_BENGALI_SIGNS];

const SIGNS_BY_DISTRICT: Readonly<
	Record<
		DistrictId,
		readonly { readonly bengali: BengaliSignText; readonly english: string | null }[]
	>
> = {
	'north-calcutta': [
		{ bengali: CURATED_BENGALI_SIGNS.tea, english: 'TEA' },
		{ bengali: CURATED_BENGALI_SIGNS.sweets, english: null },
		{ bengali: CURATED_BENGALI_SIGNS.medicine, english: 'PHARMACY' },
		{ bengali: CURATED_BENGALI_SIGNS.riceAndDal, english: null },
		{ bengali: CURATED_BENGALI_SIGNS.cycleRepair, english: null }
	],
	kumartuli: [
		{ bengali: CURATED_BENGALI_SIGNS.clayArt, english: null },
		{ bengali: CURATED_BENGALI_SIGNS.paintAndBrushes, english: null },
		{ bengali: CURATED_BENGALI_SIGNS.tea, english: 'TEA' }
	],
	'college-street': [
		{ bengali: CURATED_BENGALI_SIGNS.books, english: 'BOOKS' },
		{ bengali: CURATED_BENGALI_SIGNS.oldBooks, english: null },
		{ bengali: CURATED_BENGALI_SIGNS.photocopy, english: 'PHOTOCOPY' },
		{ bengali: CURATED_BENGALI_SIGNS.bookBinding, english: null },
		{ bengali: CURATED_BENGALI_SIGNS.printingPress, english: null }
	],
	esplanade: [
		{ bengali: CURATED_BENGALI_SIGNS.dharmatala, english: 'DHARMATALA' },
		{ bengali: CURATED_BENGALI_SIGNS.food, english: null },
		{ bengali: CURATED_BENGALI_SIGNS.medicine, english: 'PHARMACY' },
		{ bengali: CURATED_BENGALI_SIGNS.tea, english: 'TEA' }
	],
	'maidan-victoria': [{ bengali: CURATED_BENGALI_SIGNS.tea, english: 'TEA' }],
	'park-street': [
		{ bengali: CURATED_BENGALI_SIGNS.restaurant, english: 'RESTAURANT' },
		{ bengali: CURATED_BENGALI_SIGNS.tea, english: 'TEA' },
		{ bengali: CURATED_BENGALI_SIGNS.books, english: 'BOOKS' }
	],
	hooghly: [
		{ bengali: CURATED_BENGALI_SIGNS.ferryGhat, english: 'FERRY GHAT' },
		{ bengali: CURATED_BENGALI_SIGNS.flowers, english: 'FLOWERS' },
		{ bengali: CURATED_BENGALI_SIGNS.tea, english: 'TEA' }
	],
	'new-town': [
		{ bengali: CURATED_BENGALI_SIGNS.newTown, english: 'NEW TOWN' },
		{ bengali: CURATED_BENGALI_SIGNS.food, english: 'FOOD' }
	]
};

const ACTIVITIES_BY_DISTRICT: Readonly<Record<DistrictId, readonly ActivityKind[]>> = {
	'north-calcutta': ['tea-pour', 'child-ball', 'roof-watering', 'adda', 'delivery-load'],
	kumartuli: ['clay-shaping', 'tea-pour', 'delivery-load', 'adda'],
	'college-street': ['bookseller-bundle', 'student-books', 'tea-pour', 'newspaper-wind'],
	esplanade: ['conductor-argument', 'traffic-whistle', 'office-walk', 'student-books'],
	'maidan-victoria': ['child-ball', 'adda', 'newspaper-wind', 'office-walk'],
	'park-street': ['office-walk', 'delivery-load', 'conductor-argument', 'student-books'],
	hooghly: ['ferry-wait', 'flower-selling', 'newspaper-wind', 'delivery-load'],
	'new-town': ['office-walk', 'delivery-load', 'student-books', 'roof-watering']
};

const ANIMALS_BY_DISTRICT: Readonly<Record<DistrictId, readonly AnimalKind[]>> = {
	'north-calcutta': ['street-dog', 'parapet-cat', 'crow', 'pigeon', 'myna'],
	kumartuli: ['street-dog', 'parapet-cat', 'crow', 'goat'],
	'college-street': ['street-dog', 'crow', 'pigeon', 'myna'],
	esplanade: ['street-dog', 'crow', 'pigeon'],
	'maidan-victoria': ['street-dog', 'crow', 'myna', 'black-kite'],
	'park-street': ['street-dog', 'parapet-cat', 'crow', 'myna'],
	hooghly: ['street-dog', 'crow', 'black-kite', 'egret', 'pond-heron'],
	'new-town': ['crow', 'myna', 'black-kite', 'pond-heron']
};

const PROPS_BY_DISTRICT: Readonly<Record<DistrictId, readonly PropKind[]>> = {
	'north-calcutta': ['tea-stall', 'bicycle', 'scooter', 'rain-tree', 'yellow-taxi', 'handcart'],
	kumartuli: ['clay-armature', 'clay-worktable', 'handcart', 'tea-stall', 'bicycle'],
	'college-street': ['book-stack', 'newspaper-bundle', 'tea-stall', 'page-swarm', 'bicycle'],
	esplanade: ['city-bus', 'yellow-taxi', 'tram-rail', 'tram-wire', 'traffic-island'],
	'maidan-victoria': ['rain-tree', 'football-goal', 'cricket-wicket', 'yellow-taxi'],
	'park-street': ['yellow-taxi', 'city-bus', 'rain-tree', 'tea-stall', 'office-planter'],
	hooghly: ['ghat-step', 'ferry', 'jetty', 'flower-basket', 'handcart'],
	'new-town': ['median-tree', 'office-planter', 'yellow-taxi', 'city-bus']
};

/** Nested slot order: lower tiers keep the same principal buildings; higher tiers fill gaps. */
const BUILDING_SLOT_FRACTIONS = [
	0.08, 0.92, 0.5, 0.29, 0.71, 0.18, 0.82, 0.4, 0.6, 0.125, 0.875, 0.35, 0.65, 0.24
] as const;

function random(seed: string, namespace: string): number {
	const state = hashDistrictSeed(seed, namespace) + 0x6d2b79f5;
	let value = state;
	value = Math.imul(value ^ (value >>> 15), value | 1);
	value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
	return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

function floorMod(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}

function styleForDistrict(district: DistrictId, seed: string, namespace: string): BuildingStyle {
	switch (district) {
		case 'north-calcutta':
			return 'north-courtyard-house';
		case 'kumartuli':
			return 'kumartuli-workshop';
		case 'college-street':
			return 'college-arcade';
		case 'esplanade':
			return 'esplanade-commercial';
		case 'park-street':
			return 'park-street-commercial';
		case 'hooghly':
			return 'river-warehouse';
		case 'new-town':
			return random(seed, `${namespace}/new-town-style`) < 0.55
				? 'new-town-office'
				: 'new-town-apartment';
		case 'maidan-victoria':
			return 'esplanade-commercial';
	}
}

function districtDimensions(district: DistrictId): {
	readonly halfWidthM: number;
	readonly ground: GroundKind;
	readonly minHeight: number;
	readonly maxHeight: number;
	readonly minDepth: number;
	readonly maxDepth: number;
	readonly openness: number;
} {
	switch (district) {
		case 'north-calcutta':
			return {
				halfWidthM: 18,
				ground: 'patched-lane',
				minHeight: 11,
				maxHeight: 25,
				minDepth: 8,
				maxDepth: 14,
				openness: 0
			};
		case 'kumartuli':
			return {
				halfWidthM: 20,
				ground: 'workshop-earth',
				minHeight: 7,
				maxHeight: 17,
				minDepth: 9,
				maxDepth: 16,
				openness: 0.1
			};
		case 'college-street':
			return {
				halfWidthM: 16,
				ground: 'book-street',
				minHeight: 14,
				maxHeight: 29,
				minDepth: 9,
				maxDepth: 14,
				openness: 0
			};
		case 'esplanade':
			return {
				halfWidthM: 29,
				ground: 'rain-dark-road',
				minHeight: 17,
				maxHeight: 39,
				minDepth: 12,
				maxDepth: 20,
				openness: 0.2
			};
		case 'maidan-victoria':
			return {
				halfWidthM: 72,
				ground: 'maidan-grass',
				minHeight: 9,
				maxHeight: 18,
				minDepth: 9,
				maxDepth: 14,
				openness: 0.82
			};
		case 'park-street':
			return {
				halfWidthM: 26,
				ground: 'rain-dark-road',
				minHeight: 18,
				maxHeight: 37,
				minDepth: 12,
				maxDepth: 20,
				openness: 0.16
			};
		case 'hooghly':
			return {
				halfWidthM: 82,
				ground: 'hooghly-water',
				minHeight: 8,
				maxHeight: 22,
				minDepth: 12,
				maxDepth: 22,
				openness: 0.72
			};
		case 'new-town':
			return {
				halfWidthM: 48,
				ground: 'new-town-road',
				minHeight: 38,
				maxHeight: 92,
				minDepth: 15,
				maxDepth: 27,
				openness: 0.38
			};
	}
}

function roofFeatureFor(district: DistrictId, seed: string, namespace: string): RoofFeature | null {
	const value = random(seed, `${namespace}/roof-feature`);
	const choices: readonly RoofFeature[] =
		district === 'new-town'
			? ['construction-crane', 'roof-garden', 'water-tank']
			: district === 'college-street'
				? ['press-vent', 'water-tank', 'aerial']
				: district === 'kumartuli'
					? ['bamboo-scaffold', 'washing-line', 'water-tank']
					: ['water-tank', 'aerial', 'roof-garden', 'washing-line'];
	return value < 0.24 ? null : choices[Math.floor(value * choices.length) % choices.length];
}

function createBuildings(
	seed: string,
	namespace: string,
	district: DistrictId,
	quality: WorldQualityTier
): BuildingBlueprint[] {
	const dimensions = districtDimensions(district);
	const openScale = 1 - dimensions.openness * 0.82;
	const requested = Math.max(2, Math.round(QUALITY_COUNTS[quality].building * openScale));
	const buildings: BuildingBlueprint[] = [];
	for (let index = 0; index < requested; index += 1) {
		const itemNamespace = `${namespace}/building/${index}`;
		const side = index % 2 === 0 ? -1 : 1;
		const depth =
			dimensions.minDepth +
			random(seed, `${itemNamespace}/depth`) * (dimensions.maxDepth - dimensions.minDepth);
		const width = 7 + random(seed, `${itemNamespace}/width`) * (district === 'new-town' ? 14 : 8);
		const height =
			dimensions.minHeight +
			random(seed, `${itemNamespace}/height`) * (dimensions.maxHeight - dimensions.minHeight);
		const streetSetback =
			district === 'maidan-victoria'
				? dimensions.halfWidthM * 0.78
				: district === 'hooghly'
					? dimensions.halfWidthM * 0.9
					: dimensions.halfWidthM * 0.48;
		const x = side * (streetSetback + depth * 0.5 + random(seed, `${itemNamespace}/setback`) * 4);
		const z =
			-DISTRICT_CHUNK_LENGTH_M * 0.45 +
			BUILDING_SLOT_FRACTIONS[index % BUILDING_SLOT_FRACTIONS.length] *
				DISTRICT_CHUNK_LENGTH_M *
				0.9 +
			(random(seed, `${itemNamespace}/z`) - 0.5) * 9;
		const floors = Math.max(2, Math.round(height / (district === 'new-town' ? 3.35 : 3.05)));
		buildings.push({
			id: `${namespace}:building:${index}`,
			style: styleForDistrict(district, seed, itemNamespace),
			position: [x, height * 0.5, z],
			size: [width, height, depth],
			rotationY: (random(seed, `${itemNamespace}/yaw`) - 0.5) * 0.055,
			floors,
			washIndex: Math.floor(random(seed, `${itemNamespace}/wash`) * 3),
			hasBalcony: district !== 'new-town' && random(seed, `${itemNamespace}/balcony`) < 0.56,
			hasShutters: district !== 'new-town' && random(seed, `${itemNamespace}/shutters`) < 0.72,
			hasAwning:
				!['maidan-victoria', 'hooghly', 'new-town'].includes(district) &&
				random(seed, `${itemNamespace}/awning`) < 0.48,
			dampMark:
				district === 'new-town' ? 0.08 : 0.15 + random(seed, `${itemNamespace}/damp`) * 0.65,
			roofFeature: roofFeatureFor(district, seed, itemNamespace),
			imperfection: (random(seed, `${itemNamespace}/imperfection`) - 0.5) * 0.12
		});
	}
	return buildings;
}

function transitionProp(veil: TransitionVeil): PropKind {
	switch (veil) {
		case 'laundry':
			return 'laundry-screen';
		case 'crossing-bus':
			return 'city-bus';
		case 'pigeon-lift':
			return 'pigeon-screen';
		case 'loose-pages':
			return 'page-swarm';
		case 'rain-curtain':
			return 'rain-screen';
		case 'bridge-girders':
			return 'bridge-screen';
		case 'banyan-foliage':
			return 'banyan-screen';
		case 'smoke':
			return 'smoke-screen';
		case 'cloud-bank':
			return 'cloud-screen';
	}
}

function createProps(
	seed: string,
	namespace: string,
	node: DistrictRouteNode,
	districtLocalChunk: number,
	quality: WorldQualityTier
): PropBlueprint[] {
	const props: PropBlueprint[] = [];
	const choices = PROPS_BY_DISTRICT[node.district];
	const count = QUALITY_COUNTS[quality].prop;
	if (districtLocalChunk === 0 && node.entryVeil !== null) {
		props.push({
			id: `${namespace}:transition`,
			kind: transitionProp(node.entryVeil),
			position: [0, 8, -DISTRICT_CHUNK_LENGTH_M * 0.43],
			rotationY: 0,
			scale: 1,
			motionPhase: random(seed, `${namespace}/transition/phase`)
		});
	}
	for (let index = props.length; index < count; index += 1) {
		const itemNamespace = `${namespace}/prop/${index}`;
		const kind = choices[Math.floor(random(seed, `${itemNamespace}/kind`) * choices.length)];
		const airborne = ['page-swarm', 'tram-wire'].includes(kind);
		const riverProp = ['ferry', 'jetty'].includes(kind);
		const side = random(seed, `${itemNamespace}/side`) < 0.5 ? -1 : 1;
		const lateral = riverProp
			? side * (12 + random(seed, `${itemNamespace}/x`) * 42)
			: side * (6 + random(seed, `${itemNamespace}/x`) * 18);
		props.push({
			id: `${namespace}:prop:${index}`,
			kind,
			position: [
				lateral,
				airborne ? 5 + random(seed, `${itemNamespace}/y`) * 14 : 0,
				-DISTRICT_CHUNK_LENGTH_M * 0.44 +
					random(seed, `${itemNamespace}/z`) * DISTRICT_CHUNK_LENGTH_M * 0.88
			],
			rotationY: random(seed, `${itemNamespace}/yaw`) * Math.PI * 2,
			scale: 0.72 + random(seed, `${itemNamespace}/scale`) * 0.65,
			motionPhase: random(seed, `${itemNamespace}/phase`)
		});
	}
	return props;
}

function createSigns(
	seed: string,
	namespace: string,
	district: DistrictId,
	buildings: readonly BuildingBlueprint[],
	quality: WorldQualityTier
): SignBlueprint[] {
	if (district === 'maidan-victoria') return [];
	const signs = SIGNS_BY_DISTRICT[district];
	const count = Math.min(quality === 'high' ? 4 : quality === 'balanced' ? 3 : 2, buildings.length);
	return Array.from({ length: count }, (_, index) => {
		const itemNamespace = `${namespace}/sign/${index}`;
		const building = buildings[(index * 2 + 1) % buildings.length];
		const choice = signs[Math.floor(random(seed, `${itemNamespace}/text`) * signs.length)];
		const side = building.position[0] < 0 ? 1 : -1;
		return {
			id: `${namespace}:sign:${index}`,
			bengali: choice.bengali,
			english: choice.english,
			position: [
				building.position[0] + side * (building.size[2] * 0.5 + 0.06),
				Math.min(4.2, building.size[1] * 0.28),
				building.position[2] + (random(seed, `${itemNamespace}/z`) - 0.5) * building.size[0] * 0.45
			],
			rotationY: building.position[0] < 0 ? Math.PI / 2 : -Math.PI / 2,
			color: ['#873d34', '#345f51', '#385875', '#795f31'][
				Math.floor(random(seed, `${itemNamespace}/color`) * 4)
			]
		};
	});
}

function createActivities(
	seed: string,
	namespace: string,
	district: DistrictId,
	quality: WorldQualityTier
): ActivityBlueprint[] {
	const choices = ACTIVITIES_BY_DISTRICT[district];
	return Array.from({ length: QUALITY_COUNTS[quality].activity }, (_, index) => {
		const itemNamespace = `${namespace}/activity/${index}`;
		const kind =
			choices[
				(index + Math.floor(random(seed, `${itemNamespace}/kind`) * choices.length)) %
					choices.length
			];
		const roofActivity = kind === 'roof-watering';
		const side = index % 2 === 0 ? -1 : 1;
		return {
			id: `${namespace}:activity:${index}`,
			kind,
			position: [
				side * (7 + random(seed, `${itemNamespace}/x`) * 11),
				roofActivity ? 12 + random(seed, `${itemNamespace}/y`) * 8 : 0,
				-DISTRICT_CHUNK_LENGTH_M * 0.38 +
					random(seed, `${itemNamespace}/z`) * DISTRICT_CHUNK_LENGTH_M * 0.76
			],
			rotationY: random(seed, `${itemNamespace}/yaw`) * Math.PI * 2,
			appearance: hashDistrictSeed(seed, `${itemNamespace}/appearance`) % 24,
			motionPhase: random(seed, `${itemNamespace}/phase`),
			nearFieldGeometry: true,
			isScoringObstacle: false
		};
	});
}

function createAnimals(
	seed: string,
	namespace: string,
	district: DistrictId,
	quality: WorldQualityTier
): AnimalBlueprint[] {
	const choices = ANIMALS_BY_DISTRICT[district];
	return Array.from({ length: QUALITY_COUNTS[quality].animal }, (_, index) => {
		const itemNamespace = `${namespace}/animal/${index}`;
		const kind =
			choices[
				(index + Math.floor(random(seed, `${itemNamespace}/kind`) * choices.length)) %
					choices.length
			];
		const bird = ['crow', 'pigeon', 'myna', 'black-kite', 'egret', 'pond-heron'].includes(kind);
		const cat = kind === 'parapet-cat';
		return {
			id: `${namespace}:animal:${index}`,
			kind,
			position: [
				(random(seed, `${itemNamespace}/x`) - 0.5) * 36,
				bird
					? 5 + random(seed, `${itemNamespace}/y`) * 28
					: cat
						? 8 + random(seed, `${itemNamespace}/y`) * 10
						: 0,
				-DISTRICT_CHUNK_LENGTH_M * 0.4 +
					random(seed, `${itemNamespace}/z`) * DISTRICT_CHUNK_LENGTH_M * 0.8
			],
			rotationY: random(seed, `${itemNamespace}/yaw`) * Math.PI * 2,
			appearance: hashDistrictSeed(seed, `${itemNamespace}/appearance`) % 8,
			motionPhase: random(seed, `${itemNamespace}/phase`),
			nearFieldGeometry: true,
			isScoringObstacle: false
		};
	});
}

function landmarkPlacement(id: LandmarkId, prominence: 'hero' | 'horizon'): LandmarkBlueprint {
	const horizon = prominence === 'horizon';
	switch (id) {
		case 'howrah-bridge':
		case 'vidyasagar-setu':
			return {
				id,
				prominence,
				position: horizon ? [88, 0, 34] : [0, 0, 16],
				rotationY: 0,
				scale: horizon ? 0.34 : 0.72
			};
		case 'victoria-memorial':
			return {
				id,
				prominence,
				position: horizon ? [78, 0, 36] : [48, 0, 18],
				rotationY: -0.3,
				scale: horizon ? 0.42 : 0.8
			};
		case 'biswa-bangla-gate':
			return {
				id,
				prominence,
				position: horizon ? [82, 0, 42] : [42, 0, 18],
				rotationY: 0.2,
				scale: horizon ? 0.45 : 0.82
			};
		case 'new-market-clock-tower':
		case 'shaheed-minar':
		case 'st-pauls-cathedral':
			return {
				id,
				prominence,
				position: horizon ? [76, 0, 38] : [36, 0, 20],
				rotationY: -0.2,
				scale: horizon ? 0.48 : 0.9
			};
	}
}

function createLandmarks(node: DistrictRouteNode, districtLocalChunk: number): LandmarkBlueprint[] {
	const landmarks: LandmarkBlueprint[] = [];
	if (districtLocalChunk === 1 && node.heroLandmark !== null) {
		landmarks.push(landmarkPlacement(node.heroLandmark, 'hero'));
	}
	if (districtLocalChunk === 2 && node.secondaryLandmark !== null) {
		landmarks.push(landmarkPlacement(node.secondaryLandmark, 'horizon'));
	}
	return landmarks;
}

export function districtNodeForChunk(
	route: DistrictRoute,
	globalChunkIndex: number
): {
	readonly node: DistrictRouteNode;
	readonly districtLocalChunk: number;
	readonly routeCycle: number;
} {
	if (route.modules.length === 0) {
		throw new Error('Kagojer Dana district routes must contain at least one module.');
	}
	const totalChunks = route.modules.length * CHUNKS_PER_DISTRICT;
	const wrappedChunk = floorMod(globalChunkIndex, totalChunks);
	const routeCycle = Math.floor(globalChunkIndex / totalChunks);
	const routeIndex = Math.floor(wrappedChunk / CHUNKS_PER_DISTRICT);
	return {
		node: route.modules[routeIndex],
		districtLocalChunk: wrappedChunk % CHUNKS_PER_DISTRICT,
		routeCycle
	};
}

export function chunkBlueprintSignature(
	blueprint: Omit<DistrictChunkBlueprint, 'signature'>
): string {
	const payload = [
		blueprint.routeSignature,
		blueprint.globalChunkIndex,
		blueprint.routeNode.district,
		...blueprint.buildings.map(
			(building) =>
				`${building.style},${building.position.join(',')},${building.size.join(',')},${building.roofFeature ?? '-'}`
		),
		...blueprint.props.map((prop) => `${prop.kind},${prop.position.join(',')}`),
		...blueprint.signs.map((sign) => sign.bengali),
		...blueprint.activities.map((activity) => `${activity.kind},${activity.appearance}`),
		...blueprint.animals.map((animal) => `${animal.kind},${animal.appearance}`),
		...blueprint.landmarks.map((landmark) => `${landmark.id},${landmark.prominence}`)
	].join('|');
	return hashDistrictSeed(blueprint.seed, `chunk-signature/${payload}`)
		.toString(16)
		.padStart(8, '0');
}

export function generateDistrictChunk(
	route: DistrictRoute,
	globalChunkIndex: number,
	options: ChunkGrammarOptions = {}
): DistrictChunkBlueprint {
	const quality = options.quality ?? 'balanced';
	const { node, districtLocalChunk, routeCycle } = districtNodeForChunk(route, globalChunkIndex);
	const routeSignature = districtRouteSignature(route);
	const namespace = `world/chunk/${globalChunkIndex}/${node.district}`;
	const buildings = createBuildings(route.seed, namespace, node.district, quality);
	const partial: Omit<DistrictChunkBlueprint, 'signature'> = {
		id: `${routeSignature}:${globalChunkIndex}`,
		version: 1,
		seed: route.seed,
		routeSignature,
		globalChunkIndex,
		routeCycle,
		routeNode: node,
		districtLocalChunk,
		lengthM: DISTRICT_CHUNK_LENGTH_M,
		halfWidthM: districtDimensions(node.district).halfWidthM,
		ground: districtDimensions(node.district).ground,
		buildings,
		props: createProps(route.seed, namespace, node, districtLocalChunk, quality),
		signs: createSigns(route.seed, namespace, node.district, buildings, quality),
		activities: createActivities(route.seed, namespace, node.district, quality),
		animals: createAnimals(route.seed, namespace, node.district, quality),
		landmarks: createLandmarks(node, districtLocalChunk)
	};
	return { ...partial, signature: chunkBlueprintSignature(partial) };
}
