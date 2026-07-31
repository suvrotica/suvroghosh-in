import { describe, expect, it } from 'vitest';
import { ANCHORS } from './anchors';
import { createFabricCatalog, createOccupationCatalog } from './catalog';
import {
	CITY_GRID_PRESETS,
	CIVIC_PATIENCE_BUDGETS,
	DEFAULT_CITY_CONFIG,
	HARD_STEP_MULTIPLIER
} from './constants';
import { explainEdgeCompatibility } from './compatibility';
import { neighbourIndex, oppositeDirection } from './directions';
import { generateCity } from './generator';
import type {
	AnomalyAppetite,
	BuildingDensity,
	CityConfig,
	CityPass,
	CityResult,
	CitySizePreset,
	CityTile,
	CivicPatience,
	GenerationEvent,
	LandmarkFrequency,
	TileVariant,
	TramPreference
} from './types';

const STANDARD_RUN_COUNT = 320;
const TIMING_SAMPLE_SEEDS = [
	'profile-burrabazar-17',
	'profile-entally-29',
	'profile-gariahat-43',
	'profile-kidderpore-61',
	'profile-maniktala-73',
	'profile-shyambazar-89',
	'profile-tollygunge-101'
] as const;

const PATIENCE: readonly CivicPatience[] = ['patient', 'familiar', 'impulsive', 'none'];
const DENSITIES: readonly BuildingDensity[] = ['open', 'balanced', 'dense'];
const LANDMARK_FREQUENCIES: readonly LandmarkFrequency[] = ['scarce', 'balanced', 'frequent'];
const ANOMALY_APPETITES: readonly AnomalyAppetite[] = ['restrained', 'balanced', 'enthusiastic'];
const TRAM_PREFERENCES: readonly TramPreference[] = ['ordinary', 'high'];

describe('city-master-plan opt-in stress and performance harness', () => {
	it('resolves 320 varied standard-grid generations inside finite hard budgets', () => {
		const coverage = {
			patience: new Set<CivicPatience>(),
			density: new Set<BuildingDensity>(),
			landmarks: new Set<LandmarkFrequency>(),
			anomalies: new Set<AnomalyAppetite>(),
			tram: new Set<TramPreference>(),
			guarantees: new Set<boolean>(),
			anchors: new Set<string>()
		};
		let observedContradictions = 0;
		let observedPatches = 0;

		for (let index = 0; index < STANDARD_RUN_COUNT; index += 1) {
			const config = stressConfig(index);
			const context = `seed=${config.seed}`;
			const result = generateCity(config);

			assertResolvedCity(result, context);
			observedContradictions += result.statistics.contradictions;
			observedPatches += result.municipalPatches.length;
			coverage.patience.add(config.civicPatience);
			coverage.density.add(config.density);
			coverage.landmarks.add(config.landmarkFrequency);
			coverage.anomalies.add(config.anomalyAppetite);
			coverage.tram.add(config.tramPreference);
			coverage.guarantees.add(config.minimumGuarantees);
			coverage.anchors.add(config.anchor.id);
		}

		expect(STANDARD_RUN_COUNT).toBeGreaterThanOrEqual(300);
		expect(coverage.patience).toEqual(new Set(PATIENCE));
		expect(coverage.density).toEqual(new Set(DENSITIES));
		expect(coverage.landmarks).toEqual(new Set(LANDMARK_FREQUENCIES));
		expect(coverage.anomalies).toEqual(new Set(ANOMALY_APPETITES));
		expect(coverage.tram).toEqual(new Set(TRAM_PREFERENCES));
		expect(coverage.guarantees).toEqual(new Set([false, true]));
		expect(coverage.anchors).toEqual(new Set(ANCHORS.map((anchor) => anchor.id)));
		expect(observedContradictions).toBeGreaterThan(0);
		expect(observedPatches).toBeGreaterThan(0);
	}, 300_000);

	it('prints warmed Small, Standard, and Large fixed-seed timing summaries', () => {
		const rows = (['small', 'standard', 'large'] as const).map((size) => measureSize(size));

		console.log('\n[city-master-plan] warmed engine timing summary (deliberate reveal excluded)');
		console.table(rows);

		for (const row of rows) {
			invariant(row.samples === TIMING_SAMPLE_SEEDS.length, `${row.grid}: incomplete samples`);
			invariant(Number.isFinite(row.meanMs), `${row.grid}: non-finite mean timing`);
			invariant(row.minimumMs >= 0, `${row.grid}: negative timing`);
			invariant(row.maximumMs < 10_000, `${row.grid}: exceeded 10 s safety ceiling`);
		}
		const standard = rows.find((row) => row.grid === 'Standard');
		invariant(standard !== undefined, 'Standard timing row is missing');
		expect(standard.p95Ms).toBeLessThan(1_000);
	}, 300_000);
});

function stressConfig(index: number): CityConfig {
	const anchor = ANCHORS[(index * 7 + Math.floor(index / ANCHORS.length)) % ANCHORS.length];
	const rotation = anchor.rotations[index % anchor.rotations.length];
	const civicPatience = PATIENCE[index % PATIENCE.length];
	return {
		generatorVersion: 1,
		seed: `stress-standard-${index.toString().padStart(4, '0')}-${civicPatience}`,
		size: 'standard',
		anchor: {
			id: anchor.id,
			x: 1 + ((index * 5) % 21),
			y: 1 + ((index * 7) % 14),
			rotation
		},
		civicPatience,
		minimumGuarantees: Math.floor(index / PATIENCE.length) % 2 === 1,
		density: DENSITIES[Math.floor(index / 4) % DENSITIES.length],
		landmarkFrequency: LANDMARK_FREQUENCIES[Math.floor(index / 12) % LANDMARK_FREQUENCIES.length],
		anomalyAppetite: ANOMALY_APPETITES[Math.floor(index / 36) % ANOMALY_APPETITES.length],
		tramPreference: TRAM_PREFERENCES[Math.floor(index / 108) % TRAM_PREFERENCES.length]
	};
}

function assertResolvedCity(result: CityResult, context: string): void {
	const cellCount = result.width * result.height;
	const expectedDimensions = CITY_GRID_PRESETS.standard;
	invariant(result.width === expectedDimensions.width, `${context}: unexpected width`);
	invariant(result.height === expectedDimensions.height, `${context}: unexpected height`);
	invariant(result.fabricTiles.length === cellCount, `${context}: incomplete fabric grid`);
	invariant(result.occupationTiles.length === cellCount, `${context}: incomplete occupation grid`);
	invariant(result.elevation.length === cellCount, `${context}: incomplete elevation grid`);
	invariant(
		result.statistics.hardStepBudget === cellCount * HARD_STEP_MULTIPLIER * 2,
		`${context}: incorrect declared hard-step budget`
	);
	invariant(
		result.statistics.steps <= result.statistics.hardStepBudget + cellCount * 2,
		`${context}: hard-step budget plus bounded repair allowance exceeded`
	);
	invariant(
		result.statistics.fabricSteps <= result.statistics.hardStepBudget / 2 + cellCount,
		`${context}: fabric pass exceeded its bounded repair allowance`
	);
	invariant(
		result.statistics.occupationSteps <= result.statistics.hardStepBudget / 2 + cellCount,
		`${context}: occupation pass exceeded its bounded repair allowance`
	);
	invariant(
		result.statistics.steps === result.statistics.fabricSteps + result.statistics.occupationSteps,
		`${context}: inconsistent step accounting`
	);
	invariant(
		result.statistics.backtracks <= CIVIC_PATIENCE_BUDGETS[result.config.civicPatience] * 2,
		`${context}: civic-patience backtrack budget exceeded`
	);
	invariant(
		result.statistics.propagatedCells <=
			cellCount * 2 +
				result.statistics.steps +
				result.statistics.backtracks +
				result.statistics.removedCandidates,
		`${context}: propagation queue exceeded its finite removal bound`
	);

	const fabricCatalog = createFabricCatalog(result.config);
	const occupationCatalog = createOccupationCatalog(result.config);
	assertTileGrid(result.fabricTiles, fabricCatalog, result, 'fabric', context);
	assertTileGrid(result.occupationTiles, occupationCatalog, result, 'occupation', context);
	assertInfrastructure(result, context);
	assertEventsResolved(result.events, fabricCatalog, occupationCatalog, context);
	assertFiniteTree(result.analysis, `${context}: analysis`);
	assertFiniteTree(result.scores, `${context}: scores`);
	assertFiniteTree(result.statistics, `${context}: statistics`);
	assertFiniteTree(result.timing, `${context}: timing`);

	invariant(
		Number.isFinite(result.scores.functional) &&
			result.scores.functional >= 0 &&
			result.scores.functional <= 100,
		`${context}: invalid functional score`
	);
	invariant(
		Number.isFinite(result.scores.calamity) &&
			result.scores.calamity >= 0 &&
			result.scores.calamity <= 100,
		`${context}: invalid calamity score`
	);
	invariant(result.fingerprint.length > 0, `${context}: missing fingerprint`);
	invariant(result.events.at(-1)?.type === 'complete', `${context}: generation did not complete`);
}

function assertTileGrid(
	tiles: readonly CityTile[],
	catalog: readonly TileVariant[],
	result: CityResult,
	pass: CityPass,
	context: string
): void {
	const variants = new Map(catalog.map((variant) => [variant.id, variant]));
	const patchByIndex = new Map(
		result.municipalPatches
			.filter((patch) => patch.pass === pass)
			.map((patch) => [patch.cell.y * result.width + patch.cell.x, patch])
	);
	const patched = new Set(patchByIndex.keys());
	invariant(
		patchByIndex.size === result.municipalPatches.filter((patch) => patch.pass === pass).length,
		`${context}: duplicate ${pass} patches occupy one cell`
	);
	for (const [index, patch] of patchByIndex) {
		invariant(
			patch.demandedEdges.length === 4 && patch.selectedEdges.length === 4,
			`${context}: ${pass} patch ${index} has incomplete exterior sockets`
		);
	}

	for (let index = 0; index < tiles.length; index += 1) {
		const tile = tiles[index];
		const variant = variants.get(tile.id);
		invariant(variant !== undefined, `${context}: ${pass} tile ${index} has invalid variant id`);
		invariant(
			tile.prototypeId === variant.prototypeId &&
				tile.rotation === variant.rotation &&
				tile.renderer === variant.renderer,
			`${context}: ${pass} tile ${index} does not match its catalogue variant`
		);
		invariant(
			JSON.stringify(tile.edges) === JSON.stringify(variant.edges),
			`${context}: ${pass} tile ${index} has invalid sockets`
		);

		if (pass === 'occupation' && !patched.has(index) && variant.allowedSubstrates !== undefined) {
			invariant(
				variant.allowedSubstrates.some((tag) => result.fabricTiles[index].tags.includes(tag)),
				`${context}: occupation tile ${index} has an invalid substrate`
			);
		}

		for (const direction of [1, 2] as const) {
			const neighbour = neighbourIndex(index, direction, result.width, result.height);
			if (neighbour < 0) continue;
			const firstEdges = patchByIndex.get(index)?.selectedEdges ?? tile.edges;
			const secondEdges = patchByIndex.get(neighbour)?.selectedEdges ?? tiles[neighbour].edges;
			const compatible = explainEdgeCompatibility(
				firstEdges[direction],
				secondEdges[oppositeDirection(direction)],
				direction
			).compatible;
			invariant(
				compatible,
				`${context}: unresolved ${pass} exterior socket contradiction at ${index}/${neighbour}`
			);
		}
	}
}

function assertInfrastructure(result: CityResult, context: string): void {
	const cellCount = result.width * result.height;
	for (const [index, elevation] of result.elevation.entries()) {
		invariant(Number.isFinite(elevation), `${context}: non-finite elevation at ${index}`);
	}
	for (const detail of result.infrastructure) {
		const index = detail.cell.y * result.width + detail.cell.x;
		invariant(
			detail.cell.x >= 0 &&
				detail.cell.x < result.width &&
				detail.cell.y >= 0 &&
				detail.cell.y < result.height &&
				index >= 0 &&
				index < cellCount,
			`${context}: infrastructure ${detail.id} is outside the grid`
		);
	}
	for (const patch of result.municipalPatches) {
		invariant(
			patch.cell.x >= 0 &&
				patch.cell.x < result.width &&
				patch.cell.y >= 0 &&
				patch.cell.y < result.height,
			`${context}: patch ${patch.id} is outside the grid`
		);
		invariant(
			Number.isFinite(patch.severity) && patch.severity >= 0,
			`${context}: patch ${patch.id} has invalid severity`
		);
	}
	for (const portal of result.portals) {
		const onBoundary =
			portal.x === 0 ||
			portal.y === 0 ||
			portal.x === result.width - 1 ||
			portal.y === result.height - 1;
		invariant(onBoundary, `${context}: portal is not on the boundary`);
		invariant(
			(['lane', 'road', 'tram'] as readonly string[]).includes(portal.passage),
			`${context}: bad portal`
		);
	}
}

function assertEventsResolved(
	events: readonly GenerationEvent[],
	fabricCatalog: readonly TileVariant[],
	occupationCatalog: readonly TileVariant[],
	context: string
): void {
	const catalogIds = {
		fabric: new Set(fabricCatalog.map((variant) => variant.id)),
		occupation: new Set(occupationCatalog.map((variant) => variant.id))
	};

	for (let index = 0; index < events.length; index += 1) {
		const event = events[index];
		invariant(
			Number.isFinite(event.progress) && event.progress >= 0 && event.progress <= 1,
			`${context}: event ${index} has invalid progress`
		);
		if (event.type === 'observe') {
			invariant(
				Number.isFinite(event.entropy) && event.entropy >= 0,
				`${context}: observe event ${index} has NaN/infinite entropy`
			);
			invariant(
				Number.isSafeInteger(event.candidateCount) && event.candidateCount > 0,
				`${context}: observe event ${index} has an invalid candidate count`
			);
			invariant(
				catalogIds[event.pass].has(event.chosenVariantId),
				`${context}: observe event ${index} chose an invalid tile index/id`
			);
			invariant(
				Number.isFinite(event.chosenWeight) && event.chosenWeight > 0,
				`${context}: observe event ${index} has an invalid selected weight`
			);
			invariant(
				event.candidateFamilies.length > 0,
				`${context}: observe event ${index} has no candidate-family trace`
			);
		}
		if (event.type !== 'contradiction') continue;
		const resolution = events.slice(index + 1).find((candidate) => {
			if (candidate.type === 'backtrack' && candidate.pass === event.pass) {
				return true;
			}
			return candidate.type === 'patch' && candidate.pass === event.pass;
		});
		invariant(
			resolution !== undefined,
			`${context}: contradiction event ${index} has no backtrack or patch`
		);
		const interveningTerminal = events
			.slice(index + 1, events.indexOf(resolution))
			.find(
				(candidate) =>
					candidate.type === 'observe' ||
					candidate.type === 'contradiction' ||
					candidate.type === 'complete' ||
					candidate.type === 'phase'
			);
		invariant(
			interveningTerminal === undefined,
			`${context}: contradiction event ${index} remained unresolved`
		);
	}
}

function assertFiniteTree(value: unknown, path: string): void {
	if (typeof value === 'number') {
		invariant(Number.isFinite(value), `${path}: non-finite number`);
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) => assertFiniteTree(entry, `${path}[${index}]`));
		return;
	}
	if (value === null || typeof value !== 'object') return;
	for (const [key, entry] of Object.entries(value)) {
		assertFiniteTree(entry, `${path}.${key}`);
	}
}

function measureSize(size: CitySizePreset) {
	generateCity(timingConfig(size, `warmup-${size}`));
	const samples = TIMING_SAMPLE_SEEDS.map(
		(seed) => generateCity(timingConfig(size, seed)).timing.totalMs
	).sort((first, second) => first - second);
	const dimensions = CITY_GRID_PRESETS[size];
	return {
		grid: titleCase(size),
		cells: dimensions.width * dimensions.height,
		samples: samples.length,
		minimumMs: round(samples[0]),
		medianMs: round(percentile(samples, 0.5)),
		p95Ms: round(percentile(samples, 0.95)),
		maximumMs: round(samples.at(-1) ?? 0),
		meanMs: round(samples.reduce((total, sample) => total + sample, 0) / samples.length)
	};
}

function timingConfig(size: CitySizePreset, seed: string): CityConfig {
	const dimensions = CITY_GRID_PRESETS[size];
	return {
		...DEFAULT_CITY_CONFIG,
		seed,
		size,
		anchor: {
			...DEFAULT_CITY_CONFIG.anchor,
			x: Math.floor(dimensions.width / 2),
			y: Math.floor(dimensions.height / 2)
		}
	};
}

function percentile(sorted: readonly number[], quantile: number): number {
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
	return sorted[index];
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function titleCase(value: string): string {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function invariant(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
