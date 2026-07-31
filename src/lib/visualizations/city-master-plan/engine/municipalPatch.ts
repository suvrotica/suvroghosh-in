import { SeededRandom } from '../../../utils/seeded-random';
import { DEFAULT_EDGE } from './constants';
import { hashParts32 } from './hash';
import type { AnomalyType, CityPass, EdgeSignature, MunicipalPatch } from './types';

export interface MunicipalPatchInput {
	seed: string;
	cell: { x: number; y: number };
	pass: CityPass;
	demandedEdges?: readonly EdgeSignature[];
	conflictTags?: readonly string[];
	previousPatches?: readonly MunicipalPatch[];
}

interface AnomalyDefinition {
	type: AnomalyType;
	severity: number;
	violatedRules: readonly string[];
	narrativeKey: string;
	renderVariant: string;
}

const ANOMALIES: Readonly<Record<AnomalyType, AnomalyDefinition>> = {
	'balcony-over-lane': {
		type: 'balcony-over-lane',
		severity: 5,
		violatedRules: ['Setback and passage-clearance requirements overlap.'],
		narrativeKey: 'balcony-regularised',
		renderVariant: 'illegal-balcony'
	},
	'lane-through-bedroom': {
		type: 'lane-through-bedroom',
		severity: 7,
		violatedRules: ['Public route continuity conflicts with residential enclosure.'],
		narrativeKey: 'lane-indoor-section',
		renderVariant: 'bedroom-lane'
	},
	'pole-through-verandah': {
		type: 'pole-through-verandah',
		severity: 6,
		violatedRules: ['Utility clearance intersects occupied verandah space.'],
		narrativeKey: 'pole-arrived-first',
		renderVariant: 'verandah-pole'
	},
	'uphill-drain': {
		type: 'uphill-drain',
		severity: 5,
		violatedRules: ['Drain direction rises against the seeded elevation gradient.'],
		narrativeKey: 'gradient-aspirational',
		renderVariant: 'uphill-drain'
	},
	'tram-through-garage': {
		type: 'tram-through-garage',
		severity: 8,
		violatedRules: ['Transit and garage clearances occupy the same corridor.'],
		narrativeKey: 'tram-making-representations',
		renderVariant: 'garage-tram'
	},
	'pond-lane-bridge': {
		type: 'pond-lane-bridge',
		severity: 2,
		violatedRules: ['Pedestrian continuity crosses pond interior without a formal structure.'],
		narrativeKey: 'bamboo-precedent',
		renderVariant: 'bamboo-bridge'
	},
	'permanent-sand-occupation': {
		type: 'permanent-sand-occupation',
		severity: 4,
		violatedRules: ['Construction material reduces the required passage width.'],
		narrativeKey: 'temporary-thirty-seventh-season',
		renderVariant: 'sand-detour'
	},
	'building-around-pillar': {
		type: 'building-around-pillar',
		severity: 6,
		violatedRules: ['A structure footprint encloses reserved pillar clearance.'],
		narrativeKey: 'pillar-retained',
		renderVariant: 'pillar-room'
	},
	'construction-tarpaulin': {
		type: 'construction-tarpaulin',
		severity: 3,
		violatedRules: ['No ordinary catalogue tile embodies all exterior demands.'],
		narrativeKey: 'temporary-arrangement',
		renderVariant: 'tarpaulin-adapter'
	}
};

export const MUNICIPAL_STATUS_MESSAGES: Readonly<Record<string, string>> = {
	'balcony-regularised': 'Balcony regularised after construction.',
	'lane-indoor-section': 'The lane has acquired an indoor section.',
	'pole-arrived-first': 'Electrical clearance waived because the pole arrived first.',
	'gradient-aspirational': 'Drainage gradient reclassified as aspirational.',
	'tram-making-representations': 'The tram line reaches a garage and is making representations.',
	'bamboo-precedent': 'A bamboo crossing has been entered as local precedent.',
	'temporary-thirty-seventh-season':
		'Sand remains temporary for the thirty-seventh consecutive season.',
	'pillar-retained': 'The pillar has been retained; the room has adjusted its expectations.',
	'temporary-arrangement': 'A temporary arrangement has been approved pending a permanent delay.'
};

export function synthesizeMunicipalPatch(input: MunicipalPatchInput): MunicipalPatch {
	const demanded = normaliseDemands(input.demandedEdges);
	const tags = new Set(input.conflictTags ?? []);
	const candidates = anomalyCandidates(demanded, tags, input.pass);
	const previousCounts = new Map<AnomalyType, number>();
	for (const patch of input.previousPatches ?? []) {
		previousCounts.set(patch.anomalyType, (previousCounts.get(patch.anomalyType) ?? 0) + 1);
	}
	const random = new SeededRandom(
		`${input.seed}/repair/${input.pass}/${input.cell.x}/${input.cell.y}`
	);
	const chosen = chooseVariedAnomaly(candidates, previousCounts, random);
	const definition = ANOMALIES[chosen];
	const suffix = hashParts32(input.seed, input.pass, input.cell.x, input.cell.y, chosen)
		.toString(16)
		.padStart(8, '0')
		.slice(0, 6);
	return {
		id: `patch-${input.pass}-${input.cell.x}-${input.cell.y}-${suffix}`,
		cell: { ...input.cell },
		pass: input.pass,
		demandedEdges: demanded,
		selectedEdges: demanded.map((signature) => ({ ...signature })),
		anomalyType: chosen,
		severity: definition.severity,
		violatedRules: definition.violatedRules,
		narrativeKey: definition.narrativeKey,
		renderVariant: definition.renderVariant
	};
}

export function municipalMessage(patch: MunicipalPatch): string {
	return (
		MUNICIPAL_STATUS_MESSAGES[patch.narrativeKey] ??
		'Local precedent has been applied to an incompatible set of requirements.'
	);
}

function normaliseDemands(demands: readonly EdgeSignature[] | undefined): readonly EdgeSignature[] {
	return Array.from({ length: 4 }, (_, index) => ({
		...DEFAULT_EDGE,
		...(demands?.[index] ?? {})
	}));
}

function anomalyCandidates(
	demands: readonly EdgeSignature[],
	tags: ReadonlySet<string>,
	pass: CityPass
): readonly AnomalyType[] {
	const hasPassage = demands.some((edge) => edge.passage !== 'closed');
	const hasLane = demands.some((edge) => edge.passage === 'lane' || edge.passage === 'road');
	const hasTram = demands.some((edge) => edge.passage === 'tram') || tags.has('tram');
	const hasPond = demands.some((edge) => edge.water !== 'dry') || tags.has('pond');
	const hasDrain = demands.some((edge) => edge.drain !== 'none') || tags.has('drain');
	const candidates: AnomalyType[] = [];

	if (hasTram && tags.has('garage')) candidates.push('tram-through-garage');
	if (hasPond && hasPassage) candidates.push('pond-lane-bridge');
	if ((tags.has('utility') || tags.has('electric-pole')) && tags.has('verandah')) {
		candidates.push('pole-through-verandah');
	}
	if ((tags.has('uphill') || tags.has('elevation-conflict')) && hasDrain) {
		candidates.push('uphill-drain');
	}
	if (tags.has('sand') && hasPassage) candidates.push('permanent-sand-occupation');
	if (tags.has('pillar') && (tags.has('building') || tags.has('occupied'))) {
		candidates.push('building-around-pillar');
	}
	if ((tags.has('balcony') || tags.has('structure-mass')) && hasLane) {
		candidates.push('balcony-over-lane');
	}
	if ((tags.has('house') || tags.has('bedroom') || tags.has('residential')) && hasPassage) {
		candidates.push('lane-through-bedroom');
	}

	if (candidates.length === 0 && pass === 'infrastructure' && hasDrain) {
		candidates.push('uphill-drain');
	}
	if (candidates.length === 0 && hasPond && hasPassage) candidates.push('pond-lane-bridge');
	if (candidates.length === 0 && hasLane && pass === 'occupation') {
		candidates.push('balcony-over-lane', 'lane-through-bedroom');
	}
	if (candidates.length === 0) candidates.push('construction-tarpaulin');
	return candidates;
}

function chooseVariedAnomaly(
	candidates: readonly AnomalyType[],
	previousCounts: ReadonlyMap<AnomalyType, number>,
	random: SeededRandom
): AnomalyType {
	const unique = [...new Set(candidates)];
	let total = 0;
	const weighted = unique.map((type, index) => {
		const specificity =
			type === 'construction-tarpaulin' ? 0.12 : 1 + (unique.length - index) * 0.08;
		const repetitionPenalty = 1 / (1 + (previousCounts.get(type) ?? 0) * 1.8);
		const weight = specificity * repetitionPenalty;
		total += weight;
		return { type, weight };
	});
	let target = random.next() * total;
	for (const item of weighted) {
		target -= item.weight;
		if (target <= 0) return item.type;
	}
	return weighted[weighted.length - 1].type;
}
