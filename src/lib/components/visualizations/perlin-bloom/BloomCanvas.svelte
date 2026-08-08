<script lang="ts">
	import { onMount } from 'svelte';
	import { PerlinBloomEngine } from '$lib/visualizations/perlin-bloom/engine';
	import { morphologyHash } from '$lib/visualizations/perlin-bloom/geometry';
	import type { ExportResult, FlowerConfig } from '$lib/visualizations/perlin-bloom/types';

	type CanvasStatus = 'loading' | 'ready' | 'error';
	const previewPetals = [...Array(11).keys()];

	type Props = {
		config: FlowerConfig;
		paused: boolean;
		allowMotionOverride?: boolean;
		posterMode?: boolean;
		debug?: boolean;
		descriptionId: string;
		onStatus?: (status: CanvasStatus, message?: string) => void;
		onSystemMotionChange?: (blocked: boolean) => void;
	};

	let {
		config,
		paused,
		allowMotionOverride = false,
		posterMode = false,
		debug = false,
		descriptionId,
		onStatus = () => {},
		onSystemMotionChange = () => {}
	}: Props = $props();

	let host: HTMLDivElement;
	let engine: PerlinBloomEngine | undefined;
	let ready = $state(false);
	let errorMessage = $state('');
	let systemMotionBlocked = $state(false);

	function plainConfig(): FlowerConfig {
		return { ...config };
	}

	function syncPauseState() {
		engine?.setPaused(paused || (systemMotionBlocked && !allowMotionOverride));
	}

	export function focusCanvas() {
		engine?.getCanvasElement()?.focus({ preventScroll: true });
	}

	export function pulseAt(x: number, y: number) {
		engine?.pulseAt(x, y);
	}

	export async function exportStill(options: {
		scale: 1 | 2 | 4;
		signature: boolean;
		filename?: string;
	}): Promise<ExportResult> {
		if (!engine) throw new Error('The bloom renderer is still preparing.');
		return engine.exportStill({ ...options, download: true });
	}

	onMount(() => {
		let disposed = false;
		let motionQuery: MediaQueryList | undefined;
		let motionObserver: MutationObserver | undefined;
		let removeMotionListener = () => {};

		onStatus('loading', 'Cultivating the bloom field…');

		const updateMotionPreference = () => {
			systemMotionBlocked =
				motionQuery?.matches === true || document.documentElement.dataset.motion === 'still';
			onSystemMotionChange(systemMotionBlocked);
			syncPauseState();
		};

		if (typeof window.matchMedia === 'function') {
			motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			if (typeof motionQuery.addEventListener === 'function') {
				motionQuery.addEventListener('change', updateMotionPreference);
				removeMotionListener = () =>
					motionQuery?.removeEventListener('change', updateMotionPreference);
			} else if (typeof motionQuery.addListener === 'function') {
				motionQuery.addListener(updateMotionPreference);
				removeMotionListener = () => motionQuery?.removeListener(updateMotionPreference);
			}
		}
		if (typeof MutationObserver !== 'undefined') {
			motionObserver = new MutationObserver(updateMotionPreference);
			motionObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['data-motion']
			});
		}
		updateMotionPreference();

		void import('p5')
			.then(({ default: P5 }) => {
				if (disposed) return;
				engine = new PerlinBloomEngine({
					P5,
					host,
					config: plainConfig(),
					debug,
					descriptionId,
					onReady: () => {
						if (disposed) return;
						ready = true;
						errorMessage = '';
						syncPauseState();
						onStatus('ready', 'Bloom field ready. Move the pointer across the outer petals.');
					},
					onError: (error: unknown) => {
						if (disposed) return;
						errorMessage =
							error instanceof Error
								? error.message
								: 'The bloom renderer could not create a canvas.';
						onStatus('error', errorMessage);
					}
				});
			})
			.catch(() => {
				if (disposed) return;
				errorMessage =
					'The interactive renderer could not be loaded. The specimen preview remains available.';
				onStatus('error', errorMessage);
			});

		return () => {
			disposed = true;
			removeMotionListener();
			motionObserver?.disconnect();
			engine?.destroy();
			engine = undefined;
		};
	});

	$effect(() => {
		const nextConfig = plainConfig();
		engine?.setConfig(nextConfig);
	});

	$effect(() => {
		void paused;
		void allowMotionOverride;
		void systemMotionBlocked;
		syncPauseState();
	});
</script>

<div
	bind:this={host}
	class:ready
	class:poster-mode={posterMode}
	class:error={Boolean(errorMessage)}
	class="canvas-host"
	data-testid="perlin-bloom-p5-host"
	data-morphology-hash={morphologyHash(config)}
	data-palette={config.palette}
	data-view={config.view}
	data-motion={paused || (systemMotionBlocked && !allowMotionOverride) ? 'still' : 'alive'}
>
	<div class="specimen-preview" aria-hidden="true">
		<div class="preview-field"></div>
		<div class="preview-box preview-box-back"></div>
		<div class="preview-box preview-box-front"></div>
		<div class="preview-bloom">
			{#each previewPetals as index (index)}
				<span class="preview-petal" style={`--petal-index: ${index}`}></span>
			{/each}
			<i class="preview-core"></i>
		</div>
		<div class="preview-scanline"></div>
	</div>

	{#if errorMessage}
		<div class="canvas-error" role="alert">
			<strong>Specimen chamber offline</strong>
			<span>{errorMessage}</span>
		</div>
	{/if}

	<noscript>
		<p>
			JavaScript is needed for the responsive bloom. The luminous specimen preview and the full
			article remain available.
		</p>
	</noscript>
</div>

<style>
	.canvas-host {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 21rem;
		overflow: hidden;
		background:
			radial-gradient(circle at 50% 50%, rgb(60 18 96 / 30%), transparent 34%),
			radial-gradient(circle at 18% 18%, rgb(0 111 137 / 12%), transparent 38%),
			linear-gradient(145deg, #05040f 0%, #08061a 48%, #030713 100%);
		isolation: isolate;
	}

	.specimen-preview {
		position: absolute;
		z-index: 0;
		inset: 0;
		overflow: hidden;
		opacity: 1;
		transition: opacity 360ms ease;
	}

	.canvas-host.ready .specimen-preview {
		pointer-events: none;
		opacity: 0;
	}

	.canvas-host.error .specimen-preview {
		opacity: 0.78;
	}

	.preview-field {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(rgb(118 231 255 / 3%) 1px, transparent 1px),
			linear-gradient(90deg, rgb(118 231 255 / 3%) 1px, transparent 1px);
		background-size: 3.5rem 3.5rem;
		mask-image: radial-gradient(circle, #000 0%, transparent 68%);
	}

	.preview-box {
		position: absolute;
		top: 50%;
		left: 50%;
		width: min(40%, 26rem);
		aspect-ratio: 1;
		border: 1px solid rgb(114 228 255 / 34%);
		box-shadow:
			0 0 1.6rem rgb(69 202 255 / 10%),
			inset 0 0 1.2rem rgb(180 95 255 / 5%);
		transform: translate(-50%, -50%);
	}

	.preview-box-back {
		border-color: rgb(202 91 255 / 16%);
		transform: translate(calc(-50% + 1rem), calc(-50% - 1rem));
	}

	.preview-box-front::before,
	.preview-box-front::after {
		position: absolute;
		width: 1.43rem;
		border-top: 1px solid rgb(124 227 255 / 20%);
		content: '';
		transform-origin: left center;
		transform: rotate(-45deg);
	}

	.preview-box-front::before {
		top: 0;
		left: 0;
	}

	.preview-box-front::after {
		right: -1.4rem;
		bottom: -1px;
		transform: rotate(-45deg);
	}

	.preview-bloom {
		position: absolute;
		top: 50%;
		left: 50%;
		width: min(16%, 8rem);
		aspect-ratio: 1;
		filter: drop-shadow(0 0 1.5rem rgb(200 39 255 / 55%));
		transform: translate(-50%, -50%);
	}

	.preview-petal {
		--angle: calc(var(--petal-index) * 32.727deg);
		position: absolute;
		top: 50%;
		left: 50%;
		width: 78%;
		height: 260%;
		border: 1px solid rgb(130 232 255 / 45%);
		border-radius: 58% 42% 72% 28% / 72% 48% 52% 28%;
		background:
			linear-gradient(90deg, transparent 40%, rgb(100 231 255 / 18%) 50%, transparent 60%),
			linear-gradient(165deg, rgb(211 34 255 / 25%), rgb(74 226 255 / 4%) 72%);
		box-shadow: inset 0 0 1rem rgb(216 45 255 / 14%);
		transform: translate(-50%, -100%) rotate(var(--angle));
		transform-origin: 50% 100%;
	}

	.preview-petal:nth-child(3n) {
		height: 310%;
		border-color: rgb(255 72 211 / 42%);
	}

	.preview-petal:nth-child(4n) {
		width: 62%;
		height: 225%;
	}

	.preview-core {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 88%;
		aspect-ratio: 1;
		border: 1px solid rgb(216 251 255 / 70%);
		border-radius: 50%;
		background: radial-gradient(circle, #f4ffff 0 5%, #4be9ff 10%, #b11cff 36%, #09061c 68%);
		box-shadow:
			0 0 1rem rgb(76 238 255 / 80%),
			0 0 2.5rem rgb(187 35 255 / 64%);
		transform: translate(-50%, -50%);
	}

	.preview-scanline {
		position: absolute;
		top: 50%;
		left: 12%;
		width: 76%;
		border-top: 1px solid rgb(143 247 255 / 13%);
		box-shadow: 0 0 1.2rem rgb(90 221 255 / 28%);
	}

	.canvas-host :global(canvas) {
		position: relative;
		z-index: 1;
		display: block;
		width: 100% !important;
		height: 100% !important;
		touch-action: pan-y;
	}

	.canvas-host :global(canvas:focus-visible) {
		outline: 3px solid #8ff7ff;
		outline-offset: -5px;
		box-shadow: inset 0 0 0 6px #07101f;
	}

	.canvas-error {
		position: absolute;
		z-index: 3;
		right: 1rem;
		bottom: 1rem;
		left: 1rem;
		display: grid;
		gap: 0.25rem;
		border: 1px solid rgb(255 135 177 / 48%);
		border-radius: 0.75rem;
		background: rgb(20 5 20 / 90%);
		padding: 0.8rem 0.95rem;
		color: #ffe7f3;
		font: 520 0.76rem/1.45 var(--font-sans, sans-serif);
		backdrop-filter: blur(12px);
	}

	.canvas-error strong {
		color: #ffadd5;
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	noscript p {
		position: absolute;
		z-index: 3;
		right: 1rem;
		bottom: 1rem;
		left: 1rem;
		margin: 0;
		border: 1px solid rgb(143 247 255 / 32%);
		border-radius: 0.65rem;
		background: rgb(3 7 20 / 92%);
		padding: 0.75rem;
		color: #e9f7ff;
		font: 600 0.75rem/1.45 var(--font-sans, sans-serif);
	}

	.canvas-host.poster-mode {
		min-height: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.specimen-preview {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.canvas-host {
			border: 2px solid CanvasText;
			background: Canvas;
		}

		.canvas-error {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
			backdrop-filter: none;
		}
	}
</style>
