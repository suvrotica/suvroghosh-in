<script lang="ts">
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { openPrivacySettings } from '$lib/privacy/consent';
	import {
		buildPainting,
		framePainting,
		prepareBrushwork,
		renderPainting,
		type Brushwork,
		type Frame,
		type Painting
	} from '$lib/visualizations/bengali-impressionism/brush';
	import { generateScene, type SceneFamily } from '$lib/visualizations/bengali-impressionism/scene';
	import { startExport } from '$lib/visualizations/bengali-impressionism/export-image';
	import { PaintingTimeline } from '$lib/visualizations/bengali-impressionism/timeline';
	import {
		ARTICLE_PATH,
		DEFAULT_PAINT,
		DEFAULT_STATE,
		SCENES,
		STORAGE_KEY,
		STUDIO_PATH,
		STUDIO_TITLE,
		VERSION,
		outputSize,
		readState,
		stateFromQuery,
		stateQuery,
		validSeed,
		type StudioState
	} from '$lib/visualizations/bengali-impressionism/studio-state';

	const controls = [
		{
			key: 'brushSize',
			label: 'Brush size',
			low: 'Small',
			high: 'Broad',
			hint: 'Size of each painted mark.'
		},
		{
			key: 'density',
			label: 'Stroke density',
			low: 'Sparse',
			high: 'Dense',
			hint: 'Amount of fine brushwork.'
		},
		{
			key: 'warmth',
			label: 'Light warmth',
			low: 'Cool',
			high: 'Warm',
			hint: 'Color of light and shade.'
		},
		{
			key: 'softness',
			label: 'Edge softness',
			low: 'Defined',
			high: 'Soft',
			hint: 'How gently colors meet.'
		}
	] as const;
	type PaintKey = (typeof controls)[number]['key'] | 'texture' | 'seconds';
	type Mode = 'still' | 'playing' | 'paused';
	const openingDescription = 'A painted Calcutta street with a pedestrian passing a produce stall.';
	let { title = STUDIO_TITLE }: { title?: string } = $props();

	let settings = $state<StudioState>({ ...DEFAULT_STATE });
	let history = $state.raw<StudioState[]>([]);
	let committed = { ...DEFAULT_STATE };
	let seedEntry = $state(DEFAULT_STATE.seed);
	let seedError = $state('');
	let description = $state(openingDescription);
	let status = $state('');
	let mode = $state<Mode>('still');
	let progress = 1;
	let percent = $state(100);
	let open = $state(true);
	let more = $state(false);
	let saveOpen = $state(false);
	let saving = $state(false);
	let fullscreen = $state(false);
	let canFullscreen = $state(false);
	let ready = $state(false);
	let unavailable = $state(false);
	let aspect = $state(1.5);
	let imageWidth = $state(0);
	let imageHeight = $state(0);
	let studio: HTMLElement;
	let stage: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let toggleControls: HTMLButtonElement;
	let closeControlsButton = $state<HTMLButtonElement>();
	let saveButton: HTMLButtonElement;
	let replayButton: HTMLButtonElement;
	let firstSave = $state<HTMLButtonElement>();
	let postLink: HTMLAnchorElement;

	let scene: ReturnType<typeof generateScene>;
	let brushwork: Brushwork;
	let painting: Painting | undefined;
	let frame: Frame | undefined;
	let timeline: PaintingTimeline | undefined;
	let animation = 0;
	let renderRequest = 0;
	let settleTimer = 0;
	let generation = 0;
	let lastFrame = 0;
	let hasPreview = false;
	let motion: MediaQueryList;
	let mounted = false;
	let cancelExport: (() => void) | undefined;

	function noMotion() {
		return motion.matches || document.documentElement.dataset.motion === 'still';
	}

	function persist() {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ version: VERSION, settings: committed, aspect, frame })
			);
		} catch {
			// The studio also works with browser storage disabled.
		}
	}

	function measure(preview = false) {
		const availableWidth = stage.clientWidth;
		const availableHeight = stage.clientHeight;
		if (!availableWidth || !availableHeight) return false;
		aspect =
			settings.view === 'landscape'
				? 1.5
				: settings.view === 'portrait'
					? 0.75
					: availableWidth / availableHeight;
		imageWidth = Math.min(availableWidth, availableHeight * aspect);
		imageHeight = imageWidth / aspect;
		const scale = Math.min(
			window.devicePixelRatio || 1,
			preview ? 0.75 : 1.65,
			(preview ? 900 : 1920) / Math.max(imageWidth, imageHeight)
		);
		canvas.width = Math.max(1, Math.round(imageWidth * scale));
		canvas.height = Math.max(1, Math.round(imageHeight * scale));
		frame = framePainting(scene, aspect);
		return true;
	}

	function draw(preview = false) {
		if (!painting || !measure(preview) || !frame) return;
		if (mode === 'still') {
			timeline = undefined;
			renderPainting(canvas, painting, frame);
		} else {
			timeline = new PaintingTimeline(canvas, painting, frame);
			timeline.draw(progress);
		}
		hasPreview = preview;
		ready = true;
	}

	function setProgress(value: number) {
		progress = value;
		percent = Math.round(progress * 100);
	}

	function animationFrame(now: number) {
		animation = 0;
		if (mode !== 'playing' || document.hidden) return;
		if (lastFrame) {
			setProgress(Math.min(1, progress + (now - lastFrame) / (settings.seconds * 1000)));
		}
		lastFrame = now;
		timeline?.draw(progress);
		if (progress < 1) animation = requestAnimationFrame(animationFrame);
		else {
			endPlayback();
		}
	}

	function stopClock() {
		cancelAnimationFrame(animation);
		animation = 0;
		lastFrame = 0;
	}

	function startClock() {
		stopClock();
		if (!document.hidden) animation = requestAnimationFrame(animationFrame);
	}

	function cancelPending() {
		generation += 1;
		cancelAnimationFrame(renderRequest);
		clearTimeout(settleTimer);
	}

	function still() {
		stopClock();
		mode = 'still';
		setProgress(1);
	}

	function loadScene(animate: boolean) {
		cancelPending();
		stopClock();
		scene = generateScene(settings.family, settings.seed);
		description = scene.description;
		brushwork = prepareBrushwork(scene);
		painting = buildPainting(brushwork, settings);
		mode = animate ? 'playing' : 'still';
		setProgress(animate ? 0 : 1);
		draw();
		if (animate) startClock();
		persist();
	}

	function newPainting() {
		const random = crypto.getRandomValues(new Uint32Array(1))[0];
		const seed = `${settings.family}-${random.toString(36)}`;
		commit({ ...settings, seed });
		loadScene(!noMotion());
	}

	function replay() {
		cancelPending();
		stopClock();
		painting = buildPainting(brushwork, settings);
		setProgress(0);
		mode = 'playing';
		draw();
		startClock();
	}

	function finish() {
		stopClock();
		timeline?.draw(1);
		endPlayback();
	}

	function endPlayback() {
		const restoreFocus = document.activeElement?.hasAttribute('data-during-playback');
		still();
		timeline = undefined;
		if (restoreFocus) void tick().then(() => replayButton?.focus({ preventScroll: true }));
	}

	function pauseOrResume() {
		if (mode === 'playing') {
			stopClock();
			mode = 'paused';
		} else {
			mode = 'playing';
			startClock();
		}
	}

	function schedulePaint() {
		still();
		cancelPending();
		const id = generation;
		renderRequest = requestAnimationFrame(() => {
			if (id !== generation || document.hidden) return;
			painting = buildPainting(brushwork, settings, true);
			draw(true);
		});
		settleTimer = window.setTimeout(() => {
			if (id !== generation || document.hidden) return;
			cancelAnimationFrame(renderRequest);
			painting = buildPainting(brushwork, settings);
			draw();
		}, 135);
	}

	function commit(next: StudioState = { ...settings }) {
		if (stateQuery(next) === stateQuery(committed)) return;
		history = [...history.slice(-11), committed];
		if (next.seed !== committed.seed || next.family !== committed.family) {
			seedEntry = next.seed;
			seedError = '';
		}
		settings = next;
		committed = { ...next };
		persist();
		syncSharedState();
	}

	function changeScene(family: SceneFamily) {
		if (settings.family === family) return;
		commit({ ...settings, family });
		loadScene(!noMotion());
	}

	function changeValue(key: PaintKey, value: number) {
		settings[key] = value;
		if (key !== 'seconds') schedulePaint();
	}

	function useSeed(event: SubmitEvent) {
		event.preventDefault();
		const seed = seedEntry.trim();
		if (!validSeed(seed)) {
			seedError = 'Use 1–36 letters, numbers, hyphens, or underscores.';
			return;
		}
		seedError = '';
		if (seed === settings.seed) return;
		commit({ ...settings, seed });
		loadScene(!noMotion());
	}

	function restore(next: StudioState) {
		const otherScene = settings.family !== next.family || settings.seed !== next.seed;
		const otherPaint =
			controls.some(({ key }) => settings[key] !== next[key]) || settings.texture !== next.texture;
		settings = { ...next };
		seedEntry = next.seed;
		seedError = '';
		if (otherScene) loadScene(false);
		else if (otherPaint) schedulePaint();
		persist();
		syncSharedState();
	}

	function undo() {
		const previous = history.at(-1);
		if (!previous) return;
		history = history.slice(0, -1);
		committed = previous;
		restore(previous);
		status = 'Previous settings restored.';
	}

	function reset() {
		const next = { ...settings, ...DEFAULT_PAINT };
		if (stateQuery(next) === stateQuery(committed)) return;
		history = [...history.slice(-11), committed];
		committed = { ...next };
		restore(next);
		status = 'Paint settings reset.';
	}

	async function togglePanel() {
		open = !open;
		await tick();
		if (open) closeControlsButton?.focus();
		else toggleControls.focus();
	}

	async function toggleSave() {
		saveOpen = !saveOpen;
		await tick();
		if (saveOpen) firstSave?.focus();
		else saveButton.focus();
	}

	function shortcuts(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (saveOpen) {
			event.preventDefault();
			void toggleSave();
		} else if (open && (event.target as HTMLElement | null)?.closest('.controls')) {
			event.preventDefault();
			void togglePanel();
		}
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement === studio) await document.exitFullscreen();
			else await studio.requestFullscreen();
		} catch {
			status = 'Fullscreen is unavailable. The painting still fills the browser window.';
		}
	}

	function leaveForArticle() {
		const url = new URL(location.href);
		url.search = `${stateQuery(settings, true)}&focus=post`;
		replaceState(url, page.state);
	}

	function syncSharedState() {
		const url = new URL(location.href);
		if (!stateFromQuery(url.searchParams)) return;
		for (const [key, value] of new URLSearchParams(stateQuery(committed))) {
			url.searchParams.set(key, value);
		}
		replaceState(url, page.state);
	}

	async function saveOnMainThread(model: Painting, crop: Frame, width: number, height: number) {
		const output = document.createElement('canvas');
		output.width = width;
		output.height = height;
		const resume = mode === 'playing';
		try {
			if (resume) stopClock();
			try {
				renderPainting(output, model, crop);
			} finally {
				if (resume) startClock();
			}
			return await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
		} finally {
			output.width = 1;
			output.height = 1;
		}
	}

	async function saveImage(longSide: number) {
		if (saving || !frame) return;
		const snapshot = { ...settings };
		const crop = frame;
		const work = brushwork;
		const { width, height } = outputSize(aspect, longSide);
		saving = true;
		status = `Preparing ${width} × ${height} PNG…`;
		try {
			const job = startExport({
				family: snapshot.family,
				seed: snapshot.seed,
				settings: snapshot,
				frame: crop,
				width,
				height
			});
			cancelExport = job?.cancel;
			let blob = await job?.result.catch(() => undefined);
			if (!mounted) return;
			if (!blob) {
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
				if (!mounted) return;
				blob =
					(await saveOnMainThread(buildPainting(work, snapshot), crop, width, height)) ?? undefined;
			}
			if (!mounted) return;
			if (!blob) throw new Error('Image encoding failed.');
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `bengali-${snapshot.family}-${snapshot.seed}-${width}x${height}.png`;
			link.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
			status = `Saved ${width} × ${height} PNG.`;
			if (saveOpen) void toggleSave();
		} catch {
			const smaller = outputSize(aspect, 1024);
			status = `This device could not save that size. Try ${smaller.width} × ${smaller.height}.`;
			if (!saveOpen) void toggleSave();
		} finally {
			cancelExport = undefined;
			saving = false;
		}
	}

	afterNavigate(({ to }) => {
		if (to?.url.searchParams.get('focus') === 'post') postLink?.focus({ preventScroll: true });
	});

	onMount(() => {
		mounted = true;
		motion = matchMedia('(prefers-reduced-motion: reduce)');
		const query = new URLSearchParams(location.search);
		let stored: StudioState | undefined;
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
			if (saved?.version === VERSION) stored = readState(saved.settings);
		} catch {
			// Ignore malformed storage and use the opening composition.
		}
		settings = stateFromQuery(query) ?? stored ?? { ...DEFAULT_STATE };
		committed = { ...settings };
		seedEntry = settings.seed;
		open = !matchMedia('(max-width: 760px), (max-height: 540px)').matches;
		canFullscreen = Boolean(document.fullscreenEnabled && studio.requestFullscreen);
		if (!canvas.getContext('2d')) {
			unavailable = true;
			return;
		}
		const resize = new ResizeObserver(() => {
			if (!ready || document.hidden) return;
			draw(hasPreview);
			persist();
		});
		resize.observe(stage);
		const visibility = () => {
			if (document.hidden) {
				stopClock();
				cancelPending();
			} else if (mode === 'playing') {
				draw();
				startClock();
			} else {
				painting = buildPainting(brushwork, settings);
				draw();
			}
		};
		const motionChange = () => {
			if (noMotion() && mode !== 'still') finish();
		};
		const motionObserver = new MutationObserver(motionChange);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		const fullscreenChange = () => (fullscreen = document.fullscreenElement === studio);
		document.addEventListener('visibilitychange', visibility);
		document.addEventListener('fullscreenchange', fullscreenChange);
		motion.addEventListener('change', motionChange);
		const resumed = query.get('resume') === '1';
		loadScene(!resumed && !noMotion());
		return () => {
			mounted = false;
			cancelExport?.();
			cancelPending();
			stopClock();
			resize.disconnect();
			motionObserver.disconnect();
			document.removeEventListener('visibilitychange', visibility);
			document.removeEventListener('fullscreenchange', fullscreenChange);
			motion.removeEventListener('change', motionChange);
		};
	});
</script>

<svelte:window onkeydown={shortcuts} />

<section
	class="painting-studio not-prose"
	class:with-controls={open}
	bind:this={studio}
	aria-label="Painting studio"
>
	<div
		class="stage"
		bind:this={stage}
		role="img"
		aria-label={ready ? description : openingDescription}
	>
		<img
			class:concealed={ready}
			src="/images/visualizations/bengali-impressionism/street-fine.webp"
			alt=""
		/>
		<canvas
			bind:this={canvas}
			class:concealed={!ready}
			style:width={imageWidth ? `${imageWidth}px` : '100%'}
			style:height={imageHeight ? `${imageHeight}px` : '100%'}
			aria-hidden="true"
			data-seed={settings.seed}
			data-scene={settings.family}
			data-playback={mode}>{description}</canvas
		>
	</div>

	<header class="masthead">
		<div>
			<h1>{title}</h1>
			<p>Choose a scene. Change the brushwork and light.</p>
		</div>
		<nav class="masthead-links" aria-label="Painting links">
			<a
				bind:this={postLink}
				class="post-link"
				href={`${ARTICLE_PATH}?${stateQuery(settings, true)}`}
				onclick={leaveForArticle}>Read the post <span aria-hidden="true">↗</span></a
			>
			<button class="privacy-link" data-privacy-settings onclick={openPrivacySettings}
				>Privacy &amp; cookies</button
			>
		</nav>
	</header>

	{#if unavailable}
		<p class="canvas-message">
			This browser could not start the canvas. You can still read the post.
		</p>
	{/if}

	<div class="interface">
		{#if saveOpen}
			<section class="save-panel" aria-label="PNG image sizes">
				<p>Save the finished painting as a PNG.</p>
				{#each [2048, 4096, 1024] as size, i (size)}
					{@const dimensions = outputSize(aspect, size)}
					{#if i === 0}
						<button bind:this={firstSave} disabled={saving} onclick={() => saveImage(size)}
							>{dimensions.width} × {dimensions.height}</button
						>
					{:else}
						<button disabled={saving} onclick={() => saveImage(size)}
							>{dimensions.width} × {dimensions.height}</button
						>
					{/if}
				{/each}
				<button onclick={toggleSave}>Close</button>
			</section>
		{/if}
		{#if status}
			<p class="notice" role="status">{status}</p>
		{/if}

		{#if open}
			<section class="controls" id="paint-controls" aria-label="Paint controls">
				<div class="controls-header">
					<p>Brushwork &amp; light</p>
					<div class="panel-actions">
						<button disabled={!history.length} onclick={undo}>Undo</button>
						<button
							disabled={!ready}
							aria-expanded={more}
							aria-controls={more ? 'paint-options' : undefined}
							onclick={() => (more = !more)}>More settings</button
						>
						<button
							bind:this={closeControlsButton}
							aria-label="Close controls"
							onclick={togglePanel}>Close</button
						>
					</div>
				</div>
				<div class="sliders">
					{#each controls as control (control.key)}
						<div class="slider">
							<div class="slider-label">
								<label for={control.key}>{control.label}</label>
								<span>{settings[control.key]}%</span>
							</div>
							<input
								id={control.key}
								type="range"
								min="0"
								max="100"
								value={settings[control.key]}
								aria-valuetext={`${settings[control.key]} percent`}
								aria-describedby={`${control.key}-hint`}
								style:--amount={`${settings[control.key]}%`}
								disabled={!ready}
								oninput={(event) => changeValue(control.key, event.currentTarget.valueAsNumber)}
								onchange={() => commit()}
							/>
							<div class="range-labels" aria-hidden="true">
								<span>{control.low}</span><span>{control.high}</span>
							</div>
							<p id={`${control.key}-hint`}>{control.hint}</p>
						</div>
					{/each}
				</div>
				{#if more}
					<div class="more" id="paint-options">
						<div class="slider">
							<div class="slider-label">
								<label for="paint-texture">Paint texture</label><span>{settings.texture}%</span>
							</div>
							<input
								id="paint-texture"
								type="range"
								min="0"
								max="100"
								value={settings.texture}
								aria-valuetext={`${settings.texture} percent`}
								style:--amount={`${settings.texture}%`}
								oninput={(event) => changeValue('texture', event.currentTarget.valueAsNumber)}
								onchange={() => commit()}
							/>
						</div>
						<div class="slider">
							<div class="slider-label">
								<label for="painting-time">Painting time</label><span>{settings.seconds} s</span>
							</div>
							<input
								id="painting-time"
								type="range"
								min="4"
								max="20"
								value={settings.seconds}
								aria-valuetext={`${settings.seconds} seconds`}
								style:--amount={`${(settings.seconds - 4) * 6.25}%`}
								oninput={(event) => changeValue('seconds', event.currentTarget.valueAsNumber)}
								onchange={() => commit()}
							/>
						</div>
						<form class="seed" onsubmit={useSeed}>
							<label for="painting-seed">Seed</label>
							<div>
								<input
									id="painting-seed"
									type="text"
									maxlength="36"
									spellcheck="false"
									bind:value={seedEntry}
									aria-invalid={Boolean(seedError)}
									aria-describedby={seedError ? 'seed-error' : undefined}
								/>
								<button type="submit" disabled={!ready}>Apply</button>
							</div>
							{#if seedError}<p id="seed-error" role="alert">{seedError}</p>{/if}
						</form>
						<button class="reset" onclick={reset}>Reset settings</button>
					</div>
				{/if}
			</section>
		{/if}

		<div class="toolbar">
			{#if mode !== 'still'}
				<progress max="100" value={percent} aria-label="Painting progress"></progress>
			{/if}
			<div class="subject">
				<label for="painting-scene">Scene</label>
				<select
					id="painting-scene"
					value={settings.family}
					disabled={!ready}
					onchange={(event) => changeScene(event.currentTarget.value as SceneFamily)}
				>
					{#each Object.entries(SCENES) as [key, label] (key)}
						<option value={key}>{label}</option>
					{/each}
				</select>
			</div>
			<div class="transport" role="group" aria-label="Painting playback">
				<button class="primary" disabled={!ready} onclick={newPainting}
					><span aria-hidden="true">＋</span> New painting</button
				>
				<button bind:this={replayButton} disabled={!ready} onclick={replay}
					><span aria-hidden="true">↻</span> Replay</button
				>
				{#if mode !== 'still'}
					<button data-during-playback onclick={pauseOrResume}
						>{mode === 'playing' ? 'Pause' : 'Resume'}</button
					>
					<button data-during-playback onclick={finish}>Finish now</button>
				{/if}
			</div>
			<div class="view-actions" role="group" aria-label="Painting controls and export">
				<button
					bind:this={toggleControls}
					disabled={!ready}
					aria-expanded={open}
					aria-controls={open ? 'paint-controls' : undefined}
					onclick={togglePanel}>Controls</button
				>
				<button
					bind:this={saveButton}
					disabled={!ready}
					aria-expanded={saveOpen}
					onclick={toggleSave}>Save image</button
				>
				<button disabled={!canFullscreen} onclick={toggleFullscreen}
					>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button
				>
			</div>
		</div>
	</div>
</section>

<style>
	.painting-studio {
		--cream: #f4ecd9;
		--muted: #c7bcaa;
		--dark: #25251f;
		--line: #5d5749;
		--accent: #ebbd79;
		position: relative;
		isolation: isolate;
		width: 100%;
		height: 100dvh;
		min-height: 215px;
		overflow: hidden;
		background: #27241d;
		color: var(--cream);
		color-scheme: dark;
		font:
			0.875rem/1.35 'Roboto Variable',
			Arial,
			sans-serif;
	}

	.stage {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		overflow: hidden;
	}

	.stage img,
	.stage canvas {
		position: absolute;
		display: block;
		margin: 0;
		border: 0;
		border-radius: 0;
	}

	.stage img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.stage .concealed {
		visibility: hidden;
	}

	.masthead {
		position: absolute;
		inset: max(16px, env(safe-area-inset-top)) max(22px, env(safe-area-inset-right)) auto
			max(22px, env(safe-area-inset-left));
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		pointer-events: none;
	}

	.masthead > div,
	.post-link,
	.toolbar,
	.controls,
	.save-panel,
	.notice,
	.canvas-message {
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--dark);
		box-shadow: 0 3px 18px #17130b38;
	}

	.masthead > div {
		padding: 12px 19px 14px;
	}
	.masthead h1 {
		margin: 0;
		max-inline-size: 24ch;
		font:
			550 clamp(1.42rem, 3vw, 2.6rem)/0.99 'Source Serif 4 Variable',
			Georgia,
			serif;
		letter-spacing: -0.035em;
		color: var(--cream);
		text-wrap: balance;
	}

	.masthead p {
		margin: 8px 0 0;
		color: var(--muted);
	}
	.post-link {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-height: 44px;
		padding: 0 13px;
		color: var(--cream);
		text-decoration: none;
		white-space: nowrap;
	}

	.post-link:hover {
		background: #3d382d;
	}
	.masthead-links {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 5px;
	}
	button.privacy-link {
		pointer-events: auto;
		min-height: 44px;
		padding-inline: 9px;
		font-size: 0.72rem;
		background: var(--dark);
	}

	.interface {
		position: absolute;
		inset: auto max(22px, env(safe-area-inset-right)) max(17px, env(safe-area-inset-bottom))
			max(22px, env(safe-area-inset-left));
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		width: min(1100px, calc(100% - 44px));
		margin-inline: auto;
		pointer-events: none;
	}

	.interface > * {
		pointer-events: auto;
	}

	.toolbar {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		padding: 7px 10px;
	}

	.toolbar progress {
		position: absolute;
		top: -1px;
		left: 0;
		width: 100%;
		height: 3px;
		border: 0;
		border-radius: 5px 5px 0 0;
		overflow: hidden;
		accent-color: var(--accent);
		background: #655a48;
	}

	progress::-webkit-progress-bar {
		background: #655a48;
	}
	progress::-webkit-progress-value {
		background: var(--accent);
	}
	progress::-moz-progress-bar {
		background: var(--accent);
	}

	.subject,
	.transport,
	.view-actions,
	.panel-actions {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.subject {
		gap: 8px;
	}
	.subject label {
		color: var(--muted);
		font-weight: 550;
	}
	.view-actions {
		margin-left: auto;
	}

	button,
	select,
	input[type='text'] {
		min-height: 44px;
		max-width: 100%;
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0 9px;
		font: inherit;
		color: var(--cream);
		background: #312e25;
	}

	button {
		cursor: pointer;
		white-space: nowrap;
	}
	button:hover:not(:disabled),
	select:hover:not(:disabled) {
		background: #4b4233;
	}
	button:disabled,
	select:disabled {
		opacity: 0.52;
		cursor: default;
	}
	button.primary {
		color: #251d13;
		background: var(--accent);
		border-color: var(--accent);
		font-weight: 700;
	}
	button.primary:hover:not(:disabled) {
		background: #f3d39f;
	}
	button:focus-visible,
	select:focus-visible,
	input:focus-visible,
	a:focus-visible {
		outline: 2px solid #ffd38d;
		outline-offset: 3px;
	}

	.controls {
		max-height: min(50dvh, 380px);
		overflow: auto;
		overscroll-behavior: contain;
		scrollbar-color: #8b7962 var(--dark);
	}

	.controls-header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 5px 12px;
		padding: 5px 11px 5px 15px;
		border-bottom: 1px solid var(--line);
		background: var(--dark);
	}

	.controls-header > p {
		margin: 0;
		font-weight: 650;
	}
	.panel-actions > button {
		background: transparent;
		border-color: transparent;
	}
	.panel-actions > button:hover:not(:disabled) {
		border-color: var(--line);
	}
	.sliders,
	.more {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
		padding: 9px 12px 11px;
	}

	.slider {
		padding-inline: 5px;
		min-width: 0;
	}
	.slider-label,
	.range-labels {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px;
	}
	.slider-label label {
		font-weight: 650;
	}
	.slider-label span {
		color: var(--accent);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.range-labels,
	.slider p {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.slider p {
		margin: 4px 0 0;
	}
	.slider input {
		appearance: none;
		display: block;
		height: 30px;
		width: 100%;
		margin: 0;
		background: transparent;
		cursor: pointer;
	}

	.slider input::-webkit-slider-runnable-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--accent) var(--amount), #6b6254 var(--amount));
	}
	.slider input::-moz-range-track {
		height: 4px;
		border-radius: 2px;
		background: linear-gradient(to right, var(--accent) var(--amount), #6b6254 var(--amount));
	}
	.slider input::-webkit-slider-thumb {
		appearance: none;
		width: 15px;
		height: 15px;
		margin-top: -5.5px;
		border: 1px solid #4b3624;
		border-radius: 50%;
		background: #f8d29b;
	}
	.slider input::-moz-range-thumb {
		width: 15px;
		height: 15px;
		border: 1px solid #4b3624;
		border-radius: 50%;
		background: #f8d29b;
	}

	.more {
		border-top: 1px solid var(--line);
		align-items: start;
	}
	.seed {
		min-width: 0;
		margin: 0;
	}
	.seed label {
		display: block;
		margin: 0 0 3px;
		font-weight: 650;
	}
	.seed div {
		display: flex;
		gap: 4px;
	}
	.seed input {
		width: 100%;
		min-width: 0;
	}
	.seed p {
		margin: 5px 0 0;
		color: #ffcc9a;
	}
	.reset {
		justify-self: end;
	}

	.save-panel,
	.notice {
		align-self: flex-end;
		max-width: 100%;
		padding: 8px;
	}

	.save-panel p {
		margin: 0 0 6px;
	}
	.notice {
		margin: 0;
	}
	.canvas-message {
		position: absolute;
		inset: 45% 12px auto;
		width: fit-content;
		margin: auto;
		padding: 10px;
	}

	@media (max-width: 980px) {
		.toolbar {
			justify-content: space-between;
		}
		.view-actions {
			margin-left: 0;
		}
	}

	@media (min-width: 761px) {
		.controls {
			align-self: flex-end;
			width: min(365px, 100%);
		}

		.sliders,
		.more {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.masthead {
			inset: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) auto
				max(8px, env(safe-area-inset-left));
		}
		.masthead > div {
			padding: 9px 10px;
		}
		.masthead h1 {
			font-size: clamp(1.13rem, 4vw, 1.7rem);
		}
		.masthead p {
			display: none;
		}
		.post-link {
			font-size: 0.79rem;
			padding-inline: 8px;
		}
		.interface {
			inset: auto max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom))
				max(8px, env(safe-area-inset-left));
			width: auto;
			gap: 5px;
		}
		.toolbar {
			gap: 4px;
			padding: 5px;
		}
		.toolbar button,
		.toolbar select {
			padding-inline: 6px;
		}
		.subject select {
			min-width: 0;
		}
		.controls {
			max-height: min(37dvh, 305px);
		}
		.sliders,
		.more {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.slider input {
			height: 44px;
		}
		.slider p {
			margin-top: 2px;
		}
	}

	@media (max-width: 465px) {
		.toolbar {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			font-size: 0.78rem;
		}
		.subject {
			grid-column: 1 / -1;
		}
		.subject select {
			flex: 1;
		}
		.transport,
		.view-actions {
			grid-column: 1 / -1;
			flex-wrap: wrap;
		}
		.transport > button,
		.view-actions > button {
			flex: 1;
		}
		.controls-header {
			padding-inline: 8px 3px;
			font-size: 0.77rem;
		}
		.panel-actions {
			gap: 0;
		}
		.panel-actions button {
			padding-inline: 5px;
		}
		.save-panel {
			font-size: 0.75rem;
		}
		.save-panel button {
			padding-inline: 5px;
		}
	}

	@media (max-width: 760px) and (min-height: 541px) {
		.painting-studio.with-controls {
			display: flex;
			flex-direction: column;
		}

		.with-controls .stage {
			position: relative;
			inset: auto;
			flex: 1 1 0;
			min-height: 110px;
		}

		.with-controls .interface {
			position: relative;
			inset: auto;
			flex: none;
			margin: 0 max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom))
				max(8px, env(safe-area-inset-left));
		}
	}

	@media (max-height: 540px) and (min-width: 466px) {
		.masthead > div {
			padding: 8px 11px;
		}
		.masthead h1 {
			font-size: 1.3rem;
		}
		.masthead p {
			display: none;
		}
		.controls {
			max-height: 38dvh;
		}
	}

	@media (forced-colors: active) {
		.slider input {
			appearance: auto;
		}
	}
</style>
