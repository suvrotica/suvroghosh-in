<script lang="ts">
	import { onMount } from 'svelte';
	import type { ControlScheme } from '$lib/games/calcutta-footpath/settings';

	type Props = {
		side: 'left' | 'right';
		controlScheme: ControlScheme;
		dashReady: boolean;
		onvector: (x: number, y: number) => void;
		ondash: (pressed: boolean) => void;
		onpause: () => void;
	};

	let { side, controlScheme, dashReady, onvector, ondash, onpause }: Props = $props();

	let joystick: HTMLDivElement;
	let dashButton: HTMLButtonElement;
	let joystickPointer = $state<number | null>(null);
	let dashPointer = $state<number | null>(null);
	let dashKeyboardPressed = $state(false);
	let thumbX = $state(0);
	let thumbY = $state(0);
	let dashPressed = $state(false);

	function isPrimaryMouseButton(event: PointerEvent): boolean {
		return event.pointerType !== 'mouse' || event.button === 0;
	}

	function updateJoystick(event: PointerEvent): void {
		if (event.pointerId !== joystickPointer) return;
		event.preventDefault();

		const bounds = joystick.getBoundingClientRect();
		const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.32);
		const rawX = event.clientX - (bounds.left + bounds.width / 2);
		const rawY = event.clientY - (bounds.top + bounds.height / 2);
		const length = Math.hypot(rawX, rawY);
		const scale = length > radius ? radius / length : 1;

		thumbX = rawX * scale;
		thumbY = rawY * scale;
		onvector(thumbX / radius, thumbY / radius);
	}

	function beginJoystick(event: PointerEvent): void {
		if (joystickPointer !== null || !isPrimaryMouseButton(event)) return;
		event.preventDefault();
		joystickPointer = event.pointerId;
		joystick.setPointerCapture(event.pointerId);
		updateJoystick(event);
	}

	function resetJoystick(pointerId = joystickPointer): void {
		if (pointerId === null || joystickPointer !== pointerId) return;
		joystickPointer = null;
		thumbX = 0;
		thumbY = 0;
		onvector(0, 0);
		if (joystick?.hasPointerCapture(pointerId)) joystick.releasePointerCapture(pointerId);
	}

	function endJoystick(event: PointerEvent): void {
		resetJoystick(event.pointerId);
	}

	function beginDash(event: PointerEvent): void {
		if (dashPointer !== null || !dashReady || !isPrimaryMouseButton(event)) return;
		event.preventDefault();
		dashPointer = event.pointerId;
		dashPressed = true;
		dashButton.setPointerCapture(event.pointerId);
		ondash(true);
	}

	function resetDashPointer(pointerId = dashPointer): void {
		if (pointerId === null || dashPointer !== pointerId) return;
		dashPointer = null;
		dashPressed = dashKeyboardPressed;
		if (!dashKeyboardPressed) ondash(false);
		if (dashButton?.hasPointerCapture(pointerId)) dashButton.releasePointerCapture(pointerId);
	}

	function endDash(event: PointerEvent): void {
		resetDashPointer(event.pointerId);
	}

	function handleDashKeydown(event: KeyboardEvent): void {
		if (
			(event.key !== ' ' && event.key !== 'Enter') ||
			event.repeat ||
			dashKeyboardPressed ||
			!dashReady
		)
			return;
		event.preventDefault();
		dashKeyboardPressed = true;
		dashPressed = true;
		ondash(true);
	}

	function handleDashKeyup(event: KeyboardEvent): void {
		if ((event.key !== ' ' && event.key !== 'Enter') || !dashKeyboardPressed) return;
		event.preventDefault();
		dashKeyboardPressed = false;
		dashPressed = dashPointer !== null;
		if (dashPointer === null) ondash(false);
	}

	function resetKeyboardDash(): void {
		if (!dashKeyboardPressed) return;
		dashKeyboardPressed = false;
		dashPressed = dashPointer !== null;
		if (dashPointer === null) ondash(false);
	}

	function resetAll(): void {
		resetJoystick();
		resetDashPointer();
		resetKeyboardDash();
	}

	onMount(() => {
		window.addEventListener('blur', resetAll);
		return () => {
			window.removeEventListener('blur', resetAll);
			resetAll();
			onvector(0, 0);
			ondash(false);
		};
	});
</script>

<div
	class="touch-controls"
	data-control-scheme={controlScheme}
	data-side={side}
	aria-label="Touch game controls"
>
	<div
		bind:this={joystick}
		class:active={joystickPointer !== null}
		class="joystick"
		role="application"
		aria-label="Movement joystick. Drag in the direction you want to walk."
		onpointerdown={beginJoystick}
		onpointermove={updateJoystick}
		onpointerup={endJoystick}
		onpointercancel={endJoystick}
		onlostpointercapture={endJoystick}
	>
		<span class="joystick-arrows" aria-hidden="true">↑<i>→</i><b>↓</b><em>←</em></span>
		<span
			class="joystick-thumb"
			aria-hidden="true"
			style:transform={`translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`}
		></span>
	</div>

	<div class="touch-actions">
		<button type="button" class="pause" onclick={onpause} aria-label="Pause game">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M7 5.5h3v13H7zM14 5.5h3v13h-3z"></path>
			</svg>
			<span>Pause</span>
		</button>

		<button
			bind:this={dashButton}
			type="button"
			class:pressed={dashPressed}
			class:ready={dashReady}
			class="dash"
			aria-label={dashReady ? 'Dash or squeeze' : 'Dash recharging'}
			aria-disabled={!dashReady}
			aria-pressed={dashPressed}
			onpointerdown={beginDash}
			onpointerup={endDash}
			onpointercancel={endDash}
			onlostpointercapture={endDash}
			onkeydown={handleDashKeydown}
			onkeyup={handleDashKeyup}
			onblur={resetKeyboardDash}
		>
			<span aria-hidden="true">»</span>
			<strong>{dashReady ? 'Dash' : 'Wait'}</strong>
		</button>
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

	.joystick,
	.touch-actions {
		position: absolute;
		bottom: max(0.85rem, env(safe-area-inset-bottom));
		pointer-events: auto;
	}

	.joystick {
		width: clamp(7.5rem, 25vw, 9rem);
		height: clamp(7.5rem, 25vw, 9rem);
		overflow: hidden;
		border: 2px solid rgb(255 239 207 / 62%);
		border-radius: 50%;
		background:
			radial-gradient(circle at center, rgb(255 255 255 / 8%) 0 40%, transparent 41%),
			rgb(23 17 13 / 62%);
		box-shadow:
			inset 0 0 1.5rem rgb(0 0 0 / 38%),
			0 0.45rem 1.5rem rgb(0 0 0 / 30%);
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		backdrop-filter: blur(5px);
	}

	[data-side='left'] .joystick,
	[data-side='right'] .touch-actions {
		left: max(0.85rem, env(safe-area-inset-left));
	}

	[data-side='right'] .joystick,
	[data-side='left'] .touch-actions {
		right: max(0.85rem, env(safe-area-inset-right));
	}

	.joystick::before,
	.joystick::after {
		position: absolute;
		background: rgb(255 244 219 / 24%);
		content: '';
		pointer-events: none;
	}

	.joystick::before {
		top: 50%;
		right: 12%;
		left: 12%;
		height: 1px;
	}

	.joystick::after {
		top: 12%;
		bottom: 12%;
		left: 50%;
		width: 1px;
	}

	.joystick.active {
		border-color: #ffe4a1;
		background-color: rgb(36 25 17 / 75%);
	}

	.joystick-arrows {
		position: absolute;
		inset: 0;
		color: rgb(255 246 227 / 58%);
		font-size: 0.72rem;
		font-style: normal;
		font-weight: 900;
		line-height: 1;
		pointer-events: none;
	}

	.joystick-arrows i,
	.joystick-arrows b,
	.joystick-arrows em {
		font-style: normal;
	}

	.joystick-arrows {
		padding-top: 0.42rem;
		text-align: center;
	}

	.joystick-arrows i {
		position: absolute;
		top: 50%;
		right: 0.42rem;
		transform: translateY(-50%);
	}

	.joystick-arrows b {
		position: absolute;
		bottom: 0.42rem;
		left: 50%;
		transform: translateX(-50%);
	}

	.joystick-arrows em {
		position: absolute;
		top: 50%;
		left: 0.42rem;
		transform: translateY(-50%);
	}

	.joystick-thumb {
		position: absolute;
		top: 50%;
		left: 50%;
		width: clamp(2.8rem, 9vw, 3.35rem);
		height: clamp(2.8rem, 9vw, 3.35rem);
		border: 2px solid rgb(255 248 230 / 82%);
		border-radius: 50%;
		background: rgb(164 103 44 / 88%);
		box-shadow:
			inset 0 0.2rem 0.5rem rgb(255 240 199 / 20%),
			0 0.3rem 0.8rem rgb(0 0 0 / 38%);
		pointer-events: none;
	}

	.touch-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.65rem;
	}

	.touch-actions button {
		display: grid;
		place-items: center;
		border: 2px solid rgb(255 239 207 / 64%);
		background: rgb(30 21 15 / 79%);
		box-shadow: 0 0.4rem 1.2rem rgb(0 0 0 / 34%);
		color: #fff8e7;
		font: inherit;
		font-weight: 850;
		cursor: pointer;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		backdrop-filter: blur(6px);
	}

	.touch-actions button:focus-visible {
		outline: 3px solid #fff2bd;
		outline-offset: 3px;
	}

	.pause {
		width: 3.25rem;
		min-width: 2.75rem;
		height: 3.25rem;
		min-height: 2.75rem;
		border-radius: 0.7rem;
	}

	.pause svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: currentColor;
	}

	.pause span {
		font-size: 0.55rem;
		letter-spacing: 0.04em;
		line-height: 1;
		text-transform: uppercase;
	}

	.dash {
		width: clamp(5rem, 17vw, 6rem);
		height: clamp(5rem, 17vw, 6rem);
		border-radius: 50%;
		opacity: 0.58;
	}

	.dash.ready {
		border-color: #ffe09a;
		background: rgb(125 70 24 / 88%);
		opacity: 1;
	}

	.dash.pressed {
		background: #f5b843;
		color: #25150c;
		transform: scale(0.94);
	}

	.dash > span {
		font-size: 1.8rem;
		line-height: 0.7;
	}

	.dash strong {
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		line-height: 1;
		text-transform: uppercase;
	}

	@media (pointer: coarse) {
		.touch-controls[data-control-scheme='auto'] {
			display: block;
		}
	}

	.touch-controls[data-control-scheme='joystick'],
	.touch-controls[data-control-scheme='drag'] {
		display: block;
	}

	.touch-controls[data-control-scheme='keyboard'] {
		display: none;
	}

	.touch-controls[data-control-scheme='drag'] .joystick {
		display: none;
	}

	@media (pointer: coarse) and (max-height: 31rem) and (orientation: landscape) {
		.joystick {
			width: clamp(2.75rem, 31vh, 7rem);
			height: clamp(2.75rem, 31vh, 7rem);
		}

		.dash {
			width: clamp(2.75rem, 23vh, 4.75rem);
			height: clamp(2.75rem, 23vh, 4.75rem);
		}

		.touch-actions {
			flex-direction: row;
			align-items: flex-end;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dash {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.joystick,
		.touch-actions button {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
			forced-color-adjust: none;
		}
	}
</style>
