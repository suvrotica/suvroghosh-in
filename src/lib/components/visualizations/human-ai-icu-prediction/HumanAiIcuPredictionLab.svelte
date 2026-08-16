<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		DEFAULT_ICU_LAB_PRESET_ID,
		ICU_LAB_PRESETS,
		cloneIcuLabConfig,
		configForIcuLabPreset,
		runIcuLab,
		sampleCasesForDisplay,
		type BaseCaseDraw,
		type ForecasterConfig,
		type IcuLabConfig,
		type IcuPresetId
	} from '$lib/visualizations/human-ai-icu-prediction';
	import DisclaimerBanner from './DisclaimerBanner.svelte';
	import ForecasterControls from './ForecasterControls.svelte';
	import FullscreenControl from './FullscreenControl.svelte';
	import MethodDisclosures from './MethodDisclosures.svelte';
	import PresetSelector from './PresetSelector.svelte';
	import ReliabilityDiagram from './ReliabilityDiagram.svelte';
	import ScorePanel from './ScorePanel.svelte';
	import SharedErrorCanvas from './SharedErrorCanvas.svelte';
	import SyntheticCaseCard from './SyntheticCaseCard.svelte';

	type TabId = 'scores' | 'calibration' | 'shared-error';
	type ControlConfig = {
		developmentEventRate: number;
		deploymentEventRate: number;
		clinician: ForecasterConfig;
		model: ForecasterConfig;
		sharedResidualCorrelation: number;
		clinicianWeight: number;
	};

	const tabs: readonly { id: TabId; label: string; eyebrow: string }[] = [
		{ id: 'scores', label: 'Scores', eyebrow: 'Weight curve' },
		{ id: 'calibration', label: 'Calibration', eyebrow: 'Reliability' },
		{ id: 'shared-error', label: 'Shared error', eyebrow: 'Casewise loss' }
	];
	const focusModeBodyClass = 'icu-lab-focus-mode-open';
	const initialConfig = configForIcuLabPreset(DEFAULT_ICU_LAB_PRESET_ID);
	const initialRun = runIcuLab(initialConfig);

	let shell = $state<HTMLElement>();
	let config = $state<IcuLabConfig>(cloneIcuLabConfig(initialConfig));
	let retainedBaseDraws = $state.raw<readonly BaseCaseDraw[]>(initialRun.baseDraws);
	let originPresetId = $state<IcuPresetId>(DEFAULT_ICU_LAB_PRESET_ID);
	let custom = $state(false);
	let activeTab = $state<TabId>('scores');
	let selectedCaseIndex = $state(initialRun.selectedCaseIndex);
	let liveMessage = $state('The synthetic laboratory is ready.');
	let cohortRevision = $state(0);
	let nativeFullscreen = $state(false);
	let focusMode = $state(false);
	let fullscreenAvailable = $state(false);
	let previousBodyOverflow = '';
	let focusModeBodyStateApplied = false;
	let focusModeAnchor: Comment | null = null;
	let focusModeReturnScrollY: number | null = null;
	let configFrame: number | null = null;
	let pendingControlConfig: ControlConfig | null = null;
	let controlAnnouncementTimer: ReturnType<typeof setTimeout> | null = null;

	let lab = $derived(runIcuLab(config, retainedBaseDraws));
	let selectedCase = $derived(lab.cases[selectedCaseIndex] ?? lab.cases[0]);
	let originPreset = $derived(
		ICU_LAB_PRESETS.find((preset) => preset.id === originPresetId) ?? ICU_LAB_PRESETS[0]
	);
	let configurationLabel = $derived(
		custom ? `Custom — based on ${originPreset.title}` : originPreset.title
	);
	let expanded = $derived(nativeFullscreen || focusMode);
	let sampledCases = $derived(
		sampleCasesForDisplay(lab.cases, {
			maximum: 600,
			seed: `${config.seed}:loss-scatter-v1`,
			includeCaseIndex: selectedCaseIndex
		})
	);
	let forecastDistributions = $derived({
		clinician: lab.cases.map((item) => item.probabilities.clinician),
		model: lab.cases.map((item) => item.probabilities.model),
		ensemble: lab.cases.map((item) => item.probabilities.ensemble)
	});

	function applyPreset(id: string): void {
		const preset = ICU_LAB_PRESETS.find((candidate) => candidate.id === id);
		if (!preset) return;
		if (controlAnnouncementTimer !== null) {
			clearTimeout(controlAnnouncementTimer);
			controlAnnouncementTimer = null;
		}
		if (configFrame !== null && typeof window !== 'undefined') {
			window.cancelAnimationFrame(configFrame);
			configFrame = null;
		}
		pendingControlConfig = null;
		const nextConfig = cloneIcuLabConfig(preset.config);
		const nextRun = runIcuLab(nextConfig);
		originPresetId = preset.id;
		custom = false;
		cohortRevision = 0;
		retainedBaseDraws = nextRun.baseDraws;
		config = nextConfig;
		selectedCaseIndex = nextRun.selectedCaseIndex;
		liveMessage = `${preset.title} applied. All synthetic settings were replaced together.`;
	}

	function mergeControlConfig(next: ControlConfig): IcuLabConfig {
		return {
			...config,
			clinician: { ...next.clinician },
			model: { ...next.model },
			sharedResidualCorrelation: next.sharedResidualCorrelation,
			clinicianWeight: next.clinicianWeight
		};
	}

	function queueControlChange(next: ControlConfig): void {
		pendingControlConfig = next;
		custom = true;
		if (typeof window === 'undefined') {
			config = mergeControlConfig(next);
			pendingControlConfig = null;
			return;
		}
		if (configFrame !== null) return;
		configFrame = window.requestAnimationFrame(() => {
			configFrame = null;
			if (!pendingControlConfig) return;
			config = mergeControlConfig(pendingControlConfig);
			pendingControlConfig = null;
		});
	}

	function announceControlCommit(): void {
		let committedConfig = config;
		if (pendingControlConfig) {
			if (configFrame !== null && typeof window !== 'undefined') {
				window.cancelAnimationFrame(configFrame);
				configFrame = null;
			}
			committedConfig = mergeControlConfig(pendingControlConfig);
			config = committedConfig;
			pendingControlConfig = null;
		}
		if (controlAnnouncementTimer !== null) clearTimeout(controlAnnouncementTimer);
		controlAnnouncementTimer = setTimeout(() => {
			liveMessage = `Custom settings applied. Clinician weight ${committedConfig.clinicianWeight.toFixed(2)}; shared residual dependence ${committedConfig.sharedResidualCorrelation.toFixed(2)}.`;
			controlAnnouncementTimer = null;
		}, 350);
	}

	function resetOriginPreset(): void {
		const nextConfig = configForIcuLabPreset(originPresetId);
		const nextRun = runIcuLab(nextConfig);
		if (configFrame !== null && typeof window !== 'undefined') {
			window.cancelAnimationFrame(configFrame);
			configFrame = null;
		}
		pendingControlConfig = null;
		if (controlAnnouncementTimer !== null) {
			clearTimeout(controlAnnouncementTimer);
			controlAnnouncementTimer = null;
		}
		custom = false;
		cohortRevision = 0;
		retainedBaseDraws = nextRun.baseDraws;
		config = nextConfig;
		selectedCaseIndex = nextRun.selectedCaseIndex;
		liveMessage = `${originPreset.title} restored in full.`;
	}

	function generateAnotherCohort(): void {
		if (controlAnnouncementTimer !== null) {
			clearTimeout(controlAnnouncementTimer);
			controlAnnouncementTimer = null;
		}
		cohortRevision += 1;
		const nextConfig: IcuLabConfig = {
			...config,
			seed: `${originPreset.config.seed}-check-${cohortRevision}`
		};
		const nextRun = runIcuLab(nextConfig);
		custom = true;
		retainedBaseDraws = nextRun.baseDraws;
		config = nextConfig;
		selectedCaseIndex = nextRun.selectedCaseIndex;
		liveMessage = `Generated deterministic robustness cohort ${cohortRevision} with seed ${nextConfig.seed}.`;
	}

	function previousCase(): void {
		selectedCaseIndex = (selectedCaseIndex - 1 + lab.cases.length) % lab.cases.length;
	}

	function nextCase(): void {
		selectedCaseIndex = (selectedCaseIndex + 1) % lab.cases.length;
	}

	function selectCase(index: number): void {
		if (index < 0 || index >= lab.cases.length) return;
		selectedCaseIndex = index;
	}

	function selectTab(id: TabId, announce = true): void {
		activeTab = id;
		if (announce) {
			liveMessage = `${tabs.find((tab) => tab.id === id)?.label ?? id} chart selected.`;
		}
	}

	function handleTabKeydown(event: KeyboardEvent, index: number): void {
		let nextIndex: number | null = null;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
			nextIndex = (index + 1) % tabs.length;
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			nextIndex = (index - 1 + tabs.length) % tabs.length;
		} else if (event.key === 'Home') nextIndex = 0;
		else if (event.key === 'End') nextIndex = tabs.length - 1;
		if (nextIndex === null) return;
		event.preventDefault();
		const nextTab = tabs[nextIndex];
		selectTab(nextTab.id);
		requestAnimationFrame(() => {
			shell?.querySelector<HTMLButtonElement>(`#icu-tab-${nextTab.id}`)?.focus();
		});
	}

	async function restoreLaunchFocus(returnScrollY: number | null = null): Promise<void> {
		await tick();
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
		if (returnScrollY !== null) {
			window.scrollTo({ top: returnScrollY, left: window.scrollX, behavior: 'auto' });
		}
		shell
			?.querySelector<HTMLButtonElement>('[data-testid="icu-toggle-expanded"]')
			?.focus({ preventScroll: true });
	}

	async function focusExitControl(): Promise<void> {
		await tick();
		shell
			?.querySelector<HTMLButtonElement>('[data-testid="icu-exit-expanded"]')
			?.focus({ preventScroll: true });
	}

	function applyFocusModeBodyState(): void {
		if (!focusModeBodyStateApplied) previousBodyOverflow = document.body.style.overflow;
		document.body.classList.add(focusModeBodyClass);
		document.body.style.overflow = 'hidden';
		focusModeBodyStateApplied = true;
	}

	function restoreFocusModeBodyState(): void {
		if (!focusModeBodyStateApplied) return;
		document.body.classList.remove(focusModeBodyClass);
		document.body.style.overflow = previousBodyOverflow;
		focusModeBodyStateApplied = false;
	}

	function portalFocusModeToBody(): void {
		if (!shell || focusModeAnchor || shell.parentNode === document.body) return;
		focusModeAnchor = document.createComment('icu-lab-focus-mode-anchor');
		shell.parentNode?.insertBefore(focusModeAnchor, shell);
		document.body.appendChild(shell);
	}

	function restoreFocusModePortal(): void {
		if (!shell || !focusModeAnchor) return;
		focusModeAnchor.parentNode?.insertBefore(shell, focusModeAnchor);
		focusModeAnchor.remove();
		focusModeAnchor = null;
	}

	async function openExpanded(_trigger: HTMLButtonElement): Promise<void> {
		if (!shell) return;
		const returnScrollY = window.scrollY;
		if (fullscreenAvailable) {
			try {
				await shell.requestFullscreen();
				return;
			} catch {
				liveMessage = 'Browser fullscreen was unavailable, so fixed focus mode opened instead.';
			}
		}
		focusModeReturnScrollY = returnScrollY;
		applyFocusModeBodyState();
		portalFocusModeToBody();
		focusMode = true;
		await focusExitControl();
	}

	async function closeExpanded(): Promise<void> {
		if (nativeFullscreen && document.fullscreenElement) {
			await document.exitFullscreen();
			return;
		}
		if (focusMode) {
			const returnScrollY = focusModeReturnScrollY;
			focusMode = false;
			await tick();
			restoreFocusModePortal();
			restoreFocusModeBodyState();
			focusModeReturnScrollY = null;
			await restoreLaunchFocus(returnScrollY);
		}
	}

	function updateFullscreenState(): void {
		const wasNative = nativeFullscreen;
		nativeFullscreen = document.fullscreenElement === shell;
		if (nativeFullscreen) void focusExitControl();
		else if (wasNative) void restoreLaunchFocus();
	}

	function focusableElements(): HTMLElement[] {
		if (!shell) return [];
		return Array.from(
			shell.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (!expanded) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			void closeExpanded();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusables = focusableElements();
		if (!focusables.length) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && (active === first || !shell?.contains(active))) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (active === last || !shell?.contains(active))) {
			event.preventDefault();
			first.focus();
		}
	}

	onMount(() => {
		fullscreenAvailable = Boolean(
			document.fullscreenEnabled && shell && typeof shell.requestFullscreen === 'function'
		);
		document.addEventListener('fullscreenchange', updateFullscreenState);
		return () => {
			document.removeEventListener('fullscreenchange', updateFullscreenState);
			if (configFrame !== null) cancelAnimationFrame(configFrame);
			if (controlAnnouncementTimer !== null) clearTimeout(controlAnnouncementTimer);
			restoreFocusModePortal();
			restoreFocusModeBodyState();
			focusModeReturnScrollY = null;
		};
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section
	bind:this={shell}
	class="icu-laboratory article-breakout not-prose"
	class:focus-mode={focusMode}
	class:expanded
	role={expanded ? 'dialog' : 'region'}
	aria-modal={expanded ? 'true' : undefined}
	aria-labelledby="human-ai-icu-heading"
	data-testid="human-ai-icu-laboratory"
	data-ready="true"
	data-preset={originPresetId}
	data-custom={custom ? 'true' : 'false'}
	data-active-tab={activeTab}
	data-expanded={expanded ? 'true' : 'false'}
>
	<header class="lab-header">
		<div class="lab-identity">
			<p>HUMAN + AI · SYNTHETIC FORECAST EVALUATION</p>
			<h2 id="human-ai-icu-heading">Human + AI ICU Prediction Laboratory</h2>
			<span>{lab.endpoint.title}</span>
		</div>
		<FullscreenControl
			active={expanded}
			available={fullscreenAvailable}
			onenter={openExpanded}
			onexit={() => void closeExpanded()}
		/>
	</header>

	<div class="lab-scroll">
		<div class="disclaimer-wrap"><DisclaimerBanner disclaimer={lab.endpoint.disclaimer} /></div>

		<PresetSelector
			presets={ICU_LAB_PRESETS}
			activeId={originPresetId}
			{custom}
			onselect={applyPreset}
		/>

		<div class="laboratory-grid">
			<div class="results-stage">
				<SyntheticCaseCard
					caseRecord={selectedCase}
					clinicianWeight={config.clinicianWeight}
					totalCases={lab.cases.length}
					positiveOutcomeLabel={lab.endpoint.positiveOutcomeLabel}
					negativeOutcomeLabel={lab.endpoint.negativeOutcomeLabel}
					onprevious={previousCase}
					onnext={nextCase}
				/>

				<section class="headline-metrics" aria-labelledby="icu-headline-metrics-heading">
					<h3 id="icu-headline-metrics-heading">Cohort Brier scores</h3>
					<div class="metric-cards">
						<article class="clinician">
							<span class="circle" aria-hidden="true"></span>
							<p>Clinician</p>
							<strong>{lab.metrics.brierScores.clinician.toFixed(4)}</strong>
						</article>
						<article class="model">
							<span class="square" aria-hidden="true"></span>
							<p>Model</p>
							<strong>{lab.metrics.brierScores.model.toFixed(4)}</strong>
						</article>
						<article class="ensemble">
							<span class="diamond" aria-hidden="true"></span>
							<p>Ensemble</p>
							<strong>{lab.metrics.brierScores.ensemble.toFixed(4)}</strong>
						</article>
						<article class="gain">
							<span aria-hidden="true">Δ</span>
							<p>Gain vs better member</p>
							<strong
								>{lab.metrics.ensembleGain > 0 ? '+' : ''}{lab.metrics.ensembleGain.toFixed(
									4
								)}</strong
							>
						</article>
					</div>
					<p class="mean-line">
						Mean forecasts: clinician {(lab.metrics.meanPredictions.clinician * 100).toFixed(1)}% ·
						model {(lab.metrics.meanPredictions.model * 100).toFixed(1)}% · ensemble
						{(lab.metrics.meanPredictions.ensemble * 100).toFixed(1)}%. Observed synthetic event
						rate:
						<strong>{(lab.metrics.observedEventRate * 100).toFixed(1)}%</strong>.
					</p>
				</section>

				<section class="interpretation" aria-labelledby="icu-interpretation-heading">
					<p class="eyebrow">WHAT HAPPENED?</p>
					<h3 id="icu-interpretation-heading">{lab.interpretation.headline}</h3>
					<p>{lab.interpretation.summary}</p>
					<ul>
						{#each lab.interpretation.details as detail}<li>{detail}</li>{/each}
					</ul>
				</section>

				<section class="chart-instrument" aria-labelledby="icu-chart-instrument-heading">
					<h3 id="icu-chart-instrument-heading" class="visually-hidden">Why the result happened</h3>
					<div class="tabs" role="tablist" aria-label="Forecast evaluation views">
						{#each tabs as tab, index (tab.id)}
							<button
								id={`icu-tab-${tab.id}`}
								type="button"
								role="tab"
								data-testid={`icu-tab-${tab.id}`}
								aria-selected={activeTab === tab.id}
								aria-controls={`icu-panel-${tab.id}`}
								tabindex={activeTab === tab.id ? 0 : -1}
								onclick={() => selectTab(tab.id)}
								onkeydown={(event) => handleTabKeydown(event, index)}
							>
								<small>{tab.eyebrow}</small><span>{tab.label}</span>
							</button>
						{/each}
					</div>

					<div
						id={`icu-panel-${activeTab}`}
						class="tab-panel"
						role="tabpanel"
						aria-labelledby={`icu-tab-${activeTab}`}
						tabindex="0"
					>
						{#if activeTab === 'scores'}
							<ScorePanel
								metrics={lab.metrics}
								weightCurve={lab.weightCurve}
								clinicianWeight={config.clinicianWeight}
							/>
						{:else if activeTab === 'calibration'}
							<ReliabilityDiagram
								calibration={lab.calibration}
								distributions={forecastDistributions}
							/>
						{:else}
							<SharedErrorCanvas
								cases={sampledCases}
								{selectedCaseIndex}
								configuredCorrelation={config.sharedResidualCorrelation}
								metrics={lab.metrics}
								onselect={selectCase}
							/>
						{/if}
					</div>
				</section>
			</div>

			<aside class="control-rail">
				<ForecasterControls
					{config}
					label={configurationLabel}
					onchange={queueControlChange}
					oncommit={announceControlCommit}
					onreset={resetOriginPreset}
				/>
			</aside>
		</div>

		<MethodDisclosures
			endpointTitle={lab.endpoint.title}
			{config}
			metrics={lab.metrics}
			calibration={lab.calibration}
			weightCurve={lab.weightCurve.points}
			onnewcohort={generateAnotherCohort}
		/>

		<footer>
			<p>
				<strong>Averaging is arithmetic, not magic.</strong> Two clocks can correct one another when they
				drift differently. Two clocks wired to the same bad battery can agree about the wrong time.
			</p>
			<p>
				All computation is local and deterministic. No network request, upload, tracking, or
				persistence.
			</p>
		</footer>

		<noscript>
			<section class="noscript-poster" aria-labelledby="icu-noscript-heading">
				<p class="eyebrow">STATIC SYNTHETIC LABORATORY</p>
				<h3 id="icu-noscript-heading">Two forecasts enter a weighted probability mixer</h3>
				<div class="poster-streams" aria-hidden="true">
					<span class="clinician-stream">Clinician forecast</span>
					<strong>weighted<br />average</strong>
					<span class="ensemble-stream">Ensemble forecast</span>
					<span class="model-stream">Model forecast</span>
				</div>
				<p>
					JavaScript is disabled, so the deterministic controls and charts cannot update. The
					article’s explanation remains readable: a pool can benefit from differently structured
					error, but shared blind spots and shared miscalibration survive the average.
				</p>
				<strong>Synthetic educational simulation</strong>
			</section>
		</noscript>
	</div>

	<p class="live-region" aria-live="polite" aria-atomic="true">{liveMessage}</p>
</section>

<style>
	:global(body.icu-lab-focus-mode-open .site-shell > header.sticky) {
		display: none;
	}

	.icu-laboratory {
		position: relative;
		z-index: 1;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		container-name: icu-lab;
		container-type: inline-size;
		width: min(94rem, calc(100vw - 1rem));
		min-width: 0;
		margin: clamp(1.5rem, 4vw, 3rem) 0;
		transform: translateX(-50%);
		overflow: clip;
		border: 1px solid var(--rule);
		border-radius: 0.85rem;
		background: var(--paper);
		box-shadow: var(--shadow-overlay);
		color: var(--ink);
		isolation: isolate;
		--icu-paper: var(--paper);
		--icu-raised: var(--paper-raised);
		--icu-plot-paper: color-mix(in oklab, var(--paper) 92%, var(--paper-raised));
		--icu-ink: var(--ink);
		--icu-muted: var(--ink-muted);
		--icu-rule: var(--rule);
		--icu-control: var(--control-border);
		--icu-accent: var(--accent);
		--icu-focus: var(--focus-ring, var(--accent));
		--icu-sans: var(--font-sans, sans-serif);
		--icu-mono: var(--font-mono, ui-monospace, monospace);
		--icu-clinician: color-mix(in oklab, #0789aa 78%, var(--accent));
		--icu-model: color-mix(in oklab, #d17621 86%, var(--ink));
		--icu-ensemble: color-mix(in oklab, #7958c4 88%, var(--ink));
		--icu-reference: color-mix(in oklab, var(--ink-muted) 80%, var(--paper));
	}

	.icu-laboratory,
	.icu-laboratory * {
		box-sizing: border-box;
	}

	.lab-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--icu-rule);
		background: var(--icu-raised);
		padding: 0.8rem clamp(0.75rem, 2cqi, 1.25rem);
	}

	.lab-identity {
		min-width: 0;
	}

	.lab-identity p,
	.lab-identity h2,
	.lab-identity span,
	.interpretation p,
	.interpretation h3,
	.interpretation ul,
	.headline-metrics h3,
	.headline-metrics p,
	.metric-cards p,
	footer p,
	.noscript-poster p,
	.noscript-poster h3 {
		margin: 0;
	}

	.lab-identity p,
	.eyebrow {
		color: var(--icu-accent);
		font: 760 0.62rem/1.2 var(--icu-mono);
		letter-spacing: 0.09em;
	}

	.lab-identity h2 {
		margin-top: 0.12rem;
		font: 820 clamp(1.05rem, 2.3cqi, 1.55rem)/1.08 var(--icu-sans);
		letter-spacing: -0.02em;
	}

	.lab-identity > span {
		display: block;
		margin-top: 0.15rem;
		color: var(--icu-muted);
		font: 0.7rem/1.35 var(--icu-sans);
	}

	.lab-scroll {
		display: grid;
		gap: 1rem;
		min-width: 0;
		padding: clamp(0.65rem, 1.7cqi, 1.2rem);
	}

	.disclaimer-wrap,
	.laboratory-grid,
	.control-rail,
	.results-stage,
	.chart-instrument,
	.tab-panel,
	footer {
		min-width: 0;
	}

	.laboratory-grid {
		display: grid;
		grid-template-columns: minmax(19rem, 0.92fr) minmax(0, 2.08fr);
		grid-template-areas: 'controls results';
		gap: 0.9rem;
		align-items: start;
	}

	.control-rail {
		grid-area: controls;
		position: sticky;
		top: 0.75rem;
	}

	.results-stage {
		display: grid;
		grid-area: results;
		gap: 0.8rem;
	}

	.headline-metrics {
		display: grid;
		gap: 0.45rem;
	}

	.headline-metrics h3 {
		font: 760 0.75rem/1.3 var(--icu-sans);
	}

	.metric-cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.42rem;
	}

	.metric-cards article {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.18rem 0.35rem;
		min-width: 0;
		border: 1px solid var(--icu-rule);
		border-top: 3px solid var(--series);
		border-radius: 0.45rem;
		background: var(--icu-raised);
		padding: 0.5rem;
		--series: var(--icu-ensemble);
	}

	.metric-cards article.clinician {
		--series: var(--icu-clinician);
	}

	.metric-cards article.model {
		--series: var(--icu-model);
	}

	.metric-cards article.gain {
		--series: var(--icu-ink);
	}

	.metric-cards article > span {
		width: 0.58rem;
		height: 0.58rem;
		align-self: center;
		border: 2px solid var(--series);
		color: var(--series);
		font: 760 0.58rem/1 var(--icu-mono);
		text-align: center;
	}

	.metric-cards article > span.circle {
		border-radius: 50%;
	}

	.metric-cards article > span.diamond {
		transform: rotate(45deg);
	}

	.metric-cards p {
		align-self: center;
		overflow: hidden;
		color: var(--icu-muted);
		font: 0.61rem/1.25 var(--icu-sans);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.metric-cards strong {
		grid-column: 1 / -1;
		font: 800 clamp(0.84rem, 1.7cqi, 1.03rem) var(--icu-mono);
		font-variant-numeric: tabular-nums;
	}

	.mean-line {
		color: var(--icu-muted);
		font: 0.65rem/1.45 var(--icu-sans);
	}

	.mean-line strong {
		color: var(--icu-ink);
	}

	.interpretation {
		border: 1px solid var(--icu-rule);
		border-left: 4px solid var(--icu-ensemble);
		border-radius: 0.55rem;
		background: color-mix(in oklab, var(--icu-ensemble) 7%, var(--icu-raised));
		padding: 0.75rem;
	}

	.interpretation h3 {
		margin-top: 0.18rem;
		font: 790 clamp(0.98rem, 2cqi, 1.18rem)/1.25 var(--icu-sans);
	}

	.interpretation > p:not(.eyebrow),
	.interpretation li {
		color: var(--icu-muted);
		font: 0.69rem/1.5 var(--icu-sans);
	}

	.interpretation > p:not(.eyebrow) {
		margin-top: 0.28rem;
	}

	.interpretation ul {
		display: grid;
		gap: 0.2rem;
		margin-top: 0.45rem;
		padding-left: 1.05rem;
	}

	.chart-instrument {
		border: 1px solid var(--icu-rule);
		border-radius: 0.6rem;
		background: var(--icu-raised);
	}

	.tabs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-bottom: 1px solid var(--icu-rule);
		background: var(--icu-paper);
	}

	.tabs button {
		position: relative;
		display: grid;
		min-width: 0;
		min-height: 3.4rem;
		place-content: center;
		gap: 0.12rem;
		border: 0;
		border-right: 1px solid var(--icu-rule);
		background: transparent;
		padding: 0.45rem;
		color: var(--icu-muted);
		font: 760 0.76rem/1.2 var(--icu-sans);
		cursor: pointer;
	}

	.tabs button:last-child {
		border-right: 0;
	}

	.tabs button::after {
		position: absolute;
		right: 0.5rem;
		bottom: -1px;
		left: 0.5rem;
		height: 3px;
		background: var(--icu-ensemble);
		content: '';
		opacity: 0;
	}

	.tabs button[aria-selected='true'] {
		background: var(--icu-raised);
		color: var(--icu-ink);
	}

	.tabs button[aria-selected='true']::after {
		opacity: 1;
	}

	.tabs small {
		font: 0.56rem/1 var(--icu-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.tab-panel {
		padding: clamp(0.65rem, 1.5cqi, 1rem);
	}

	:where(.tabs button, .tab-panel):focus-visible {
		position: relative;
		z-index: 2;
		outline: 3px solid var(--icu-focus);
		outline-offset: -3px;
	}

	footer {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		border-top: 1px solid var(--icu-rule);
		padding-top: 0.75rem;
	}

	footer p {
		max-width: 48rem;
		color: var(--icu-muted);
		font: 0.65rem/1.5 var(--icu-sans);
	}

	footer p:last-child {
		max-width: 26rem;
		text-align: right;
	}

	.noscript-poster {
		border: 2px solid var(--icu-ink);
		border-radius: 0.6rem;
		background: var(--icu-raised);
		padding: 0.9rem;
	}

	.noscript-poster h3 {
		margin-top: 0.15rem;
		font: 780 1rem/1.25 var(--icu-sans);
	}

	.noscript-poster > p:not(.eyebrow) {
		color: var(--icu-muted);
		font: 0.68rem/1.5 var(--icu-sans);
	}

	.poster-streams {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		grid-template-rows: repeat(2, auto);
		gap: 0.45rem 1rem;
		align-items: center;
		margin-block: 0.8rem;
		font: 700 0.68rem var(--icu-sans);
	}

	.poster-streams span {
		border: 2px solid var(--series);
		border-radius: 999px;
		padding: 0.45rem;
		text-align: center;
		--series: var(--icu-clinician);
	}

	.poster-streams .model-stream {
		--series: var(--icu-model);
	}

	.poster-streams .ensemble-stream {
		grid-row: 1 / 3;
		grid-column: 3;
		--series: var(--icu-ensemble);
	}

	.poster-streams strong {
		grid-row: 1 / 3;
		grid-column: 2;
		text-align: center;
	}

	.live-region,
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.icu-laboratory:fullscreen,
	.icu-laboratory.focus-mode {
		left: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: 100vw;
		height: 100dvh;
		margin: 0;
		transform: none;
		overflow: hidden;
		border: 0;
		border-radius: 0;
		background: var(--icu-paper);
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
			env(safe-area-inset-left);
	}

	.icu-laboratory.focus-mode {
		position: fixed;
		z-index: 1000;
		inset: 0;
	}

	.expanded .lab-header {
		z-index: 20;
	}

	.expanded .lab-scroll {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}

	.expanded .disclaimer-wrap {
		position: sticky;
		z-index: 15;
		top: 0;
		box-shadow: 0 0.45rem 0.75rem color-mix(in oklab, var(--icu-ink) 8%, transparent);
	}

	.expanded .control-rail {
		position: static;
	}

	@container icu-lab (min-width: 73rem) and (max-width: 78.5rem) {
		.laboratory-grid {
			grid-template-columns: minmax(18rem, 0.86fr) minmax(0, 2.14fr);
		}

		.laboratory-grid > *,
		.results-stage > * {
			min-width: 0;
		}
	}

	@container icu-lab (max-width: 68rem) {
		.laboratory-grid {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas:
				'results'
				'controls';
		}

		.control-rail {
			position: static;
		}
	}

	@container icu-lab (max-width: 48rem) {
		.metric-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		footer {
			flex-direction: column;
		}

		footer p:last-child {
			text-align: left;
		}
	}

	@container icu-lab (max-width: 34rem) {
		.lab-header {
			align-items: flex-start;
		}

		.lab-identity > span {
			display: none;
		}

		.tabs button {
			min-height: 3.75rem;
		}

		.tabs small {
			display: none;
		}
	}

	@container icu-lab (max-width: 26rem) {
		.icu-laboratory {
			border-radius: 0.55rem;
		}

		.lab-header {
			gap: 0.45rem;
			padding-inline: 0.55rem;
		}

		.lab-identity p {
			display: none;
		}

		.lab-scroll {
			padding-inline: 0.45rem;
		}

		.tabs button {
			padding-inline: 0.22rem;
			font-size: 0.69rem;
		}
	}

	@media (max-width: 640px) {
		.icu-laboratory {
			left: 50%;
			width: calc(100vw - 1rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.icu-laboratory *,
		.icu-laboratory *::before,
		.icu-laboratory *::after {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}

	@media (forced-colors: active) {
		.icu-laboratory {
			--icu-clinician: CanvasText;
			--icu-model: CanvasText;
			--icu-ensemble: CanvasText;
			--icu-reference: GrayText;
			border-color: CanvasText;
		}

		.lab-header,
		.metric-cards article,
		.interpretation,
		.chart-instrument,
		.tabs,
		.tabs button,
		footer,
		.noscript-poster {
			border-color: CanvasText;
		}

		.tabs button[aria-selected='true'] {
			outline: 2px solid Highlight;
			outline-offset: -4px;
		}
	}
</style>
