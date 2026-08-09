<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import AccessibleEventLedger from './AccessibleEventLedger.svelte';
	import ComparisonView from './ComparisonView.svelte';
	import CumulativeSmallMultiples from './CumulativeSmallMultiples.svelte';
	import ElapsedTimeDecomposition from './ElapsedTimeDecomposition.svelte';
	import EventInspector from './EventInspector.svelte';
	import FailurePanel from './FailurePanel.svelte';
	import PathwaySelector from './PathwaySelector.svelte';
	import PerspectiveSelector from './PerspectiveSelector.svelte';
	import PlaybackControls from './PlaybackControls.svelte';
	import ThreeClocks from './ThreeClocks.svelte';
	import WorkflowGraph from './WorkflowGraph.svelte';
	import { fixtureFragmentForStep } from './fixture-fragment';
	import { formatMachineTime, formatPatientElapsed, sentenceCase } from './format';
	import type {
		UiFailure,
		UiPathwayId,
		UiPerspectiveId,
		UiPlaybackStatus,
		UiRun
	} from './ui-types';

	type Props = {
		run: UiRun;
		portalRun: UiRun;
		fhirRun: UiRun;
		failures: UiFailure[];
		pathway: UiPathwayId;
		perspective: UiPerspectiveId;
		failureId: string;
		stepIndex: number;
		view: 'journey' | 'compare';
		status: UiPlaybackStatus;
		speed: 0.5 | 1 | 1.5;
		replayToken: number;
		reducedMotion?: boolean;
		highContrast?: boolean;
		onpathwaychange?: (pathway: UiPathwayId) => void;
		onperspectivechange?: (perspective: UiPerspectiveId) => void;
		onfailurechange?: (failureId: string) => void;
		onstepchange?: (step: number) => void;
		onviewchange?: (view: 'journey' | 'compare') => void;
		onplaypause?: () => void;
		onprevious?: () => void;
		onnext?: () => void;
		onadvance?: () => void;
		onpause?: () => void;
		onspeedchange?: (speed: 0.5 | 1 | 1.5) => void;
		onreplaystep?: () => void;
		onreplayjourney?: () => void;
		oncopy?: () => void | Promise<void>;
		onreset?: () => void;
	};

	let {
		run,
		portalRun,
		fhirRun,
		failures,
		pathway,
		perspective,
		failureId,
		stepIndex,
		view,
		status,
		speed,
		replayToken,
		reducedMotion = false,
		highContrast = false,
		onpathwaychange,
		onperspectivechange,
		onfailurechange,
		onstepchange,
		onviewchange,
		onplaypause,
		onprevious,
		onnext,
		onadvance,
		onpause,
		onspeedchange,
		onreplaystep,
		onreplayjourney,
		oncopy,
		onreset
	}: Props = $props();

	let stageRoot!: HTMLElement;
	let fullscreen = $state(false);
	let fullscreenSupported = $state(false);
	let stackedLayout = $state(false);
	let substantiallyVisible = $state(true);
	let shareStatus = $state('');
	let pauseReason = $state('');
	let replayStatus = $state('');
	let shareStatusTimer: number | null = null;
	let replayStatusTimer: number | null = null;
	let announcementTimer: number | null = null;
	let lastAnnouncementKey = '';

	let safeStepIndex = $derived(Math.max(0, Math.min(stepIndex, run.steps.length - 1)));
	let compareMode = $derived(view === 'compare');
	let activeStep = $derived(run.steps[safeStepIndex] ?? run.steps[0]);
	let activeClock = $derived(activeStep?.clock ?? run.clock);
	let otherRun = $derived(pathway === 'portal-fax' ? fhirRun : portalRun);
	let stepLabels = $derived(run.steps.map((step) => step.label));
	let progressionIndices = $derived(
		run.steps.filter((step) => step.status !== 'bypassed').map((step) => step.index)
	);
	let lastProgressionIndex = $derived(
		progressionIndices[progressionIndices.length - 1] ?? run.steps.length - 1
	);
	let hasNextProgression = $derived(progressionIndices.some((index) => index > safeStepIndex));
	let liveMessage = $state('');
	let fixtureFragment = $derived(fixtureFragmentForStep(pathway, activeStep));

	$effect(() => {
		const announcementKey = `${safeStepIndex}:${replayToken}`;
		if (announcementKey === lastAnnouncementKey) return;
		lastAnnouncementKey = announcementKey;
		const message = untrack(() =>
			activeStep
				? `${activeStep.label}. ${activeStep.actor}. ${activeStep.patientText} Patient elapsed ${Math.round(activeClock.patientElapsedMinutes)} modeled minutes; active human work ${Math.round(activeClock.humanWorkSeconds)} seconds; automated processing ${Math.round(activeClock.automatedProcessingMs)} milliseconds.`
				: ''
		);
		liveMessage = '';
		if (announcementTimer) window.clearTimeout(announcementTimer);
		announcementTimer = window.setTimeout(() => {
			liveMessage = message;
			announcementTimer = null;
		}, 24);
	});

	$effect(() => {
		if (status !== 'playing' || reducedMotion || !substantiallyVisible || !hasNextProgression) {
			return;
		}
		const branchBeat = [8, 9, 10].includes(stepIndex);
		const delay = (branchBeat ? 4_000 : 2_800) / speed;
		const timer = window.setTimeout(() => onadvance?.(), delay);
		return () => window.clearTimeout(timer);
	});

	function togglePlay(): void {
		if (reducedMotion) return;
		pauseReason = '';
		onplaypause?.();
	}

	function previous(): void {
		onprevious?.();
	}

	function next(): void {
		onnext?.();
	}

	function changeStep(nextStep: number): void {
		replayStatus = '';
		onstepchange?.(Math.max(0, Math.min(run.steps.length - 1, nextStep)));
	}

	function replayStep(): void {
		onreplaystep?.();
		pauseReason = '';
		replayStatus = `Replaying milestone ${safeStepIndex + 1}: ${activeStep?.label ?? 'current step'}.`;
		if (replayStatusTimer) window.clearTimeout(replayStatusTimer);
		replayStatusTimer = window.setTimeout(() => {
			replayStatus = '';
			replayStatusTimer = null;
		}, 1_800);
	}

	function replayJourney(): void {
		onreplayjourney?.();
	}

	function resetJourney(): void {
		onreset?.();
	}

	function selectPathway(nextPathway: UiPathwayId): void {
		onviewchange?.('journey');
		onpathwaychange?.(nextPathway);
	}

	function selectFailure(nextFailure: string): void {
		onfailurechange?.(nextFailure);
	}

	async function copyView(): Promise<void> {
		await oncopy?.();
		shareStatus = 'Canonical view URL copied.';
		if (shareStatusTimer) window.clearTimeout(shareStatusTimer);
		shareStatusTimer = window.setTimeout(() => {
			shareStatus = '';
			shareStatusTimer = null;
		}, 2_000);
	}

	async function toggleFullscreen(): Promise<void> {
		if (!fullscreenSupported) return;
		if (document.fullscreenElement === stageRoot) {
			await document.exitFullscreen();
			return;
		}
		await stageRoot.requestFullscreen();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			onpause?.();
			if (document.fullscreenElement === stageRoot) void document.exitFullscreen();
			return;
		}

		const target = event.target;
		if (
			target instanceof HTMLInputElement ||
			target instanceof HTMLSelectElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLButtonElement ||
			target instanceof HTMLAnchorElement ||
			(target instanceof HTMLElement && target.closest('summary, [data-stage-shortcuts="ignore"]'))
		)
			return;

		if (event.key === ' ') {
			event.preventDefault();
			togglePlay();
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			previous();
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			next();
		}
		if (event.key === 'Home') {
			event.preventDefault();
			changeStep(0);
		}
		if (event.key === 'End') {
			event.preventDefault();
			changeStep(run.steps.length - 1);
		}
		if (event.key.toLowerCase() === 'r') {
			event.preventDefault();
			replayStep();
		}
	}

	onMount(() => {
		fullscreenSupported = Boolean(document.fullscreenEnabled && stageRoot.requestFullscreen);
		const stackedQuery = window.matchMedia('(max-width: 74rem)');
		const updateLayout = () => {
			stackedLayout = stackedQuery.matches;
		};
		updateLayout();
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				const viewportHeight = entry?.rootBounds?.height ?? window.innerHeight;
				// The stage is intentionally much taller than one viewport, so an
				// element-relative intersection ratio would mark it "offscreen" even
				// while a full viewport of it is visible. Measure a useful viewport slice.
				const usefulSlice = Math.min(160, viewportHeight * 0.28);
				const visible = Boolean(
					entry?.isIntersecting && entry.intersectionRect.height >= usefulSlice
				);
				substantiallyVisible = visible;
				if (!visible && status === 'playing') {
					onpause?.();
					pauseReason = 'Paused because the stage moved offscreen.';
				}
			},
			{ threshold: [0, 0.28, 0.5] }
		);
		const handleVisibility = () => {
			if (document.hidden && status === 'playing') {
				onpause?.();
				pauseReason = 'Paused while this document was hidden.';
			}
		};
		const handleFullscreen = () => {
			fullscreen = document.fullscreenElement === stageRoot;
			if (!fullscreen && status === 'playing') onpause?.();
		};

		observer.observe(stageRoot);
		document.addEventListener('visibilitychange', handleVisibility);
		document.addEventListener('fullscreenchange', handleFullscreen);
		stackedQuery.addEventListener('change', updateLayout);

		return () => {
			observer.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			document.removeEventListener('fullscreenchange', handleFullscreen);
			stackedQuery.removeEventListener('change', updateLayout);
			if (shareStatusTimer) window.clearTimeout(shareStatusTimer);
			if (replayStatusTimer) window.clearTimeout(replayStatusTimer);
			if (announcementTimer) window.clearTimeout(announcementTimer);
		};
	});
</script>

<!-- The stage is an intentional composite keyboard surface with a documented key map. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={stageRoot}
	class:fullscreen
	class:high-contrast={highContrast}
	class:reduced-motion={reducedMotion}
	class="machine-stage"
	data-testid="machine-stage"
	data-path={pathway}
	data-perspective={perspective}
	data-failure={failureId}
	data-step={safeStepIndex}
	data-view={view}
	data-layout={stackedLayout ? 'stacked' : 'wide'}
	data-playback={status}
	data-motion-policy={reducedMotion ? 'stable-states' : 'timed-tableaux'}
	data-clock-patient-ms={Math.round(activeClock.patientElapsedMinutes * 60_000)}
	data-clock-human-seconds={Math.round(activeClock.humanWorkSeconds)}
	data-clock-machine-ms={Math.round(activeClock.automatedProcessingMs)}
	data-authorization-status={run.authorizationStatus}
	data-final-outcome={run.outcome}
	tabindex="0"
	role="region"
	aria-label="Interactive prior authorization machine. Keyboard: Space plays or pauses; Left and Right change milestones; Home and End jump; R replays; Escape pauses and exits full screen."
	onkeydown={handleKeydown}
>
	<header class="stage-header">
		<div class="stage-identity">
			<p>One synthetic lumbar MRI · {run.pathwayLabel}</p>
			<h2>{compareMode ? 'Pathways aligned by milestone' : activeStep?.label}</h2>
		</div>
		<div class="stage-actions">
			<button
				type="button"
				aria-pressed={compareMode}
				onclick={() => onviewchange?.(compareMode ? 'journey' : 'compare')}
			>
				{compareMode ? 'Return to machine' : 'Compare pathways'}
			</button>
			<button type="button" onclick={() => void copyView()}>Copy this view</button>
			{#if fullscreenSupported}
				<button type="button" onclick={() => void toggleFullscreen()}
					>{fullscreen ? 'Exit full screen' : 'Full screen'}</button
				>
			{/if}
		</div>
	</header>

	<div class="selection-bar">
		<PathwaySelector value={pathway} name="pa-pathway-stage" onchange={selectPathway} />
		<PerspectiveSelector
			value={perspective}
			name="pa-perspective-stage"
			onchange={onperspectivechange}
		/>
	</div>

	<ThreeClocks
		clock={activeClock}
		comparisonClock={otherRun.steps[safeStepIndex]?.clock ?? otherRun.clock}
		comparisonLabel={otherRun.pathwayLabel}
	/>

	{#if safeStepIndex === lastProgressionIndex}
		<aside
			class="culmination"
			data-testid="journey-culmination"
			data-baseline={failureId === 'none' ? 'true' : 'false'}
		>
			{#if failureId === 'none' && fhirRun.highlightTransactionMs !== undefined}
				<p>
					<strong>Exact synthetic culmination.</strong> In this fictional case, one transaction took {formatMachineTime(
						fhirRun.highlightTransactionMs
					)}. The journey took {formatPatientElapsed(
						fhirRun.clock.patientElapsedMinutes
					)}.{pathway === 'portal-fax'
						? ` The selected portal/fax baseline took ${formatPatientElapsed(run.clock.patientElapsedMinutes)}.`
						: ''}
				</p>
			{:else if failureId === 'none'}
				<p>
					<strong>Baseline culmination.</strong> The selected {run.pathwayLabel} journey took {formatPatientElapsed(
						run.clock.patientElapsedMinutes
					)}.
				</p>
			{:else}
				<p>
					<strong>Selected exception culmination.</strong> This {sentenceCase(run.outcome)} run ends after
					{formatPatientElapsed(run.clock.patientElapsedMinutes)}; that timing is derived from the
					selected exception ledger.
				</p>
			{/if}
		</aside>
	{/if}

	{#if compareMode}
		<ComparisonView
			{portalRun}
			{fhirRun}
			activeStep={safeStepIndex}
			{perspective}
			onstepchange={changeStep}
		/>
	{:else}
		<div class="machine-grid">
			<div class="graph-column">
				{#key replayToken}
					<WorkflowGraph
						steps={run.steps}
						activeStep={safeStepIndex}
						pathwayLabel={run.pathwayLabel}
						{reducedMotion}
					/>
				{/key}
			</div>
			{#if activeStep}
				<EventInspector
					step={activeStep}
					{perspective}
					identifiers={run.identifiers}
					{fixtureFragment}
					downloadHref="/data/prior-authorization/maya-lumbar-mri-fhir-r4.json"
				/>
			{/if}
		</div>
	{/if}

	<PlaybackControls
		{status}
		stepIndex={safeStepIndex}
		{stepLabels}
		{speed}
		{reducedMotion}
		{progressionIndices}
		onplaypause={togglePlay}
		onprevious={previous}
		onnext={next}
		onstepchange={changeStep}
		{onspeedchange}
		onreplaystep={replayStep}
		onreplayjourney={replayJourney}
		onreset={resetJourney}
	/>

	<FailurePanel {failures} value={failureId} onchange={selectFailure} />

	<div class="quantitative-panels">
		<ElapsedTimeDecomposition
			segments={run.wallSegments}
			totalMinutes={run.clock.patientElapsedMinutes}
			pathwayLabel={run.pathwayLabel}
		/>
		<CumulativeSmallMultiples
			points={run.cumulative}
			activeStep={safeStepIndex}
			pathwayLabel={run.pathwayLabel}
		/>
	</div>

	<AccessibleEventLedger
		rows={run.ledger}
		{perspective}
		pathwayLabel={run.pathwayLabel}
		activeStep={safeStepIndex}
	/>

	<p class="sr-live" aria-live="polite" aria-atomic="true">{liveMessage}</p>
	<p class="stage-status" aria-live="polite">{shareStatus || pauseReason || replayStatus}</p>
</div>

<style>
	.machine-stage {
		position: relative;
		display: grid;
		gap: 0.8rem;
		width: min(96vw, 96rem);
		margin-inline: auto;
		border: 1px solid var(--rule);
		border-radius: 0.9rem;
		background: var(--paper);
		padding: 0.8rem;
		box-shadow: var(--shadow-overlay);
		color: var(--ink);
		outline: none;
	}

	.machine-stage:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 3px;
	}

	.stage-header,
	.selection-bar,
	.stage-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stage-header,
	.selection-bar {
		justify-content: space-between;
	}

	.stage-identity p,
	.stage-identity h2,
	.stage-status {
		margin: 0;
	}

	.stage-identity p {
		font: 750 0.61rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.stage-identity h2 {
		margin-top: 0.16rem;
		font: 770 1.15rem/1.1 var(--font-sans, sans-serif);
	}

	.stage-actions {
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.stage-actions button {
		min-height: 2.75rem;
		border: 1px solid var(--rule);
		border-radius: 0.48rem;
		background: var(--paper-raised);
		padding: 0.5rem 0.7rem;
		font: 740 0.7rem/1 var(--font-sans, sans-serif);
		color: var(--ink);
		cursor: pointer;
	}

	.stage-actions button[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-foreground);
	}

	button:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.selection-bar {
		align-items: end;
		border-top: 1px solid var(--rule);
		padding-top: 0.65rem;
	}

	.selection-bar :global(.pathway-selector) {
		width: min(38rem, 60%);
	}

	.culmination {
		border: 1px solid var(--accent);
		border-left-width: 5px;
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--accent) 8%, var(--paper-raised));
		padding: 0.75rem 0.85rem;
	}

	.culmination p {
		margin: 0;
		font: 680 0.82rem/1.45 var(--font-serif, serif);
	}

	.machine-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 23rem);
		align-items: start;
		gap: 0.65rem;
		min-width: 0;
	}

	.graph-column {
		min-width: 0;
	}

	.quantitative-panels {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		align-items: start;
		gap: 0.65rem;
	}

	.sr-live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.stage-status {
		min-height: 1rem;
		font: 0.65rem/1.35 var(--font-sans, sans-serif);
		text-align: center;
		color: var(--ink-muted);
	}

	.machine-stage:fullscreen {
		width: 100vw;
		height: 100dvh;
		margin: 0;
		overflow: auto;
		border: 0;
		border-radius: 0;
		padding: calc(0.8rem + env(safe-area-inset-top)) 0.8rem
			calc(0.8rem + env(safe-area-inset-bottom));
		overscroll-behavior: contain;
	}

	.reduced-motion *,
	.reduced-motion *::before,
	.reduced-motion *::after {
		scroll-behavior: auto !important;
		transition-duration: 0.01ms !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
	}

	@media (max-width: 74rem) {
		.machine-grid,
		.quantitative-panels {
			grid-template-columns: 1fr;
		}

		.machine-stage {
			width: 100%;
		}
	}

	@media (max-width: 48rem) {
		.stage-header,
		.selection-bar {
			align-items: stretch;
			flex-direction: column;
		}

		.stage-actions {
			justify-content: flex-start;
		}

		.selection-bar :global(.pathway-selector) {
			width: 100%;
		}
	}

	@media (forced-colors: active) {
		.machine-stage,
		.stage-header,
		.selection-bar,
		.stage-actions button {
			border-color: CanvasText;
		}

		.culmination {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.stage-actions button[aria-pressed='true'] {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
