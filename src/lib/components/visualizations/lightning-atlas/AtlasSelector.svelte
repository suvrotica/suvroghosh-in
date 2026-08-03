<script lang="ts">
	import { tick } from 'svelte';
	import { TERRAIN_PRESETS } from '$lib/visualizations/lightning-atlas/config';
	import type { TerrainPresetId } from '$lib/visualizations/lightning-atlas/types';

	type Props = {
		open: boolean;
		selected: TerrainPresetId;
		reducedMotion: boolean;
		onselect?: (terrain: TerrainPresetId) => void;
		onclose?: () => void;
	};

	let { open, selected, reducedMotion, onselect, onclose }: Props = $props();
	let dialog = $state<HTMLDivElement | null>(null);
	let closeButton = $state<HTMLButtonElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;
	let wasOpen = false;
	const markerPositions: Record<TerrainPresetId, { left: number; top: number }> = {
		'monsoon-delta': { left: 65, top: 55 },
		'himalayan-ridge': { left: 63, top: 38 },
		'coastal-shelf': { left: 28, top: 46 },
		'forest-basin': { left: 38, top: 57 },
		'desert-escarpment': { left: 45, top: 45 },
		'urban-plain': { left: 54, top: 59 },
		'open-ocean': { left: 20, top: 64 },
		'volcanic-island': { left: 76, top: 68 }
	};

	function choose(id: TerrainPresetId) {
		onselect?.(id);
		onclose?.();
	}

	function handleDialogKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose?.();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = [
			...(dialog?.querySelectorAll<HTMLElement>(
				'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
			) ?? [])
		];
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable.at(-1)!;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		if (open && !wasOpen) {
			previouslyFocused =
				document.activeElement instanceof HTMLElement ? document.activeElement : null;
			const previousOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			void tick().then(() => closeButton?.focus());
			wasOpen = true;
			return () => {
				document.body.style.overflow = previousOverflow;
			};
		}
		if (!open && wasOpen) {
			wasOpen = false;
			const target = previouslyFocused;
			void tick().then(() => {
				if (target?.isConnected) target.focus();
			});
		}
	});
</script>

{#if open}
	<div class="backdrop">
		<div
			bind:this={dialog}
			class="atlas-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="atlas-heading"
			aria-describedby="atlas-description"
			tabindex="-1"
			onkeydown={handleDialogKeydown}
		>
			<header>
				<div>
					<p>Lightning Atlas</p>
					<h3 id="atlas-heading">Procedural storm regions — not current weather</h3>
					<span id="atlas-description">Choose one of eight deterministic terrain experiments.</span>
				</div>
				<button bind:this={closeButton} type="button" onclick={onclose}>Close atlas</button>
			</header>

			{#if !reducedMotion}
				<div class="globe-stage" aria-hidden="true">
					<div class="globe">
						<div class="longitude one"></div>
						<div class="longitude two"></div>
						<div class="latitude one"></div>
						<div class="latitude two"></div>
						{#each TERRAIN_PRESETS as preset (preset.id)}
							<span
								class="marker"
								class:selected={preset.id === selected}
								style={`left:${markerPositions[preset.id].left}%;top:${markerPositions[preset.id].top}%`}
							></span>
						{/each}
					</div>
					<p>Each marker opens a seeded study scene, not a live place or geographic dataset.</p>
				</div>
			{/if}

			<div class="terrain-grid">
				{#each TERRAIN_PRESETS as preset (preset.id)}
					<button
						type="button"
						class:selected={preset.id === selected}
						aria-pressed={preset.id === selected}
						onclick={() => choose(preset.id)}
					>
						<span class="card-top"
							><strong>{preset.name}</strong><i style={`background:${preset.accent}`}></i></span
						>
						<small>{preset.region}{preset.experimental ? ' · experimental' : ''}</small>
						<span>{preset.description}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		--atlas-panel-strong: #091321;
		--atlas-control: #152235;
		--atlas-line: #2c3b52;
		--atlas-text: #dce5f2;
		--atlas-muted: #91a0b5;
		--atlas-accent: #aebfff;
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		background: rgb(2 7 15 / 0.8);
		padding: 1rem;
		backdrop-filter: blur(8px);
	}

	.atlas-dialog {
		width: min(68rem, 100%);
		max-height: min(52rem, calc(100dvh - 2rem));
		overflow: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--atlas-line);
		border-radius: 0.7rem;
		background: var(--atlas-panel-strong);
		box-shadow: 0 2rem 5rem rgb(0 0 0 / 0.5);
		color: var(--atlas-text);
	}

	header {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--atlas-line);
		background: var(--atlas-panel-strong);
		padding: 1rem;
	}

	header p,
	header h3 {
		margin: 0;
	}
	header span {
		display: block;
		margin-top: 0.25rem;
		color: var(--atlas-muted);
		font-size: 0.72rem;
	}
	header p {
		color: var(--atlas-accent);
		font:
			0.66rem 'Courier Prime',
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	header h3 {
		margin-top: 0.2rem;
		font-size: 1.1rem;
	}
	header button {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-control);
		padding: 0.45rem 0.75rem;
		color: inherit;
		font: inherit;
	}

	.globe-stage {
		display: grid;
		place-items: center;
		gap: 0.5rem;
		padding: 1.2rem;
	}

	.globe-stage > p {
		margin: 0;
		color: var(--atlas-muted);
		font-size: 0.72rem;
	}

	.globe {
		position: relative;
		width: min(23rem, 72vw);
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--atlas-accent) 55%, var(--atlas-line));
		border-radius: 50%;
		background:
			radial-gradient(circle at 35% 25%, rgb(127 164 179 / 0.26), transparent 42%),
			linear-gradient(145deg, #1a3141, #07111e 72%);
		box-shadow:
			inset -2rem -1.5rem 3rem rgb(0 0 0 / 0.5),
			0 1rem 2rem rgb(0 0 0 / 0.28);
	}

	.longitude,
	.latitude {
		position: absolute;
		inset: 8%;
		border: 1px solid rgb(183 216 220 / 0.2);
		border-radius: 50%;
	}

	.longitude.one {
		transform: scaleX(0.4);
	}
	.longitude.two {
		transform: scaleX(0.7);
	}
	.latitude.one {
		transform: scaleY(0.38);
	}
	.latitude.two {
		transform: scaleY(0.72);
	}

	.globe .marker {
		position: absolute;
		width: 0.75rem;
		height: 0.75rem;
		min-height: 0;
		transform: translate(-50%, -50%);
		border: 2px solid #e9f1ff;
		border-radius: 50%;
		background: #8da5df;
		box-shadow: 0 0 0 0.25rem rgb(101 125 179 / 0.2);
	}

	.globe .marker.selected {
		background: #f0c96d;
		box-shadow: 0 0 0 0.35rem rgb(240 201 109 / 0.24);
	}

	.terrain-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.65rem;
		padding: 0 1rem 1rem;
	}

	.terrain-grid button {
		display: grid;
		gap: 0.36rem;
		min-height: 9.5rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.45rem;
		background: var(--atlas-control);
		padding: 0.75rem;
		color: inherit;
		font: inherit;
		text-align: left;
	}

	.terrain-grid button:hover,
	.terrain-grid button:focus-visible,
	.terrain-grid button.selected {
		border-color: var(--atlas-accent);
		outline: none;
	}
	.card-top {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.card-top i {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
	}
	.terrain-grid small {
		color: var(--atlas-accent);
		font:
			0.62rem 'Courier Prime',
			monospace;
		text-transform: uppercase;
	}
	.terrain-grid button > span:last-child {
		color: var(--atlas-muted);
		font-size: 0.72rem;
		line-height: 1.42;
	}

	@media (max-width: 850px) {
		.globe-stage {
			display: none;
		}
		.terrain-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			padding-top: 1rem;
		}
	}

	@media (max-width: 480px) {
		.backdrop {
			padding: 0;
		}
		.atlas-dialog {
			width: 100%;
			max-height: 100dvh;
			min-height: 100svh;
			border: 0;
			border-radius: 0;
			padding-bottom: env(safe-area-inset-bottom);
		}
		header h3 {
			font-size: 0.95rem;
		}
		.terrain-grid {
			grid-template-columns: 1fr;
		}
		.terrain-grid button {
			min-height: 7.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.globe-stage {
			display: none;
		}
	}

	@media (forced-colors: active) {
		.atlas-dialog,
		button {
			border: 1px solid CanvasText;
		}
		button:focus-visible {
			outline: 3px solid Highlight;
			outline-offset: 2px;
		}
	}
</style>
