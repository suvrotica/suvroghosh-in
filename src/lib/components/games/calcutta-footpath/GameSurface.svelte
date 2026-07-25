<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		EnginePublicApi,
		HudSnapshot,
		RunResult,
		RuntimePhase
	} from '$lib/games/calcutta-footpath/runtime-types';
	import type { GameSettings } from '$lib/games/calcutta-footpath/settings';
	import type { InputCommand } from '$lib/games/calcutta-footpath/input';

	type Props = {
		seed: string;
		settings: GameSettings;
		tutorial: boolean;
		previousFailedRuns: number;
		onready(): void;
		onhud(snapshot: HudSnapshot): void;
		onphase(phase: RuntimePhase): void;
		onresult(result: RunResult): void;
		onerror(message: string): void;
		oncommand(command: InputCommand): void;
	};

	let {
		seed,
		settings,
		tutorial,
		previousFailedRuns,
		onready,
		onhud,
		onphase,
		onresult,
		onerror,
		oncommand
	}: Props = $props();
	const uid = $props.id();
	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let engine: EnginePublicApi | null = null;
	let dragPointer: number | null = null;
	let dragOriginX = 0;
	let dragOriginY = 0;

	export function pause(byVisibility = false) {
		engine?.pause(byVisibility);
	}

	export function resume() {
		engine?.resume();
	}

	export function restart(
		nextSeed: string,
		withTutorial: boolean,
		nextPreviousFailedRuns?: number
	) {
		engine?.restart(nextSeed, withTutorial, nextPreviousFailedRuns);
		canvas?.focus({ preventScroll: true });
	}

	export function setTouchVector(x: number, y: number) {
		engine?.setTouchVector(x, y);
	}

	export function setTouchDash(pressed: boolean) {
		engine?.setTouchDash(pressed);
	}

	export function focusCanvas() {
		canvas?.focus({ preventScroll: true });
	}

	export function enableAudioFromGesture() {
		engine?.enableAudioFromGesture();
	}

	function updateDrag(event: PointerEvent): void {
		if (event.pointerId !== dragPointer || settings.controlScheme !== 'drag') return;
		event.preventDefault();
		const radius = 82;
		const x = event.clientX - dragOriginX;
		const y = event.clientY - dragOriginY;
		const length = Math.max(1, Math.hypot(x, y));
		const scale = length > radius ? radius / length : 1;
		engine?.setTouchVector((x * scale) / radius, (y * scale) / radius);
	}

	function beginDrag(event: PointerEvent): void {
		if (
			settings.controlScheme !== 'drag' ||
			dragPointer !== null ||
			(event.pointerType === 'mouse' && event.button !== 0)
		) {
			return;
		}
		event.preventDefault();
		dragPointer = event.pointerId;
		dragOriginX = event.clientX;
		dragOriginY = event.clientY;
		canvas.setPointerCapture(event.pointerId);
		canvas.focus({ preventScroll: true });
	}

	function endDrag(event?: PointerEvent): void {
		if (event && event.pointerId !== dragPointer) return;
		const pointerId = dragPointer;
		dragPointer = null;
		engine?.setTouchVector(0, 0);
		if (pointerId !== null && canvas?.hasPointerCapture(pointerId)) {
			canvas.releasePointerCapture(pointerId);
		}
	}

	$effect(() => {
		const currentSettings = settings;
		engine?.setSettings(currentSettings);
		if (currentSettings.controlScheme !== 'drag' && dragPointer !== null) endDrag();
	});

	onMount(() => {
		let disposed = false;
		let mountedEngine: EnginePublicApi | null = null;

		void import('$lib/games/calcutta-footpath/engine')
			.then(({ createCalcuttaFootpathEngine }) => {
				if (disposed) return;
				mountedEngine = createCalcuttaFootpathEngine(canvas, host, {
					seed,
					settings,
					tutorial,
					previousFailedRuns,
					callbacks: {
						onReady: onready,
						onHud: onhud,
						onPhase: onphase,
						onResult: onresult,
						onError: onerror,
						onCommand: oncommand
					}
				});
				engine = mountedEngine;
				canvas.focus({ preventScroll: true });
			})
			.catch((cause) => {
				if (disposed) return;
				console.error('Could not load Calcutta Footpath Simulator:', cause);
				onerror(cause instanceof Error ? cause.message : 'The street engine could not be loaded.');
			});

		return () => {
			disposed = true;
			endDrag();
			engine = null;
			mountedEngine?.destroy();
		};
	});
</script>

<div
	bind:this={host}
	class:drag-mode={settings.controlScheme === 'drag'}
	class="game-surface"
	data-control-scheme={settings.controlScheme}
>
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label="Calcutta Footpath Simulator street. Guide an ordinary pedestrian through a changing pavement full of moving urban hazards."
		aria-describedby={`${uid}-canvas-help`}
		oncontextmenu={(event) => event.preventDefault()}
		onpointerdown={beginDrag}
		onpointermove={updateDrag}
		onpointerup={endDrag}
		onpointercancel={endDrag}
		onlostpointercapture={endDrag}
	>
		Your browser cannot display the game canvas. The instructions and game description remain
		available as ordinary text below the game.
	</canvas>
	<p id={`${uid}-canvas-help`} class="sr-only">
		Use WASD or arrow keys to move, Shift or Space to dash and squeeze, P or Escape to pause, M to
		mute, and F for fullscreen. Touch controls appear on touch devices; Drag to walk can be chosen
		in settings. Important warnings and results are also shown outside the canvas.
	</p>
</div>

<style>
	.game-surface {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #282521;
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

	.drag-mode canvas {
		cursor: grab;
	}

	.drag-mode canvas:active {
		cursor: grabbing;
	}

	canvas:focus-visible {
		outline: 3px solid #f2c14e;
		outline-offset: -5px;
	}
</style>
