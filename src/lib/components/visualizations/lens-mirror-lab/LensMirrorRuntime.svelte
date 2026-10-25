<script lang="ts">
	import { onMount } from 'svelte';
	import ControlKnob from './ControlKnob.svelte';
	import {
		effects,
		defaultParameters,
		sanitiseParameters,
		parameterBounds,
		type EffectId,
		type Parameters
	} from '$lib/visualizations/lens-mirror-lab/model';
	import { createRenderer } from '$lib/visualizations/lens-mirror-lab/renderer';
	import { loadLocalImage } from '$lib/visualizations/lens-mirror-lab/image';
	import { samples, assetRoot, type SampleId } from '$lib/visualizations/lens-mirror-lab/samples';

	let host: HTMLDivElement;
	let originalCanvas: HTMLCanvasElement;
	let distortedCanvas: HTMLCanvasElement;
	let picker: HTMLInputElement;
	let renderer: ReturnType<typeof createRenderer> | null = null;
	let source: HTMLCanvasElement | null = null;
	let releaseSource: (() => void) | null = null;
	let loadVersion = 0;
	let disposed = false;
	let effectId = $state<EffectId>('barrel');
	let p = $state<Parameters>(defaultParameters('barrel'));
	let sample = $state<SampleId>('calibration');
	let uploaded = $state(false);
	let ready = $state(false);
	let failure = $state('');
	let message = $state('Preparing the calibration chart…');
	let sourceGrid = $state(false);
	let referenceGrid = $state(false);
	let mode = $state<'side' | 'divider'>('side');
	let divider = $state(50);
	let loading = $state(false);
	let dragging = $state(false);
	let expanded = $state(false);
	let playing = $state(false);
	let visible = $state(true);
	let reducedMotion = $state(false);
	let revision = $state(0);
	let dimensions = $state('');
	let imageAspect = $state(1.4);
	let animationPhase = 0;
	const selected = $derived(effects.find((item) => item.id === effectId)!);
	const selectedSample = $derived(samples.find((item) => item.id === sample)!);
	const isMirror = $derived(selected.family === 'mirror');
	const isRadial = $derived(['barrel', 'pincushion', 'moustache', 'tangential'].includes(effectId));

	function setParameter<K extends keyof Parameters>(name: K, value: Parameters[K]) {
		if (typeof value === 'number' && !Number.isFinite(value)) return;
		p = sanitiseParameters({ ...p, [name]: value });
	}
	function draw() {
		if (ready && renderer)
			renderer.draw({
				effect: effectId,
				parameters: { ...p, phase: (p.phase + animationPhase) % (2 * Math.PI) },
				sourceGrid,
				referenceGrid
			});
	}
	$effect(() => {
		effectId;
		p;
		sourceGrid;
		referenceGrid;
		revision;
		ready;
		draw();
	});
	$effect(() => {
		if (!playing || effectId !== 'funhouse' || !visible || reducedMotion || !ready) return;
		let frame = 0;
		let previous = 0;
		const tick = (now: number) => {
			if (previous) animationPhase += Math.min(50, now - previous) / 1000;
			previous = now;
			draw();
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	function chooseEffect(id: EffectId) {
		effectId = id;
		p = defaultParameters(id);
		playing = false;
		animationPhase = 0;
		message = `${effects.find((item) => item.id === id)!.label} selected.`;
	}
	function replaceSource(
		next: HTMLCanvasElement,
		dispose: (() => void) | null,
		sourceWidth = next.width,
		sourceHeight = next.height
	) {
		if (!renderer) {
			dispose?.();
			return;
		}
		try {
			renderer.setSource(next);
		} catch (error) {
			dispose?.();
			throw error;
		}
		const previousRelease = releaseSource;
		source = next;
		releaseSource = dispose;
		originalCanvas.width = next.width;
		originalCanvas.height = next.height;
		imageAspect = next.width / next.height;
		const context = originalCanvas.getContext('2d')!;
		for (let y = 0; y < next.height; y += 14) {
			for (let x = 0; x < next.width; x += 14) {
				context.fillStyle = (x / 14 + y / 14) % 2 ? '#d4d9d1' : '#e6e8e0';
				context.fillRect(x, y, 14, 14);
			}
		}
		context.drawImage(next, 0, 0);
		previousRelease?.();
		dimensions = `${next.width} × ${next.height}${sourceWidth !== next.width || sourceHeight !== next.height ? ` preview · source ${sourceWidth} × ${sourceHeight}` : ' pixels'}`;
		ready = true;
		revision += 1;
	}
	async function chooseSample(id: SampleId) {
		const version = ++loadVersion;
		loading = true;
		try {
			const item = samples.find((entry) => entry.id === id)!;
			const image = new Image();
			image.src = assetRoot + item.file;
			await image.decode();
			if (disposed || version !== loadVersion) return;
			const limit = renderer?.maxTextureSize ?? 2048;
			const ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
			canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
			canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
			replaceSource(
				canvas,
				() => {
					canvas.width = canvas.height = 0;
				},
				image.naturalWidth,
				image.naturalHeight
			);
			sample = id;
			uploaded = false;
			message = `${item.label} ready. Turn a dial to explore.`;
		} catch {
			if (!disposed && version === loadVersion)
				message = 'This sample could not load. Choose another sample or try again.';
		} finally {
			if (!disposed && version === loadVersion) loading = false;
		}
	}
	async function upload(file?: File) {
		if (!file || !renderer) return;
		const version = ++loadVersion;
		loading = true;
		message = 'Checking your image…';
		try {
			const result = await loadLocalImage(file, renderer.maxTextureSize);
			if (disposed || version !== loadVersion) {
				result.dispose();
				return;
			}
			replaceSource(result.canvas, result.dispose, result.sourceWidth, result.sourceHeight);
			uploaded = true;
			message = 'Your image is ready. It stays in your browser.';
		} catch (error) {
			if (!disposed && version === loadVersion)
				message =
					error instanceof Error
						? error.message
						: 'This image could not be opened. Try another JPEG, PNG or static WebP.';
		} finally {
			if (!disposed && version === loadVersion) {
				loading = false;
				picker.value = '';
			}
		}
	}
	function centre(event: PointerEvent) {
		if (!ready || effectId === 'flat' || effectId === 'original') return;
		const bounds = distortedCanvas.getBoundingClientRect();
		p = sanitiseParameters({
			...p,
			centerX: (event.clientX - bounds.left) / bounds.width,
			centerY: (event.clientY - bounds.top) / bounds.height
		});
	}
	function canvasKeys(event: KeyboardEvent) {
		const step = event.shiftKey ? 0.1 : 0.01;
		if (event.key === 'ArrowLeft') setParameter('centerX', p.centerX - step);
		else if (event.key === 'ArrowRight') setParameter('centerX', p.centerX + step);
		else if (event.key === 'ArrowUp') setParameter('centerY', p.centerY - step);
		else if (event.key === 'ArrowDown') setParameter('centerY', p.centerY + step);
		else if (event.key === 'Home') p = { ...p, centerX: 0.5, centerY: 0.5 };
		else return;
		event.preventDefault();
	}
	async function download(comparison = false) {
		if (!ready || !source) return;
		draw();
		let output = distortedCanvas;
		if (comparison) {
			output = document.createElement('canvas');
			output.width = source.width * 2;
			output.height = source.height + 64;
			const context = output.getContext('2d')!;
			context.fillStyle = '#eae6dc';
			context.fillRect(0, 0, output.width, output.height);
			context.fillStyle = '#292d2b';
			context.font = '22px sans-serif';
			context.fillText('Original — no added distortion', 24, 41);
			context.fillText(selected.label, source.width + 24, 41);
			context.drawImage(originalCanvas, 0, 64);
			context.drawImage(distortedCanvas, source.width, 64);
		}
		output.toBlob((blob) => {
			if (!blob || disposed) {
				message = 'The image could not be exported. Try again.';
				return;
			}
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `lens-mirror-${effectId}${comparison ? '-comparison' : ''}.png`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message = `PNG exported at ${output.width} × ${output.height} pixels.`;
		}, 'image/png');
	}
	async function share() {
		const { encodeState } = await import('$lib/visualizations/lens-mirror-lab/state');
		const url = new URL(window.location.href);
		url.search = encodeState({ sample, effect: effectId, parameters: p }).toString();
		url.hash = 'lens-mirror-lab';
		try {
			await navigator.clipboard.writeText(url.toString());
			message = uploaded
				? 'Settings link copied. Your image is private; the recipient will choose an image.'
				: 'Settings link copied. It opens this sample and these controls.';
		} catch {
			message =
				'The clipboard is unavailable. Try copying the address after opening this lab in a browser.';
		}
	}
	async function fullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else if (host.requestFullscreen) await host.requestFullscreen();
			else expanded = !expanded;
		} catch {
			expanded = !expanded;
		}
	}

	onMount(() => {
		disposed = false;
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => {
			reducedMotion = motion.matches;
			if (reducedMotion) playing = false;
		};
		syncMotion();
		motion.addEventListener('change', syncMotion);
		let inView = true;
		const visibility = () => {
			visible = inView && document.visibilityState === 'visible';
		};
		const observer =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver((entries) => {
						inView = entries[0].isIntersecting;
						visibility();
					});
		observer?.observe(host);
		document.addEventListener('visibilitychange', visibility);
		const lost = (event: Event) => {
			event.preventDefault();
			ready = false;
			failure =
				'The graphics context was interrupted. Reload the lab to restore interactive rendering.';
			playing = false;
		};
		distortedCanvas.addEventListener('webglcontextlost', lost);
		void (async () => {
			try {
				renderer = createRenderer(distortedCanvas);
				const { decodeState } = await import('$lib/visualizations/lens-mirror-lab/state');
				const state = decodeState(window.location.search);
				if (disposed) return;
				if (state) {
					effectId = state.effect;
					p = state.parameters;
					if (samples.some((item) => item.id === state.sample)) sample = state.sample as SampleId;
				}
				await chooseSample(sample);
			} catch (error) {
				if (!disposed)
					failure =
						error instanceof Error ? error.message : 'The interactive renderer could not start.';
			}
		})();
		return () => {
			disposed = true;
			++loadVersion;
			observer?.disconnect();
			document.removeEventListener('visibilitychange', visibility);
			motion.removeEventListener('change', syncMotion);
			distortedCanvas.removeEventListener('webglcontextlost', lost);
			renderer?.dispose();
			releaseSource?.();
			source = null;
		};
	});
</script>

<div
	class:optics-expanded={expanded}
	class="optics-runtime"
	bind:this={host}
	data-testid="lens-mirror-lab"
	data-render-state={failure ? 'fallback' : ready ? 'ready' : 'loading'}
>
	{#if failure}
		<div class="optics-fallback" role="status">
			<img
				src={`${assetRoot}poster.png`}
				alt="Static comparison of the original chart and barrel distortion."
				width="1400"
				height="1271"
			/><strong>{failure}</strong>
			<p>
				This is the default static comparison. Read the explanation below, or reload with WebGL
				enabled to use the controls.
			</p>
			<button type="button" onclick={() => window.location.reload()}>Reload lab</button>
		</div>
	{/if}
	<div class:optics-hidden={!!failure}>
		<div class="optics-toolbar">
			<div class="optics-live-label">
				<span></span>LIVE COMPARISON <small>{loading ? 'LOADING' : 'LOCAL PROCESSING'}</small>
			</div>
			<div class="optics-toolbar-actions">
				<div class="optics-segment" aria-label="Comparison layout">
					<button type="button" aria-pressed={mode === 'side'} onclick={() => (mode = 'side')}
						>Side by side</button
					><button
						type="button"
						aria-pressed={mode === 'divider'}
						onclick={() => (mode = 'divider')}>Divider</button
					>
				</div>
				<button
					type="button"
					class="optics-expand"
					onclick={fullscreen}
					aria-label="Expand lab"
					title="Expand lab">⤢</button
				>
			</div>
		</div>
		<div
			class="optics-stage"
			class:divider-mode={mode === 'divider'}
			style={`--image-ratio:${imageAspect};--divider:${divider}%`}
		>
			<figure class="optics-pane original-pane">
				<figcaption>
					<span>01 / REFERENCE</span><strong>Original <small>— no added distortion</small></strong>
				</figcaption>
				<div class="optics-image">
					<canvas
						data-testid="original-canvas"
						bind:this={originalCanvas}
						aria-label="Original image with no added distortion"
					></canvas>
				</div>
			</figure>
			<figure class="optics-pane distorted-pane">
				<figcaption>
					<span>02 / TRANSFORMED</span><strong
						>{selected.label}<small
							>{isMirror && effectId !== 'flat' ? ' / 2D approximation' : ' / adjustable'}</small
						></strong
					>
				</figcaption>
				<div class="optics-image">
					<canvas
						data-testid="distorted-canvas"
						bind:this={distortedCanvas}
						tabindex="0"
						aria-label={`${selected.label}. Select a point to move the distortion centre, or use arrow keys.`}
						onkeydown={canvasKeys}
						onpointerdown={(event) => {
							distortedCanvas.focus({ preventScroll: true });
							distortedCanvas.setPointerCapture(event.pointerId);
							centre(event);
						}}
						onpointermove={(event) => {
							if (event.buttons === 1) centre(event);
						}}
					></canvas>
				</div>
			</figure>
			{#if mode === 'divider'}<div class="optics-divider-control">
					<label for="optics-divider">Before / after divider</label><input
						id="optics-divider"
						type="range"
						min="0"
						max="100"
						step="1"
						bind:value={divider}
					/>
				</div>{/if}
		</div>
		<div class="optics-stage-foot">
			<span
				>{uploaded
					? 'YOUR IMAGE / PRIVATE'
					: `SAMPLE / ${selectedSample.label.toUpperCase()}`}</span
			><span>{dimensions || 'Preparing image…'}</span><button
				type="button"
				onclick={() => {
					p = { ...p, centerX: 0.5, centerY: 0.5, scale: 1 };
					mode = 'side';
					divider = 50;
				}}>Reset view</button
			>
		</div>
		<div class="optics-instrument">
			<div class="optics-effect-selector">
				<div class="optics-group-title">
					<span>01</span>
					<h2>Choose your glass</h2>
				</div>
				<div class="optics-effect-family">
					<span>LENS</span>
					<div>
						{#each effects.filter((item) => item.family === 'lens' || item.id === 'original') as item}<button
								type="button"
								aria-pressed={effectId === item.id}
								onclick={() => chooseEffect(item.id)}>{item.label}</button
							>{/each}
					</div>
				</div>
				<div class="optics-effect-family">
					<span>MIRROR</span>
					<div>
						{#each effects.filter((item) => item.family === 'mirror') as item}<button
								type="button"
								aria-pressed={effectId === item.id}
								onclick={() => chooseEffect(item.id)}>{item.label}</button
							>{/each}
					</div>
				</div>
			</div>
			<div class="optics-dials">
				<div class="optics-group-title">
					<span>02</span>
					<h2>Make a small adjustment</h2>
					<button
						type="button"
						onclick={() => {
							p = defaultParameters(effectId);
							animationPhase = 0;
							playing = false;
						}}>Reset effect</button
					>
				</div>
				{#if effectId !== 'original' && effectId !== 'flat'}<div class="optics-knob-grid">
						<ControlKnob
							label="Strength"
							value={p.strength}
							min={0}
							max={1}
							step={0.01}
							reset={defaultParameters(effectId).strength}
							hint="How much the image bends."
							onchange={(value) => setParameter('strength', value)}
						/><ControlKnob
							label="Centre X"
							value={p.centerX}
							reset={0.5}
							hint="Move the centre left or right."
							onchange={(value) => setParameter('centerX', value)}
						/><ControlKnob
							label="Centre Y"
							value={p.centerY}
							reset={0.5}
							hint="Move the centre up or down."
							onchange={(value) => setParameter('centerY', value)}
						/>{#if ['convex', 'concave', 'cylindrical'].includes(effectId)}<ControlKnob
								label="Radius"
								value={p.radius}
								min={0.2}
								max={1.5}
								reset={defaultParameters(effectId).radius}
								hint="The reach of the curved area."
								onchange={(value) => setParameter('radius', value)}
							/>{:else if effectId === 'funhouse'}<ControlKnob
								label="Wavelength"
								value={p.wavelength}
								min={0.2}
								max={2}
								reset={defaultParameters(effectId).wavelength}
								hint="Distance between the waves."
								onchange={(value) => setParameter('wavelength', value)}
							/>{:else}<ControlKnob
								label="Image scale"
								value={p.scale}
								min={0.6}
								max={1.5}
								reset={1}
								hint="Adjust framing; empty edges stay visible."
								onchange={(value) => setParameter('scale', value)}
							/>{/if}
					</div>{:else}<p class="optics-neutral-copy">
						{effectId === 'original'
							? 'A neutral view of the source. Choose a lens or mirror to start bending it.'
							: 'One horizontal reflection. Look at the R or the arrows to follow the reversal.'}
					</p>{/if}
				{#if ['cylindrical', 'funhouse'].includes(effectId)}<div class="optics-extra-controls">
						<label
							>Orientation <select
								aria-label="Orientation"
								value={p.axis}
								onchange={(event) =>
									setParameter('axis', event.currentTarget.value as Parameters['axis'])}
								><option value="horizontal">Horizontal</option><option value="vertical"
									>Vertical</option
								></select
							></label
						>{#if effectId === 'funhouse'}<label
								>Phase <input
									aria-label="Phase"
									type="range"
									min="0"
									max="6.28"
									step="0.01"
									value={p.phase}
									oninput={(event) => setParameter('phase', Number(event.currentTarget.value))}
								/></label
							><button
								type="button"
								aria-pressed={playing}
								disabled={reducedMotion}
								onclick={() => (playing = !playing)}
								>{playing ? 'Pause waves' : 'Play waves'}</button
							>{/if}
					</div>{/if}
			</div>
		</div>
		<div class="optics-notice">
			<span class="optics-eye" aria-hidden="true">◉</span>
			<div>
				<strong>What to notice</strong>
				<p>{selected.notice}</p>
				{#if isMirror && effectId !== 'flat'}<small
						>Mirror appearances are 2D image approximations.</small
					>{/if}
			</div>
		</div>
		<div class="optics-options">
			<label><input type="checkbox" bind:checked={referenceGrid} />Straight reference grid</label
			><label><input type="checkbox" bind:checked={sourceGrid} />Distort source grid</label
			>{#if isMirror && effectId !== 'flat'}<label
					><input
						type="checkbox"
						checked={p.mirror}
						onchange={(event) => setParameter('mirror', event.currentTarget.checked)}
					/>Mirror reversal</label
				>{/if}<span>The reference grid stays straight. The source grid bends with the image.</span>
		</div>
		{#if isRadial}<details class="optics-advanced">
				<summary>Advanced lens coefficients <span>k₁ · k₂ · k₃ · p₁ · p₂</span></summary>
				<p>
					Use a bounded radial and tangential model. These coefficients replace the simple preset
					strength; the centre and image scale still apply. Coefficient values apply when you leave
					the field.
				</p>
				<label
					><input
						type="checkbox"
						checked={p.advanced}
						onchange={(event) => setParameter('advanced', event.currentTarget.checked)}
					/>Use custom coefficients</label
				>
				<div class="optics-coefficients">
					{#each ['k1', 'k2', 'k3', 'p1', 'p2'] as key}<label
							>{key}<input
								type="number"
								aria-label={`Coefficient ${key}`}
								min={parameterBounds[key as 'k1'][0]}
								max={parameterBounds[key as 'k1'][1]}
								step={parameterBounds[key as 'k1'][2]}
								value={p[key as keyof Parameters] as number}
								onchange={(event) => setParameter(key as 'k1', event.currentTarget.valueAsNumber)}
							/></label
						>{/each}
				</div>
			</details>{/if}
		<div class="optics-samples-section">
			<div class="optics-group-title">
				<span>03</span>
				<h2>Change the subject</h2>
				<p>Different images reveal different things.</p>
			</div>
			<div class="optics-samples">
				{#each samples as item}<button
						type="button"
						aria-label={item.label}
						aria-pressed={!uploaded && sample === item.id}
						onclick={() => void chooseSample(item.id)}
						><img src={assetRoot + item.file} alt="" width="140" height="100" loading="lazy" /><span
							>{item.label}</span
						></button
					>{/each}
			</div>
			<p class="optics-sample-hint">
				{uploaded
					? 'Your image is processed locally. Choose a sample to remove it from the workbench.'
					: selectedSample.detail}
			</p>
		</div>
		<div
			class="optics-upload"
			class:dragging
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={(event) => {
				event.preventDefault();
				dragging = false;
				void upload(event.dataTransfer?.files[0]);
			}}
			role="region"
			aria-label="Load your own image"
		>
			<div class="optics-upload-icon" aria-hidden="true">↥</div>
			<div>
				<strong>See your world differently.</strong>
				<p>
					Drop an image here, or choose a file. JPEG, PNG or static WebP · 10 MB · 20 megapixels ·
					up to 8192 px per side.
				</p>
				<small>Your image is processed in your browser. It is not uploaded to our server.</small>
			</div>
			<button type="button" onclick={() => picker.click()} disabled={loading}
				>Use your own image</button
			><input
				class="optics-file-input"
				bind:this={picker}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				aria-label="Choose an image"
				onchange={(event) => void upload(event.currentTarget.files?.[0])}
			/>{#if uploaded}<button type="button" onclick={() => void chooseSample(sample)}
					>Remove image</button
				>{/if}
		</div>
		<footer class="optics-export">
			<div>
				<button type="button" onclick={() => void download()} disabled={!ready}
					>Download image <span aria-hidden="true">↓</span></button
				><button type="button" onclick={() => void download(true)} disabled={!ready}
					>Download comparison</button
				><button type="button" onclick={() => void share()} disabled={!ready}
					>Copy settings link</button
				>
			</div>
			<small
				>PNG at the working image resolution. Shared links contain settings, never your image.</small
			>
		</footer>
		<p class="optics-status" role="status" aria-live="polite">{message}</p>
	</div>
</div>
