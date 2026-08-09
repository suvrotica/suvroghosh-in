<script lang="ts">
	import { onMount } from 'svelte';
	import type { ControlScheme } from '$lib/games/calcutta-footpath/settings';

	type Props = {
		controlScheme: ControlScheme;
		dashReady: boolean;
		walkingAutomatically: boolean;
		onvector: (x: number, y: number) => void;
		ondash: (pressed: boolean) => void;
		onpause: () => void;
		onstop: () => void;
		onturnaround: () => void;
	};

	let {
		controlScheme,
		dashReady,
		walkingAutomatically,
		onvector,
		ondash,
		onpause,
		onstop,
		onturnaround
	}: Props = $props();

	let activeDirection = $state<string | null>(null);
	let hurryPressed = $state(false);
	let directionReleaseTimer: ReturnType<typeof setTimeout> | undefined;
	let hurryReleaseTimer: ReturnType<typeof setTimeout> | undefined;

	function pressDirection(event: PointerEvent, id: string, x: number, y: number): void {
		if (event.pointerType === 'mouse') return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		activeDirection = id;
		onvector(x, y);
	}

	function releaseDirection(event?: PointerEvent): void {
		if (event?.pointerType === 'mouse') return;
		activeDirection = null;
		onvector(0, 0);
	}

	function keyDirection(event: KeyboardEvent, id: string, x: number, y: number): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		if (event.type === 'keydown' && !event.repeat) {
			activeDirection = id;
			onvector(x, y);
		} else if (event.type === 'keyup') {
			activeDirection = null;
			onvector(0, 0);
		}
	}

	function activateDirection(event: MouseEvent, id: string, x: number, y: number): void {
		// Physical touch/mouse input is handled as a hold above. A zero-detail click is the
		// activation shape used by keyboards and assistive technology, so give it a short pulse.
		if (event.detail !== 0) return;
		if (directionReleaseTimer) clearTimeout(directionReleaseTimer);
		activeDirection = id;
		onvector(x, y);
		directionReleaseTimer = setTimeout(() => {
			if (activeDirection === id) {
				activeDirection = null;
				onvector(0, 0);
			}
			directionReleaseTimer = undefined;
		}, 120);
	}

	function pressHurry(event: PointerEvent): void {
		if (!dashReady || event.pointerType === 'mouse') return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		hurryPressed = true;
		ondash(true);
	}

	function releaseHurry(event?: PointerEvent): void {
		if (event?.pointerType === 'mouse') return;
		hurryPressed = false;
		ondash(false);
	}

	function activateHurry(): void {
		if (!dashReady || hurryPressed) return;
		if (hurryReleaseTimer) clearTimeout(hurryReleaseTimer);
		hurryPressed = true;
		ondash(true);
		// Assistive technologies activate buttons as a click rather than a held pointer.
		// Keep the signal alive long enough for the fixed simulation step to observe it.
		hurryReleaseTimer = setTimeout(() => {
			hurryPressed = false;
			ondash(false);
			hurryReleaseTimer = undefined;
		}, 120);
	}

	function reset(): void {
		if (directionReleaseTimer) clearTimeout(directionReleaseTimer);
		if (hurryReleaseTimer) clearTimeout(hurryReleaseTimer);
		directionReleaseTimer = undefined;
		hurryReleaseTimer = undefined;
		activeDirection = null;
		hurryPressed = false;
		onvector(0, 0);
		ondash(false);
	}

	onMount(() => {
		window.addEventListener('blur', reset);
		return () => {
			window.removeEventListener('blur', reset);
			reset();
		};
	});
</script>

<div class="touch-controls" aria-label="Touch walking controls">
	{#if controlScheme === 'experienced'}
		<div class="steering" aria-label="Optional touch steering">
			<button
				type="button"
				class:active={activeDirection === 'left'}
				onclick={(event) => activateDirection(event, 'left', -1, -0.35)}
				onpointerdown={(event) => pressDirection(event, 'left', -1, -0.35)}
				onpointerup={releaseDirection}
				onpointercancel={releaseDirection}
				onkeydown={(event) => keyDirection(event, 'left', -1, -0.35)}
				onkeyup={(event) => keyDirection(event, 'left', -1, -0.35)}
				onblur={() => releaseDirection()}>Turn left</button
			>
			<button
				type="button"
				class:active={activeDirection === 'forward'}
				onclick={(event) => activateDirection(event, 'forward', 0, -1)}
				onpointerdown={(event) => pressDirection(event, 'forward', 0, -1)}
				onpointerup={releaseDirection}
				onpointercancel={releaseDirection}
				onkeydown={(event) => keyDirection(event, 'forward', 0, -1)}
				onkeyup={(event) => keyDirection(event, 'forward', 0, -1)}
				onblur={() => releaseDirection()}>Walk</button
			>
			<button
				type="button"
				class:active={activeDirection === 'right'}
				onclick={(event) => activateDirection(event, 'right', 1, -0.35)}
				onpointerdown={(event) => pressDirection(event, 'right', 1, -0.35)}
				onpointerup={releaseDirection}
				onpointercancel={releaseDirection}
				onkeydown={(event) => keyDirection(event, 'right', 1, -0.35)}
				onkeyup={(event) => keyDirection(event, 'right', 1, -0.35)}
				onblur={() => releaseDirection()}>Turn right</button
			>
		</div>
	{/if}

	<div class="actions">
		{#if walkingAutomatically}
			<button type="button" class="stop" onclick={onstop}>Stop</button>
		{/if}
		<button type="button" onclick={onturnaround}>Turn around</button>
		<button
			type="button"
			class:active={hurryPressed}
			disabled={!dashReady}
			onclick={activateHurry}
			onpointerdown={pressHurry}
			onpointerup={releaseHurry}
			onpointercancel={releaseHurry}>{dashReady ? 'Hurry' : 'Resting'}</button
		>
		<button type="button" class="pause" onclick={onpause}>Pause</button>
	</div>
</div>

<style>
	.touch-controls {
		position: absolute;
		z-index: 25;
		inset: 0;
		display: none;
		overflow: hidden;
		pointer-events: none;
		font-family: var(--font-sans, system-ui, sans-serif);
		-webkit-tap-highlight-color: transparent;
	}

	.actions,
	.steering {
		position: absolute;
		display: flex;
		pointer-events: auto;
		gap: 0.38rem;
	}

	.actions {
		right: max(0.65rem, env(safe-area-inset-right));
		bottom: max(0.65rem, env(safe-area-inset-bottom));
		left: max(0.65rem, env(safe-area-inset-left));
		justify-content: center;
	}

	.steering {
		right: max(0.65rem, env(safe-area-inset-right));
		bottom: max(4rem, calc(env(safe-area-inset-bottom) + 3.5rem));
		left: max(0.65rem, env(safe-area-inset-left));
		justify-content: center;
	}

	button {
		min-width: 4.25rem;
		min-height: 3rem;
		border: 1px solid rgb(255 244 219 / 48%);
		border-radius: 0.65rem;
		background: rgb(20 18 15 / 76%);
		padding: 0.5rem 0.7rem;
		color: #fff7e5;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 820;
		line-height: 1.1;
		touch-action: none;
		backdrop-filter: blur(7px);
	}

	button.active,
	button.stop {
		border-color: #f1d38f;
		background: #e7c271;
		color: #251b12;
	}

	button.pause {
		background: rgb(102 54 39 / 88%);
	}
	button:disabled {
		opacity: 0.62;
		cursor: not-allowed;
	}

	@media (hover: none), (pointer: coarse) {
		.touch-controls {
			display: block;
		}
	}

	@media (orientation: landscape) and (max-height: 33rem) {
		.actions {
			justify-content: flex-end;
		}
		.steering {
			justify-content: flex-start;
			bottom: max(0.65rem, env(safe-area-inset-bottom));
		}
		button {
			min-height: 2.75rem;
		}
	}
</style>
