<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import {
		DEFAULT_SETTINGS,
		SCENARIOS,
		buildExperiment,
		estimate
	} from '$lib/visualizations/missing-data/model';
	import {
		normalizeSettings,
		encodeSettings,
		decodeSettings
	} from '$lib/visualizations/missing-data/state';
	import type {
		Settings,
		ScenarioId,
		ImputationId,
		OrderingId,
		ViewId,
		MatrixFrame
	} from '$lib/visualizations/missing-data/types';
	import { resolveMotion } from '$lib/motion/preferences';
	import DistributionPlot from './DistributionPlot.svelte';
	import MiniMatrix from './MiniMatrix.svelte';

	let settings = $state<Settings>({ ...DEFAULT_SETTINGS });
	let canvas = $state.raw<HTMLCanvasElement>(null!);
	let viewport: HTMLDivElement;
	let mounted = $state(false);
	let selectedRow = $state(0);
	let selectedColumn = $state(0);
	let playhead = $state(0);
	let playing = $state(false);
	let soundEnabled = $state(false);
	let soundStarting = $state(false);
	let auditionImputed = $state(false);
	let muted = $state(false);
	let volume = $state(0.35);
	let still = $state(true);
	let visible = $state(true);
	let glFailure = $state('');
	let compare = $state(false);
	let status = $state('Sound is off. Every pattern can be explored in silence.');
	let shareLink = $state('');
	let exporting = $state(false);
	let disposed = false;
	let renderer = $state.raw<
		| ReturnType<typeof import('$lib/visualizations/missing-data/renderer').createMatrixRenderer>
		| undefined
	>();
	let audio:
		| InstanceType<typeof import('$lib/visualizations/missing-data/audio').MissingAudio>
		| undefined;
	const experiment = $derived(buildExperiment(settings));
	const scenario = $derived(SCENARIOS.find((s) => s.id === settings.scenario)!);
	const column = $derived(Math.min(selectedColumn, experiment.data.cols - 1));
	const complete = $derived(estimate(experiment.data.truth, experiment.data.cols, column));
	const available = $derived(estimate(experiment.observed.values, experiment.data.cols, column));
	const completed = $derived(estimate(experiment.completion.values, experiment.data.cols, column));
	const comparison = $derived(
		compare
			? buildExperiment({
					...settings,
					scenario: settings.scenario === 'mcar' ? 'mnar' : 'mcar',
					ordering: settings.ordering,
					imputation: 'none',
					rate: settings.rate
				})
			: null
	);
	const inspectedIndex = $derived(selectedRow * experiment.data.cols + column);
	const missing = $derived(!!experiment.observed.mask[inspectedIndex]);
	const filled = $derived(missing && Number.isFinite(experiment.completion.values[inspectedIndex]));
	const inspectedValue = $derived(
		missing
			? settings.reveal
				? experiment.data.truth[inspectedIndex]
				: experiment.completion.values[inspectedIndex]
			: experiment.observed.values[inspectedIndex]
	);
	const displayedRow = $derived(Math.max(0, experiment.order.indexOf(selectedRow)));
	const total = $derived(experiment.data.rows * experiment.data.cols);
	const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
	const number = (value: number | null, digits = 2) =>
		value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
	const participant = (row: number) => `P${String(row + 1).padStart(3, '0')}`;
	const scenarioLabels: Record<ScenarioId, string> = {
		mcar: 'MCAR',
		mar: 'MAR',
		mnar: 'MNAR',
		dropout: 'DROPOUT',
		variables: 'VARIABLES',
		instrument: 'OUTAGES',
		nonresponse: 'NONRESPONSE'
	};
	const error = $derived(
		available.mean !== null && complete.mean !== null ? available.mean - complete.mean : null
	);

	function patch(update: Partial<Settings>) {
		settings = normalizeSettings({ ...settings, ...update });
		shareLink = '';
	}
	function chooseScenario(id: ScenarioId) {
		const next = SCENARIOS.find((s) => s.id === id)!;
		patch({
			scenario: id,
			view:
				id === 'dropout' || id === 'instrument' || id === 'variables' ? next.view : settings.view,
			ordering: id === 'dropout' ? 'dropout' : 'original'
		});
		playhead = 0;
		selectedRow = 0;
	}
	function reset() {
		settings = { ...DEFAULT_SETTINGS };
		selectedRow = 0;
		selectedColumn = 0;
		playhead = 0;
		playing = false;
		compare = false;
		shareLink = '';
		audio?.stop();
		status = 'The original dataset and settings are restored.';
	}
	function repaint() {
		if (!renderer || glFailure || !visible) return;
		const frame: MatrixFrame = {
			experiment,
			reveal: settings.reveal,
			selectedRow,
			selectedColumn: column,
			playhead: playing ? playhead : -1
		};
		renderer.render(frame);
	}
	$effect(() => {
		if (mounted) repaint();
	});
	$effect(() => {
		if (soundEnabled) audio?.setVolume(muted ? 0 : volume);
	});
	$effect(() => {
		if (!playing || !visible || !mounted) return;
		const current = experiment;
		const timer = setInterval(() => {
			playhead = (playhead + 1) % current.data.rows;
			if (soundEnabled && !muted) audio?.playRow(current, playhead, auditionImputed);
		}, 180);
		return () => clearInterval(timer);
	});
	function inspect(event: PointerEvent) {
		const rect = canvas?.getBoundingClientRect();
		if (!rect || !rect.width || !rect.height) return;
		const c = Math.min(
			experiment.data.cols - 1,
			Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * experiment.data.cols))
		);
		const r = Math.min(
			experiment.data.rows - 1,
			Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * experiment.data.rows))
		);
		selectedColumn = c;
		selectedRow = experiment.order[r];
	}
	function inspectKeyboard(event: KeyboardEvent) {
		let r = displayedRow;
		let c = column;
		if (event.key === 'ArrowUp') r--;
		else if (event.key === 'ArrowDown') r++;
		else if (event.key === 'ArrowLeft') c--;
		else if (event.key === 'ArrowRight') c++;
		else return;
		event.preventDefault();
		selectedRow = experiment.order[Math.max(0, Math.min(experiment.data.rows - 1, r))];
		selectedColumn = Math.max(0, Math.min(experiment.data.cols - 1, c));
	}
	async function enableSound() {
		if (soundStarting) return;
		if (soundEnabled) {
			muted = !muted;
			return;
		}
		soundStarting = true;
		try {
			const { MissingAudio } = await import('$lib/visualizations/missing-data/audio');
			if (disposed) return;
			audio ??= new MissingAudio();
			await audio.enable();
			if (disposed || document.hidden) {
				audio.suspend();
				return;
			}
			audio.setVolume(volume);
			soundEnabled = true;
			muted = false;
			if (!visible) viewport.scrollIntoView({ block: 'center', behavior: 'instant' });
			playing = true;
			status = 'Sound enabled. Eight fixed column voices are sampled; missing cells become rests.';
		} catch {
			status = 'Audio could not start. The visual explorer remains available.';
		} finally {
			soundStarting = false;
		}
	}
	async function toggleScan() {
		if (playing) {
			playing = false;
			audio?.stop();
			return;
		}
		if (soundEnabled) {
			try {
				await audio?.enable();
			} catch {
				status = 'Audio is unavailable; the scan continues silently.';
			}
		}
		if (!disposed && !document.hidden) {
			if (!visible) viewport.scrollIntoView({ block: 'center', behavior: 'instant' });
			playing = true;
		}
	}
	async function download(kind: 'png' | 'json') {
		exporting = true;
		try {
			const module = await import('$lib/visualizations/missing-data/export');
			if (kind === 'png') await module.downloadFingerprint(experiment);
			else module.downloadJSON(experiment);
			status = `${kind === 'png' ? 'Fingerprint plate' : 'Reproducibility report'} downloaded for seed ${settings.seed}.`;
		} catch {
			status = 'The download could not be created. Please try again.';
		} finally {
			exporting = false;
		}
	}
	async function share() {
		const url = new SvelteURL(location.href);
		url.search = encodeSettings(settings);
		url.hash = '';
		shareLink = url.href;
		try {
			await navigator.clipboard.writeText(shareLink);
			status = 'Reproducible scene link copied.';
		} catch {
			status = 'Copy the scene link shown below.';
		}
	}
	onMount(() => {
		settings = decodeSettings(new URLSearchParams(location.search));
		const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			still =
				resolveMotion(document.documentElement.dataset.motion, motionQuery.matches) === 'still';
			if (still) {
				playing = false;
				audio?.stop();
			}
		};
		updateMotion();
		const preferenceObserver = new MutationObserver(updateMotion);
		preferenceObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		motionQuery.addEventListener('change', updateMotion);
		const visibility = () => {
			if (document.hidden) {
				playing = false;
				audio?.suspend();
			}
			visible = !document.hidden;
		};
		document.addEventListener('visibilitychange', visibility);
		const intersection = new IntersectionObserver(
			(entries) => {
				visible = !document.hidden && entries.some((entry) => entry.isIntersecting);
				if (!visible) {
					playing = false;
					audio?.stop();
				}
			},
			{ threshold: 0.05 }
		);
		intersection.observe(viewport);
		const resize = new ResizeObserver(repaint);
		resize.observe(viewport);
		if (new URLSearchParams(location.search).get('webgl') === 'off')
			glFailure = 'WebGL is switched off for this visit.';
		else
			void import('$lib/visualizations/missing-data/renderer')
				.then((module) => {
					if (disposed) return;
					try {
						renderer = module.createMatrixRenderer(canvas, (reason) => {
							glFailure = reason;
							playing = false;
						});
						repaint();
					} catch {
						glFailure = 'WebGL could not start on this device.';
					}
				})
				.catch(() => {
					if (!disposed) glFailure = 'The matrix renderer could not load.';
				});
		mounted = true;
		return () => {
			disposed = true;
			renderer?.dispose();
			audio?.dispose();
			intersection.disconnect();
			resize.disconnect();
			preferenceObserver.disconnect();
			motionQuery.removeEventListener('change', updateMotion);
			document.removeEventListener('visibilitychange', visibility);
		};
	});
</script>

<div class="ms-runtime" data-ready={mounted} data-still={still}>
	<nav class="ms-scenarios" aria-label="Missingness scenarios">
		{#each SCENARIOS as item, i (item.id)}
			<button
				class:active={settings.scenario === item.id}
				aria-label={`${item.label}: ${item.short}`}
				aria-pressed={settings.scenario === item.id}
				onclick={() => chooseScenario(item.id)}
				><span class="ms-scenario-index">0{i + 1} / {scenarioLabels[item.id]}</span><span
					>{item.short}</span
				><span class="ms-scenario-mark" aria-hidden="true"
					>{settings.scenario === item.id ? '↗' : '·'}</span
				></button
			>
		{/each}
	</nav>
	<div class="ms-instrument-top">
		<span><i class="ms-live-dot"></i> THE OBSERVATION FIELD</span><span
			>{experiment.data.rows} PARTICIPANTS × {experiment.data.cols}
			{settings.view === 'time' ? 'VISITS' : 'VARIABLES'}</span
		><span>SEED {settings.seed}</span>
	</div>
	<div class="ms-stage-grid">
		<div class="ms-matrix-column">
			<div class="ms-matrix-axis">
				<span>{settings.view === 'time' ? 'VISIT NUMBER →' : 'MEASURED VARIABLE →'}</span><span
					>COLOR: 14 → 50 → 86 SCORE POINTS · CLIPPED</span
				>
			</div>
			<div class="ms-viewport" bind:this={viewport}>
				{#if glFailure}
					<div class="ms-fallback">
						<MiniMatrix {experiment} />
						<p>
							{glFailure} This 2D preview shows observed values only. The controls, numerical summaries,
							and downloads still work.
						</p>
					</div>
				{:else}
					<button
						class="ms-matrix-button"
						aria-label={`Matrix inspector. ${participant(selectedRow)}, ${experiment.data.columns[column]}. Use arrow keys to inspect adjacent cells.`}
						aria-describedby="ms-inspector"
						onpointermove={inspect}
						onpointerdown={inspect}
						onkeydown={inspectKeyboard}
					>
						<canvas bind:this={canvas} aria-hidden="true"></canvas>
					</button>
				{/if}
			</div>
			<div class="ms-matrix-axis ms-axis-bottom">
				<span
					>PARTICIPANTS ↓ · {settings.ordering === 'original'
						? 'ORIGINAL ORDER'
						: `${settings.ordering.toUpperCase()} ORDER`}</span
				><span>TOUCH / ARROWS TO INSPECT</span>
			</div>
			<div class="ms-legend">
				<span><i class="ms-key ms-observed"></i>Measured</span><span
					><i class="ms-key ms-missing"></i>Missing</span
				><span><i class="ms-key ms-imputed"></i>Estimated + halo</span>{#if settings.reveal}<span
						><i class="ms-key ms-revealed"></i>Revealed truth</span
					>{/if}<span class="ms-legend-scale">low <b></b> high</span>
			</div>
		</div>
		<aside class="ms-scenario-story">
			<span class="ms-overline">THE SHAPE OF ABSENCE</span>
			<div class="ms-absence-number">
				{(experiment.summary.rate * 100).toFixed(1)}<small>%</small>
			</div>
			<p class="ms-absence-caption">of the measured field is missing</p>
			<div class="ms-absence-bar">
				<span style={`width:${(1 - experiment.summary.rate) * 100}%`}></span>
			</div>
			<span class="ms-mechanism">{scenario.mechanism}</span>
			<h3>{scenario.label}</h3>
			<p>{scenario.story}</p>
			<p class="ms-look"><span>LOOK FOR</span>{scenario.look}</p>
			<small
				>{experiment.summary.missing.toLocaleString()} absent / {total.toLocaleString()} cells · {experiment
					.summary.completeCases} complete participants</small
			>
		</aside>
	</div>
	<div class="ms-transport">
		<button class="ms-play" aria-pressed={playing} onclick={toggleScan}
			>{playing ? 'Ⅱ Pause the scan' : '▷ Scan the score'}</button
		><button aria-pressed={soundEnabled && !muted} disabled={soundStarting} onclick={enableSound}
			>{soundStarting
				? 'Opening sound…'
				: soundEnabled
					? muted
						? '♪ Unmute'
						: '♪ Mute'
					: '♪ Enable sound'}</button
		>{#if soundEnabled}<label class="ms-volume"
				>Volume<input type="range" min="0" max="0.8" step=".05" bind:value={volume} /></label
			>{/if}<span class="ms-transport-note"
			>{still
				? 'Still mode · scanning starts only when requested'
				: 'Silence is part of the score'}</span
		>
	</div>
	<div class="ms-control-strip">
		<label
			><span>01 / TARGET MISSINGNESS <strong>{Math.round(settings.rate * 100)}%</strong></span
			><input
				aria-label="Target missingness"
				type="range"
				min="0"
				max="0.9"
				step="0.01"
				value={settings.rate}
				oninput={(event) => patch({ rate: Number(event.currentTarget.value) })}
			/><small>Actual rate: {percent(experiment.summary.rate)}</small></label
		>
		<label
			><span>02 / PATTERN STRENGTH <strong>{settings.strength.toFixed(1)}</strong></span><input
				aria-label="Pattern strength"
				type="range"
				min="0.25"
				max="4"
				step="0.25"
				disabled={settings.scenario === 'mcar' || settings.scenario === 'variables'}
				value={settings.strength}
				oninput={(event) => patch({ strength: Number(event.currentTarget.value) })}
			/><small
				>{settings.scenario === 'mcar'
					? 'Independent removal; no selection strength'
					: 'How strongly the rule selects observations'}</small
			></label
		>
		<label
			><span>03 / FILL THE SILENCE</span><select
				aria-label="Imputation method"
				value={settings.imputation}
				onchange={(event) => patch({ imputation: event.currentTarget.value as ImputationId })}
				><option value="none">Leave missing</option><option value="mean"
					>Column mean · the smooth illusion</option
				><option value="predictive">Conditional predictive draw</option></select
			><small
				>{settings.imputation === 'mean'
					? 'Uncertainty not estimated'
					: settings.imputation === 'predictive'
						? 'Halos encode model-based predictive SD'
						: 'Darkness preserves the unanswered question'}</small
			></label
		>
	</div>
	<div class="ms-inspector" id="ms-inspector">
		<div class="ms-inspector-controls">
			<label
				>Participant<select
					aria-label="Inspect participant"
					value={selectedRow}
					onchange={(event) => (selectedRow = Number(event.currentTarget.value))}
					>{#each experiment.order as r (r)}<option value={r}>{participant(r)}</option
						>{/each}</select
				></label
			><label
				>{settings.view === 'time' ? 'Visit' : 'Variable'}<select
					aria-label="Inspect column"
					value={column}
					onchange={(event) => (selectedColumn = Number(event.currentTarget.value))}
					>{#each experiment.data.columns as name, c (name)}<option value={c}>{name}</option
						>{/each}</select
				></label
			>
		</div>
		<div class="ms-inspected-value">
			<span
				>{missing
					? settings.reveal
						? 'SIMULATED HIDDEN TRUTH'
						: filled
							? 'ESTIMATED VALUE'
							: 'UNOBSERVED'
					: 'MEASURED VALUE'}</span
			><strong>{number(inspectedValue)}</strong><small>{experiment.data.unit}</small>
		</div>
		<p>
			{missing
				? settings.reveal
					? 'Oracle view: this value is known only because the data are synthetic.'
					: filled
						? settings.imputation === 'mean'
							? 'Column mean fill. This method has not estimated uncertainty.'
							: `Conditional predictive SD: ${number(experiment.completion.spread[inspectedIndex])}. Estimated from available values and the fully observed predictor.`
						: 'No measurement is available. Missing is not zero.'
				: `Observed predictor: ${number(experiment.data.driver[selectedRow])}. This auxiliary information remains available even when measurements disappear.`}
		</p>
	</div>
	<section class="ms-analysis" aria-label="Statistical consequences">
		<div class="ms-section-heading">
			<div>
				<span class="ms-overline">WHAT THE AVERAGE DOES NOT TELL YOU</span>
				<h3>Listen to the estimate change.</h3>
			</div>
			<span>{experiment.data.columns[column]} · synthetic score</span>
		</div>
		<div class="ms-analysis-grid">
			<div>
				<div class="ms-estimates">
					<div>
						<span class="ms-estimate-label">COMPLETE SAMPLE</span><strong
							data-testid="complete-mean">{number(complete.mean)}</strong
						><small>n = {complete.n} · SD {number(complete.sd)}</small>
					</div>
					<div>
						<span class="ms-estimate-label ms-coral-text">AVAILABLE DATA</span><strong
							data-testid="available-mean">{number(available.mean)}</strong
						><small>n = {available.n} · SD {number(available.sd)}</small>
					</div>
					<div>
						<span class="ms-estimate-label ms-violet-text"
							>{settings.imputation === 'none' ? 'NO FILL APPLIED' : 'COMPLETED DATA'}</span
						><strong data-testid="completed-mean">{number(completed.mean)}</strong><small
							>n = {completed.n} · SD {number(completed.sd)}</small
						>
					</div>
				</div>
				<p class="ms-estimation-note">
					Available-data estimation error: <b>{number(error)}</b> score units against this complete synthetic
					sample. This single realization does not measure statistical bias.
				</p>
			</div>
			<div>
				<DistributionPlot {experiment} {column} />
				<div class="ms-plot-legend">
					<span>┄ Complete (simulation reference)</span><span class="ms-coral-text"
						>━ Available</span
					>{#if settings.imputation !== 'none'}<span class="ms-violet-text">━ Filled</span>{/if}
				</div>
			</div>
		</div>
		{#if experiment.completion.unestimable.length && settings.imputation !== 'none'}<p
				class="ms-warning"
			>
				{experiment.completion.unestimable.length} column(s) lack enough observed values for this method.
				Mean filling needs at least one value; conditional prediction needs at least three. A wholly absent
				variable cannot be learned from these data.
			</p>{/if}
	</section>
	<section class="ms-patterns" aria-label="Missingness fingerprint summaries">
		<div>
			<span class="ms-overline">COLUMN SILENCES</span>
			<div class="ms-column-bars">
				{#each experiment.summary.columnMissing as count, c (c)}<button
						title={`${experiment.data.columns[c]}: ${count} missing`}
						aria-label={`${experiment.data.columns[c]}, ${count} of ${experiment.data.rows} missing. Inspect this column.`}
						class:selected={column === c}
						onclick={() => (selectedColumn = c)}
						><span style={`height:${Math.max(2, (count / experiment.data.rows) * 100)}%`}
						></span><small>{String(c + 1).padStart(2, '0')}</small></button
					>{/each}
			</div>
		</div>
		<div>
			<span class="ms-overline">MOST FREQUENT PATTERNS</span>
			<div class="ms-pattern-list">
				{#each experiment.summary.patterns.slice(0, 4) as pattern (pattern.pattern)}<div>
						<span
							class="ms-pattern-cells"
							role="img"
							aria-label={`Missingness pattern ${pattern.pattern}, where one means missing and zero means measured`}
							>{#each [...pattern.pattern] as bit, bitIndex (bitIndex)}<i class:absent={bit === '1'}
								></i>{/each}</span
						><b>{pattern.count}</b>
					</div>{/each}
			</div>
			<p>Each strip is one participant’s mask · dark marks mean missing.</p>
		</div>
	</section>
	<details class="ms-assumptions">
		<summary>Open the score: ordering, assumptions &amp; sensitivity <span>＋</span></summary>
		<div class="ms-assumption-grid">
			<label
				>Matrix view<select
					aria-label="Matrix view"
					value={settings.view}
					disabled={settings.scenario === 'dropout' ||
						settings.scenario === 'instrument' ||
						settings.scenario === 'variables'}
					onchange={(event) => patch({ view: event.currentTarget.value as ViewId })}
					><option value="variables">Participants × variables</option><option value="time"
						>Participants × visits</option
					></select
				><small
					>Each view is a fixed synthetic projection for this seed. Time-based scenarios use visits.</small
				></label
			><label
				>Row ordering<select
					aria-label="Row ordering"
					value={settings.ordering}
					onchange={(event) => patch({ ordering: event.currentTarget.value as OrderingId })}
					><option value="original">Original participant order</option><option value="missing"
						>Amount missing</option
					><option value="driver">Observed predictor</option><option value="dropout"
						>First missing column / dropout time</option
					></select
				><small>Sorting changes positions, never numerical results.</small></label
			><label
				>Dataset seed<input
					aria-label="Dataset seed"
					type="number"
					min="1"
					max="2147483647"
					step="1"
					value={settings.seed}
					onchange={(event) => patch({ seed: Number(event.currentTarget.value) })}
				/><small
					><button
						class="ms-text-button"
						onclick={() => patch({ seed: settings.seed === 2147483647 ? 1 : settings.seed + 1 })}
						>Try the next seed ↗</button
					></small
				></label
			><label class="ms-checkbox"
				><input
					type="checkbox"
					checked={settings.reveal}
					onchange={(event) => patch({ reveal: event.currentTarget.checked })}
				/><span
					>Reveal what vanished<small
						>Simulation-only oracle. The imputer never receives these hidden values.</small
					></span
				></label
			><label
				>Predictive draw <strong>{settings.draw + 1}</strong><input
					aria-label="Predictive draw"
					type="range"
					min="0"
					max="19"
					step="1"
					disabled={settings.imputation !== 'predictive'}
					value={settings.draw}
					oninput={(event) => patch({ draw: Number(event.currentTarget.value) })}
				/><small>Alternative conditional predictions; not pooled multiple imputation.</small></label
			><label
				>Missing-outcome sensitivity <strong
					>{settings.delta > 0 ? '+' : ''}{settings.delta.toFixed(1)} SD</strong
				><input
					aria-label="Missing outcome sensitivity"
					type="range"
					min="-2"
					max="2"
					step="0.25"
					disabled={settings.imputation !== 'predictive' || settings.scenario !== 'mnar'}
					value={settings.delta}
					oninput={(event) => patch({ delta: Number(event.currentTarget.value) })}
				/><small
					>MNAR sensitivity shifts missing predictions by residual SD. Observed data stay fixed;
					this is an assumption, not an estimate.</small
				></label
			><label class="ms-checkbox"
				><input type="checkbox" bind:checked={auditionImputed} /><span
					>Audition estimated values<small
						>Predictive fills use a softer voice. Missing cells otherwise remain rests.</small
					></span
				></label
			>
			<div class="ms-rule">
				<span class="ms-overline">DISAPPEARANCE RULE</span>
				<p>{scenario.rule}</p>
			</div>
		</div>
	</details>
	<section class="ms-comparison">
		<div class="ms-section-heading">
			<div>
				<span class="ms-overline">ONE AMOUNT. MANY CONSEQUENCES.</span>
				<h3>The same silence has different shapes.</h3>
			</div>
			<button aria-expanded={compare} onclick={() => (compare = !compare)}
				>{compare ? 'Close comparison −' : 'Compare patterns +'}</button
			>
		</div>
		{#if comparison}<div class="ms-comparison-grid">
				<div>
					<MiniMatrix {experiment} />
					<h4>{scenario.short} <span>{percent(experiment.summary.rate)} missing</span></h4>
					<p>Selected column: {number(available.mean)} mean · n = {available.n}</p>
				</div>
				<div>
					<MiniMatrix experiment={comparison} />
					<h4>
						{SCENARIOS.find((s) => s.id === comparison.settings.scenario)?.short}<span
							>{percent(comparison.summary.rate)} missing</span
						>
					</h4>
					<p>
						Selected column: {number(
							estimate(comparison.observed.values, comparison.data.cols, column).mean
						)} mean · n = {estimate(comparison.observed.values, comparison.data.cols, column).n}
					</p>
				</div>
			</div>
			<p>
				The dataset, selected column, and color scale stay fixed. Both patterns use the same target
				missing fraction; achieved rates can differ because each rule has its own constraints. These
				previews show observed values only.
			</p>{/if}
		<p class="ms-identifiability">
			The same dark cells can have different causes. A pattern shows <em>what</em> is missing; the
			mechanism also asks <em>why</em>. Here the rule is known because we wrote the simulation.
		</p>
	</section>
	<footer class="ms-export">
		<div>
			<span class="ms-overline">TAKE THE SILENCE WITH YOU</span>
			<h3>Your missingness fingerprint.</h3>
			<p>A specimen of this dataset, its gaps, and the assumptions used to fill them.</p>
		</div>
		<div class="ms-export-actions">
			<button class="ms-primary" disabled={exporting} onclick={() => download('png')}
				>{exporting ? 'Preparing…' : '↓ Download fingerprint · PNG'}</button
			><button disabled={exporting} onclick={() => download('json')}>↓ JSON report</button><button
				onclick={share}>↗ Copy scene link</button
			><button onclick={reset}>Reset</button>
		</div>
		{#if shareLink}<label class="ms-share-url"
				>Reproducible scene link<input
					readonly
					value={shareLink}
					onclick={(event) => event.currentTarget.select()}
				/></label
			>{/if}
		<p class="ms-export-disclosure">
			Describes this pattern; does not establish why values are missing.
		</p>
	</footer>
	<p class="ms-status" role="status">{status}</p>
</div>
