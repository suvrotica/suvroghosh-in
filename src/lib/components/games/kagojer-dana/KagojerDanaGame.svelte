<script lang="ts">
	import { onMount } from 'svelte';
	import type { FlightEngineApi, FlightEngineOptions } from '$lib/games/kagojer-dana/runtime-types';
	import type { KagojerDanaSettings, QualityMode } from '$lib/games/kagojer-dana/settings';

	let {
		seed,
		mode,
		settings,
		audioContext,
		callbacks
	}: FlightEngineOptions & { settings: KagojerDanaSettings } = $props();

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let engine: FlightEngineApi | null = null;

	export function pause(byVisibility = false) {
		engine?.pause(byVisibility);
	}

	export function resume() {
		engine?.resume();
		canvas?.focus({ preventScroll: true });
	}

	export function resize() {
		engine?.resize();
	}

	export function setMuted(muted: boolean) {
		engine?.setMuted(muted);
	}

	export function enableAudioFromGesture(context: AudioContext): Promise<boolean> {
		return engine?.enableAudioFromGesture(context) ?? Promise.resolve(false);
	}

	export function setQuality(quality: QualityMode) {
		engine?.setQuality(quality);
	}

	export function setTouchVector(bank: number, pitch: number) {
		engine?.setTouchVector(bank, pitch);
	}

	export function relaunch() {
		engine?.relaunch();
		canvas?.focus({ preventScroll: true });
	}

	export function finish() {
		engine?.finish();
	}

	export function focusCanvas() {
		canvas?.focus({ preventScroll: true });
	}

	$effect(() => {
		const currentSettings = settings;
		engine?.setSettings(currentSettings);
	});

	onMount(() => {
		let disposed = false;
		let mountedEngine: FlightEngineApi | null = null;
		const closeUnclaimedAudio = () => {
			if (mountedEngine || !audioContext || audioContext.state === 'closed') return;
			void audioContext.close().catch(() => undefined);
		};

		void import('$lib/games/kagojer-dana/GameController')
			.then(({ createKagojerDanaController }) => {
				if (disposed) return;
				mountedEngine = createKagojerDanaController(canvas, host, {
					seed,
					mode,
					settings,
					audioContext,
					callbacks
				});
				engine = mountedEngine;
				mountedEngine.start();
				canvas.focus({ preventScroll: true });
			})
			.catch((cause) => {
				closeUnclaimedAudio();
				if (disposed) return;
				console.error('Could not load Kagojer Dana:', cause);
				callbacks.onError(
					cause instanceof Error ? cause.message : 'The paper plane could not find the wind.'
				);
			});

		return () => {
			disposed = true;
			engine = null;
			if (mountedEngine) mountedEngine.destroy();
			else closeUnclaimedAudio();
		};
	});
</script>

<div bind:this={host} class="game-surface">
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label="A three-dimensional paper-plane flight through Calcutta. W or Arrow Up raises the nose, S or Arrow Down lowers it, A and D or Left and Right bank, Escape pauses, R relaunches, M mutes, and F enters fullscreen."
		oncontextmenu={(event) => event.preventDefault()}
	>
		Your browser cannot display the three-dimensional flight. The poster, controls and article
		remain available as ordinary text.
	</canvas>
</div>

<style>
	.game-surface {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #b8aa8e;
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
		outline: 3px solid #ffd76a;
		outline-offset: -5px;
	}
</style>
