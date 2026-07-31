import { BitSet } from './bitset';
import { oppositeDirection } from './directions';
import type {
	CompatibilityExplanation,
	Direction,
	DrainEdge,
	EdgeSignature,
	Passage,
	TileVariant,
	WaterEdge
} from './types';

export type DirectionalCompatibility = readonly [
	readonly BitSet[],
	readonly BitSet[],
	readonly BitSet[],
	readonly BitSet[]
];

export function explainEdgeCompatibility(
	first: EdgeSignature,
	second: EdgeSignature,
	direction: Direction
): CompatibilityExplanation {
	const reasons: string[] = [];
	const passage = passagesCompatible(first.passage, second.passage);
	const water = waterEdgesCompatible(first.water, second.water);
	const drain = drainsCompatible(first.drain, second.drain);
	const face = facesCompatible(first.face, second.face);
	const clearance = clearancesCompatible(first, second);

	reasons.push(
		passage
			? `Passages ${first.passage} and ${second.passage} can meet.`
			: `Passage ${first.passage} cannot continue into ${second.passage}.`
	);
	reasons.push(
		water
			? `Water edges ${first.water} and ${second.water} form an allowed shoreline relation.`
			: `Water edge ${first.water} cannot meet ${second.water}.`
	);
	reasons.push(
		drain
			? `Drain edges ${first.drain} and ${second.drain} agree.`
			: `Drain ${first.drain} cannot terminate at ${second.drain}.`
	);
	reasons.push(
		face
			? `Faces ${first.face} and ${second.face} may face each other.`
			: `Face ${first.face} is blocked by ${second.face}.`
	);
	if (!clearance) {
		reasons.push(
			`The edge clearances ${first.clearance} and ${second.clearance} differ too much for this passage.`
		);
	}

	return {
		compatible: passage && water && drain && face && clearance,
		direction,
		reasons
	};
}

export function areVariantsCompatible(
	first: TileVariant,
	second: TileVariant,
	directionFromFirst: Direction
): boolean {
	return explainVariantCompatibility(first, second, directionFromFirst).compatible;
}

export function explainVariantCompatibility(
	first: TileVariant,
	second: TileVariant,
	directionFromFirst: Direction
): CompatibilityExplanation {
	return explainEdgeCompatibility(
		first.edges[directionFromFirst],
		second.edges[oppositeDirection(directionFromFirst)],
		directionFromFirst
	);
}

export function buildCompatibilityMasks(
	variants: readonly TileVariant[]
): DirectionalCompatibility {
	const result: BitSet[][] = Array.from({ length: 4 }, () =>
		Array.from({ length: variants.length }, () => new BitSet(variants.length))
	);
	for (let direction = 0; direction < 4; direction += 1) {
		for (const first of variants) {
			const mask = result[direction][first.index];
			for (const second of variants) {
				if (areVariantsCompatible(first, second, direction as Direction)) {
					mask.add(second.index);
				}
			}
		}
	}
	return result as unknown as DirectionalCompatibility;
}

export function unionCompatibleMasks(
	candidates: BitSet,
	direction: Direction,
	compatibility: DirectionalCompatibility
): BitSet {
	const size = compatibility[direction].length;
	const allowed = new BitSet(size);
	for (const variant of candidates.values()) {
		allowed.union(compatibility[direction][variant]);
	}
	return allowed;
}

function passagesCompatible(first: Passage, second: Passage): boolean {
	if (first === 'closed' || second === 'closed') return first === second;
	if (first === 'tram' || second === 'tram') return first === second;
	if (first === second) return true;
	if ((first === 'road' && second === 'lane') || (first === 'lane' && second === 'road')) {
		return true;
	}
	return (first === 'foot' && second === 'lane') || (first === 'lane' && second === 'foot');
}

function waterEdgesCompatible(first: WaterEdge, second: WaterEdge): boolean {
	if (first === 'bank' || second === 'bank') return true;
	return first === second;
}

function drainsCompatible(first: DrainEdge, second: DrainEdge): boolean {
	if (first === 'none' || second === 'none') return first === second;
	return true;
}

function facesCompatible(first: EdgeSignature['face'], second: EdgeSignature['face']): boolean {
	if (first === 'neutral' || second === 'neutral') return true;
	if (first === 'wall' || second === 'wall') return first === second;
	return false;
}

function clearancesCompatible(first: EdgeSignature, second: EdgeSignature): boolean {
	if (first.passage === 'closed' && second.passage === 'closed') return true;
	return Math.abs(first.clearance - second.clearance) <= 1;
}
