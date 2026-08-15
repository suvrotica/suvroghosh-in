<script lang="ts">
	let {
		active = false,
		available = false,
		onenter,
		onexit
	}: {
		active?: boolean;
		available?: boolean;
		onenter: (trigger: HTMLButtonElement) => void;
		onexit: () => void;
	} = $props();
</script>

{#if active}
	<button
		type="button"
		class="exit"
		aria-label="Exit laboratory focus mode"
		data-testid="icu-exit-expanded"
		onclick={onexit}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="m8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
		</svg>
		<span>Exit</span>
	</button>
{:else}
	<button
		type="button"
		class="enter"
		data-testid="icu-toggle-expanded"
		aria-label={available ? 'Open laboratory fullscreen' : 'Open laboratory focus mode'}
		title={available ? 'Open fullscreen laboratory' : 'Open fixed focus mode'}
		onclick={(event) => onenter(event.currentTarget)}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
		</svg>
		<span>{available ? 'Fullscreen' : 'Focus mode'}</span>
	</button>
{/if}

<style>
	button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border: 1px solid var(--icu-control, var(--control-border));
		border-radius: 0.45rem;
		background: var(--icu-raised, var(--paper-raised));
		padding: 0.48rem 0.7rem;
		color: var(--icu-ink, var(--ink));
		font: 750 0.75rem/1 var(--icu-sans, var(--font-sans, sans-serif));
		cursor: pointer;
	}

	button:hover {
		border-color: var(--icu-accent, var(--accent));
		color: var(--icu-accent, var(--accent));
	}

	button:focus-visible {
		outline: 3px solid var(--icu-focus, var(--focus-ring, var(--accent)));
		outline-offset: 2px;
	}

	svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.8;
	}

	.exit {
		border-color: var(--icu-accent, var(--accent));
	}

	@media (forced-colors: active) {
		button {
			border-color: ButtonText;
		}
	}
</style>
