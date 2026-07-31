import { SeededRandom } from '../../../utils/seeded-random';
import { hashCanonicalParts } from './hash';
import type {
	CityConfig,
	CityScores,
	CityTile,
	InfrastructureDetail,
	MunicipalPatch
} from './types';

const FIRST_WORDS = [
	'Monsoon',
	'Tram',
	'Moss',
	'Tin',
	'Mango',
	'Rain',
	'Balcony',
	'Pond',
	'Jute',
	'Banyan',
	'Lantern',
	'Sand'
] as const;
const SECOND_WORDS = [
	'Lane',
	'Para',
	'Row',
	'Bagan',
	'Crossing',
	'Quarter',
	'Yard',
	'Colony',
	'Bend'
] as const;

export function createCityFingerprint(
	config: CityConfig,
	fabric: readonly CityTile[],
	occupation: readonly CityTile[],
	infrastructure: readonly InfrastructureDetail[],
	patches: readonly MunicipalPatch[]
): string {
	const parts = [
		`version:${config.generatorVersion}`,
		`seed:${config.seed}`,
		`size:${config.size}`,
		`anchor:${config.anchor.id},${config.anchor.x},${config.anchor.y},${config.anchor.rotation}`,
		`settings:${config.civicPatience},${Number(config.minimumGuarantees)},${config.density},${config.landmarkFrequency},${config.anomalyAppetite},${config.tramPreference}`,
		...fabric.map((tile) => `f:${tile.prototypeId}@${tile.rotation}`),
		...occupation.map((tile) => `o:${tile.prototypeId}@${tile.rotation}`),
		...infrastructure.map(
			(detail) =>
				`i:${detail.kind}@${detail.cell.x},${detail.cell.y}:${detail.from ?? '-'}>${detail.to ?? '-'}:${Number(detail.uphill)}`
		),
		...patches.map(
			(patch) =>
				`p:${patch.anomalyType}@${patch.cell.x},${patch.cell.y}:${patch.severity}:${patch.renderVariant}`
		)
	];
	return hashCanonicalParts(parts);
}

export function createCityName(seed: string, fingerprint: string): string {
	const random = new SeededRandom(`${seed}/name/${fingerprint}`);
	const first = random.pick(FIRST_WORDS);
	let secondFirst = random.pick(FIRST_WORDS);
	if (secondFirst === first) {
		secondFirst = FIRST_WORDS[(FIRST_WORDS.indexOf(first) + 1) % FIRST_WORDS.length];
	}
	const ending = random.pick(SECOND_WORDS);
	const suffix = random.integer(10, 999);
	return `${first} ${secondFirst} ${ending} ${suffix}`;
}

export function createMunicipalReport(
	cityName: string,
	config: CityConfig,
	width: number,
	height: number,
	analysis: Parameters<typeof reportFacts>[0],
	scores: CityScores,
	patches: readonly MunicipalPatch[],
	fingerprint: string
): string {
	const facts = reportFacts(analysis);
	const notable = [...patches]
		.sort(
			(first, second) =>
				second.severity - first.severity ||
				first.cell.y - second.cell.y ||
				first.cell.x - second.cell.x
		)
		.slice(0, 2)
		.map((patch) => anomalyPhrase(patch.anomalyType));
	const sentences = [
		`${cityName} is a fictional ${width} × ${height} neighbourhood generated from seed “${config.seed}” with a ${anchorLabel(config.anchor.id)} anchor.`,
		`${facts.networkPercent}% of its walkable cells belong to the largest network, which reaches ${facts.reachedExits} of ${facts.borderExits} border exits.`,
		`${facts.frontagePercent}% of occupied buildings have frontage access.`,
		facts.drainCount === 0
			? 'No drain segments were admitted in this run.'
			: `${facts.outletDrains} of ${facts.drainCount} drain segments reach an outlet; ${facts.uphillDrains} run uphill.`,
		`${patches.length} municipal ${patches.length === 1 ? 'exception was' : 'exceptions were'} regularised during construction${notable.length > 0 ? `, including ${joinPhrases(notable)}` : ''}.`,
		`Function: ${scores.functional}/100 (${scores.functionalLabel}). Calamity: ${scores.calamity}/100 (${scores.calamityLabel}).`,
		`Generator v${config.generatorVersion}; fingerprint ${fingerprint}.`
	];
	return sentences.join(' ');
}

function reportFacts(analysis: {
	walkable: {
		largestComponentRatio: number;
		reachedBorderExits: number;
		borderExits: number;
	};
	frontage: { accessibleRatio: number };
	drainage: { segmentCount: number; connectedToOutlet: number; uphill: number };
}) {
	return {
		networkPercent: Math.round(analysis.walkable.largestComponentRatio * 100),
		reachedExits: analysis.walkable.reachedBorderExits,
		borderExits: analysis.walkable.borderExits,
		frontagePercent: Math.round(analysis.frontage.accessibleRatio * 100),
		drainCount: analysis.drainage.segmentCount,
		outletDrains: analysis.drainage.connectedToOutlet,
		uphillDrains: analysis.drainage.uphill
	};
}

function anchorLabel(id: CityConfig['anchor']['id']): string {
	return id.replaceAll('-', ' ');
}

function anomalyPhrase(type: MunicipalPatch['anomalyType']): string {
	const phrases: Record<MunicipalPatch['anomalyType'], string> = {
		'balcony-over-lane': 'a balcony regularised over a lane',
		'lane-through-bedroom': 'a lane with an indoor section',
		'pole-through-verandah': 'a pole continuing through a verandah',
		'uphill-drain': 'an aspirational drainage gradient',
		'tram-through-garage': 'tram rails entering a garage',
		'pond-lane-bridge': 'a bamboo pond crossing',
		'permanent-sand-occupation': 'a temporary permanent sand occupation',
		'building-around-pillar': 'a room adjusted around a pillar',
		'construction-tarpaulin': 'a tarpaulin-mediated local arrangement'
	};
	return phrases[type];
}

function joinPhrases(values: readonly string[]): string {
	if (values.length <= 1) return values[0] ?? '';
	return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}
