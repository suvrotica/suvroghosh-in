<script lang="ts" module>
	function positionLabel(radians: number) {
		if (radians === 0) return 'Reference';
		return `${Math.round(Math.abs(radians) * (180 / Math.PI))}° ${radians < 0 ? 'left' : 'right'}`;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { asset } from '$app/paths';
	import {
		creaseOnset,
		DEFAULT_SETTINGS,
		END_TIME,
		LIMITS,
		nailOnset,
		positionRange,
		PRESETS,
		settingsRecord,
		timingRange,
		type Preset,
		type Settings
	} from './config';
	import {
		loadDefaultFrame,
		type FingerprintFrame,
		type WorkerReply,
		type WorkerRequest
	} from './protocol';
	import { saveImage, type View } from './render';
	import FingerprintPrint from './FingerprintPrint.svelte';
	import './fingerprint-lab.css';

	type Snapshot = {
		settings: Settings;
		frame: FingerprintFrame | null;
		image?: string;
	};
	type RunStatus = 'ready' | 'queued' | 'running' | 'complete' | 'error';

	const uid = $props.id();
	const names = { arch: 'Arch', loop: 'Loop', whorl: 'Whorl' } as const;
	const presets: Preset[] = ['arch', 'loop', 'whorl'];
	const previewImages = {
		arch: asset('/images/visualizations/how-fingerprints-form/arch-preview.png'),
		loop: asset('/images/visualizations/how-fingerprints-form/loop-preview.png'),
		whorl: asset('/images/visualizations/how-fingerprints-form/whorl-preview.png')
	};
	const example: Snapshot = {
		settings: DEFAULT_SETTINGS,
		frame: null,
		image: asset('/images/visualizations/how-fingerprints-form/loop.png')
	};
	const debounceMs = 240;

	let settings = $state.raw<Settings>({ ...DEFAULT_SETTINGS });
	let activeSettings = $state.raw<Settings | null>(null);
	let activeFrame = $state.raw<FingerprintFrame | null>(null);
	let defaultFrame = $state.raw<FingerprintFrame | null>(null);
	let lastCompleted = $state.raw<Snapshot>(example);
	let comparison = $state.raw<Snapshot | null>(null);
	let runStatus = $state<RunStatus>('ready');
	let view = $state<View>('print');
	let compareView = $state<'before' | 'now'>('now');
	let wide = $state(false);
	let userPaused = $state(false);
	let documentVisible = $state(false);
	let inViewport = $state(false);
	let reducedMotion = $state(false);
	let mounted = $state(false);
	let usable = $state(false);
	let showRegions = $state(false);
	let adjustingPosition = $state(false);
	let advancedOpen = $state(false);
	let actionMessage = $state('');
	let runMessage = $state('');
	let copyText = $state('');
	let experiment = $state<HTMLElement>();

	let worker: Worker | undefined;
	let runId = 0;
	let sentActivity: boolean | undefined;
	let deferredFrame: Extract<WorkerReply, { type: 'frame' }> | undefined;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let autoTimer: ReturnType<typeof setTimeout> | undefined;
	let positionTimer: ReturnType<typeof setTimeout> | undefined;
	let autoRunStarted = false;
	let automaticRun = false;
	let disposed = false;

	const isActive = $derived(inViewport && documentVisible && !userPaused);
	const runInProgress = $derived(runStatus === 'running' || runStatus === 'queued');
	const adjusted = $derived(
		settings.spacing !== PRESETS[settings.preset].spacing ||
			settings.position !== PRESETS[settings.preset].position ||
			settings.timing !== PRESETS[settings.preset].timing ||
			settings.width !== PRESETS[settings.preset].width ||
			settings.noise !== PRESETS[settings.preset].noise ||
			settings.seed !== PRESETS[settings.preset].seed
	);
	const positionBounds = $derived(positionRange(settings.preset));
	const timingBounds = $derived(timingRange(settings.preset));
	const current: Snapshot = $derived(
		runStatus === 'running' && activeFrame && activeSettings
			? { settings: activeSettings, frame: activeFrame }
			: lastCompleted
	);
	const previous = $derived(current === lastCompleted && (runInProgress || runStatus === 'error'));
	const selected = $derived(!wide && compareView === 'before' && comparison ? comparison : current);
	const selectedFrame = $derived(fieldFor(selected));
	const selectedTime = $derived(selectedFrame?.time ?? END_TIME);
	const currentTime = $derived(fieldFor(current)?.time ?? END_TIME);
	const earlierTime = $derived(comparison ? (fieldFor(comparison)?.time ?? END_TIME) : END_TIME);

	function fieldFor(snapshot: Snapshot) {
		return snapshot.frame ?? (snapshot.image === example.image ? defaultFrame : null);
	}

	function send(message: WorkerRequest) {
		worker?.postMessage(message);
	}

	function cancelTimers() {
		clearTimeout(debounceTimer);
		clearTimeout(autoTimer);
		debounceTimer = undefined;
		autoTimer = undefined;
	}

	function invalidateRun() {
		if (runStatus === 'running') send({ type: 'activity', id: runId, active: false });
		runId++;
		deferredFrame = undefined;
		sentActivity = undefined;
		activeFrame = null;
		activeSettings = null;
	}

	function acceptFrame(reply: Extract<WorkerReply, { type: 'frame' }>) {
		if (reply.complete && activeSettings) {
			lastCompleted = { settings: activeSettings, frame: reply.frame };
			activeFrame = null;
			runStatus = 'complete';
			runMessage = 'Simulation finished.';
		} else {
			activeFrame = reply.frame;
		}
	}

	function failRun() {
		invalidateRun();
		runStatus = 'error';
		runMessage = 'The simulation stopped before finishing. The previous result is shown.';
	}

	function connectWorker() {
		if (worker) return;
		worker = new Worker(new URL('./fingerprint.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
			if (data.id !== runId || runStatus !== 'running') return;
			if (data.type === 'error') failRun();
			else if (isActive) acceptFrame(data);
			else deferredFrame = data;
		};
		worker.onerror = (event) => {
			event.preventDefault();
			worker?.terminate();
			worker = undefined;
			failRun();
		};
	}

	function beginRun(next: Settings, automatic = false) {
		if (!usable) return;
		cancelTimers();
		invalidateRun();
		autoRunStarted = true;
		automaticRun = automatic;
		settings = { ...next };
		activeSettings = { ...next };
		userPaused = false;
		compareView = 'now';
		copyText = '';
		actionMessage = '';
		runStatus = 'running';
		runMessage = `Forming ridges from the ${names[next.preset]} starting configuration.`;

		try {
			connectWorker();
			sentActivity = isActive;
			send({ type: 'start', id: runId, settings: activeSettings, active: isActive });
		} catch {
			failRun();
		}
	}

	function queueSetting(key: 'spacing' | 'position' | 'timing' | 'width' | 'noise', value: number) {
		if (value === settings[key]) return;
		cancelTimers();
		invalidateRun();
		autoRunStarted = true;
		settings = { ...settings, [key]: value };
		compareView = 'now';
		runStatus = 'queued';
		runMessage = '';
		copyText = '';
		actionMessage = '';
		debounceTimer = setTimeout(() => beginRun(settings), debounceMs);

		if (key === 'position') {
			adjustingPosition = true;
			clearTimeout(positionTimer);
			positionTimer = setTimeout(() => (adjustingPosition = false), 1200);
		}
	}

	function changeSeed(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const nextSeed = input.valueAsNumber;
		if (!Number.isInteger(nextSeed) || nextSeed < LIMITS.seed.min || nextSeed > LIMITS.seed.max) {
			input.value = String(settings.seed);
			actionMessage = 'Enter a whole variation number from 0 to 4,294,967,295.';
		} else if (nextSeed !== settings.seed) {
			beginRun({ ...settings, seed: nextSeed });
		}
	}

	function newVariation() {
		const next = crypto.getRandomValues(new Uint32Array(1))[0];
		beginRun({ ...settings, seed: next === settings.seed ? (next + 1) >>> 0 : next });
	}

	function reset() {
		view = 'print';
		showRegions = false;
		adjustingPosition = false;
		advancedOpen = false;
		lastCompleted = example;
		if (reducedMotion) {
			cancelTimers();
			invalidateRun();
			autoRunStarted = true;
			settings = { ...DEFAULT_SETTINGS };
			runStatus = 'ready';
			runMessage = 'Default Loop example restored.';
			actionMessage = '';
			copyText = '';
			compareView = 'now';
		} else {
			beginRun(DEFAULT_SETTINGS);
		}
	}

	function keepForComparison() {
		comparison = { ...current, settings: { ...current.settings } };
		compareView = 'now';
		actionMessage = 'Result kept for comparison.';
	}

	function clearComparison() {
		comparison = null;
		compareView = 'now';
		actionMessage = 'Comparison cleared.';
	}

	async function copySettings() {
		const record = JSON.stringify(
			{ ...settingsRecord(selected.settings), snapshotTime: selectedTime, view },
			null,
			2
		);
		try {
			await navigator.clipboard.writeText(record);
			actionMessage = 'Settings copied.';
			copyText = '';
		} catch {
			copyText = record;
			actionMessage = 'Select the settings text below to copy it.';
		}
	}

	async function downloadImage() {
		const frame = selectedFrame;
		if (!frame) return;
		const imageView = view;
		const { preset, seed } = selected.settings;
		try {
			const blob = await saveImage(frame, imageView);
			if (disposed) return;
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `synthetic-fingerprint-${preset}-${seed}-${imageView}.png`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			actionMessage = 'Image saved.';
		} catch {
			actionMessage = 'The image could not be saved. Try again.';
		}
	}

	function rendererUnavailable() {
		usable = false;
		cancelTimers();
		invalidateRun();
		worker?.terminate();
		worker = undefined;
		defaultFrame = null;
		lastCompleted = example;
		comparison = null;
		view = 'print';
		runStatus = 'ready';
	}

	$effect(() => {
		if (!mounted || !usable || runStatus !== 'running') return;
		const active = isActive;
		if (active && deferredFrame) {
			const reply = deferredFrame;
			deferredFrame = undefined;
			acceptFrame(reply);
			if (reply.complete) return;
		}
		if (active !== sentActivity) {
			sentActivity = active;
			send({ type: 'activity', id: runId, active });
		}
	});

	$effect(() => {
		if (!mounted || !usable || !inViewport || !documentVisible || reducedMotion || autoRunStarted)
			return;
		autoTimer = setTimeout(() => beginRun(DEFAULT_SETTINGS, true), 1500);
		return () => {
			clearTimeout(autoTimer);
			autoTimer = undefined;
		};
	});

	onMount(() => {
		mounted = true;
		try {
			usable =
				typeof Worker !== 'undefined' && Boolean(document.createElement('canvas').getContext('2d'));
		} catch {
			usable = false;
		}
		if (!usable) return;

		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		const desktop = matchMedia('(min-width: 64rem)');
		const controller = new AbortController();
		const readMotion = () => {
			reducedMotion = motion.matches || document.documentElement.dataset.motion === 'still';
			if (reducedMotion && automaticRun && runStatus === 'running') reset();
		};
		const readWidth = () => (wide = desktop.matches);
		const readVisibility = () => (documentVisible = !document.hidden);
		readMotion();
		readWidth();
		readVisibility();
		motion.addEventListener('change', readMotion);
		desktop.addEventListener('change', readWidth);
		document.addEventListener('visibilitychange', readVisibility);
		const motionObserver = new MutationObserver(readMotion);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const observer =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver(([entry]) => (inViewport = entry.isIntersecting));
		if (observer && experiment) observer.observe(experiment);
		else inViewport = true;

		void loadDefaultFrame(controller.signal)
			.then((frame) => {
				if (!disposed && usable) defaultFrame = frame;
			})
			.catch(() => {
				// The poster remains readable and the worker can still calculate a new run.
			});

		return () => {
			disposed = true;
			controller.abort();
			cancelTimers();
			clearTimeout(positionTimer);
			worker?.terminate();
			observer?.disconnect();
			motionObserver.disconnect();
			motion.removeEventListener('change', readMotion);
			desktop.removeEventListener('change', readWidth);
			document.removeEventListener('visibilitychange', readVisibility);
		};
	});
</script>

<section class="fingerprint-lab not-prose" aria-labelledby={`${uid}-title`} data-tts-exclude>
	<header class="fp-intro">
		<h1 id={`${uid}-title`}>How fingerprints form</h1>
		<p class="fp-question">How do ridges on a fingertip become an arch, a loop or a whorl?</p>
		<p>
			Change where ridges begin and how far apart they grow. Watch a synthetic fingerprint take
			shape.
		</p>
	</header>

	<div class="fp-instrument" bind:this={experiment} data-testid="fingerprint-instrument">
		<div class="fp-screen">
			<div class="fp-screen-bar">
				<div class="fp-switch" role="group" aria-label="Display">
					<button type="button" aria-pressed={view === 'print'} onclick={() => (view = 'print')}
						>Print</button
					>
					<button
						type="button"
						aria-pressed={view === 'signal'}
						disabled={!usable || !selectedFrame}
						onclick={() => (view = 'signal')}>Signal</button
					>
				</div>
				<div class="fp-state" data-testid="fingerprint-status">
					{#if runStatus === 'error'}Previous result
					{:else if runStatus === 'queued'}Starting experiment…
					{:else if runStatus === 'running' && userPaused}Paused
					{:else if runStatus === 'running'}Forming ridges…
					{:else if runStatus === 'complete'}Simulation finished
					{:else}Solved Loop example{/if}
				</div>
			</div>

			{#if comparison}
				<div class="fp-switch fp-compare-switch" role="group" aria-label="Comparison">
					<button
						type="button"
						aria-pressed={compareView === 'before'}
						onclick={() => (compareView = 'before')}>Before</button
					>
					<button
						type="button"
						aria-pressed={compareView === 'now'}
						onclick={() => (compareView = 'now')}>Now</button
					>
				</div>
			{/if}

			<div
				class="fp-impressions"
				class:fp-compared={comparison !== null}
				class:fp-show-before={compareView === 'before'}
			>
				{#if comparison}
					<figure class="fp-before" data-testid="fingerprint-comparison">
						<FingerprintPrint
							frame={fieldFor(comparison)}
							image={comparison.image}
							settings={comparison.settings}
							{view}
							{showRegions}
							{rendererUnavailable}
						/>
						<figcaption>
							Before · {names[comparison.settings.preset]} · {comparison.settings.spacing.toFixed(
								2
							)}× spacing · time {earlierTime.toFixed(0)}
						</figcaption>
					</figure>
				{/if}
				<figure class="fp-now" data-testid="fingerprint-current">
					<FingerprintPrint
						frame={fieldFor(current)}
						image={current.image}
						settings={current.settings}
						{view}
						{showRegions}
						positionPreview={adjustingPosition ? settings : undefined}
						{rendererUnavailable}
					/>
					{#if previous || comparison}
						<figcaption>
							{previous ? 'Previous result' : 'Now'} · {names[current.settings.preset]} · {current.settings.spacing.toFixed(
								2
							)}× spacing · time {currentTime.toFixed(0)}
						</figcaption>
					{/if}
				</figure>
			</div>

			{#if view === 'signal' && selectedFrame}
				<div class="fp-legend" aria-label="Activator signal from low to high">
					<span>Low signal</span><span class="fp-legend-ramp" aria-hidden="true"></span><span
						>High signal</span
					>
				</div>
			{/if}
			<div class="fp-time">
				<label for={`${uid}-time`}>Simulation time</label>
				<progress id={`${uid}-time`} max={END_TIME} value={selectedTime}
					>{selectedTime.toFixed(0)} / {END_TIME}</progress
				>
				<span aria-hidden="true">{selectedTime.toFixed(0)} / {END_TIME}</span>
			</div>
			{#if comparison}
				<details class="fp-snapshot-settings">
					<summary>Settings for Before and Now</summary>
					<div>
						{@render snapshotSettings('Before', comparison)}
						{@render snapshotSettings(previous ? 'Previous result' : 'Now', current)}
					</div>
				</details>
			{/if}
			<p class="fp-caption">A synthetic fingerprint from a simplified model of ridge formation.</p>
		</div>

		<div class="fp-controls">
			<fieldset class="fp-settings" disabled={!usable}>
				<legend class="fp-visually-hidden">Experiment settings</legend>
				<div class="fp-control-title">
					<h2>Starting configuration</h2>
					<p>{names[settings.preset]} preset{adjusted ? ' · modified' : ''}</p>
				</div>
				<div class="fp-presets" role="group" aria-label="Starting configuration">
					{#each presets as preset (preset)}
						<button
							type="button"
							class="fp-preset"
							aria-pressed={settings.preset === preset}
							onclick={() => beginRun(PRESETS[preset])}
						>
							<img src={previewImages[preset]} alt="" width="68" height="68" decoding="async" />
							<span>{names[preset]}</span>
							{#if settings.preset === preset}<span class="fp-tick" aria-hidden="true">✓</span>{/if}
						</button>
					{/each}
				</div>

				<div class="fp-primary-settings">
					<div class="fp-setting">
						<div class="fp-setting-label">
							<label for={`${uid}-spacing`}>Ridge spacing</label>
							<span aria-hidden="true">{settings.spacing.toFixed(2)}×</span>
						</div>
						<input
							id={`${uid}-spacing`}
							type="range"
							{...LIMITS.spacing}
							value={settings.spacing}
							aria-valuetext={`${settings.spacing.toFixed(2)} times the reference model scale`}
							aria-describedby={`${uid}-spacing-help`}
							oninput={(event) => queueSetting('spacing', event.currentTarget.valueAsNumber)}
						/>
						<div class="fp-range-labels" aria-hidden="true">
							<span>Closer</span><span>Wider</span>
						</div>
						<p id={`${uid}-spacing-help`}>Changes how far both signals spread.</p>
					</div>
					<div class="fp-setting">
						<div class="fp-setting-label">
							<label for={`${uid}-position`}>Starting position</label>
							<span aria-hidden="true"
								>{settings.preset === 'arch' ? 'Edges' : positionLabel(settings.position)}</span
							>
						</div>
						<input
							id={`${uid}-position`}
							type="range"
							{...positionBounds}
							value={settings.position}
							disabled={settings.preset === 'arch'}
							aria-valuetext={positionLabel(settings.position)}
							aria-describedby={`${uid}-position-help`}
							oninput={(event) => queueSetting('position', event.currentTarget.valueAsNumber)}
						/>
						<p id={`${uid}-position-help`}>
							{settings.preset === 'arch'
								? 'This arch begins at the edges.'
								: 'Moves the place where ridges first form on the pad.'}
						</p>
					</div>
					<div class="fp-setting">
						<div class="fp-setting-label">
							<label for={`${uid}-timing`}>Wave timing</label>
							<span aria-hidden="true">{creaseOnset(settings)}</span>
						</div>
						<input
							id={`${uid}-timing`}
							type="range"
							{...timingBounds}
							value={settings.timing}
							aria-valuetext={`Crease starts at model time ${creaseOnset(settings)}`}
							aria-describedby={`${uid}-timing-help`}
							oninput={(event) => queueSetting('timing', event.currentTarget.valueAsNumber)}
						/>
						<div class="fp-range-labels" aria-hidden="true">
							<span>Earlier</span><span>Later</span>
						</div>
						<p id={`${uid}-timing-help`}>
							Crease starts at {creaseOnset(PRESETS[settings.preset])} in the preset. Nail side starts
							at {nailOnset(settings)}.
						</p>
					</div>
				</div>

				<label class="fp-check">
					<input type="checkbox" bind:checked={showRegions} />
					Show starting regions
				</label>
				<details class="fp-advanced" bind:open={advancedOpen}>
					<summary>More controls</summary>
					<div class="fp-advanced-body">
						<div class="fp-setting">
							<div class="fp-setting-label">
								<label for={`${uid}-width`}>Fingertip width</label>
								<span aria-hidden="true">{settings.width.toFixed(2)}×</span>
							</div>
							<input
								id={`${uid}-width`}
								type="range"
								{...LIMITS.width}
								value={settings.width}
								aria-valuetext={`${settings.width.toFixed(2)} times the reference width`}
								aria-describedby={`${uid}-width-help`}
								oninput={(event) => queueSetting('width', event.currentTarget.valueAsNumber)}
							/>
							<p id={`${uid}-width-help`}>Changes the model’s surface shape.</p>
						</div>
						<div class="fp-setting">
							<div class="fp-setting-label">
								<label for={`${uid}-noise`}>Small initial differences</label>
								<span aria-hidden="true">{(100 * settings.noise).toFixed(1)}%</span>
							</div>
							<input
								id={`${uid}-noise`}
								type="range"
								{...LIMITS.noise}
								value={settings.noise}
								aria-valuetext={`${(100 * settings.noise).toFixed(1)} per cent`}
								aria-describedby={`${uid}-noise-help`}
								oninput={(event) => queueSetting('noise', event.currentTarget.valueAsNumber)}
							/>
							<p id={`${uid}-noise-help`}>
								Changes the size of small, smooth changes in the starting signal.
							</p>
						</div>
						<div class="fp-setting">
							<label for={`${uid}-seed`}>Variation number</label>
							<input
								id={`${uid}-seed`}
								type="number"
								{...LIMITS.seed}
								inputmode="numeric"
								value={settings.seed}
								onchange={changeSeed}
								onkeydown={(event) => {
									if (event.key === 'Enter') event.currentTarget.blur();
								}}
							/>
						</div>
					</div>
				</details>
			</fieldset>
		</div>

		<div class="fp-transport">
			<div class="fp-actions" role="group" aria-label="Playback">
				<button class="fp-primary" type="button" disabled={!usable} onclick={newVariation}
					>New variation</button
				>
				{#if runStatus === 'running'}
					<button type="button" disabled={!usable} onclick={() => (userPaused = !userPaused)}
						>{userPaused ? 'Continue' : 'Pause'}</button
					>
				{/if}
				<button type="button" disabled={!usable} onclick={() => beginRun(settings)}
					>{reducedMotion && runStatus === 'ready' ? 'Show formation' : 'Replay formation'}</button
				>
				<button type="button" disabled={!usable} onclick={reset}>Reset</button>
			</div>
			<div class="fp-actions fp-secondary" role="group" aria-label="Compare and export">
				<button
					type="button"
					disabled={!usable || runInProgress || previous}
					onclick={keepForComparison}>Keep for comparison</button
				>
				{#if comparison}<button type="button" onclick={clearComparison}>Clear comparison</button
					>{/if}
				<button type="button" disabled={!usable || !selectedFrame} onclick={downloadImage}
					>Save image</button
				>
				<button type="button" disabled={!usable} onclick={copySettings}>Copy settings</button>
			</div>
			<p class="fp-visually-hidden" role="status">{runMessage}</p>
			{#if !usable && mounted}
				<p class="fp-notice" role="status">
					This browser cannot run the experiment. The print above is a stored example from the
					model.
				</p>
			{:else if runStatus === 'error'}
				<p class="fp-notice">
					The simulation stopped before finishing. The previous result is shown. Try Replay
					formation or Reset.
				</p>
			{/if}
			<noscript
				><p class="fp-notice">
					Enable JavaScript to change the settings and run the experiment. The print above is a
					stored example.
				</p></noscript
			>
			<p class="fp-action-feedback" role="status">{actionMessage}</p>
			{#if copyText}
				<textarea
					aria-label="Settings to copy"
					value={copyText}
					rows="6"
					readonly
					onfocus={(event) => event.currentTarget.select()}
				></textarea>
			{/if}
		</div>
	</div>

	<div class="fp-explanation">
		<section class="fp-try" aria-labelledby={`${uid}-try`}>
			<h2 id={`${uid}-try`}>Try this</h2>
			<p>
				Start with <strong>Loop</strong> and keep the current print for comparison. Move
				<strong>Ridge spacing</strong>
				towards <strong>Wider</strong>. The fingertip stays the same size, while fewer ridges fit
				inside it. Reset, then choose <strong>New variation</strong>. Look for small changes under
				the same starting configuration.
			</p>
		</section>
		<details>
			<summary>Why ridges form</summary>
			<div>
				<p>
					One signal reinforces activity nearby and produces an inhibitor that spreads farther.
					Under the right conditions, some repeating disturbances grow while uniform changes die
					away. The spacing between ridges comes from this interaction.
				</p>
				<p>
					Starting locations and times influence how those repeating ridges meet. Changing the
					crease onset can change the arrangement even when the signals spread at the same rates as
					before.
				</p>
			</div>
		</details>
		<details>
			<summary>The equations</summary>
			<div>
				<p>
					The activator <i>u</i> and inhibitor <i>v</i> follow the saturated Gierer–Meinhardt equations
					on a curved fingertip surface:
				</p>
				<div class="fp-equations">
					<p>
						<span>∂u/∂t =</span> <span>r(a + u² / [v(1 + Ku²)])</span>
						<span>− μu + s²Δ<sub>S</sub>u</span>
					</p>
					<p><span>∂v/∂t =</span> <span>u² − νv</span> <span>+ s²DΔ<sub>S</sub>v</span></p>
				</div>
				<p>
					<i>a</i> gives basal activation, <i>r</i> sets the production rate, and <i>K</i> limits
					self reinforcement at high activator levels. <i>μ</i> and <i>ν</i> set the rates at which
					the signals decay. <i>u</i>² produces inhibitor. <i>Δ</i><sub>S</sub> is the surface
					Laplacian, which describes how signal moves between neighbouring points on the fingertip.
					The inhibitor diffuses <i>D</i> times as fast as the activator.
				</p>
				<p>
					The reference uses <i>a</i> = <i>K</i> = 0.001, <i>r</i> = 0.75, <i>μ</i> = 0.4, <i>ν</i>
					= 5.5, and <i>D</i> = 180. Ridge spacing changes <i>s</i>, which scales both diffusion
					rates. Starting position and variation change the initial state, wave timing changes the
					crease boundary onset, and fingertip width changes the surface.
				</p>
				<p>
					How the model works is described in the <a
						href="https://github.com/AndrewLKrause/fingerprint-simulations/blob/main/Model%20Details.pdf"
						>mathematical appendix</a
					>. The model uses dimensionless time and length, and the print is a flat projection of the
					activator field.
				</p>
			</div>
		</details>
	</div>
</section>

{#snippet snapshotSettings(label: string, snapshot: Snapshot)}
	<div>
		<strong>{label} · {names[snapshot.settings.preset]}</strong>
		<dl>
			<dt>Ridge spacing</dt>
			<dd>{snapshot.settings.spacing.toFixed(2)}×</dd>
			<dt>Starting position</dt>
			<dd>
				{snapshot.settings.preset === 'arch' ? 'Edges' : positionLabel(snapshot.settings.position)}
			</dd>
			<dt>Crease start</dt>
			<dd>{creaseOnset(snapshot.settings)}</dd>
			<dt>Nail-side start</dt>
			<dd>{nailOnset(snapshot.settings)}</dd>
			<dt>Fingertip width</dt>
			<dd>{snapshot.settings.width.toFixed(2)}×</dd>
			<dt>Small initial differences</dt>
			<dd>{(100 * snapshot.settings.noise).toFixed(1)}%</dd>
			<dt>Variation number</dt>
			<dd>{snapshot.settings.seed}</dd>
		</dl>
	</div>
{/snippet}
