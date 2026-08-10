/**
 * Dream-geography for Kagojer Dana.
 *
 * The graph is deliberately not a municipal map: its edges describe plausible
 * visual transitions, not roads. Local landmark relationships remain truthful.
 * All random decisions use a namespace so adding detail to one module cannot
 * silently reorder the rest of the flight.
 */

export const DISTRICT_GRAPH_VERSION = 1 as const;

export type DistrictId =
	| 'north-calcutta'
	| 'kumartuli'
	| 'college-street'
	| 'esplanade'
	| 'maidan-victoria'
	| 'park-street'
	| 'hooghly'
	| 'new-town';

export type LandmarkId =
	| 'howrah-bridge'
	| 'vidyasagar-setu'
	| 'victoria-memorial'
	| 'biswa-bangla-gate'
	| 'new-market-clock-tower'
	| 'shaheed-minar'
	| 'st-pauls-cathedral';

export type TransitionVeil =
	| 'laundry'
	| 'crossing-bus'
	| 'pigeon-lift'
	| 'loose-pages'
	| 'rain-curtain'
	| 'bridge-girders'
	| 'banyan-foliage'
	| 'smoke'
	| 'cloud-bank';

export interface DistrictPalette {
	readonly paper: string;
	readonly ink: string;
	readonly wash: readonly [string, string, string];
	readonly accent: string;
}

export interface DistrictRouteNode {
	readonly index: number;
	readonly district: DistrictId;
	/** Seconds of authored travel at a comfortable 8–10 m/s glide. */
	readonly durationSeconds: number;
	readonly entryVeil: TransitionVeil | null;
	readonly heroLandmark: LandmarkId | null;
	readonly secondaryLandmark: LandmarkId | null;
	readonly revealAtSeconds: number | null;
	readonly palette: DistrictPalette;
}

export interface DistrictRoute {
	readonly version: typeof DISTRICT_GRAPH_VERSION;
	readonly seed: string;
	readonly modules: readonly DistrictRouteNode[];
	readonly signature: string;
}

export interface DistrictRouteOptions {
	/** Defaults deterministically to fourteen or fifteen; accepts five through sixteen. */
	readonly moduleCount?: number;
	/** The quiet opening is fixed here unless a development capture overrides it. */
	readonly startDistrict?: DistrictId;
}

interface WeightedEdge {
	readonly to: DistrictId;
	readonly weight: number;
}

const DISTRICT_IDS: readonly DistrictId[] = [
	'north-calcutta',
	'kumartuli',
	'college-street',
	'esplanade',
	'maidan-victoria',
	'park-street',
	'hooghly',
	'new-town'
] as const;

const GRAPH: Readonly<Record<DistrictId, readonly WeightedEdge[]>> = {
	'north-calcutta': [
		{ to: 'kumartuli', weight: 5 },
		{ to: 'college-street', weight: 5 },
		{ to: 'hooghly', weight: 1.5 },
		{ to: 'esplanade', weight: 1 }
	],
	kumartuli: [
		{ to: 'north-calcutta', weight: 2 },
		{ to: 'college-street', weight: 2.5 },
		{ to: 'hooghly', weight: 6 },
		{ to: 'esplanade', weight: 0.8 }
	],
	'college-street': [
		{ to: 'north-calcutta', weight: 2 },
		{ to: 'kumartuli', weight: 2 },
		{ to: 'esplanade', weight: 6 },
		{ to: 'park-street', weight: 1.2 },
		{ to: 'hooghly', weight: 0.8 }
	],
	esplanade: [
		{ to: 'college-street', weight: 3 },
		{ to: 'maidan-victoria', weight: 5 },
		{ to: 'park-street', weight: 4 },
		{ to: 'hooghly', weight: 1.3 },
		{ to: 'new-town', weight: 0.5 }
	],
	'maidan-victoria': [
		{ to: 'esplanade', weight: 2 },
		{ to: 'park-street', weight: 5 },
		{ to: 'hooghly', weight: 3 },
		{ to: 'new-town', weight: 1.2 }
	],
	'park-street': [
		{ to: 'esplanade', weight: 3 },
		{ to: 'maidan-victoria', weight: 5 },
		{ to: 'hooghly', weight: 2 },
		{ to: 'new-town', weight: 2 }
	],
	hooghly: [
		{ to: 'kumartuli', weight: 3.5 },
		{ to: 'north-calcutta', weight: 1.5 },
		{ to: 'esplanade', weight: 1 },
		{ to: 'maidan-victoria', weight: 3 },
		{ to: 'park-street', weight: 1.5 },
		{ to: 'new-town', weight: 3.5 }
	],
	'new-town': [
		{ to: 'hooghly', weight: 5 },
		{ to: 'maidan-victoria', weight: 1.5 },
		{ to: 'park-street', weight: 2.5 },
		{ to: 'esplanade', weight: 0.7 }
	]
};

export const DISTRICT_PALETTES: Readonly<Record<DistrictId, DistrictPalette>> = {
	'north-calcutta': {
		paper: '#c7bda6',
		ink: '#252726',
		wash: ['#9b744f', '#5d725b', '#72565c'],
		accent: '#315a73'
	},
	kumartuli: {
		paper: '#c4b59d',
		ink: '#292724',
		wash: ['#9b6947', '#75624d', '#596c62'],
		accent: '#a04e3d'
	},
	'college-street': {
		paper: '#c8bfa8',
		ink: '#222525',
		wash: ['#6d6356', '#4f6671', '#8b6d3e'],
		accent: '#a7463c'
	},
	esplanade: {
		paper: '#beb8a9',
		ink: '#202426',
		wash: ['#687176', '#8a744f', '#635d5a'],
		accent: '#c59427'
	},
	'maidan-victoria': {
		paper: '#c9c5b7',
		ink: '#292c2b',
		wash: ['#657259', '#92795a', '#818d99'],
		accent: '#e1ddd0'
	},
	'park-street': {
		paper: '#aaa49a',
		ink: '#1c2022',
		wash: ['#765540', '#6f3942', '#334f58'],
		accent: '#d2a62f'
	},
	hooghly: {
		paper: '#b9b7ad',
		ink: '#252b2d',
		wash: ['#68787a', '#766951', '#3f5c50'],
		accent: '#d9d8cc'
	},
	'new-town': {
		paper: '#c0c2bd',
		ink: '#273034',
		wash: ['#78909b', '#858b87', '#647c5d'],
		accent: '#c87535'
	}
};

const VEILS_BY_DISTRICT: Readonly<Record<DistrictId, readonly TransitionVeil[]>> = {
	'north-calcutta': ['laundry', 'banyan-foliage', 'smoke'],
	kumartuli: ['laundry', 'smoke', 'rain-curtain'],
	'college-street': ['loose-pages', 'crossing-bus', 'rain-curtain'],
	esplanade: ['crossing-bus', 'rain-curtain', 'smoke'],
	'maidan-victoria': ['banyan-foliage', 'rain-curtain', 'cloud-bank'],
	'park-street': ['crossing-bus', 'rain-curtain', 'banyan-foliage'],
	hooghly: ['bridge-girders', 'rain-curtain', 'cloud-bank'],
	'new-town': ['cloud-bank', 'rain-curtain', 'banyan-foliage']
};

/** FNV-1a plus an avalanche step; stable in browsers and Node. */
export function hashDistrictSeed(seed: string | number, namespace = ''): number {
	const input = `${normaliseSeed(seed)}\u241f${namespace}`;
	let hash = 2_166_136_261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x7feb352d);
	hash ^= hash >>> 15;
	hash = Math.imul(hash, 0x846ca68b);
	hash ^= hash >>> 16;
	return hash >>> 0;
}

export function normaliseSeed(seed: string | number): string {
	if (typeof seed === 'number') return Number.isFinite(seed) ? String(seed) : '0';
	const trimmed = seed.trim();
	return trimmed.length > 0 ? trimmed.slice(0, 96) : 'calcutta-crosswind';
}

function randomFor(seed: string, namespace: string): number {
	let state = hashDistrictSeed(seed, namespace);
	state += 0x6d2b79f5;
	let value = state;
	value = Math.imul(value ^ (value >>> 15), value | 1);
	value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
	return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

function clampModuleCount(value: number): number {
	if (!Number.isFinite(value)) return 14;
	return Math.max(5, Math.min(16, Math.round(value)));
}

function weightedChoice(
	seed: string,
	namespace: string,
	candidates: readonly WeightedEdge[]
): DistrictId {
	const total = candidates.reduce((sum, candidate) => sum + Math.max(0, candidate.weight), 0);
	let cursor = randomFor(seed, namespace) * total;
	for (const candidate of candidates) {
		cursor -= Math.max(0, candidate.weight);
		if (cursor <= 0) return candidate.to;
	}
	return candidates[candidates.length - 1]?.to ?? 'north-calcutta';
}

function chooseDistrictSequence(seed: string, count: number, start: DistrictId): DistrictId[] {
	const result: DistrictId[] = [start];
	let remaining = new Set<DistrictId>(DISTRICT_IDS.filter((district) => district !== start));
	for (let index = 1; index < count; index += 1) {
		const current = result[index - 1];
		if (remaining.size === 0) {
			// A new memory-pass begins only after all eight districts were seen.
			// Excluding the current district makes every revisit non-immediate.
			remaining = new Set(DISTRICT_IDS.filter((district) => district !== current));
		}

		let candidates = GRAPH[current].filter((edge) => remaining.has(edge.to));
		if (candidates.length === 0) {
			candidates = DISTRICT_IDS.filter((district) => remaining.has(district)).map((district) => ({
				to: district,
				weight: 1
			}));
		}
		const next = weightedChoice(seed, `route/module/${index}/${current}`, candidates);
		result.push(next);
		remaining.delete(next);
	}
	return result;
}

function heroForDistrict(seed: string, district: DistrictId, index: number): LandmarkId | null {
	switch (district) {
		case 'hooghly':
			return randomFor(seed, `landmark/${index}/bridge`) < 0.66
				? 'howrah-bridge'
				: 'vidyasagar-setu';
		case 'maidan-victoria':
			return 'victoria-memorial';
		case 'new-town':
			return 'biswa-bangla-gate';
		case 'esplanade':
			return randomFor(seed, `landmark/${index}/esplanade`) < 0.62
				? 'new-market-clock-tower'
				: 'shaheed-minar';
		default:
			return null;
	}
}

function secondaryForDistrict(
	seed: string,
	district: DistrictId,
	index: number,
	hero: LandmarkId | null
): LandmarkId | null {
	switch (district) {
		case 'kumartuli':
			return randomFor(seed, `landmark/${index}/secondary`) < 0.55 ? 'howrah-bridge' : null;
		case 'esplanade':
			return hero === 'new-market-clock-tower' ? 'shaheed-minar' : 'new-market-clock-tower';
		case 'maidan-victoria':
			return 'st-pauls-cathedral';
		case 'park-street':
			return randomFor(seed, `landmark/${index}/secondary`) < 0.45 ? 'st-pauls-cathedral' : null;
		default:
			return null;
	}
}

function routeHash(seed: string, modules: readonly DistrictRouteNode[]): string {
	const payload = modules
		.map(
			(module) =>
				`${module.district}:${module.durationSeconds}:${module.entryVeil ?? '-'}:${module.heroLandmark ?? '-'}:${module.secondaryLandmark ?? '-'}`
		)
		.join('|');
	return hashDistrictSeed(seed, `v${DISTRICT_GRAPH_VERSION}/${payload}`)
		.toString(16)
		.padStart(8, '0');
}

export function generateDistrictRoute(
	rootSeed: string | number,
	options: DistrictRouteOptions = {}
): DistrictRoute {
	const seed = normaliseSeed(rootSeed);
	const derivedCount = 14 + Math.floor(randomFor(seed, 'route/module-count') * 2);
	const count = clampModuleCount(options.moduleCount ?? derivedCount);
	const start = options.startDistrict ?? 'north-calcutta';
	const districts = chooseDistrictSequence(seed, count, start);
	let elapsedSeconds = 0;
	let lastHeroRevealSeconds = -Number.POSITIVE_INFINITY;

	const modules: DistrictRouteNode[] = districts.map((district, index) => {
		const durationSeconds = 26 + Math.floor(randomFor(seed, `route/duration/${index}`) * 14);
		const heroCandidate = heroForDistrict(seed, district, index);
		const revealOffset = 8 + Math.floor(randomFor(seed, `route/reveal/${index}`) * 8);
		const revealTime = elapsedSeconds + revealOffset;
		const heroLandmark =
			heroCandidate !== null && revealTime - lastHeroRevealSeconds >= 35 ? heroCandidate : null;
		if (heroLandmark !== null) lastHeroRevealSeconds = revealTime;
		const veilChoices = VEILS_BY_DISTRICT[district];
		const entryVeil =
			index === 0
				? null
				: veilChoices[Math.floor(randomFor(seed, `route/veil/${index}`) * veilChoices.length)];
		const node: DistrictRouteNode = {
			index,
			district,
			durationSeconds,
			entryVeil,
			heroLandmark,
			secondaryLandmark: secondaryForDistrict(seed, district, index, heroLandmark),
			revealAtSeconds: heroLandmark === null ? null : revealOffset,
			palette: DISTRICT_PALETTES[district]
		};
		elapsedSeconds += durationSeconds;
		return node;
	});

	return {
		version: DISTRICT_GRAPH_VERSION,
		seed,
		modules,
		signature: routeHash(seed, modules)
	};
}

export function districtRouteSignature(route: Pick<DistrictRoute, 'seed' | 'modules'>): string {
	return routeHash(route.seed, route.modules);
}
