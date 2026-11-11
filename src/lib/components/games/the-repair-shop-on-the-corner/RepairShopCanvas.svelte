<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		RepairShopRuntimeApi,
		WorkbenchActionPayload
	} from '$lib/games/the-repair-shop-on-the-corner/runtime';
	import type {
		RepairShopGameState,
		RepairShopSettings,
		Vec2
	} from '$lib/games/the-repair-shop-on-the-corner/types';

	let {
		initialState,
		settings,
		paused = false,
		primedAudioContext,
		onStateChange,
		onSaveMilestone,
		onRequestPauseToggle,
		onReady,
		onWebGLError
	}: {
		initialState: RepairShopGameState;
		settings: RepairShopSettings;
		paused?: boolean;
		primedAudioContext?: AudioContext;
		onStateChange: (state: RepairShopGameState) => void;
		onSaveMilestone: (state: RepairShopGameState) => void;
		onRequestPauseToggle: () => void;
		onReady?: () => void;
		onWebGLError: (message: string) => void;
	} = $props();

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let runtime: RepairShopRuntimeApi | null = null;

	export function replaceState(nextState: RepairShopGameState) {
		runtime?.replaceState(nextState);
	}

	export function interactWithTarget(targetId: string) {
		runtime?.interactWithTarget(targetId);
	}

	export function walkToPlace(point: Vec2) {
		runtime?.walkToPlace(point);
	}

	export function chooseDialogue(choiceId: string) {
		runtime?.chooseDialogue(choiceId);
	}

	export function closeDrawerNotice() {
		runtime?.closeDrawerNotice();
	}

	export function dispatchWorkbench(action: WorkbenchActionPayload) {
		runtime?.dispatchWorkbench(action);
	}

	export function finishScreening() {
		runtime?.finishScreening();
	}

	export function focusCanvas() {
		runtime?.focusCanvas();
	}

	export function enableAudioFromGesture(existingContext?: AudioContext): Promise<boolean> {
		return runtime?.enableAudioFromGesture(existingContext) ?? Promise.resolve(false);
	}

	$effect(() => {
		runtime?.setSettings(settings);
	});

	$effect(() => {
		runtime?.setPaused(paused);
	});

	onMount(() => {
		let disposed = false;
		let mountedRuntime: RepairShopRuntimeApi | null = null;

		const closeUnclaimedAudio = () => {
			if (mountedRuntime || !primedAudioContext || primedAudioContext.state === 'closed') return;
			void primedAudioContext.close().catch(() => undefined);
		};

		void import('$lib/games/the-repair-shop-on-the-corner/runtime')
			.then(async ({ createRepairShopRuntime }) => {
				if (disposed) {
					closeUnclaimedAudio();
					return;
				}
				mountedRuntime = createRepairShopRuntime(canvas, host, initialState, settings, {
					onStateChange,
					onSaveMilestone,
					onRequestPauseToggle,
					onWebGLError
				});
				runtime = mountedRuntime;
				mountedRuntime.setPaused(paused);
				if (settings.soundEnabled && primedAudioContext) {
					await mountedRuntime.enableAudioFromGesture(primedAudioContext);
				}
				onReady?.();
			})
			.catch((err) => {
				closeUnclaimedAudio();
				if (disposed) return;
				onWebGLError(
					err instanceof Error
						? err.message
						: 'Could not start the 3D workshop view in this browser.'
				);
			});

		return () => {
			disposed = true;
			runtime = null;
			if (mountedRuntime) {
				mountedRuntime.destroy();
			} else {
				closeUnclaimedAudio();
			}
		};
	});
</script>

<div bind:this={host} class="repair-canvas-host">
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label="3D view of Kusumtala Corner repair shop, lane, tea stall, Sen Brothers, and shared courtyard. Use WASD or Arrow keys to walk, E or Enter to interact nearby, or use the labelled HTML controls beside the view."
		oncontextmenu={(event) => event.preventDefault()}
	>
		Your browser could not display the 3D canvas. The game description and instructions remain
		readable below.
	</canvas>
</div>

<style>
	.repair-canvas-host {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 220px;
		overflow: hidden;
		background: #231d18;
		touch-action: none;
		overscroll-behavior: contain;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		outline: none;
		touch-action: none;
		user-select: none;
	}

	canvas:focus-visible {
		outline: 3px solid #f5b95f;
		outline-offset: -4px;
	}
</style>
