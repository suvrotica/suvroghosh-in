import { describe, expect, it } from 'vitest';
import { FRAGMENTS_EN } from '../data/fragments.en';
import { deriveFromFeedback } from './adapt-feedback';
import { createDefaultDisplayProfile, setAnswer, toGenerationProfile } from './input-boundary';
import { generateDirectEcho, sealGenericDeck } from './select-reading';
import { statementConflictsWithStatements } from './statement-compatibility';

describe('feedback adaptation boundaries', () => {
	it('filters each derivative against the full deck, direct echo, and earlier derivatives', () => {
		const display = setAnswer(createDefaultDisplayProfile(), 'planning_style', 'loose-plan')!;
		const profile = toGenerationProfile(display, '1234567890abcdef');
		const deck = sealGenericDeck(profile);
		const echo = generateDirectEcho(profile, 'planning_style', deck.genericStatements);
		const presented = [...deck.genericStatements, ...(echo ? [echo] : [])];
		const ratings = deck.genericStatements.slice(0, 4).map((statement, index) => ({
			statementId: statement.statementId,
			rating: index === 0 ? ('partly-fits' as const) : ('fits' as const),
			eventId: 'feedback-rating-' + index
		}));
		const derivatives = deriveFromFeedback(presented, ratings, profile, 2);
		expect(derivatives.length).toBeGreaterThan(0);
		expect(derivatives.length).toBeLessThanOrEqual(2);
		for (let index = 0; index < derivatives.length; index += 1) {
			const derivative = derivatives[index];
			expect(
				statementConflictsWithStatements(derivative, [
					...presented,
					...derivatives.slice(0, index)
				]),
				derivative.statementId
			).toBe(false);
			expect(derivative.trace.techniques).toContain('feedback-reuse');
			expect(derivative.version.transformation.kind).toBe('feedback-derivative');
		}

		const all = [...presented, ...derivatives];
		const semanticKeys = all.flatMap((statement) => statement.trace.semanticKeys);
		expect(new Set(semanticKeys).size).toBe(semanticKeys.length);
		const fragmentById = new Map(FRAGMENTS_EN.map((fragment) => [fragment.id, fragment]));
		const polesByAxis = new Map<string, Set<string>>();
		for (const statement of all) {
			const before = new Map([...polesByAxis].map(([axis, poles]) => [axis, new Set(poles)]));
			for (const id of statement.trace.fragmentIds) {
				const fragment = fragmentById.get(id);
				if (fragment?.kind !== 'clause' || !fragment.axis || !fragment.pole) continue;
				expect(
					[...(before.get(fragment.axis) ?? [])].some((pole) => pole !== fragment.pole),
					statement.statementId + ':' + fragment.axis
				).toBe(false);
				const accumulated = polesByAxis.get(fragment.axis) ?? new Set<string>();
				accumulated.add(fragment.pole);
				polesByAxis.set(fragment.axis, accumulated);
			}
		}
	});

	it('respects empty pools, maximum slots, and deterministic slot offsets', () => {
		const profile = toGenerationProfile(createDefaultDisplayProfile(), 'eeeeeeeeeeeeeeee');
		const deck = sealGenericDeck(profile);
		expect(deriveFromFeedback(deck.genericStatements, [], profile, 2)).toEqual([]);
		expect(deriveFromFeedback(deck.genericStatements, [], profile, Number.NaN)).toEqual([]);
		const ratings = deck.genericStatements.map((statement, index) => ({
			statementId: statement.statementId,
			rating: 'fits' as const,
			eventId: 'limit-rating-' + index
		}));
		const result = deriveFromFeedback(deck.genericStatements, ratings, profile, 99, 1);
		expect(result.length).toBeLessThanOrEqual(2);
		expect(result.map((statement) => statement.slotId)).toEqual(
			result.map((_, index) => 'feedback-' + (index + 2))
		);
	});
});
