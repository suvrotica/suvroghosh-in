<script lang="ts">
	type PlaybackState = 'preparing' | 'placing' | 'revealing' | 'paused' | 'complete' | 'error';

	type Props = {
		state: PlaybackState;
		mode: 'play' | 'lab';
		progress: number;
		canGenerate: boolean;
		onmake: () => void;
		ongenerate: () => void;
		onpause: () => void;
		onstep: () => void;
		onfinish: () => void;
		onnewseed: () => void;
		onfit: () => void;
		onmode: (mode: 'play' | 'lab') => void;
	};

	let {
		state,
		mode,
		progress,
		canGenerate,
		onmake,
		ongenerate,
		onpause,
		onstep,
		onfinish,
		onnewseed,
		onfit,
		onmode
	}: Props = $props();

	let busy = $derived(state === 'preparing');
	let active = $derived(state === 'revealing' || state === 'paused');
	let complete = $derived(state === 'complete');
</script>

<div class="city-toolbar" role="toolbar" aria-label="City generation controls">
	<div class="primary-actions" role="group" aria-label="Generation">
		{#if state === 'placing'}
			<button type="button" class="primary" disabled={!canGenerate || busy} onclick={ongenerate}>
				Let the city happen
			</button>
		{:else}
			<button type="button" class="primary" disabled={busy} onclick={onmake}>
				Make your own city
			</button>
		{/if}

		{#if active}
			<button type="button" onclick={onpause}>
				{state === 'revealing' ? 'Pause negotiations' : 'Resume negotiations'}
			</button>
			<button type="button" disabled={state !== 'paused'} onclick={onstep}>
				Approve one more tile
			</button>
			<button type="button" onclick={onfinish}>Fast-forward bureaucracy</button>
		{:else if complete}
			<button type="button" onclick={onnewseed}>Try another municipality</button>
		{/if}
	</div>

	<div class="view-actions" role="group" aria-label="Map and presentation">
		<button type="button" onclick={onfit}>Fit map</button>
		<div class="mode-switch" role="group" aria-label="Presentation mode">
			<button
				type="button"
				aria-pressed={mode === 'play'}
				class:active={mode === 'play'}
				onclick={() => onmode('play')}>Play</button
			>
			<button
				type="button"
				aria-pressed={mode === 'lab'}
				class:active={mode === 'lab'}
				onclick={() => onmode('lab')}>How it decides</button
			>
		</div>
	</div>

	<div class="progress-line">
		<span style={`width:${Math.max(0, Math.min(100, progress * 100))}%`}></span>
	</div>
</div>

<style>
	.city-toolbar {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		border-bottom: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.65rem 0.75rem 0.75rem;
	}
	.primary-actions,
	.view-actions,
	.mode-switch {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.45rem;
		background: var(--paper);
		padding: 0.45rem 0.7rem;
		font: inherit;
		font-size: 0.74rem;
		font-weight: 800;
		color: var(--ink);
		cursor: pointer;
	}
	button:hover,
	button.active,
	button[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}
	button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-foreground);
	}
	button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.mode-switch {
		gap: 0;
	}
	.mode-switch button {
		border-radius: 0;
	}
	.mode-switch button:first-child {
		border-radius: 0.45rem 0 0 0.45rem;
	}
	.mode-switch button:last-child {
		margin-left: -1px;
		border-radius: 0 0.45rem 0.45rem 0;
	}
	.progress-line {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		height: 3px;
		overflow: hidden;
		background: color-mix(in srgb, var(--rule) 65%, transparent);
	}
	.progress-line span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 120ms linear;
	}
	@media (max-width: 720px) {
		.city-toolbar {
			align-items: stretch;
		}
		.primary-actions,
		.view-actions {
			width: 100%;
		}
		.primary-actions button:first-child {
			flex: 1;
		}
		.view-actions {
			justify-content: space-between;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.progress-line span {
			transition: none;
		}
	}
	:global(html[data-motion='still']) .progress-line span {
		transition: none;
	}
</style>
