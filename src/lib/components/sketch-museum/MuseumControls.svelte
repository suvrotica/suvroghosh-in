<script lang="ts">
	import type { SketchArtwork } from '$lib/sketches/types';

	type Props = {
		currentArtwork: SketchArtwork | null;
		roomName: string;
		roomIndex?: number;
		roomCount?: number;
		previousRoomName?: string | null;
		nextRoomName?: string | null;
		pointerLocked: boolean;
		pointerLockAvailable: boolean;
		onPrevious: () => void;
		onNext: () => void;
		onPreviousRoom?: () => void;
		onNextRoom?: () => void;
		onDetails: () => void;
		onReset: () => void;
		onPointerLock: () => void;
		onExit: () => void;
		onTouchMove: (strafe: number, forward: number) => void;
	};

	let {
		currentArtwork,
		roomName,
		roomIndex = 0,
		roomCount = 1,
		previousRoomName = null,
		nextRoomName = null,
		pointerLocked,
		pointerLockAvailable,
		onPrevious,
		onNext,
		onPreviousRoom = () => {},
		onNextRoom = () => {},
		onDetails,
		onReset,
		onPointerLock,
		onExit,
		onTouchMove
	}: Props = $props();

	let movementPad: HTMLDivElement;
	let movementPointer: number | null = null;
	let thumbX = $state(0);
	let thumbY = $state(0);

	function updateMovement(event: PointerEvent) {
		if (!movementPad || movementPointer !== event.pointerId) return;
		const bounds = movementPad.getBoundingClientRect();
		const maximum = Math.max(1, bounds.width * 0.34);
		const x = event.clientX - (bounds.left + bounds.width / 2);
		const y = event.clientY - (bounds.top + bounds.height / 2);
		const length = Math.hypot(x, y);
		const scale = length > maximum ? maximum / length : 1;
		thumbX = x * scale;
		thumbY = y * scale;
		onTouchMove(thumbX / maximum, -thumbY / maximum);
	}

	function beginMovement(event: PointerEvent) {
		movementPointer = event.pointerId;
		movementPad.setPointerCapture(event.pointerId);
		updateMovement(event);
	}

	function endMovement(event: PointerEvent) {
		if (movementPointer !== event.pointerId) return;
		movementPointer = null;
		thumbX = 0;
		thumbY = 0;
		onTouchMove(0, 0);
		if (movementPad.hasPointerCapture(event.pointerId)) {
			movementPad.releasePointerCapture(event.pointerId);
		}
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${value}T00:00:00Z`));
	}
</script>

<div class="museum-hud" aria-label="Museum controls">
	<div class="museum-location">
		<div class="museum-location-status" aria-live="polite" aria-atomic="true">
			<div class="room-heading">
				<span class="room-name">{roomName}</span>
				<span class="room-progress"
					>Room {Math.min(roomIndex + 1, Math.max(roomCount, 1))} of {Math.max(roomCount, 1)}</span
				>
			</div>
			{#if currentArtwork}
				<strong>{currentArtwork.title}</strong>
				{#if currentArtwork.description}
					<p>{currentArtwork.description}</p>
				{/if}
				{#if currentArtwork.date || currentArtwork.medium}
					<dl class="artwork-metadata">
						{#if currentArtwork.date}
							<div>
								<dt>Date</dt>
								<dd>
									<time datetime={currentArtwork.date}>{formatDate(currentArtwork.date)}</time>
								</dd>
							</div>
						{/if}
						{#if currentArtwork.medium}
							<div>
								<dt>Medium</dt>
								<dd>{currentArtwork.medium}</dd>
							</div>
						{/if}
					</dl>
				{/if}
			{:else}
				<strong>Walk towards a framed sketch</strong>
			{/if}
		</div>

		<nav class="room-navigation" aria-label="Room navigation">
			<button
				type="button"
				onclick={onPreviousRoom}
				disabled={!previousRoomName}
				aria-label={previousRoomName
					? `Go to previous room, ${previousRoomName}`
					: 'Previous room unavailable; this is the first room'}
			>
				<span aria-hidden="true">←</span>
				<span>
					<strong>Previous room</strong>
					<small>{previousRoomName ?? 'Start of tour'}</small>
				</span>
			</button>
			<button
				type="button"
				onclick={onNextRoom}
				disabled={!nextRoomName}
				aria-label={nextRoomName
					? `Go to next room, ${nextRoomName}`
					: 'Next room unavailable; this is the final room'}
			>
				<span>
					<strong>Next room</strong>
					<small>{nextRoomName ?? 'End of tour'}</small>
				</span>
				<span aria-hidden="true">→</span>
			</button>
		</nav>
	</div>

	<div class="museum-actions">
		<button type="button" onclick={onPrevious} aria-label="Move to previous artwork">
			<span aria-hidden="true">←</span>
			<span>Previous artwork</span>
		</button>
		<button type="button" onclick={onNext} aria-label="Move to next artwork">
			<span>Next artwork</span>
			<span aria-hidden="true">→</span>
		</button>
		<button type="button" onclick={onDetails} disabled={!currentArtwork}>Details</button>
		<button type="button" onclick={onReset}>Reset</button>
		{#if pointerLockAvailable}
			<button
				type="button"
				onclick={onPointerLock}
				aria-pressed={pointerLocked}
				title="Pointer lock follows your mouse and is released with Escape"
			>
				{pointerLocked ? 'Release look' : 'Mouse look'}
			</button>
		{/if}
		<button type="button" class="exit-button" onclick={onExit}>Return to collection</button>
	</div>

	<div
		bind:this={movementPad}
		class="movement-pad"
		role="application"
		aria-label="Touch movement control. Drag from the centre to walk."
		onpointerdown={beginMovement}
		onpointermove={updateMovement}
		onpointerup={endMovement}
		onpointercancel={endMovement}
	>
		<span class="movement-label" aria-hidden="true">Move</span>
		<span
			class="movement-thumb"
			aria-hidden="true"
			style:transform={`translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`}
		></span>
	</div>

	<p class="museum-instructions">
		<span class="desktop-instructions"
			><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to walk · drag to look ·
			<kbd>Shift</kbd> for a quicker pace</span
		>
		<span class="touch-instructions"
			>Drag the movement pad to walk and drag the gallery to look.</span
		>
	</p>
</div>

<style>
	.museum-hud {
		position: absolute;
		z-index: 5;
		inset: 0;
		pointer-events: none;
		color: #f8f1df;
		font-family: var(--font-sans);
	}

	.museum-location {
		position: absolute;
		top: 0.9rem;
		left: 0.9rem;
		width: min(22rem, calc(100% - 8rem));
		padding: 0.75rem 0.9rem;
		border: 1px solid rgb(221 199 155 / 35%);
		border-radius: 0.4rem;
		background: rgb(17 12 9 / 82%);
		box-shadow: 0 0.6rem 2rem rgb(0 0 0 / 24%);
		backdrop-filter: blur(8px);
	}

	.room-name {
		display: block;
		color: #cbb58a;
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.room-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.65rem;
		margin-bottom: 0.25rem;
	}

	.room-progress {
		flex: none;
		color: #d9c9aa;
		font-size: 0.64rem;
		font-weight: 750;
		letter-spacing: 0.05em;
	}

	.museum-location strong {
		display: block;
		font-family: var(--font-serif);
		font-size: clamp(0.95rem, 2vw, 1.16rem);
		line-height: 1.2;
	}

	.museum-location p {
		display: -webkit-box;
		margin: 0.35rem 0 0;
		overflow: hidden;
		color: #ddd1bb;
		font-size: 0.76rem;
		line-height: 1.35;
		text-align: left;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.artwork-metadata {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.8rem;
		margin: 0.55rem 0 0;
		padding-top: 0.45rem;
		border-top: 1px solid rgb(221 199 155 / 24%);
	}

	.artwork-metadata div {
		display: flex;
		gap: 0.3rem;
		align-items: baseline;
	}

	.artwork-metadata dt {
		color: #cbb58a;
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.artwork-metadata dd {
		margin: 0;
		color: #eee3cf;
		font-size: 0.68rem;
		line-height: 1.35;
	}

	.room-navigation {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
		margin-top: 0.65rem;
		padding-top: 0.55rem;
		border-top: 1px solid rgb(221 199 155 / 24%);
		pointer-events: auto;
	}

	.room-navigation button {
		display: flex;
		min-width: 0;
		min-height: 3rem;
		align-items: center;
		gap: 0.45rem;
		justify-content: flex-start;
		padding: 0.42rem 0.55rem;
		text-align: left;
	}

	.room-navigation button:last-child {
		justify-content: flex-end;
		text-align: right;
	}

	.room-navigation button > span:not([aria-hidden='true']) {
		min-width: 0;
	}

	.room-navigation strong,
	.room-navigation small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.room-navigation strong {
		font-family: var(--font-sans);
		font-size: 0.7rem;
		line-height: 1.15;
	}

	.room-navigation small {
		display: block;
		margin-top: 0.12rem;
		color: #d6c7aa;
		font-size: 0.6rem;
		line-height: 1.2;
	}

	.museum-actions {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		left: 0.75rem;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.4rem;
		pointer-events: auto;
	}

	button {
		min-height: 2.75rem;
		padding: 0.55rem 0.75rem;
		border: 1px solid rgb(223 202 162 / 42%);
		border-radius: 0.35rem;
		background: rgb(23 16 12 / 88%);
		color: #fff9ed;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 750;
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	button:hover {
		border-color: #e7c983;
		background: rgb(56 39 25 / 94%);
	}

	button:focus-visible {
		outline: 2px solid #fff6dd;
		outline-offset: 2px;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.exit-button {
		border-color: rgb(238 218 178 / 70%);
		background: rgb(80 50 28 / 92%);
	}

	.museum-instructions {
		position: absolute;
		top: 0.85rem;
		right: 0.9rem;
		max-width: 28rem;
		margin: 0;
		padding: 0.5rem 0.65rem;
		border-radius: 0.3rem;
		background: rgb(17 12 9 / 70%);
		color: #ddd1bb;
		font-size: 0.68rem;
		line-height: 1.45;
		text-align: right;
	}

	kbd {
		margin-inline: 0.08rem;
		padding: 0.08rem 0.22rem;
		border: 1px solid rgb(255 255 255 / 34%);
		border-radius: 0.18rem;
		background: rgb(255 255 255 / 10%);
		font: inherit;
	}

	.movement-pad,
	.touch-instructions {
		display: none;
	}

	@media (pointer: coarse), (max-width: 48rem) {
		.museum-location {
			top: 0.55rem;
			left: 0.55rem;
			width: calc(100% - 1.1rem);
			padding: 0.55rem 0.7rem;
		}

		.museum-location p,
		.desktop-instructions {
			display: none;
		}

		.room-navigation {
			margin-top: 0.5rem;
			padding-top: 0.45rem;
		}

		.room-navigation button {
			min-height: 2.75rem;
		}

		.museum-instructions {
			top: auto;
			right: auto;
			bottom: 6.7rem;
			left: 0.65rem;
			max-width: 10rem;
			text-align: left;
		}

		.touch-instructions {
			display: inline;
		}

		.movement-pad {
			position: absolute;
			bottom: 7.5rem;
			left: 0.75rem;
			display: block;
			width: 6.25rem;
			height: 6.25rem;
			border: 1px solid rgb(236 220 188 / 46%);
			border-radius: 50%;
			background: rgb(21 15 11 / 64%);
			pointer-events: auto;
			touch-action: none;
			user-select: none;
		}

		.movement-pad::before,
		.movement-pad::after {
			position: absolute;
			color: rgb(255 246 224 / 56%);
			font-size: 0.7rem;
		}

		.movement-pad::before {
			content: '↑';
			top: 0.35rem;
			left: 50%;
			translate: -50% 0;
		}

		.movement-pad::after {
			content: '↓';
			bottom: 0.35rem;
			left: 50%;
			translate: -50% 0;
		}

		.movement-label {
			position: absolute;
			inset: 50% auto auto 50%;
			color: #d7c7a8;
			font-size: 0.65rem;
			font-weight: 750;
			translate: -50% -50%;
		}

		.movement-thumb {
			position: absolute;
			top: 50%;
			left: 50%;
			width: 2.15rem;
			height: 2.15rem;
			border: 1px solid rgb(255 244 219 / 68%);
			border-radius: 50%;
			background: rgb(154 113 69 / 74%);
		}

		.museum-actions {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.35rem;
		}

		button {
			padding-inline: 0.35rem;
			font-size: 0.68rem;
		}

		.exit-button {
			grid-column: span 2;
		}
	}

	@media (max-width: 25rem) {
		.museum-actions {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.exit-button {
			grid-column: span 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>
