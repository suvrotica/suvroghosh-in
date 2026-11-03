<script lang="ts">
	import type { SketchArtwork } from '$lib/sketches/types';
	import type { MuseumRoomLayout, MuseumWall } from './museum-types';

	type Props = {
		currentArtwork: SketchArtwork | null;
		roomName: string;
		roomIndex?: number;
		roomCount?: number;
		rooms: MuseumRoomLayout[];
		activeRoomId: string;
		roomArtworks: SketchArtwork[];
		roomWalls: MuseumWall[];
		overviewWall: MuseumWall;
		overviewKind: 'room' | 'wall';
		onRoomOverview: () => void;
		viewMode: 'overview' | 'focus' | 'walk';
		previousRoomName?: string | null;
		nextRoomName?: string | null;
		pointerLocked: boolean;
		pointerLockAvailable: boolean;
		fullscreenActive?: boolean;
		fullscreenAvailable?: boolean;
		onRoom: (roomId: string) => void;
		onWall: (wall?: MuseumWall) => void;
		onWalking: () => void;
		onArtwork: (slug: string) => void;
		onPrevious: () => void;
		onNext: () => void;
		onPreviousRoom?: () => void;
		onNextRoom?: () => void;
		onDetails: () => void;
		onReset: () => void;
		onPointerLock: () => void;
		onFullscreen?: () => void;
		onExit: () => void;
		onTouchMove: (strafe: number, forward: number) => void;
	};
	let {
		currentArtwork,
		roomName,
		roomIndex = 0,
		roomCount = 1,
		rooms,
		activeRoomId,
		roomArtworks,
		roomWalls,
		overviewWall,
		overviewKind,
		onRoomOverview,
		viewMode,
		previousRoomName = null,
		nextRoomName = null,
		pointerLocked,
		pointerLockAvailable,
		fullscreenActive = false,
		fullscreenAvailable = false,
		onRoom,
		onWall,
		onWalking,
		onArtwork,
		onPrevious,
		onNext,
		onPreviousRoom = () => {},
		onNextRoom = () => {},
		onDetails,
		onReset,
		onPointerLock,
		onFullscreen = () => {},
		onExit,
		onTouchMove
	}: Props = $props();
	const wallLabels: Record<MuseumWall, string> = {
		north: 'Front wall',
		east: 'Right wall',
		south: 'Back wall',
		west: 'Left wall'
	};
	let movementPad = $state<HTMLDivElement>();
	let movementPointer: number | null = null;
	let thumbX = $state(0);
	let thumbY = $state(0);
	function updateMovement(event: PointerEvent) {
		if (!movementPad || movementPointer !== event.pointerId) return;
		const bounds = movementPad.getBoundingClientRect();
		const maximum = Math.max(1, bounds.width * 0.34);
		const x = event.clientX - bounds.left - bounds.width / 2;
		const y = event.clientY - bounds.top - bounds.height / 2;
		const scale = Math.min(1, maximum / Math.max(1, Math.hypot(x, y)));
		thumbX = x * scale;
		thumbY = y * scale;
		onTouchMove(thumbX / maximum, -thumbY / maximum);
	}
	function beginMovement(event: PointerEvent) {
		movementPointer = event.pointerId;
		movementPad?.setPointerCapture(event.pointerId);
		updateMovement(event);
	}
	function endMovement(event: PointerEvent) {
		if (movementPointer !== event.pointerId) return;
		movementPointer = null;
		thumbX = thumbY = 0;
		onTouchMove(0, 0);
		if (movementPad?.hasPointerCapture(event.pointerId))
			movementPad.releasePointerCapture(event.pointerId);
	}
</script>

<div class="museum-controls" aria-label="Museum controls">
	<div class="room-row">
		<label class="room-picker"
			>Go to room
			<select value={activeRoomId} onchange={(event) => onRoom(event.currentTarget.value)}>
				{#each rooms as room (room.id)}
					<option value={room.id}
						>{room.index + 1}. {room.name} · {room.artworkSlugs.length} works</option
					>
				{/each}
			</select>
		</label>
		<button
			type="button"
			onclick={onPreviousRoom}
			disabled={!previousRoomName}
			aria-label="Previous room">← Room</button
		>
		<button type="button" onclick={onNextRoom} disabled={!nextRoomName} aria-label="Next room"
			>Room →</button
		>
		<p class="room-status" aria-live="polite">Room {roomIndex + 1} of {roomCount}</p>
	</div>
	<div class="view-row">
		<div class="wall-buttons" aria-label="Choose a gallery view">
			<button
				type="button"
				aria-pressed={viewMode === 'overview' && overviewKind === 'room'}
				onclick={onRoomOverview}>Room overview</button
			>
			{#each roomWalls as wall}
				<button
					type="button"
					aria-pressed={viewMode === 'overview' && overviewKind === 'wall' && overviewWall === wall}
					onclick={() => onWall(wall)}>{wallLabels[wall]}</button
				>
			{/each}
		</div>
		<button type="button" aria-pressed={viewMode === 'walk'} onclick={onWalking}
			>{viewMode === 'walk' ? 'Stop walking' : 'Walk freely'}</button
		>
		{#if fullscreenAvailable}<button
				type="button"
				onclick={onFullscreen}
				aria-pressed={fullscreenActive}
				>{fullscreenActive ? 'Exit full screen' : 'Full screen'}</button
			>{/if}
		<button type="button" class="return" onclick={onExit}>Return to collection</button>
	</div>
	<nav class="room-artworks" aria-label={`Works in ${roomName}`}>
		{#each roomArtworks as artwork (artwork.slug)}
			<button
				type="button"
				class:selected={currentArtwork?.slug === artwork.slug}
				aria-pressed={currentArtwork?.slug === artwork.slug}
				aria-label={`Inspect ${artwork.title}`}
				title={artwork.title}
				onclick={() => onArtwork(artwork.slug)}
			>
				<img
					src={artwork.variants.thumbnail.src}
					width={artwork.variants.thumbnail.width}
					height={artwork.variants.thumbnail.height}
					alt=""
					loading="lazy"
					decoding="async"
				/>
			</button>
		{/each}
	</nav>
	<div class="inspection-row">
		<p>{currentArtwork?.title ?? 'Select a drawing to see it closely.'}</p>
		<button type="button" onclick={onPrevious} aria-label="Previous artwork">← Work</button>
		<button type="button" onclick={onNext} aria-label="Next artwork">Work →</button>
		<button type="button" onclick={onDetails} disabled={!currentArtwork}>Details</button>
		{#if viewMode === 'focus'}<button type="button" onclick={() => onWall()}>Whole wall</button
			>{/if}
	</div>
	{#if viewMode === 'walk'}
		<div class="walking-controls">
			<div
				bind:this={movementPad}
				class="movement-pad"
				role="application"
				aria-label="Touch movement. Drag from the centre to walk."
				onpointerdown={beginMovement}
				onpointermove={updateMovement}
				onpointerup={endMovement}
				onpointercancel={endMovement}
				onlostpointercapture={endMovement}
			>
				<span class="movement-label" aria-hidden="true">Move</span>
				<span
					class="movement-thumb"
					aria-hidden="true"
					style:transform={`translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`}
				></span>
			</div>
			<p>
				Drag the gallery to look. Use W A S D or arrow keys while the gallery is focused, or the
				movement pad. Escape releases mouse look.
			</p>
			{#if pointerLockAvailable}<button
					type="button"
					onclick={onPointerLock}
					aria-pressed={pointerLocked}>{pointerLocked ? 'Release look' : 'Mouse look'}</button
				>{/if}
			<button type="button" onclick={onReset}>Opening room</button>
		</div>
	{/if}
</div>

<style>
	.museum-controls {
		padding: 0.8rem;
		background: #201a14;
		color: #f8f1df;
		font-family: var(--font-sans);
	}
	.room-row,
	.view-row,
	.inspection-row,
	.walking-controls,
	.wall-buttons {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.room-picker {
		display: flex;
		align-items: center;
		flex: 1 1 17rem;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 700;
	}
	select {
		flex: 1;
		min-width: 0;
		max-width: 32rem;
	}
	button,
	select {
		min-height: 2.75rem;
		border: 1px solid #806d54;
		border-radius: 0.3rem;
		background: #2c241c;
		color: #fff9ed;
		padding: 0.5rem 0.65rem;
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
	button:hover,
	button[aria-pressed='true'],
	button.selected {
		border-color: #e5c992;
		background: #56412b;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 2px solid #fff3d3;
		outline-offset: 3px;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.room-status {
		margin: 0;
		font-size: 0.75rem;
		color: #d8cbb6;
	}
	.view-row {
		margin-top: 0.5rem;
	}
	.wall-buttons {
		flex: 1 1 auto;
	}
	.return {
		border-color: #d8bc83;
	}
	.room-artworks {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		padding: 0.65rem 3px;
		scrollbar-width: thin;
	}
	.room-artworks button {
		flex: 0 0 5rem;
		height: 5rem;
		padding: 0.2rem;
	}
	.room-artworks img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #eee8dc;
		border-radius: 0.1rem;
	}
	.inspection-row p {
		flex: 1 1 15rem;
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.4;
	}
	.walking-controls {
		margin-top: 0.7rem;
		border-top: 1px solid #675643;
		padding-top: 0.7rem;
	}
	.walking-controls p {
		flex: 1 1 12rem;
		max-width: 35rem;
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.movement-pad {
		position: relative;
		flex: 0 0 5rem;
		height: 5rem;
		border: 1px solid #a18a67;
		border-radius: 50%;
		background: #2b2218;
		touch-action: none;
		user-select: none;
	}
	.movement-label {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 0.68rem;
	}
	.movement-thumb {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 1.8rem;
		height: 1.8rem;
		border: 1px solid #f4ddb6;
		border-radius: 50%;
		background: #926c437f;
	}
	@media (max-width: 38rem) {
		.room-picker {
			flex-basis: 100%;
		}
		.room-artworks button {
			flex-basis: 4rem;
			height: 4rem;
		}
		.room-status {
			margin-left: auto;
		}
		.wall-buttons {
			flex-basis: 100%;
		}
		.wall-buttons button {
			flex: 1;
			padding-inline: 0.35rem;
		}
	}
</style>
