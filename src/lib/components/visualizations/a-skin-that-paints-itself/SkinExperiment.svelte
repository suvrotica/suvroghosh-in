<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DEFAULT_SETTINGS,
		OBSERVATION_TIME,
		SEED_MAX,
		SHAPE_PRESETS,
		WIDTH_MIN,
		WIDTH_MAX,
		WIDTH_STEP,
		createSkinConfig,
		createDomain,
		type SkinSettings,
		type SkinDomain
	} from '$lib/visualizations/a-skin-that-paints-itself/model';
	import {
		renderSkinField,
		SIGNAL_LIMIT,
		type SkinViewMode
	} from '$lib/visualizations/a-skin-that-paints-itself/display';
	import {
		SkinWorkerClient,
		type SkinResult,
		type SkinReplayFrame
	} from '$lib/visualizations/a-skin-that-paints-itself/worker-client';
	import SkinComparison from './SkinComparison.svelte';

	let { onUnavailable }: { onUnavailable: () => void } = $props();

	const shapeChoices = [
		{ id: 'broad', label: 'Broad patch' },
		{ id: 'narrow', label: 'Narrow strip' },
		{ id: 'tapered', label: 'Tapered patch' }
	] as const;
	const appearances = [
		{ id: 'spots', label: 'Spots' },
		{ id: 'stripes', label: 'Stripes' },
		{ id: 'inverse-spots', label: 'Pale islands' }
	] as const;
	const views = [
		{ id: 'pigment', label: 'Pattern' },
		{ id: 'activator', label: 'Activator signal' },
		{ id: 'inhibitor', label: 'Inhibitor signal' }
	] as const;

	const KEYBOARD_DELAY_MS = 180;
	const REPLAY_INTERVAL_MS = 250;
	const RASTER_SCALE = 4;

	let root: HTMLDivElement;
	let formedCanvas = $state<HTMLCanvasElement>();
	let fittedCanvas = $state<HTMLCanvasElement>();
	let formedContext: CanvasRenderingContext2D;
	let fittedContext: CanvasRenderingContext2D;
	let client: SkinWorkerClient | null = null;
	let widthTimer: number | undefined;
	let widthPointer: number | undefined;
	let replayAfterCalculation = false;

	let requested = $state.raw<SkinSettings>({ ...DEFAULT_SETTINGS });
	let result = $state.raw<SkinResult | null>(null);
	let view = $state<SkinViewMode>('pigment');
	let displayedView = $state<SkinViewMode>('pigment');
	let frameIndex = $state<number | null>(null);
	let userPaused = $state(false);
	let active = $state(false);
	let pending = $state(false);
	let status = $state('Ready.');
	let failed = $state(false);

	let displayedSettings = $derived(result?.settings ?? DEFAULT_SETTINGS);
	let previous = $derived(!sameSettings(requested, displayedSettings));
	let displayedAppearance = $derived(
		appearances.find(({ id }) => id === displayedSettings.appearance)?.label
	);
	let requestedDomain = $derived(createDomain(createSkinConfig(requested)));
	let outline = $derived(outlinePath(requestedDomain));
	let observationTime = $derived(result?.observationTime ?? OBSERVATION_TIME);
	let formedTime = $derived(
		(frameIndex !== null ? result?.frames[frameIndex]?.modelTime : undefined) ?? observationTime
	);

	function sameSettings(a: SkinSettings, b: SkinSettings) {
		return (
			a.shape === b.shape &&
			a.widthPercent === b.widthPercent &&
			a.appearance === b.appearance &&
			a.seed === b.seed
		);
	}

	function outlinePath(domain: SkinDomain): string {
		const halfWidth = (x: number) => domain.columnWidths[x] / domain.gridSpacing / 2;
		const top = (x: number) => domain.ny / 2 - halfWidth(x);
		const bottom = (x: number) => domain.ny / 2 + halfWidth(x);
		let path = `M0 ${top(0)}`;
		for (let x = 0; x < domain.nx; x += 1) {
			path += `H${x + 1}`;
			if (x < domain.nx - 1) path += `V${top(x + 1)}`;
		}
		path += `V${bottom(domain.nx - 1)}`;
		for (let x = domain.nx - 1; x >= 0; x -= 1) {
			path += `H${x}`;
			if (x > 0) path += `V${bottom(x - 1)}`;
		}
		return `${path}Z`;
	}

	function paintField(
		context: CanvasRenderingContext2D,
		pair: SkinResult,
		fields: SkinResult['formed'],
		mode: SkinViewMode
	) {
		const width = pair.domain.nx * RASTER_SCALE;
		const height = pair.domain.ny * RASTER_SCALE;
		if (context.canvas.width !== width) context.canvas.width = width;
		if (context.canvas.height !== height) context.canvas.height = height;
		const image = context.createImageData(width, height);
		image.data.set(renderSkinField(fields, pair.domain, mode, RASTER_SCALE));
		context.putImageData(image, 0, 0);
	}

	function draw(pair: SkinResult, frame?: SkinReplayFrame, formedOnly = false): boolean {
		try {
			paintField(formedContext, pair, frame ?? pair.formed, view);
			if (!formedOnly) paintField(fittedContext, pair, pair.fitted, view);
			displayedView = view;
			return true;
		} catch {
			onUnavailable();
			return false;
		}
	}

	function calculationFailed() {
		pending = false;
		replayAfterCalculation = false;
		failed = true;
		status = 'Calculation failed. The last completed comparison is still shown.';
	}

	function receiveResult(pair: SkinResult) {
		if (!sameSettings(pair.settings, requested)) return;
		const startReplay = replayAfterCalculation;
		replayAfterCalculation = false;
		pending = false;
		failed = false;
		if (!draw(pair, startReplay ? pair.frames[0] : undefined)) return;
		result = pair;
		frameIndex = startReplay && pair.frames.length ? 0 : null;
		status = frameIndex === null ? 'Ready.' : 'Replaying formation.';
	}

	function stopReplay(restoreFinal: boolean) {
		if (frameIndex !== null && result && restoreFinal) draw(result, undefined, true);
		frameIndex = null;
		userPaused = false;
		replayAfterCalculation = false;
	}

	function stopWidthTimer() {
		window.clearTimeout(widthTimer);
		widthTimer = undefined;
	}

	function setRequested(settings: SkinSettings) {
		if (sameSettings(settings, requested)) return false;
		if (pending) client?.cancel();
		stopReplay(true);
		requested = settings;
		pending = false;
		failed = false;
		return true;
	}

	function calculate(reason: 'settings' | 'replay' | 'view') {
		stopWidthTimer();
		if (result && sameSettings(result.settings, requested)) {
			if (reason === 'replay') {
				if (!draw(result, result.frames[0], true)) return;
				frameIndex = result.frames.length ? 0 : null;
				status = 'Replaying formation.';
			} else {
				draw(result);
				status = 'Ready.';
			}
			return;
		}
		if (!client) {
			calculationFailed();
			return;
		}
		replayAfterCalculation = reason === 'replay';
		pending = true;
		failed = false;
		status =
			reason === 'replay' ? 'Preparing replay.' : 'Calculating the pattern for this surface.';
		client.calculate(requested);
	}

	function changeSettings(settings: SkinSettings) {
		stopWidthTimer();
		widthPointer = undefined;
		if (setRequested(settings) || (!pending && (failed || previous))) calculate('settings');
	}

	function changeWidth(event: Event) {
		const widthPercent = Number((event.currentTarget as HTMLInputElement).value);
		if (!setRequested({ ...requested, widthPercent })) return;
		stopWidthTimer();
		status = widthPointer === undefined ? 'Width selected.' : 'Release to calculate this width.';
		if (widthPointer === undefined) {
			widthTimer = window.setTimeout(() => calculate('settings'), KEYBOARD_DELAY_MS);
		}
	}

	function startWidthDrag(event: PointerEvent) {
		widthPointer = event.pointerId;
		if (widthTimer !== undefined) stopWidthTimer();
	}

	function finishWidthDrag(event: PointerEvent) {
		if (widthPointer !== event.pointerId) return;
		widthPointer = undefined;
		if (previous && !pending) calculate('settings');
		else if (!pending && !failed) status = 'Ready.';
	}

	function changeView(mode: SkinViewMode) {
		view = mode;
		if (result) {
			draw(result, frameIndex === null ? undefined : result.frames[frameIndex]);
		} else if (
			view !== 'pigment' &&
			!pending &&
			widthTimer === undefined &&
			widthPointer === undefined
		) {
			calculate('view');
		}
	}

	function replayControl() {
		if (pending || previous) return;
		if (frameIndex !== null) {
			userPaused = !userPaused;
			status = userPaused ? 'Replay paused.' : 'Replaying formation.';
			return;
		}
		calculate('replay');
	}

	function reset() {
		stopWidthTimer();
		widthPointer = undefined;
		client?.cancel();
		stopReplay(false);
		requested = { ...DEFAULT_SETTINGS };
		result = null;
		view = 'pigment';
		displayedView = 'pigment';
		pending = false;
		failed = false;
		status = 'Ready. Saved example restored.';
	}

	onMount(() => {
		try {
			const a = formedCanvas?.getContext('2d');
			const b = fittedCanvas?.getContext('2d');
			if (!a || !b) throw new Error('Canvas unavailable');
			formedContext = a;
			fittedContext = b;
			client = new SkinWorkerClient(receiveResult, calculationFailed);
		} catch {
			onUnavailable();
			return;
		}

		let inView = typeof IntersectionObserver !== 'function';
		const canvases = [formedContext.canvas, fittedContext.canvas];
		const updateActivity = () => {
			active = inView && !document.hidden;
			client?.setActive(active);
		};
		const observer =
			typeof IntersectionObserver === 'function'
				? new IntersectionObserver(([entry]) => {
						inView = entry.isIntersecting;
						updateActivity();
					})
				: null;

		observer?.observe(root);
		document.addEventListener('visibilitychange', updateActivity);
		for (const canvas of canvases) canvas.addEventListener('contextlost', onUnavailable);
		updateActivity();

		return () => {
			stopWidthTimer();
			observer?.disconnect();
			document.removeEventListener('visibilitychange', updateActivity);
			for (const canvas of canvases) canvas.removeEventListener('contextlost', onUnavailable);
			client?.dispose();
			client = null;
		};
	});

	let playing = $derived(active && frameIndex !== null && !userPaused);
	$effect(() => {
		if (!playing) return;

		let started: number | undefined;
		let animation: number;
		const advance = (timestamp: number) => {
			if (frameIndex === null || !result) return;
			started ??= timestamp;
			if (timestamp - started >= REPLAY_INTERVAL_MS) {
				started = timestamp;
				const nextIndex = frameIndex + 1;
				const nextFrame = result.frames[nextIndex];
				if (!draw(result, nextFrame, true)) return;
				if (!nextFrame) {
					stopReplay(false);
					status = 'Ready. Replay complete.';
					return;
				}
				frameIndex = nextIndex;
			}
			animation = requestAnimationFrame(advance);
		};
		animation = requestAnimationFrame(advance);
		return () => cancelAnimationFrame(animation);
	});
</script>

<svelte:window onpointerup={finishWidthDrag} onpointercancel={finishWidthDrag} />

<div class="skin-experiment" bind:this={root} data-testid="skin-live">
	<div class="skin-controls">
		<fieldset class="skin-shape-controls">
			<legend>Surface</legend>
			<div class="skin-keyrow">
				{#each shapeChoices as choice (choice.id)}
					{@const preset = SHAPE_PRESETS[choice.id]}
					<button
						type="button"
						class="skin-key"
						aria-pressed={requested.shape === preset.shape &&
							(choice.id === 'tapered' || requested.widthPercent === preset.widthPercent)}
						onclick={() => changeSettings({ ...requested, ...preset })}>{choice.label}</button
					>
				{/each}
			</div>
		</fieldset>

		<div class="skin-width-control">
			<label class="skin-width-label">
				<span class="skin-width-label-line">
					<span>Width{requested.shape === 'tapered' ? ' at wide end' : ''}</span>
					<span class="skin-width-value" aria-hidden="true">{requested.widthPercent}%</span>
				</span>
				<input
					type="range"
					min={WIDTH_MIN}
					max={WIDTH_MAX}
					step={WIDTH_STEP}
					value={requested.widthPercent}
					aria-valuetext={`${requested.widthPercent}% of the broad patch width`}
					oninput={changeWidth}
					onpointerdown={startWidthDrag}
					style:--skin-width-progress={`${((requested.widthPercent - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN)) * 100}%`}
				/>
				<span class="skin-width-ends" aria-hidden="true">
					<span>{WIDTH_MIN}%</span><span>{WIDTH_MAX}%</span>
				</span>
			</label>
			<svg
				class="skin-outline"
				viewBox={`-3 -3 ${requestedDomain.nx + 6} ${requestedDomain.ny + 6}`}
				aria-hidden="true"
			>
				<rect
					width={requestedDomain.nx}
					height={requestedDomain.ny}
					class="skin-outline-reference"
				/>
				<path d={outline} class="skin-outline-target" />
			</svg>
		</div>
	</div>

	<SkinComparison
		settings={displayedSettings}
		{formedTime}
		{observationTime}
		{previous}
		saved={!result}
	>
		{#snippet specimen(panel)}
			{#if panel === 'formed'}
				<div
					class="skin-live-specimen"
					hidden={!result}
					role="img"
					aria-label="Computed field formed on the selected surface"
				>
					<canvas class="skin-specimen" bind:this={formedCanvas} aria-hidden="true"></canvas>
				</div>
			{:else}
				<div
					class="skin-live-specimen"
					hidden={!result}
					role="img"
					aria-label="Completed broad-surface field fitted to the selected surface"
				>
					<canvas class="skin-specimen" bind:this={fittedCanvas} aria-hidden="true"></canvas>
				</div>
			{/if}
		{/snippet}
	</SkinComparison>

	{#if displayedView !== 'pigment'}
		<div class="skin-signal-key" data-testid="skin-signal-key">
			<span>{displayedView === 'activator' ? 'Activator' : 'Inhibitor'} signal</span>
			<span class="skin-signal-scale"
				><span>−{SIGNAL_LIMIT}</span><span>0</span><span>+{SIGNAL_LIMIT}</span></span
			>
			<span>Signed levels relative to zero.</span>
		</div>
	{/if}

	<div class="skin-footer">
		<div class="skin-status">
			<p class:skin-error={failed} role="status" data-testid="skin-status">{status}</p>
			<p>{displayedAppearance} · seed {displayedSettings.seed} · same scale in both windows</p>
		</div>
		<div class="skin-transport">
			<button
				class="skin-key skin-key-primary"
				type="button"
				aria-disabled={pending || previous}
				onclick={replayControl}
				>{frameIndex === null ? 'Replay formation' : userPaused ? 'Resume' : 'Pause'}</button
			>
			<button class="skin-key" type="button" onclick={reset}>Reset example</button>
		</div>
	</div>

	<details class="skin-details">
		<summary>Explore the signals and settings</summary>
		<div class="skin-settings">
			<p>
				Changing the width starts a new calculation on the selected surface. The signals can spread
				inside the patch, but they do not cross its edges. The length stays
				{requestedDomain.length} model units.
			</p>
			<p>
				{#if requested.shape === 'tapered'}
					The selected width is {requestedDomain.width} model units at the wide end. The narrow end is
					{requestedDomain.tipWidth} model units wide.
				{:else}
					The selected width is {requestedDomain.width} model units.
				{/if}
				The broad reference is {requestedDomain.referenceWidth} units wide. Each calculation stops at
				model time {observationTime}.
			</p>
			<fieldset>
				<legend>Show in both windows</legend>
				<div class="skin-keyrow">
					{#each views as choice (choice.id)}
						<button
							class="skin-key"
							type="button"
							aria-pressed={view === choice.id}
							onclick={() => changeView(choice.id)}>{choice.label}</button
						>
					{/each}
				</div>
			</fieldset>
			<p>
				The activator reinforces a local change. The inhibitor restrains it and spreads faster.
				Pattern view darkens the higher activator values using the same rule in both windows.
			</p>
			<fieldset>
				<legend>Appearance</legend>
				<div class="skin-keyrow">
					{#each appearances as choice (choice.id)}
						<button
							class="skin-key"
							type="button"
							aria-pressed={requested.appearance === choice.id}
							onclick={() => changeSettings({ ...requested, appearance: choice.id })}
							>{choice.label}</button
						>
					{/each}
				</div>
			</fieldset>
			<p>Changing appearance changes a reaction parameter and recalculates both source patterns.</p>
			<div class="skin-keyrow">
				<button
					class="skin-key"
					type="button"
					onclick={() =>
						changeSettings({
							...requested,
							seed: requested.seed === SEED_MAX ? 1 : requested.seed + 1
						})}
				>
					Try another starting disturbance
				</button>
			</div>
		</div>
	</details>
</div>
