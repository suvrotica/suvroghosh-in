<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ECOSYSTEM_PRESET,
		KLUANE_CONTROL_SERIES,
		KLUANE_LIMITATIONS,
		KLUANE_PAPER_URL,
		KLUANE_PROVENANCE,
		KLUANE_RELATED_SYNTHESIS_URL,
		KLUANE_SPRING_CONTROL_SERIES,
		KLUANE_TREATMENT_SUMMARIES,
		KLUANE_HIGHER_DIMENSIONAL_URL,
		coexistencePoint,
		downsampleEcosystem,
		findFirstSharkOvershoot,
		forkEcosystemIntervention,
		simulateEcosystem,
		type EcosystemSample,
		type LotkaVolterraParameters
	} from '$lib/visualizations/homeodynamics';

	let { paused = false }: { paused?: boolean } = $props();

	type ChallengeChoice = 'stay-lower' | 'old-path' | 'overshoot' | null;
	const wideTrace = { width: 720, height: 296, left: 56, right: 700, top: 24, bottom: 244 };
	const compactTrace = { width: 268, height: 280, left: 42, right: 256, top: 24, bottom: 230 };
	const widePhase = { width: 390, height: 316, left: 58, right: 368, top: 24, bottom: 266 };
	const compactPhase = { width: 268, height: 282, left: 46, right: 256, top: 24, bottom: 232 };
	const wideField = { width: 720, height: 300, left: 70, right: 692, top: 28, bottom: 238 };
	const compactField = { width: 268, height: 286, left: 48, right: 254, top: 28, bottom: 228 };

	let root: HTMLElement;
	let sharks0 = $state(20);
	let tuna0 = $state(40);
	let interventionTime = $state(5);
	let progress = $state(0.48);
	let speed = $state(1);
	let playing = $state(false);
	let interventionApplied = $state(false);
	let challengeChoice = $state<ChallengeChoice>(null);
	let challengeRevealed = $state(false);
	let reducedMotion = $state(false);
	let visible = $state(true);
	let compact = $state(false);
	let liveMessage = $state('Ecosystem model ready. Choose a prediction before removing sharks.');

	let trace = $derived(compact ? compactTrace : wideTrace);
	let phase = $derived(compact ? compactPhase : widePhase);
	let field = $derived(compact ? compactField : wideField);
	let traceTicks = $derived(compact ? [0, 10, 20, 30] : [0, 5, 10, 15, 20, 25, 30]);
	let parameters = $derived<LotkaVolterraParameters>({
		...ECOSYSTEM_PRESET,
		sharks0,
		tuna0
	});
	let baseline = $derived(simulateEcosystem(parameters));
	let fork = $derived(
		forkEcosystemIntervention(
			parameters,
			{ kind: 'sharks', time: interventionTime, amount: 10 },
			baseline
		)
	);
	let baselineChart = $derived(downsampleEcosystem(baseline, 900));
	let branchChart = $derived(downsampleEcosystem(fork.intervention, 900));
	let overshoot = $derived(findFirstSharkOvershoot(fork));
	let coexistence = $derived(coexistencePoint(parameters));
	let cursorIndex = $derived(
		Math.min(baseline.length - 1, Math.round(progress * (baseline.length - 1)))
	);
	let baselineCurrent = $derived(baseline[cursorIndex]);
	let branchCurrent = $derived(
		interventionApplied && cursorIndex >= fork.interventionIndex
			? fork.intervention[cursorIndex]
			: baselineCurrent
	);
	let populationDomain = $derived(domainFor([...baseline, ...fork.intervention]));
	let tunaBaselinePath = $derived(timePath(baselineChart, 'tuna'));
	let sharksBaselinePath = $derived(timePath(baselineChart, 'sharks'));
	let tunaBranchPath = $derived(timePath(branchChart, 'tuna'));
	let sharksBranchPath = $derived(timePath(branchChart, 'sharks'));
	let baselinePhasePath = $derived(phasePath(baselineChart));
	let branchPhasePath = $derived(phasePath(branchChart));
	let effectivePlaying = $derived(playing && !paused && !reducedMotion && visible);

	function domainFor(samples: readonly EcosystemSample[]): readonly [number, number] {
		const maximum = Math.max(...samples.flatMap((sample) => [sample.sharks, sample.tuna]));
		return [0, Math.ceil(maximum / 10) * 10];
	}

	function scale(
		value: number,
		domain: readonly [number, number],
		range: readonly [number, number]
	) {
		const span = domain[1] - domain[0];
		if (!Number.isFinite(value) || !Number.isFinite(span) || span === 0) return range[0];
		return range[0] + ((value - domain[0]) / span) * (range[1] - range[0]);
	}

	function timePath(samples: readonly EcosystemSample[], key: 'sharks' | 'tuna') {
		return samples
			.map((sample, index) => {
				const x = scale(sample.t, [0, parameters.duration], [trace.left, trace.right]);
				const y = scale(sample[key], populationDomain, [trace.bottom, trace.top]);
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function phasePath(samples: readonly EcosystemSample[]) {
		return samples
			.map((sample, index) => {
				const x = scale(sample.tuna, populationDomain, [phase.left, phase.right]);
				const y = scale(sample.sharks, populationDomain, [phase.bottom, phase.top]);
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function fieldX(year: number) {
		return scale(year, [1987.25, 1994.25], [field.left, field.right]);
	}

	function fieldY(value: number) {
		return scale(value, [0, 2], [field.bottom, field.top]);
	}

	function fieldPath() {
		return KLUANE_SPRING_CONTROL_SERIES.map(
			(datum, index) =>
				`${index === 0 ? 'M' : 'L'}${fieldX(datum.year).toFixed(2)},${fieldY(datum.density).toFixed(2)}`
		).join(' ');
	}

	function resetModel() {
		progress = 0;
		playing = false;
		interventionApplied = false;
		challengeChoice = null;
		challengeRevealed = false;
		liveMessage = 'Ecosystem model reset to its initial state.';
	}

	function applyIntervention() {
		interventionApplied = true;
		challengeRevealed = true;
		progress = Math.max(progress, fork.interventionIndex / (baseline.length - 1));
		playing = false;
		liveMessage = overshoot
			? `Ten sharks removed. In this run, the intervention branch later reaches ${overshoot.interventionSharks.toFixed(2)} sharks at t ${overshoot.time.toFixed(2)}, above the uninterrupted baseline.`
			: 'Ten sharks removed. No later shark overshoot was detected in this run.';
	}

	function chooseChallenge(choice: Exclude<ChallengeChoice, null>) {
		challengeChoice = choice;
		liveMessage = 'Prediction recorded. Apply the intervention to reveal the model result.';
	}

	function updateInitial(event: Event, key: 'sharks' | 'tuna') {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (key === 'sharks') sharks0 = value;
		else tuna0 = value;
		resetModel();
	}

	function updateInterventionTime(event: Event) {
		interventionTime = Number((event.currentTarget as HTMLInputElement).value);
		resetModel();
	}

	function togglePlay() {
		if (paused || reducedMotion) return;
		if (progress >= 1) progress = 0;
		playing = !playing;
		liveMessage = playing ? 'Ecosystem replay started.' : 'Ecosystem replay paused.';
	}

	function scrub(event: Event) {
		progress = Number((event.currentTarget as HTMLInputElement).value) / 1_000;
		playing = false;
		liveMessage = `Ecosystem scrubbed to t ${baselineCurrent.t.toFixed(2)}.`;
	}

	onMount(() => {
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const layoutQuery = window.matchMedia('(max-width: 45rem)');
		const syncLayout = () => (compact = layoutQuery.matches);
		const syncMotion = () => {
			reducedMotion =
				motionQuery.matches ||
				['still', 'reduce'].includes(document.documentElement.dataset.motion ?? '');
			if (reducedMotion) playing = false;
		};
		syncLayout();
		syncMotion();
		layoutQuery.addEventListener('change', syncLayout);
		motionQuery.addEventListener('change', syncMotion);

		const motionObserver = new MutationObserver(syncMotion);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const intersectionObserver = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				if (!visible) playing = false;
			},
			{ rootMargin: '140px 0px' }
		);
		intersectionObserver.observe(root);
		const onVisibilityChange = () => {
			if (document.hidden) playing = false;
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		let frame = 0;
		let previous = performance.now();
		const animate = (now: number) => {
			const delta = Math.min(80, Math.max(0, now - previous));
			previous = now;
			if (effectivePlaying) {
				progress = Math.min(1, progress + (delta * speed) / 18_000);
				if (progress >= 1) playing = false;
			}
			frame = requestAnimationFrame(animate);
		};
		frame = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(frame);
			layoutQuery.removeEventListener('change', syncLayout);
			motionQuery.removeEventListener('change', syncMotion);
			motionObserver.disconnect();
			intersectionObserver.disconnect();
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});
</script>

<section
	bind:this={root}
	class="explorer-section ecosystem-lab"
	data-testid="ecosystem-lab"
	data-playing={effectivePlaying}
	data-reduced-motion={reducedMotion}
	aria-labelledby="ecosystem-lab-title"
>
	<div class="section-heading">
		<div class="section-number" aria-hidden="true">03</div>
		<div>
			<p class="section-kicker">Ecosystem lab · model, measurement, contested causal story</p>
			<h3 id="ecosystem-lab-title">Intervene in a toy world; then face the field</h3>
			<p>Three panels use three different kinds of warrant. Their labels are part of the result.</p>
		</div>
	</div>

	<section class="epistemic-panel model-panel" aria-labelledby="shark-tuna-title">
		<div class="epistemic-heading">
			<span class="epistemic-stamp model-stamp">Model</span>
			<div>
				<h4 id="shark-tuna-title">Shark Meets Tuna</h4>
				<p><strong>Dimensionless teaching model—not a fit to shark or tuna field data.</strong></p>
			</div>
		</div>

		<div class="ecosystem-controls" data-tts-exclude>
			<label
				><span>Initial sharks <output>{sharks0.toFixed(0)}</output></span><input
					type="range"
					min="18"
					max="22"
					step="1"
					value={sharks0}
					oninput={(event) => updateInitial(event, 'sharks')}
				/></label
			>
			<label
				><span>Initial tuna <output>{tuna0.toFixed(0)}</output></span><input
					type="range"
					min="35"
					max="45"
					step="1"
					value={tuna0}
					oninput={(event) => updateInitial(event, 'tuna')}
				/></label
			>
			<label
				><span>Intervention time <output>{interventionTime.toFixed(1)}</output></span><input
					type="range"
					min="4"
					max="6"
					step="0.25"
					value={interventionTime}
					oninput={updateInterventionTime}
				/></label
			>
			<label
				><span>Replay speed</span><select bind:value={speed} aria-label="Ecosystem replay speed"
					><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}
						>2×</option
					></select
				></label
			>
		</div>

		<div class="transport" data-tts-exclude>
			<div class="transport-buttons">
				<button
					class="primary"
					type="button"
					onclick={togglePlay}
					disabled={paused || reducedMotion}>{playing ? 'Pause' : 'Play'}</button
				>
				<button type="button" onclick={resetModel}>Reset</button>
			</div>
			<label class="scrubber" for="ecosystem-scrubber"
				><span>Shared cursor · t = <strong>{baselineCurrent.t.toFixed(2)}</strong></span><input
					id="ecosystem-scrubber"
					type="range"
					min="0"
					max="1000"
					step="1"
					value={Math.round(progress * 1000)}
					aria-valuetext={`time ${baselineCurrent.t.toFixed(2)}, branch sharks ${branchCurrent.sharks.toFixed(2)}, branch tuna ${branchCurrent.tuna.toFixed(2)}`}
					oninput={scrub}
				/></label
			>
			<div class="live-readout">
				<span>sharks <strong>{branchCurrent.sharks.toFixed(2)}</strong></span><span
					>tuna <strong>{branchCurrent.tuna.toFixed(2)}</strong></span
				>
			</div>
		</div>

		<div class="intervention-challenge">
			<div>
				<p class="mini-kicker">Prediction checkpoint</p>
				<h5>After removing ten sharks, what happens?</h5>
			</div>
			<div class="challenge-options" role="group" aria-label="Choose a prediction" data-tts-exclude>
				<button
					type="button"
					class:active={challengeChoice === 'stay-lower'}
					aria-pressed={challengeChoice === 'stay-lower'}
					onclick={() => chooseChallenge('stay-lower')}>Sharks stay lower</button
				>
				<button
					type="button"
					class:active={challengeChoice === 'old-path'}
					aria-pressed={challengeChoice === 'old-path'}
					onclick={() => chooseChallenge('old-path')}>Exactly the old path</button
				>
				<button
					type="button"
					class:active={challengeChoice === 'overshoot'}
					aria-pressed={challengeChoice === 'overshoot'}
					onclick={() => chooseChallenge('overshoot')}>Sharks may later overshoot</button
				>
			</div>
			<button
				type="button"
				class="intervention-button"
				onclick={applyIntervention}
				disabled={!challengeChoice}>Remove 10 sharks</button
			>
			{#if challengeRevealed && overshoot}
				<p class="challenge-result" role="status">
					<strong
						>{challengeChoice === 'overshoot'
							? 'Prediction matched this run.'
							: 'This run takes the counterintuitive branch.'}</strong
					>
					At t = {overshoot.time.toFixed(2)}, sharks reach {overshoot.interventionSharks.toFixed(2)} on
					the intervention path versus {overshoot.baselineSharks.toFixed(2)} on the uninterrupted baseline.
					Sharks <em>may</em> later overshoot in this toy model; this is not a universal predator-removal
					law.
				</p>
			{/if}
		</div>

		<div class="ecosystem-chart-grid">
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable mobile chart scroller) -->
			<section class="chart-panel" tabindex="0" aria-labelledby="ecosystem-trace-title">
				<div class="panel-heading">
					<div>
						<p>Synchronized trace</p>
						<h5 id="ecosystem-trace-title">Populations through dimensionless time</h5>
					</div>
				</div>
				<svg
					class:compact-chart={compact}
					viewBox={`0 0 ${trace.width} ${trace.height}`}
					role="img"
					aria-labelledby="ecosystem-time-svg-title ecosystem-time-svg-desc"
				>
					<title id="ecosystem-time-svg-title">Lotka–Volterra shark and tuna time series</title>
					<desc id="ecosystem-time-svg-desc"
						>The dashed paths show the uninterrupted baseline. After the intervention time, solid
						paths show the branch after ten sharks are removed.</desc
					>
					{#each [0, 0.5, 1] as fraction (fraction)}{@const y =
							trace.bottom - fraction * (trace.bottom - trace.top)}<line
							class="chart-grid"
							x1={trace.left}
							x2={trace.right}
							y1={y}
							y2={y}
						/><text class="axis-text" x={trace.left - 8} y={y + 4} text-anchor="end"
							>{(
								populationDomain[0] +
								fraction * (populationDomain[1] - populationDomain[0])
							).toFixed(0)}</text
						>{/each}
					{#each traceTicks as tick (tick)}{@const x = scale(
							tick,
							[0, parameters.duration],
							[trace.left, trace.right]
						)}<line class="chart-tick" x1={x} x2={x} y1={trace.bottom} y2={trace.bottom + 5} /><text
							class="axis-text"
							{x}
							y={trace.bottom + 18}
							text-anchor="middle">{tick}</text
						>{/each}
					<line
						class="chart-axis"
						x1={trace.left}
						x2={trace.right}
						y1={trace.bottom}
						y2={trace.bottom}
					/>
					<path class="eco-trace baseline tuna" d={tunaBaselinePath}
						><title>Uninterrupted tuna baseline; dimensionless model output.</title></path
					>
					<path class="eco-trace baseline sharks" d={sharksBaselinePath}
						><title>Uninterrupted shark baseline; dimensionless model output.</title></path
					>
					{#if interventionApplied}<path class="eco-trace branch tuna" d={tunaBranchPath}
							><title>Tuna intervention branch; dimensionless model output.</title></path
						><path class="eco-trace branch sharks" d={sharksBranchPath}
							><title>Shark intervention branch; dimensionless model output.</title></path
						>{/if}
					<line
						class="intervention-marker"
						x1={scale(interventionTime, [0, parameters.duration], [trace.left, trace.right])}
						x2={scale(interventionTime, [0, parameters.duration], [trace.left, trace.right])}
						y1={trace.top}
						y2={trace.bottom}
					/>
					<line
						class="cursor-line"
						x1={scale(baselineCurrent.t, [0, parameters.duration], [trace.left, trace.right])}
						x2={scale(baselineCurrent.t, [0, parameters.duration], [trace.left, trace.right])}
						y1={trace.top}
						y2={trace.bottom}
					/>
					<circle
						class="current-dot tuna-dot"
						cx={scale(branchCurrent.t, [0, parameters.duration], [trace.left, trace.right])}
						cy={scale(branchCurrent.tuna, populationDomain, [trace.bottom, trace.top])}
						r="5"
						><title
							>Tuna {branchCurrent.tuna.toFixed(2)} at dimensionless time {branchCurrent.t.toFixed(
								2
							)}; Lotka–Volterra model output.</title
						></circle
					>
					<circle
						class="current-dot shark-dot"
						cx={scale(branchCurrent.t, [0, parameters.duration], [trace.left, trace.right])}
						cy={scale(branchCurrent.sharks, populationDomain, [trace.bottom, trace.top])}
						r="5"
						><title
							>Sharks {branchCurrent.sharks.toFixed(2)} at dimensionless time {branchCurrent.t.toFixed(
								2
							)}; Lotka–Volterra model output.</title
						></circle
					>
					<text
						class="axis-title"
						x={(trace.left + trace.right) / 2}
						y={trace.height - 5}
						text-anchor="middle">dimensionless time</text
					>
				</svg>
				<div class="chart-legend">
					<span><i class="tuna-swatch"></i>tuna</span><span><i class="shark-swatch"></i>sharks</span
					><span><i class="baseline-swatch"></i>uninterrupted baseline</span>
				</div>
			</section>

			<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable mobile chart scroller) -->
			<section class="chart-panel" tabindex="0" aria-labelledby="phase-title">
				<div class="panel-heading">
					<div>
						<p>State-space view</p>
						<h5 id="phase-title">Phase portrait</h5>
					</div>
				</div>
				<svg
					class:compact-chart={compact}
					viewBox={`0 0 ${phase.width} ${phase.height}`}
					role="img"
					aria-labelledby="phase-svg-title phase-svg-desc"
				>
					<title id="phase-svg-title">Lotka–Volterra phase portrait</title><desc id="phase-svg-desc"
						>Tuna are on the horizontal axis and sharks on the vertical axis. The ideal model
						follows closed neutral orbits around coexistence.</desc
					>
					<line
						class="chart-axis"
						x1={phase.left}
						x2={phase.right}
						y1={phase.bottom}
						y2={phase.bottom}
					/><line
						class="chart-axis"
						x1={phase.left}
						x2={phase.left}
						y1={phase.top}
						y2={phase.bottom}
					/>
					<path class="eco-trace baseline phase-trace" d={baselinePhasePath}
						><title>Uninterrupted dimensionless Lotka–Volterra model orbit.</title></path
					>{#if interventionApplied}<path class="eco-trace branch phase-trace" d={branchPhasePath}
							><title>Dimensionless Lotka–Volterra model orbit after removing ten sharks.</title
							></path
						>{/if}
					<circle
						class="coexistence-dot"
						cx={scale(coexistence.tuna, populationDomain, [phase.left, phase.right])}
						cy={scale(coexistence.sharks, populationDomain, [phase.bottom, phase.top])}
						r="5"
						><title
							>Coexistence point: tuna {coexistence.tuna.toFixed(2)}, sharks {coexistence.sharks.toFixed(
								2
							)}; dimensionless Lotka–Volterra model equilibrium.</title
						></circle
					>
					<circle
						class="current-dot"
						cx={scale(branchCurrent.tuna, populationDomain, [phase.left, phase.right])}
						cy={scale(branchCurrent.sharks, populationDomain, [phase.bottom, phase.top])}
						r="6"
						><title
							>Current state: tuna {branchCurrent.tuna.toFixed(2)}, sharks {branchCurrent.sharks.toFixed(
								2
							)}; dimensionless Lotka–Volterra model output.</title
						></circle
					>
					<text
						class="axis-title"
						x={(phase.left + phase.right) / 2}
						y={phase.height - 8}
						text-anchor="middle">tuna T · dimensionless</text
					><text
						class="axis-title"
						x="14"
						y={(phase.top + phase.bottom) / 2}
						text-anchor="middle"
						transform={`rotate(-90 14 ${(phase.top + phase.bottom) / 2})`}
						>sharks S · dimensionless</text
					>
				</svg>
				<p class="panel-note">
					Coexistence: S* = <span class="math-variable">β</span>/q = {coexistence.sharks.toFixed(
						0
					)}; T* = <span class="math-variable">δ</span>/p = {coexistence.tuna.toFixed(2)}. The
					closed curves are neutrally stable—not an attracting biological limit cycle.
				</p>
			</section>
		</div>

		<div class="feedback-signs">
			<span><b>Tuna to sharks</b> positive effect</span><span
				><b>Sharks to tuna</b> negative effect</span
			><span><b>Phase lag</b> emerges from coupled changes; no explicit delay</span>
		</div>

		<details class="source-drawer">
			<summary>Model equations, assumptions, exact values and teaching sources</summary>
			<div class="drawer-grid">
				<div>
					<h5>Equations</h5>
					<div class="display-equation">
						<span>dT/dt = βT − qST</span><span>dS/dt = −δS + pST</span>
					</div>
					<p>
						RK4 with dt = {parameters.dt}; <span class="math-variable">β</span> = {parameters.beta},
						q = {parameters.q}, <span class="math-variable">δ</span> = {parameters.delta}, p = {parameters.p}.
						Deterministic and dimensionless.
					</p>
				</div>
				<div>
					<h5>Assumptions</h5>
					<ul class="assumption-list">
						<li>Homogeneous mixing</li>
						<li>Exponential tuna growth without sharks</li>
						<li>Exponential shark decline without tuna</li>
						<li>Encounters proportional to ST</li>
						<li>Fixed conversion efficiency</li>
						<li>No carrying capacity</li>
						<li>No age or spatial structure</li>
						<li>No seasons</li>
						<li>No alternative prey</li>
						<li>No fishing</li>
						<li>No stochasticity</li>
					</ul>
				</div>
			</div>
			<ul>
				<li>
					<a href="https://doi.org/10.1007/s11538-022-00999-4" rel="external"
						>Teaching Dynamics to Biology Undergraduates</a
					>
				</li>
				<li>
					<a
						href="https://modelinginbiology.github.io/Videos/Models-Change-Example-2-Shark-Meets-Tuna"
						rel="external">Shark Meets Tuna lesson</a
					>
				</li>
				<li>
					<a
						href="https://modelinginbiology.github.io/Videos/Insulin-Glucose-Oscillations-Time-Delays"
						rel="external">Insulin–glucose delay lesson</a
					>
				</li>
			</ul>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable overflow region is keyboard-scrollable) -->
			<div class="table-scroll" tabindex="0" role="region" aria-label="Exact model samples">
				<table class="exact-values-table">
					<caption>Selected exact model values; dimensionless.</caption><thead
						><tr
							><th scope="col">Time</th><th scope="col">Baseline sharks</th><th scope="col"
								>Baseline tuna</th
							><th scope="col">Intervention sharks</th><th scope="col">Intervention tuna</th></tr
						></thead
					><tbody
						>{#each [0, 500, 1000, 1500, 2000, 2500, 3000] as index (index)}<tr
								><th scope="row">{baseline[index].t.toFixed(2)}</th><td
									>{baseline[index].sharks.toFixed(4)}</td
								><td>{baseline[index].tuna.toFixed(4)}</td><td
									>{fork.intervention[index].sharks.toFixed(4)}</td
								><td>{fork.intervention[index].tuna.toFixed(4)}</td></tr
							>{/each}</tbody
					>
				</table>
			</div>
		</details>
	</section>

	<section class="epistemic-panel measured-panel" aria-labelledby="kluane-title">
		<div class="epistemic-heading">
			<span class="epistemic-stamp measured-stamp">Measured field data</span>
			<div>
				<h4 id="kluane-title">Kluane control grids and reported treatment effects</h4>
				<p>
					Snowshoe hares, food availability and a predator guild in Yukon—not a simple lynx–hare
					pair.
				</p>
			</div>
		</div>
		<div class="field-layout">
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable mobile chart scroller) -->
			<div class="chart-panel" tabindex="0" role="region" aria-label="Kluane hare-density chart">
				<div class="panel-heading">
					<div>
						<p>Local CC0 subset</p>
						<h5>Spring control-grid composite, Efford ML</h5>
					</div>
				</div>
				<svg
					class:compact-chart={compact}
					viewBox={`0 0 ${field.width} ${field.height}`}
					role="img"
					aria-labelledby="kluane-svg-title kluane-svg-desc"
				>
					<title id="kluane-svg-title">Kluane spring control-grid hare-density estimates</title
					><desc id="kluane-svg-desc"
						>Eight spring estimates from 1987 to 1994 with lower and upper 95 percent confidence
						limits supplied by the Dryad workbook.</desc
					>
					{#each [0, 0.5, 1, 1.5, 2] as tick (tick)}{@const y = fieldY(tick)}<line
							class="chart-grid"
							x1={field.left}
							x2={field.right}
							y1={y}
							y2={y}
						/><text class="axis-text" x={field.left - 9} y={y + 4} text-anchor="end"
							>{tick.toFixed(1)}</text
						>{/each}
					{#each KLUANE_SPRING_CONTROL_SERIES as datum (datum.occasion)}<line
							class="ci-line"
							x1={fieldX(datum.year)}
							x2={fieldX(datum.year)}
							y1={fieldY(datum.lower95)}
							y2={fieldY(datum.upper95)}
						/><line
							class="ci-cap"
							x1={fieldX(datum.year) - 5}
							x2={fieldX(datum.year) + 5}
							y1={fieldY(datum.lower95)}
							y2={fieldY(datum.lower95)}
						/><line
							class="ci-cap"
							x1={fieldX(datum.year) - 5}
							x2={fieldX(datum.year) + 5}
							y1={fieldY(datum.upper95)}
							y2={fieldY(datum.upper95)}
						/>{/each}
					<path class="measured-field-path" d={fieldPath()}
						><title
							>Measured hare-density summaries in hares per hectare from Dryad workbook 3, Hares
							sheet, All Controls composite; connected only as a visual guide.</title
						></path
					>
					{#each KLUANE_SPRING_CONTROL_SERIES as datum, index (datum.occasion)}<circle
							class="measured-field-dot"
							cx={fieldX(datum.year)}
							cy={fieldY(datum.density)}
							r="5"
							><title
								>{datum.occasion}: {datum.density.toFixed(3)} hares per hectare; supplied 95% confidence
								limits {datum.lower95.toFixed(3)} to {datum.upper95.toFixed(3)}. Source: Dryad
								workbook 3, Hares sheet, All Controls composite, Efford ML.</title
							></circle
						>{#if !compact || index === 0 || index === 4 || index === KLUANE_SPRING_CONTROL_SERIES.length - 1}<text
								class="axis-text"
								x={fieldX(datum.year)}
								y={field.bottom + 18}
								text-anchor="middle">{Math.floor(datum.year)}</text
							>{/if}{/each}
					<line
						class="chart-axis"
						x1={field.left}
						x2={field.right}
						y1={field.bottom}
						y2={field.bottom}
					/><text
						class="axis-title"
						x={(field.left + field.right) / 2}
						y={field.height - 5}
						text-anchor="middle">spring trapping occasion</text
					><text
						class="axis-title"
						x="15"
						y={(field.top + field.bottom) / 2}
						text-anchor="middle"
						transform={`rotate(-90 15 ${(field.top + field.bottom) / 2})`}>hares per hectare</text
					>
				</svg>
				<p class="panel-note">
					Measured summaries with supplied 95% confidence limits. Connecting segments are visual
					guides, not continuous monitoring. This later archive composite is not a transcription of
					the 1995 paper figure, which used spring grid-level CAPTURE jackknife estimates.
				</p>
			</div>
			<div class="treatment-summary-grid">
				{#each KLUANE_TREATMENT_SUMMARIES as treatment (treatment.id)}<article>
						<span>Reported aggregate ratio</span>
						<h5>{treatment.label}</h5>
						<strong>{treatment.ratioLabel}</strong>
						<p>{treatment.note}</p>
						<small>{treatment.uncertainty}</small>
					</article>{/each}
			</div>
		</div>
		<div class="field-findings">
			<p>
				<strong>What the paper reported:</strong> exclosure roughly doubled density, food produced roughly
				a threefold effect, and their combination averaged about elevenfold and reached about thirty-sixfold
				late in the decline. Predator abundance lagged hares by roughly one to two years. Food plus exclosure
				delayed the decline; it did not eliminate it.
			</p>
		</div>
		<details class="source-drawer">
			<summary>Field-data table, transformation, sources and limitations</summary>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable overflow region is keyboard-scrollable) -->
			<div class="table-scroll" tabindex="0" role="region" aria-label="Exact Kluane control data">
				<table class="exact-values-table">
					<caption>Dryad workbook 3, Hares sheet, spring rows selected from rows 26–41.</caption
					><thead
						><tr
							><th scope="col">Occasion</th><th scope="col">Decimal year</th><th scope="col"
								>Hares/ha</th
							><th scope="col">Lower 95% CL</th><th scope="col">Upper 95% CL</th></tr
						></thead
					><tbody
						>{#each KLUANE_SPRING_CONTROL_SERIES as datum (datum.occasion)}<tr
								><th scope="row">{datum.occasion}</th><td>{datum.year}</td><td>{datum.density}</td
								><td>{datum.lower95}</td><td>{datum.upper95}</td></tr
							>{/each}</tbody
					>
				</table>
			</div>
			<p>
				<strong>Transformation:</strong>
				{KLUANE_PROVENANCE.transformation} The local file preserves all {KLUANE_CONTROL_SERIES.length}
				spring and autumn rows; this view selects the {KLUANE_SPRING_CONTROL_SERIES.length} spring rows.
				Bounds were copied, not recalculated.
			</p>
			<div class="drawer-grid">
				<div>
					<h5>Sources</h5>
					<ul>
						<li>
							<a href={KLUANE_PROVENANCE.datasetUrl} rel="external"
								>Dryad dataset 10.5061/dryad.684s1</a
							>
						</li>
						<li><a href={KLUANE_PAPER_URL} rel="external">Krebs et al. 1995 experiment</a></li>
						<li>
							<a href={KLUANE_RELATED_SYNTHESIS_URL} rel="external"
								>Later Kluane synthesis associated with the archive</a
							>
						</li>
						<li>
							<a href={KLUANE_HIGHER_DIMENSIONAL_URL} rel="external"
								>Higher-dimensional interpretation</a
							>
						</li>
					</ul>
				</div>
				<div>
					<h5>Limits</h5>
					<ul>
						{#each KLUANE_LIMITATIONS as limitation (limitation)}<li>{limitation}</li>{/each}
					</ul>
				</div>
			</div>
		</details>
	</section>

	<section class="epistemic-panel disputed-panel" aria-labelledby="cascade-title">
		<div class="epistemic-heading">
			<span class="epistemic-stamp disputed-stamp">Disputed inference</span>
			<div>
				<h4 id="cascade-title">Sharks, rays and scallops: audit the arrows</h4>
				<p>A tidy causal diagram can outrun its evidence.</p>
			</div>
		</div>
		<div class="audit-grid">
			<article>
				<p>Proposed in 2007</p>
				<h5>Large sharks ↓ · cownose rays ↑ · scallops ↓</h5>
				<p>
					<a href="https://doi.org/10.1126/science.1138657" rel="external">Myers et al.</a> proposed that
					declines in large coastal sharks released rays and contributed to a bay-scallop collapse.
				</p>
			</article>
			<article>
				<p>Challenged in 2016</p>
				<h5>Timing, diet, space and demography questioned</h5>
				<p>
					<a href="https://doi.org/10.1038/srep20970" rel="external">Grubbs et al.</a> argued that the
					correspondence and mechanisms were insufficient or equivocal. That critique concerns this claimed
					cascade—not whether sharks can ever participate in trophic cascades.
				</p>
			</article>
		</div>
		<blockquote>
			A plausible causal chain—even a beautiful one—is not the same thing as decisive field
			evidence.
		</blockquote>
	</section>
	<p class="sr-only" aria-live="polite">{liveMessage}</p>
</section>
