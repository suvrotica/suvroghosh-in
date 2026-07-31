<script lang="ts">
	import type { CityResult, ScoreComponent } from '$lib/visualizations/city-master-plan';

	type Props = {
		result: CityResult | null;
	};

	let { result }: Props = $props();

	function componentPercent(component: ScoreComponent) {
		if (component.maximum <= 0) return 0;
		return Math.max(0, Math.min(100, (component.value / component.maximum) * 100));
	}
</script>

<section class="score-panel" aria-labelledby="city-scores-heading">
	<div class="panel-heading">
		<p>Computed outcomes</p>
		<h3 id="city-scores-heading">Two scores, two different questions</h3>
	</div>

	{#if result}
		<div class="score-pair">
			<article>
				<span>Functional</span>
				<strong data-testid="functional-score">{result.scores.functional}</strong>
				<small>{result.scores.functionalLabel}</small>
			</article>
			<article class="calamity">
				<span>Calamity</span>
				<strong data-testid="calamity-score">{result.scores.calamity}</strong>
				<small>{result.scores.calamityLabel}</small>
			</article>
		</div>

		<details>
			<summary>Show the arithmetic</summary>
			<div class="breakdowns">
				<div>
					<h4>Function</h4>
					{#each result.scores.functionalComponents as component (component.key)}
						<div class="component">
							<div>
								<span>{component.label}</span>
								<output>{Math.round(component.value)}/{component.maximum}</output>
							</div>
							<div class="bar">
								<span style={`width:${componentPercent(component)}%`}></span>
							</div>
							<small>{component.explanation}</small>
						</div>
					{/each}
				</div>
				<div>
					<h4>Calamity</h4>
					{#each result.scores.calamityComponents as component (component.key)}
						<div class="component calamity-component">
							<div>
								<span>{component.label}</span>
								<output>{Math.round(component.value)}/{component.maximum}</output>
							</div>
							<div class="bar">
								<span style={`width:${componentPercent(component)}%`}></span>
							</div>
							<small>{component.explanation}</small>
						</div>
					{/each}
				</div>
			</div>
		</details>
	{:else}
		<div class="empty">
			<span aria-hidden="true">— / —</span>
			<p>The surveyors are still locating their clipboards.</p>
		</div>
	{/if}
</section>

<style>
	.score-panel {
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: 0.75rem;
	}
	.panel-heading p,
	.panel-heading h3,
	.score-pair article > *,
	.empty p {
		margin: 0;
	}
	.panel-heading p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.panel-heading h3 {
		font-size: 0.88rem;
		color: var(--ink);
	}
	.score-pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem;
		margin-top: 0.7rem;
	}
	.score-pair article {
		display: grid;
		min-width: 0;
		border: 1px solid color-mix(in srgb, #587966 55%, var(--rule));
		border-radius: 0.55rem;
		background: color-mix(in srgb, #587966 8%, var(--paper));
		padding: 0.65rem;
	}
	.score-pair article.calamity {
		border-color: color-mix(in srgb, #a65742 55%, var(--rule));
		background: color-mix(in srgb, #a65742 8%, var(--paper));
	}
	.score-pair span {
		font-family: ui-monospace, monospace;
		font-size: 0.67rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.score-pair strong {
		font-size: 2rem;
		line-height: 1.05;
		color: var(--ink);
	}
	.score-pair small {
		min-height: 2.25em;
		font-size: 0.68rem;
		line-height: 1.25;
		color: var(--ink-muted);
	}
	details {
		margin-top: 0.65rem;
		border-top: 1px solid var(--rule);
		padding-top: 0.6rem;
	}
	summary {
		min-height: 2.75rem;
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 800;
		color: var(--accent);
	}
	.breakdowns {
		display: grid;
		gap: 0.8rem;
	}
	.breakdowns h4 {
		margin: 0 0 0.45rem;
		font-size: 0.75rem;
		color: var(--ink);
	}
	.component {
		margin-bottom: 0.55rem;
	}
	.component > div:first-child {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.68rem;
		color: var(--ink);
	}
	.component output {
		font-family: ui-monospace, monospace;
		color: var(--ink-muted);
	}
	.component small {
		display: block;
		margin-top: 0.18rem;
		font-size: 0.62rem;
		line-height: 1.3;
		color: var(--ink-muted);
	}
	.bar {
		height: 0.28rem;
		margin-top: 0.2rem;
		overflow: hidden;
		border-radius: 999px;
		background: var(--rule);
	}
	.bar span {
		display: block;
		height: 100%;
		background: #587966;
	}
	.calamity-component .bar span {
		background: #a65742;
	}
	.empty {
		display: grid;
		min-height: 8rem;
		place-content: center;
		text-align: center;
		color: var(--ink-muted);
	}
	.empty span {
		font-family: ui-monospace, monospace;
		font-size: 1.5rem;
	}
	.empty p {
		margin-top: 0.4rem;
		font-size: 0.72rem;
	}
</style>
