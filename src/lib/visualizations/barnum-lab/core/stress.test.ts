import { describe, expect, it } from 'vitest';
import { AXIS_REGISTRY } from '../data/axes';
import { applyDemographicCounterfactual } from './counterfactual';
import { createDefaultDisplayProfile, setAnswer, toGenerationProfile } from './input-boundary';
import { contentWordOverlap, SIMILARITY_THRESHOLDS, trigramJaccard } from './text-similarity';
import { generateReading, SELECTION_DISTRIBUTION_TOLERANCES } from './select-reading';
import { FRAGMENTS_EN } from '../data/fragments.en';
import { FRAMES_EN } from '../data/frames.en';

const stressIt = process.env.BARNUM_STRESS === '1' ? it : it.skip;

describe('Barnum 10,000-seed release stress', () => {
	stressIt(
		'holds demographic invariance, incompatibility, cooldown, and repetition properties',
		() => {
			let display = createDefaultDisplayProfile();
			display = setAnswer(display, 'planning_style', 'loose-plan')!;
			const counterfactual = applyDemographicCounterfactual(display);
			const fragmentById = new Map(FRAGMENTS_EN.map((fragment) => [fragment.id, fragment]));
			let profileBoundaryViolations = 0;
			let readingLengthViolations = 0;
			let semanticRepetitionViolations = 0;
			let lexicalRepetitionViolations = 0;
			let opposingStandalonePoleViolations = 0;
			let techniqueCooldownViolations = 0;
			let leadCooldownViolations = 0;
			let bridgeCooldownViolations = 0;
			let familyLimitViolations = 0;
			const axisCounts = new Map<string, number>();
			const primaryTechniqueCounts = new Map<string, number>();
			const specialFamilyCounts = new Map<string, number>();
			let axisOccurrenceCount = 0;
			let statementCount = 0;

			for (let index = 0; index < 10_000; index += 1) {
				const seed = index.toString(16).padStart(16, '0');
				const originalProfile = toGenerationProfile(display, seed);
				const changedProfile = toGenerationProfile(counterfactual, seed);
				if (JSON.stringify(originalProfile) !== JSON.stringify(changedProfile)) {
					profileBoundaryViolations += 1;
				}
				// Full semantic generation runs for every seed after the exact boundary comparison.
				const reading = generateReading(originalProfile, {
					count: 7,
					seedKey: 'ten-thousand-release-stress'
				});
				if (reading.length !== 7) readingLengthViolations += 1;
				const semanticKeys = reading.flatMap((statement) => statement.trace.semanticKeys);
				if (new Set(semanticKeys).size !== semanticKeys.length) semanticRepetitionViolations += 1;

				const polesByAxis = new Map<string, Set<string>>();
				const leadCounts = new Map<string, number>();
				let flatteringCount = 0;
				let vulnerabilityCount = 0;
				for (let statementIndex = 0; statementIndex < reading.length; statementIndex += 1) {
					const statement = reading[statementIndex];
					statementCount += 1;
					const primary = statement.trace.techniques[0];
					primaryTechniqueCounts.set(primary, (primaryTechniqueCounts.get(primary) ?? 0) + 1);
					for (const family of ['flattering-ambiguity', 'guarded-vulnerability'] as const) {
						if (statement.trace.techniques.includes(family)) {
							specialFamilyCounts.set(family, (specialFamilyCounts.get(family) ?? 0) + 1);
						}
					}
					if (
						reading
							.slice(Math.max(0, statementIndex - 3), statementIndex)
							.some((earlier) => earlier.trace.techniques[0] === primary)
					) {
						techniqueCooldownViolations += 1;
					}
					if (statement.trace.techniques.includes('flattering-ambiguity')) flatteringCount += 1;
					if (statement.trace.techniques.includes('guarded-vulnerability')) vulnerabilityCount += 1;
					const fragments = statement.trace.fragmentIds.flatMap((id) => {
						const fragment = fragmentById.get(id);
						return fragment ? [fragment] : [];
					});
					for (const fragment of fragments) {
						if (fragment.kind === 'lead') {
							const previous = reading[statementIndex - 1];
							if (previous?.trace.fragmentIds.includes(fragment.id)) leadCooldownViolations += 1;
							leadCounts.set(fragment.id, (leadCounts.get(fragment.id) ?? 0) + 1);
						}
						if (fragment.kind === 'bridge') {
							if (
								reading
									.slice(Math.max(0, statementIndex - 4), statementIndex)
									.some((earlier) => earlier.trace.fragmentIds.includes(fragment.id))
							) {
								bridgeCooldownViolations += 1;
							}
						}
						if (fragment.kind === 'clause' && fragment.axis && fragment.pole) {
							axisOccurrenceCount += 1;
							axisCounts.set(fragment.axis, (axisCounts.get(fragment.axis) ?? 0) + 1);
							const poles = polesByAxis.get(fragment.axis) ?? new Set<string>();
							if (
								!statement.trace.techniques.includes('rainbow-pair') &&
								[...poles].some((pole) => pole !== fragment.pole)
							) {
								opposingStandalonePoleViolations += 1;
							}
							poles.add(fragment.pole);
							polesByAxis.set(fragment.axis, poles);
						}
					}
				}
				if ([...leadCounts.values()].some((count) => count > 2)) leadCooldownViolations += 1;
				if (flatteringCount > 1 || vulnerabilityCount > 1) familyLimitViolations += 1;

				for (let left = 0; left < reading.length; left += 1) {
					for (let right = left + 1; right < reading.length; right += 1) {
						if (
							trigramJaccard(reading[left].text, reading[right].text) >
								SIMILARITY_THRESHOLDS.trigramJaccard ||
							contentWordOverlap(reading[left].text, reading[right].text) >
								SIMILARITY_THRESHOLDS.contentWordOverlap
						) {
							lexicalRepetitionViolations += 1;
						}
					}
				}
			}

			expect({
				profileBoundaryViolations,
				readingLengthViolations,
				semanticRepetitionViolations,
				lexicalRepetitionViolations,
				opposingStandalonePoleViolations,
				techniqueCooldownViolations,
				leadCooldownViolations,
				bridgeCooldownViolations,
				familyLimitViolations
			}).toEqual({
				profileBoundaryViolations: 0,
				readingLengthViolations: 0,
				semanticRepetitionViolations: 0,
				lexicalRepetitionViolations: 0,
				opposingStandalonePoleViolations: 0,
				techniqueCooldownViolations: 0,
				leadCooldownViolations: 0,
				bridgeCooldownViolations: 0,
				familyLimitViolations: 0
			});

			for (const axis of Object.keys(AXIS_REGISTRY)) {
				const share = (axisCounts.get(axis) ?? 0) / axisOccurrenceCount;
				expect(share, 'axis distribution:' + axis).toBeGreaterThanOrEqual(
					SELECTION_DISTRIBUTION_TOLERANCES.minimumAxisShare
				);
				expect(share, 'axis distribution:' + axis).toBeLessThanOrEqual(
					SELECTION_DISTRIBUTION_TOLERANCES.maximumAxisShare
				);
			}
			const primaryTechniques = new Set(
				FRAMES_EN.filter((frame) => frame.claimBasis === 'unsupported-generic').map(
					(frame) => frame.technique
				)
			);
			for (const technique of primaryTechniques) {
				const share = (primaryTechniqueCounts.get(technique) ?? 0) / statementCount;
				expect(share, 'primary technique distribution:' + technique).toBeGreaterThanOrEqual(
					SELECTION_DISTRIBUTION_TOLERANCES.minimumPrimaryTechniqueShare
				);
				expect(share, 'primary technique distribution:' + technique).toBeLessThanOrEqual(
					SELECTION_DISTRIBUTION_TOLERANCES.maximumPrimaryTechniqueShare
				);
			}
			for (const family of ['flattering-ambiguity', 'guarded-vulnerability'] as const) {
				const share = (specialFamilyCounts.get(family) ?? 0) / statementCount;
				expect(share, 'special technique distribution:' + family).toBeGreaterThanOrEqual(
					SELECTION_DISTRIBUTION_TOLERANCES.minimumSpecialFamilyShare
				);
				expect(share, 'special technique distribution:' + family).toBeLessThanOrEqual(
					SELECTION_DISTRIBUTION_TOLERANCES.maximumSpecialFamilyShare
				);
			}
		},
		1_800_000
	);
});
