<script lang="ts">
	import { onMount } from 'svelte';
	import {
		FEEDBACK_HOPF_THRESHOLD,
		FEEDBACK_PRESETS,
		downsampleFeedback,
		feedbackEquilibrium,
		simulateFeedback,
		type FeedbackParameters,
		type FeedbackPresetId,
		type FeedbackSample
	} from '$lib/visualizations/homeodynamics';

	let { paused = false }: { paused?: boolean } = $props();

	type PresetSelection = FeedbackPresetId | 'custom';
	const wideTraceChart = { width: 720, height: 252, left: 58, right: 700, top: 22, bottom: 210 };
	const compactTraceChart = { width: 268, height: 252, left: 42, right: 256, top: 22, bottom: 210 };
	const wideEmbeddingChart = {
		width: 360,
		height: 300,
		left: 54,
		right: 338,
		top: 24,
		bottom: 252
	};
	const compactEmbeddingChart = {
		width: 268,
		height: 276,
		left: 45,
		right: 256,
		top: 24,
		bottom: 228
	};

	let root: HTMLElement;
	let selectedPreset = $state<PresetSelection>('damped');
	let hill = $state(4);
	let delay = $state(1.1);
	let perturbation = $state(0.6);
	let progress = $state(0.35);
	let playing = $state(false);
	let reducedMotion = $state(false);
	let visible = $state(true);
	let compact = $state(false);
	let liveMessage = $state('Damped ringing preset selected.');

	let traceChart = $derived(compact ? compactTraceChart : wideTraceChart);
	let embeddingChart = $derived(compact ? compactEmbeddingChart : wideEmbeddingChart);
	let traceTicks = $derived(compact ? [0, 15, 30, 45] : [0, 10, 20, 30, 40]);
	let parameters = $derived<FeedbackParameters>({
		...FEEDBACK_PRESETS.damped.parameters,
		n: hill,
		delay,
		perturbation,
		duration: 45
	});
	let samples = $derived(simulateFeedback(parameters));
	let chartSamples = $derived(downsampleFeedback(samples, 900));
	let equilibrium = $derived(feedbackEquilibrium(parameters));
	let cursorIndex = $derived(
		Math.min(samples.length - 1, Math.round(progress * (samples.length - 1)))
	);
	let current = $derived(samples[cursorIndex]);
	let yDomain = $derived(domainFor(samples, equilibrium));
	let tracePath = $derived(pathForTrace(chartSamples, 'x'));
	let delayedPath = $derived(pathForTrace(chartSamples, 'delayed'));
	let embeddingPath = $derived(pathForEmbedding(chartSamples));
	let effectivePlaying = $derived(playing && !paused && !reducedMotion && visible);

	function domainFor(
		candidate: readonly FeedbackSample[],
		operatingState: number
	): readonly [number, number] {
		const values = candidate.flatMap((sample) => [sample.x, sample.delayed, operatingState]);
		const minimum = Math.min(...values);
		const maximum = Math.max(...values);
		const padding = Math.max(0.08, (maximum - minimum) * 0.1);
		return [Math.max(0, minimum - padding), maximum + padding];
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

	function pathForTrace(candidate: readonly FeedbackSample[], key: 'x' | 'delayed') {
		return candidate
			.map((sample, index) => {
				const x = scale(sample.t, [0, parameters.duration], [traceChart.left, traceChart.right]);
				const y = scale(sample[key], yDomain, [traceChart.bottom, traceChart.top]);
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function pathForEmbedding(candidate: readonly FeedbackSample[]) {
		return candidate
			.filter((sample) => sample.t >= parameters.perturbationTime)
			.map((sample, index) => {
				const x = scale(sample.delayed, yDomain, [embeddingChart.left, embeddingChart.right]);
				const y = scale(sample.x, yDomain, [embeddingChart.bottom, embeddingChart.top]);
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function choosePreset(id: FeedbackPresetId) {
		const preset = FEEDBACK_PRESETS[id];
		selectedPreset = id;
		hill = preset.parameters.n;
		delay = preset.parameters.delay;
		perturbation = preset.parameters.perturbation;
		progress = 0.35;
		playing = false;
		liveMessage = `${preset.label} preset selected. ${preset.description}`;
	}

	function markCustom() {
		selectedPreset = 'custom';
		playing = false;
		liveMessage = 'Custom feedback parameters applied.';
	}

	function updateHill(event: Event) {
		hill = Number((event.currentTarget as HTMLInputElement).value);
		markCustom();
	}

	function updateDelay(event: Event) {
		delay = Number((event.currentTarget as HTMLInputElement).value);
		markCustom();
	}

	function updatePerturbation(event: Event) {
		perturbation = Number((event.currentTarget as HTMLInputElement).value);
		markCustom();
	}

	function togglePlay() {
		if (reducedMotion || paused) return;
		if (progress >= 1) progress = 0;
		playing = !playing;
		liveMessage = playing ? 'Feedback replay started.' : 'Feedback replay paused.';
	}

	function reset() {
		progress = 0;
		playing = false;
		liveMessage = 'Feedback replay reset to the unperturbed operating state.';
	}

	function scrub(event: Event) {
		progress = Number((event.currentTarget as HTMLInputElement).value) / 1_000;
		playing = false;
		liveMessage = `Feedback trace scrubbed to t = ${current.t.toFixed(2)}.`;
	}

	function presetVerdict(id: FeedbackPresetId) {
		if (id === 'monotonic') return 'Verified: no equilibrium crossing; direct return.';
		if (id === 'damped') return 'Verified: successive peak-to-peak ranges shrink.';
		return 'Verified: bounded late-cycle range persists after transients.';
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
				progress = Math.min(1, progress + delta / 14_000);
				if (progress >= 1) {
					playing = false;
					liveMessage = 'Feedback replay complete.';
				}
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
	class="explorer-section feedback-lab"
	data-testid="feedback-lab"
	data-playing={effectivePlaying}
	data-reduced-motion={reducedMotion}
	aria-labelledby="feedback-lab-title"
>
	<div class="section-heading">
		<div class="section-number" aria-hidden="true">02</div>
		<div>
			<p class="section-kicker">Feedback lab · generic dimensionless teaching model</p>
			<h3 id="feedback-lab-title">How a brake becomes a metronome</h3>
			<p>
				Hold loop steepness fixed, then add delay. The same negative sign can restore, ring, or
				destabilize a fixed point depending on timing and sensitivity.
			</p>
		</div>
	</div>

	<div class="evidence-banner model-banner" role="note">
		<strong>MODEL — not a patient model and not a claim about every physiological rhythm.</strong>
		<span>The fixed-step solver changes only the teaching equation shown below.</span>
	</div>

	<div class="preset-strip" aria-label="Verified feedback presets" data-tts-exclude>
		{#each Object.values(FEEDBACK_PRESETS) as preset (preset.id)}
			<button
				type="button"
				class:active={selectedPreset === preset.id}
				aria-pressed={selectedPreset === preset.id}
				onclick={() => choosePreset(preset.id)}
			>
				<span>{preset.label}</span>
				<small><span class="math-variable">τ</span> = {preset.parameters.delay.toFixed(2)}</small>
			</button>
		{/each}
	</div>

	<div class="lab-controls" data-tts-exclude>
		<label>
			<span>Feedback steepness, n <output>{hill.toFixed(1)}</output></span>
			<input type="range" min="1" max="6" step="0.5" value={hill} oninput={updateHill} />
		</label>
		<label>
			<span>Delay, <span class="math-variable">τ</span> <output>{delay.toFixed(2)}</output></span>
			<input type="range" min="0" max="2" step="0.05" value={delay} oninput={updateDelay} />
		</label>
		<label>
			<span>Perturbation <output>+{perturbation.toFixed(2)}</output></span>
			<input
				type="range"
				min="0.1"
				max="0.9"
				step="0.05"
				value={perturbation}
				oninput={updatePerturbation}
			/>
		</label>
	</div>

	<div class="transport" data-tts-exclude>
		<div class="transport-buttons">
			<button type="button" class="primary" onclick={togglePlay} disabled={reducedMotion || paused}>
				{playing ? 'Pause' : 'Play'}
			</button>
			<button type="button" onclick={reset}>Reset</button>
		</div>
		<label class="scrubber" for="feedback-scrubber">
			<span>Trace cursor · t = <strong>{current.t.toFixed(2)}</strong></span>
			<input
				id="feedback-scrubber"
				type="range"
				min="0"
				max="1000"
				step="1"
				value={Math.round(progress * 1_000)}
				aria-valuetext={`t ${current.t.toFixed(2)}, current ${current.x.toFixed(3)}, delayed ${current.delayed.toFixed(3)}`}
				oninput={scrub}
			/>
		</label>
		<div class="live-readout" aria-label="Current model values">
			<span>current x(t) <strong>{current.x.toFixed(3)}</strong></span>
			<span
				>delayed x(t−<span class="math-variable">τ</span>)
				<strong>{current.delayed.toFixed(3)}</strong></span
			>
		</div>
	</div>

	{#if reducedMotion || paused}
		<p class="motion-note">
			{reducedMotion ? 'Reduced motion is active.' : 'All motion is paused.'} The scrubber exposes every
			displayed model time point without autoplay.
		</p>
	{/if}

	<div class="feedback-panels">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable mobile chart scroller) -->
		<section class="chart-panel" tabindex="0" aria-labelledby="feedback-trace-title">
			<div class="panel-heading">
				<div>
					<p>Time trace</p>
					<h4 id="feedback-trace-title">Return after a +{perturbation.toFixed(2)} perturbation</h4>
				</div>
				<span class={`regime-stamp ${selectedPreset}`}
					>{selectedPreset === 'custom' ? 'CUSTOM RUN' : presetVerdict(selectedPreset)}</span
				>
			</div>
			<svg
				class:compact-chart={compact}
				viewBox={`0 0 ${traceChart.width} ${traceChart.height}`}
				role="img"
				aria-labelledby="feedback-trace-svg-title feedback-trace-svg-desc"
			>
				<title id="feedback-trace-svg-title">Delayed negative-feedback time trace</title>
				<desc id="feedback-trace-svg-desc"
					>The solid current state and dashed delayed state are shown against the unperturbed
					operating value, with the perturbation marked at time {parameters.perturbationTime}.</desc
				>
				{#each [0, 0.5, 1] as fraction (fraction)}
					{@const y = traceChart.bottom - fraction * (traceChart.bottom - traceChart.top)}
					<line class="chart-grid" x1={traceChart.left} x2={traceChart.right} y1={y} y2={y} />
					<text class="axis-text" x={traceChart.left - 8} y={y + 4} text-anchor="end"
						>{(yDomain[0] + fraction * (yDomain[1] - yDomain[0])).toFixed(2)}</text
					>
				{/each}
				{#each traceTicks as tick (tick)}
					{@const x = scale(tick, [0, parameters.duration], [traceChart.left, traceChart.right])}
					<line
						class="chart-tick"
						x1={x}
						x2={x}
						y1={traceChart.bottom}
						y2={traceChart.bottom + 5}
					/>
					<text class="axis-text" {x} y={traceChart.bottom + 19} text-anchor="middle">{tick}</text>
				{/each}
				<line
					class="chart-axis"
					x1={traceChart.left}
					x2={traceChart.right}
					y1={traceChart.bottom}
					y2={traceChart.bottom}
				/>
				<line
					class="operating-line"
					x1={traceChart.left}
					x2={traceChart.right}
					y1={scale(equilibrium, yDomain, [traceChart.bottom, traceChart.top])}
					y2={scale(equilibrium, yDomain, [traceChart.bottom, traceChart.top])}
				/>
				<text
					class="operating-label"
					x={traceChart.right - 5}
					y={scale(equilibrium, yDomain, [traceChart.bottom, traceChart.top]) - 7}
					text-anchor="end">operating state x* = {equilibrium.toFixed(3)}</text
				>
				<line
					class="perturbation-line"
					x1={scale(
						parameters.perturbationTime,
						[0, parameters.duration],
						[traceChart.left, traceChart.right]
					)}
					x2={scale(
						parameters.perturbationTime,
						[0, parameters.duration],
						[traceChart.left, traceChart.right]
					)}
					y1={traceChart.top}
					y2={traceChart.bottom}
				/>
				<text
					class="perturbation-label"
					x={scale(
						parameters.perturbationTime,
						[0, parameters.duration],
						[traceChart.left, traceChart.right]
					) + 5}
					y={traceChart.top + 12}>perturbation</text
				>
				<path class="model-trace delayed-trace" d={delayedPath}
					><title
						>Delayed value x(t−τ), dimensionless, model-derived from the generic feedback equation.</title
					></path
				>
				<path class="model-trace current-trace" d={tracePath}
					><title
						>Current value x(t), dimensionless, model-derived from the generic feedback equation.</title
					></path
				>
				<line
					class="cursor-line"
					x1={scale(current.t, [0, parameters.duration], [traceChart.left, traceChart.right])}
					x2={scale(current.t, [0, parameters.duration], [traceChart.left, traceChart.right])}
					y1={traceChart.top}
					y2={traceChart.bottom}
				/>
				<circle
					class="current-dot"
					cx={scale(current.t, [0, parameters.duration], [traceChart.left, traceChart.right])}
					cy={scale(current.x, yDomain, [traceChart.bottom, traceChart.top])}
					r="5"
					><title
						>Current value {current.x.toFixed(3)} at dimensionless time {current.t.toFixed(2)};
						model output from the generic feedback equation.</title
					></circle
				>
				<text
					class="axis-title"
					x={(traceChart.left + traceChart.right) / 2}
					y={traceChart.height - 3}
					text-anchor="middle">dimensionless time</text
				>
			</svg>
			<div class="chart-legend">
				<span><i class="current-swatch"></i>x(t)</span><span
					><i class="delayed-swatch"></i>x(t−<span class="math-variable">τ</span>)</span
				><span><i class="operating-swatch"></i>unperturbed operating state</span>
			</div>
		</section>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex (focusable mobile chart scroller) -->
		<section class="chart-panel embedding-panel" tabindex="0" aria-labelledby="embedding-title">
			<div class="panel-heading">
				<div>
					<p>Memory view</p>
					<h4 id="embedding-title">Delay embedding</h4>
				</div>
			</div>
			<svg
				class:compact-chart={compact}
				viewBox={`0 0 ${embeddingChart.width} ${embeddingChart.height}`}
				role="img"
				aria-labelledby="embedding-svg-title embedding-svg-desc"
			>
				<title id="embedding-svg-title">x(t) versus x(t minus tau) delay embedding</title>
				<desc id="embedding-svg-desc"
					>This is a delay embedding of one scalar history, not an ordinary phase portrait of two
					independent state variables.</desc
				>
				<line
					class="chart-axis"
					x1={embeddingChart.left}
					x2={embeddingChart.right}
					y1={embeddingChart.bottom}
					y2={embeddingChart.bottom}
				/>
				<line
					class="chart-axis"
					x1={embeddingChart.left}
					x2={embeddingChart.left}
					y1={embeddingChart.top}
					y2={embeddingChart.bottom}
				/>
				<line
					class="embedding-diagonal"
					x1={embeddingChart.left}
					x2={embeddingChart.right}
					y1={embeddingChart.bottom}
					y2={embeddingChart.top}
				/>
				<path class="embedding-trace" d={embeddingPath}
					><title>Delay embedding generated by the dimensionless feedback model.</title></path
				>
				<circle
					class="operating-dot"
					cx={scale(equilibrium, yDomain, [embeddingChart.left, embeddingChart.right])}
					cy={scale(equilibrium, yDomain, [embeddingChart.bottom, embeddingChart.top])}
					r="5"
					><title
						>Unperturbed operating state ({equilibrium.toFixed(3)}, {equilibrium.toFixed(3)}),
						dimensionless model output.</title
					></circle
				>
				<circle
					class="current-dot"
					cx={scale(current.delayed, yDomain, [embeddingChart.left, embeddingChart.right])}
					cy={scale(current.x, yDomain, [embeddingChart.bottom, embeddingChart.top])}
					r="5"
					><title
						>Current embedded point: delayed {current.delayed.toFixed(3)}, current {current.x.toFixed(
							3
						)}; dimensionless model output.</title
					></circle
				>
				<text
					class="axis-title"
					x={(embeddingChart.left + embeddingChart.right) / 2}
					y={embeddingChart.height - 8}
					text-anchor="middle">delayed value x(t−τ)</text
				>
				<text
					class="axis-title"
					x="13"
					y={(embeddingChart.top + embeddingChart.bottom) / 2}
					text-anchor="middle"
					transform={`rotate(-90 13 ${(embeddingChart.top + embeddingChart.bottom) / 2})`}
					>current value x(t)</text
				>
			</svg>
			<p class="panel-note">
				<strong>Delay embedding, not a two-variable phase portrait.</strong> When
				<span class="math-variable">τ</span> = 0, current and delayed values coincide on the diagonal.
			</p>
		</section>
	</div>

	<div class="feedback-explanation-grid">
		<section class="equation-card" aria-labelledby="feedback-equation-title">
			<p>Teaching equation</p>
			<h4 id="feedback-equation-title">Production sees the past; loss acts now</h4>
			<div
				class="display-equation"
				aria-label="dx by dt equals a divided by one plus x of t minus tau divided by K to the n, minus b x"
			>
				<span>dx/dt</span> = <span>a / [1 + (x(t−τ)/K)<sup>n</sup>]</span> − <span>bx</span>
			</div>
			<dl>
				<div>
					<dt>Production</dt>
					<dd>falls as the delayed value rises</dd>
				</div>
				<div>
					<dt>Removal</dt>
					<dd>acts on the current value</dd>
				</div>
				<div>
					<dt>Memory</dt>
					<dd><span class="math-variable">τ</span> shifts what the brake can “see”</dd>
				</div>
			</dl>
		</section>

		<section class="loop-card" aria-labelledby="feedback-loop-title">
			<p>Compact loop</p>
			<h4 id="feedback-loop-title">A sign is not a tempo</h4>
			<div
				class="loop-diagram"
				aria-label="Production raises x; x after a delay inhibits production; removal lowers x."
			>
				<span>production</span><b aria-hidden="true">+</b><span class="state-node">x</span><b
					aria-hidden="true">− after <span class="math-variable">τ</span></b
				><span>production</span>
			</div>
			<ul>
				<li>Instantaneous first-order negative feedback usually returns monotonically.</li>
				<li>Lag or inertia can produce overshoot and damped ringing.</li>
				<li>
					Sustained oscillation needs enough loop sensitivity together with sufficient phase lag,
					supplied here by delay; the nonlinearity shapes and bounds the cycle.
				</li>
			</ul>
		</section>
	</div>

	<aside class="mechanism-note">
		<strong>Negative feedback is one oscillator mechanism, not the origin of every rhythm.</strong>
		Pacemaker ion-channel dynamics, fast activation with slow inhibition, coupled oscillators, and external
		forcing by light, activity, meals or seasons can also make a trace wave.
	</aside>

	<details class="source-drawer">
		<summary>Feedback sources, verified presets and numerical boundary</summary>
		<div class="drawer-grid">
			<div>
				<h4>Sources</h4>
				<ul>
					<li>
						<a href="https://doi.org/10.1113/JP285015" rel="external"
							>Xiong &amp; Garfinkel — Are physiological oscillations physiological?</a
						>
					</li>
					<li>
						<a href="https://doi.org/10.1126/science.267326" rel="external"
							>Mackey &amp; Glass — Oscillation and chaos in physiological control systems</a
						>
					</li>
				</ul>
			</div>
			<div>
				<h4>Numerically checked presets</h4>
				<table class="preset-ledger">
					<thead
						><tr
							><th scope="col">Preset</th><th scope="col">n</th><th scope="col"
								><span class="math-variable">τ</span></th
							><th scope="col">Verification</th></tr
						></thead
					>
					<tbody>
						{#each Object.values(FEEDBACK_PRESETS) as preset (preset.id)}
							<tr
								><th scope="row">{preset.label}</th><td>{preset.parameters.n}</td><td
									>{preset.parameters.delay.toFixed(2)}</td
								><td>{presetVerdict(preset.id)}</td></tr
							>
						{/each}
					</tbody>
				</table>
				<p>
					With a = 2, b = K = 1 and n = 4, the linearized first transition is <span
						class="math-variable">τ</span
					>
					≈ {FEEDBACK_HOPF_THRESHOLD.toFixed(4)}. The solver uses fixed-step RK4 method-of-steps at
					dt = 0.01 and equilibrium history.
				</p>
			</div>
		</div>
	</details>

	<p class="sr-only" aria-live="polite">{liveMessage}</p>
</section>
