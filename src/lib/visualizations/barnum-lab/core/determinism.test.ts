import { describe, expect, it } from 'vitest';
import { compileCandidates } from './compile-candidates';
import {
	applyDemographicCounterfactual,
	canonicalSemanticManifest,
	compareSemanticManifests,
	createDemographicCounterfactual
} from './counterfactual';
import { createDefaultDisplayProfile, setAnswer, toGenerationProfile } from './input-boundary';
import { createReplayCode, mulberry32, parseReplayCode } from './seeded-rng';
import { directEchoIsCompatible, generateDirectEcho, sealGenericDeck } from './select-reading';
import { statementConflictsWithStatements } from './statement-compatibility';
import { CORPUS_MANIFEST_HASH } from '../data/corpus-manifest';
import { FRAGMENTS_EN } from '../data/fragments.en';
import { FRAMES_EN } from '../data/frames.en';
import { canonicalSelfReportEntries } from './input-boundary';

describe('versioned deterministic generation', () => {
	it('keeps documented PRNG vectors stable', () => {
		const random = mulberry32(0x12345678);
		expect(Array.from({ length: 5 }, () => random())).toEqual([
			0.10615200875326991, 0.941276284167543, 0.9398706152569503, 0.2338848018553108,
			0.9045877147000283
		]);
	});

	it('replays a byte-identical sealed semantic manifest', () => {
		const profile = toGenerationProfile(createDefaultDisplayProfile(), '0123456789abcdef');
		const first = sealGenericDeck(profile);
		const second = sealGenericDeck(profile);
		expect(canonicalSemanticManifest(second.genericStatements)).toBe(
			canonicalSemanticManifest(first.genericStatements)
		);
		expect(second.replayCode).toBe(first.replayCode);
	});

	it('is invariant to source-array order', () => {
		const profile = toGenerationProfile(createDefaultDisplayProfile(), 'fedcba9876543210');
		const normal = compileCandidates(profile, {
			fragments: FRAGMENTS_EN,
			frames: FRAMES_EN,
			maxCandidates: 200
		});
		const reversed = compileCandidates(profile, {
			fragments: [...FRAGMENTS_EN].reverse(),
			frames: [...FRAMES_EN].reverse(),
			maxCandidates: 200
		});
		expect(reversed.map((candidate) => candidate.id)).toEqual(
			normal.map((candidate) => candidate.id)
		);
	});

	it('changes no generic semantics under a demographic counterfactual', () => {
		let display = createDefaultDisplayProfile();
		display = setAnswer(display, 'planning_style', 'loose-plan')!;
		const counterfactual = createDemographicCounterfactual(display);
		const changed = counterfactual.profile;
		expect(counterfactual.changedQuestionIds).toEqual(
			expect.arrayContaining(['age_band', 'gender'])
		);
		expect(changed.age_band).toEqual({ optionId: '65-plus', origin: 'user-selected' });
		expect(changed.gender).toEqual({ optionId: 'non-binary', origin: 'user-selected' });
		expect(toGenerationProfile(changed, 'aaaaaaaaaaaaaaaa')).toEqual(
			toGenerationProfile(display, 'aaaaaaaaaaaaaaaa')
		);
		const before = sealGenericDeck(toGenerationProfile(display, 'aaaaaaaaaaaaaaaa'));
		const after = sealGenericDeck(toGenerationProfile(changed, 'aaaaaaaaaaaaaaaa'));
		expect(compareSemanticManifests(before.genericStatements, after.genericStatements)).toEqual({
			identical: true,
			overlapPercent: 100,
			changedSlotIds: []
		});
	});

	it('confines a self-report change to its reserved echo', () => {
		const base = createDefaultDisplayProfile();
		const loose = setAnswer(base, 'planning_style', 'loose-plan')!;
		const detailed = setAnswer(base, 'planning_style', 'detailed-plan')!;
		const looseProfile = toGenerationProfile(loose, 'bbbbbbbbbbbbbbbb');
		const detailedProfile = toGenerationProfile(detailed, 'bbbbbbbbbbbbbbbb');
		expect(canonicalSemanticManifest(sealGenericDeck(looseProfile).genericStatements)).toBe(
			canonicalSemanticManifest(sealGenericDeck(detailedProfile).genericStatements)
		);
		expect(generateDirectEcho(looseProfile, 'planning_style')?.trace.semanticKeys).not.toEqual(
			generateDirectEcho(detailedProfile, 'planning_style')?.trace.semanticKeys
		);
	});

	it('canonicalises question order and ignores origin-only default confirmation', () => {
		const ordered = {
			planning_style: { optionId: 'loose-plan' as const, origin: 'user-selected' as const },
			decision_pace: { optionId: 'usually-deliberate' as const, origin: 'user-selected' as const }
		};
		const reversed = {
			decision_pace: ordered.decision_pace,
			planning_style: ordered.planning_style
		};
		const first = toGenerationProfile(ordered, 'cccccccccccccccc');
		const second = toGenerationProfile(reversed, 'cccccccccccccccc');
		expect(canonicalSelfReportEntries(second)).toEqual(canonicalSelfReportEntries(first));
		expect(canonicalSemanticManifest(sealGenericDeck(second).genericStatements)).toBe(
			canonicalSemanticManifest(sealGenericDeck(first).genericStatements)
		);
		const defaults = createDefaultDisplayProfile();
		const confirmed = setAnswer(defaults, 'country', 'india', 'user-selected')!;
		expect(toGenerationProfile(confirmed, 'cccccccccccccccc')).toEqual(
			toGenerationProfile(defaults, 'cccccccccccccccc')
		);
	});

	it('checks demographic invariance over 10,000 seeds with periodic full deck generation', () => {
		let display = createDefaultDisplayProfile();
		display = setAnswer(display, 'planning_style', 'loose-plan')!;
		const counterfactual = applyDemographicCounterfactual(display);
		let boundaryMismatchCount = 0;
		let generatedMismatchCount = 0;
		for (let index = 0; index < 10_000; index += 1) {
			const seed = index.toString(16).padStart(16, '0');
			const beforeProfile = toGenerationProfile(display, seed);
			const afterProfile = toGenerationProfile(counterfactual, seed);
			if (JSON.stringify(afterProfile) !== JSON.stringify(beforeProfile))
				boundaryMismatchCount += 1;
			if (index % 1_000 === 0) {
				const before = sealGenericDeck(beforeProfile).genericStatements;
				const after = sealGenericDeck(afterProfile).genericStatements;
				if (canonicalSemanticManifest(after) !== canonicalSemanticManifest(before)) {
					generatedMismatchCount += 1;
				}
			}
		}
		expect(boundaryMismatchCount).toBe(0);
		expect(generatedMismatchCount).toBe(0);
	}, 30_000);

	it('detects replay typos and unavailable manifests', () => {
		const code = createReplayCode('0123456789abcdef', CORPUS_MANIFEST_HASH);
		expect(parseReplayCode(code, CORPUS_MANIFEST_HASH)).toMatchObject({ ok: true });
		expect(parseReplayCode(code.slice(0, -1) + '0', CORPUS_MANIFEST_HASH)).toMatchObject({
			ok: false,
			reason: 'checksum'
		});
		expect(parseReplayCode(code, '00000000')).toMatchObject({
			ok: false,
			reason: 'manifest-mismatch'
		});
	});

	it('omits a conflicting direct echo without reshuffling the sealed deck', () => {
		const display = setAnswer(createDefaultDisplayProfile(), 'planning_style', 'loose-plan')!;
		const profile = toGenerationProfile(display, 'deadbeefdeadbeef');
		const deck = sealGenericDeck(profile);
		const oppositeFragment = FRAGMENTS_EN.find(
			(fragment) =>
				fragment.kind === 'clause' &&
				fragment.axis === 'structure-flexibility' &&
				fragment.pole === 'structure'
		)!;
		const conflict = {
			...deck.genericStatements[0],
			trace: {
				...deck.genericStatements[0].trace,
				fragmentIds: [oppositeFragment.id]
			}
		};
		const before = canonicalSemanticManifest(deck.genericStatements);
		expect(directEchoIsCompatible('planning_style', 'loose-plan', [conflict])).toBe(false);
		expect(generateDirectEcho(profile, 'planning_style', [conflict])).toBeUndefined();
		expect(canonicalSemanticManifest(deck.genericStatements)).toBe(before);
	});

	it('never introduces a conflicting direct echo across many sealed baseline decks', () => {
		const display = setAnswer(createDefaultDisplayProfile(), 'planning_style', 'loose-plan')!;
		let inserted = 0;
		for (let index = 0; index < 128; index += 1) {
			const profile = toGenerationProfile(display, (index + 90_000).toString(16).padStart(16, '0'));
			const deck = sealGenericDeck(profile);
			const before = canonicalSemanticManifest(deck.genericStatements);
			const echo = generateDirectEcho(profile, 'planning_style', deck.genericStatements);
			if (echo) {
				inserted += 1;
				expect(
					statementConflictsWithStatements(echo, deck.genericStatements),
					profile.sessionSeed
				).toBe(false);
				expect(generateDirectEcho(profile, 'planning_style', deck.genericStatements)?.text).toBe(
					echo.text
				);
			}
			expect(canonicalSemanticManifest(deck.genericStatements), profile.sessionSeed).toBe(before);
		}
		expect(inserted).toBeGreaterThan(0);
	}, 60_000);
});
