<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		ChitinEngine,
		ChitinEngineStatus,
		ChitinExportOptions,
		ChitinRendererKind
	} from '$lib/visualizations/chitin-engine/engine';
	import type { ExhibitState } from '$lib/visualizations/chitin-engine/types';

	type Props = {
		state: ExhibitState;
		descriptionId: string;
		selectedSegment: number;
		reducedMotion?: boolean;
		posterMode?: boolean;
		threatActive?: boolean;
		startleSerial?: number;
		singleStepSerial?: number;
		onStatus?: (status: ChitinEngineStatus, message: string, renderer: ChitinRendererKind) => void;
		onSelection?: (segment: number) => void;
		onCameraChange?: (camera: Pick<ExhibitState, 'cameraYaw' | 'cameraPitch'>) => void;
	};
	const loadingSegments = Array.from({ length: 11 }, (_, index) => index);

	let {
		state: exhibitState,
		descriptionId,
		selectedSegment,
		reducedMotion = false,
		posterMode = false,
		threatActive = false,
		startleSerial = 0,
		singleStepSerial = 0,
		onStatus = () => {},
		onSelection = () => {},
		onCameraChange = () => {}
	}: Props = $props();

	let host: HTMLButtonElement;
	let engine = $state.raw<ChitinEngine | undefined>(undefined);
	let status = $state<ChitinEngineStatus>('loading');
	let renderer = $state<ChitinRendererKind>('canvas2d');
	let message = $state('Preparing the specimen chamber.');
	let systemReducedMotion = $state(false);
	let seenStartle = 0;
	let seenSingleStep = 0;

	export function focusCanvas() {
		host?.focus({ preventScroll: true });
	}

	export function getCanvasElement(): HTMLCanvasElement | undefined {
		return engine?.getCanvasElement();
	}

	export function getRendererKind(): ChitinRendererKind | undefined {
		return engine?.getRendererKind();
	}

	export async function exportStill(options: ChitinExportOptions): Promise<Blob> {
		if (!engine) throw new Error('The specimen renderer is still preparing.');
		return engine.exportStill(options);
	}

	onMount(() => {
		let disposed = false;
		let motionQuery: MediaQueryList | undefined;
		let motionObserver: MutationObserver | undefined;
		let removeMotionListener = () => {};

		const updateMotion = () => {
			systemReducedMotion =
				motionQuery?.matches === true || document.documentElement.dataset.motion === 'still';
			engine?.setReducedMotion(reducedMotion || systemReducedMotion);
		};

		if (typeof window.matchMedia === 'function') {
			motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			if (typeof motionQuery.addEventListener === 'function') {
				motionQuery.addEventListener('change', updateMotion);
				removeMotionListener = () => motionQuery?.removeEventListener('change', updateMotion);
			} else if (typeof motionQuery.addListener === 'function') {
				motionQuery.addListener(updateMotion);
				removeMotionListener = () => motionQuery?.removeListener(updateMotion);
			}
		}
		if (typeof MutationObserver !== 'undefined') {
			motionObserver = new MutationObserver(updateMotion);
			motionObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['data-motion']
			});
		}
		updateMotion();

		void import('$lib/visualizations/chitin-engine/engine')
			.then(({ ChitinEngine: Engine }) => {
				if (disposed) return;
				engine = new Engine({
					host,
					state: exhibitState,
					descriptionId,
					selectedSegment,
					reducedMotion: reducedMotion || systemReducedMotion,
					posterMode,
					onStatus: (nextStatus, nextMessage, nextRenderer) => {
						if (disposed) return;
						status = nextStatus;
						message = nextMessage;
						renderer = nextRenderer;
						onStatus(nextStatus, nextMessage, nextRenderer);
					},
					onSelection,
					onCameraChange
				});
			})
			.catch(() => {
				if (disposed) return;
				status = 'error';
				message =
					'The interactive renderer could not be loaded. The static specimen remains available.';
				onStatus(status, message, renderer);
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
		const nextState = { ...exhibitState, genome: { ...exhibitState.genome } };
		engine?.setState(nextState);
	});

	$effect(() => {
		const nextReducedMotion = reducedMotion || systemReducedMotion;
		engine?.setReducedMotion(nextReducedMotion);
	});

	$effect(() => {
		const nextPosterMode = posterMode;
		engine?.setPosterMode(nextPosterMode);
	});

	$effect(() => {
		const nextSelectedSegment = selectedSegment;
		engine?.setSelectedSegment(nextSelectedSegment);
	});

	$effect(() => {
		const nextThreatActive = threatActive;
		engine?.setThreat(nextThreatActive);
	});

	$effect(() => {
		const currentEngine = engine;
		const nextStartleSerial = startleSerial;
		if (currentEngine && nextStartleSerial > seenStartle) {
			seenStartle = nextStartleSerial;
			currentEngine.startle();
		}
	});

	$effect(() => {
		const currentEngine = engine;
		const nextSingleStepSerial = singleStepSerial;
		if (currentEngine && nextSingleStepSerial > seenSingleStep) {
			seenSingleStep = nextSingleStepSerial;
			currentEngine.singleStep();
		}
	});
</script>

<button
	type="button"
	bind:this={host}
	class:ready={status === 'ready' || status === 'fallback'}
	class:failed={status === 'error'}
	class:poster={posterMode}
	class="viewport-host"
	aria-label="Interactive rendering of the current Chitin Engine specimen"
	aria-describedby={descriptionId}
	data-testid="chitin-viewport"
	data-renderer={renderer}
	data-renderer-status={status}
	onclick={() => engine?.startle()}
>
	<img
		class="static-poster"
		src="/images/the-chitin-engine-xenobiological-foundry.png"
		alt=""
		width="1200"
		height="630"
		aria-hidden="true"
	/>
	<div class="loading-grammar" aria-hidden="true">
		<div class="axis"></div>
		{#each loadingSegments as index (index)}
			<i style={`--index: ${index}`}></i>
		{/each}
	</div>

	{#if status === 'context-lost'}
		<div class="renderer-notice recovery" role="status">{message}</div>
	{:else if status === 'error'}
		<div class="renderer-notice error" role="alert" tabindex="-1">
			<strong>Specimen chamber offline</strong>
			<span>{message}</span>
		</div>
	{:else if status === 'fallback'}
		<div class="fallback-badge">Canvas2D fallback</div>
	{/if}
</button>

<style>
	.viewport-host {
		appearance: none;
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 24rem;
		overflow: hidden;
		border-radius: 50% 46% 48% 44% / 46% 54% 44% 56%;
		background: #050511;
		border: 0;
		padding: 0;
		color: inherit;
		font: inherit;
		text-align: initial;
		isolation: isolate;
		outline: none;
	}

	.viewport-host:focus-visible {
		box-shadow:
			0 0 0 3px #c3ff67,
			0 0 0 7px rgb(0 0 0 / 70%);
	}

	.static-poster,
	.loading-grammar {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.static-poster {
		z-index: -2;
		object-fit: cover;
		opacity: 0.74;
		transition: opacity 360ms ease;
	}

	.viewport-host.ready .static-poster {
		opacity: 0;
	}
	.viewport-host.failed .static-poster {
		opacity: 0.9;
	}

	.loading-grammar {
		z-index: -1;
		background:
			radial-gradient(ellipse at center, rgb(81 31 112 / 22%), transparent 58%),
			linear-gradient(145deg, #080714, #03050d);
		opacity: 1;
		transition: opacity 260ms ease;
	}

	.viewport-host.ready .loading-grammar {
		opacity: 0;
	}

	.loading-grammar .axis {
		position: absolute;
		top: 50%;
		left: 17%;
		width: 66%;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgb(184 255 61 / 28%), transparent);
		transform: rotate(-7deg);
	}

	.loading-grammar i {
		position: absolute;
		top: calc(48% + (var(--index) - 5) * -0.45%);
		left: calc(21% + var(--index) * 5.7%);
		width: calc(7.2% - abs(var(--index) - 5) * 0.24%);
		aspect-ratio: 1.3;
		border: 1px solid rgb(157 99 219 / 28%);
		border-radius: 48% 52% 42% 58%;
		background: radial-gradient(circle at 38% 32%, rgb(113 52 170 / 24%), rgb(8 8 20 / 88%));
		transform: translate(-50%, -50%) rotate(-7deg);
	}

	.renderer-notice {
		position: absolute;
		z-index: 4;
		left: 50%;
		bottom: 1.2rem;
		display: grid;
		gap: 0.2rem;
		max-width: min(28rem, calc(100% - 2rem));
		padding: 0.75rem 0.9rem;
		border: 1px solid rgb(255 255 255 / 16%);
		border-radius: 0.6rem;
		background: rgb(4 5 13 / 92%);
		color: #d8dae4;
		font: 0.74rem/1.4 var(--font-sans, system-ui, sans-serif);
		transform: translateX(-50%);
	}

	.renderer-notice.error {
		border-color: rgb(255 111 131 / 42%);
	}
	.renderer-notice.recovery {
		border-color: rgb(193 255 105 / 36%);
	}
	.fallback-badge {
		position: absolute;
		z-index: 3;
		right: 1rem;
		bottom: 1rem;
		padding: 0.3rem 0.45rem;
		border-radius: 0.35rem;
		background: rgb(4 5 13 / 82%);
		color: #aeb1bf;
		font: 0.58rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.viewport-host.poster {
		border-radius: 0;
	}

	@media (max-width: 42rem) {
		.viewport-host {
			min-height: 21rem;
			border-radius: 45% 48% 43% 49% / 40% 46% 51% 55%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.static-poster,
		.loading-grammar {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.viewport-host {
			border: 2px solid CanvasText;
			border-radius: 0.5rem;
			background: Canvas;
		}
		.loading-grammar {
			display: none;
		}
	}
</style>
