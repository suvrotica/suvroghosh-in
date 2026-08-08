<script lang="ts">
	import { onMount } from 'svelte';
	import EnsembleReadout from './EnsembleReadout.svelte';
	import InterventionControl from './InterventionControl.svelte';
	import ModelDisclosure from './ModelDisclosure.svelte';
	import NucleusCrossSection from './NucleusCrossSection.svelte';
	import NucleusPoster from './NucleusPoster.svelte';
	import TimeRibbon from './TimeRibbon.svelte';
	import WeatherStage from './WeatherStage.svelte';
	import type { EnsembleComparisonView, RendererMode, TraceView } from './ui-types';
	import { NucleusSonifier } from '$lib/visualizations/weather-inside-nucleus/audio';
	import {
		INITIAL_EXPERIENCE_STATE,
		stageNumber,
		transitionExperience,
		type ExperienceState,
		type InterventionId
	} from '$lib/visualizations/weather-inside-nucleus/experience';
	import {
		INTRO_BURST_SEED,
		MODEL_SEMANTIC_VERSION,
		createModelParameters,
		type ModelParameters,
		type SimulationResult
	} from '$lib/visualizations/weather-inside-nucleus/model';
	import {
		compactEnsembleToComparison,
		simulationToTraceView
	} from '$lib/visualizations/weather-inside-nucleus/presentation';
	import {
		DEFAULT_NUCLEUS_URL_STATE,
		parseNucleusUrlState,
		serializeNucleusUrlState,
		type NucleusScenario,
		type NucleusUrlState,
		type NucleusView
	} from '$lib/visualizations/weather-inside-nucleus/url-state';
	import {
		NucleusWorkerCancelledError,
		createWeatherNucleusWorkerClient,
		type WeatherNucleusWorkerClient
	} from '$lib/visualizations/weather-inside-nucleus/worker/client';
	import type {
		CompactMatchedEnsembleResult,
		FocalPairResult
	} from '$lib/visualizations/weather-inside-nucleus/worker/protocol';

	type Props = {
		startInExperiment?: boolean;
	};

	let { startInExperiment = false }: Props = $props();

	type InterventionValues = {
		block: number;
		duration: number;
		affinity: number;
		contact: number;
	};

	const INTRO_DURATION_MS = 3_000;
	const PLAYBACK_MODEL_MINUTES_PER_SECOND = 8;
	const NEXT_SEED_INCREMENT = 0x9e37_79b9;

	let experienceRoot: HTMLElement;
	let experience: ExperienceState = $state(INITIAL_EXPERIENCE_STATE);
	let urlState: NucleusUrlState = $state({ ...DEFAULT_NUCLEUS_URL_STATE });
	let values: InterventionValues = $state({
		block: 1,
		duration: 36,
		affinity: 0.28,
		contact: 1
	});
	let introResult: SimulationResult | null = $state(null);
	let activeResult: SimulationResult | null = $state(null);
	let focalPair: FocalPairResult | null = $state(null);
	let compactEnsemble: CompactMatchedEnsembleResult | null = $state(null);
	let introProgress = $state(0);
	let introRunning = $state(true);
	let introPaused = $state(false);
	let playbackTime = $state(0);
	let playbackPaused = $state(false);
	let reducedMotion = $state(false);
	let highContrast = $state(false);
	let rendererMode: RendererMode = $state('2d');
	let busy = $state(false);
	let statusText = $state('Loading the deterministic opening trace…');
	let announcement = $state('');
	let errorText = $state('');
	let shareStatus = $state('');
	let audioActive = $state(false);
	let visible = $state(true);
	let workerClient: WeatherNucleusWorkerClient | null = null;
	let sonifier: NucleusSonifier | null = null;
	let disposed = false;

	let trace: TraceView | null = $derived(activeResult ? simulationToTraceView(activeResult) : null);
	let comparison: EnsembleComparisonView | null = $derived(
		compactEnsemble ? compactEnsembleToComparison(compactEnsemble) : null
	);
	let introPhase: 'cell' | 'signal' | 'locus' | 'burst' = $derived.by(() => {
		if (reducedMotion) {
			return introProgress < 1 / 3 ? 'cell' : introProgress < 2 / 3 ? 'signal' : 'burst';
		}
		return introProgress < 0.09
			? 'cell'
			: introProgress < 0.7
				? 'signal'
				: introProgress < 0.85
					? 'locus'
					: 'burst';
	});
	let reducedFrameLabel = $derived(
		introProgress < 1 / 3
			? 'Frame 1 of 3 · ligand and receptor'
			: introProgress < 2 / 3
				? 'Frame 2 of 3 · downstream activity'
				: 'Frame 3 of 3 · locus and transcription result'
	);
	let moreTimeNearWithoutBurst = $derived.by(() => {
		const pair = focalPair;
		return (
			experience.intervention === 'contact' &&
			pair !== null &&
			!pair.intervention.summary.hadBurst &&
			pair.intervention.summary.nearFraction > pair.baseline.summary.nearFraction
		);
	});
	let resultSentence = $derived.by(() => {
		if (!focalPair || !experience.intervention) return '';
		const baseline = focalPair.baseline.summary;
		const intervention = focalPair.intervention.summary;
		return `With seed ${focalPair.seed}, baseline produced ${baseline.burstCount} ${plural(baseline.burstCount, 'burst')} and ${baseline.initiationCount} ${plural(baseline.initiationCount, 'initiation')}; ${interventionLabel(experience.intervention)} produced ${intervention.burstCount} ${plural(intervention.burstCount, 'burst')} and ${intervention.initiationCount} ${plural(intervention.initiationCount, 'initiation')}.`;
	});

	function plural(count: number, singular: string) {
		return count === 1 ? singular : `${singular}s`;
	}

	/** Compresses the real seed-41 event window into the final 450 ms of the opening. */
	function introPlaybackTime(result: SimulationResult, progress: number): number {
		const burstStart = result.burstStartTimes[0] ?? result.parameters.duration * 0.12;
		const fourthInitiation = result.initiationTimes[Math.min(3, result.initiationTimes.length - 1)];
		const eventEnd = Number.isFinite(fourthInitiation)
			? Math.min(result.parameters.duration, fourthInitiation + 0.12)
			: Math.min(result.parameters.duration, burstStart + 7);
		if (progress < 0.85) return (progress / 0.85) * burstStart;
		return burstStart + ((progress - 0.85) / 0.15) * (eventEnd - burstStart);
	}

	function interventionLabel(intervention: InterventionId | null): string {
		switch (intervention) {
			case 'blocked':
				return 'Receptor block';
			case 'lengthened':
				return 'Longer signal';
			case 'mutated':
				return 'Weaker binding site';
			case 'contact':
				return 'Raised contact propensity';
			default:
				return 'Intervention';
		}
	}

	function scenarioFor(intervention: InterventionId | null): NucleusScenario {
		return intervention ?? 'baseline';
	}

	function interventionFromScenario(scenario: NucleusScenario): InterventionId | null {
		return scenario === 'baseline' ? null : scenario;
	}

	function baselineParameters(): Readonly<ModelParameters> {
		return createModelParameters({ egfAmplitude: urlState.signal });
	}

	function interventionParameters(): Readonly<ModelParameters> {
		const baseline = baselineParameters();
		switch (experience.intervention) {
			case 'blocked':
				return createModelParameters({ ...baseline, receptorBlockade: values.block });
			case 'lengthened':
				return createModelParameters({ ...baseline, egfDuration: values.duration });
			case 'mutated':
				return createModelParameters({ ...baseline, bindingAffinity: values.affinity });
			case 'contact':
				return createModelParameters({ ...baseline, geometryBias: values.contact });
			default:
				return baseline;
		}
	}

	function hasInterventionEffect(): boolean {
		switch (experience.intervention) {
			case 'blocked':
				return values.block > DEFAULT_NUCLEUS_URL_STATE.block;
			case 'lengthened':
				return values.duration > DEFAULT_NUCLEUS_URL_STATE.duration;
			case 'mutated':
				return values.affinity < DEFAULT_NUCLEUS_URL_STATE.affinity;
			case 'contact':
				return values.contact > DEFAULT_NUCLEUS_URL_STATE.contact;
			default:
				return false;
		}
	}

	function writeSerializedUrl(nextState: NucleusUrlState, replace = true) {
		if (typeof window === 'undefined') return;
		const params = serializeNucleusUrlState(nextState, new URLSearchParams(window.location.search));
		const next = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
		window.history[replace ? 'replaceState' : 'pushState']({}, '', next);
	}

	function syncUrl(replace = true) {
		if (typeof window === 'undefined') return;
		const scenario = scenarioFor(experience.intervention);
		urlState = {
			...urlState,
			scenario,
			block: scenario === 'blocked' ? values.block : DEFAULT_NUCLEUS_URL_STATE.block,
			duration: scenario === 'lengthened' ? values.duration : DEFAULT_NUCLEUS_URL_STATE.duration,
			affinity: scenario === 'mutated' ? values.affinity : DEFAULT_NUCLEUS_URL_STATE.affinity,
			contact: scenario === 'contact' ? values.contact : DEFAULT_NUCLEUS_URL_STATE.contact,
			time: playbackTime,
			renderer: rendererMode
		};
		writeSerializedUrl(urlState, replace);
	}

	function applyParsedState(next: NucleusUrlState) {
		const scenarioHasEffect =
			next.scenario === 'baseline' ||
			(next.scenario === 'blocked' && next.block > DEFAULT_NUCLEUS_URL_STATE.block) ||
			(next.scenario === 'lengthened' && next.duration > DEFAULT_NUCLEUS_URL_STATE.duration) ||
			(next.scenario === 'mutated' && next.affinity < DEFAULT_NUCLEUS_URL_STATE.affinity) ||
			(next.scenario === 'contact' && next.contact > DEFAULT_NUCLEUS_URL_STATE.contact);
		urlState = { ...next, scenario: scenarioHasEffect ? next.scenario : 'baseline' };
		values = {
			block: next.block,
			duration: next.duration,
			affinity: next.affinity,
			contact: next.contact
		};
		playbackTime = next.time;
		rendererMode = next.renderer ?? rendererMode;
	}

	function journeyForScenario(scenario: NucleusScenario, completed = false): ExperienceState {
		const selected = interventionFromScenario(scenario);
		let next = transitionExperience(INITIAL_EXPERIENCE_STATE, { type: 'SKIP_INTRO' });
		if (!selected) return next;
		next = transitionExperience(next, { type: 'BEGIN_INTERVENTION' });
		next = transitionExperience(next, { type: 'SELECT_INTERVENTION', intervention: selected });
		next = transitionExperience(next, { type: 'COMMIT_INTERVENTION' });
		return completed ? transitionExperience(next, { type: 'RUN_COUNTERFACTUAL' }) : next;
	}

	async function requestIntro() {
		if (!workerClient) return;
		statusText = 'Loading the deterministic opening trace…';
		try {
			const baseline = createModelParameters();
			const result = await workerClient.runFocalPair({
				seed: INTRO_BURST_SEED,
				baseline,
				intervention: baseline
			});
			if (disposed || !introRunning) return;
			introResult = result.baseline;
			activeResult = result.baseline;
			playbackTime = 0;
			statusText = 'Opening trace ready.';
		} catch (error) {
			handleSimulationError(error);
		}
	}

	async function finishIntro(skipped = false) {
		if (!introRunning) return;
		introRunning = false;
		introPaused = false;
		introProgress = 1;
		experience = transitionExperience(experience, {
			type: skipped ? 'SKIP_INTRO' : 'INTRO_FINISHED'
		});
		const sharedScenario = urlState.scenario;
		const restoredTime = urlState.time;
		experience = journeyForScenario(sharedScenario);
		await runFocalPair(sharedScenario !== 'baseline', false, restoredTime);
		if (sharedScenario !== 'baseline' && experience.stage === 'replay') {
			experience = transitionExperience(experience, { type: 'RUN_COUNTERFACTUAL' });
		}
	}

	function replayOpening() {
		workerClient?.cancel();
		experience = INITIAL_EXPERIENCE_STATE;
		introRunning = true;
		introPaused = false;
		introProgress = 0;
		playbackTime = 0;
		activeResult = introResult;
		compactEnsemble = null;
		announcement = '';
		errorText = '';
		if (!introResult) void requestIntro();
	}

	function beginIntervention() {
		experience = transitionExperience(experience, { type: 'BEGIN_INTERVENTION' });
	}

	function selectIntervention(intervention: InterventionId) {
		const firstSelection = experience.intervention === null;
		experience = transitionExperience(experience, {
			type: 'SELECT_INTERVENTION',
			intervention
		});
		values = {
			...values,
			...(intervention === 'blocked' ? { block: 1 } : {}),
			...(intervention === 'lengthened' ? { duration: 36 } : {}),
			...(intervention === 'mutated' ? { affinity: 0.28 } : {}),
			...(intervention === 'contact' ? { contact: 1 } : {})
		};
		compactEnsemble = null;
		syncUrl(!firstSelection);
	}

	function previewIntervention(next: InterventionValues) {
		values = { ...next };
		compactEnsemble = null;
		syncUrl();
	}

	function commitIntervention() {
		if (!hasInterventionEffect()) {
			statusText = 'Move the selected control away from baseline before committing.';
			return;
		}
		experience = transitionExperience(experience, { type: 'COMMIT_INTERVENTION' });
		syncUrl();
		statusText = 'Intervention committed. The numerical trace has not changed until you run it.';
	}

	async function runFocalPair(showIntervention: boolean, announce = true, restoredTime = 0) {
		if (!workerClient) return;
		busy = true;
		errorText = '';
		statusText = showIntervention
			? 'Running one matched counterfactual pair…'
			: 'Running one possible baseline history…';
		try {
			const result = await workerClient.runFocalPair({
				seed: urlState.seed,
				baseline: baselineParameters(),
				intervention: showIntervention ? interventionParameters() : baselineParameters()
			});
			if (disposed) return;
			focalPair = result;
			activeResult = showIntervention ? result.intervention : result.baseline;
			playbackTime = Math.max(0, Math.min(result.baseline.parameters.duration, restoredTime));
			playbackPaused = playbackTime > 0;
			statusText = showIntervention
				? 'Matched counterfactual complete.'
				: 'Baseline trace ready. Watch one possible history.';
			if (announce && showIntervention) announcement = resultSentence;
		} catch (error) {
			handleSimulationError(error);
		} finally {
			if (!disposed) busy = false;
		}
	}

	async function runThisCell() {
		await runFocalPair(true);
		if (!errorText && experience.stage === 'replay') {
			experience = transitionExperience(experience, { type: 'RUN_COUNTERFACTUAL' });
			announcement = `${resultSentence} Same random starting stream; one modeled cause changed.`;
		}
	}

	async function replayThisCell() {
		await runFocalPair(true);
		announcement = `${resultSentence} Replay preserved seed ${urlState.seed} and model ${MODEL_SEMANTIC_VERSION}.`;
	}

	async function anotherCell() {
		urlState = { ...urlState, seed: (urlState.seed + NEXT_SEED_INCREMENT) >>> 0, time: 0 };
		experience = transitionExperience(experience, { type: 'RUN_ANOTHER_CELL' });
		compactEnsemble = null;
		syncUrl(false);
		await runFocalPair(true);
		announcement = `Same intervention. Different possible history. ${resultSentence}`;
	}

	async function compareEnsemble() {
		if (!workerClient || !experience.intervention) return;
		experience = transitionExperience(experience, { type: 'COMPARE_ENSEMBLE' });
		busy = true;
		errorText = '';
		statusText = 'Calculating 48 matched histories…';
		try {
			compactEnsemble = await workerClient.runMatchedEnsemble({
				rootSeed: urlState.seed,
				baseline: baselineParameters(),
				intervention: interventionParameters()
			});
			if (disposed || !compactEnsemble) return;
			const baselineBursts = compactEnsemble.baseline.summary.burstingRunCount;
			const changedBursts = compactEnsemble.intervention.summary.burstingRunCount;
			announcement = `Intervention complete: ${changedBursts} of 48 model runs produced at least one burst, compared with ${baselineBursts} of 48 at baseline.`;
			statusText = 'Forty-eight matched histories complete.';
		} catch (error) {
			handleSimulationError(error);
		} finally {
			if (!disposed) busy = false;
		}
	}

	function handleSimulationError(error: unknown) {
		if (error instanceof NucleusWorkerCancelledError) return;
		errorText = error instanceof Error ? error.message : 'The model could not complete this run.';
		statusText = 'The last valid trace remains visible.';
	}

	function seek(time: number) {
		playbackTime = time;
		playbackPaused = true;
		urlState = { ...urlState, time };
		syncUrl();
	}

	function setView(view: NucleusView) {
		urlState = { ...urlState, view };
		syncUrl();
	}

	function setRenderer(mode: RendererMode) {
		const permittedMode = reducedMotion ? '2d' : mode;
		rendererMode = permittedMode;
		urlState = { ...urlState, renderer: permittedMode };
		syncUrl();
	}

	function preferredAutomaticRenderer(): RendererMode {
		const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
		if (window.matchMedia('(max-width: 760px)').matches) return '2d';
		if (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) return '2d';
		if (memory !== undefined && memory < 4) return '2d';
		return '3d';
	}

	function handleRendererStatus(
		status: 'loading' | 'ready' | 'fallback' | 'context-lost',
		message: string
	) {
		statusText = message;
		if (status !== 'fallback' || rendererMode !== '3d') return;
		const fallbackState = { ...urlState, renderer: '2d' } satisfies NucleusUrlState;
		rendererMode = '2d';
		urlState = fallbackState;
		writeSerializedUrl(fallbackState);
	}

	function rendererTarget(intervention: InterventionId | null) {
		switch (intervention) {
			case 'blocked':
				return 'receptor' as const;
			case 'lengthened':
				return 'signal' as const;
			case 'mutated':
				return 'binding-site' as const;
			case 'contact':
				return 'contact' as const;
			default:
				return null;
		}
	}

	function interventionForRendererTarget(
		target: 'receptor' | 'signal' | 'binding-site' | 'contact'
	): InterventionId {
		switch (target) {
			case 'receptor':
				return 'blocked';
			case 'signal':
				return 'lengthened';
			case 'binding-site':
				return 'mutated';
			case 'contact':
				return 'contact';
		}
	}

	function selectRendererTarget(target: 'receptor' | 'signal' | 'binding-site' | 'contact') {
		if (experience.stage === 'intervene') selectIntervention(interventionForRendererTarget(target));
	}

	async function toggleAudio() {
		if (audioActive) {
			sonifier?.stop();
			audioActive = false;
			return;
		}
		if (!activeResult) return;
		try {
			sonifier ??= new NucleusSonifier();
			await sonifier.play(activeResult);
			audioActive = true;
		} catch (error) {
			errorText = error instanceof Error ? error.message : 'Audio is unavailable.';
		}
	}

	async function share() {
		syncUrl();
		try {
			await navigator.clipboard.writeText(window.location.href);
			shareStatus = 'Share link copied.';
		} catch {
			shareStatus = 'The address bar now contains the complete share state.';
		}
	}

	async function reset() {
		workerClient?.cancel();
		experience = transitionExperience(INITIAL_EXPERIENCE_STATE, { type: 'SKIP_INTRO' });
		urlState = { ...DEFAULT_NUCLEUS_URL_STATE, renderer: rendererMode };
		values = { block: 1, duration: 36, affinity: 0.28, contact: 1 };
		compactEnsemble = null;
		focalPair = null;
		announcement = '';
		syncUrl(false);
		await runFocalPair(false, false);
	}

	onMount(() => {
		disposed = false;
		workerClient = createWeatherNucleusWorkerClient();
		const parsed = parseNucleusUrlState(window.location.href);
		applyParsedState(parsed.state);
		if (parsed.issues.length) {
			statusText = `${parsed.issues.length} invalid shared-state ${plural(parsed.issues.length, 'value')} restored safely.`;
		}

		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const contrastQuery = window.matchMedia('(forced-colors: active), (prefers-contrast: more)');
		const motionSetting = new URLSearchParams(window.location.search).get('motion')?.toLowerCase();
		const forceTwoDimensional = new URLSearchParams(window.location.search).get('webgl') === 'off';
		const updateMotion = () => {
			reducedMotion =
				motionQuery.matches ||
				motionSetting === 'reduce' ||
				motionSetting === 'still' ||
				document.documentElement.dataset.motion === 'still';
			if (reducedMotion) {
				rendererMode = '2d';
				urlState = { ...urlState, renderer: '2d' };
			}
		};
		const updateContrast = () => (highContrast = contrastQuery.matches);
		updateMotion();
		updateContrast();
		if (forceTwoDimensional || reducedMotion) rendererMode = '2d';
		else if (!parsed.state.renderer) rendererMode = preferredAutomaticRenderer();
		const motionAttributeObserver = new MutationObserver(updateMotion);
		motionAttributeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});

		let previous = performance.now();
		const clock = window.setInterval(() => {
			const now = performance.now();
			const elapsed = Math.min(120, Math.max(0, now - previous));
			previous = now;
			if (!visible || document.hidden) return;
			if (introRunning && !introPaused && introResult) {
				introProgress = Math.min(1, introProgress + elapsed / INTRO_DURATION_MS);
				playbackTime = introPlaybackTime(introResult, introProgress);
				if (introProgress >= 1) void finishIntro();
			} else if (!introRunning && !playbackPaused && activeResult) {
				playbackTime = Math.min(
					activeResult.parameters.duration,
					playbackTime + (elapsed / 1_000) * PLAYBACK_MODEL_MINUTES_PER_SECOND
				);
				if (playbackTime >= activeResult.parameters.duration) playbackPaused = true;
			}
		}, 50);

		const observer = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
			},
			{ rootMargin: '120px' }
		);
		observer.observe(experienceRoot);

		const handlePopState = async () => {
			const targetHref = window.location.href;
			const restored = parseNucleusUrlState(window.location.href).state;
			applyParsedState(restored);
			if (!introRunning) {
				experience = journeyForScenario(restored.scenario);
				await runFocalPair(restored.scenario !== 'baseline', false, restored.time);
				if (window.location.href !== targetHref) return;
				if (restored.scenario !== 'baseline' && !errorText) {
					experience = journeyForScenario(restored.scenario, true);
				}
			}
		};
		const handlePopStateEvent = () => void handlePopState();
		const handleVisibility = () => {
			previous = performance.now();
		};
		motionQuery.addEventListener('change', updateMotion);
		contrastQuery.addEventListener('change', updateContrast);
		window.addEventListener('popstate', handlePopStateEvent);
		document.addEventListener('visibilitychange', handleVisibility);
		if (startInExperiment) {
			introRunning = false;
			introPaused = false;
			introProgress = 1;
			experience = journeyForScenario(parsed.state.scenario);
			void runFocalPair(parsed.state.scenario !== 'baseline', false, parsed.state.time);
		} else {
			void requestIntro();
		}

		return () => {
			disposed = true;
			window.clearInterval(clock);
			observer.disconnect();
			motionAttributeObserver.disconnect();
			motionQuery.removeEventListener('change', updateMotion);
			contrastQuery.removeEventListener('change', updateContrast);
			window.removeEventListener('popstate', handlePopStateEvent);
			document.removeEventListener('visibilitychange', handleVisibility);
			workerClient?.dispose();
			workerClient = null;
			void sonifier?.dispose();
			sonifier = null;
		};
	});
</script>

{#snippet openingFallback()}
	{#if introPhase === 'burst' && trace}
		<NucleusCrossSection {trace} currentTime={playbackTime} semanticView="locus" />
	{:else}
		<NucleusPoster phase={introPhase} />
	{/if}
{/snippet}

{#snippet liveFallback()}
	<NucleusCrossSection
		{trace}
		currentTime={playbackTime}
		semanticView={urlState.view}
		interactiveTargets={experience.stage === 'intervene'}
		selectedIntervention={experience.intervention}
		onselect={selectIntervention}
	/>
{/snippet}

<section
	bind:this={experienceRoot}
	class="weather-experience article-breakout not-prose"
	class:high-contrast={highContrast}
	data-stage={experience.stage}
	data-model-version={MODEL_SEMANTIC_VERSION}
	data-testid="weather-inside-nucleus"
>
	{#if !startInExperiment}
		<div class="hero-scene">
			<div class="visual-layer" aria-hidden={experience.stage === 'attract' ? undefined : 'true'}>
				{#if experience.stage === 'attract'}
					{#if !reducedMotion && rendererMode === '3d'}
						<WeatherStage
							trace={activeResult}
							{playbackTime}
							introActive={introRunning}
							{introProgress}
							{reducedMotion}
							{highContrast}
							cameraMode="cell"
							paused={introPaused || !visible}
							active={visible}
							fallback={openingFallback}
							onstatus={handleRendererStatus}
						/>
					{:else}
						{@render openingFallback()}
					{/if}
				{:else}
					<NucleusCrossSection {trace} currentTime={playbackTime} semanticView={urlState.view} />
				{/if}
			</div>

			<div class="intro-tools" aria-label="Opening controls">
				<button type="button" onclick={() => (introPaused = !introPaused)}>
					{introPaused ? 'Resume opening' : 'Pause'}
				</button>
				{#if introRunning}
					<button type="button" onclick={() => void finishIntro(true)}>Skip intro</button>
				{:else}
					<button type="button" onclick={replayOpening}>Replay opening</button>
				{/if}
			</div>

			<div
				class="semantic-scale"
				aria-hidden="true"
				class:visible={!reducedMotion && introProgress >= 0.48 && introProgress < 0.86}
			>
				<span>cell</span><b>→</b><span>nucleus</span><b>→</b><span>locus</span><em>not to scale</em>
			</div>
			{#if reducedMotion && introRunning}
				<p class="reduced-frame-label">{reducedFrameLabel}</p>
			{/if}

			<header class="hero-copy" class:revealed={!introRunning}>
				<p class="model-kicker">one possible history · illustrative model time</p>
				<h1>Weather Inside the Nucleus</h1>
				<p class="opening-line">A signal arrives. A gene hesitates.</p>
				<p class="dek">
					Signal and nuclear geometry change the odds of a transcriptional burst. Neither commands
					it.
				</p>
				<p class="byline">
					By Suvro Ghosh · Published <time datetime="2026-08-08">8 August 2026</time> · Updated
					<time datetime="2026-08-09">9 August 2026</time> · 26 min read
				</p>
				{#if experience.stage === 'observe'}
					<button class="primary" type="button" onclick={beginIntervention}>Intervene once</button>
				{/if}
			</header>

			<div class="intro-progress" aria-hidden="true">
				<span style={`transform:scaleX(${introProgress})`}></span>
			</div>
		</div>
	{/if}

	<div class="experience-panel">
		<div class="stage-bar">
			<p><span>Step {stageNumber(experience.stage)} of 6</span> {experience.stage}</p>
			<div class="view-controls" aria-label="Presentation controls">
				<div class="segmented" aria-label="Semantic view">
					{#each ['cell', 'nucleus', 'territory', 'locus'] as view (view)}
						<button
							type="button"
							aria-pressed={urlState.view === view}
							onclick={() => setView(view as NucleusView)}>{view}</button
						>
					{/each}
				</div>
				{#if reducedMotion}
					<p class="still-renderer-note">2D still view · motion preference active</p>
				{:else}
					<div class="segmented" aria-label="Renderer">
						<button
							type="button"
							aria-pressed={rendererMode === '2d'}
							onclick={() => setRenderer('2d')}>2D</button
						>
						<button
							type="button"
							aria-pressed={rendererMode === '3d'}
							onclick={() => setRenderer('3d')}>3D</button
						>
					</div>
				{/if}
			</div>
		</div>

		{#if experience.stage !== 'attract'}
			<div class="live-scene" data-renderer={rendererMode}>
				{#if !reducedMotion && rendererMode === '3d'}
					<WeatherStage
						trace={activeResult}
						{playbackTime}
						introActive={false}
						introProgress={1}
						{reducedMotion}
						{highContrast}
						cameraMode={urlState.view}
						selectedTarget={rendererTarget(experience.intervention)}
						paused={playbackPaused || !visible}
						active={visible}
						fallback={liveFallback}
						onstatus={handleRendererStatus}
						onselecttarget={selectRendererTarget}
					/>
				{:else}
					{@render liveFallback()}
				{/if}
			</div>
			<TimeRibbon {trace} currentTime={playbackTime} disabled={!trace || busy} onseek={seek} />
		{/if}

		{#if experience.stage === 'observe'}
			<section class="journey-copy" aria-labelledby="wn-watch-heading">
				<p class="eyebrow">Not a switch</p>
				<h2 id="wn-watch-heading">Watch one possible history.</h2>
				<p>This happened once. It was not guaranteed. The ribbon is a history, not an average.</p>
				<button class="primary" type="button" onclick={beginIntervention}>Intervene once</button>
			</section>
		{:else if experience.stage === 'intervene'}
			<InterventionControl
				selected={experience.intervention}
				{values}
				disabled={busy}
				onselect={selectIntervention}
				onpreview={previewIntervention}
				oncommit={commitIntervention}
			/>
		{:else if experience.stage === 'replay'}
			<section class="journey-copy counterfactual" aria-labelledby="wn-replay-heading">
				<p class="eyebrow">Counterfactual replay</p>
				<h2 id="wn-replay-heading">Same random starting stream; one modeled cause changed.</h2>
				<p>
					{interventionLabel(experience.intervention)} is the only selected cause. Baseline and intervention
					keep seed {urlState.seed}.
				</p>
				<button class="primary" type="button" disabled={busy} onclick={() => void runThisCell()}
					>{busy ? 'Running this history…' : 'Run this history'}</button
				>
			</section>
		{:else if experience.stage === 'repeat' || experience.stage === 'inspect'}
			<section class="journey-copy result-copy" aria-labelledby="wn-result-heading">
				<p class="eyebrow">One matched history · seed {urlState.seed}</p>
				<h2 id="wn-result-heading">
					{moreTimeNearWithoutBurst
						? 'More time near; no burst in this history.'
						: 'One outcome, not a command.'}
				</h2>
				<p>{resultSentence}</p>
				<p><strong>Same random starting stream; one modeled cause changed.</strong></p>
				<div class="action-row">
					<button type="button" disabled={busy} onclick={() => void replayThisCell()}
						>Replay this history</button
					>
					<button type="button" disabled={busy} onclick={() => void anotherCell()}
						>Another possible history</button
					>
					{#if experience.stage === 'repeat'}
						<button
							class="primary"
							type="button"
							disabled={busy}
							onclick={() => void compareEnsemble()}
							>{busy ? 'Calculating 48 histories…' : 'Compare 48 possible histories'}</button
						>
					{/if}
				</div>
			</section>
		{/if}

		{#if experience.stage === 'inspect'}
			<EnsembleReadout
				{comparison}
				interventionLabel={interventionLabel(experience.intervention)}
				{moreTimeNearWithoutBurst}
			/>
			<div class="inspect-actions">
				<button
					class="primary"
					type="button"
					onclick={() => (experience = transitionExperience(experience, { type: 'OPEN_MODEL' }))}
					>How is this modeled?</button
				>
			</div>
			<ModelDisclosure
				open={experience.modelOpen}
				onclose={() => (experience = transitionExperience(experience, { type: 'CLOSE_MODEL' }))}
			/>
		{/if}

		{#if experience.stage !== 'attract'}
			<section class="utility-rail" aria-label="Playback, sound, sharing and reset">
				<button type="button" onclick={() => (playbackPaused = !playbackPaused)}
					>{playbackPaused ? 'Play trace' : 'Pause motion'}</button
				>
				<button
					type="button"
					disabled={!activeResult}
					aria-pressed={audioActive}
					onclick={() => void toggleAudio()}>{audioActive ? 'Mute' : 'Hear the model'}</button
				>
				<button type="button" onclick={() => void share()}>Copy share link</button>
				<button type="button" onclick={() => void reset()}>Reset</button>
				<span>{shareStatus}</span>
			</section>

			<details class="sound-transcript">
				<summary>Sound key and event transcript</summary>
				<p>
					Cyan activity is a quiet tonal band; promoter entry into ON is a short tone; each
					initiation is a discrete tick. Sound is optional and carries no unique information.
				</p>
				{#if activeResult}
					<p>
						Across 0–{activeResult.parameters.duration} model minutes, this trace contained
						{activeResult.summary.burstCount}
						{plural(activeResult.summary.burstCount, 'burst')} and
						{activeResult.summary.initiationCount}
						{plural(activeResult.summary.initiationCount, 'initiation')}.
						{#if activeResult.initiationTimes.length}
							Initiations occurred at model minutes {Array.from(
								activeResult.initiationTimes,
								(time) => time.toFixed(1)
							).join(', ')}.
						{:else}
							No transcripts initiated.
						{/if}
					</p>
				{/if}
			</details>
		{/if}

		<p class="status-line" role="status">{statusText}</p>
		{#if errorText}<p class="error-line" role="alert">{errorText}</p>{/if}
		<p class="sr-only" aria-live="polite">{announcement}</p>
	</div>
</section>

<noscript>
	<style>
		.hero-copy {
			opacity: 1 !important;
			transform: none !important;
		}
	</style>
</noscript>

<style>
	.weather-experience {
		--wn-bg: #050712;
		--wn-panel: #090b19;
		--wn-text: #f7fbff;
		--wn-muted: #b6b7c9;
		--wn-cyan: #6ce5ff;
		--wn-magenta: #ed62d0;
		--wn-amber: #ffd166;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(96vw, 92rem);
		margin: 0 0 clamp(2rem, 7vw, 6rem);
		transform: translateX(-50%);
		border: 1px solid rgb(135 139 177 / 30%);
		border-radius: 0.8rem;
		overflow: clip;
		background: var(--wn-bg);
		box-shadow: 0 2rem 6rem rgb(3 4 14 / 32%);
		color: var(--wn-text);
		color-scheme: dark;
	}

	.hero-scene {
		position: relative;
		min-height: clamp(38rem, 79vh, 55rem);
		overflow: hidden;
		background: var(--wn-bg);
		isolation: isolate;
	}

	.visual-layer {
		position: absolute;
		inset: 0;
	}

	.visual-layer :global(.nucleus-poster),
	.visual-layer :global(.cross-section) {
		width: 100%;
		height: 100%;
		min-height: inherit;
	}

	.visual-layer::after {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgb(5 7 18 / 84%) 0, rgb(5 7 18 / 18%) 56%, transparent 78%),
			linear-gradient(0deg, rgb(5 7 18 / 72%) 0, transparent 45%);
		content: '';
		pointer-events: none;
	}

	.intro-tools {
		position: absolute;
		z-index: 5;
		top: clamp(0.75rem, 2vw, 1.4rem);
		right: clamp(0.75rem, 2vw, 1.4rem);
		display: flex;
		gap: 0.45rem;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid rgb(210 214 235 / 52%);
		border-radius: 0.35rem;
		background: rgb(8 10 25 / 86%);
		padding: 0.52rem 0.78rem;
		color: var(--wn-text);
		font: 700 0.73rem/1.2 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	button:hover:not(:disabled),
	button[aria-pressed='true'] {
		border-color: var(--wn-cyan);
		background: #14192e;
	}

	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid #fff;
		outline-offset: 3px;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.55;
	}

	button.primary {
		border-color: var(--wn-amber);
		background: var(--wn-amber);
		color: #16120a;
	}

	.semantic-scale {
		position: absolute;
		z-index: 4;
		top: 47%;
		left: 50%;
		display: flex;
		align-items: center;
		gap: 0.65rem;
		transform: translate(-50%, -50%);
		opacity: 0;
		color: #e6e4f1;
		font:
			750 clamp(0.65rem, 1.2vw, 0.82rem) / 1 ui-monospace,
			monospace;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.semantic-scale.visible {
		opacity: 1;
	}

	.semantic-scale em {
		position: absolute;
		top: calc(100% + 0.8rem);
		left: 50%;
		transform: translateX(-50%);
		color: #a4a5b8;
		font-size: 0.62rem;
		font-style: normal;
		white-space: nowrap;
	}

	.reduced-frame-label {
		position: absolute;
		z-index: 5;
		top: 5.1rem;
		left: clamp(0.75rem, 2vw, 1.4rem);
		margin: 0;
		border: 1px solid rgb(247 251 255 / 34%);
		border-radius: 0.3rem;
		background: rgb(5 7 18 / 88%);
		padding: 0.4rem 0.55rem;
		color: #f7fbff;
		font:
			700 0.65rem/1.3 ui-monospace,
			monospace;
	}

	.hero-copy {
		position: absolute;
		z-index: 3;
		bottom: clamp(2rem, 7vh, 5rem);
		left: clamp(1rem, 5vw, 5rem);
		max-width: 46rem;
		opacity: 0;
		transform: translateY(0.8rem);
		transition:
			opacity 420ms ease,
			transform 420ms ease;
	}

	.hero-copy.revealed {
		opacity: 1;
		transform: none;
	}

	.model-kicker,
	.eyebrow {
		margin: 0;
		color: var(--wn-cyan);
		font:
			750 0.66rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	h1 {
		max-width: 12ch;
		margin: 0.65rem 0 0;
		color: #fff;
		font: 790 clamp(3rem, 8vw, 7.8rem) / 0.84 var(--font-sans, sans-serif);
		letter-spacing: -0.075em;
		text-wrap: balance;
	}

	.opening-line {
		margin: 1.1rem 0 0;
		color: var(--wn-amber);
		font: 750 clamp(1.05rem, 2.2vw, 1.65rem) / 1.2 var(--font-sans, sans-serif);
	}

	.dek {
		max-width: 52ch;
		margin: 0.5rem 0 0;
		color: #d0d0de;
		font: 0.92rem/1.55 var(--font-sans, sans-serif);
	}

	.byline {
		margin: 0.55rem 0 0;
		color: #989bae;
		font:
			0.68rem/1.4 ui-monospace,
			monospace;
	}

	.hero-copy .primary {
		margin-top: 1rem;
	}

	.intro-progress {
		position: absolute;
		z-index: 6;
		inset: auto 0 0;
		height: 3px;
		background: rgb(255 255 255 / 8%);
	}

	.intro-progress span {
		display: block;
		width: 100%;
		height: 100%;
		transform-origin: left;
		background: linear-gradient(90deg, var(--wn-cyan), var(--wn-magenta), var(--wn-amber));
	}

	.experience-panel {
		background: var(--wn-panel);
	}

	.stage-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid rgb(151 153 190 / 24%);
		padding: 0.65rem clamp(0.75rem, 2vw, 1.2rem);
	}

	.stage-bar > p {
		margin: 0;
		color: #a8aabd;
		font:
			700 0.64rem/1.2 ui-monospace,
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.stage-bar > p span {
		color: var(--wn-amber);
	}

	.view-controls,
	.segmented,
	.action-row,
	.utility-rail {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.view-controls {
		justify-content: flex-end;
	}

	.segmented {
		border: 1px solid #34374c;
		border-radius: 0.4rem;
		padding: 0.18rem;
	}

	.segmented button {
		min-height: 2.3rem;
		border: 0;
		padding: 0.35rem 0.55rem;
		text-transform: capitalize;
	}

	.live-scene {
		position: relative;
		height: clamp(27rem, 66vh, 48rem);
		background: var(--wn-bg);
	}

	.journey-copy {
		padding: clamp(1.2rem, 4vw, 2.7rem);
	}

	.journey-copy h2 {
		max-width: 22ch;
		margin: 0.45rem 0 0;
		color: #fff;
		font: 780 clamp(1.8rem, 4.5vw, 4rem) / 0.96 var(--font-sans, sans-serif);
		letter-spacing: -0.045em;
	}

	.journey-copy > p:not(.eyebrow) {
		max-width: 68ch;
		margin: 0.75rem 0 0;
		color: var(--wn-muted);
		font: 0.88rem/1.55 var(--font-sans, sans-serif);
	}

	.journey-copy > .primary,
	.action-row {
		margin-top: 1rem;
	}

	.result-copy h2 {
		color: var(--wn-amber);
	}

	.inspect-actions {
		border-top: 1px solid #34374b;
		padding: 1rem clamp(1rem, 3vw, 2rem);
	}

	.utility-rail {
		align-items: center;
		border-top: 1px solid #34374b;
		padding: 0.8rem clamp(0.75rem, 2vw, 1.2rem);
	}

	.utility-rail span {
		color: #a9aabc;
		font: 0.68rem/1.4 var(--font-sans, sans-serif);
	}

	.sound-transcript {
		border-top: 1px solid #292c40;
		padding: 0.8rem clamp(0.75rem, 2vw, 1.2rem);
		color: #b8b9ca;
		font: 0.75rem/1.55 var(--font-sans, sans-serif);
	}

	.sound-transcript summary {
		min-height: 2.75rem;
		color: #e9e8f2;
		font-weight: 750;
		cursor: pointer;
	}

	.sound-transcript p {
		max-width: 75ch;
	}

	.status-line,
	.error-line {
		margin: 0;
		border-top: 1px solid #24273b;
		padding: 0.6rem clamp(0.75rem, 2vw, 1.2rem);
		color: #9497ad;
		font:
			0.65rem/1.4 ui-monospace,
			monospace;
	}

	.error-line {
		color: #ffd2cc;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.high-contrast {
		--wn-muted: #f4f4f7;
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-copy {
			transform: none;
			transition: none;
		}
	}

	@media (max-width: 760px) {
		.weather-experience {
			width: 100vw;
			border-inline: 0;
			border-radius: 0;
		}

		.hero-scene {
			min-height: 42rem;
		}

		.visual-layer::after {
			background: linear-gradient(0deg, rgb(5 7 18 / 92%) 0, rgb(5 7 18 / 20%) 72%);
		}

		.hero-copy {
			right: 1rem;
			bottom: 2.2rem;
			left: 1rem;
		}

		h1 {
			font-size: clamp(2.8rem, 15vw, 5.2rem);
		}

		.stage-bar {
			align-items: flex-start;
			flex-direction: column;
		}

		.view-controls {
			width: 100%;
			justify-content: flex-start;
		}

		.segmented:first-child {
			width: 100%;
		}

		.segmented:first-child button {
			flex: 1;
		}

		.live-scene {
			height: 31rem;
		}
	}

	@media (max-width: 390px) {
		.intro-tools {
			right: 0.55rem;
			left: 0.55rem;
			justify-content: flex-end;
		}

		.semantic-scale {
			gap: 0.35rem;
		}

		.view-controls {
			display: grid;
			grid-template-columns: 1fr;
		}

		.segmented:last-child {
			width: max-content;
		}
	}

	@media (forced-colors: active) {
		.weather-experience,
		.experience-panel,
		button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		button.primary {
			border: 3px solid ButtonText;
			background: Highlight;
			color: HighlightText;
		}
	}

	@media print {
		.weather-experience {
			left: 0;
			width: 100%;
			transform: none;
			box-shadow: none;
		}

		.intro-tools,
		.view-controls,
		.utility-rail,
		.intro-progress {
			display: none;
		}

		.hero-copy {
			opacity: 1;
			transform: none;
		}
	}
</style>
