<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		CORPUS_MANIFEST_HASH,
		CORPUS_FRAGMENT_COUNT,
		CORPUS_VERSION,
		ENGINE_VERSION,
		createInitialLabState,
		createSessionSeed,
		distinguishingPower,
		expectedAccepts,
		generateDirectEcho,
		generateReading,
		isQuestionId,
		isValidOption,
		naturalFrequency,
		parseReplayCode,
		probabilityAtLeastOne,
		rngFor,
		setAnswer as setCoreAnswer,
		binomialTail,
		theatricalConfidence,
		toGenerationProfile,
		transitionLabState,
		type DisplayProfile,
		type GeneratedStatement,
		type LabEvent,
		type LabStage,
		type LabState,
		type SixPointRating
	} from '..';
	import AssumptionLedger from './AssumptionLedger.svelte';
	import ClueFieldset from './ClueFieldset.svelte';
	import ConfidenceProp from './ConfidenceProp.svelte';
	import CounterfactualDiff from './CounterfactualDiff.svelte';
	import DefensiveFieldGuide from './DefensiveFieldGuide.svelte';
	import FitEvidenceChart from './FitEvidenceChart.svelte';
	import FullscreenControl from './FullscreenControl.svelte';
	import HedgeComparison from './HedgeComparison.svelte';
	import OpenLabControls, { type OpenLabExperiment } from './OpenLabControls.svelte';
	import ProbabilityWorkbench, { type ProbabilityAdapter } from './ProbabilityWorkbench.svelte';
	import ReadingCard from './ReadingCard.svelte';
	import ReadingComparison from './ReadingComparison.svelte';
	import SessionEvidence from './SessionEvidence.svelte';
	import StageProgress from './StageProgress.svelte';
	import StatementAudit from './StatementAudit.svelte';
	import {
		LAB_QUESTIONS,
		activeDeck,
		buildCounterfactualResult,
		buildLedgerRows,
		calculateProductionCounts,
		generateOpenReading,
		latestRatings,
		profileContextLabel,
		stateRatings,
		toAuditEventViews,
		toReadingStatement,
		toReadingStatements
	} from './core-adapter';
	import type {
		BreadthEstimate,
		FitRating,
		LabAnswer,
		LabQuestion,
		OpenLabSettings,
		ProductionCounts,
		ReadingStatement
	} from './ui-types';

	const MAIN_QUESTION_IDS = ['country', 'city_context', 'language', 'planning_style'] as const;
	const DEFAULT_OPTIONS: Readonly<Record<string, string>> = {
		country: 'india',
		city_context: 'kolkata',
		language: 'bengali-english',
		age_band: 'prefer-not-to-say',
		gender: 'prefer-not-to-say'
	};
	const SIX_POINT_VALUES: readonly SixPointRating[] = [0, 1, 2, 3, 4, 5];
	const TIME_LABELS: Readonly<Record<Exclude<LabStage, 'intro' | 'open-lab'>, string>> = {
		baseline: 'about four minutes remaining',
		'four-clues': 'about three minutes remaining',
		'apparent-sharpening': 'about two minutes remaining',
		'feedback-and-counterfactual': 'about one minute remaining',
		reveal: 'the mechanism is now open'
	};
	const DEFAULT_OPEN_SETTINGS: OpenLabSettings = {
		statementCount: 7,
		surfaceAdaptation: true,
		directEchoes: true,
		feedbackAdaptation: true,
		oppositePairs: true,
		hedges: 'low',
		breadth: 'broad',
		showProvenance: false,
		showNonFits: true
	};
	const EMPTY_PRODUCTION_COUNTS: ProductionCounts = {
		statementCount: 0,
		semanticClauseCount: 0,
		unsupportedGenericClauseCount: 0,
		directEchoClauseCount: 0,
		sealedClauseCount: 0,
		feedbackSelectedClauseCount: 0,
		hedgedClauseCount: 0,
		elaboratedClauseCount: 0,
		nonFitsOmittedFromPolishedSummaryCount: 0,
		fitRatings: {
			'does-not-fit': 0,
			'partly-fits': 0,
			fits: 0,
			'too-vague': 0,
			unrated: 0
		}
	};
	type PendingDeckReplacement =
		| { kind: 'new-seed' }
		| { kind: 'replay-code'; code: string; seed: string };

	let root!: HTMLElement;
	let stageHeading: HTMLElement | undefined = $state();
	let labState = $state<LabState>(createInitialLabState());
	let mounted = $state(false);
	let expanded = $state(false);
	let fullscreenAvailable = $state(false);
	let fullscreenActive = $state(false);
	let returnFocus: HTMLButtonElement | null = null;
	let resetConfirmation = $state(false);
	let liveMessage = $state('');
	let activeExperiment: OpenLabExperiment = $state('demographics');
	let openSettings: OpenLabSettings = $state({ ...DEFAULT_OPEN_SETTINGS });
	let selfReportCounterfactualApplied = $state(false);
	let pendingDeckReplacement: PendingDeckReplacement | null = $state(null);
	let activationLocked = false;
	let activationSequence = 0;

	let stage = $derived(labState.stage);
	let stepNumber = $derived(stageToStep(stage));
	let deck = $derived(activeDeck(labState));
	let seed = $derived(deck?.sessionSeed ?? '');
	let deckCode = $derived(deck?.replayCode ?? 'not sealed');
	let answers = $derived(labState.displayProfile);
	let ratingRecords = $derived(stateRatings(labState));
	let ratingByStatement = $derived(latestRatings(ratingRecords));
	let stateDirectEchoCore = $derived(directEchoForState(labState));
	let derivativeCore = $derived(derivativesForState(labState));
	let genericCore = $derived(deck?.genericStatements ?? []);
	let presentation = $derived(labState.stage === 'intro' ? undefined : labState.presentation);
	let guidedBranchId = $derived(
		[...labState.auditLog]
			.reverse()
			.find((event) => event.kind === 'continued' && event.to === 'apparent-sharpening')?.branchId
	);
	let directEchoCore = $derived(
		stage === 'open-lab' && selfReportCounterfactualApplied
			? presentation?.history.find(
					(entry) => entry.group === 'direct-echo' && entry.branchId === guidedBranchId
				)?.statement
			: stateDirectEchoCore
	);
	let castClaimCount = $derived(presentation?.presentedLaterStatementIds.length ?? 0);
	let baselineCore = $derived(genericCore.slice(0, 3));
	let laterCore = $derived(genericCore.slice(3, 7));
	let presentedGenericCore = $derived(
		genericCore.filter((statement) =>
			[
				...(presentation?.presentedBaselineStatementIds ?? []),
				...(presentation?.presentedLaterStatementIds ?? [])
			].includes(statement.statementId)
		)
	);
	let presentedCore = $derived([
		...presentedGenericCore,
		...(directEchoCore ? [directEchoCore] : []),
		...derivativeCore
	]);
	let auditCore = $derived([
		...genericCore,
		...(directEchoCore ? [directEchoCore] : []),
		...derivativeCore
	]);
	let baselineStatements = $derived(toReadingStatements(baselineCore, ratingRecords));
	let laterGuesses = $derived(toReadingStatements(laterCore, ratingRecords));
	let visibleLaterGuesses = $derived(
		laterGuesses.filter((statement) =>
			(presentation?.presentedLaterStatementIds ?? []).includes(statement.id)
		)
	);
	let echoStatement = $derived(
		directEchoCore ? toReadingStatement(directEchoCore, ratingRecords) : null
	);
	let feedbackStatements = $derived(toReadingStatements(derivativeCore, ratingRecords));
	let presentedStatements = $derived(toReadingStatements(presentedCore, ratingRecords));
	let auditStatements = $derived(toReadingStatements(auditCore, ratingRecords, presentation));
	let productionMetrics = $derived(productionForState(labState, presentedCore, openSettings));
	let ratingCounts = $derived(productionMetrics.fitRatings);
	let missStatements = $derived(
		presentedStatements.filter(
			(statement) => statement.rating === 'does-not-fit' || statement.rating === 'too-vague'
		)
	);
	let wholeReadingFit = $derived(wholeReadingFitForState(labState));
	let breadth = $derived(breadthForState(labState));
	let distinctiveness = $derived(distinctivenessForState(labState));
	let auditEvents = $derived(toAuditEventViews(labState.auditLog));
	let counterfactualApplied = $derived(counterfactualProfileForState(labState) !== undefined);
	let answeredCount = $derived(
		Object.values(answers).filter((answer) => answer?.origin === 'user-selected').length +
			ratingByStatement.size
	);
	let confidenceValue = $derived(theatricalConfidence(answeredCount, seed || 'b4a7e6d193c0528f'));
	let confidenceDecoration = $derived(
		Math.floor(rngFor(seed || 'b4a7e6d193c0528f', 'fake-confidence')() * 4)
	);
	let counterfactualResult = $derived(
		buildCounterfactualResult(answers, genericCore, seed || 'b4a7e6d193c0528f')
	);
	let openGenericCore = $derived(openGenericForState(labState, openSettings));
	let openEchoCore = $derived(stateDirectEchoCore);
	let openEchoDiffers = $derived(
		Boolean(
			openEchoCore && (!directEchoCore || openEchoCore.statementId !== directEchoCore.statementId)
		)
	);
	let ledgerRows = $derived(
		buildLedgerRows(
			answers,
			stage === 'reveal' || stage === 'open-lab',
			stage === 'open-lab' ? openEchoCore : directEchoCore
		)
	);
	let openAuditCore = $derived([
		...genericCore,
		...(directEchoCore ? [directEchoCore] : []),
		...(openEchoDiffers && openEchoCore ? [openEchoCore] : []),
		...derivativeCore
	]);
	let openAuditStatements = $derived(
		toReadingStatements(openAuditCore, ratingRecords, presentation)
	);
	let blindView = $derived(toReadingStatements(openGenericCore, ratingRecords));
	let dressedView = $derived([
		...blindView,
		...(openSettings.directEchoes && openEchoCore
			? [toReadingStatement(openEchoCore, ratingRecords)]
			: [])
	]);
	let adaptiveUnfiltered = $derived([
		...dressedView,
		...(openSettings.feedbackAdaptation ? feedbackStatements : [])
	]);
	let adaptiveView = $derived(
		openSettings.showNonFits
			? adaptiveUnfiltered
			: adaptiveUnfiltered.filter((statement) => statement.rating !== 'does-not-fit')
	);
	let hedgeOffView = $derived(
		isExperiment(activeExperiment, 'hedges')
			? toReadingStatements(
					generateOpenReading(answers, seed || 'b4a7e6d193c0528f', {
						...openSettings,
						statementCount: Math.min(4, openSettings.statementCount),
						hedges: 'none'
					}),
					ratingRecords
				)
			: []
	);
	let hedgeOnView = $derived(
		isExperiment(activeExperiment, 'hedges')
			? toReadingStatements(
					generateOpenReading(answers, seed || 'b4a7e6d193c0528f', {
						...openSettings,
						statementCount: Math.min(4, openSettings.statementCount),
						hedges: 'high'
					}),
					ratingRecords
				)
			: []
	);
	let openAlternative = $derived(
		openSettings.statementCount !== DEFAULT_OPEN_SETTINGS.statementCount ||
			openSettings.oppositePairs !== DEFAULT_OPEN_SETTINGS.oppositePairs ||
			openSettings.hedges !== DEFAULT_OPEN_SETTINGS.hedges ||
			openSettings.breadth !== DEFAULT_OPEN_SETTINGS.breadth
	);

	const mainQuestions: readonly LabQuestion[] = MAIN_QUESTION_IDS.map((id) =>
		LAB_QUESTIONS.find((question) => question.id === id)
	).filter((question): question is LabQuestion => Boolean(question));
	const extraQuestions: readonly LabQuestion[] = LAB_QUESTIONS.filter(
		(question) => !MAIN_QUESTION_IDS.includes(question.id as (typeof MAIN_QUESTION_IDS)[number])
	);
	const probabilityAdapter: ProbabilityAdapter = {
		expectedAccepts: (n, p) => expectedAccepts(p, n),
		atLeastOne: (n, p) => probabilityAtLeastOne(p, n),
		atLeastK: (n, p, k) => binomialTail(p, n, k),
		naturalFrequency: (probability, sessions) => naturalFrequency(probability, sessions),
		distinguishingPower: (groupA, groupB) => {
			const result = distinguishingPower(groupA, groupB);
			return {
				absoluteDifference: result.absoluteDifference,
				likelihoodRatio: result.likelihoodRatio ?? null
			};
		}
	};

	function stageToStep(value: LabStage): 1 | 2 | 3 | 4 | 5 | null {
		if (value === 'baseline') return 1;
		if (value === 'four-clues') return 2;
		if (value === 'apparent-sharpening') return 3;
		if (value === 'feedback-and-counterfactual') return 4;
		if (value === 'reveal') return 5;
		return null;
	}

	function isExperiment(value: OpenLabExperiment, expected: OpenLabExperiment): boolean {
		return value === expected;
	}

	function directEchoForState(state: LabState): GeneratedStatement | undefined {
		if (
			state.stage === 'apparent-sharpening' ||
			state.stage === 'feedback-and-counterfactual' ||
			state.stage === 'reveal' ||
			state.stage === 'open-lab'
		) {
			return state.directEcho;
		}
		return undefined;
	}

	function derivativesForState(state: LabState): readonly GeneratedStatement[] {
		if (
			state.stage === 'feedback-and-counterfactual' ||
			state.stage === 'reveal' ||
			state.stage === 'open-lab'
		) {
			return state.derivatives;
		}
		return [];
	}

	function wholeReadingFitForState(state: LabState): SixPointRating | undefined {
		if (
			state.stage === 'apparent-sharpening' ||
			state.stage === 'feedback-and-counterfactual' ||
			state.stage === 'reveal' ||
			state.stage === 'open-lab'
		) {
			return state.wholeReadingFit;
		}
		return undefined;
	}

	function breadthForState(state: LabState): BreadthEstimate | undefined {
		return state.stage === 'reveal' || state.stage === 'open-lab'
			? state.visitorEstimatedBreadth
			: undefined;
	}

	function distinctivenessForState(state: LabState): SixPointRating | undefined {
		return state.stage === 'reveal' || state.stage === 'open-lab'
			? state.visitorRatedDistinctiveness
			: undefined;
	}

	function counterfactualProfileForState(state: LabState): DisplayProfile | undefined {
		if (
			state.stage === 'feedback-and-counterfactual' ||
			state.stage === 'reveal' ||
			state.stage === 'open-lab'
		) {
			return state.counterfactualProfile;
		}
		return undefined;
	}

	function productionForState(
		state: LabState,
		statements: readonly GeneratedStatement[],
		settings: OpenLabSettings
	): ProductionCounts {
		if (state.stage === 'intro') return EMPTY_PRODUCTION_COUNTS;
		const latest = latestRatings(state.ratings);
		const polishedSummaryStatementIds = statements
			.filter(
				(statement) =>
					settings.showNonFits || latest.get(statement.statementId)?.rating !== 'does-not-fit'
			)
			.map((statement) => statement.statementId);
		return calculateProductionCounts(state, statements, polishedSummaryStatementIds);
	}

	function openGenericForState(
		state: LabState,
		settings: OpenLabSettings
	): readonly GeneratedStatement[] {
		if (state.stage === 'intro') return [];
		const usesSealedMechanisms =
			settings.oppositePairs && settings.hedges === 'low' && settings.breadth === 'broad';
		if (usesSealedMechanisms) {
			if (settings.statementCount <= state.deck.genericStatements.length) {
				return state.deck.genericStatements.slice(0, settings.statementCount);
			}
			return generateReading(toGenerationProfile(state.displayProfile, state.deck.sessionSeed), {
				count: settings.statementCount,
				slotPrefix: 'generic',
				seedKey: 'sealed-generic-deck'
			});
		}
		return generateOpenReading(state.displayProfile, state.deck.sessionSeed, settings);
	}

	function contextLabel(): string {
		return profileContextLabel(answers);
	}

	function answerForQuestion(questionId: string): LabAnswer | undefined {
		return isQuestionId(questionId) ? answers[questionId] : undefined;
	}

	function defaultOptionForQuestion(questionId: string): string | undefined {
		const answer = answerForQuestion(questionId);
		if (answer?.origin === 'demo-default') return DEFAULT_OPTIONS[questionId];
		if (!answer && (questionId === 'age_band' || questionId === 'gender')) {
			return DEFAULT_OPTIONS[questionId];
		}
		return undefined;
	}

	function withMeta(event: LabEvent): LabEvent {
		activationSequence += 1;
		return {
			...event,
			meta: {
				...event.meta,
				activationId: 'barnum-ui-' + String(activationSequence),
				timestamp: new Date().toISOString()
			}
		} as LabEvent;
	}

	function dispatchCore(event: LabEvent): boolean {
		const result = transitionLabState(labState, withMeta(event));
		if (!result.ok) {
			liveMessage = 'That action was not available in the current step (' + result.reason + ').';
			return false;
		}
		labState = result.state;
		return true;
	}

	async function focusStage(message: string): Promise<void> {
		liveMessage = message;
		await tick();
		stageHeading?.focus({ preventScroll: true });
		stageHeading?.scrollIntoView({ block: 'start', behavior: 'auto' });
	}

	function withActivationLock(action: () => void): void {
		if (activationLocked) return;
		activationLocked = true;
		action();
		setTimeout(() => (activationLocked = false), 180);
	}

	function begin(): void {
		withActivationLock(() => {
			selfReportCounterfactualApplied = false;
			if (!dispatchCore({ type: 'begin', seed: createSessionSeed() })) return;
			if (!dispatchCore({ type: 'present-baseline' })) return;
			void focusStage('Step 1 of 5. Three sealed generic statements are ready.');
		});
	}

	function revealNow(): void {
		withActivationLock(() => {
			if (labState.stage === 'intro') {
				if (!dispatchCore({ type: 'begin', seed: createSessionSeed() })) return;
			}
			if (!dispatchCore({ type: 'reveal-now' })) return;
			void focusStage('Step 5 of 5. The complete mechanism is now visible.');
		});
	}

	function continueForward(): void {
		withActivationLock(() => {
			if (labState.stage === 'apparent-sharpening' && castClaimCount < laterGuesses.length) {
				liveMessage =
					'Cast all four additional sealed claims before continuing, or reveal the mechanism now.';
				return;
			}
			if (!dispatchCore({ type: 'continue' })) return;
			const nextStage = labState.stage;
			void focusStage(
				nextStage === 'reveal'
					? 'Step 5 of 5. The complete mechanism is now visible.'
					: 'Step ' + String(stageToStep(nextStage)) + ' of 5.'
			);
		});
	}

	function skipClues(): void {
		withActivationLock(() => {
			if (!dispatchCore({ type: 'skip', groupId: 'four-clues' })) return;
			if (!dispatchCore({ type: 'continue' })) return;
			void focusStage('Step 3 of 5. The optional clue group was skipped.');
		});
	}

	function goBack(): void {
		if (labState.stage === 'baseline') {
			if (!dispatchCore({ type: 'reset' })) return;
			void focusStage('Returned to the introduction. The sealed deck was discarded.');
			return;
		}
		if (!dispatchCore({ type: 'back' })) return;
		void focusStage(
			labState.stage === 'intro'
				? 'Returned to the introduction.'
				: 'Returned to step ' + String(stageToStep(labState.stage)) + ' of 5.'
		);
	}

	function answerQuestion(questionId: string, optionId: string): boolean {
		if (!isQuestionId(questionId) || !isValidOption(questionId, optionId)) return false;
		if (!dispatchCore({ type: 'answer', questionId, optionId })) return false;
		const question = LAB_QUESTIONS.find((candidate) => candidate.id === questionId);
		liveMessage =
			(question?.label ?? questionId) +
			' updated. The assumption ledger now marks it selected by you.';
		return true;
	}

	function confirmDefault(questionId: string, optionId?: string): void {
		if (!isQuestionId(questionId)) return;
		const current = answerForQuestion(questionId);
		const confirmed =
			current?.origin === 'demo-default'
				? dispatchCore({ type: 'confirm-default', questionId })
				: !current &&
					  optionId === DEFAULT_OPTIONS[questionId] &&
					  isValidOption(questionId, optionId)
					? dispatchCore({ type: 'answer', questionId, optionId })
					: false;
		if (!confirmed) return;
		liveMessage = 'The demo value is now marked selected by you.';
	}

	function rateStatement(statementId: string, rating: FitRating): void {
		const previous = latestRatings(stateRatings(labState)).get(statementId);
		const type = previous ? 'revise-rating' : 'rate';
		if (!dispatchCore({ type, statementId, rating })) return;
		liveMessage = 'Statement rated ' + rating.replaceAll('-', ' ') + '.';
	}

	function setWholeReadingFit(value: SixPointRating): void {
		if (!dispatchCore({ type: 'set-whole-reading-fit', value })) return;
		liveMessage = 'Whole-reading fit recorded as ' + String(value) + ' of 5.';
	}

	function castNextClaim(): void {
		if (castClaimCount >= laterGuesses.length) return;
		if (!dispatchCore({ type: 'present-next-claim' })) return;
		liveMessage =
			'Claim ' +
			String(castClaimCount) +
			' of ' +
			String(laterGuesses.length) +
			' additional sealed generic claims cast. Rating remains optional.';
	}

	function setBreadth(value: BreadthEstimate): void {
		if (!dispatchCore({ type: 'set-breadth', value })) return;
		liveMessage = 'Breadth estimate recorded: ' + value.replaceAll('-', ' ') + '.';
	}

	function setDistinctiveness(value: number): void {
		if (!Number.isInteger(value) || value < 0 || value > 5) return;
		if (!dispatchCore({ type: 'set-distinctiveness', value: value as SixPointRating })) return;
		liveMessage = 'Distinctiveness recorded as ' + String(value) + ' of 5.';
	}

	function applyCounterfactual(): void {
		if (!dispatchCore({ type: 'apply-counterfactual' })) return;
		const changed = counterfactualResult.changedSurfaceDetails.length;
		liveMessage =
			String(changed) +
			' surface details changed; the ordered core semantic IDs retained ' +
			Math.round(counterfactualResult.semanticIdOverlap) +
			'% overlap.';
	}

	function applySelfReportCounterfactual(): void {
		const current = answers.planning_style?.optionId;
		const optionIds = LAB_QUESTIONS.find(
			(question) => question.id === 'planning_style'
		)?.options.map((option) => option.id);
		let nextOption = optionIds?.find((optionId) => {
			if (optionId === current || !seed) return false;
			const profile = setCoreAnswer(answers, 'planning_style', optionId, 'user-selected');
			return Boolean(
				profile &&
				generateDirectEcho(toGenerationProfile(profile, seed), 'planning_style', genericCore)
			);
		});
		nextOption ??= optionIds?.find((optionId) => optionId !== current);
		if (!nextOption) {
			liveMessage = 'No alternative authored planning option was available for this branch.';
			return;
		}
		if (!answerQuestion('planning_style', nextOption)) return;
		if (!dispatchCore({ type: 'present-direct-echo' })) return;
		selfReportCounterfactualApplied = true;
		liveMessage =
			'Controlled self-report branch created. The guided echo remains in the audit, the current echo uses the new answer, and generic semantic IDs are unchanged.';
	}

	function openLaboratory(experiment: OpenLabExperiment = 'demographics'): void {
		activeExperiment = experiment;
		if (labState.stage === 'reveal' && !dispatchCore({ type: 'continue' })) return;
		void focusStage('Open laboratory. The guided five-step demonstration is complete.');
	}

	function replaySameDeck(): void {
		if (!dispatchCore({ type: 'replay' })) return;
		if (!dispatchCore({ type: 'present-baseline' })) return;
		selfReportCounterfactualApplied = false;
		void focusStage('Step 1 of 5. The same sealed deck is ready for replay.');
	}

	function transitionWithoutMeta(state: LabState, event: LabEvent): LabState {
		const result = transitionLabState(state, withMeta(event));
		if (!result.ok) throw new Error('Core reconstruction failed: ' + result.reason);
		return result.state;
	}

	function beginFreshState(nextSeed: string): LabState {
		const begun = transitionWithoutMeta(createInitialLabState(), { type: 'begin', seed: nextSeed });
		return transitionWithoutMeta(begun, { type: 'present-baseline' });
	}

	function revealFreshFixedState(): LabState {
		const begun = transitionWithoutMeta(createInitialLabState(), {
			type: 'begin',
			seed: '4241524e554d0100'
		});
		return transitionWithoutMeta(begun, { type: 'reveal-now' });
	}

	function requestNewSeed(): void {
		pendingDeckReplacement = { kind: 'new-seed' };
		liveMessage =
			'Creating a new seed requires confirmation because it starts a fresh in-memory trail.';
		void focusDeckReplacementConfirmation();
	}

	function requestReplayCodeLoad(code: string): string | undefined {
		const result = parseReplayCode(code, CORPUS_MANIFEST_HASH);
		if (!result.ok) {
			liveMessage = result.message;
			return result.message;
		}
		pendingDeckReplacement = {
			kind: 'replay-code',
			code: code.trim(),
			seed: result.value.seed
		};
		liveMessage =
			'Reproducibility code is valid. Confirm below to clear the current trail and load it.';
		void focusDeckReplacementConfirmation();
		return 'Code valid. Confirm below before the current in-memory trail is cleared.';
	}

	async function focusDeckReplacementConfirmation(): Promise<void> {
		await tick();
		const heading = document.getElementById('deck-replacement-heading');
		heading?.focus({ preventScroll: true });
		heading?.scrollIntoView({ block: 'center', behavior: 'auto' });
	}

	function confirmDeckReplacement(): void {
		if (!pendingDeckReplacement) return;
		const replacement = pendingDeckReplacement;
		const replacementSeed =
			replacement.kind === 'new-seed' ? createSessionSeed() : replacement.seed;
		labState = beginFreshState(replacementSeed);
		selfReportCounterfactualApplied = false;
		pendingDeckReplacement = null;
		const completionMessage =
			replacement.kind === 'new-seed'
				? 'Confirmed replacement complete. A new deterministic deck opened at Step 1 with a fresh in-memory audit trail; prior choices, ratings, and branches were cleared.'
				: 'Confirmed replacement complete. The reproducibility code opened its deck at Step 1 with a fresh in-memory audit trail; prior choices, ratings, and branches were cleared. The code contained no answers or ratings.';
		void focusStage(completionMessage + ' Three fresh sealed generic statements are ready.');
	}

	function requestReset(): void {
		const hasSelectedAnswer = Object.values(labState.displayProfile).some(
			(answer) => answer?.origin === 'user-selected'
		);
		const hasRatings = labState.stage !== 'intro' && labState.ratings.length > 0;
		const hasDerivedContent = derivativesForState(labState).length > 0;
		const hasCounterfactual = counterfactualProfileForState(labState) !== undefined;
		const hasSummaryRatings =
			wholeReadingFitForState(labState) !== undefined ||
			breadthForState(labState) !== undefined ||
			distinctivenessForState(labState) !== undefined;
		if (
			!hasSelectedAnswer &&
			!hasRatings &&
			!hasDerivedContent &&
			!hasCounterfactual &&
			!hasSummaryRatings
		) {
			resetSession();
		} else {
			resetConfirmation = true;
		}
	}

	function resetSession(showExplanation = false): void {
		labState = showExplanation ? revealFreshFixedState() : createInitialLabState();
		openSettings = { ...DEFAULT_OPEN_SETTINGS };
		selfReportCounterfactualApplied = false;
		activeExperiment = 'demographics';
		resetConfirmation = false;
		pendingDeckReplacement = null;
		void focusStage(
			showExplanation
				? 'The lab discarded its current in-memory state. The explanation is visible with a fresh fixed demonstration deck.'
				: 'The lab discarded its current in-memory state. The lab was reset.'
		);
	}

	async function openExpanded(trigger: HTMLButtonElement): Promise<void> {
		returnFocus = trigger;
		if (fullscreenAvailable) {
			try {
				await root.requestFullscreen();
				return;
			} catch {
				// A rejected Fullscreen request falls through to non-modal in-document expansion.
			}
		}
		expanded = true;
		fullscreenActive = false;
		liveMessage =
			'The laboratory expanded in the document. Press the Exit button to restore its width.';
		await tick();
		root.scrollIntoView({ block: 'start', behavior: 'auto' });
	}

	async function closeExpanded(): Promise<void> {
		if (document.fullscreenElement === root) await document.exitFullscreen();
		expanded = false;
		fullscreenActive = false;
		await tick();
		returnFocus?.focus({ preventScroll: true });
	}

	onMount(() => {
		mounted = true;
		fullscreenAvailable = Boolean(document.fullscreenEnabled && root.requestFullscreen);
		const handleFullscreen = () => {
			fullscreenActive = document.fullscreenElement === root;
			expanded = fullscreenActive;
			if (!fullscreenActive && returnFocus) void tick().then(() => returnFocus?.focus());
		};
		const clearTransientUi = () => {
			labState = createInitialLabState();
			openSettings = { ...DEFAULT_OPEN_SETTINGS };
			activeExperiment = 'demographics';
			selfReportCounterfactualApplied = false;
			resetConfirmation = false;
			pendingDeckReplacement = null;
		};
		const discardOnPageHide = () => {
			clearTransientUi();
			liveMessage = 'The prior in-memory lab state was discarded as the page was left.';
		};
		const discardPersistedPage = (event: PageTransitionEvent) => {
			if (!event.persisted) return;
			clearTransientUi();
			liveMessage = 'A back-forward-cache restoration started a fresh in-memory lab session.';
		};
		document.addEventListener('fullscreenchange', handleFullscreen);
		window.addEventListener('pagehide', discardOnPageHide);
		window.addEventListener('pageshow', discardPersistedPage);
		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreen);
			window.removeEventListener('pagehide', discardOnPageHide);
			window.removeEventListener('pageshow', discardPersistedPage);
			labState = createInitialLabState();
		};
	});
</script>

<section
	bind:this={root}
	class="barnum-lab article-breakout not-prose"
	class:expanded
	class:fullscreen-active={fullscreenActive}
	data-testid="barnum-lab"
	data-ready={mounted ? 'true' : 'false'}
	data-stage={stage}
	data-expanded={expanded ? 'true' : 'false'}
	data-tts-exclude
	data-analytics="disabled"
	data-no-track="true"
	aria-labelledby="barnum-lab-heading"
>
	<div class="lab-inner">
		<header class="lab-header">
			<div>
				<p>Editorial laboratory · local deterministic demonstration</p>
				<h2 id="barnum-lab-heading">The profile machine</h2>
				<span>Front-of-house prose above; backstage evidence always within reach.</span>
			</div>
		</header>

		<div class="lab-scroll">
			<AssumptionLedger rows={ledgerRows} revealed={stage === 'reveal' || stage === 'open-lab'} />
			<div class="lab-toolbar">
				<FullscreenControl
					active={expanded}
					available={fullscreenAvailable}
					onenter={(trigger) => void openExpanded(trigger)}
					onexit={() => void closeExpanded()}
				/>
			</div>

			{#if stage === 'intro'}
				<section class="intro" aria-labelledby="barnum-intro-heading">
					<div class="intro-copy">
						<p class="eyebrow">Before the curtain rises</p>
						<h3 id="barnum-intro-heading" bind:this={stageHeading} tabindex="-1">
							A short experiment in feeling known
						</h3>
						<p>
							This is a short local demonstration of how a reading can feel personal. It briefly
							withholds some assembly details, then shows the entire mechanism. No personality test
							is being performed, and your selections remain in this tab.
						</p>
						<p>
							There is no account, free text, lookup, profiling, storage, form submission, runtime
							AI, or lab-specific analytics event. You can reveal, stop, or reset at any point.
						</p>
					</div>
					<div class="intro-actions">
						<button class="primary" type="button" data-testid="barnum-begin" onclick={begin}>
							Begin the demonstration
						</button>
						<button type="button" data-testid="barnum-reveal-now" onclick={revealNow}>
							Skip the misdirection and inspect the machine
						</button>
					</div>
				</section>
			{:else if stage === 'open-lab'}
				<section class="open-lab" aria-labelledby="barnum-open-heading">
					<div class="stage-heading">
						<p>Guided demonstration complete</p>
						<h3 id="barnum-open-heading" bind:this={stageHeading} tabindex="-1">Open laboratory</h3>
						<span>Compare the same machine with each mechanism exposed or removed.</span>
					</div>

					<OpenLabControls
						settings={openSettings}
						{activeExperiment}
						replayCode={deckCode}
						onchange={(settings) => {
							if (settings.surfaceAdaptation !== openSettings.surfaceAdaptation) {
								liveMessage = `Surface context ${settings.surfaceAdaptation ? 'shown' : 'hidden'}. Core semantic IDs are unchanged.`;
							}
							if (settings.showNonFits !== openSettings.showNonFits) {
								liveMessage = settings.showNonFits
									? 'Non-fits restored to the Adaptive polished view. Counts and audit were always unchanged.'
									: 'Non-fits hidden only from the Adaptive polished view. Blind, Dressed, counts, misses, and audit remain unchanged.';
							}
							openSettings = settings;
						}}
						onexperiment={(experiment) => {
							activeExperiment = experiment;
							if (experiment === 'demographics') applyCounterfactual();
							if (experiment === 'feedback') {
								openSettings = { ...openSettings, feedbackAdaptation: true };
								liveMessage =
									'Feedback comparison active: sealed lines and audited derivatives are shown separately.';
							}
							if (experiment === 'hedges') {
								liveMessage = 'Hedge comparison active: paired deterministic runs are now visible.';
							}
							void tick().then(() => {
								const targetId =
									experiment === 'many-guesses'
										? 'barnum-probability'
										: experiment === 'feedback'
											? 'barnum-feedback-experiment'
											: experiment === 'hedges'
												? 'barnum-hedge-experiment'
												: 'counterfactual-heading';
								document.getElementById(targetId)?.scrollIntoView({ block: 'start' });
							});
						}}
						onreplay={replaySameDeck}
						onloadreplay={requestReplayCodeLoad}
						onnewseed={requestNewSeed}
						oncounterfactual={applyCounterfactual}
						onselfreportcounterfactual={applySelfReportCounterfactual}
						onreset={requestReset}
					/>

					{#if activeExperiment === 'demographics' || counterfactualApplied}
						<CounterfactualDiff result={counterfactualResult} />
					{/if}

					{#if openAlternative}
						<p class="method-note" data-testid="barnum-alternative-run">
							Controlled alternative run: these deck/wording controls requested a new deterministic
							local variant. The guided session’s sealed deck remains unchanged in its audit.
						</p>
					{/if}

					{#if selfReportCounterfactualApplied}
						<section
							class="experiment-callout"
							data-testid="barnum-self-report-branch"
							aria-labelledby="self-report-branch-heading"
						>
							<p>Controlled self-report branch</p>
							<h3 id="self-report-branch-heading">
								The answer changed; the guided echo was not overwritten
							</h3>
							<span>
								Original guided echo:
								<code>{directEchoCore?.coreId ?? 'empty reserved slot'}</code>. Current branch echo:
								<code>{openEchoCore?.coreId ?? 'compatibility-omitted reserved slot'}</code>. The
								audit keeps both when they differ, while all {genericCore.length} sealed generic core
								IDs remain unchanged.
							</span>
						</section>
					{/if}

					{#if activeExperiment === 'feedback'}
						<section
							id="barnum-feedback-experiment"
							class="experiment-callout"
							data-testid="barnum-feedback-experiment"
							aria-labelledby="feedback-experiment-heading"
						>
							<p>Experiment 3 · Feedback off versus on</p>
							<h3 id="feedback-experiment-heading">The source claim stays in the sealed column</h3>
							<span>
								{feedbackStatements.length} derivative{feedbackStatements.length === 1 ? '' : 's'}
								were created from eligible “fits” or “partly fits” events. Each derivative retains the
								exact source event and rating; no miss was relabelled.
							</span>
							<button
								type="button"
								aria-pressed={openSettings.feedbackAdaptation}
								onclick={() => {
									openSettings = {
										...openSettings,
										feedbackAdaptation: !openSettings.feedbackAdaptation
									};
									liveMessage = openSettings.feedbackAdaptation
										? 'Feedback derivatives shown in the Adaptive column.'
										: 'Feedback derivatives removed from the Adaptive column; sealed text is unchanged.';
								}}
							>
								{openSettings.feedbackAdaptation
									? 'Turn feedback derivatives off'
									: 'Turn feedback derivatives on'}
							</button>
						</section>
					{/if}

					{#if activeExperiment === 'hedges'}
						<HedgeComparison withoutHedges={hedgeOffView} withHedges={hedgeOnView} />
					{/if}

					{#if !openSettings.showNonFits}
						<p class="method-note" data-testid="barnum-nonfits-filter-note">
							Non-fits are hidden only from the Adaptive polished column. Blind and Dressed views,
							rating counts, the misses panel, and the full audit are unchanged.
						</p>
					{/if}

					<ReadingComparison
						blind={blindView}
						dressed={dressedView}
						adaptive={adaptiveView}
						contextLabel={openSettings.surfaceAdaptation
							? `Prepared with the ${contextLabel()} setting; the header is separate from every claim.`
							: 'Surface context dressing is off. The ordered core semantic IDs are unchanged.'}
						showProvenance={openSettings.showProvenance}
					/>

					<div data-testid="barnum-open-evidence">
						<SessionEvidence metrics={productionMetrics} />
					</div>

					<section
						id="barnum-open-misses"
						class="misses"
						data-testid="barnum-open-misses"
						aria-labelledby="open-misses-heading"
					>
						<p>Nothing swept away</p>
						<h4 id="open-misses-heading">Misses remain outside the polished filter</h4>
						{#if missStatements.length}
							<ul>
								{#each missStatements as statement (statement.id)}
									<li>
										<strong>{statement.rating.replaceAll('-', ' ')}:</strong>
										{statement.text}
									</li>
								{/each}
							</ul>
						{:else}
							<p>No non-fit or too-vague judgment was recorded in this session.</p>
						{/if}
					</section>

					<div data-testid="barnum-open-audit">
						<StatementAudit statements={openAuditStatements} events={auditEvents} />
					</div>

					<div id="barnum-probability" data-testid="barnum-probability-workbench">
						{#if activeExperiment === 'many-guesses'}
							<p class="method-note" data-testid="barnum-many-guesses-experiment">
								Experiment 2 is active. Change the stated hypothetical probability and number of
								claims; the workbench reports formulas and natural frequencies, never personal
								“accuracy”.
							</p>
						{/if}
						<ProbabilityWorkbench probability={probabilityAdapter} />
					</div>

					<DefensiveFieldGuide />
				</section>
			{:else}
				<section class="guided" aria-labelledby="guided-stage-heading">
					{#if stepNumber}
						<StageProgress
							step={stepNumber}
							timeLabel={TIME_LABELS[stage as Exclude<LabStage, 'intro' | 'open-lab'>]}
						/>
					{/if}

					{#if stage === 'baseline'}
						<div class="stage-heading">
							<p>Step 1 of 5 · sealed before clues</p>
							<h3 id="guided-stage-heading" bind:this={stageHeading} tabindex="-1">
								Start with almost nothing
							</h3>
							<span>
								Reproducibility code <code>{deckCode}</code>. It encodes the 64-bit seed,
								engine/corpus versions, corpus manifest, and checksum—no answers or ratings. It is
								not a cryptographic proof.
							</span>
						</div>
						<div class="reading-grid">
							{#each baselineStatements as statement, index (statement.id)}
								<ReadingCard
									{statement}
									index={index + 1}
									onrate={(rating) => rateStatement(statement.id, rating)}
								/>
							{/each}
						</div>
						<p class="method-note">
							Ratings are optional. “Too vague to test” stays its own judgment and cannot drive
							later adaptation.
						</p>
					{:else if stage === 'four-clues'}
						<div class="stage-heading">
							<p>Step 2 of 5 · four optional controls</p>
							<h3 id="guided-stage-heading" bind:this={stageHeading} tabindex="-1">
								Add four clues
							</h3>
							<span>Three are stage dressing. Planning style can support one direct echo.</span>
						</div>
						<div class="clue-grid">
							{#each mainQuestions as question (question.id)}
								<ClueFieldset
									{question}
									answer={answerForQuestion(question.id)}
									defaultOptionId={defaultOptionForQuestion(question.id)}
									onanswer={answerQuestion}
									onconfirm={confirmDefault}
								/>
							{/each}
						</div>
						<details class="extra-clues">
							<summary>Add more harmless clues</summary>
							<div class="clue-grid">
								{#each extraQuestions as question (question.id)}
									<ClueFieldset
										{question}
										answer={answerForQuestion(question.id)}
										defaultOptionId={defaultOptionForQuestion(question.id)}
										onanswer={answerQuestion}
										onconfirm={confirmDefault}
									/>
								{/each}
							</div>
						</details>
						<button
							class="skip-clues"
							type="button"
							data-testid="barnum-skip-clues"
							onclick={skipClues}
						>
							Skip this group
						</button>
						<ConfidenceProp
							value={confidenceValue}
							{answeredCount}
							decoration={confidenceDecoration}
						/>
					{:else if stage === 'apparent-sharpening'}
						<div class="stage-heading">
							<p id="barnum-claims-cast">
								Step 3 of 5 · {castClaimCount + (echoStatement ? 1 : 0)} of {laterGuesses.length +
									(echoStatement ? 1 : 0)} new claims cast
							</p>
							<h3 id="guided-stage-heading" bind:this={stageHeading} tabindex="-1">
								Watch the reading appear to sharpen
							</h3>
							<span
								>Prepared with the {contextLabel()} demo setting. This header is separate from every personality
								claim.</span
							>
						</div>
						<section class="unchanged-baseline" aria-labelledby="unchanged-heading">
							<h4 id="unchanged-heading">The first three lines remain literally unchanged</h4>
							<ol>
								{#each baselineStatements as statement (statement.id)}<li>
										{statement.text}
									</li>{/each}
							</ol>
						</section>
						{#if echoStatement}
							<ReadingCard
								statement={echoStatement}
								index={4}
								onrate={(rating) => rateStatement(echoStatement!.id, rating)}
							/>
						{:else}
							<p class="method-note">
								{#if answers.planning_style}
									A planning answer was supplied, but its authored echo conflicted with the sealed
									deck’s compatibility rules. The reserved echo slot stayed empty; the generic deck
									was not reshuffled.
								{:else}
									No planning answer was supplied, so the reserved direct-echo slot remains empty.
								{/if}
							</p>
						{/if}
						<div id="barnum-cast-claims" class="reading-grid two-columns">
							{#each visibleLaterGuesses as statement, index (statement.id)}
								<ReadingCard
									{statement}
									index={index + (echoStatement ? 5 : 4)}
									onrate={(rating) => rateStatement(statement.id, rating)}
								/>
							{/each}
						</div>
						{#if castClaimCount < laterGuesses.length}
							<button
								class="cast-next"
								type="button"
								data-testid="barnum-cast-next"
								aria-controls="barnum-cast-claims"
								aria-describedby="barnum-claims-cast"
								onclick={castNextClaim}
							>
								Cast next sealed claim — continue without rating
							</button>
						{:else}
							<p class="method-note" role="status">
								All four additional sealed claims have been cast. The whole-reading rating remains
								optional.
							</p>
						{/if}
						<fieldset class="whole-rating">
							<legend>How personally fitting does this reading feel now?</legend>
							<div>
								{#each SIX_POINT_VALUES as value (value)}
									<label>
										<input
											type="radio"
											name="whole-reading-fit"
											checked={wholeReadingFit === value}
											onchange={() => setWholeReadingFit(value)}
										/>
										<span>{value}</span>
									</label>
								{/each}
							</div>
						</fieldset>
						<p class="method-note">
							A change in one session may reflect repetition, order, demand effects, the new echo,
							or ordinary rating variation. This comparison cannot identify a cause.
						</p>
					{:else if stage === 'feedback-and-counterfactual'}
						<div class="stage-heading">
							<p>Step 4 of 5 · feedback reuse and invariance</p>
							<h3 id="guided-stage-heading" bind:this={stageHeading} tabindex="-1">
								Feed the reader, then change the supposed person
							</h3>
							<span
								>Some earlier clicks may now influence two new statements. The originals and
								complete trail remain visible.</span
							>
						</div>
						{#if feedbackStatements.length}
							<div class="reading-grid two-columns">
								{#each feedbackStatements as statement, index (statement.id)}
									<ReadingCard {statement} index={index + 1} reveal showRating={false} />
								{/each}
							</div>
						{:else}
							<p class="method-note">
								No “fits” or “partly fits” rating is eligible, so the reader has no honest
								feedback-derived card to show.
							</p>
						{/if}
						<button class="counterfactual-button" type="button" onclick={applyCounterfactual}>
							Change every demographic clue
						</button>
						{#if counterfactualApplied}<CounterfactualDiff result={counterfactualResult} />{/if}
					{:else if stage === 'reveal'}
						<div class="stage-heading reveal-heading">
							<p>Step 5 of 5 · complete debrief</p>
							<h3 id="guided-stage-heading" bind:this={stageHeading} tabindex="-1">
								Lift the floorboards
							</h3>
							<span
								>The profile did not read your mind. It laid out roomy sentences and let your memory
								furnish them.</span
							>
						</div>

						<nav class="reveal-links" aria-label="Reveal sections">
							<a href="#barnum-xrays">Statement X-rays</a>
							<a href="#barnum-evidence">Honest measurements</a>
							<a href="#barnum-misses">Misses</a>
							<a href="#barnum-audit">Full audit</a>
						</nav>

						<section id="barnum-xrays" class="x-rays" aria-labelledby="xray-heading">
							<h4 id="xray-heading">Three representative X-rays</h4>
							<div class="reading-grid">
								{#each [baselineStatements[0], echoStatement, feedbackStatements[0]].filter( (statement): statement is ReadingStatement => Boolean(statement) ) as statement, index (statement.id)}
									<ReadingCard {statement} index={index + 1} reveal showRating={false} />
								{/each}
							</div>
						</section>

						<ConfidenceProp
							value={confidenceValue}
							{answeredCount}
							decoration={confidenceDecoration}
							revealed
						/>

						<div id="barnum-evidence" class="evidence-grid">
							<FitEvidenceChart
								counts={ratingCounts}
								{wholeReadingFit}
								{breadth}
								{distinctiveness}
								onbreadthchange={setBreadth}
								ondistinctivenesschange={setDistinctiveness}
							/>
							<SessionEvidence metrics={productionMetrics} />
						</div>

						<section id="barnum-misses" class="misses" aria-labelledby="misses-heading">
							<p>Nothing swept away</p>
							<h4 id="misses-heading">Original misses and “too vague” judgments</h4>
							{#if missStatements.length}
								<ul>
									{#each missStatements as statement (statement.id)}<li>
											<strong>{statement.rating.replaceAll('-', ' ')}:</strong>
											{statement.text}
										</li>{/each}
								</ul>
							{:else}
								<p>
									No such judgments were made. Unrated statements remain visible in the full audit.
								</p>
							{/if}
						</section>

						<section class="debrief" aria-labelledby="debrief-heading">
							<h4 id="debrief-heading">What the experiment can honestly say</h4>
							<ul>
								<li>A true sentence can still reveal almost nothing about you.</li>
								<li>Fit is not distinctiveness.</li>
								<li>
									Some later wording came from your own clicks; the engine did not discover it.
								</li>
								<li>More distinct guesses create more opportunities for an endorsed match.</li>
								<li>This demonstration shows a method, not a diagnosis of your reasoning.</li>
							</ul>
						</section>

						<div id="barnum-audit">
							<StatementAudit statements={auditStatements} events={auditEvents} />
						</div>

						<div class="reveal-actions">
							<button
								class="primary"
								type="button"
								data-testid="barnum-open-lab"
								onclick={() => openLaboratory()}
							>
								Open the laboratory
							</button>
							<button type="button" onclick={replaySameDeck}>Replay the same sealed deck</button>
							<button type="button" data-testid="barnum-reset" onclick={requestReset}>
								Reset and erase this session
							</button>
						</div>
					{/if}

					{#if stage !== 'reveal'}
						<footer class="guided-actions">
							<div class="guided-left">
								{#if stage !== 'baseline'}
									<button type="button" data-testid="barnum-back" onclick={goBack}>Back</button>
								{/if}
								<button type="button" data-testid="barnum-reset" onclick={requestReset}>
									Reset and erase this session
								</button>
							</div>
							<div>
								<button type="button" data-testid="barnum-reveal-now" onclick={revealNow}>
									Reveal the mechanism now
								</button>
								<button
									class="primary"
									type="button"
									data-testid="barnum-continue"
									disabled={stage === 'apparent-sharpening' && castClaimCount < laterGuesses.length}
									aria-describedby={stage === 'apparent-sharpening'
										? 'barnum-claims-cast'
										: undefined}
									onclick={continueForward}
								>
									{stage === 'four-clues'
										? 'Continue or skip this group'
										: stage === 'baseline' || stage === 'apparent-sharpening'
											? 'Continue without rating'
											: 'Continue to the reveal'}
								</button>
							</div>
						</footer>
					{/if}
				</section>
			{/if}

			{#if pendingDeckReplacement}
				<section
					class="reset-confirmation"
					data-testid="barnum-deck-replacement-confirmation"
					aria-labelledby="deck-replacement-heading"
				>
					<h3 id="deck-replacement-heading" tabindex="-1">Start a fresh in-memory lab trail?</h3>
					<p>
						{pendingDeckReplacement.kind === 'new-seed'
							? 'Creating a new seed clears the current choices, ratings, branches, derivatives, and append-only audit. It then opens a genuinely fresh Step 1; no visitor actions are synthesized.'
							: `Loading ${pendingDeckReplacement.code} clears the current choices, ratings, branches, derivatives, and append-only audit. It then opens that deck at a genuinely fresh Step 1; no visitor actions are synthesized, and the code itself contains no answers or ratings.`}
					</p>
					<div>
						<button
							class="primary"
							type="button"
							data-testid="barnum-confirm-deck-replacement"
							onclick={confirmDeckReplacement}
						>
							Clear current trail and continue
						</button>
						<button
							type="button"
							data-testid="barnum-cancel-deck-replacement"
							onclick={() => {
								pendingDeckReplacement = null;
								liveMessage = 'Deck replacement cancelled; the current trail is unchanged.';
							}}>Keep current trail</button
						>
					</div>
				</section>
			{/if}

			{#if resetConfirmation}
				<section class="reset-confirmation" aria-labelledby="reset-confirmation-heading">
					<h3 id="reset-confirmation-heading">Discard the current lab state?</h3>
					<p>The audit has content. You can reset while keeping the explanation visible.</p>
					<div>
						<button class="primary" type="button" onclick={() => resetSession(true)}>
							Reset and show the explanation
						</button>
						<button type="button" onclick={() => resetSession(false)}>Reset immediately</button>
						<button type="button" onclick={() => (resetConfirmation = false)}>Cancel</button>
					</div>
				</section>
			{/if}

			<footer class="privacy">
				<strong>Private by design, within the limits of this page.</strong>
				<p>
					This lab does not intentionally transmit or persist your selections or ratings. They
					remain in this component’s current in-memory session; Reset discards that state, and a
					normal reload starts a new session. It requests no name, contact details, account, exact
					address, or date of birth. Country, city, age band, language, and gender can still be
					personal context in combination, which is why the lab does not retain them. Ordinary site
					analytics may still record that this page was visited.
				</p>
			</footer>

			<noscript>
				<section class="noscript-poster">
					<h3>The mechanism without JavaScript</h3>
					<p>
						A true-sounding broad claim may fit many people and still have little individualizing
						value. The article around this disabled lab preserves the history, probability formula,
						limitations, privacy statement, checklist, and sources.
					</p>
				</section>
			</noscript>
		</div>

		<section class="print-only" aria-labelledby="barnum-print-heading">
			<div class="print-summary">
				<p>Non-personal provenance summary</p>
				<h2 id="barnum-print-heading">How the local profile machine works</h2>
				<p>
					The reading is assembled deterministically from an original local corpus. Demographic
					context never selects personality claims; direct echoes remain labeled; feedback
					derivatives retain their source event; and misses remain part of the in-memory audit.
				</p>
				<dl>
					<div>
						<dt>Corpus</dt>
						<dd>{CORPUS_VERSION}</dd>
					</div>
					<div>
						<dt>Approved fragments</dt>
						<dd>{CORPUS_FRAGMENT_COUNT}</dd>
					</div>
					<div>
						<dt>Manifest</dt>
						<dd>{CORPUS_MANIFEST_HASH}</dd>
					</div>
					<div>
						<dt>Engine</dt>
						<dd>{ENGINE_VERSION}</dd>
					</div>
				</dl>
				<p>No visitor selections, context values, ratings, readings, or replay seed are printed.</p>
			</div>
			<DefensiveFieldGuide
				headingId="barnum-print-field-guide-heading"
				testId={null}
				interactive={false}
			/>
		</section>

		<p class="live-region" aria-live="polite" aria-atomic="true">{liveMessage}</p>
	</div>
</section>

<style>
	:global(body:has(.barnum-lab:fullscreen)) {
		overflow: hidden;
	}

	.barnum-lab {
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		container-name: barnum-lab;
		container-type: inline-size;
		width: min(96rem, calc(100vw - 1rem));
		min-width: 0;
		margin: clamp(1.5rem, 5vw, 4rem) 0;
		transform: translateX(-50%);
		border: 1px solid var(--rule);
		border-radius: 0.8rem;
		background: var(--paper);
		box-shadow: var(--shadow-overlay);
		color: var(--ink);
		isolation: isolate;
		--barnum-paper: var(--paper);
		--barnum-soft: var(--paper-soft);
		--barnum-raised: var(--paper-raised);
		--barnum-ink: var(--ink);
		--barnum-muted: var(--ink-muted);
		--barnum-rule: var(--rule);
		--barnum-control: var(--control-border);
		--barnum-focus: var(--focus);
		--barnum-sans: var(--font-sans, sans-serif);
		--barnum-serif: var(--font-serif, serif);
		--barnum-mono: var(--font-mono, ui-monospace, monospace);
		--barnum-vermilion: color-mix(in oklab, #b34b35 82%, var(--ink));
		--barnum-vermilion-text: color-mix(in oklab, #b34b35 74%, var(--ink));
		--barnum-blue: color-mix(in oklab, #315c79 82%, var(--ink));
		--barnum-blue-text: color-mix(in oklab, #315c79 72%, var(--ink));
		--barnum-blue-contrast: var(--paper-raised);
		--barnum-ochre: color-mix(in oklab, #a66b1e 80%, var(--ink));
		--barnum-ochre-text: color-mix(in oklab, #9c641c 72%, var(--ink));
	}

	:global(.dark) .barnum-lab,
	:global([data-theme='night']) .barnum-lab {
		--barnum-vermilion: #d98570;
		--barnum-vermilion-text: #d98570;
		--barnum-blue-text: #7599af;
		--barnum-blue-contrast: #fffaf3;
	}

	.barnum-lab,
	.barnum-lab * {
		box-sizing: border-box;
	}

	.lab-inner {
		min-width: 0;
	}

	.print-only {
		display: none;
	}

	.lab-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--barnum-rule);
		background: var(--barnum-raised);
		padding: 0.75rem clamp(0.65rem, 2cqi, 1.1rem);
	}

	.lab-header p,
	.lab-header h2,
	.lab-header span,
	.stage-heading p,
	.stage-heading h3,
	.stage-heading span,
	.intro p,
	.intro h3,
	.method-note,
	.experiment-callout p,
	.experiment-callout h3,
	.experiment-callout span,
	.unchanged-baseline h4,
	.unchanged-baseline ol,
	.x-rays h4,
	.misses p,
	.misses h4,
	.misses ul,
	.debrief h4,
	.debrief ul,
	.privacy p,
	.reset-confirmation h3,
	.reset-confirmation p,
	.noscript-poster h3,
	.noscript-poster p {
		margin: 0;
	}

	.lab-header p,
	.stage-heading p,
	.eyebrow,
	.misses > p:first-child {
		color: var(--barnum-vermilion-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.lab-header h2 {
		margin-top: 0.1rem;
		font: 820 clamp(1rem, 2.2cqi, 1.3rem) / 1.1 var(--barnum-sans);
		letter-spacing: -0.02em;
	}

	.lab-header div > span {
		display: block;
		margin-top: 0.12rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.4 var(--barnum-sans);
	}

	.lab-scroll {
		display: grid;
		gap: 1rem;
		min-width: 0;
		padding: clamp(0.55rem, 1.8cqi, 1.1rem);
	}

	.lab-toolbar {
		display: flex;
		justify-content: flex-end;
		margin-top: -0.45rem;
	}

	.intro,
	.guided,
	.open-lab {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	.intro {
		grid-template-columns: minmax(0, 1.3fr) minmax(16rem, 0.7fr);
		align-items: end;
		border: 1px solid var(--barnum-rule);
		border-left: 4px solid var(--barnum-blue);
		border-radius: 0.55rem;
		background: var(--barnum-raised);
		padding: clamp(0.85rem, 2.4cqi, 1.4rem);
	}

	.intro-copy h3,
	.stage-heading h3 {
		margin-top: 0.14rem;
		font: 820 clamp(1.15rem, 3cqi, 1.65rem) / 1.12 var(--barnum-sans);
		letter-spacing: -0.025em;
	}

	.intro-copy > p:not(.eyebrow) {
		margin-top: 0.6rem;
		max-width: 54rem;
		color: var(--barnum-muted);
		font: 0.76rem/1.55 var(--barnum-sans);
	}

	.intro-actions,
	.reveal-actions {
		display: grid;
		gap: 0.45rem;
	}

	button,
	a {
		-webkit-tap-highlight-color: transparent;
	}

	.intro-actions button,
	.guided-actions button,
	.reveal-actions button,
	.counterfactual-button,
	.cast-next,
	.skip-clues,
	.experiment-callout button,
	.reset-confirmation button {
		min-height: 2.75rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.4rem;
		background: var(--barnum-raised);
		padding: 0.52rem 0.68rem;
		color: var(--barnum-ink);
		font: 750 0.75rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	button.primary {
		border-color: var(--barnum-blue);
		background: var(--barnum-blue);
		color: var(--barnum-blue-contrast);
	}

	button:hover {
		border-color: var(--barnum-blue);
	}

	button:focus-visible,
	a:focus-visible,
	h3[tabindex='-1']:focus-visible,
	details summary:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.stage-heading {
		border-left: 4px solid var(--barnum-vermilion);
		padding: 0.2rem 0 0.2rem 0.8rem;
		scroll-margin-top: 1rem;
	}

	.stage-heading > span {
		display: block;
		margin-top: 0.28rem;
		max-width: 58rem;
		color: var(--barnum-muted);
		font: 0.75rem/1.5 var(--barnum-sans);
	}

	.stage-heading code {
		font: 0.72rem/1.35 var(--barnum-mono);
	}

	.reading-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.reading-grid.two-columns {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.method-note {
		border-left: 3px solid var(--barnum-rule);
		padding-left: 0.65rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.experiment-callout {
		display: grid;
		gap: 0.5rem;
		border: 1px solid var(--barnum-rule);
		border-left: 4px solid var(--barnum-blue);
		border-radius: 0.5rem;
		background: var(--barnum-raised);
		padding: 0.8rem;
	}

	.experiment-callout p {
		color: var(--barnum-blue-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.experiment-callout h3 {
		font: 800 0.95rem/1.25 var(--barnum-sans);
	}

	.experiment-callout span {
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.experiment-callout code {
		font: 0.7rem/1.4 var(--barnum-mono);
		overflow-wrap: anywhere;
	}

	.experiment-callout button {
		width: fit-content;
	}

	.clue-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.extra-clues {
		border: 1px solid var(--barnum-rule);
		border-radius: 0.45rem;
		background: var(--barnum-soft);
	}

	.extra-clues > summary {
		min-height: 3.25rem;
		padding: 0.78rem;
		font: 760 0.75rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	.extra-clues > .clue-grid {
		border-top: 1px solid var(--barnum-rule);
		padding: 0.65rem;
	}

	.unchanged-baseline,
	.whole-rating,
	.misses,
	.debrief,
	.reset-confirmation,
	.noscript-poster {
		border: 1px solid var(--barnum-rule);
		border-radius: 0.48rem;
		background: var(--barnum-raised);
		padding: 0.75rem;
	}

	.unchanged-baseline h4,
	.x-rays h4,
	.misses h4,
	.debrief h4 {
		font: 780 0.78rem/1.3 var(--barnum-sans);
	}

	.unchanged-baseline ol,
	.misses ul,
	.debrief ul {
		display: grid;
		gap: 0.35rem;
		margin-top: 0.5rem;
		padding-left: 1.15rem;
	}

	.unchanged-baseline li,
	.misses li,
	.debrief li,
	.misses > p:last-child {
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.whole-rating {
		margin: 0;
	}

	.whole-rating legend {
		padding-inline: 0.2rem;
		font: 760 0.75rem/1.4 var(--barnum-sans);
	}

	.whole-rating > div {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.whole-rating label {
		position: relative;
		display: grid;
		min-height: 2.75rem;
		place-items: center;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		font: 750 0.72rem/1 var(--barnum-mono);
		cursor: pointer;
	}

	.whole-rating input {
		position: absolute;
		opacity: 0;
	}

	.whole-rating label:has(input:checked) {
		border-color: var(--barnum-blue);
		background: color-mix(in oklab, var(--barnum-blue) 10%, var(--barnum-paper));
		box-shadow: inset 0 0 0 1px var(--barnum-blue);
	}

	.counterfactual-button {
		width: fit-content;
		border-color: var(--barnum-blue);
	}

	.cast-next {
		width: fit-content;
		border-color: var(--barnum-blue);
	}

	.skip-clues {
		width: fit-content;
	}

	.reveal-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.reveal-links a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		border: 1px solid var(--barnum-control);
		border-radius: 999px;
		padding: 0.42rem 0.65rem;
		color: var(--barnum-blue-text);
		font: 750 0.72rem/1.25 var(--barnum-sans);
		text-decoration: none;
	}

	.x-rays {
		display: grid;
		gap: 0.55rem;
		scroll-margin-top: 1rem;
	}

	.evidence-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		scroll-margin-top: 1rem;
	}

	.misses {
		border-left: 4px solid var(--barnum-vermilion);
		scroll-margin-top: 1rem;
	}

	.misses h4 {
		margin-top: 0.12rem;
	}

	.debrief {
		border-left: 4px solid var(--barnum-ochre);
	}

	.reveal-actions {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.guided-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.55rem;
		border-top: 1px solid var(--barnum-rule);
		padding-top: 0.75rem;
	}

	.guided-actions > div {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.45rem;
	}

	.guided-actions > .guided-left {
		justify-content: flex-start;
	}

	.guided-actions button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.reset-confirmation {
		border: 2px solid var(--barnum-vermilion);
	}

	.reset-confirmation h3 {
		font: 790 0.9rem/1.25 var(--barnum-sans);
	}

	.reset-confirmation p {
		margin-top: 0.25rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.45 var(--barnum-sans);
	}

	.reset-confirmation > div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.65rem;
	}

	.privacy {
		border-top: 1px solid var(--barnum-rule);
		padding-top: 0.75rem;
	}

	.privacy strong,
	.privacy p {
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.privacy strong {
		font-weight: 780;
	}

	.privacy p {
		margin-top: 0.2rem;
		color: var(--barnum-muted);
	}

	.live-region {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.barnum-lab:fullscreen,
	.barnum-lab.fullscreen-active {
		left: 0;
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		width: 100vw;
		height: 100svh;
		min-height: 100svh;
		margin: 0;
		transform: none;
		overflow: hidden;
		border: 0;
		border-radius: 0;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
			env(safe-area-inset-left);
	}

	@supports (height: 100dvh) {
		.barnum-lab:fullscreen,
		.barnum-lab.fullscreen-active {
			height: 100dvh;
		}
	}

	.barnum-lab.expanded:not(:fullscreen) {
		width: 100vw;
		border-radius: 0;
	}

	.barnum-lab:fullscreen .lab-inner,
	.barnum-lab.fullscreen-active .lab-inner {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		min-height: 0;
	}

	.barnum-lab:fullscreen .lab-scroll,
	.barnum-lab.fullscreen-active .lab-scroll {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}

	@container barnum-lab (max-width: 62rem) {
		.reading-grid {
			grid-template-columns: 1fr;
		}

		.reading-grid.two-columns,
		.evidence-grid {
			grid-template-columns: 1fr;
		}
	}

	@container barnum-lab (max-width: 46rem) {
		.intro {
			grid-template-columns: 1fr;
			align-items: stretch;
		}

		.clue-grid {
			grid-template-columns: 1fr;
		}

		.reveal-actions {
			grid-template-columns: 1fr;
		}

		.guided-actions {
			align-items: stretch;
			flex-direction: column;
		}

		.guided-actions > div {
			display: grid;
			grid-template-columns: 1fr;
		}
	}

	@container barnum-lab (max-width: 30rem) {
		.lab-header {
			align-items: flex-start;
		}

		.lab-header div > span {
			display: none;
		}

		.whole-rating > div {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.barnum-lab {
			left: 50%;
			width: calc(100vw - 0.75rem);
		}

		.guided-actions > div {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.guided-actions > .guided-left > :only-child {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 640px) and (min-height: 28rem) {
		.guided-actions {
			position: sticky;
			z-index: 4;
			bottom: 0;
			margin-inline: -0.65rem;
			border-bottom: 1px solid var(--barnum-rule);
			background: var(--barnum-paper);
			box-shadow: 0 -0.55rem 1rem color-mix(in oklab, var(--barnum-ink) 9%, transparent);
			padding: 0.65rem 0.65rem max(0.65rem, env(safe-area-inset-bottom));
		}
	}

	@media (max-height: 30rem) and (orientation: landscape) {
		.barnum-lab:not(:fullscreen) .lab-header {
			position: static;
		}

		.guided-actions {
			position: static;
			margin-inline: 0;
			border-bottom: 0;
			box-shadow: none;
			padding: 0.75rem 0 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.barnum-lab *,
		.barnum-lab *::before,
		.barnum-lab *::after {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}

	@media print {
		.barnum-lab {
			left: 0;
			width: 100%;
			margin: 1rem 0;
			transform: none;
			box-shadow: none;
		}

		.lab-header,
		.lab-scroll,
		.live-region {
			display: none;
		}

		.print-only {
			display: grid;
			gap: 1rem;
		}

		.print-summary {
			display: grid;
			gap: 0.5rem;
			border: 1px solid currentColor;
			padding: 1rem;
		}

		.print-summary p,
		.print-summary h2,
		.print-summary dl,
		.print-summary dt,
		.print-summary dd {
			margin: 0;
		}

		.print-summary dl {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.35rem 1rem;
		}

		.print-summary dl > div {
			display: grid;
			grid-template-columns: auto 1fr;
			gap: 0.4rem;
		}
	}

	@media (forced-colors: active) {
		.barnum-lab {
			--barnum-vermilion: CanvasText;
			--barnum-vermilion-text: CanvasText;
			--barnum-blue: Highlight;
			--barnum-blue-text: CanvasText;
			--barnum-blue-contrast: HighlightText;
			--barnum-ochre: CanvasText;
			--barnum-ochre-text: CanvasText;
			border-color: CanvasText;
		}

		.lab-header,
		.intro,
		.stage-heading,
		.method-note,
		.extra-clues,
		.extra-clues > .clue-grid,
		.unchanged-baseline,
		.whole-rating,
		.misses,
		.debrief,
		.reset-confirmation,
		.noscript-poster,
		.privacy,
		.guided-actions {
			border-color: CanvasText;
		}
	}
</style>
