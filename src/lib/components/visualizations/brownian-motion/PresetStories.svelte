<script lang="ts">
	import type { StoryPresetChoice } from './ui-types';

	type Props = {
		presets: readonly StoryPresetChoice[];
		selected?: string;
		onselect: (id: string) => void;
	};

	let { presets, selected = '', onselect }: Props = $props();
</script>

<section class="preset-stories" aria-labelledby="brownian-preset-stories-title">
	<header>
		<p>FIELD NOTES</p>
		<h3 id="brownian-preset-stories-title">Load a story</h3>
	</header>
	<div class="cards">
		{#each presets as preset (preset.id)}
			<button
				type="button"
				class:active={selected === preset.id}
				aria-pressed={selected === preset.id}
				onclick={() => onselect(preset.id)}
			>
				<strong>{preset.label}</strong>
				<span>{preset.description}</span>
				<small>seed {preset.seed}</small>
			</button>
		{/each}
	</div>
</section>

<style>
	.preset-stories {
		border-top: 1px solid var(--rule, #c8c1b2);
		background: var(--paper-raised, #f6f2e8);
		padding: 0.8rem 1rem 1rem;
	}
	header {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.6rem;
	}
	header p {
		margin: 0;
		color: var(--lab-rust, #9b5f48);
		font:
			700 0.62rem 'Courier Prime',
			monospace;
		letter-spacing: 0.1em;
	}
	h3 {
		margin: 0;
		font-size: 0.9rem;
	}
	.cards {
		display: grid;
		grid-auto-columns: minmax(15rem, 20rem);
		grid-auto-flow: column;
		gap: 0.6rem;
		overflow-x: auto;
		padding-bottom: 0.35rem;
		scroll-snap-type: x proximity;
	}
	button {
		display: grid;
		min-height: 7.25rem;
		align-content: start;
		gap: 0.35rem;
		scroll-snap-align: start;
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.35rem;
		background: var(--paper, #f7f2e8);
		padding: 0.8rem;
		color: var(--ink, #242a32);
		text-align: left;
		cursor: pointer;
	}
	button.active {
		border-color: var(--lab-accent, #6f7fa8);
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--lab-accent, #6f7fa8) 30%, transparent);
	}
	button:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-accent, #6f7fa8) 70%, white);
		outline-offset: 2px;
	}
	strong {
		font-size: 0.84rem;
	}
	span {
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.75rem;
		line-height: 1.35;
	}
	small {
		margin-top: auto;
		color: var(--lab-rust, #9b5f48);
		font:
			0.6rem 'Courier Prime',
			monospace;
	}
</style>
