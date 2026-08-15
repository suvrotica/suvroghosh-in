<script lang="ts">
	type PresetOption = {
		id: string;
		title: string;
		explanation: string;
	};

	let {
		presets,
		activeId,
		custom = false,
		onselect
	}: {
		presets: readonly PresetOption[];
		activeId: string;
		custom?: boolean;
		onselect: (id: string) => void;
	} = $props();
</script>

<fieldset class="presets" aria-describedby="icu-presets-help">
	<legend>Choose a starting experiment</legend>
	<p id="icu-presets-help">
		Each card replaces the complete synthetic configuration. The numerical values are illustrative,
		not empirical estimates.
	</p>
	<div class="preset-grid">
		{#each presets as preset, index (preset.id)}
			<button
				type="button"
				class:active={preset.id === activeId}
				data-testid={`icu-preset-${preset.id}`}
				aria-pressed={preset.id === activeId && !custom}
				onclick={() => onselect(preset.id)}
			>
				<span class="number">0{index + 1}</span>
				<strong>{preset.title}</strong>
				<small>{preset.explanation}</small>
			</button>
		{/each}
	</div>
</fieldset>

<style>
	.presets {
		min-width: 0;
		margin: 0;
		border: 0;
		padding: 0;
	}

	legend {
		padding: 0;
		color: var(--icu-ink, var(--ink));
		font: 780 0.92rem/1.25 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.presets > p {
		max-width: 54rem;
		margin: 0.25rem 0 0.65rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.74rem/1.5 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
		min-width: 0;
	}

	button {
		display: grid;
		min-width: 0;
		min-height: 7.5rem;
		align-content: start;
		gap: 0.35rem;
		border: 1px solid var(--icu-control, var(--control-border));
		border-radius: 0.55rem;
		background: var(--icu-raised, var(--paper-raised));
		padding: 0.65rem;
		color: var(--icu-ink, var(--ink));
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	button:hover,
	button.active {
		border-color: var(--icu-accent, var(--accent));
	}

	button.active {
		box-shadow: inset 0 0 0 1px var(--icu-accent, var(--accent));
		background: color-mix(
			in oklab,
			var(--icu-accent, var(--accent)) 7%,
			var(--icu-raised, var(--paper-raised))
		);
	}

	button:focus-visible {
		outline: 3px solid var(--icu-focus, var(--focus-ring, var(--accent)));
		outline-offset: 2px;
	}

	.number {
		color: var(--icu-accent, var(--accent));
		font: 760 0.65rem/1 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		letter-spacing: 0.08em;
	}

	strong {
		font: 760 0.77rem/1.25 var(--icu-sans, var(--font-sans, sans-serif));
	}

	small {
		display: block;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.67rem/1.4 var(--icu-sans, var(--font-sans, sans-serif));
	}

	@container icu-lab (max-width: 58rem) {
		.preset-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		button {
			min-height: 6.75rem;
		}
	}

	@container icu-lab (max-width: 28rem) {
		.preset-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		button {
			min-height: 5.75rem;
		}
	}

	@media (forced-colors: active) {
		button,
		button.active {
			border-color: ButtonText;
		}

		button.active {
			outline: 2px solid Highlight;
			outline-offset: -4px;
		}
	}
</style>
