<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		description?: string;
		onclose: () => void;
		children: Snippet;
		wide?: boolean;
	};

	let { title, description, onclose, children, wide = false }: Props = $props();

	const instanceId = $props.id();
	const titleId = `${instanceId}-title`;
	const descriptionId = `${instanceId}-description`;

	let dialog: HTMLDialogElement;
	let closeButton: HTMLButtonElement;
	let previouslyFocused: HTMLElement | null = null;
	let focusFrame: number | null = null;
	let closeReported = false;
	let tearingDown = false;

	function restoreFocus() {
		if (previouslyFocused?.isConnected) {
			previouslyFocused.focus({ preventScroll: true });
		}
	}

	onMount(() => {
		previouslyFocused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;

		if (!dialog.open) dialog.showModal();
		focusFrame = requestAnimationFrame(() => {
			focusFrame = null;
			closeButton?.focus({ preventScroll: true });
		});

		return () => {
			tearingDown = true;
			if (focusFrame !== null) cancelAnimationFrame(focusFrame);
			if (dialog.open) dialog.close();
			restoreFocus();
		};
	});

	function close() {
		if (dialog?.open) dialog.close();
	}

	function handleClose() {
		if (tearingDown || closeReported) return;
		closeReported = true;
		restoreFocus();
		onclose();
	}

	function handleBackdrop(event: MouseEvent) {
		if (event.target === dialog) close();
	}
</script>

<dialog
	bind:this={dialog}
	class:wide
	aria-labelledby={titleId}
	aria-describedby={description ? descriptionId : undefined}
	onclose={handleClose}
	onclick={handleBackdrop}
>
	<section class="dialog-frame">
		<header>
			<div class="heading">
				<p class="kicker">Calcutta Footpath Simulator</p>
				<h2 id={titleId}>{title}</h2>
				{#if description}
					<p id={descriptionId} class="description">{description}</p>
				{/if}
			</div>

			<button
				bind:this={closeButton}
				type="button"
				class="close-button"
				onclick={close}
				aria-label="Close dialog"
			>
				<span aria-hidden="true">×</span>
			</button>
		</header>

		<div class="dialog-body">
			{@render children()}
		</div>
	</section>
</dialog>

<style>
	dialog {
		--game-paper: #ead9b2;
		--game-paper-light: #f6e8c8;
		--game-paper-dark: #c9a96f;
		--game-ink: #2b2118;
		--game-ink-soft: #61503b;
		--game-wall: #294a40;
		--game-wall-dark: #172f2b;
		--game-red: #9f3d2c;
		--game-yellow: #d19a2c;
		position: fixed;
		inset: 0;
		width: min(
			42rem,
			calc(
				100% - max(0.75rem, env(safe-area-inset-left)) - max(0.75rem, env(safe-area-inset-right))
			)
		);
		max-width: none;
		max-height: calc(100vh - 1.5rem);
		max-height: calc(
			100dvh - max(0.75rem, env(safe-area-inset-top)) - max(0.75rem, env(safe-area-inset-bottom))
		);
		margin: auto;
		padding: 0;
		overflow: hidden;
		border: 2px solid #191711;
		border-radius: 0.35rem 0.65rem 0.42rem 0.75rem;
		background: var(--game-paper);
		color: var(--game-ink);
		box-shadow:
			0 0 0 1px rgb(244 221 169 / 35%),
			0 1.75rem 5rem rgb(6 10 8 / 64%);
		font-family: var(--font-sans);
	}

	dialog.wide {
		width: min(
			68rem,
			calc(
				100% - max(0.75rem, env(safe-area-inset-left)) - max(0.75rem, env(safe-area-inset-right))
			)
		);
	}

	dialog::backdrop {
		background:
			radial-gradient(circle at 18% 26%, rgb(117 74 43 / 24%), transparent 27rem),
			linear-gradient(123deg, rgb(14 25 22 / 92%), rgb(23 15 10 / 94%));
		backdrop-filter: blur(4px) saturate(0.72);
	}

	.dialog-frame {
		display: grid;
		max-height: inherit;
		grid-template-rows: auto minmax(0, 1fr);
	}

	header {
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: clamp(0.85rem, 2.8vw, 1.25rem) clamp(0.9rem, 3.5vw, 1.5rem);
		overflow: hidden;
		border-bottom: 3px double rgb(235 203 137 / 55%);
		background:
			linear-gradient(102deg, transparent 0 58%, rgb(255 255 255 / 4%) 58% 59%, transparent 59%),
			linear-gradient(176deg, var(--game-wall), var(--game-wall-dark));
		color: #f7e7c3;
	}

	header::after {
		position: absolute;
		right: 5.5rem;
		bottom: -0.15rem;
		width: 8rem;
		height: 0.38rem;
		border-radius: 50%;
		background: rgb(204 143 45 / 58%);
		content: '';
		rotate: -2deg;
		pointer-events: none;
	}

	.heading {
		min-width: 0;
	}

	.kicker {
		margin: 0 0 0.2rem;
		color: #e5c987;
		font-size: 0.65rem;
		font-weight: 850;
		letter-spacing: 0.14em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		color: inherit;
		font-family: var(--font-serif);
		font-size: clamp(1.3rem, 1rem + 1.5vw, 2rem);
		line-height: 1.1;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}

	.description {
		max-width: 62ch;
		margin: 0.35rem 0 0;
		color: #e2d4b5;
		font-size: clamp(0.78rem, 0.75rem + 0.2vw, 0.9rem);
		line-height: 1.45;
		text-align: start;
		text-wrap: pretty;
	}

	.close-button {
		display: inline-grid;
		width: 2.75rem;
		min-width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		place-items: center;
		border: 1px solid rgb(245 221 174 / 65%);
		border-radius: 50% 46% 52% 44%;
		background: rgb(15 31 27 / 52%);
		color: #fff3d7;
		box-shadow: inset 0 0 0 2px rgb(0 0 0 / 12%);
		font: inherit;
		font-size: 1.65rem;
		line-height: 1;
		cursor: pointer;
	}

	.close-button:hover {
		background: var(--game-red);
	}

	.close-button:focus-visible {
		outline: 3px solid #ffcf58;
		outline-offset: 3px;
	}

	.dialog-body {
		min-height: 0;
		padding: clamp(0.9rem, 3vw, 1.5rem) max(clamp(0.9rem, 3vw, 1.5rem), env(safe-area-inset-right))
			max(clamp(1rem, 3vw, 1.6rem), env(safe-area-inset-bottom))
			max(clamp(0.9rem, 3vw, 1.5rem), env(safe-area-inset-left));
		overflow-y: auto;
		overscroll-behavior: contain;
		background:
			linear-gradient(91deg, rgb(76 49 27 / 5%) 1px, transparent 1px) 0 0 / 2.9rem 100%,
			radial-gradient(circle at 88% 12%, rgb(156 78 41 / 10%), transparent 16rem),
			radial-gradient(circle at 4% 96%, rgb(59 80 58 / 11%), transparent 19rem),
			var(--game-paper);
		scrollbar-color: var(--game-ink-soft) var(--game-paper-dark);
	}

	@media (max-width: 34rem) {
		dialog,
		dialog.wide {
			width: calc(
				100% - max(0.35rem, env(safe-area-inset-left)) - max(0.35rem, env(safe-area-inset-right))
			);
			max-height: calc(100vh - 0.7rem);
			max-height: calc(
				100dvh - max(0.35rem, env(safe-area-inset-top)) - max(0.35rem, env(safe-area-inset-bottom))
			);
		}

		header {
			gap: 0.65rem;
		}
	}

	@media (max-height: 31rem) and (orientation: landscape) {
		header {
			padding-block: 0.65rem;
		}

		.kicker {
			display: none;
		}

		.description {
			margin-top: 0.18rem;
			line-height: 1.3;
		}

		.dialog-body {
			padding-block: 0.75rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		dialog::backdrop {
			backdrop-filter: none;
		}
	}

	@media (forced-colors: active) {
		dialog {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
		}

		dialog::backdrop {
			background: rgb(0 0 0 / 72%);
			backdrop-filter: none;
		}

		header,
		.dialog-body {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		header::after {
			display: none;
		}

		.kicker,
		h2,
		.description {
			color: CanvasText;
		}

		.close-button {
			border: 1px solid ButtonText;
			background: ButtonFace;
			color: ButtonText;
			forced-color-adjust: auto;
		}
	}
</style>
