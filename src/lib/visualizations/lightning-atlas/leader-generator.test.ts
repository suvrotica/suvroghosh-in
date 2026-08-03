import { describe, expect, it } from 'vitest';
import { createChargePockets } from './charge-field';
import { DEFAULT_ATLAS_STATE, ENGINE_LIMITS, TERRAIN_PRESET_IDS, terrainPreset } from './config';
import { generateLightningFlash, scoreAttachmentCandidates } from './leader-generator';
import { generateTerrain, sampleTerrainHeight } from './terrain';
import { distance } from './vectors';
import type { SerializableAtlasState } from './types';

function state(overrides: Partial<SerializableAtlasState> = {}): SerializableAtlasState {
	return {
		...DEFAULT_ATLAS_STATE,
		...overrides,
		stormPosition: { ...DEFAULT_ATLAS_STATE.stormPosition, ...overrides.stormPosition },
		storm: { ...DEFAULT_ATLAS_STATE.storm, ...overrides.storm },
		environment: { ...DEFAULT_ATLAS_STATE.environment, ...overrides.environment },
		observer: { ...DEFAULT_ATLAS_STATE.observer, ...overrides.observer },
		visibleLayers: [...(overrides.visibleLayers ?? DEFAULT_ATLAS_STATE.visibleLayers)],
		placedFeatures: [...(overrides.placedFeatures ?? [])]
	};
}

describe('Lightning Atlas leader generation', () => {
	it('reproduces channel geometry and remains independent of visual quality', () => {
		const first = generateLightningFlash({ state: state({ quality: 'low' }), strikeIndex: 3 });
		const second = generateLightningFlash({ state: state({ quality: 'high' }), strikeIndex: 3 });
		expect(first.flash.channelHash).toBe(second.flash.channelHash);
		expect(first.flash.attachment).toEqual(second.flash.attachment);
		expect(first.flash.phaseEvents).toEqual(second.flash.phaseEvents);
	});

	it.each(['negative-cg', 'positive-cg'] as const)(
		'builds a bounded, finite, acyclic %s channel that reaches its attachment',
		(flashType) => {
			const { flash, terrain } = generateLightningFlash({
				state: state({ flashType, seed: `channel-${flashType}` }),
				strikeIndex: 0
			});
			expect(flash.segments.length).toBeGreaterThan(5);
			expect(flash.segments.length).toBeLessThanOrEqual(ENGINE_LIMITS.maximumSegments + 1);
			expect(flash.maximumBranchDepth).toBeLessThanOrEqual(ENGINE_LIMITS.maximumBranchDepth);
			expect(flash.attachment).toBeDefined();
			for (const [index, segment] of flash.segments.entries()) {
				expect(segment.parentIndex, `${index}:parent`).toBeLessThan(index);
				expect(
					[
						segment.start.x,
						segment.start.y,
						segment.start.z,
						segment.end.x,
						segment.end.y,
						segment.end.z
					].every(Number.isFinite)
				).toBe(true);
				expect(segment.start.y).toBeGreaterThanOrEqual(
					sampleTerrainHeight(terrain, segment.start.x, segment.start.z) - 0.001
				);
				expect(segment.end.y).toBeGreaterThanOrEqual(
					sampleTerrainHeight(terrain, segment.end.x, segment.end.z) - 0.001
				);
			}
			const finalSegment = flash.segments[flash.mainPath.at(-1)!];
			expect(finalSegment.end).toEqual(flash.attachment?.position);
			expect(flash.mainPath[0]).toBeGreaterThanOrEqual(0);
			expect(flash.segments[flash.mainPath[0]].parentIndex).toBe(-1);
			for (let pathIndex = 1; pathIndex < flash.mainPath.length; pathIndex += 1) {
				expect(flash.segments[flash.mainPath[pathIndex]].parentIndex).toBe(
					flash.mainPath[pathIndex - 1]
				);
			}
			expect(flash.mainPath.every((index) => flash.segments[index].isMainChannel)).toBe(true);
			const connectionPath = flash.mainPath.filter(
				(index) => flash.segments[index].isAttachmentConnection
			);
			expect(connectionPath.length).toBeGreaterThan(0);
			expect(connectionPath).toEqual(flash.mainPath.slice(-connectionPath.length));
			const upwardReturnPath = [...flash.mainPath].reverse().map((index) => ({
				start: flash.segments[index].end,
				end: flash.segments[index].start
			}));
			expect(upwardReturnPath[0].start).toEqual(flash.attachment?.position);
			for (let index = 1; index < upwardReturnPath.length; index += 1) {
				expect(upwardReturnPath[index - 1].end).toEqual(upwardReturnPath[index].start);
			}
			expect(flash.streamers.filter((streamer) => streamer.won)).toHaveLength(1);
			expect(flash.streamers.some((streamer) => !streamer.won)).toBe(true);
			expect(
				flash.streamers.every((streamer) => streamer.startedAtStep < finalSegment.birthStep)
			).toBe(true);
		}
	);

	it('keeps subdivided channels bounded and above terrain across the full atlas matrix', () => {
		for (const terrainId of TERRAIN_PRESET_IDS) {
			const preset = terrainPreset(terrainId);
			for (const flashType of ['negative-cg', 'positive-cg', 'intra-cloud'] as const) {
				for (const seedIndex of [0, 1]) {
					const { flash, terrain } = generateLightningFlash({
						state: state({
							seed: `matrix-${terrainId}-${flashType}-${seedIndex}`,
							terrain: terrainId,
							flashType,
							storm: {
								...DEFAULT_ATLAS_STATE.storm,
								cloudBaseMetres: preset.cloudBaseMetres
							},
							environment: {
								...DEFAULT_ATLAS_STATE.environment,
								surfaceWetness: preset.defaultWetness
							}
						}),
						strikeIndex: seedIndex
					});
					expect(flash.segments.length).toBeLessThanOrEqual(ENGINE_LIMITS.maximumSegments);
					for (const segment of flash.segments) {
						const segmentLength = distance(segment.start, segment.end);
						expect(segmentLength).toBeLessThanOrEqual(ENGINE_LIMITS.maximumSegmentMetres + 0.001);
						if (!segment.isAttachmentConnection) {
							expect(segmentLength).toBeGreaterThanOrEqual(
								ENGINE_LIMITS.minimumSegmentMetres - 0.001
							);
						}
						for (let sampleIndex = 1; sampleIndex < 16; sampleIndex += 1) {
							const fraction = sampleIndex / 16;
							const x = segment.start.x + (segment.end.x - segment.start.x) * fraction;
							const y = segment.start.y + (segment.end.y - segment.start.y) * fraction;
							const z = segment.start.z + (segment.end.z - segment.start.z) * fraction;
							expect(y).toBeGreaterThanOrEqual(sampleTerrainHeight(terrain, x, z) - 0.001);
						}
					}
					for (const streamer of flash.streamers) {
						expect(distance(streamer.start, streamer.end)).toBeLessThanOrEqual(
							ENGINE_LIMITS.maximumSegmentMetres + 0.001
						);
						for (const fraction of [0.1, 0.25, 0.5, 0.75, 1]) {
							const x = streamer.start.x + (streamer.end.x - streamer.start.x) * fraction;
							const y = streamer.start.y + (streamer.end.y - streamer.start.y) * fraction;
							const z = streamer.start.z + (streamer.end.z - streamer.start.z) * fraction;
							expect(y).toBeGreaterThanOrEqual(sampleTerrainHeight(terrain, x, z) - 0.001);
						}
					}
					const expectedBranchCount = flash.segments.filter(
						(segment) =>
							!segment.isAttachmentConnection &&
							segment.parentIndex >= 0 &&
							flash.segments[segment.parentIndex]?.branchDepth < segment.branchDepth
					).length;
					expect(flash.branchCount).toBe(expectedBranchCount);
				}
			}
		}
	});

	it('routes every interior channel segment above a low Himalayan ridge', () => {
		const { flash, terrain } = generateLightningFlash({
			state: state({
				terrain: 'himalayan-ridge',
				flashType: 'intra-cloud',
				seed: 'lowcloud-himalayan-ridge-intra-cloud-64',
				stormPosition: { x: 0.45, z: 0.66 },
				storm: {
					...DEFAULT_ATLAS_STATE.storm,
					chargeStrength: 1,
					chargeSeparation: 0.15,
					branching: 0.78,
					leaderPersistence: 0.26,
					lowerPositiveCharge: true,
					cloudBaseMetres: 450
				},
				environment: {
					...DEFAULT_ATLAS_STATE.environment,
					windSpeed: 45,
					windDirection: 352,
					surfaceWetness: 0.38,
					conductivityProxy: 0.65
				}
			}),
			strikeIndex: 64
		});

		for (const [segmentIndex, segment] of flash.segments.entries()) {
			const segmentLength = distance(segment.start, segment.end);
			expect(segmentLength, `${segmentIndex}:maximum`).toBeLessThanOrEqual(
				ENGINE_LIMITS.maximumSegmentMetres + 0.001
			);
			if (!segment.isAttachmentConnection) {
				expect(segmentLength, `${segmentIndex}:minimum`).toBeGreaterThanOrEqual(
					ENGINE_LIMITS.minimumSegmentMetres - 0.001
				);
			}
			for (let sampleIndex = 1; sampleIndex < 80; sampleIndex += 1) {
				const fraction = sampleIndex / 80;
				const x = segment.start.x + (segment.end.x - segment.start.x) * fraction;
				const y = segment.start.y + (segment.end.y - segment.start.y) * fraction;
				const z = segment.start.z + (segment.end.z - segment.start.z) * fraction;
				expect(y, `${segmentIndex}:${sampleIndex}`).toBeGreaterThanOrEqual(
					sampleTerrainHeight(terrain, x, z) - 0.001
				);
			}
		}
	});

	it('rebalances a short terminal intra-cloud closure without weakening segment bounds', () => {
		const { flash, terrain } = generateLightningFlash({
			state: state({
				terrain: 'monsoon-delta',
				flashType: 'intra-cloud',
				seed: 'audit-monsoon-delta-intra-cloud-56'
			}),
			strikeIndex: 56
		});

		for (const [segmentIndex, segment] of flash.segments.entries()) {
			const segmentLength = distance(segment.start, segment.end);
			expect(segmentLength, `${segmentIndex}:minimum`).toBeGreaterThanOrEqual(
				ENGINE_LIMITS.minimumSegmentMetres - 0.001
			);
			expect(segmentLength, `${segmentIndex}:maximum`).toBeLessThanOrEqual(
				ENGINE_LIMITS.maximumSegmentMetres + 0.001
			);
			for (let sampleIndex = 1; sampleIndex < 80; sampleIndex += 1) {
				const fraction = sampleIndex / 80;
				const x = segment.start.x + (segment.end.x - segment.start.x) * fraction;
				const y = segment.start.y + (segment.end.y - segment.start.y) * fraction;
				const z = segment.start.z + (segment.end.z - segment.start.z) * fraction;
				expect(y, `${segmentIndex}:${sampleIndex}`).toBeGreaterThanOrEqual(
					sampleTerrainHeight(terrain, x, z) - 0.001
				);
			}
		}
	});

	it.each([
		['himalayan-ridge', 'positive-cg', 49],
		['monsoon-delta', 'negative-cg', 6],
		['himalayan-ridge', 'negative-cg', 55],
		['desert-escarpment', 'positive-cg', 88],
		['open-ocean', 'positive-cg', 84]
	] as const)(
		'regresses dense attachment clearance and competing streamers for %s %s strike %i',
		(terrainId, flashType, strikeIndex) => {
			const preset = terrainPreset(terrainId);
			const { flash, terrain } = generateLightningFlash({
				state: state({
					seed: `audit-${terrainId}-${flashType}-${strikeIndex}`,
					terrain: terrainId,
					flashType,
					storm: {
						...DEFAULT_ATLAS_STATE.storm,
						cloudBaseMetres: preset.cloudBaseMetres
					},
					environment: {
						...DEFAULT_ATLAS_STATE.environment,
						surfaceWetness: preset.defaultWetness
					}
				}),
				strikeIndex
			});
			expect(flash.streamers.length).toBeGreaterThanOrEqual(2);
			for (const segment of flash.segments.filter((entry) => entry.isAttachmentConnection)) {
				for (let sampleIndex = 1; sampleIndex < 80; sampleIndex += 1) {
					const fraction = sampleIndex / 80;
					const x = segment.start.x + (segment.end.x - segment.start.x) * fraction;
					const y = segment.start.y + (segment.end.y - segment.start.y) * fraction;
					const z = segment.start.z + (segment.end.z - segment.start.z) * fraction;
					expect(y).toBeGreaterThanOrEqual(sampleTerrainHeight(terrain, x, z) - 0.001);
				}
			}
		}
	);

	it('uses placed-feature rotation in directional attachment scoring', () => {
		const makeRotated = (rotation: number) =>
			state({
				seed: 'rotation-causality',
				placedFeatures: [
					{ id: 'directional-turbine', kind: 'wind-turbine', x: 0.34, z: 0.58, rotation }
				]
			});
		const northSouth = makeRotated(0);
		const eastWest = makeRotated(90);
		const firstTerrain = generateTerrain(
			northSouth.terrain,
			northSouth.seed,
			northSouth.placedFeatures,
			65,
			northSouth.environment.surfaceWetness
		);
		const secondTerrain = generateTerrain(
			eastWest.terrain,
			eastWest.seed,
			eastWest.placedFeatures,
			65,
			eastWest.environment.surfaceWetness
		);
		const candidate = firstTerrain.candidates.find((entry) => entry.id === 'directional-turbine')!;
		const leader = {
			x: candidate.position.x + 900,
			y: candidate.position.y + 500,
			z: candidate.position.z
		};
		const firstScore = scoreAttachmentCandidates(
			northSouth,
			firstTerrain,
			createChargePockets(northSouth, firstTerrain),
			leader,
			0
		).find((entry) => entry.candidate.id === candidate.id)!.score;
		const secondScore = scoreAttachmentCandidates(
			eastWest,
			secondTerrain,
			createChargePockets(eastWest, secondTerrain),
			leader,
			0
		).find((entry) => entry.candidate.id === candidate.id)!.score;
		expect(firstTerrain.candidates.find((entry) => entry.id === candidate.id)?.rotation).toBe(0);
		expect(secondTerrain.candidates.find((entry) => entry.id === candidate.id)?.rotation).toBe(90);
		expect(secondScore).toBeGreaterThan(firstScore);
	});

	it('clamps high-energy boundary branches to the declared segment maximum', () => {
		const { flash } = generateLightningFlash({
			state: state({
				seed: 'edge-monsoon-delta-negative-cg-max-5',
				flashType: 'negative-cg',
				stormPosition: { x: 1, z: 1 },
				observer: { x: 1, z: 1 },
				storm: {
					chargeStrength: 1,
					chargeSeparation: 1,
					branching: 1,
					leaderPersistence: 1,
					cloudBaseMetres: 4_500,
					lowerPositiveCharge: true
				},
				environment: {
					windSpeed: 45,
					windDirection: 359,
					rainIntensity: 1,
					visibility: 1,
					surfaceWetness: 1,
					conductivityProxy: 1,
					timeOfDay: 1
				}
			}),
			strikeIndex: 5
		});
		expect(
			Math.max(...flash.segments.map((segment) => distance(segment.start, segment.end)))
		).toBeLessThanOrEqual(ENGINE_LIMITS.maximumSegmentMetres + 0.001);
	});

	it('allows a live secondary leader tip to win the attachment competition', () => {
		const input = state({ seed: 'branch-winner-1', flashType: 'negative-cg' });
		const first = generateLightningFlash({ state: input, strikeIndex: 0 }).flash;
		const second = generateLightningFlash({ state: input, strikeIndex: 0 }).flash;
		expect(first.channelHash).toBe(second.channelHash);
		expect(first.mainPath.some((index) => first.segments[index].branchDepth > 0)).toBe(true);
		for (let index = 1; index < first.mainPath.length; index += 1) {
			expect(first.segments[first.mainPath[index]].parentIndex).toBe(first.mainPath[index - 1]);
		}
		expect(first.streamers.filter((streamer) => streamer.won)).toHaveLength(1);
		expect(first.streamers.some((streamer) => !streamer.won)).toBe(true);
	});

	it('makes the wind snapshot causal while keeping presentation quality irrelevant', () => {
		const calm = generateLightningFlash({
			state: state({
				seed: 'monsoon-1975',
				flashType: 'negative-cg',
				environment: { ...DEFAULT_ATLAS_STATE.environment, windSpeed: 0, windDirection: 0 }
			}),
			strikeIndex: 0
		}).flash;
		const driven = generateLightningFlash({
			state: state({
				seed: 'monsoon-1975',
				flashType: 'negative-cg',
				environment: { ...DEFAULT_ATLAS_STATE.environment, windSpeed: 45, windDirection: 359 }
			}),
			strikeIndex: 0
		}).flash;
		expect(driven.channelHash).not.toBe(calm.channelHash);
	});

	it('keeps intra-cloud lightning aloft and semantically separate', () => {
		const { flash, terrain } = generateLightningFlash({
			state: state({ flashType: 'intra-cloud', seed: 'cloud-only' }),
			strikeIndex: 1
		});
		expect(flash.attachment).toBeUndefined();
		expect(flash.streamers).toEqual([]);
		expect(flash.phaseEvents.some((event) => event.phase === 'attachment')).toBe(false);
		expect(
			flash.segments.every(
				(segment) => segment.end.y > sampleTerrainHeight(terrain, segment.end.x, segment.end.z) + 10
			)
		).toBe(true);
	});

	it('keeps pause-independent replay data immutable by construction', () => {
		const { flash } = generateLightningFlash({ state: state(), strikeIndex: 7 });
		const before = JSON.stringify(flash);
		const replayTimes = flash.phaseEvents.flatMap((event) => [event.startTime, event.endTime]);
		expect(replayTimes.every(Number.isFinite)).toBe(true);
		expect(JSON.stringify(flash)).toBe(before);
	});

	it.each(['negative-cg', 'positive-cg', 'intra-cloud'] as const)(
		'keeps every %s coordinate inside the finite atmospheric world at storm-map corners',
		(flashType) => {
			for (const [x, z] of [
				[0, 0],
				[0, 1],
				[1, 0],
				[1, 1]
			] as const) {
				const { flash, terrain } = generateLightningFlash({
					state: state({
						seed: `edge-${flashType}-${x}-${z}`,
						flashType,
						stormPosition: { x, z }
					}),
					strikeIndex: 0
				});
				const points = flash.segments.flatMap((segment) => [segment.start, segment.end]);
				for (const point of points) {
					expect(Math.abs(point.x)).toBeLessThanOrEqual(terrain.widthMetres / 2 + 0.001);
					expect(Math.abs(point.z)).toBeLessThanOrEqual(terrain.depthMetres / 2 + 0.001);
				}
			}
		}
	);
});
