import type {
	AtelierDesign,
	AtelierPreset,
	CameraBookmark,
	CameraView,
	DesignLocks,
	MaterialId,
	Vec3
} from './types';

export const CAMERA_VIEWS: Record<CameraBookmark, CameraView> = {
	whole: { position: [0, 4, 14], target: [0, 3.8, 0] },
	face: { position: [0, 5.7, 4.4], target: [0, 5.6, 0] },
	crown: { position: [0, 6.9, 5], target: [0, 6.6, 0] },
	'three-quarter': { position: [8, 5, 12], target: [0, 3.8, 0] }
};

export const STAGES = ['Framework', 'Clay', 'Paint', 'Cloth', 'Ornament', 'Complete'];

export const DEFAULT_LOCKS: DesignLocks = {
	face: false,
	pose: false,
	dress: false,
	ornament: false,
	setting: false
};

export const MATERIALS: { id: MaterialId; name: string }[] = [
	{ id: 'painted-clay', name: 'Painted clay' },
	{ id: 'clay', name: 'Unfired clay' },
	{ id: 'terracotta', name: 'Terracotta' },
	{ id: 'bronze', name: 'Aged bronze' },
	{ id: 'brass', name: 'Warm brass' },
	{ id: 'stone', name: 'Pale stone' }
];

export const DEFAULT_DESIGN: AtelierDesign = {
	version: 1,
	seed: 'mrinmoyee-shola-2026',
	presetId: 'shola-vermilion',
	face: 'serene',
	faceWidth: 1,
	eyeScale: 1,
	headTilt: 0,
	pose: 'classic',
	material: 'painted-clay',
	skinColor: '#eab974',
	sariColor: '#ae172c',
	borderColor: '#d9aa55',
	blouseColor: '#741321',
	sariPattern: 'lotus',
	crown: 'shola',
	crownScale: 1,
	ornamentDensity: 0.8,
	garland: 'marigold',
	flowers: true,
	halo: 'lotus',
	backdrop: 'charcoal',
	lamps: true,
	lampIntensity: 0.72,
	lightWarmth: 0.78,
	lightAngle: -28,
	exposure: 1.12,
	atmosphere: 0.22,
	stage: 5,
	bells: true,
	lion: true,
	camera: { position: [...CAMERA_VIEWS.whole.position], target: [...CAMERA_VIEWS.whole.target] }
};

function preset(
	id: string,
	name: string,
	description: string,
	colours: AtelierPreset['colours'],
	changes: Partial<AtelierDesign>
): AtelierPreset {
	return {
		id,
		name,
		description,
		colours,
		design: {
			...DEFAULT_DESIGN,
			...changes,
			presetId: id,
			seed: `mrinmoyee-${id}-2026`,
			camera: { position: [...CAMERA_VIEWS.whole.position], target: [...CAMERA_VIEWS.whole.target] }
		}
	};
}

export const PRESETS: AtelierPreset[] = [
	preset(
		'kumartuli',
		'Kumartuli Atelier',
		'Earthy clay, spare ornament and soft workshop daylight.',
		['#a87d5e', '#d5bea0', '#756451'],
		{
			material: 'clay',
			skinColor: '#b58c6c',
			sariColor: '#aa7656',
			borderColor: '#c49e74',
			blouseColor: '#906147',
			crown: 'shola',
			ornamentDensity: 0.35,
			backdrop: 'atelier',
			garland: 'jasmine',
			flowers: false,
			lamps: false,
			bells: false,
			lightWarmth: 0.38,
			lightAngle: -38,
			exposure: 1.15,
			atmosphere: 0.06
		}
	),
	preset(
		'shola-vermilion',
		'Shola and Vermilion',
		'Ivory-white filigree, a deep red sari and a chamber of warm brass light.',
		['#ae172c', '#f6e7c7', '#d9aa55'],
		{}
	),
	preset(
		'golden-evening',
		'Golden Evening',
		'Marigolds, layered gold ornament and the quiet warmth of oil lamps.',
		['#a62324', '#d9aa43', '#f79d2b'],
		{
			sariColor: '#a62324',
			borderColor: '#e6b94f',
			blouseColor: '#6e1822',
			crown: 'gold',
			ornamentDensity: 0.95,
			halo: 'sunburst',
			garland: 'marigold',
			lightWarmth: 0.95,
			lightAngle: 20,
			lampIntensity: 0.95,
			exposure: 1.05,
			atmosphere: 0.35
		}
	),
	preset(
		'terracotta',
		'Terracotta Reverie',
		'Fired-earth colours and raking light that catches every sculpted fold.',
		['#a64f34', '#d6885b', '#57352c'],
		{
			material: 'terracotta',
			skinColor: '#b65f3d',
			sariColor: '#8b402d',
			borderColor: '#d88a5b',
			blouseColor: '#713526',
			sariPattern: 'chevron',
			crown: 'gold',
			ornamentDensity: 0.48,
			flowers: false,
			bells: false,
			halo: 'arch',
			lightAngle: -62,
			lightWarmth: 0.7,
			lampIntensity: 0.3,
			exposure: 1.08,
			atmosphere: 0.08
		}
	),
	preset(
		'moonlit-silver',
		'Moonlit Silver',
		'Pale painted clay, indigo cloth and restrained silver, warmed by small lamps.',
		['#253b73', '#d1dbe4', '#faf1d5'],
		{
			material: 'painted-clay',
			skinColor: '#e0d4bb',
			sariColor: '#253b73',
			borderColor: '#d1dbe4',
			blouseColor: '#17274e',
			sariPattern: 'vine',
			crown: 'silver',
			garland: 'jasmine',
			backdrop: 'indigo',
			ornamentDensity: 0.6,
			lightWarmth: 0.12,
			lightAngle: 35,
			lampIntensity: 0.55,
			exposure: 1.2,
			atmosphere: 0.25
		}
	),
	preset(
		'contemporary',
		'Contemporary Pandal',
		'An architectural arch, cream cloth, vermilion accents and a bold open pose.',
		['#e9d8b1', '#a31e38', '#b58c52'],
		{
			face: 'resolute',
			pose: 'open',
			sariColor: '#e9d8b1',
			borderColor: '#a31e38',
			blouseColor: '#991a31',
			sariPattern: 'chevron',
			crown: 'gold',
			crownScale: 1.08,
			ornamentDensity: 0.5,
			garland: 'hibiscus',
			halo: 'arch',
			backdrop: 'pandal',
			lightWarmth: 0.56,
			lightAngle: -12,
			exposure: 1.18,
			atmosphere: 0.12
		}
	)
];

/** Read only an object's own data properties: inherited values and accessors are never used. */
export function ownValue(input: unknown, key: string): unknown {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
	const descriptor = Object.getOwnPropertyDescriptor(input, key);
	return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function numberValue(input: unknown, fallback: number, min: number, max: number): number {
	return typeof input === 'number' && Number.isFinite(input)
		? Math.max(min, Math.min(max, input))
		: fallback;
}

function enumValue<T extends string>(input: unknown, values: readonly T[], fallback: T): T {
	return typeof input === 'string' && values.includes(input as T) ? (input as T) : fallback;
}

function colour(input: unknown, fallback: string): string {
	return typeof input === 'string' && /^#[\da-f]{6}$/iu.test(input)
		? input.toLowerCase()
		: fallback;
}

function vector(input: unknown, fallback: Vec3, limit: number): Vec3 {
	if (!Array.isArray(input) || input.length !== 3) return [...fallback];
	if (!input.every((value) => typeof value === 'number' && Number.isFinite(value))) {
		return [...fallback];
	}
	return input.map((value) => Math.max(-limit, Math.min(limit, value))) as Vec3;
}

/** The sole normalisation boundary for controls, file imports, links and stored designs. */
export function normalizeDesign(input: unknown): AtelierDesign {
	const base = DEFAULT_DESIGN;
	const get = (key: keyof AtelierDesign) => ownValue(input, key);
	const bool = (key: keyof AtelierDesign) =>
		typeof get(key) === 'boolean' ? (get(key) as boolean) : (base[key] as boolean);
	const rawSeed = get('seed');
	const seed =
		typeof rawSeed === 'string'
			? Array.from(
					rawSeed
						.normalize('NFC')
						.replace(/\p{Cc}/gu, '')
						.trim()
				)
					.slice(0, 64)
					.join('') || base.seed
			: base.seed;
	const camera = get('camera');
	let position = vector(ownValue(camera, 'position'), base.camera.position, 35);
	let target = vector(ownValue(camera, 'target'), base.camera.target, 15);
	if (Math.hypot(...position.map((value, index) => value - target[index])) < 0.5) {
		position = [...base.camera.position];
		target = [...base.camera.target];
	}
	return {
		version: 1,
		seed,
		presetId: enumValue(get('presetId'), [...PRESETS.map(({ id }) => id), 'custom'], base.presetId),
		face: enumValue(get('face'), ['serene', 'resolute', 'gentle'], base.face),
		faceWidth: numberValue(get('faceWidth'), base.faceWidth, 0.9, 1.1),
		eyeScale: numberValue(get('eyeScale'), base.eyeScale, 0.85, 1.15),
		headTilt: numberValue(get('headTilt'), base.headTilt, -8, 8),
		pose: enumValue(get('pose'), ['classic', 'open'], base.pose),
		material: enumValue(
			get('material'),
			MATERIALS.map(({ id }) => id),
			base.material
		),
		skinColor: colour(get('skinColor'), base.skinColor),
		sariColor: colour(get('sariColor'), base.sariColor),
		borderColor: colour(get('borderColor'), base.borderColor),
		blouseColor: colour(get('blouseColor'), base.blouseColor),
		sariPattern: enumValue(get('sariPattern'), ['lotus', 'vine', 'chevron'], base.sariPattern),
		crown: enumValue(get('crown'), ['shola', 'gold', 'silver'], base.crown),
		crownScale: numberValue(get('crownScale'), base.crownScale, 0.8, 1.2),
		ornamentDensity: numberValue(get('ornamentDensity'), base.ornamentDensity, 0, 1),
		garland: enumValue(get('garland'), ['marigold', 'jasmine', 'hibiscus'], base.garland),
		flowers: bool('flowers'),
		halo: enumValue(get('halo'), ['lotus', 'sunburst', 'arch'], base.halo),
		backdrop: enumValue(
			get('backdrop'),
			['charcoal', 'atelier', 'indigo', 'pandal'],
			base.backdrop
		),
		lamps: bool('lamps'),
		lampIntensity: numberValue(get('lampIntensity'), base.lampIntensity, 0, 1),
		lightWarmth: numberValue(get('lightWarmth'), base.lightWarmth, 0, 1),
		lightAngle: numberValue(get('lightAngle'), base.lightAngle, -90, 90),
		exposure: numberValue(get('exposure'), base.exposure, 0.6, 1.8),
		atmosphere: numberValue(get('atmosphere'), base.atmosphere, 0, 1),
		stage: Math.round(numberValue(get('stage'), base.stage, 0, 5)),
		bells: bool('bells'),
		lion: bool('lion'),
		camera: { position, target }
	};
}
