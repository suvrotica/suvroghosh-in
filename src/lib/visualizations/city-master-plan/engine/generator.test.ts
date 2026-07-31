import { describe, expect, it } from 'vitest';
import { ANCHORS } from './anchors';
import { explainEdgeCompatibility } from './compatibility';
import { DEFAULT_CITY_CONFIG } from './constants';
import { neighbourIndex, oppositeDirection } from './directions';
import { createCityExport } from './export';
import { generateCity } from './generator';
import { scoreCity } from './scoring';
import { parseCityConfig, serializeCityConfig } from './serialize';
import type { CityAnalysis, CityConfig, MunicipalPatch } from './types';

function config(overrides: Partial<CityConfig> = {}): CityConfig {
	return {
		...DEFAULT_CITY_CONFIG,
		...overrides,
		anchor: { ...DEFAULT_CITY_CONFIG.anchor, ...overrides.anchor }
	};
}

function topology(result: ReturnType<typeof generateCity>) {
	return {
		fabric: result.fabricTiles.map((tile) => [tile.prototypeId, tile.rotation]),
		occupation: result.occupationTiles.map((tile) => [tile.prototypeId, tile.rotation]),
		infrastructure: result.infrastructure,
		patches: result.municipalPatches,
		scores: result.scores,
		report: result.report,
		fingerprint: result.fingerprint,
		name: result.cityName
	};
}

describe('city generation', () => {
	it('reproduces complete topology, patches, scores, facts, and fingerprint', () => {
		const requested = config({ seed: 'determinism-after-rain', size: 'small' });
		const first = generateCity(requested);
		const replay = generateCity(requested);
		expect(topology(replay)).toEqual(topology(first));
		expect(first.fabricTiles).toHaveLength(first.width * first.height);
		expect(first.occupationTiles).toHaveLength(first.width * first.height);
		expect(first.events.at(-1)).toMatchObject({
			type: 'complete',
			fingerprint: first.fingerprint
		});
	});

	it('keeps display-only extra properties out of topology', () => {
		const base = config({ seed: 'display-independent', size: 'small' });
		const animated = { ...base, animationSpeed: 9, appearance: 'night' } as CityConfig;
		expect(generateCity(animated).fingerprint).toBe(generateCity(base).fingerprint);
	});

	it('usually gives different seeds different fingerprints', () => {
		const fingerprints = new Set(
			['rain', 'tram', 'moss', 'sand', 'lantern'].map(
				(seed) => generateCity(config({ seed, size: 'small' })).fingerprint
			)
		);
		expect(fingerprints.size).toBeGreaterThanOrEqual(4);
	});

	it('keeps scores finite and bounded, computed report facts honest, and exports a versioned schema', () => {
		const result = generateCity(config({ seed: 'report-facts', size: 'small' }));
		expect(result.scores.functional).toBeGreaterThanOrEqual(0);
		expect(result.scores.functional).toBeLessThanOrEqual(100);
		expect(result.scores.calamity).toBeGreaterThanOrEqual(0);
		expect(result.scores.calamity).toBeLessThanOrEqual(100);
		expect(result.report).toContain(
			`${result.analysis.walkable.reachedBorderExits} of ${result.analysis.walkable.borderExits} border exits`
		);
		expect(result.report).toContain(`${result.analysis.drainage.uphill} run uphill`);
		expect(Number.isNaN(result.scores.functional)).toBe(false);
		expect(Number.isNaN(result.scores.calamity)).toBe(false);

		const exported = createCityExport(result);
		expect(exported.schema).toBe('suvro-city-v1');
		expect(exported.fingerprint).toBe(result.fingerprint);
		expect(exported).not.toHaveProperty('events');
		expect(exported).not.toHaveProperty('timing');
		expect(exported.fabricTiles).toHaveLength(result.width * result.height);
	});

	it('places every public anchor through the same engine without losing it', () => {
		for (const anchor of ANCHORS) {
			const result = generateCity(
				config({
					seed: `anchor-${anchor.id}`,
					size: 'small',
					anchor: {
						id: anchor.id,
						x: 8,
						y: 6,
						rotation: anchor.rotations[0]
					}
				})
			);
			expect(result.anchor.id).toBe(anchor.id);
			expect(result.fabricTiles).toHaveLength(18 * 14);
			expect(result.occupationTiles).toHaveLength(18 * 14);
			expect(result.fingerprint).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/u);
		}
	});
});

describe('URL serialization', () => {
	it('round-trips every topology-changing field and reproduces the fingerprint', () => {
		const original = config({
			seed: 'url-round-trip',
			size: 'large',
			civicPatience: 'patient',
			minimumGuarantees: true,
			density: 'dense',
			landmarkFrequency: 'frequent',
			anomalyAppetite: 'enthusiastic',
			tramPreference: 'high',
			anchor: { id: 'garage', x: 27, y: 20, rotation: 3 }
		});
		const params = serializeCityConfig(original);
		const parsed = parseCityConfig(params);
		expect(parsed.issues).toEqual([]);
		expect(parsed.config).toEqual(original);
		expect(generateCity(parsed.config).fingerprint).toBe(generateCity(original).fingerprint);
	});

	it('validates malformed values, clamps coordinates, and flags unsupported versions', () => {
		const parsed = parseCityConfig(
			new URLSearchParams(
				'v=99&seed=%00&anchor=palace&ax=9999&ay=-100&r=12&size=77x88&patience=forever&guarantees=perhaps&density=vertical'
			)
		);
		expect(parsed.unsupportedVersion).toBe(true);
		expect(parsed.config.generatorVersion).toBe(1);
		expect(parsed.config.anchor.id).toBe(DEFAULT_CITY_CONFIG.anchor.id);
		expect(parsed.config.anchor.x).toBeLessThan(24);
		expect(parsed.config.anchor.y).toBe(0);
		expect(parsed.config.size).toBe('standard');
		expect(parsed.issues.length).toBeGreaterThanOrEqual(8);
	});
});

describe('transparent scoring', () => {
	const baseAnalysis: CityAnalysis = {
		walkable: {
			cellCount: 20,
			componentCount: 1,
			largestComponent: 20,
			largestComponentRatio: 1,
			borderExits: 2,
			reachedBorderExits: 2,
			deadEnds: 2
		},
		frontage: {
			occupiedCount: 10,
			accessibleCount: 10,
			accessibleRatio: 1,
			isolatedCount: 0,
			reachableServices: 3,
			serviceCount: 3,
			reachableServiceVariety: 3,
			serviceVariety: 3
		},
		drainage: {
			segmentCount: 10,
			connectedToOutlet: 10,
			internallyTrapped: 0,
			broken: 0,
			uphill: 0,
			missing: false
		},
		tram: { segmentCount: 4, continuous: true, strandedSegments: 0, reachesBorder: true },
		routeObstructions: 0,
		exceptionCount: 0,
		exceptionSeverity: 0,
		exceptionDiversity: 0,
		treeCount: 4,
		openSpaceCount: 5,
		pondAccessPoints: 2,
		occupiedDensity: 0.7
	};

	it('rewards connected access and penalises uphill drains', () => {
		const good = scoreCity(baseAnalysis, []);
		const disconnected = scoreCity(
			{
				...baseAnalysis,
				walkable: {
					...baseAnalysis.walkable,
					componentCount: 6,
					largestComponent: 5,
					largestComponentRatio: 0.25,
					reachedBorderExits: 0
				},
				frontage: {
					...baseAnalysis.frontage,
					accessibleCount: 2,
					accessibleRatio: 0.2,
					isolatedCount: 8
				},
				drainage: {
					...baseAnalysis.drainage,
					connectedToOutlet: 2,
					uphill: 6
				}
			},
			[]
		);
		expect(good.functional).toBeGreaterThan(disconnected.functional);
		expect(good.calamity).toBeLessThan(disconnected.calamity);
		expect(good.calamity).not.toBe(100 - good.functional);
	});

	it('uses reachable service variety and trees in the published components', () => {
		const varied = scoreCity(baseAnalysis, []);
		const sparse = scoreCity(
			{
				...baseAnalysis,
				frontage: {
					...baseAnalysis.frontage,
					reachableServiceVariety: 1
				},
				treeCount: 0
			},
			[]
		);
		const componentValue = (scores: ReturnType<typeof scoreCity>, key: string) =>
			scores.functionalComponents.find((component) => component.key === key)?.value ?? -1;
		expect(componentValue(varied, 'services')).toBeGreaterThan(componentValue(sparse, 'services'));
		expect(componentValue(varied, 'open-space')).toBeGreaterThan(
			componentValue(sparse, 'open-space')
		);
	});

	it('values diverse severe anomalies more than repeated low-severity copies', () => {
		const patch = (
			anomalyType: MunicipalPatch['anomalyType'],
			severity: number,
			index: number
		): MunicipalPatch => ({
			id: `p-${index}`,
			cell: { x: index, y: 0 },
			pass: 'infrastructure',
			demandedEdges: [],
			selectedEdges: [],
			anomalyType,
			severity,
			violatedRules: ['test'],
			narrativeKey: 'test',
			renderVariant: 'test'
		});
		const repeated = Array.from({ length: 8 }, (_, index) =>
			patch('permanent-sand-occupation', 2, index)
		);
		const diverse = [
			patch('tram-through-garage', 8, 0),
			patch('lane-through-bedroom', 7, 1),
			patch('pole-through-verandah', 6, 2),
			patch('uphill-drain', 5, 3)
		];
		expect(scoreCity(baseAnalysis, diverse).calamity).toBeGreaterThan(
			scoreCity(baseAnalysis, repeated).calamity
		);
	});
});

describe('bounded termination', () => {
	it('records and repairs the residual pond-anchor socket regression', () => {
		const result = generateCity(
			config({
				seed: 'stress-standard-0102-impulsive',
				size: 'standard',
				anchor: { id: 'pond', x: 7, y: 1, rotation: 0 },
				civicPatience: 'impulsive',
				minimumGuarantees: true,
				density: 'balanced',
				landmarkFrequency: 'frequent',
				anomalyAppetite: 'enthusiastic',
				tramPreference: 'ordinary'
			})
		);
		const patched = new Set(
			result.municipalPatches
				.filter((patch) => patch.pass === 'fabric')
				.map((patch) => patch.cell.y * result.width + patch.cell.x)
		);
		const patchByIndex = new Map(
			result.municipalPatches
				.filter((patch) => patch.pass === 'fabric')
				.map((patch) => [patch.cell.y * result.width + patch.cell.x, patch])
		);

		expect(patched.has(4 * result.width + 8)).toBe(true);
		for (let index = 0; index < result.fabricTiles.length; index += 1) {
			for (const direction of [1, 2] as const) {
				const neighbour = neighbourIndex(index, direction, result.width, result.height);
				if (neighbour < 0) continue;
				const firstEdges =
					patchByIndex.get(index)?.selectedEdges ?? result.fabricTiles[index].edges;
				const secondEdges =
					patchByIndex.get(neighbour)?.selectedEdges ?? result.fabricTiles[neighbour].edges;
				expect(
					explainEdgeCompatibility(
						firstEdges[direction],
						secondEdges[oppositeDirection(direction)],
						direction
					).compatible,
					`${index}/${neighbour}`
				).toBe(true);
			}
		}
	});

	it('terminates a varied seed/mode matrix without invalid output', () => {
		const patience = ['patient', 'familiar', 'impulsive', 'none'] as const;
		for (let index = 0; index < 48; index += 1) {
			const result = generateCity(
				config({
					seed: `termination-${index}`,
					size: 'small',
					civicPatience: patience[index % patience.length],
					minimumGuarantees: index % 3 === 0,
					density: index % 2 === 0 ? 'dense' : 'open',
					anomalyAppetite: index % 2 === 0 ? 'enthusiastic' : 'restrained'
				})
			);
			expect(result.statistics.steps).toBeLessThanOrEqual(
				result.statistics.hardStepBudget + result.width * result.height * 2
			);
			expect(result.fabricTiles.every((tile) => typeof tile.prototypeId === 'string')).toBe(true);
			expect(result.occupationTiles.every((tile) => typeof tile.prototypeId === 'string')).toBe(
				true
			);
			expect(Number.isFinite(result.scores.functional)).toBe(true);
			expect(Number.isFinite(result.scores.calamity)).toBe(true);
		}
	}, 60_000);
});
