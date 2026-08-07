<script lang="ts">
	import { onMount } from 'svelte';
	import type p5 from 'p5';
	import { renderPixelDensity } from '$lib/visualizations/webgl';
	import {
		createExportPlan,
		frameAtPoint,
		hashString,
		renderArtwork,
		renderGallery,
		type ExhibitionRecipe,
		type GalleryState,
		type GeneratedPath,
		type Orientation
	} from '$lib/visualizations/invisible-weather';

	type CanvasStatus = 'loading' | 'ready' | 'error';
	type ExportResult = {
		blob: Blob;
		width: number;
		height: number;
		clamped: boolean;
	};

	type Props = {
		recipe: ExhibitionRecipe;
		state: GalleryState;
		paused: boolean;
		focusIndex: number | null;
		posterMode?: boolean;
		allowMotionOverride?: boolean;
		onSelect: (index: number) => void;
		onStatus: (status: CanvasStatus, message?: string) => void;
		onPhase?: (phase: number) => void;
		onSystemMotionChange?: (blocked: boolean) => void;
	};

	let {
		recipe,
		state: galleryState,
		paused,
		focusIndex,
		posterMode = false,
		allowMotionOverride = false,
		onSelect,
		onStatus,
		onPhase = () => {},
		onSystemMotionChange = () => {}
	}: Props = $props();

	let host: HTMLDivElement;
	let canvasElement = $state<HTMLCanvasElement | null>(null);
	let ready = $state(false);
	let instance: p5 | null = null;
	let currentPhase = 0;
	let previousRecipeHash = '';
	let visible = true;
	let pageVisible = true;
	let systemReducedMotion = $state(false);
	// This hot-path render cache is deliberately non-reactive; cache writes must not invalidate Svelte.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	let pathCache = new Map<string, readonly GeneratedPath[]>();
	let lastCachePhase = Number.NaN;
	let lastPhaseReport = -Infinity;

	function resolvedOrientation(
		width = host?.clientWidth ?? 1,
		height = host?.clientHeight ?? 1
	): Orientation {
		if (galleryState.orientation === 'portrait' || galleryState.orientation === 'landscape') {
			return galleryState.orientation;
		}
		return height > width * 1.04 ? 'portrait' : 'landscape';
	}

	function shouldAnimate() {
		return (
			ready &&
			!paused &&
			galleryState.motion !== 'still' &&
			(!systemReducedMotion || allowMotionOverride) &&
			visible &&
			pageVisible
		);
	}

	function phaseCadence() {
		return galleryState.motion === 'migrate' ? 24 : 12;
	}

	function phaseSpeed() {
		return (galleryState.motion === 'migrate' ? 0.055 : 0.014) * galleryState.speed;
	}

	function renderCurrent(p: p5) {
		const context = p.drawingContext as CanvasRenderingContext2D;
		const phaseResolution = galleryState.motion === 'migrate' ? 220 : 90;
		const renderPhase = shouldAnimate()
			? Math.round(currentPhase * phaseResolution) / phaseResolution
			: currentPhase;
		const phaseKey = Math.round(renderPhase * 10_000) / 10_000;
		if (phaseKey !== lastCachePhase) {
			pathCache.clear();
			lastCachePhase = phaseKey;
		}
		const options = {
			width: p.width,
			height: p.height,
			phase: renderPhase,
			orientation: resolvedOrientation(p.width, p.height),
			selectedArtwork: galleryState.selectedArtwork,
			pathCache,
			pathBudget: p.width < 620 ? 52 : p.width < 1_000 ? 84 : 132
		} as const;

		if (focusIndex === null) renderGallery(context, recipe, options);
		else renderArtwork(context, recipe.artworks[focusIndex] ?? recipe.artworks[0], options);
	}

	function redraw() {
		if (!instance) return;
		instance.redraw();
	}

	function syncLoop() {
		if (!instance) return;
		if (shouldAnimate()) {
			instance.frameRate(phaseCadence());
			instance.loop();
		} else {
			instance.noLoop();
			instance.redraw();
		}
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	function canvasBlob(canvas: HTMLCanvasElement) {
		return new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('The PNG encoder returned no data.'))),
				'image/png'
			);
		});
	}

	export function getPhase() {
		return currentPhase;
	}

	export function resetPhase(phase = 0) {
		currentPhase = Number.isFinite(phase) ? phase : 0;
		lastCachePhase = Number.NaN;
		pathCache.clear();
		onPhase(currentPhase);
		redraw();
	}

	export function focusCanvas() {
		canvasElement?.focus({ preventScroll: true });
	}

	export async function exportPng(
		scale: 1 | 2 | 4,
		selectedOnly = false,
		filename = 'the-museum-of-invisible-weather'
	): Promise<ExportResult> {
		const orientation = selectedOnly ? 'portrait' : resolvedOrientation();
		const base = selectedOnly
			? { width: 1400, height: 1750 }
			: orientation === 'portrait'
				? { width: 1200, height: 1600 }
				: { width: 1600, height: 1000 };
		const plan = createExportPlan(recipe, {
			format: 'png',
			width: base.width,
			height: base.height,
			scale,
			orientation,
			label: selectedOnly ? 'selected-work' : 'gallery'
		});
		const { width, height } = plan;
		const clamped = plan.scale < scale - Number.EPSILON;

		const output = document.createElement('canvas');
		output.width = width;
		output.height = height;
		const context = output.getContext('2d', { alpha: false });
		if (!context) throw new Error('This browser could not create an export surface.');
		const options = {
			width,
			height,
			phase: currentPhase,
			orientation,
			selectedArtwork: galleryState.selectedArtwork,
			pathCache: new Map<string, readonly GeneratedPath[]>(),
			pathBudget: selectedOnly ? 3_200 : 8_000
		} as const;
		if (selectedOnly) {
			renderArtwork(
				context,
				recipe.artworks[galleryState.selectedArtwork] ?? recipe.artworks[0],
				options
			);
		} else {
			renderGallery(context, recipe, options);
		}
		const blob = await canvasBlob(output);
		const safeBase =
			filename
				.replace(/\.png$/iu, '')
				.replace(/[^a-z0-9._-]+/giu, '-')
				.replace(/^-+|-+$/gu, '') || 'the-museum-of-invisible-weather';
		downloadBlob(blob, `${safeBase}_${width}x${height}.png`);
		return { blob, width, height, clamped };
	}

	onMount(() => {
		let disposed = false;
		let resizeObserver: ResizeObserver | null = null;
		let intersectionObserver: IntersectionObserver | null = null;
		let motionQuery: MediaQueryList | null = null;
		let motionObserver: MutationObserver | null = null;
		let removeCanvasListeners = () => {};

		onStatus('loading');
		currentPhase = galleryState.frozenPhase ?? galleryState.phase;
		previousRecipeHash = recipe.recipeHash;

		void (async () => {
			try {
				const { default: P5 } = await import('p5');
				if (disposed) return;
				instance = new P5((p) => {
					p.setup = () => {
						p.pixelDensity(Math.min(2, renderPixelDensity()));
						const renderer = p.createCanvas(
							Math.max(1, Math.round(host.clientWidth)),
							Math.max(1, Math.round(host.clientHeight))
						);
						canvasElement = renderer.elt as HTMLCanvasElement;
						canvasElement.dataset.invisibleWeatherCanvas = 'true';
						canvasElement.tabIndex = 0;
						canvasElement.setAttribute('role', 'img');
						canvasElement.setAttribute(
							'aria-label',
							'The Museum of Invisible Weather. A deterministic gallery wall. Click a frame to inspect it; use Left and Right Arrow keys to move between works, F to focus, N for a new exhibition, and Space to pause.'
						);
						canvasElement.setAttribute('aria-describedby', 'invisible-weather-instructions');
						p.noiseSeed(hashString(recipe.seed));
						p.randomSeed(hashString(`${recipe.seed}:p5`));
						p.frameRate(phaseCadence());

						const pointerDown = (event: PointerEvent) => {
							canvasElement?.focus({ preventScroll: true });
							if (!canvasElement || focusIndex !== null) return;
							const bounds = canvasElement.getBoundingClientRect();
							const x = (event.clientX - bounds.left) / Math.max(1, bounds.width);
							const y = (event.clientY - bounds.top) / Math.max(1, bounds.height);
							const index = frameAtPoint(
								recipe,
								x,
								y,
								resolvedOrientation(bounds.width, bounds.height)
							);
							if (index !== null) onSelect(index);
						};
						canvasElement.addEventListener('pointerdown', pointerDown);
						removeCanvasListeners = () =>
							canvasElement?.removeEventListener('pointerdown', pointerDown);

						resizeObserver = new ResizeObserver(() => {
							const width = Math.max(1, Math.round(host.clientWidth));
							const height = Math.max(1, Math.round(host.clientHeight));
							if (p.width !== width || p.height !== height) p.resizeCanvas(width, height, true);
							p.redraw();
						});
						resizeObserver.observe(host);
						ready = true;
						onStatus('ready');
						syncLoop();
					};

					p.draw = () => {
						if (shouldAnimate()) {
							currentPhase += (Math.min(80, p.deltaTime) / 1000) * phaseSpeed();
							if (p.millis() - lastPhaseReport >= 400) {
								lastPhaseReport = p.millis();
								onPhase(currentPhase);
							}
						}
						renderCurrent(p);
					};
				}, host);
			} catch (error) {
				if (disposed) return;
				onStatus(
					'error',
					error instanceof Error ? error.message : 'The gallery canvas could not be created.'
				);
			}
		})();

		motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			systemReducedMotion =
				motionQuery?.matches === true || document.documentElement.dataset.motion === 'still';
			onSystemMotionChange(systemReducedMotion);
			syncLoop();
		};
		motionQuery.addEventListener('change', updateMotion);
		motionObserver = new MutationObserver(updateMotion);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		updateMotion();

		const visibilityChange = () => {
			pageVisible = !document.hidden;
			syncLoop();
		};
		document.addEventListener('visibilitychange', visibilityChange);

		intersectionObserver = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				syncLoop();
			},
			{ rootMargin: '160px 0px', threshold: 0.01 }
		);
		intersectionObserver.observe(host);

		return () => {
			disposed = true;
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			motionQuery?.removeEventListener('change', updateMotion);
			motionObserver?.disconnect();
			document.removeEventListener('visibilitychange', visibilityChange);
			removeCanvasListeners();
			instance?.remove();
			instance = null;
			canvasElement = null;
			pathCache.clear();
		};
	});

	$effect(() => {
		if (recipe.recipeHash !== previousRecipeHash) {
			previousRecipeHash = recipe.recipeHash;
			currentPhase = galleryState.frozenPhase ?? galleryState.phase;
			pathCache.clear();
			lastCachePhase = Number.NaN;
			instance?.noiseSeed(hashString(recipe.seed));
			instance?.randomSeed(hashString(`${recipe.seed}:p5`));
		}
		void galleryState.selectedArtwork;
		void focusIndex;
		void galleryState.orientation;
		redraw();
	});

	$effect(() => {
		void paused;
		void galleryState.motion;
		void galleryState.speed;
		void allowMotionOverride;
		syncLoop();
	});
</script>

<div
	bind:this={host}
	class:ready
	class:poster-mode={posterMode}
	class="canvas-host"
	data-testid="invisible-weather-p5-host"
	data-recipe-hash={recipe.recipeHash}
	data-artwork-count={recipe.artworkCount}
	data-motion={(systemReducedMotion && !allowMotionOverride) ||
	galleryState.motion === 'still' ||
	paused
		? 'still'
		: galleryState.motion}
>
	<img
		class="poster"
		class:hidden={ready}
		src="/images/the-museum-of-invisible-weather.png"
		alt=""
		width="1600"
		height="900"
	/>
	<noscript>
		<p>
			The interactive canvas needs JavaScript. The poster and complete mathematical explanation
			remain available.
		</p>
	</noscript>
</div>

<style>
	.canvas-host {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 20rem;
		overflow: hidden;
		background: #d7cdbc;
		isolation: isolate;
	}

	.poster {
		position: absolute;
		z-index: 0;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: opacity 240ms ease;
	}

	.poster.hidden {
		pointer-events: none;
		opacity: 0;
	}

	.canvas-host :global(canvas) {
		position: relative;
		z-index: 1;
		display: block;
		width: 100% !important;
		height: 100% !important;
		touch-action: manipulation;
	}

	.canvas-host :global(canvas:focus-visible) {
		outline: 3px solid #f4e7c9;
		outline-offset: -5px;
		box-shadow: inset 0 0 0 6px #244d5a;
	}

	noscript p {
		position: absolute;
		z-index: 2;
		right: 1rem;
		bottom: 1rem;
		left: 1rem;
		margin: 0;
		background: rgb(255 255 255 / 92%);
		padding: 0.75rem;
		color: #211f1b;
		font: 600 0.75rem/1.4 var(--font-sans);
	}

	@media (prefers-reduced-motion: reduce) {
		.poster {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.canvas-host :global(canvas) {
			border: 2px solid CanvasText;
		}
	}
</style>
