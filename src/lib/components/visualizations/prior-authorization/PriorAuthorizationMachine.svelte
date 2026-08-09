<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import {
		compilePriorAuthorizationComparison,
		createInitialPresentationState,
		MILESTONE_BY_ID,
		parsePriorAuthorizationUrlState,
		serializePriorAuthorizationUrlState,
		transitionPresentation,
		type ComparisonRun,
		type FailureId,
		type PathwayId,
		type PerspectiveId,
		type PresentationCommand,
		type PresentationState,
		type PriorAuthorizationViewId
	} from '$lib/visualizations/prior-authorization';
	import AuthorizationHero from './AuthorizationHero.svelte';
	import CompactJourney from './CompactJourney.svelte';
	import ScenarioAssumptions from './ScenarioAssumptions.svelte';
	import { formatHumanWork, formatMachineTime, formatPatientElapsed } from './format';
	import { toUiFailures, toUiRun } from './view-model';
	import type { UiClockSnapshot } from './ui-types';

	type MachineStageComponent = typeof import('./MachineStage.svelte').default;
	type ExperienceState = 'static' | 'loading' | 'interactive' | 'error';

	// Tablets get the full, stacked graph route after explicit entry. The 720 CSS-pixel
	// zoom proxy and phone widths remain on CompactJourney.
	const WIDE_STAGE_QUERY = '(min-width: 48rem) and (min-height: 38rem)';
	const ZERO_CLOCK: UiClockSnapshot = Object.freeze({
		patientElapsedMinutes: 0,
		humanWorkSeconds: 0,
		automatedProcessingMs: 0,
		providerWorkSeconds: 0,
		payerWorkSeconds: 0,
		schedulingWorkSeconds: 0
	});
	// Prerendered pages cannot inspect request query parameters. Render the canonical
	// default on the server, then restore an allowlisted view from location on mount.
	const initialUrl = parsePriorAuthorizationUrlState(new URLSearchParams());
	const comparisonCache = new Map<FailureId, ComparisonRun>();
	const failures = toUiFailures();

	let root!: HTMLElement;
	let mounted = $state(false);
	let journeyStarted = $state(false);
	let eligibleForWideStage = $state(false);
	let reducedMotion = $state(false);
	let highContrast = $state(false);
	let experience = $state<ExperienceState>('static');
	let stageComponent: MachineStageComponent | null = $state(null);
	let enhancementMessage = $state('');
	let urlIssues = $state(initialUrl.issues.length);
	let urlTimer: ReturnType<typeof setTimeout> | null = null;
	let presentation: PresentationState = $state(
		createInitialPresentationState({
			pathway: initialUrl.state.path,
			view: initialUrl.state.view,
			failureId: initialUrl.state.failure,
			milestoneIndex: initialUrl.state.step,
			perspective: initialUrl.state.perspective,
			mode: 'ready'
		})
	);

	let comparison = $derived(comparisonFor(presentation.failureId));
	let portalRun = $derived(toUiRun(comparison.portalFax));
	let fhirRun = $derived(toUiRun(comparison.fhirEnabled));
	let baselineFhirClock = $derived(toUiRun(comparisonFor('none').fhirEnabled).clock);
	let run = $derived(presentation.pathway === 'portal-fax' ? portalRun : fhirRun);
	let progressionIndices = $derived(
		run.steps.filter((step) => step.status !== 'bypassed').map((step) => step.index)
	);
	let activeClock = $derived(run.steps[presentation.milestoneIndex]?.clock ?? run.clock);
	let experienceAttribute = $derived.by((): 'static' | 'interactive' =>
		experience === 'interactive' ? 'interactive' : 'static'
	);
	let motionPolicy = $derived(reducedMotion ? 'stable-states' : 'timed-tableaux');

	function comparisonFor(failureId: FailureId): ComparisonRun {
		const cached = comparisonCache.get(failureId);
		if (cached) return cached;
		const compiled = compilePriorAuthorizationComparison(failureId);
		comparisonCache.set(failureId, compiled);
		return compiled;
	}

	function dispatch(command: PresentationCommand): void {
		presentation = transitionPresentation(presentation, command);
	}

	function changePathway(pathway: PathwayId): void {
		dispatch({ type: 'SET_PATHWAY', pathway });
	}

	function changePerspective(perspective: PerspectiveId): void {
		dispatch({ type: 'SET_PERSPECTIVE', perspective });
	}

	function changeView(view: PriorAuthorizationViewId): void {
		dispatch({ type: 'SET_VIEW', view });
	}

	function changeStep(milestoneIndex: number): void {
		dispatch({ type: 'SET_STEP', milestoneIndex });
	}

	function changeFailure(failureId: string): void {
		if (!failures.some((failure) => failure.id === failureId) && failureId !== 'none') return;
		const nextFailure = failureId as FailureId;
		const nextComparison = comparisonFor(nextFailure);
		const nextRun =
			presentation.pathway === 'portal-fax' ? nextComparison.portalFax : nextComparison.fhirEnabled;
		const rewindIndex = nextRun.failureImpact
			? MILESTONE_BY_ID[nextRun.failureImpact.rewindMilestone].index
			: presentation.milestoneIndex;
		dispatch({
			type: 'SELECT_FAILURE',
			failureId: nextFailure,
			rewindIndex: Math.min(presentation.milestoneIndex, rewindIndex)
		});
	}

	async function beginJourney(): Promise<void> {
		// BEGIN deliberately starts a fresh presentation at milestone zero. A canonical
		// deep link, however, represents an explicitly requested tableau and must survive
		// the enhancement boundary when the visitor chooses to reveal the wide stage.
		const restoredStep = presentation.milestoneIndex;
		journeyStarted = true;
		dispatch({ type: 'BEGIN' });
		if (restoredStep > 0) changeStep(restoredStep);
		if (!mounted) return;
		if (!eligibleForWideStage) {
			dispatch({ type: 'SET_COMPACT', compact: true });
			enhancementMessage =
				'The compact journey is active. Rotate to a wide landscape display to offer the full diagram.';
			await tick();
			document
				.getElementById('pa-text-journey')
				?.scrollIntoView({ block: 'start', behavior: 'auto' });
			return;
		}
		await loadWideStage();
	}

	async function loadWideStage(): Promise<void> {
		if (experience === 'loading' || experience === 'interactive') return;
		if (!eligibleForWideStage) {
			enhancementMessage =
				'The full diagram needs at least 768 CSS pixels of width and 608 pixels of height.';
			return;
		}
		experience = 'loading';
		enhancementMessage = 'Preparing the deterministic machine…';
		try {
			const loaded = await import('./MachineStage.svelte');
			stageComponent = loaded.default;
			dispatch({ type: 'SET_COMPACT', compact: false });
			experience = 'interactive';
			enhancementMessage = '';
			await tick();
			root
				.querySelector<HTMLElement>('[data-testid="machine-stage"]')
				?.focus({ preventScroll: true });
			root
				.querySelector<HTMLElement>('[data-testid="machine-stage"]')
				?.scrollIntoView({ block: 'start', behavior: 'auto' });
		} catch (error) {
			experience = 'error';
			stageComponent = null;
			dispatch({
				type: 'ERROR',
				message: error instanceof Error ? error.message : 'The interactive stage could not load.'
			});
			enhancementMessage =
				'The full diagram could not load. The complete compact journey remains available.';
		}
	}

	function reset(): void {
		dispatch({ type: 'RESET' });
	}

	function viewUrl(): URL {
		const url = new URL(window.location.href);
		url.search = serializePriorAuthorizationUrlState(
			{
				path: presentation.pathway,
				view: presentation.view,
				failure: presentation.failureId,
				step: presentation.milestoneIndex,
				perspective: presentation.perspective
			},
			url.searchParams
		).toString();
		return url;
	}

	function scheduleUrlWrite(): void {
		if (!mounted) return;
		if (urlTimer) clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			urlTimer = null;
			const url = viewUrl();
			replaceState(url, {});
		}, 80);
	}

	async function copyView(): Promise<void> {
		const canonicalUrl = viewUrl();
		replaceState(canonicalUrl, {});
		const url = canonicalUrl.toString();
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			const field = document.createElement('textarea');
			field.value = url;
			field.setAttribute('readonly', '');
			field.style.position = 'fixed';
			field.style.opacity = '0';
			document.body.append(field);
			field.select();
			document.execCommand('copy');
			field.remove();
		}
	}

	function restoreFromUrl(url: URL): void {
		const parsed = parsePriorAuthorizationUrlState(url);
		urlIssues = parsed.issues.length;
		presentation = createInitialPresentationState({
			pathway: parsed.state.path,
			view: parsed.state.view,
			failureId: parsed.state.failure,
			milestoneIndex: parsed.state.step,
			perspective: parsed.state.perspective,
			mode: experience === 'interactive' ? 'paused' : 'ready',
			compact: !eligibleForWideStage
		});
	}

	function updateCapabilities(): void {
		const query = new URLSearchParams(window.location.search);
		const motionOverride = query.get('motion')?.toLowerCase();
		const wide = window.matchMedia(WIDE_STAGE_QUERY).matches;
		eligibleForWideStage = wide;
		reducedMotion =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			document.documentElement.dataset.motion === 'still' ||
			motionOverride === 'reduce' ||
			motionOverride === 'still';
		highContrast =
			window.matchMedia('(forced-colors: active), (prefers-contrast: more)').matches ||
			document.documentElement.dataset.theme === 'high-contrast' ||
			query.get('contrast')?.toLowerCase() === 'high';

		if (!wide && experience === 'interactive') {
			stageComponent = null;
			experience = 'static';
			dispatch({ type: 'PAUSE' });
			dispatch({ type: 'SET_COMPACT', compact: true });
			enhancementMessage = 'The compact journey resumed after the display changed.';
		}
	}

	$effect(() => {
		void presentation.pathway;
		void presentation.view;
		void presentation.failureId;
		void presentation.milestoneIndex;
		void presentation.perspective;
		scheduleUrlWrite();
	});

	onMount(() => {
		mounted = true;
		const viewportQuery = window.matchMedia(WIDE_STAGE_QUERY);
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const contrastQuery = window.matchMedia('(forced-colors: active), (prefers-contrast: more)');
		const attributeObserver = new MutationObserver(updateCapabilities);
		const handleCapability = () => updateCapabilities();
		const handlePopstate = () => restoreFromUrl(new URL(window.location.href));

		attributeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion', 'data-theme']
		});
		viewportQuery.addEventListener('change', handleCapability);
		motionQuery.addEventListener('change', handleCapability);
		contrastQuery.addEventListener('change', handleCapability);
		window.addEventListener('popstate', handlePopstate);
		updateCapabilities();
		restoreFromUrl(new URL(window.location.href));
		if (urlIssues)
			enhancementMessage =
				'Unknown or unsafe view parameters were replaced with documented defaults.';

		return () => {
			attributeObserver.disconnect();
			viewportQuery.removeEventListener('change', handleCapability);
			motionQuery.removeEventListener('change', handleCapability);
			contrastQuery.removeEventListener('change', handleCapability);
			window.removeEventListener('popstate', handlePopstate);
			if (urlTimer) clearTimeout(urlTimer);
		};
	});
</script>

<section
	bind:this={root}
	class:interactive={experience === 'interactive'}
	class:reduced-motion={reducedMotion}
	class:high-contrast={highContrast}
	class="prior-authorization-machine article-breakout not-prose"
	data-testid="prior-authorization-machine"
	data-experience={experienceAttribute}
	data-hydrated={mounted ? 'true' : 'false'}
	data-started={journeyStarted ? 'true' : 'false'}
	data-mode={presentation.mode}
	data-enhancement={experience}
	data-eligibility={eligibleForWideStage ? 'wide-stage' : 'compact-route'}
	data-path={presentation.pathway}
	data-perspective={presentation.perspective}
	data-step={presentation.milestoneIndex}
	data-failure={presentation.failureId}
	data-view={presentation.view}
	data-motion-policy={motionPolicy}
	data-clock-patient-ms={Math.round(activeClock.patientElapsedMinutes * 60_000)}
	data-clock-human-seconds={Math.round(activeClock.humanWorkSeconds)}
	data-clock-machine-ms={Math.round(activeClock.automatedProcessingMs)}
	data-authorization-status={run.authorizationStatus}
	data-final-outcome={run.outcome}
>
	<div class="machine-inner">
		<AuthorizationHero
			pathway={presentation.pathway}
			clock={ZERO_CLOCK}
			loading={experience === 'loading'}
			canBegin={mounted}
			onpathwaychange={changePathway}
			onbegin={() => void beginJourney()}
		/>

		<div class="case-disclaimer" role="note">
			<strong>Entirely synthetic teaching case.</strong>
			<span
				>Maya Sen is fictional. Timings are authored assumptions, not observed averages, medical
				advice, a payer guarantee or a conformance implementation.</span
			>
		</div>

		{#if experience === 'interactive' && stageComponent}
			{@const InteractiveStage = stageComponent}
			<div class="interactive-shell">
				<InteractiveStage
					{run}
					{portalRun}
					{fhirRun}
					{failures}
					pathway={presentation.pathway}
					perspective={presentation.perspective}
					failureId={presentation.failureId}
					stepIndex={presentation.milestoneIndex}
					view={presentation.view}
					status={presentation.mode}
					speed={presentation.speed}
					replayToken={presentation.replayToken}
					{reducedMotion}
					{highContrast}
					onpathwaychange={changePathway}
					onperspectivechange={changePerspective}
					onfailurechange={changeFailure}
					onstepchange={changeStep}
					onviewchange={changeView}
					onplaypause={() => {
						if (presentation.mode === 'complete') {
							if (reducedMotion) changeStep(0);
							else dispatch({ type: 'REPLAY_JOURNEY', progressionIndices });
						} else {
							dispatch(
								presentation.mode === 'playing'
									? { type: 'PAUSE' }
									: { type: 'PLAY', progressionIndices }
							);
						}
					}}
					onprevious={() => dispatch({ type: 'PREVIOUS', progressionIndices })}
					onnext={() => dispatch({ type: 'NEXT', progressionIndices })}
					onadvance={() => dispatch({ type: 'ADVANCE', progressionIndices })}
					onpause={() => dispatch({ type: 'PAUSE' })}
					onspeedchange={(speed) => dispatch({ type: 'SET_SPEED', speed })}
					onreplaystep={() => dispatch({ type: 'REPLAY_CURRENT' })}
					onreplayjourney={() =>
						reducedMotion
							? changeStep(0)
							: dispatch({ type: 'REPLAY_JOURNEY', progressionIndices })}
					oncopy={copyView}
					onreset={reset}
				/>
			</div>
		{:else}
			<div class="compact-shell">
				<CompactJourney
					{run}
					{portalRun}
					{fhirRun}
					{failures}
					pathway={presentation.pathway}
					perspective={presentation.perspective}
					failureId={presentation.failureId}
					stepIndex={presentation.milestoneIndex}
					enhanced={mounted}
					started={journeyStarted}
					onpathwaychange={changePathway}
					onperspectivechange={changePerspective}
					onfailurechange={changeFailure}
					onstepchange={changeStep}
					onprevious={() => dispatch({ type: 'PREVIOUS', progressionIndices })}
					onnext={() => dispatch({ type: 'NEXT', progressionIndices })}
					onopenfull={eligibleForWideStage ? () => void loadWideStage() : undefined}
				/>
			</div>
		{/if}

		{#if enhancementMessage}
			<p class="enhancement-status" role="status">{enhancementMessage}</p>
		{/if}

		<ScenarioAssumptions
			assumptions={run.assumptions}
			portalClock={portalRun.clock}
			fhirClock={fhirRun.clock}
			{baselineFhirClock}
			portalSegments={portalRun.wallSegments}
			fhirSegments={fhirRun.wallSegments}
		/>

		<noscript>
			<section class="no-script-route" aria-labelledby="pa-noscript-heading">
				<p class="eyebrow">JavaScript-free journey</p>
				<h2 id="pa-noscript-heading">The full argument remains readable</h2>
				<p>
					Maya Sen is fictional. One non-urgent lumbar MRI order enters two deterministic pathways
					with the same synthetic facts and the same fictional evidence policy.
				</p>
				<div class="noscript-totals">
					<section>
						<h3>Portal and fax</h3>
						<p>
							<strong>{formatPatientElapsed(portalRun.clock.patientElapsedMinutes)}</strong> patient
							elapsed · {formatHumanWork(portalRun.clock.humanWorkSeconds)} active human work · {formatMachineTime(
								portalRun.clock.automatedProcessingMs
							)} automated processing.
						</p>
					</section>
					<section>
						<h3>FHIR-enabled</h3>
						<p>
							<strong>{formatPatientElapsed(fhirRun.clock.patientElapsedMinutes)}</strong> patient
							elapsed · {formatHumanWork(fhirRun.clock.humanWorkSeconds)} active human work · {formatMachineTime(
								fhirRun.clock.automatedProcessingMs
							)} automated processing.
						</p>
						<p>
							In this fictional case, one transaction took exactly 400 ms. The journey took exactly
							11 modeled days.
						</p>
					</section>
				</div>
				<h3>Ordered baseline journey</h3>
				<ol>
					{#each fhirRun.steps as step}<li>{step.label}</li>{/each}
				</ol>
				<h3>Four deterministic exceptions</h3>
				<dl>
					{#each failures as failure}
						<div>
							<dt>{failure.label}</dt>
							<dd>{failure.patientConsequence} Next action: {failure.nextAction}</dd>
						</div>
					{/each}
				</dl>
				<p>
					<strong>Conclusion:</strong> The electronic route moved information with less re-keying. It
					did not change the evidence requirement, the reviewer’s judgment, or the imaging calendar.
				</p>
			</section>
		</noscript>
	</div>
</section>

<style>
	.prior-authorization-machine {
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: 100vw;
		margin: 0 0 clamp(2.5rem, 7vw, 6rem);
		transform: translateX(-50%);
		background: var(--paper);
		color: var(--ink);
		isolation: isolate;
		scroll-margin-top: 4.5rem;
	}

	.machine-inner {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		width: min(96vw, 96rem);
		margin-inline: auto;
		padding-block: clamp(0.5rem, 2vw, 1.5rem);
	}

	.machine-inner > * {
		min-width: 0;
	}

	.case-disclaimer {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.55rem;
		border: 1px solid var(--rule);
		border-left: 4px solid var(--accent);
		border-radius: 0.45rem;
		background: var(--paper-raised);
		padding: 0.7rem 0.8rem;
		font: 0.72rem/1.45 var(--font-sans, sans-serif);
	}

	.case-disclaimer span {
		color: var(--ink-muted);
	}

	.interactive-shell {
		min-width: 0;
	}

	.compact-shell {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		padding-block: 0.5rem;
	}

	.enhancement-status {
		margin: 0;
		border-radius: 999px;
		background: var(--paper-raised);
		padding: 0.55rem 0.75rem;
		font: 0.68rem/1.4 var(--font-sans, sans-serif);
		text-align: center;
		color: var(--ink-muted);
	}

	.no-script-route {
		border: 2px solid var(--ink);
		border-radius: 0.75rem;
		background: var(--paper-raised);
		padding: 1rem;
	}

	.no-script-route .eyebrow,
	.no-script-route h2,
	.no-script-route h3,
	.no-script-route p,
	.no-script-route ol,
	.no-script-route dl,
	.no-script-route dt,
	.no-script-route dd {
		margin: 0;
	}

	.no-script-route .eyebrow {
		font: 760 0.62rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.no-script-route h2 {
		margin-top: 0.2rem;
		font: 780 1.4rem/1.1 var(--font-sans, sans-serif);
	}

	.no-script-route h3 {
		margin-top: 0.9rem;
		font: 750 0.9rem/1.2 var(--font-sans, sans-serif);
	}

	.no-script-route p,
	.no-script-route li,
	.no-script-route dd {
		font: 0.75rem/1.5 var(--font-sans, sans-serif);
	}

	.no-script-route > p,
	.no-script-route ol,
	.no-script-route dl {
		margin-top: 0.55rem;
	}

	.noscript-totals {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 0.8rem;
	}

	.noscript-totals section,
	.no-script-route dl > div {
		border: 1px solid var(--rule);
		border-radius: 0.45rem;
		padding: 0.65rem;
	}

	.no-script-route ol {
		columns: 2;
		padding-left: 1.25rem;
	}

	.no-script-route dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.no-script-route dt {
		font: 740 0.75rem/1.35 var(--font-sans, sans-serif);
	}

	.no-script-route dd {
		margin-top: 0.2rem;
		color: var(--ink-muted);
	}

	.reduced-motion *,
	.reduced-motion *::before,
	.reduced-motion *::after {
		scroll-behavior: auto !important;
		transition-duration: 0.01ms !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
	}

	@media (max-width: 68.74rem), (orientation: portrait) {
		.prior-authorization-machine {
			left: auto;
			width: auto;
			margin-inline: 0;
			transform: none;
		}

		.machine-inner {
			width: min(100%, 50rem);
			padding-inline: clamp(0.35rem, 2vw, 0.75rem);
		}

		.prior-authorization-machine.interactive {
			left: calc(50% + var(--article-breakout-offset, 0rem));
			width: 100vw;
			transform: translateX(-50%);
		}

		.prior-authorization-machine.interactive .machine-inner {
			width: min(96vw, 72rem);
		}
	}

	@media (max-width: 38rem) {
		.case-disclaimer,
		.noscript-totals,
		.no-script-route dl {
			grid-template-columns: 1fr;
		}

		.no-script-route ol {
			columns: 1;
		}
	}

	@media (forced-colors: active) {
		.prior-authorization-machine,
		.case-disclaimer,
		.no-script-route,
		.noscript-totals section,
		.no-script-route dl > div {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
