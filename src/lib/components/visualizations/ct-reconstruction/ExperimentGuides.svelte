<script lang="ts">
	export type ExperimentId =
		| 'few-views'
		| 'low-dose'
		| 'missing-wedge'
		| 'metal'
		| 'detectors-vs-angles';

	type Props = {
		onapply: (experiment: ExperimentId) => void;
		active?: ExperimentId | null;
	};

	let { onapply, active = null }: Props = $props();

	function revealFocusedCard(event: FocusEvent) {
		(event.currentTarget as HTMLButtonElement).scrollIntoView({
			block: 'nearest',
			inline: 'center'
		});
	}

	const experiments: Array<{
		id: ExperimentId;
		title: string;
		settings: string;
		observation: string;
	}> = [
		{
			id: 'few-views',
			title: 'Few views',
			settings: '18 projections · 192 detectors · high relative dose · Shepp–Logan',
			observation: 'Star-like streaks appear because too many directions were sparsely sampled.'
		},
		{
			id: 'low-dose',
			title: 'Low dose',
			settings: '180 projections · 256 detectors · very low photon count · Ramp',
			observation: 'The sharp Ramp filter also amplifies high-frequency measurement noise.'
		},
		{
			id: 'missing-wedge',
			title: 'Missing wedge',
			settings: '180 nominal views · omit a 60° sector · moderate relative dose',
			observation: 'Edges aligned with the missing directions become poorly determined.'
		},
		{
			id: 'metal',
			title: 'Metal',
			settings: 'Metal implant phantom · three-band spectrum · photon starvation',
			observation: 'Nonlinear projection errors are spread into bright and dark streaks.'
		},
		{
			id: 'detectors-vs-angles',
			title: 'More detectors, too few angles',
			settings: '18 projections · 384 detector bins · high relative dose',
			observation: 'Fine detector sampling cannot replace absent angular information.'
		}
	];
</script>

<section class="experiments" aria-labelledby="ct-experiments-heading">
	<div class="heading">
		<div>
			<p>Guided trials</p>
			<h3 id="ct-experiments-heading">Make the reconstruction fail instructively</h3>
		</div>
		<span>Each card configures the same controls</span>
	</div>
	<div class="card-row">
		{#each experiments as experiment (experiment.id)}
			<button
				type="button"
				class="experiment-card"
				aria-pressed={active === experiment.id}
				onfocus={revealFocusedCard}
				onclick={() => onapply(experiment.id)}
			>
				<span class="title">{experiment.title}</span>
				<span class="settings">{experiment.settings}</span>
				<span class="observation">{experiment.observation}</span>
				<span class="action">Set up experiment →</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.experiments {
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-soft);
		padding: 0.8rem;
	}
	.heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.heading p,
	.heading h3 {
		margin: 0;
	}
	.heading p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.heading h3 {
		font-size: 0.95rem;
		color: var(--ink);
	}
	.heading > span {
		max-width: 15rem;
		font-size: 0.75rem;
		line-height: 1.35;
		text-align: right;
		color: var(--ink-muted);
	}
	.card-row {
		display: grid;
		grid-auto-columns: minmax(15rem, 1fr);
		grid-auto-flow: column;
		gap: 0.65rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
		scroll-snap-type: x proximity;
	}
	.experiment-card {
		display: grid;
		min-height: 10.5rem;
		align-content: start;
		gap: 0.45rem;
		scroll-snap-align: start;
		scroll-margin-inline: 0.25rem;
		border: 1px solid var(--control-border);
		border-radius: 0.55rem;
		background: var(--paper-raised);
		padding: 0.75rem;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.experiment-card:hover,
	.experiment-card[aria-pressed='true'] {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.title {
		font-size: 0.8125rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.settings {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--ink-muted);
	}
	.observation {
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--ink);
	}
	.action {
		align-self: end;
		margin-top: auto;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--accent);
	}
	.experiment-card:focus-visible {
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
		.card-row {
			grid-auto-columns: minmax(13.5rem, 84vw);
		}
	}
</style>
