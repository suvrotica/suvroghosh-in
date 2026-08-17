import { describe, expect, it } from 'vitest';
import { createInitialLabState, transitionLabState } from './state-machine';
import type { LabEvent, LabState } from './types';

const SEED = '0123456789abcdef';

function send(state: LabState, event: LabEvent): LabState {
	const result = transitionLabState(state, event);
	expect(result.ok, result.ok ? '' : result.reason).toBe(true);
	return result.state;
}

function expectRejected(
	state: LabState,
	event: LabEvent,
	reason: 'invalid-transition' | 'invalid-input' | 'duplicate-activation' | 'not-found'
): void {
	expect(transitionLabState(state, event)).toEqual({ ok: false, state, reason });
}

function begin(seed = SEED): LabState {
	return send(createInitialLabState(), { type: 'begin', seed });
}

function beginPresented(seed = SEED): LabState {
	return send(begin(seed), { type: 'present-baseline' });
}

function presentAllLater(state: LabState): LabState {
	for (let index = 0; index < 4; index += 1) {
		state = send(state, { type: 'present-next-claim' });
	}
	return state;
}

function reachApparentSharpening(options?: {
	seed?: string;
	planningOption?: 'detailed-plan' | 'loose-plan' | 'improvise' | 'depends';
	rating?: 'does-not-fit' | 'partly-fits' | 'fits' | 'too-vague' | 'unrated';
}): LabState {
	let state = beginPresented(options?.seed);
	if (options?.rating) {
		if (state.stage !== 'baseline') throw new Error('narrowing');
		state = send(state, {
			type: 'rate',
			statementId: state.deck.genericStatements[0].statementId,
			rating: options.rating
		});
	}
	state = send(state, { type: 'continue' });
	if (options?.planningOption) {
		state = send(state, {
			type: 'answer',
			questionId: 'planning_style',
			optionId: options.planningOption
		});
	}
	state = send(state, { type: 'continue' });
	expect(state.stage).toBe('apparent-sharpening');
	return state;
}

function reachFeedback(options?: Parameters<typeof reachApparentSharpening>[0]): LabState {
	let state = presentAllLater(reachApparentSharpening(options));
	state = send(state, { type: 'continue' });
	expect(state.stage).toBe('feedback-and-counterfactual');
	return state;
}

describe('Barnum guided-state reducer', () => {
	it('follows the guided stages and derives only after all claims were presented', () => {
		let state = begin();
		expect(state.stage).toBe('baseline');
		if (state.stage !== 'baseline') throw new Error('narrowing');
		expect(state.presentation).toMatchObject({
			presentedBaselineStatementIds: [],
			presentedLaterStatementIds: [],
			abandonedStatementIds: [],
			history: []
		});
		expect(state.presentation.baselineStatementIds).toHaveLength(3);
		expect(state.presentation.laterStatementIds).toHaveLength(4);
		expect(state.presentation.reservedSlots).toHaveLength(3);
		expectRejected(state, { type: 'continue' }, 'invalid-transition');

		state = send(state, { type: 'present-baseline' });
		if (state.stage !== 'baseline') throw new Error('narrowing');
		const first = state.deck.genericStatements[0];
		state = send(state, { type: 'rate', statementId: first.statementId, rating: 'fits' });
		state = send(state, { type: 'continue' });
		state = send(state, { type: 'answer', questionId: 'planning_style', optionId: 'loose-plan' });
		state = send(state, { type: 'continue' });
		expect(state.stage).toBe('apparent-sharpening');
		expectRejected(state, { type: 'continue' }, 'invalid-transition');

		state = presentAllLater(state);
		expectRejected(state, { type: 'present-next-claim' }, 'invalid-transition');
		state = send(state, { type: 'continue' });
		expect(state.stage).toBe('feedback-and-counterfactual');
		if (state.stage !== 'feedback-and-counterfactual') throw new Error('narrowing');
		expect(state.derivatives).toHaveLength(1);
		expect(state.auditLog.some((event) => event.kind === 'derivative-created')).toBe(true);
		const rating = state.ratings[0];
		expect(state.derivatives[0].trace.selectionInfluences).toContainEqual({
			kind: 'feedback',
			ratingEventId: rating.eventId,
			exactRating: 'fits'
		});
		expect(state.presentation.history).toContainEqual(
			expect.objectContaining({
				group: 'feedback-derivative',
				statement: state.derivatives[0]
			})
		);
		expect(state.auditLog.map((event) => event.sequence)).toEqual(
			state.auditLog.map((_, index) => index + 1)
		);
	});

	it('rejects unpresented-card ratings, malformed values, and exact duplicate answers', () => {
		let state = begin();
		if (state.stage !== 'baseline') throw new Error('narrowing');
		expectRejected(
			state,
			{
				type: 'rate',
				statementId: state.deck.genericStatements[0].statementId,
				rating: 'fits'
			},
			'not-found'
		);
		state = send(state, { type: 'present-baseline' });
		if (state.stage !== 'baseline') throw new Error('narrowing');
		const hidden = state.deck.genericStatements[6];
		expectRejected(
			state,
			{ type: 'rate', statementId: hidden.statementId, rating: 'fits' },
			'not-found'
		);
		expect(
			transitionLabState(state, {
				type: 'rate',
				statementId: state.deck.genericStatements[0].statementId,
				rating: 'invented' as never
			}).ok
		).toBe(false);
		state = send(state, { type: 'answer', questionId: 'planning_style', optionId: 'loose-plan' });
		expectRejected(
			state,
			{ type: 'answer', questionId: 'planning_style', optionId: 'loose-plan' },
			'invalid-transition'
		);
	});

	it('rejects rapid duplicate activations without changing state', () => {
		let state = send(createInitialLabState(), {
			type: 'begin',
			seed: SEED,
			meta: { activationId: 'begin-click' }
		});
		expectRejected(
			state,
			{ type: 'present-baseline', meta: { activationId: 'begin-click' } },
			'duplicate-activation'
		);

		const present = {
			type: 'present-baseline',
			meta: { activationId: 'present-click' }
		} as const;
		state = send(state, present);
		expectRejected(state, present, 'duplicate-activation');

		const continued = {
			type: 'continue',
			meta: { activationId: 'continue-click' }
		} as const;
		state = send(state, continued);
		expectRejected(state, continued, 'duplicate-activation');
	});

	it('allows only the four-clues group to be skipped, and only at that stage', () => {
		let state = beginPresented();
		expectRejected(state, { type: 'skip', groupId: 'four-clues' }, 'invalid-transition');

		state = send(state, { type: 'continue' });
		expect(state.stage).toBe('four-clues');
		expectRejected(state, { type: 'skip', groupId: 'invented-group' }, 'invalid-input');
		state = send(state, { type: 'skip', groupId: 'four-clues' });
		expect(state.auditLog.at(-1)).toMatchObject({ kind: 'skipped', groupId: 'four-clues' });

		state = send(state, { type: 'continue' });
		expectRejected(state, { type: 'skip', groupId: 'four-clues' }, 'invalid-transition');
	});

	it('records every never-shown sealed and reserved slot on an intro-level early reveal', () => {
		const baseline = begin();
		const reveal = send(baseline, { type: 'reveal-now' });
		expect(reveal.stage).toBe('reveal');
		if (reveal.stage !== 'reveal') throw new Error('narrowing');
		expect(reveal.presentation.abandonedStatementIds).toEqual(
			reveal.deck.genericStatements.map((statement) => statement.statementId)
		);
		expect(reveal.presentation.presentedBaselineStatementIds).toEqual([]);
		expect(reveal.presentation.presentedLaterStatementIds).toEqual([]);
		expect(reveal.presentation.history).toEqual([]);
		expect(reveal.presentation.reservedSlots).toEqual([
			{
				slotId: reveal.deck.reservedEchoSlotId,
				kind: 'direct-echo',
				status: { kind: 'abandoned', reason: 'early-reveal' }
			},
			...reveal.deck.reservedFeedbackSlotIds.map((slotId) => ({
				slotId,
				kind: 'feedback-derivative' as const,
				status: { kind: 'abandoned' as const, reason: 'early-reveal' as const }
			}))
		]);
		expect(reveal.auditLog.filter((event) => event.kind === 'statement-abandoned')).toHaveLength(7);
		expect(
			reveal.auditLog.filter((event) => event.kind === 'reserved-slot-abandoned')
		).toHaveLength(3);
		expectRejected(reveal, { type: 'reveal-now' }, 'invalid-transition');

		const openLab = send(reveal, { type: 'continue' });
		expect(openLab.stage).toBe('open-lab');
		expectRejected(openLab, { type: 'reveal-now' }, 'invalid-transition');
	});

	it('distinguishes partial Step 3 presentation from early-reveal abandonment', () => {
		let state = reachApparentSharpening();
		state = send(state, { type: 'present-next-claim' });
		state = send(state, { type: 'present-next-claim' });
		if (state.stage !== 'apparent-sharpening') throw new Error('narrowing');
		const shownLater = [...state.presentation.presentedLaterStatementIds];
		const neverShownLater = state.presentation.laterStatementIds.slice(2);
		state = send(state, { type: 'reveal-now' });
		if (state.stage !== 'reveal') throw new Error('narrowing');
		expect(state.presentation.presentedLaterStatementIds).toEqual(shownLater);
		expect(state.presentation.abandonedStatementIds).toEqual(neverShownLater);
		expect(state.presentation.history).toHaveLength(5);
		expect(
			state.presentation.reservedSlots.find((slot) => slot.kind === 'direct-echo')?.status
		).toEqual({ kind: 'empty', reason: 'no-answer' });
		expect(
			state.presentation.reservedSlots.filter(
				(slot) => slot.kind === 'feedback-derivative' && slot.status.kind === 'abandoned'
			)
		).toHaveLength(2);
		const revealed = state.auditLog.find((event) => event.kind === 'revealed');
		expect(revealed).toBeDefined();
		expect(
			state.auditLog
				.filter(
					(event) =>
						event.kind === 'statement-abandoned' || event.kind === 'reserved-slot-abandoned'
				)
				.every((event) => event.causalEventIds[0] === revealed?.id)
		).toBe(true);
	});

	it('allows replay only from reveal/open-lab and resets current presentation state', () => {
		let baseline = beginPresented();
		const oldHistory = baseline.stage === 'baseline' ? [...baseline.presentation.history] : [];
		const reveal = send(baseline, { type: 'reveal-now' });
		const replayedFromReveal = send(reveal, { type: 'replay' });
		expect(replayedFromReveal.stage).toBe('baseline');
		if (replayedFromReveal.stage !== 'baseline') throw new Error('narrowing');
		expect(replayedFromReveal.presentation.presentedBaselineStatementIds).toEqual([]);
		expect(replayedFromReveal.presentation.abandonedStatementIds).toEqual([]);
		expect(replayedFromReveal.presentation.history).toEqual(oldHistory);
		expect(replayedFromReveal.auditLog.at(-1)).toMatchObject({
			kind: 'replayed',
			parentBranchId: reveal.branchId
		});
		expectRejected(replayedFromReveal, { type: 'continue' }, 'invalid-transition');
		baseline = send(replayedFromReveal, { type: 'present-baseline' });
		if (baseline.stage !== 'baseline') throw new Error('narrowing');
		expect(baseline.presentation.history).toHaveLength(oldHistory.length + 3);

		const openLab = send(reveal, { type: 'continue' });
		const replayedFromOpenLab = send(openLab, { type: 'replay' });
		expect(replayedFromOpenLab.stage).toBe('baseline');
		expect(replayedFromOpenLab.auditLog.at(-1)).toMatchObject({ kind: 'replayed' });
		expectRejected(begin(), { type: 'replay' }, 'invalid-transition');
	});

	it('applies one demographic counterfactual per active branch', () => {
		let state = beginPresented();
		expectRejected(state, { type: 'apply-counterfactual' }, 'invalid-transition');
		state = reachFeedback();

		state = send(state, { type: 'apply-counterfactual' });
		expectRejected(state, { type: 'apply-counterfactual' }, 'invalid-transition');
		state = send(state, { type: 'continue' });
		expect(state.stage).toBe('reveal');
		expectRejected(state, { type: 'apply-counterfactual' }, 'invalid-transition');
		state = send(state, { type: 'continue' });
		expect(state.stage).toBe('open-lab');
		expectRejected(state, { type: 'apply-counterfactual' }, 'invalid-transition');
	});

	it('marks no-answer echo and unused feedback slots empty without adapting too-vague ratings', () => {
		const state = reachFeedback({ rating: 'too-vague' });
		if (state.stage !== 'feedback-and-counterfactual') throw new Error('narrowing');
		expect(state.derivatives).toEqual([]);
		expect(state.presentation.reservedSlots).toEqual([
			{
				slotId: state.deck.reservedEchoSlotId,
				kind: 'direct-echo',
				status: { kind: 'empty', reason: 'no-answer' }
			},
			...state.deck.reservedFeedbackSlotIds.map((slotId) => ({
				slotId,
				kind: 'feedback-derivative' as const,
				status: { kind: 'empty' as const, reason: 'no-eligible-feedback' as const }
			}))
		]);
		expect(
			state.auditLog.filter(
				(event) => event.kind === 'reserved-slot-empty' && event.slotKind === 'feedback-derivative'
			)
		).toHaveLength(2);
	});

	it('adds stable baseline and later presentation events exactly once per reducer action', () => {
		let state = begin();
		expectRejected(state, { type: 'present-next-claim' }, 'invalid-transition');
		state = send(state, { type: 'present-baseline', meta: { timestamp: 'baseline-shown' } });
		if (state.stage !== 'baseline') throw new Error('narrowing');
		const baselineAudits = state.auditLog.filter(
			(event) => event.kind === 'statement-presented' && event.group === 'baseline'
		);
		expect(baselineAudits).toHaveLength(3);
		expect(
			baselineAudits.map((event) =>
				event.kind === 'statement-presented' ? event.statementId : undefined
			)
		).toEqual(state.presentation.baselineStatementIds);
		expect(baselineAudits.every((event) => event.causalEventIds[0] === 'event-0001')).toBe(true);
		expect(state.presentation.history.map((entry) => entry.statement.statementId)).toEqual(
			state.presentation.baselineStatementIds
		);
		expectRejected(state, { type: 'present-baseline' }, 'invalid-transition');

		state = send(state, { type: 'continue' });
		expectRejected(state, { type: 'present-next-claim' }, 'invalid-transition');
		state = send(state, { type: 'continue' });
		const laterIds =
			state.stage === 'apparent-sharpening' ? [...state.presentation.laterStatementIds] : [];
		for (const expectedId of laterIds) {
			state = send(state, { type: 'present-next-claim' });
			if (state.stage !== 'apparent-sharpening') throw new Error('narrowing');
			expect(state.presentation.presentedLaterStatementIds.at(-1)).toBe(expectedId);
		}
		expectRejected(state, { type: 'present-next-claim' }, 'invalid-transition');
		expect(
			state.auditLog.filter(
				(event) => event.kind === 'statement-presented' && event.group === 'later-generic'
			)
		).toHaveLength(4);
	});

	it('preserves direct-echo snapshots when Back strips and then reuses the reserved slot', () => {
		let fourClues = send(beginPresented('1234567890abcdef'), { type: 'continue' });
		if (fourClues.stage !== 'four-clues') throw new Error('narrowing');
		const options = ['depends', 'loose-plan', 'detailed-plan', 'improvise'] as const;
		let firstApparent: LabState | undefined;
		for (const optionId of options) {
			const answered = transitionLabState(fourClues, {
				type: 'answer',
				questionId: 'planning_style',
				optionId
			});
			if (!answered.ok) continue;
			const apparent = transitionLabState(answered.state, { type: 'continue' });
			if (
				apparent.ok &&
				apparent.state.stage === 'apparent-sharpening' &&
				apparent.state.directEcho
			) {
				firstApparent = apparent.state;
				break;
			}
		}
		expect(firstApparent).toBeDefined();
		if (!firstApparent || firstApparent.stage !== 'apparent-sharpening') {
			throw new Error('expected a compatible direct echo');
		}
		const firstEcho = firstApparent.directEcho;
		if (!firstEcho) throw new Error('expected a direct echo');
		const firstHistory = firstApparent.presentation.history.find(
			(entry) => entry.group === 'direct-echo'
		);
		expect(firstHistory?.statement).toEqual(firstEcho);

		fourClues = send(firstApparent, { type: 'back' });
		if (fourClues.stage !== 'four-clues') throw new Error('narrowing');
		expect(fourClues).not.toHaveProperty('directEcho');
		expect(fourClues.presentation.history).toContainEqual(firstHistory);
		const selectedOption = fourClues.displayProfile.planning_style?.optionId;
		let secondApparent: LabState | undefined;
		for (const optionId of options.filter((candidate) => candidate !== selectedOption)) {
			const answered = transitionLabState(fourClues, {
				type: 'answer',
				questionId: 'planning_style',
				optionId
			});
			if (!answered.ok) continue;
			const apparent = transitionLabState(answered.state, { type: 'continue' });
			if (
				apparent.ok &&
				apparent.state.stage === 'apparent-sharpening' &&
				apparent.state.directEcho
			) {
				secondApparent = apparent.state;
				break;
			}
		}
		expect(secondApparent).toBeDefined();
		if (!secondApparent || secondApparent.stage !== 'apparent-sharpening') {
			throw new Error('expected a regenerated direct echo');
		}
		const echoHistory = secondApparent.presentation.history.filter(
			(entry) => entry.group === 'direct-echo'
		);
		expect(echoHistory).toHaveLength(2);
		expect(echoHistory[0].statement).toEqual(firstEcho);
		expect(echoHistory[1].statement).toEqual(secondApparent.directEcho);
		expect(echoHistory[0].presentationEventId).not.toBe(echoHistory[1].presentationEventId);
	});

	it('preserves derivative snapshots across Back and deterministic regeneration', () => {
		let state = reachFeedback({ rating: 'fits' });
		if (state.stage !== 'feedback-and-counterfactual') throw new Error('narrowing');
		expect(state.derivatives).toHaveLength(1);
		const firstDerivative = state.derivatives[0];
		state = send(state, { type: 'back' });
		expect(state.stage).toBe('apparent-sharpening');
		state = send(state, { type: 'continue' });
		if (state.stage !== 'feedback-and-counterfactual') throw new Error('narrowing');
		expect(state.derivatives).toHaveLength(1);
		const derivativeHistory = state.presentation.history.filter(
			(entry) => entry.group === 'feedback-derivative'
		);
		expect(derivativeHistory).toHaveLength(2);
		expect(derivativeHistory[0].statement).toEqual(firstDerivative);
		expect(derivativeHistory[1].statement).toEqual(state.derivatives[0]);
		expect(derivativeHistory[0].presentationEventId).not.toBe(
			derivativeHistory[1].presentationEventId
		);
	});

	it('forks reveal answer changes and audits an open-lab direct-echo regeneration', () => {
		const fourClues = send(beginPresented('1234567890abcdef'), { type: 'continue' });
		if (fourClues.stage !== 'four-clues') throw new Error('narrowing');
		const options = ['depends', 'loose-plan', 'detailed-plan', 'improvise'] as const;
		let apparentWithEcho: LabState | undefined;
		for (const optionId of options) {
			const answered = transitionLabState(fourClues, {
				type: 'answer',
				questionId: 'planning_style',
				optionId
			});
			if (!answered.ok) continue;
			const apparent = transitionLabState(answered.state, { type: 'continue' });
			if (
				apparent.ok &&
				apparent.state.stage === 'apparent-sharpening' &&
				apparent.state.directEcho
			) {
				apparentWithEcho = apparent.state;
				break;
			}
		}
		expect(apparentWithEcho).toBeDefined();
		if (!apparentWithEcho || apparentWithEcho.stage !== 'apparent-sharpening') {
			throw new Error('expected a compatible direct echo');
		}
		let reveal = send(presentAllLater(apparentWithEcho), { type: 'continue' });
		reveal = send(reveal, { type: 'continue' });
		if (reveal.stage !== 'reveal') throw new Error('narrowing');
		expectRejected(reveal, { type: 'present-direct-echo' }, 'invalid-transition');
		const parentBranchId = reveal.branchId;
		const selectedOption = reveal.displayProfile.planning_style?.optionId;
		let refreshedOpen: LabState | undefined;
		for (const optionId of options.filter((candidate) => candidate !== selectedOption)) {
			const answered = transitionLabState(reveal, {
				type: 'answer',
				questionId: 'planning_style',
				optionId
			});
			if (!answered.ok || answered.state.branchId === parentBranchId) continue;
			const opened = transitionLabState(answered.state, { type: 'continue' });
			if (!opened.ok || opened.state.stage !== 'open-lab') continue;
			const refreshed = transitionLabState(opened.state, { type: 'present-direct-echo' });
			if (refreshed.ok && refreshed.state.stage === 'open-lab' && refreshed.state.directEcho) {
				refreshedOpen = refreshed.state;
				break;
			}
		}
		expect(refreshedOpen).toBeDefined();
		if (!refreshedOpen || refreshedOpen.stage !== 'open-lab') {
			throw new Error('expected an audited open-lab echo refresh');
		}
		const answeredAudit = [...refreshedOpen.auditLog]
			.reverse()
			.find((event) => event.kind === 'answered' && event.questionId === 'planning_style');
		expect(answeredAudit).toMatchObject({
			branchId: refreshedOpen.branchId,
			parentBranchId
		});
		const echoHistory = refreshedOpen.presentation.history.filter(
			(entry) => entry.group === 'direct-echo'
		);
		expect(echoHistory).toHaveLength(2);
		expect(echoHistory[1]).toMatchObject({
			branchId: refreshedOpen.branchId,
			causalEventIds: [answeredAudit?.id]
		});
		expectRejected(refreshedOpen, { type: 'present-direct-echo' }, 'invalid-transition');
	});

	it('drops all session and presentation references on reset', () => {
		const active = beginPresented();
		expect(transitionLabState(active, { type: 'reset' })).toEqual({
			ok: true,
			state: createInitialLabState()
		});
	});

	it('removes later-stage fields exactly while retaining append-only presentation history', () => {
		let state = reachApparentSharpening();
		state = send(presentAllLater(state), { type: 'set-whole-reading-fit', value: 4 });
		state = send(state, { type: 'continue' });
		state = send(state, { type: 'apply-counterfactual' });
		state = send(state, { type: 'continue' });
		state = send(state, { type: 'set-breadth', value: 'almost-everybody' });
		state = send(state, { type: 'set-distinctiveness', value: 2 });
		expect(state.stage).toBe('reveal');
		expect(state).toHaveProperty('visitorEstimatedBreadth');
		expect(state).toHaveProperty('visitorRatedDistinctiveness');
		if (state.stage !== 'reveal') throw new Error('narrowing');
		const history = [...state.presentation.history];

		state = send(state, { type: 'back' });
		expect(state.stage).toBe('feedback-and-counterfactual');
		expect(state).not.toHaveProperty('visitorEstimatedBreadth');
		expect(state).not.toHaveProperty('visitorRatedDistinctiveness');

		state = send(state, { type: 'back' });
		expect(state.stage).toBe('apparent-sharpening');
		expect(state).not.toHaveProperty('derivatives');
		expect(state).not.toHaveProperty('counterfactualProfile');
		expect(state).not.toHaveProperty('visitorEstimatedBreadth');
		expect(state).not.toHaveProperty('visitorRatedDistinctiveness');
		if (state.stage !== 'apparent-sharpening') throw new Error('narrowing');
		expect(
			state.presentation.reservedSlots
				.filter((slot) => slot.kind === 'feedback-derivative')
				.every((slot) => slot.status.kind === 'pending')
		).toBe(true);

		state = send(state, { type: 'back' });
		expect(state.stage).toBe('four-clues');
		expect(state).not.toHaveProperty('directEcho');
		expect(state).not.toHaveProperty('wholeReadingFit');
		expect(state).not.toHaveProperty('derivatives');
		expect(state).not.toHaveProperty('counterfactualProfile');
		if (state.stage !== 'four-clues') throw new Error('narrowing');
		expect(state.presentation.reservedSlots.every((slot) => slot.status.kind === 'pending')).toBe(
			true
		);

		state = send(state, { type: 'back' });
		expect(state.stage).toBe('baseline');
		expect(state).not.toHaveProperty('directEcho');
		expect(state).not.toHaveProperty('wholeReadingFit');
		expect(state).not.toHaveProperty('derivatives');
		expect(state).not.toHaveProperty('counterfactualProfile');
		if (state.stage !== 'baseline') throw new Error('narrowing');
		expect(state.presentation.history).toEqual(history);
		expect(state.presentation.presentedLaterStatementIds).toHaveLength(4);
	});
});
