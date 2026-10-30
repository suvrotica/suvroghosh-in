<script lang="ts">
	import { onMount } from 'svelte';
	import { resolveMotion } from '$lib/motion/preferences';
	import type { createSoapFilmRenderer } from '$lib/visualizations/soap-film/renderer';
	let canvas: HTMLCanvasElement;
	let stage: HTMLDivElement;
	let thickness = $state(480);
	let angle = $state(12);
	let flowing = $state(true);
	let playing = $state(true);
	let ready = $state(false);
	let error = $state('');
	let exportStatus = $state('');
	let saving = $state(false);
	let reduced = false;
	let time = 0;
	let renderer: ReturnType<typeof createSoapFilmRenderer> | undefined;
	let invalidate = () => {};
	const readRenderState = () => ({ thickness, angle, flowing, time });
	$effect(() => {
		thickness;
		angle;
		flowing;
		playing;
		invalidate();
	});

	function reset() {
		thickness = 480;
		angle = 12;
		flowing = true;
		time = 0;
		playing = !reduced;
		exportStatus = '';
		invalidate();
		showFilmOnNarrowScreen();
	}
	function example() {
		thickness = 400;
		angle = 0;
		flowing = false;
		playing = false;
		time = 0;
		exportStatus = '';
		invalidate();
		showFilmOnNarrowScreen();
	}
	function showFilmOnNarrowScreen() {
		if (!window.matchMedia('(max-width: 700px)').matches) return;
		const bounds = stage.getBoundingClientRect();
		if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
			stage.scrollIntoView({ block: 'start', behavior: 'instant' });
		}
	}
	function setAppearance(value: boolean) {
		flowing = value;
		showFilmOnNarrowScreen();
	}
	async function save() {
		if (!renderer || !ready || saving) return;
		saving = true;
		try {
			renderer.render(readRenderState());
			const blob = await new Promise<Blob>((resolve, reject) =>
				canvas.toBlob(
					(value) => (value ? resolve(value) : reject(new Error('Image unavailable'))),
					'image/png'
				)
			);
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `soap-film-${thickness}nm-${angle}deg.png`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 2000);
			exportStatus = 'Image saved.';
		} catch {
			exportStatus = 'The image could not be saved. Please try again.';
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		let disposed = false;
		let frame = 0;
		let previous = 0;
		let visible = true;
		let scale = 1;
		let slowFrames = 0;
		let measuredFrames = 0;
		let frameCount = 0;
		let resizeNeeded = true;
		let dragging: { id: number; x: number; angle: number } | null = null;
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const prefersStill = () =>
			resolveMotion(document.documentElement.dataset.motionPreference, motion.matches) ===
				'still' || new URLSearchParams(location.search).get('motion') === 'reduce';
		reduced = prefersStill();
		playing = !reduced;
		const active = () => !disposed && visible && !document.hidden && ready;
		function resize() {
			const bounds = stage.getBoundingClientRect();
			const density =
				Math.min(
					window.devicePixelRatio || 1,
					1.75,
					Math.sqrt(1_800_000 / Math.max(1, bounds.width * bounds.height))
				) * scale;
			const w = Math.max(1, Math.round(bounds.width * density));
			const h = Math.max(1, Math.round(bounds.height * density));
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
			}
			resizeNeeded = false;
		}
		function draw(now: number) {
			frame = 0;
			if (!active() || !renderer) return;
			const delta = previous ? now - previous : 0;
			previous = now;
			if (playing && flowing) time += Math.min(delta, 50) / 1000;
			if (resizeNeeded) resize();
			renderer.render(readRenderState());
			canvas.dataset.time = time.toFixed(3);
			canvas.dataset.frames = String(++frameCount);
			canvas.dataset.renderScale = scale.toFixed(2);
			canvas.dataset.thickness = String(thickness);
			canvas.dataset.angle = String(angle);
			if (playing && flowing) {
				if (delta > 32 && delta < 200) slowFrames++;
				if (++measuredFrames >= 90) {
					if (slowFrames > 45 && scale > 0.65) {
						scale = Math.max(0.65, scale * 0.85);
						resizeNeeded = true;
					}
					measuredFrames = 0;
					slowFrames = 0;
				}
				frame = requestAnimationFrame(draw);
			} else previous = 0;
		}
		invalidate = () => {
			cancelAnimationFrame(frame);
			frame = 0;
			previous = 0;
			if (active()) frame = requestAnimationFrame(draw);
		};
		const resizeObserver = new ResizeObserver(() => {
			resizeNeeded = true;
			invalidate();
		});
		resizeObserver.observe(stage);
		const intersection = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			invalidate();
		});
		intersection.observe(stage);
		const visibility = () => invalidate();
		const motionChange = () => {
			reduced = prefersStill();
			if (reduced) playing = false;
			invalidate();
		};
		const motionObserver = new MutationObserver(motionChange);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion-preference']
		});
		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			dragging = { id: event.pointerId, x: event.clientX, angle };
			canvas.setPointerCapture(event.pointerId);
		};
		const move = (event: PointerEvent) => {
			if (dragging?.id !== event.pointerId) return;
			angle = Math.round(
				Math.max(0, Math.min(65, dragging.angle + (event.clientX - dragging.x) * 0.18))
			);
		};
		const up = () => {
			dragging = null;
		};
		const lost = (event: Event) => {
			event.preventDefault();
			ready = false;
			error =
				'The graphics connection was interrupted. Reload to try again; the still image remains available.';
			invalidate();
		};
		document.addEventListener('visibilitychange', visibility);
		motion.addEventListener('change', motionChange);
		canvas.addEventListener('pointerdown', down);
		canvas.addEventListener('pointermove', move);
		canvas.addEventListener('pointerup', up);
		canvas.addEventListener('pointercancel', up);
		canvas.addEventListener('webglcontextlost', lost);
		if (new URLSearchParams(location.search).get('webgl') === 'off') {
			error =
				'This is a still image. Interactive graphics are unavailable; the explanation below is ready to read.';
		} else {
			void import('$lib/visualizations/soap-film/renderer')
				.then(({ createSoapFilmRenderer }) => {
					if (disposed) return;
					renderer = createSoapFilmRenderer(canvas);
					ready = true;
					invalidate();
				})
				.catch(() => {
					if (!disposed)
						error =
							'Your browser could not draw the interactive film. You can still explore the explanation below.';
				});
		}
		return () => {
			disposed = true;
			ready = false;
			cancelAnimationFrame(frame);
			invalidate = () => {};
			resizeObserver.disconnect();
			intersection.disconnect();
			motionObserver.disconnect();
			document.removeEventListener('visibilitychange', visibility);
			motion.removeEventListener('change', motionChange);
			canvas.removeEventListener('pointerdown', down);
			canvas.removeEventListener('pointermove', move);
			canvas.removeEventListener('pointerup', up);
			canvas.removeEventListener('pointercancel', up);
			canvas.removeEventListener('webglcontextlost', lost);
			renderer?.destroy();
			renderer = undefined;
		};
	});
</script>

<div class="sf-experiment" data-ready={ready}>
	<div class="sf-stage" bind:this={stage}>
		<canvas
			bind:this={canvas}
			class:sf-inactive={!ready}
			aria-label="A spherical soap bubble. Use thickness to change its reflected colours and viewing angle to move around its surface."
		></canvas>
		{#if !ready}
			<img
				class="sf-fallback"
				src="/images/visualizations/soap-film/poster.png"
				alt="Bright reflected colour bands across a spherical soap bubble against black"
				width="1200"
				height="900"
			/>
		{/if}
		<div class="sf-stage-top" aria-hidden="true">
			<span>{flowing ? 'FLOWING FILM' : 'EVEN THICKNESS'}</span><span>WHITE LIGHT</span>
		</div>
		<div class="sf-stage-bottom" aria-hidden="true">
			<span
				>{ready
					? !flowing
						? 'Even film · curved surface'
						: playing
							? 'Slowly flowing'
							: 'A still moment'
					: 'Still image'}</span
			><span>{ready ? 'Drag to look around ↔' : ''}</span>
		</div>
		{#if error}<p class="sf-error" role="status">{error}</p>{/if}
	</div>
	<aside class="sf-controls" aria-label="Film controls">
		<div class="sf-control-intro">
			<span class="sf-small-label">TRY IT YOURSELF</span>
			<h2>Small changes.<br />Different colours.</h2>
		</div>
		<fieldset disabled={!ready}>
			<legend class="sf-sr-only">Change the soap film</legend>
			<div class="sf-control">
				<label for="sf-thickness"
					>{flowing ? 'Average thickness' : 'Film thickness'}
					<output>{thickness}<span> nm</span></output></label
				>
				<input
					id="sf-thickness"
					type="range"
					min="50"
					max="1200"
					step="5"
					bind:value={thickness}
					onchange={showFilmOnNarrowScreen}
					aria-describedby="sf-thickness-help"
				/>
				<div class="sf-range-ends"><span>Thinner</span><span>Thicker</span></div>
				<p id="sf-thickness-help">A nanometre is one billionth of a metre.</p>
			</div>
			<div class="sf-control">
				<label for="sf-angle">Viewing angle <output>{angle}<span>°</span></output></label>
				<input
					id="sf-angle"
					type="range"
					min="0"
					max="65"
					step="1"
					bind:value={angle}
					onchange={showFilmOnNarrowScreen}
				/>
				<div class="sf-range-ends"><span>Front view</span><span>Turn around</span></div>
			</div>
			<div class="sf-control sf-appearance">
				<span class="sf-field-label" id="sf-appearance-label">Film appearance</span>
				<div class="sf-segment" role="group" aria-labelledby="sf-appearance-label">
					<button
						class:sf-selected={flowing}
						aria-pressed={flowing}
						onclick={() => setAppearance(true)}>Flowing film</button
					>
					<button
						class:sf-selected={!flowing}
						aria-pressed={!flowing}
						onclick={() => setAppearance(false)}>Even thickness</button
					>
				</div>
				<p>
					{flowing
						? 'Different parts of the bubble wall have different thicknesses.'
						: 'One thickness all around. Curvature makes colour rings that stay the same as you look around.'}
				</p>
			</div>
			<div class="sf-actions">
				<button class="sf-primary" disabled={!flowing} onclick={() => (playing = !playing)}
					>{playing && flowing ? 'Ⅱ Pause' : '▷ Play'}</button
				>
				<button class="sf-secondary" onclick={reset}>Reset ↺</button>
			</div>
		</fieldset>
		<button class="sf-save" disabled={!ready || saving} onclick={save}
			>{saving ? 'Saving…' : '↓ Save image'}</button
		>
		<span class="sf-export-status" role="status">{exportStatus}</span>
	</aside>
</div>
<div class="sf-guide">
	<div class="sf-try">
		<span class="sf-step">01</span>
		<div>
			<strong>Try a simple example</strong>
			<p>Start at 400 nm. Move towards 200 nm.<br />Then choose Flowing film and look around it.</p>
		</div>
		<button disabled={!ready} onclick={example}>Set it up <span aria-hidden="true">↗</span></button>
	</div>
	<div class="sf-note">
		<strong>What you’re seeing</strong>
		<p>
			Light reflected from the bubble wall’s two surfaces combines. Its thickness and local surface
			angle change which colours are reflected most strongly.
		</p>
	</div>
</div>
<p class="sf-model-note">
	Thin-film optics with brighter, more saturated display colours. The flow is animated, not a fluid
	simulation. <a href="#what-this-example-calculates">About the model ↓</a>
</p>
