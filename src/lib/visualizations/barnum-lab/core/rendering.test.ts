import { describe, expect, it } from 'vitest';
import { compileCandidates } from './compile-candidates';
import { assignmentSatisfies } from './corpus-validation';
import { createDefaultDisplayProfile, setAnswer, toGenerationProfile } from './input-boundary';
import { contentWordOverlap, SIMILARITY_THRESHOLDS, trigramJaccard } from './text-similarity';
import { generateReading } from './select-reading';
import { FRAGMENTS_EN } from '../data/fragments.en';
import { FRAMES_EN } from '../data/frames.en';

describe('constrained rendering and repetition controls', () => {
	it('renders a clean representative sentence from every frame', () => {
		const display = setAnswer(createDefaultDisplayProfile(), 'planning_style', 'loose-plan')!;
		const profile = toGenerationProfile(display, '13579bdf2468ace0');
		for (const frame of FRAMES_EN) {
			const candidates = compileCandidates(profile, {
				claimBasis: frame.claimBasis,
				frames: [frame],
				questionId: frame.claimBasis === 'direct-echo' ? 'planning_style' : undefined,
				optionId: frame.claimBasis === 'direct-echo' ? 'loose-plan' : undefined,
				maxAttemptsPerFrame: 256,
				maxCandidates: 1,
				seedKey: 'frame-coverage:' + frame.id
			});
			expect(candidates, frame.id).toHaveLength(1);
			const text = candidates[0].text;
			expect(text, frame.id).toMatch(/^\p{Lu}/u);
			expect(text, frame.id).toMatch(/[.!?]$/u);
			expect(text, frame.id).not.toMatch(/\s{2,}/);
			expect(text, frame.id).not.toMatch(/[,:;!?]{2,}/);
			expect(text, frame.id).not.toMatch(/\{\{|\}\}|TODO|PLACEHOLDER/i);
		}
	});

	it('keeps semantic duplicates and declared incompatibilities out of large seeded samples', () => {
		const byId = new Map(FRAGMENTS_EN.map((fragment) => [fragment.id, fragment]));
		for (let index = 0; index < 64; index += 1) {
			const seed = (index + 50_000).toString(16).padStart(16, '0');
			const reading = generateReading(toGenerationProfile(createDefaultDisplayProfile(), seed), {
				count: 12,
				seedKey: 'repetition-stress'
			});
			expect(reading, seed).toHaveLength(12);
			const semanticKeys = reading.flatMap((statement) => statement.trace.semanticKeys);
			expect(new Set(semanticKeys).size, seed).toBe(semanticKeys.length);
			expect(new Set(reading.map((statement) => statement.text)).size, seed).toBe(reading.length);
			const leadCounts = new Map<string, number>();
			const polesByAxis = new Map<string, Set<string>>();
			let flatteringCount = 0;
			let vulnerabilityCount = 0;
			for (let statementIndex = 0; statementIndex < reading.length; statementIndex += 1) {
				const statement = reading[statementIndex];
				const priorPoleSnapshot = new Map(
					[...polesByAxis].map(([axis, poles]) => [axis, new Set(poles)])
				);
				const recentThree = reading.slice(Math.max(0, statementIndex - 3), statementIndex);
				expect(
					recentThree.some(
						(earlier) => earlier.trace.techniques[0] === statement.trace.techniques[0]
					),
					seed + ':technique:' + statement.statementId
				).toBe(false);
				if (statement.trace.techniques.includes('flattering-ambiguity')) flatteringCount += 1;
				if (statement.trace.techniques.includes('guarded-vulnerability')) vulnerabilityCount += 1;
				for (const fragmentId of statement.trace.fragmentIds) {
					const fragment = byId.get(fragmentId)!;
					if (fragment.kind === 'lead') {
						expect(
							reading[statementIndex - 1]?.trace.fragmentIds.includes(fragment.id) ?? false,
							seed + ':lead-adjacent:' + fragment.id
						).toBe(false);
						leadCounts.set(fragment.id, (leadCounts.get(fragment.id) ?? 0) + 1);
					}
					if (fragment.kind === 'bridge') {
						expect(
							reading
								.slice(Math.max(0, statementIndex - 4), statementIndex)
								.some((earlier) => earlier.trace.fragmentIds.includes(fragment.id)),
							seed + ':bridge:' + fragment.id
						).toBe(false);
					}
					if (fragment.kind === 'clause' && fragment.axis && fragment.pole) {
						const priorPoles = priorPoleSnapshot.get(fragment.axis) ?? new Set<string>();
						expect(
							[...priorPoles].some((pole) => pole !== fragment.pole),
							seed + ':opposing-pole:' + fragment.axis
						).toBe(false);
						const accumulatedPoles = polesByAxis.get(fragment.axis) ?? new Set<string>();
						accumulatedPoles.add(fragment.pole);
						polesByAxis.set(fragment.axis, accumulatedPoles);
					}
				}
			}
			expect(Math.max(0, ...leadCounts.values()), seed + ':lead-limit').toBeLessThanOrEqual(2);
			expect(flatteringCount, seed + ':flattering-limit').toBeLessThanOrEqual(1);
			expect(vulnerabilityCount, seed + ':vulnerability-limit').toBeLessThanOrEqual(1);
			for (let leftIndex = 0; leftIndex < reading.length; leftIndex += 1) {
				for (let rightIndex = leftIndex + 1; rightIndex < reading.length; rightIndex += 1) {
					const left = reading[leftIndex];
					const right = reading[rightIndex];
					expect(
						trigramJaccard(left.text, right.text) > SIMILARITY_THRESHOLDS.trigramJaccard ||
							contentWordOverlap(left.text, right.text) > SIMILARITY_THRESHOLDS.contentWordOverlap,
						seed + ':' + left.statementId + ':' + right.statementId
					).toBe(false);
					const assignment = Object.fromEntries(
						[...left.trace.fragmentIds, ...right.trace.fragmentIds]
							.map((id) => byId.get(id))
							.filter((fragment) => fragment !== undefined)
							.map((fragment) => [fragment.id, fragment])
					);
					expect(
						assignmentSatisfies(
							{
								id: 'cross-reading-check',
								locale: 'en',
								technique: 'broad-common-experience',
								claimBasis: 'unsupported-generic',
								parts: [],
								constraints: [{ op: 'not-incompatible' }]
							},
							assignment
						),
						seed
					).toBe(true);
				}
			}
		}
	}, 45_000);
});
