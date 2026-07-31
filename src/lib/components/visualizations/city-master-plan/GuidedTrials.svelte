<script lang="ts">
	import type { GuidedTrial } from '$lib/visualizations/city-master-plan';

	type Props = {
		trials: readonly GuidedTrial[];
		active?: string | null;
		onapply: (trial: GuidedTrial) => void;
	};

	let { trials, active = null, onapply }: Props = $props();

	function revealFocusedCard(event: FocusEvent) {
		(event.currentTarget as HTMLButtonElement).scrollIntoView({
			block: 'nearest',
			inline: 'center'
		});
	}
</script>

<section class="guided-trials" aria-labelledby="city-guided-trials-heading">
	<div class="heading">
		<div>
			<p>Guided trials</p>
			<h3 id="city-guided-trials-heading">Make local agreement fail instructively</h3>
		</div>
		<span>Each card configures the same generator</span>
	</div>
	<div class="trial-row" role="group" aria-label="Guided trial presets">
		{#each trials as trial (trial.id)}
			<button
				type="button"
				class="trial"
				aria-pressed={active === trial.id}
				onfocus={revealFocusedCard}
				onclick={() => onapply(trial)}
			>
				<span class="title">{trial.title}</span>
				<span class="settings">{trial.description}</span>
				<span class="lesson">{trial.learningPoint}</span>
				<span class="action">Set up experiment →</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.guided-trials {
		border-top: 1px solid var(--rule);
		background: var(--paper-soft);
		padding: 0.85rem;
	}
	.heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.7rem;
	}
	.heading p,
	.heading h3 {
		margin: 0;
	}
	.heading p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.heading h3 {
		font-size: 0.95rem;
		color: var(--ink);
	}
	.heading > span {
		max-width: 14rem;
		font-size: 0.72rem;
		line-height: 1.35;
		text-align: right;
		color: var(--ink-muted);
	}
	.trial-row {
		display: grid;
		grid-auto-columns: minmax(14.5rem, 1fr);
		grid-auto-flow: column;
		gap: 0.55rem;
		overflow-x: auto;
		padding: 0.1rem 0.05rem 0.35rem;
		scroll-snap-type: x proximity;
	}
	.trial {
		display: grid;
		min-height: 9.6rem;
		align-content: start;
		gap: 0.4rem;
		scroll-snap-align: start;
		border: 1px solid var(--control-border);
		border-radius: 0.55rem;
		background: var(--paper-raised);
		padding: 0.7rem;
		font: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.trial:hover,
	.trial[aria-pressed='true'] {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.title {
		font-size: 0.75rem;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.settings {
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		line-height: 1.35;
		color: var(--ink-muted);
	}
	.lesson {
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--ink);
	}
	.action {
		align-self: end;
		margin-top: auto;
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--accent);
	}
	.trial:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	@media (max-width: 640px) {
		.heading {
			align-items: start;
			flex-direction: column;
			gap: 0.25rem;
		}
		.heading > span {
			text-align: left;
		}
		.trial-row {
			grid-auto-columns: minmax(13.5rem, 84vw);
		}
	}
</style>
