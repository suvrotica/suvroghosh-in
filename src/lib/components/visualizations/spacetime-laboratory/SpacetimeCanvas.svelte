<script lang="ts">
	import { onMount } from 'svelte';
	import {
		SPACETIME_FRAGMENT_SOURCE,
		SPACETIME_VERTEX_SOURCE
	} from '$lib/visualizations/spacetime-laboratory/shaders/index';
	import { SpacetimeRenderer } from '$lib/visualizations/spacetime-laboratory/spacetimeRenderer';
	import {
		MODEL_IDS,
		QUALITY_PRESETS
	} from '$lib/visualizations/spacetime-laboratory/spacetimeTypes';
	import type { SpacetimeStore } from '$lib/visualizations/spacetime-laboratory/spacetimeStore.svelte';
	import { PHYSICAL_GW_STRAIN } from '$lib/visualizations/spacetime-laboratory/spacetimeMath';
	import { flrwSnapshot } from '$lib/visualizations/spacetime-laboratory/spacetimeCosmology';

	type Props = {
		store: SpacetimeStore;
		onwebglerror?: (message: string) => void;
		oncapture?: (capture: (() => string | null) | null) => void;
	};

	let { store, onwebglerror, oncapture }: Props = $props();

	let canvas: HTMLCanvasElement;
	let host: HTMLDivElement;
	let starting = $state(true);
	let invalidate = () => {};

	$effect(() => {
		// Read the complete scene here so paused frames redraw when a control changes.
		JSON.stringify({ state: store.state, time: store.time });
		invalidate();
	});

	function overlayBits(): number {
		const o = store.state.overlays;
		return (
			(o.grid ? 1 : 0) * 1 +
			(o.photonPaths ? 1 : 0) * 2 +
			(o.horizon ? 1 : 0) * 4 +
			(o.photonSphere ? 1 : 0) * 8 +
			(o.isco ? 1 : 0) * 16 +
			(o.ergosphere ? 1 : 0) * 32 +
			(o.redshiftMap ? 1 : 0) * 64
		);
	}

	onMount(() => {
		let startupFailed = false;
		const renderer = new SpacetimeRenderer(canvas, {
			onError: (message) => {
				startupFailed = true;
				starting = false;
				onwebglerror?.(message);
			}
		});
		const startup = new AbortController();

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		let animationFrame = 0;
		let previous = performance.now();
		let fpsCount = 0;
		let fpsSince = previous;
		let interacting = false;
		let interactTimer = 0;
		let inView = false;
		let dirty = true;
		let disposed = false;
		let contextLost = false;
		let rendered = false;

		function canDraw(forCapture = false) {
			return (
				renderer.ready &&
				!disposed &&
				!contextLost &&
				(inView || forCapture) &&
				document.visibilityState === 'visible'
			);
		}

		function schedule() {
			if (!animationFrame && canDraw()) animationFrame = requestAnimationFrame(draw);
		}

		invalidate = () => {
			dirty = true;
			schedule();
		};

		function cross3(a: readonly number[], b: readonly number[]): [number, number, number] {
			return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
		}

		function normalize3(a: readonly number[]): [number, number, number] {
			const len = Math.hypot(a[0], a[1], a[2]) || 1;
			return [a[0] / len, a[1] / len, a[2] / len];
		}

		function cameraBasis() {
			const obs = store.state.observer;
			const az = (obs.azimuthDeg * Math.PI) / 180;
			const el = (obs.elevationDeg * Math.PI) / 180;
			const r = obs.distance;
			const pos: [number, number, number] = [
				r * Math.cos(el) * Math.cos(az),
				r * Math.sin(el),
				r * Math.cos(el) * Math.sin(az)
			];
			const forward = normalize3([-pos[0], -pos[1], -pos[2]]);
			const right = normalize3(cross3(forward, [0, 1, 0]));
			const up = cross3(right, forward);
			return { pos, forward, right, up };
		}

		function draw(now: number, forCapture = false) {
			if (forCapture) cancelAnimationFrame(animationFrame);
			animationFrame = 0;
			if (!canDraw(forCapture)) return;
			const state = store.state;
			const quality = QUALITY_PRESETS[state.quality];
			const delta = Math.min(now - previous, 100);
			previous = now;

			const playing =
				state.playing && !reducedMotion.matches && document.visibilityState === 'visible';
			if (!dirty && !playing && !forCapture) return;
			dirty = false;
			fpsCount += 1;
			if (now - fpsSince >= 1000) {
				store.fps = playing ? Math.round((fpsCount * 1000) / (now - fpsSince)) : 0;
				fpsCount = 0;
				fpsSince = now;
			}
			if (playing && !forCapture) {
				store.time += (delta / 1000) * state.simulationSpeed;
			}

			const scale = interacting ? Math.min(quality.resolutionScale, 0.5) : quality.resolutionScale;
			const density = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
			const width = Math.max(1, Math.round(host.clientWidth * density));
			const height = Math.max(1, Math.round(host.clientHeight * density));

			const cam = cameraBasis();
			const p = state.params;
			const gwAmp = Math.min(
				0.5,
				Math.max(
					0,
					p.gwAmplitude * PHYSICAL_GW_STRAIN * (p.gwScale === 'physical' ? 1 : p.gwExaggeration)
				)
			);
			const cosmology =
				state.model === 'flrw' || (state.compare && state.compareModel === 'flrw')
					? flrwSnapshot(p, store.time)
					: { scaleFactor: 1, emittedScaleFactor: 1, expansionRate: 1 };

			renderer.render(width, height, {
				u_resolution: [width, height],
				u_time: store.time,
				u_split: [state.compare ? 1 : 0, state.compareSplit],
				u_modeA: MODEL_IDS[state.model],
				u_modeB: MODEL_IDS[state.compareModel],
				u_camPos: cam.pos,
				u_camForward: cam.forward,
				u_camRight: cam.right,
				u_camUp: cam.up,
				u_fovTan: Math.tan(((state.observer.fieldOfViewDeg / 2) * Math.PI) / 180),
				u_steps: quality.integrationSteps,
				u_rs: 2,
				u_spin: p.kerrSpin,
				u_charge: p.rnCharge,
				u_weakMu: p.weakCompactness,
				u_weakEx: p.weakMode === 'physical' ? 1 : p.weakExaggeration,
				u_lambda: p.lambdaH0,
				u_adsl: p.adSLength,
				u_flrwK: p.flrwCurvature,
				u_flrwA: cosmology.scaleFactor,
				u_flrwEmitA: cosmology.emittedScaleFactor,
				u_flrwH: cosmology.expansionRate,
				u_flrwView: p.flrwView === 'proper' ? 1 : 0,
				u_gwAmp: gwAmp,
				u_gwFreq: p.gwFrequency,
				u_gwPhase: p.gwPhase,
				u_gwPol: p.gwPolarization === 'cross' ? 1 : 0,
				u_gwChirp: p.gwChirp ? 1 : 0,
				u_gwRing: p.gwRing ? 1 : 0,
				u_gwArms: p.gwArms ? 1 : 0,
				u_disk: [state.disk.innerRadius, state.disk.outerRadius],
				u_diskTemp: state.disk.temperature,
				u_beaming: state.disk.beaming ? 1 : 0,
				u_overlayBits: overlayBits(),
				u_starDensity: state.sky.starDensity,
				u_galaxies: state.sky.galaxies ? 1 : 0,
				u_milkyway: state.sky.milkyWay ? 1 : 0,
				u_cmb: state.sky.cmb ? 1 : 0,
				u_seed: state.sky.seed,
				u_pixel: 1 / Math.min(width, height),
				u_speed: state.simulationSpeed,
				u_reduced: reducedMotion.matches ? 1 : 0
			});
			if (!rendered) {
				rendered = true;
				oncapture?.(() => {
					if (!renderer.ready || contextLost) return null;
					// Controls may be below the suspended viewport. Export their
					// current scene, rather than the last frame from before scrolling.
					draw(performance.now(), true);
					try {
						return canvas.toDataURL('image/png');
					} catch {
						return null;
					}
				});
			}

			if (playing) schedule();
		}

		function markInteracting() {
			interacting = true;
			window.clearTimeout(interactTimer);
			interactTimer = window.setTimeout(() => {
				interacting = false;
				invalidate();
			}, 350);
			invalidate();
		}

		function visibilityChanged() {
			previous = performance.now();
			if (!canDraw()) {
				cancelAnimationFrame(animationFrame);
				animationFrame = 0;
				store.fps = 0;
			} else invalidate();
		}

		function lost(event: Event) {
			event.preventDefault();
			if (disposed || startupFailed) return;
			contextLost = true;
			cancelAnimationFrame(animationFrame);
			animationFrame = 0;
			oncapture?.(null);
			onwebglerror?.(
				'The browser lost the WebGL graphics context. This can happen after a graphics-driver reset or GPU memory pressure. Retry to create a fresh renderer.'
			);
		}
		const motionChanged = () => invalidate();

		const resize = new ResizeObserver(() => invalidate());
		resize.observe(host);
		const intersection = new IntersectionObserver(([entry]) => {
			inView = entry.isIntersecting;
			visibilityChanged();
		});
		intersection.observe(host);
		canvas.addEventListener('webglcontextlost', lost);
		document.addEventListener('visibilitychange', visibilityChanged);
		reducedMotion.addEventListener('change', motionChanged);
		void renderer
			.init(SPACETIME_VERTEX_SOURCE, SPACETIME_FRAGMENT_SOURCE, startup.signal)
			.then((ready) => {
				if (disposed || !ready || contextLost) return;
				starting = false;
				invalidate();
			});

		host.addEventListener('pointermove', markInteracting, { passive: true });
		host.addEventListener('pointerdown', markInteracting, { passive: true });

		return () => {
			disposed = true;
			startup.abort();
			invalidate = () => {};
			oncapture?.(null);
			cancelAnimationFrame(animationFrame);
			window.clearTimeout(interactTimer);
			host.removeEventListener('pointermove', markInteracting);
			host.removeEventListener('pointerdown', markInteracting);
			canvas.removeEventListener('webglcontextlost', lost);
			document.removeEventListener('visibilitychange', visibilityChanged);
			reducedMotion.removeEventListener('change', motionChanged);
			resize.disconnect();
			intersection.disconnect();
			renderer.destroy();
		};
	});
</script>

<div bind:this={host} class="absolute inset-0">
	<canvas bind:this={canvas} class="block h-full w-full" aria-hidden="true"></canvas>
	{#if starting}
		<p
			class="pointer-events-none absolute inset-0 grid place-content-center text-sm text-slate-300"
			role="status"
		>
			Preparing graphics…
		</p>
	{/if}
</div>
