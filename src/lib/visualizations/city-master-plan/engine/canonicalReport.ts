import type { CityResult } from './types';

/**
 * Checked facts rendered when scripting is unavailable. Keep this literal rather than generating a
 * 24 × 18 city during SSR; the sibling regression test prevents it from drifting.
 */
export const CANONICAL_CITY_REPORT = {
	generatorVersion: 1,
	seed: 'monsoon-tram-184',
	cityName: 'Jute Sand Para 274',
	fingerprint: '9F16-B94E',
	functional: 66,
	calamity: 34,
	walkableCells: 296,
	walkableComponents: 3,
	largestWalkableComponent: 288,
	borderExits: 3,
	reachedBorderExits: 3,
	deadEnds: 2,
	occupied: 204,
	accessible: 196,
	reachableServices: 123,
	serviceCount: 148,
	reachableServiceVariety: 3,
	serviceVariety: 3,
	drainSegments: 121,
	outletConnectedDrains: 121,
	trappedDrains: 0,
	brokenDrains: 0,
	uphillDrains: 3,
	trees: 29,
	openSpaceCells: 61,
	pondAccessPoints: 0,
	routeObstructions: 13,
	occupiedDensity: 0.4722222222222222,
	exceptions: [
		{ type: 'lane-through-bedroom', column: 1, row: 2, severity: 7 },
		{ type: 'lane-through-bedroom', column: 6, row: 5, severity: 7 }
	]
} as const;

export function canonicalReportSnapshot(result: CityResult) {
	return {
		generatorVersion: result.generatorVersion,
		seed: result.seed,
		cityName: result.cityName,
		fingerprint: result.fingerprint,
		functional: result.scores.functional,
		calamity: result.scores.calamity,
		walkableCells: result.analysis.walkable.cellCount,
		walkableComponents: result.analysis.walkable.componentCount,
		largestWalkableComponent: result.analysis.walkable.largestComponent,
		borderExits: result.analysis.walkable.borderExits,
		reachedBorderExits: result.analysis.walkable.reachedBorderExits,
		deadEnds: result.analysis.walkable.deadEnds,
		occupied: result.analysis.frontage.occupiedCount,
		accessible: result.analysis.frontage.accessibleCount,
		reachableServices: result.analysis.frontage.reachableServices,
		serviceCount: result.analysis.frontage.serviceCount,
		reachableServiceVariety: result.analysis.frontage.reachableServiceVariety,
		serviceVariety: result.analysis.frontage.serviceVariety,
		drainSegments: result.analysis.drainage.segmentCount,
		outletConnectedDrains: result.analysis.drainage.connectedToOutlet,
		trappedDrains: result.analysis.drainage.internallyTrapped,
		brokenDrains: result.analysis.drainage.broken,
		uphillDrains: result.analysis.drainage.uphill,
		trees: result.analysis.treeCount,
		openSpaceCells: result.analysis.openSpaceCount,
		pondAccessPoints: result.analysis.pondAccessPoints,
		routeObstructions: result.analysis.routeObstructions,
		occupiedDensity: result.analysis.occupiedDensity,
		exceptions: result.municipalPatches.map((patch) => ({
			type: patch.anomalyType,
			column: patch.cell.x + 1,
			row: patch.cell.y + 1,
			severity: patch.severity
		}))
	};
}
