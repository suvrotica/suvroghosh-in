import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createDefaultRecipe } from '../model/defaults';
import { validateShellRecipe } from '../model/validate';
import { expansionRateFromWhorl } from '../math/logarithmic-spiral';
import { ALL_PRESETS } from '../presets';
import { generateShell, generateShellAtAge } from './generate';
import { ringPositionPrefix } from './history';

const resolution = { growthRings: 48, apertureSamples: 24 };

function byteEqual(a: ArrayBufferView, b: ArrayBufferView): boolean {
	if (a.byteLength !== b.byteLength) return false;
	const first = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
	const second = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
	return first.every((value, index) => value === second[index]);
}

describe('deterministic shell generation', () => {
	it('returns byte-identical typed buffers for the same recipe and fixed resolution', () => {
		const recipe = createDefaultRecipe({
			ornament: {
				ribs: { enabled: true, amplitude: 0.06 },
				imperfection: { enabled: true, amplitude: 0.025 }
			}
		});
		const first = generateShell(recipe, resolution);
		const second = generateShell(recipe, resolution);
		for (const key of ['positions', 'normals', 'uvs', 'indices', 'stripIndexEnds'] as const) {
			expect(byteEqual(first.mesh[key], second.mesh[key])).toBe(true);
		}
		expect(byteEqual(first.history.ringPositions, second.history.ringPositions)).toBe(true);
	});

	it('produces finite indexed manifold geometry with one open adult boundary', () => {
		const result = generateShell(createDefaultRecipe(), resolution);
		expect(result.diagnostics.mesh.nonFinitePositionCount).toBe(0);
		expect(result.diagnostics.mesh.nonFiniteNormalCount).toBe(0);
		expect(result.diagnostics.mesh.nonFiniteUvCount).toBe(0);
		expect(result.diagnostics.mesh.outOfRangeIndexCount).toBe(0);
		expect(result.diagnostics.mesh.shortNormalCount).toBe(0);
		expect(result.diagnostics.mesh.degenerateTriangleCount).toBe(0);
		expect(result.mesh.topology.nonManifoldEdgeCount).toBe(0);
		expect(result.mesh.topology.boundaryLoopCount).toBe(1);
		expect(result.mesh.topology.boundaryEdgeCount).toBe(resolution.apertureSamples);
		expect(result.mesh.positions.length / 3).toBe(
			resolution.growthRings * resolution.apertureSamples + 1
		);
		expect(result.mesh.indices.length).toBe(
			resolution.apertureSamples * 3 + (resolution.growthRings - 1) * resolution.apertureSamples * 6
		);
	});

	it('classifies shared exponents and distinguishes lecture lift from strict cone similarity', () => {
		const whorlExpansion = 2.1;
		const scaleExponent = expansionRateFromWhorl(whorlExpansion);
		const cone = generateShell(
			createDefaultRecipe({
				coiling: {
					whorlExpansion,
					axial: { mode: 'cone-similar' }
				},
				aperture: { scaleExponent }
			}),
			resolution
		);
		expect(cone.classification.radialApertureSimilarity).toBe('exact-geometric-similarity');
		expect(cone.classification.spatialSimilarity).toBe('strict-underlying-base-law');
		expect(cone.classification.similarity).toBe('exact-self-similar');
		expect(cone.classification.appliesTo).toBe('underlying-base-growth-law');
		expect(cone.classification.strictlySelfSimilarIn3d).toBe(true);
		expect(cone.classification.finiteRenderedShellStrictlySimilar).toBe(false);

		const lifted = generateShell(
			createDefaultRecipe({
				coiling: { whorlExpansion, axial: { mode: 'lecture-lift' } },
				aperture: { scaleExponent }
			}),
			resolution
		);
		expect(lifted.classification.spatialSimilarity).toBe('top-view-only');

		const allometric = generateShell(
			createDefaultRecipe({ aperture: { scaleExponent: scaleExponent * 0.5 } }),
			resolution
		);
		expect(allometric.classification.radialApertureSimilarity).toBe('allometric');
		expect(allometric.classification.strictlySelfSimilarIn3d).toBe(false);
	});

	it('never classifies generalized paths or the local engine as strict in 3D', () => {
		const cases = [
			createDefaultRecipe({ engine: 'accretion' }),
			createDefaultRecipe({ coiling: { curve: 'archimedean' } }),
			createDefaultRecipe({ coiling: { meander: { radialAmplitude: 0.1 } } }),
			createDefaultRecipe({ coiling: { axial: { mode: 'keyframed' } } }),
			createDefaultRecipe({
				coiling: { handednessLaw: { type: 'linear', start: 1, end: -1 } }
			})
		];
		for (const recipe of cases) {
			const classification = generateShell(recipe, resolution).classification;
			expect(classification.spatialSimilarity).not.toBe('strict-underlying-base-law');
			expect(classification.strictlySelfSimilarIn3d).toBe(false);
			expect(classification.finiteRenderedShellStrictlySimilar).toBe(false);
		}
		expect(generateShell(cases[0], resolution).classification.spatialSimilarity).toBe(
			'local-kinematic'
		);
		expect(generateShell(cases[1], resolution).classification.curve).toBe('archimedean');
	});

	it('reports aliasing only for enabled ornament with nonzero geometric amplitude', () => {
		const lowResolution = { growthRings: 16, apertureSamples: 8 };
		const inactive = generateShell(createDefaultRecipe(), lowResolution);
		expect(inactive.diagnostics.warnings.some((warning) => warning.includes('band-limited'))).toBe(
			false
		);

		const zeroAmplitude = generateShell(
			createDefaultRecipe({
				ornament: {
					ribs: { enabled: true, amplitude: 0, countPerTurn: 80 },
					cords: { enabled: true, amplitude: 0, count: 64 }
				}
			}),
			lowResolution
		);
		expect(
			zeroAmplitude.diagnostics.warnings.some((warning) => warning.includes('band-limited'))
		).toBe(false);

		const active = generateShell(
			createDefaultRecipe({
				ornament: {
					ribs: { enabled: true, amplitude: 0.1, countPerTurn: 80 },
					cords: { enabled: true, amplitude: 0.1, count: 64 }
				}
			}),
			lowResolution
		);
		expect(active.diagnostics.warnings).toContain(
			'Rib frequency was band-limited to the growth-ring resolution.'
		);
		expect(active.diagnostics.warnings).toContain(
			'Around-aperture ornament was band-limited to the aperture resolution.'
		);
	});

	it('excludes the local whorl neighbourhood from conservative overlap estimates', () => {
		const defaultResult = generateShell(createDefaultRecipe(), resolution);
		expect(
			defaultResult.diagnostics.intersectionEstimate.excludedNeighborRings
		).toBeGreaterThanOrEqual(
			Math.ceil((resolution.growthRings - 1) / createDefaultRecipe().coiling.turns)
		);
		expect(defaultResult.diagnostics.intersectionEstimate.likely).toBe(false);
		expect(defaultResult.diagnostics.intersectionEstimate.parameterRisk).toBe(false);
		expect(defaultResult.diagnostics.intersectionEstimate.envelopeCandidatePairCount).toBe(
			defaultResult.diagnostics.intersectionEstimate.pairCount
		);

		const forbidden = ALL_PRESETS.find((preset) => preset.id === 'forbidden-self-intersection');
		expect(forbidden).toBeDefined();
		const forbiddenResult = generateShell(forbidden!.recipe, resolution);
		expect(forbiddenResult.diagnostics.intersectionEstimate.likely).toBe(true);
		expect(forbiddenResult.diagnostics.intersectionEstimate.parameterRisk).toBe(true);
		expect(forbiddenResult.diagnostics.intersectionEstimate.envelopeCandidateFound).toBe(true);
		expect(
			forbiddenResult.diagnostics.warnings.some(
				(warning) => warning.includes('possible overlap') && warning.includes('not proof')
			)
		).toBe(true);
	});

	it('diagnoses the optional uncapped apex against its two intended boundaries', () => {
		const result = generateShell(createDefaultRecipe(), resolution, { capApex: false });
		expect(result.mesh.apexVertexIndex).toBe(-1);
		expect(result.mesh.topology.boundaryLoopCount).toBe(2);
		expect(result.diagnostics.mesh.valid).toBe(true);
		expect(result.diagnostics.valid).toBe(true);
	});

	it('keeps declared-safe gastropod archetypes out of broad-phase false alarms', () => {
		for (const preset of ALL_PRESETS.filter(
			(item) => item.shelf === 'gastropod-archetypes' && item.diagnostics.declaredStatus === 'safe'
		)) {
			const result = generateShell(preset.recipe, resolution);
			expect(result.diagnostics.intersectionEstimate.likely, preset.id).toBe(false);
		}
	});

	it('uses genuine bit-identical ring prefixes when scrubbing age', () => {
		const recipe = createDefaultRecipe();
		const adult = generateShellAtAge(recipe, 1, resolution);
		const juvenile = generateShellAtAge(recipe, 0.37, resolution);
		expect(juvenile.reveal.visibleRingCount).toBeLessThan(adult.reveal.visibleRingCount);
		expect(juvenile.reveal.indexCount).toBe(
			adult.mesh.stripIndexEnds[juvenile.reveal.visibleRingCount - 1]
		);
		const juvenilePrefix = ringPositionPrefix(juvenile.history, juvenile.reveal.visibleRingCount);
		const adultPrefix = ringPositionPrefix(adult.history, juvenile.reveal.visibleRingCount);
		expect(byteEqual(juvenilePrefix, adultPrefix)).toBe(true);
		expect(byteEqual(juvenile.history.ringPositions, adult.history.ringPositions)).toBe(true);
	});

	it('keeps every canonical preset finite, including intentional warning cases', () => {
		for (const preset of ALL_PRESETS) {
			const generated = generateShell(preset.recipe, {
				growthRings: 32,
				apertureSamples: 16
			});
			expect(generated.mesh.positions.every(Number.isFinite), preset.id).toBe(true);
			expect(generated.mesh.normals.every(Number.isFinite), preset.id).toBe(true);
			expect(generated.mesh.uvs.every(Number.isFinite), preset.id).toBe(true);
			expect(generated.diagnostics.mesh.outOfRangeIndexCount, preset.id).toBe(0);
			expect(generated.mesh.topology.nonManifoldEdgeCount, preset.id).toBe(0);
		}
	});

	it('keeps 200 bounded randomized analytic recipes finite', () => {
		fc.assert(
			fc.property(
				fc.record({
					turns: fc.double({ min: 2, max: 8, noNaN: true }),
					whorlExpansion: fc.double({ min: 1.03, max: 5, noNaN: true }),
					axisDistance: fc.double({ min: 0.2, max: 2, noNaN: true }),
					apertureScale: fc.double({ min: 0.04, max: 0.9, noNaN: true }),
					aspectRatio: fc.double({ min: 0.25, max: 4, noNaN: true }),
					handedness: fc.constantFrom(-1 as const, 1 as const),
					seed: fc.integer({ min: 0, max: 0xffffffff })
				}),
				(parameters) => {
					const recipe = createDefaultRecipe({
						seed: parameters.seed,
						coiling: {
							turns: parameters.turns,
							whorlExpansion: parameters.whorlExpansion,
							axisDistance: parameters.axisDistance,
							handedness: parameters.handedness
						},
						aperture: {
							scale: parameters.apertureScale,
							aspectRatio: parameters.aspectRatio,
							scaleExponent: expansionRateFromWhorl(parameters.whorlExpansion)
						}
					});
					const generated = generateShell(recipe, {
						growthRings: 32,
						apertureSamples: 16
					});
					expect(generated.mesh.positions.every(Number.isFinite)).toBe(true);
					expect(generated.mesh.normals.every(Number.isFinite)).toBe(true);
					expect(generated.mesh.uvs.every(Number.isFinite)).toBe(true);
					expect(generated.diagnostics.mesh.outOfRangeIndexCount).toBe(0);
					expect(generated.mesh.topology.nonManifoldEdgeCount).toBe(0);
				}
			),
			{ numRuns: 200, seed: 0x5e11 }
		);
	});

	it('builds a finite local-kinematic accretion model', () => {
		const result = generateShell(createDefaultRecipe({ engine: 'accretion' }), {
			growthRings: 64,
			apertureSamples: 24
		});
		expect(result.classification.engine).toBe('accretion');
		expect(result.classification.spatialSimilarity).toBe('local-kinematic');
		expect(result.mesh.positions.every(Number.isFinite)).toBe(true);
		expect(result.mesh.topology.boundaryLoopCount).toBe(1);
	});

	it('propagates semantic errors and warnings into generation diagnostics', () => {
		const invalidSpeed = createDefaultRecipe({
			engine: 'accretion',
			kinematics: { speed: { type: 'constant', value: -1 } }
		});
		const invalidValidation = validateShellRecipe(invalidSpeed);
		const invalidGeneration = generateShell(invalidSpeed, resolution);
		for (const semanticError of invalidValidation.diagnostics.filter(
			({ severity }) => severity === 'error'
		)) {
			expect(invalidGeneration.diagnostics.errors).toContain(semanticError.message);
		}
		expect(invalidGeneration.diagnostics.valid).toBe(false);
		expect(invalidGeneration.mesh.positions.every(Number.isFinite)).toBe(true);

		const warningPreset = ALL_PRESETS.find((preset) => preset.id === 'open-loose-coil');
		expect(warningPreset).toBeDefined();
		const warningValidation = validateShellRecipe(warningPreset!.recipe);
		const warningGeneration = generateShell(warningPreset!.recipe, resolution);
		for (const semanticWarning of warningValidation.diagnostics.filter(
			({ severity }) => severity === 'warning'
		)) {
			expect(warningGeneration.diagnostics.warnings).toContain(semanticWarning.message);
		}
	});

	it('rejects numerically unsafe laws before they can create non-finite buffers', () => {
		const recipes = [
			createDefaultRecipe({
				engine: 'accretion',
				kinematics: { growthRate: { type: 'constant', value: 1e308 } }
			}),
			createDefaultRecipe({
				engine: 'accretion',
				kinematics: { twistRate: { type: 'constant', value: 1e308 } }
			}),
			createDefaultRecipe({
				coiling: {
					axial: {
						mode: 'keyframed',
						keyframed: { type: 'constant', value: 1e308 }
					}
				}
			})
		];

		for (const recipe of recipes) {
			expect(() => generateShell(recipe, resolution)).toThrow(
				'Recipe cannot be generated with finite geometry'
			);
		}
	});
});
