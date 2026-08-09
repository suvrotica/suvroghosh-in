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
	let pointerId: number | null = null;
	let pointerStartX = 0;
	let pointerStartY = 0;
	let pointerLastX = 0;
	let pointerLastY = 0;
	let looking = $state(false);

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
	export function enableAudioFromGesture(): Promise<boolean> {
		return engine?.enableAudioFromGesture() ?? Promise.resolve(false);
	}
	export function stopWalking() {
		engine?.stopWalking();
	}
	export function turnAround() {
		engine?.turnAround();
	}
	export function interact() {
		engine?.interact();
	}

	function beginPointer(event: PointerEvent): void {
		if (pointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;
		event.preventDefault();
		pointerId = event.pointerId;
		pointerStartX = pointerLastX = event.clientX;
		pointerStartY = pointerLastY = event.clientY;
		looking = event.pointerType === 'mouse' && event.button === 2;
		canvas.setPointerCapture(event.pointerId);
		canvas.focus({ preventScroll: true });
	}

	function movePointer(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		const totalDistance = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
		if (looking || totalDistance > (event.pointerType === 'touch' ? 18 : 8)) {
			looking = true;
			const deltaX = event.clientX - pointerLastX;
			const deltaY = event.clientY - pointerLastY;
			engine?.setLookOffset(deltaX, deltaY, true);
		}
		pointerLastX = event.clientX;
		pointerLastY = event.clientY;
	}

	function endPointer(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		event.preventDefault();
		const wasLooking = looking;
		const movement = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
		pointerId = null;
		looking = false;
		engine?.setLookOffset(0, 0, false);
		if (!wasLooking && movement < (event.pointerType === 'touch' ? 18 : 8)) {
			engine?.setWalkTarget(event.clientX, event.clientY);
		}
		if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}

	function cancelPointer(event?: PointerEvent): void {
		if (event && event.pointerId !== pointerId) return;
		const captured = pointerId;
		pointerId = null;
		looking = false;
		engine?.setLookOffset(0, 0, false);
		if (captured !== null && canvas?.hasPointerCapture(captured))
			canvas.releasePointerCapture(captured);
	}

	$effect(() => {
		const currentSettings = settings;
		engine?.setSettings(currentSettings);
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
			cancelPointer();
			engine = null;
			mountedEngine?.destroy();
		};
	});
</script>

<div
	bind:this={host}
	class:looking
	class="game-surface"
	data-control-scheme={settings.controlScheme}
>
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label="A three-dimensional North Calcutta neighbourhood. Click or tap a clear part of the road to walk there. Arrow Up walks forward, Left and Right turn, Down steps back, Space hurries, and Escape pauses."
		aria-describedby={`${uid}-canvas-help`}
		oncontextmenu={(event) => event.preventDefault()}
		onpointerdown={beginPointer}
		onpointermove={movePointer}
		onpointerup={endPointer}
		onpointercancel={cancelPointer}
		onlostpointercapture={cancelPointer}
	>
		Your browser cannot display the three-dimensional street. Instructions and results remain
		available as ordinary text.
	</canvas>
	<p id={`${uid}-canvas-help`} class="sr-only">
		Click or tap the road to walk there. Arrow Up walks forward. Left and Right turn. Down steps
		back. Space hurries briefly. Escape pauses. Press Enter when a nearby tea or food prompt is
		visible. Hold the right mouse button and drag to look around; releasing it returns the view
		behind you. Every important sound warning also appears as text.
	</p>
</div>

<style>
	.game-surface {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #8b897f;
		touch-action: none;
		overscroll-behavior: contain;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		outline: none;
		cursor: crosshair;
		touch-action: none;
		user-select: none;
	}

	.looking canvas {
		cursor: grabbing;
	}
	canvas:focus-visible {
		outline: 3px solid #f2c14e;
		outline-offset: -5px;
	}
</style>
