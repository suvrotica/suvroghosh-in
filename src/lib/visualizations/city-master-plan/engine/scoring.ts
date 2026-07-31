import type { CityAnalysis, CityScores, MunicipalPatch, ScoreComponent } from './types';

export function scoreCity(analysis: CityAnalysis, patches: readonly MunicipalPatch[]): CityScores {
	const drainageQuality = analysis.drainage.missing
		? 0
		: clamp01(
				analysis.drainage.connectedToOutlet / Math.max(1, analysis.drainage.segmentCount) -
					analysis.drainage.uphill / Math.max(1, analysis.drainage.segmentCount) -
					analysis.drainage.broken / Math.max(1, analysis.drainage.segmentCount)
			);
	const borderQuality =
		analysis.walkable.reachedBorderExits / Math.max(1, analysis.walkable.borderExits);
	const tramQuality =
		analysis.tram.segmentCount === 0
			? 1
			: analysis.tram.continuous
				? 1
				: clamp01(1 - analysis.tram.strandedSegments / Math.max(1, analysis.tram.segmentCount));
	const serviceReach =
		analysis.frontage.serviceCount === 0
			? 0.35
			: analysis.frontage.reachableServices / analysis.frontage.serviceCount;
	const serviceVariety =
		analysis.frontage.serviceVariety === 0
			? 0.35
			: analysis.frontage.reachableServiceVariety / analysis.frontage.serviceVariety;
	const openRatio =
		analysis.openSpaceCount /
		Math.max(1, analysis.openSpaceCount + analysis.frontage.occupiedCount);
	const openBalance = clamp01(1 - Math.abs(openRatio - 0.22) / 0.3);
	const treePresence = clamp01(analysis.treeCount / 12);

	const functionalComponents: ScoreComponent[] = [
		component(
			'connectivity',
			'Walkable network',
			30 * analysis.walkable.largestComponentRatio,
			30,
			`${percent(analysis.walkable.largestComponentRatio)} of walkable cells share the largest component.`
		),
		component(
			'frontage',
			'Occupied frontage',
			20 * analysis.frontage.accessibleRatio,
			20,
			`${analysis.frontage.accessibleCount} of ${analysis.frontage.occupiedCount} occupied parcels have visible access.`
		),
		component(
			'drainage',
			'Drainage',
			15 * drainageQuality,
			15,
			`${analysis.drainage.connectedToOutlet} of ${analysis.drainage.segmentCount} drain segments reach an outlet; ${analysis.drainage.uphill} rise.`
		),
		component(
			'routes',
			'Border and tram coherence',
			15 * (borderQuality * 0.65 + tramQuality * 0.35),
			15,
			`${analysis.walkable.reachedBorderExits} of ${analysis.walkable.borderExits} exits join the main network.`
		),
		component(
			'services',
			'Reachable service variety',
			10 * clamp01(serviceReach * 0.7 + serviceVariety * 0.3),
			10,
			`${analysis.frontage.reachableServices} of ${analysis.frontage.serviceCount} services face the main network, spanning ${analysis.frontage.reachableServiceVariety} of ${analysis.frontage.serviceVariety} present service families.`
		),
		component(
			'open-space',
			'Open-space balance',
			10 *
				clamp01(
					openBalance * 0.55 +
						Math.min(1, analysis.pondAccessPoints / 3) * 0.25 +
						treePresence * 0.2
				),
			10,
			`${analysis.treeCount} trees and ${analysis.pondAccessPoints} pond access points temper the occupied fabric.`
		)
	];
	const severePatches = patches.filter((patch) => patch.severity >= 7).length;
	const deductions = Math.min(
		28,
		analysis.frontage.isolatedCount * 1.15 +
			analysis.routeObstructions * 1.4 +
			severePatches * 1.8 +
			(analysis.walkable.reachedBorderExits === 0 ? 8 : 0)
	);
	functionalComponents.push({
		key: 'deductions',
		label: 'Visible deductions',
		value: -round1(deductions),
		maximum: 0,
		explanation: `${analysis.frontage.isolatedCount} isolated occupations, ${analysis.routeObstructions} route obstructions, and ${severePatches} severe exceptions.`
	});
	const functional = clampScore(functionalComponents.reduce((sum, item) => sum + item.value, 0));

	const familyCounts = new Map<string, { count: number; severity: number }>();
	for (const patch of patches) {
		const current = familyCounts.get(patch.anomalyType) ?? { count: 0, severity: 0 };
		current.count += 1;
		current.severity = Math.max(current.severity, patch.severity);
		familyCounts.set(patch.anomalyType, current);
	}
	let diminishedSeverity = 0;
	for (const family of familyCounts.values()) {
		diminishedSeverity += family.severity * (1 + Math.log1p(family.count - 1) * 0.35);
	}
	const utilityCollisions = patches.filter(
		(patch) =>
			patch.anomalyType === 'pole-through-verandah' ||
			patch.anomalyType === 'building-around-pillar'
	).length;
	const indoorRoutes = patches.filter(
		(patch) => patch.anomalyType === 'lane-through-bedroom'
	).length;
	const calamityComponents: ScoreComponent[] = [
		component(
			'exceptions',
			'Exception severity',
			35 * (1 - Math.exp(-diminishedSeverity / 22)),
			35,
			`${patches.length} exceptions contribute with diminishing returns inside each family.`
		),
		component(
			'diversity',
			'Exception diversity',
			20 * (1 - Math.exp(-analysis.exceptionDiversity / 3.2)),
			20,
			`${analysis.exceptionDiversity} distinct forms of retrospective permission appear.`
		),
		component(
			'obstruction',
			'Obstructed access',
			15 *
				clamp01(
					(analysis.routeObstructions + analysis.frontage.isolatedCount * 0.5) /
						Math.max(3, analysis.walkable.cellCount * 0.08)
				),
			15,
			`${analysis.routeObstructions} route obstructions and ${analysis.frontage.isolatedCount} isolated occupations.`
		),
		component(
			'drainage-trouble',
			'Drainage trouble',
			15 *
				clamp01(
					(analysis.drainage.uphill +
						analysis.drainage.broken +
						analysis.drainage.internallyTrapped * 0.35) /
						Math.max(2, analysis.drainage.segmentCount * 0.3)
				),
			15,
			`${analysis.drainage.uphill} uphill, ${analysis.drainage.broken} broken, and ${analysis.drainage.internallyTrapped} trapped segments.`
		),
		component(
			'transit',
			'Transit discontinuity',
			10 *
				(analysis.tram.segmentCount === 0
					? 0
					: clamp01(
							analysis.tram.strandedSegments / Math.max(1, analysis.tram.segmentCount * 0.35)
						)),
			10,
			`${analysis.tram.strandedSegments} of ${analysis.tram.segmentCount} tram segments are stranded.`
		),
		component(
			'collisions',
			'Utility and indoor-route collisions',
			5 * clamp01((utilityCollisions + indoorRoutes * 1.4) / 3),
			5,
			`${utilityCollisions} utility collisions and ${indoorRoutes} indoor route endings are recorded.`
		)
	];
	const calamity = clampScore(calamityComponents.reduce((sum, item) => sum + item.value, 0));
	return {
		functional,
		functionalLabel: functionalLabel(functional),
		calamity,
		calamityLabel: calamityLabel(calamity),
		functionalComponents,
		calamityComponents
	};
}

export function functionalLabel(score: number): string {
	if (score >= 85) return 'Suspiciously workable';
	if (score >= 70) return 'Functions after negotiation';
	if (score >= 50) return 'Usable with local knowledge';
	if (score >= 30) return 'Directions require a resident';
	return 'Access subject to oral tradition';
}

export function calamityLabel(score: number): string {
	if (score <= 15) return 'Planning office unusually alert';
	if (score <= 35) return 'Ordinary civic improvisation';
	if (score <= 60) return 'Retrospective permission likely';
	if (score <= 80) return 'Committee meeting unavoidable';
	return 'Municipal singularity';
}

function component(
	key: string,
	label: string,
	value: number,
	maximum: number,
	explanation: string
): ScoreComponent {
	return { key, label, value: round1(Math.max(0, Math.min(maximum, value))), maximum, explanation };
}

function percent(value: number): string {
	return `${Math.round(clamp01(value) * 100)}%`;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampScore(value: number): number {
	return Math.round(Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)));
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}
