<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DEFAULT_STATE,
		WORLDS,
		PALETTES,
		PRESETS,
		normalizeState,
		encodeState,
		decodeState,
		surpriseState,
		framingRatio,
		type DesignState,
		type WorldId,
		type Framing
	} from '$lib/visualizations/strange-matter/model';
	import type { createStrangeRenderer } from '$lib/visualizations/strange-matter/renderer';

	let design = $state<DesignState>(structuredClone(DEFAULT_STATE));
	let studio: HTMLElement;
	let canvas: HTMLCanvasElement;
	let engine: ReturnType<typeof createStrangeRenderer> | undefined;
	let ready = $state(false);
	let error = $state('');
	let playing = $state(true);
	let quality = $state('STUDIO QUALITY');
	let history = $state<DesignState[]>([]);
	let status = $state('');
	let presentation = $state(false);
	let mobileControls = $state(false);
	let exportOpen = $state(false);
	let exporting = $state(false);
	let recording = $state(false);
	let recordSeconds = $state(0);
	let recordingType = $state('');
	let shareLink = $state('');
	let recorder: MediaRecorder | undefined;
	let recordTimer: ReturnType<typeof setTimeout> | undefined;
	let recordTicker: ReturnType<typeof setInterval> | undefined;
	let messageTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	let recordPreviousPlaying = true;
	let recordingStream: MediaStream | undefined;
	let recordingFailure = '';
	let world = $derived(WORLDS.find((item) => item.id === design.world) ?? WORLDS[0]);
	let palette = $derived(PALETTES.find((item) => item.id === design.palette) ?? PALETTES[0]);
	let presets = $derived(PRESETS.filter((preset) => preset.state.world === design.world));
	let ratio = $derived(framingRatio(design.framing));
	const controls = [
		{ id: 'shape', label: 'Shape', hint: 'Find a new silhouette' },
		{ id: 'energy', label: 'Energy', hint: 'From stillness to strange' },
		{ id: 'detail', label: 'Detail', hint: 'More layers to get lost in' },
		{ id: 'glow', label: 'Glow', hint: 'A little light goes a long way' },
		{ id: 'speed', label: 'Speed', hint: 'Set your own pace' }
	] as const;
	const framings: { id: Framing; label: string; ratio: string }[] = [
		{ id: 'landscape', label: 'Landscape', ratio: '16:10' },
		{ id: 'square', label: 'Square', ratio: '1:1' },
		{ id: 'portrait', label: 'Portrait', ratio: '4:5' }
	];

	function announce(message: string) {
		if (disposed) return;
		status = message;
		clearTimeout(messageTimer);
		messageTimer = setTimeout(() => {
			if (!disposed) status = '';
		}, 4500);
	}
	function snapshot(): DesignState {
		return normalizeState({ ...design, ...(engine?.snapshot() ?? {}) });
	}
	function remember() {
		if (recording || exporting) return;
		history = [...history.slice(-29), snapshot()];
	}
	function apply(next: DesignState, save = true, restore = false) {
		if (recording || exporting) return;
		if (save) remember();
		design = normalizeState(next);
		engine?.update(design, restore);
		shareLink = '';
	}
	function selectWorld(id: WorldId) {
		if (id === design.world) return;
		const preset = PRESETS.find((item) => item.state.world === id);
		if (preset) apply({ ...preset.state, framing: design.framing }, true, true);
	}
	function surprise() {
		apply(surpriseState(snapshot()), true, true);
		announce('A beautiful accident. Keep exploring.');
	}
	function undo() {
		const previous = history.at(-1);
		if (!previous || recording || exporting) return;
		history = history.slice(0, -1);
		apply(previous, false, true);
		announce('Back to your previous creation.');
	}
	function setPlaying(value: boolean) {
		if (recording || exporting) return;
		playing = value;
		engine?.setPlaying(value);
	}
	function slider(id: (typeof controls)[number]['id'], event: Event) {
		apply({ ...design, [id]: Number((event.currentTarget as HTMLInputElement).value) }, false);
	}
	function resetCamera() {
		remember();
		engine?.resetCamera();
		announce('Camera recentred.');
	}
	async function fullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await studio.requestFullscreen();
		} catch {
			announce('Fullscreen is unavailable here. Use the clean view to focus on your artwork.');
		}
	}
	function cleanView() {
		if (recording || exporting) return;
		presentation = !presentation;
		exportOpen = false;
		canvas.focus({ preventScroll: true });
	}
	async function share() {
		const url = new URL(window.location.href);
		url.searchParams.set('art', encodeState(snapshot()));
		url.hash = 'strange-matter';
		shareLink = url.toString();
		try {
			await navigator.clipboard.writeText(shareLink);
			announce('Link copied. Your sculpture, colours and camera travel with it.');
		} catch {
			announce('Your artwork link is ready below. Select and copy it.');
		}
	}
	function download(
		blob: Blob,
		extension: string,
		filename = `strange-matter-${design.world}-${design.seed}`
	) {
		if (disposed) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${filename}.${extension}`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 20_000);
	}
	async function exportPNG(highResolution: boolean) {
		if (!engine || !ready || exporting || recording) return;
		const filename = `strange-matter-${design.world}-${design.seed}`;
		exporting = true;
		try {
			const longEdge = highResolution ? 2560 : 1600;
			const width = Math.round(ratio >= 1 ? longEdge : longEdge * ratio);
			const height = Math.round(ratio >= 1 ? longEdge / ratio : longEdge);
			const blob = await engine.capture(width, height);
			download(blob, 'png', filename);
			announce(`Artwork saved · ${width} × ${height} PNG`);
		} catch (cause) {
			announce(
				cause instanceof Error
					? cause.message
					: 'Image export could not finish. Try the standard resolution.'
			);
		} finally {
			if (!disposed) exporting = false;
		}
	}
	function finishRecording() {
		if (recorder?.state !== 'inactive') recorder?.stop();
	}
	function record() {
		if (!engine || !ready || !recordingType || recording || exporting) return;
		recordingFailure = '';
		const filename = `strange-matter-${design.world}-${design.seed}`;
		try {
			recordingStream = canvas.captureStream(30);
			recorder = new MediaRecorder(recordingStream, {
				mimeType: recordingType,
				videoBitsPerSecond: 8_000_000
			});
			const chunks: BlobPart[] = [];
			let failed = false;
			recorder.ondataavailable = (event) => {
				if (event.data.size) chunks.push(event.data);
			};
			recorder.onstop = () => {
				clearTimeout(recordTimer);
				clearInterval(recordTicker);
				recordingStream?.getTracks().forEach((track) => track.stop());
				recordingStream = undefined;
				if (!disposed) {
					if (chunks.length && !failed && !recordingFailure) {
						download(
							new Blob(chunks, { type: recordingType }),
							recordingType.startsWith('video/mp4') ? 'mp4' : 'webm',
							filename
						);
						announce('A little piece of strange, saved in motion.');
					} else
						announce(
							recordingFailure || 'The browser did not produce a recording. Try saving a PNG.'
						);
					recording = false;
					playing = recordPreviousPlaying;
					engine?.setPlaying(playing);
				}
			};
			recorder.onerror = () => {
				failed = true;
				finishRecording();
			};
			recordPreviousPlaying = playing;
			engine.setPlaying(true);
			recorder.start();
			recording = true;
			recordSeconds = 0;
			recordTicker = setInterval(() => {
				recordSeconds = Math.min(8, recordSeconds + 1);
			}, 1000);
			recordTimer = setTimeout(finishRecording, 8000);
		} catch {
			recordingStream?.getTracks().forEach((track) => track.stop());
			recordingStream = undefined;
			engine?.setPlaying(playing);
			announce(
				'Recording is unavailable in this browser. Your artwork can still be saved as a PNG.'
			);
		}
	}
	function keyboard(event: KeyboardEvent) {
		if (!studio?.contains(event.target as Node)) return;
		if (event.key === 'Escape') {
			presentation = false;
			exportOpen = false;
			return;
		}
		if (recording || exporting) return;
		const target = event.target as HTMLElement;
		if (
			target.closest('input,select,textarea,button') ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey
		)
			return;
		if (event.code === 'Space') {
			event.preventDefault();
			setPlaying(!playing);
		}
		if (event.key.toLowerCase() === 'r') surprise();
		if (event.key.toLowerCase() === 'h') cleanView();
		if (event.key.toLowerCase() === 'z') undo();
	}
	onMount(() => {
		disposed = false;
		const params = new URL(window.location.href).searchParams;
		design = params.has('art')
			? decodeState(params.get('art'))
			: normalizeState({
					...DEFAULT_STATE,
					framing: window.innerWidth < 760 ? 'square' : 'landscape'
				});
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
		playing = !reduced.matches;
		const motionChange = () => {
			if (reduced.matches) setPlaying(false);
		};
		reduced.addEventListener('change', motionChange);
		let intersecting = true;
		const activity = () => {
			if ((document.hidden || !intersecting) && recording) finishRecording();
			engine?.setActive(!document.hidden && intersecting);
		};
		const observer = new IntersectionObserver((entries) => {
			intersecting = entries[0]?.isIntersecting ?? true;
			activity();
		});
		observer.observe(studio);
		document.addEventListener('visibilitychange', activity);
		if (typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function') {
			recordingType =
				['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((type) =>
					MediaRecorder.isTypeSupported(type)
				) ?? '';
		}
		void import('$lib/visualizations/strange-matter/renderer')
			.then(({ createStrangeRenderer }) => {
				if (disposed) return;
				engine = createStrangeRenderer(canvas, design, {
					onQuality: (label) => {
						quality = label.toUpperCase();
					},
					onError: (message) => {
						error = message;
						ready = false;
						if (recording) {
							recordingFailure =
								'The graphics context was interrupted, so recording was stopped. Reload the studio to restore it.';
							finishRecording();
						}
					}
				});
				engine.setPlaying(playing);
				activity();
				ready = true;
			})
			.catch(() => {
				if (!disposed)
					error =
						'This studio needs WebGL 2. Try a browser with hardware acceleration enabled. You can still explore the artwork and guide below.';
			});
		return () => {
			disposed = true;
			clearTimeout(messageTimer);
			clearTimeout(recordTimer);
			clearInterval(recordTicker);
			if (recorder?.state !== 'inactive') recorder?.stop();
			recordingStream?.getTracks().forEach((track) => track.stop());
			observer.disconnect();
			document.removeEventListener('visibilitychange', activity);
			reduced.removeEventListener('change', motionChange);
			engine?.dispose();
		};
	});
</script>

{#snippet icon(name: string, size = 18)}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if name === 'spark'}<path
				d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"
			/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z" />
		{:else if name === 'pause'}<path d="M9 5v14M15 5v14" />
		{:else if name === 'play'}<path d="m8 5 11 7-11 7Z" />
		{:else if name === 'undo'}<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12" />
		{:else if name === 'camera'}<path d="M3 8h4l2-3h6l2 3h4v12H3Z" /><circle
				cx="12"
				cy="13"
				r="3"
			/>
		{:else if name === 'download'}<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
		{:else if name === 'share'}<path
				d="M9 15 15 9M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"
				transform="translate(1 0) scale(.9)"
			/>
		{:else if name === 'fullscreen'}<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />
		{:else if name === 'eye'}<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle
				cx="12"
				cy="12"
				r="3"
			/>
		{:else if name === 'arrow'}<path d="M4 12h16m-6-6 6 6-6 6" />
		{:else if name === 'close'}<path d="m6 6 12 12M6 18 18 6" />
		{:else if name === 'record'}<circle cx="12" cy="12" r="7" />
		{:else if name === 'settings'}<path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
		{/if}
	</svg>
{/snippet}

{#snippet worldSymbol(id: WorldId)}
	<svg
		class="sm-world-symbol"
		viewBox="0 0 90 68"
		fill="none"
		stroke="currentColor"
		stroke-width=".8"
		aria-hidden="true"
	>
		{#if id === 'liquid'}
			{#each Array(12) as _, i}<ellipse
					cx="45"
					cy="34"
					rx={22 + i * 0.6}
					ry={9 + i * 0.5}
					transform={`rotate(${i * 15} 45 34)`}
				/>{/each}
		{:else if id === 'bloom'}
			{#each Array(13) as _, i}<ellipse
					cx="45"
					cy="23"
					rx="8"
					ry="18"
					transform={`rotate(${(i * 360) / 13} 45 34)`}
				/>{/each}
		{:else if id === 'current'}
			{#each Array(12) as _, i}<path
					d={`M8 ${27 + i * 2}C30 ${-14 + i * 4} 52 ${80 - i * 4} 82 ${25 + i * 2}`}
				/>{/each}
		{:else}
			{#each Array(12) as _, i}<rect
					x={14 + i * 2.6}
					y={5 + i * 2.3}
					width={62 - i * 5.2}
					height={58 - i * 4.6}
					rx="4"
					transform={`rotate(${i * 5} 45 34)`}
				/>{/each}
		{/if}
	</svg>
{/snippet}

<svelte:window onkeydown={keyboard} />

<div
	class:sm-clean={presentation}
	class:sm-mobile-open={mobileControls}
	class="sm-app"
	id="strange-matter"
	bind:this={studio}
	role="group"
	aria-label="Generative sculpture studio"
	data-world={design.world}
	data-ready={ready}
	data-seed={design.seed}
>
	<header class="sm-header">
		<div class="sm-brand">
			<svg viewBox="0 0 40 40" width="35" height="35" fill="none" aria-hidden="true"
				><g stroke="currentColor" stroke-width="1.3"
					>{#each Array(8) as _, i}<ellipse
							cx="20"
							cy="20"
							rx="17"
							ry="6"
							transform={`rotate(${i * 22.5} 20 20)`}
						/>{/each}</g
				></svg
			>
			<h1>STRANGE MATTER<span>A PLAYGROUND FOR BEAUTIFUL ACCIDENTS</span></h1>
		</div>
		<div class="sm-header-tools">
			<span class="sm-live"><i></i> REALTIME / 3D</span><button
				class="sm-icon-button"
				onclick={cleanView}
				disabled={recording || exporting}
				aria-label="Clean presentation view"
				title="Clean view · H">{@render icon('eye')}</button
			><button
				class="sm-icon-button"
				onclick={fullscreen}
				disabled={recording || exporting}
				aria-label="Toggle fullscreen"
				title="Fullscreen">{@render icon('fullscreen')}</button
			>
		</div>
	</header>
	<div class="sm-stage">
		<div class="sm-art-space">
			<div class="sm-art-annotation">
				<span>LET CURIOSITY TAKE SHAPE.</span><span class="sm-cross">+</span>
			</div>
			<div
				class="sm-frame"
				class:sm-frame-portrait={design.framing === 'portrait'}
				class:sm-frame-square={design.framing === 'square'}
				style:aspect-ratio={ratio}
				style={`--sm-ratio:${ratio}`}
			>
				<canvas
					bind:this={canvas}
					aria-label={`${world.name}, a rotating generative 3D sculpture. Drag to orbit, scroll or pinch to zoom. Arrow keys orbit and plus or minus zoom when the canvas is focused.`}
					tabindex="0"
				></canvas>
				{#if !ready}<div class="sm-canvas-fallback">
						<img
							src="/images/visualizations/strange-matter/poster.png"
							alt="An iridescent liquid sculpture in a dark studio"
							width="1200"
							height="750"
						/>
						<p role={error ? 'alert' : 'status'}>
							{error || 'Finding a little order in the chaos…'}
						</p>
					</div>{/if}
				{#if recording}<span class="sm-recording"><i></i> RECORDING {recordSeconds} / 8s</span>{/if}
			</div>
			<div class="sm-art-caption">
				<div>
					<span class="sm-overline">WORLD {world.number} / GENERATIVE SCULPTURE</span>
					<h2>{world.name}<span>↗</span></h2>
					<p>{world.subtitle}</p>
				</div>
				<span class="sm-seed"
					>EDITION<br /><strong>#{String(design.seed).padStart(6, '0')}</strong></span
				>
			</div>
			<div class="sm-canvas-tools">
				<span>DRAG TO ORBIT <b>·</b> SCROLL TO EXPLORE</span>
				<div>
					<button
						class="sm-icon-button"
						onclick={() => setPlaying(!playing)}
						disabled={!ready || recording || exporting}
						aria-label={playing ? 'Pause animation' : 'Play animation'}
						title="Play / pause · Space">{@render icon(playing ? 'pause' : 'play', 16)}</button
					><button
						class="sm-icon-button"
						onclick={resetCamera}
						disabled={!ready || recording || exporting}
						aria-label="Reset camera"
						title="Reset camera">{@render icon('camera', 16)}</button
					><button
						class="sm-icon-button"
						onclick={undo}
						disabled={!history.length || recording || exporting}
						aria-label="Undo last change"
						title="Undo · Z">{@render icon('undo', 16)}</button
					>
				</div>
			</div>
		</div>
		<aside class="sm-controls" aria-label="Artwork controls">
			<button
				class="sm-mobile-toggle"
				onclick={() => (mobileControls = !mobileControls)}
				aria-expanded={mobileControls}
				>{@render icon('settings')} Shape your strange
				<span>{mobileControls ? '−' : '+'}</span></button
			>
			<div class="sm-control-content">
				<div class="sm-panel-heading">
					<span>YOUR CURIOSITY. YOUR RULES.</span>
					<h2>Make it <em>yours.</em></h2>
				</div>
				<fieldset disabled={!ready || recording || exporting}>
					<div class="sm-preset-row">
						<label for="sm-preset">Starting point</label><select
							id="sm-preset"
							value=""
							onchange={(event) => {
								const preset = PRESETS.find((p) => p.id === event.currentTarget.value);
								if (preset) apply({ ...preset.state, framing: design.framing }, true, true);
								event.currentTarget.value = '';
							}}
							><option value="" disabled>Explore presets</option>{#each presets as preset}<option
									value={preset.id}>{preset.name}</option
								>{/each}</select
						>
					</div>
					{#each controls as control}<div class="sm-control">
							<div>
								<label for={`sm-${control.id}`} title={control.hint}>{control.label}</label><output
									for={`sm-${control.id}`}
									>{String(Math.round(design[control.id])).padStart(2, '0')}</output
								>
							</div>
							<input
								id={`sm-${control.id}`}
								type="range"
								min="0"
								max="100"
								step="1"
								value={design[control.id]}
								onpointerdown={remember}
								onkeydown={(event) => {
									if (
										['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
											event.key
										)
									)
										remember();
								}}
								oninput={(event) => slider(control.id, event)}
								style={`--sm-progress:${design[control.id]}%`}
							/>
						</div>{/each}
					<div class="sm-palette">
						<div class="sm-control-label"><span>Colour story</span><span>{palette.name}</span></div>
						<div class="sm-palette-options">
							{#each PALETTES as item}<button
									class:sm-selected={design.palette === item.id}
									style={`--swatch:linear-gradient(135deg,${item.colors.join(',')})`}
									onclick={() => apply({ ...design, palette: item.id })}
									aria-label={`Palette: ${item.name}`}
									aria-pressed={design.palette === item.id}
									title={item.name}><span></span></button
								>{/each}
						</div>
					</div>
					<div class="sm-composition">
						<span class="sm-control-label">The frame</span>
						<div>
							{#each framings as framing}<button
									class:sm-selected={design.framing === framing.id}
									onclick={() => apply({ ...snapshot(), framing: framing.id })}
									aria-label={`${framing.label} composition`}
									aria-pressed={design.framing === framing.id}
									><i class={`sm-ratio-${framing.id}`}></i><span>{framing.ratio}</span></button
								>{/each}
						</div>
					</div>
					<button class="sm-surprise" onclick={surprise}
						>{@render icon('spark', 19)} Surprise me<span>R</span></button
					>
					<p class="sm-whisper">Good things happen when you let go.</p>
				</fieldset>
			</div>
		</aside>
	</div>
	<div class="sm-worlds-heading">
		<span>FOUR WORLDS. INFINITE WAYS TO GET LOST.</span><span>CHOOSE YOUR NEXT OBSESSION ↓</span>
	</div>
	<nav class="sm-worlds" aria-label="Visual worlds">
		{#each WORLDS as item}<button
				class:sm-world-active={design.world === item.id}
				onclick={() => selectWorld(item.id)}
				disabled={recording || exporting}
				aria-pressed={design.world === item.id}
				aria-label={item.name}
				><div class={`sm-world-art sm-world-${item.id}`}>{@render worldSymbol(item.id)}</div>
				<span class="sm-world-name"><small>{item.number}</small><strong>{item.name}</strong></span
				><span class="sm-world-arrow">↗</span></button
			>{/each}
	</nav>
	<footer class="sm-footer">
		<div>
			<span class="sm-quality-dot"></span><span>{quality}</span><b>·</b><span
				>MADE OF MATH & A LITTLE MAGIC</span
			>
		</div>
		<div>
			<button onclick={share} disabled={!ready || recording || exporting}
				>{@render icon('share', 15)} Share creation</button
			><button
				class="sm-save"
				onclick={() => (exportOpen = !exportOpen)}
				disabled={!ready || recording || exporting}
				aria-expanded={exportOpen}
				>{@render icon('download', 15)} Save artwork {@render icon('arrow', 15)}</button
			>
		</div>
	</footer>
	{#if exportOpen}<section class="sm-export-panel" aria-label="Save your artwork">
			<div>
				<span class="sm-overline">TAKE A LITTLE STRANGE WITH YOU</span><button
					class="sm-icon-button"
					onclick={() => (exportOpen = false)}
					aria-label="Close export options">{@render icon('close', 16)}</button
				>
			</div>
			<h2>Worth keeping.</h2>
			<p>Your current {design.framing} frame, without the controls.</p>
			<div class="sm-export-actions">
				<button onclick={() => exportPNG(false)} disabled={!ready || exporting || recording}
					>PNG <span>{exporting ? 'Rendering…' : '1600 px'}</span></button
				><button onclick={() => exportPNG(true)} disabled={!ready || exporting || recording}
					>PNG <span>2560 px</span></button
				>{#if recordingType}<button onclick={record} disabled={!ready || exporting || recording}
						>{@render icon('record', 14)} 8s video
						<span>{recordingType.startsWith('video/mp4') ? 'MP4' : 'WEBM'}</span></button
					>{/if}
			</div>
			{#if !recordingType}<small
					>This browser supports image export. Video recording is unavailable.</small
				>{/if}
		</section>{/if}
	{#if shareLink}<div class="sm-share-link">
			<label for="sm-share-url">Your reproducible artwork link</label><input
				id="sm-share-url"
				readonly
				value={shareLink}
				onfocus={(event) => event.currentTarget.select()}
			/><button
				class="sm-icon-button"
				onclick={() => (shareLink = '')}
				aria-label="Close share link">{@render icon('close', 16)}</button
			>
		</div>{/if}
	<div class="sm-status" class:sm-status-visible={Boolean(status)} role="status" aria-live="polite">
		{status}
	</div>
	{#if presentation}<button class="sm-return" onclick={cleanView}
			>{@render icon('close', 16)} Back to studio <kbd>H</kbd></button
		>{/if}
	{#if recording}<button class="sm-stop-recording" onclick={finishRecording}
			>{@render icon('record', 16)} Finish recording · {recordSeconds}s</button
		>{/if}
</div>
