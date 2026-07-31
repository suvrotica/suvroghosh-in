<script lang="ts">
	import type { CityResult } from '$lib/visualizations/city-master-plan';

	type ChallengeKind = 'functional' | 'calamity' | 'anchor';
	type Props = {
		kind: ChallengeKind | null;
		challenger: CityResult | null;
		city: CityResult | null;
		onrematch: () => void;
	};

	let { kind, challenger, city, onrematch }: Props = $props();

	let scoreLabel = $derived(kind === 'calamity' ? 'Calamity' : 'Functional');
	let challengerScore = $derived(
		challenger
			? kind === 'calamity'
				? challenger.scores.calamity
				: challenger.scores.functional
			: 0
	);
	let cityScore = $derived(
		city ? (kind === 'calamity' ? city.scores.calamity : city.scores.functional) : 0
	);
	let componentDeltas = $derived.by(() => {
		if (!challenger || !city) return [];
		const challengerComponents =
			kind === 'calamity'
				? challenger.scores.calamityComponents
				: challenger.scores.functionalComponents;
		const cityComponents =
			kind === 'calamity' ? city.scores.calamityComponents : city.scores.functionalComponents;
		const challengerValues = new Map(
			challengerComponents.map((component) => [component.key, component.value])
		);
		return cityComponents
			.map((component) => ({
				key: component.key,
				label: component.label,
				delta: Math.round((component.value - (challengerValues.get(component.key) ?? 0)) * 10) / 10
			}))
			.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
			.slice(0, 3);
	});
	let notableAnomalies = $derived.by(() => {
		if (!challenger || !city) return [];
		const labels = [...challenger.municipalPatches, ...city.municipalPatches].map((patch) =>
			patch.anomalyType.replaceAll('-', ' ')
		);
		return [...new Set(labels)].slice(0, 4);
	});
</script>

{#if kind}
	<section class="challenge-panel" aria-labelledby="city-challenge-heading">
		<div>
			<p>Friendly challenge · {kind.replaceAll('-', ' ')}</p>
			<h3 id="city-challenge-heading">Two cities, recomputed locally</h3>
		</div>
		{#if challenger && city}
			<div class="comparison">
				<article>
					<span>Challenger</span>
					<strong>{challenger.cityName}</strong>
					<output>{scoreLabel}: {challengerScore}</output>
					<small>{challenger.municipalPatches.length} retrospective permissions</small>
				</article>
				<article>
					<span>Your city</span>
					<strong>{city.cityName}</strong>
					<output>{scoreLabel}: {cityScore}</output>
					<small>{city.municipalPatches.length} retrospective permissions</small>
				</article>
			</div>
			<p class="verdict">
				{#if cityScore === challengerScore}
					The committee records a tie and recommends tea.
				{:else if cityScore > challengerScore}
					Your city leads by {cityScore - challengerScore} points.
				{:else}
					The challenger leads by {challengerScore - cityScore} points.
				{/if}
			</p>
			<div class="details">
				<div>
					<strong>Largest component differences</strong>
					<ul>
						{#each componentDeltas as component (component.key)}
							<li>
								{component.label}:
								<span class:positive={component.delta > 0}
									>{component.delta > 0 ? '+' : ''}{component.delta}</span
								>
							</li>
						{/each}
					</ul>
				</div>
				<div>
					<strong>Notable anomalies</strong>
					<p>
						{notableAnomalies.length
							? notableAnomalies.join(', ')
							: 'Neither survey needed a named exception.'}
					</p>
				</div>
			</div>
			<button type="button" class="rematch" onclick={onrematch}>Share rematch</button>
		{:else}
			<p class="waiting">Both cities are being generated from the supplied settings.</p>
		{/if}
	</section>
{/if}

<style>
	.challenge-panel {
		border: 1px solid var(--accent);
		border-radius: 0.65rem;
		background: color-mix(in srgb, var(--accent) 6%, var(--paper-raised));
		padding: 0.75rem;
	}
	.challenge-panel > div:first-child p,
	.challenge-panel h3,
	.verdict,
	.waiting {
		margin: 0;
	}
	.challenge-panel > div:first-child p {
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.challenge-panel h3 {
		margin-top: 0.15rem;
		font-size: 0.88rem;
		color: var(--ink);
	}
	.comparison {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.65rem;
	}
	.comparison article {
		display: grid;
		gap: 0.2rem;
		border: 1px solid var(--rule);
		border-radius: 0.45rem;
		background: var(--paper);
		padding: 0.55rem;
	}
	.comparison span,
	.comparison small {
		font-size: 0.62rem;
		color: var(--ink-muted);
	}
	.comparison strong {
		font-size: 0.72rem;
		color: var(--ink);
	}
	.comparison output {
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		color: var(--accent);
	}
	.verdict,
	.waiting {
		margin-top: 0.55rem;
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--ink);
	}
	.details {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.55rem;
	}
	.details > div {
		border-top: 1px dotted var(--rule);
		padding-top: 0.4rem;
	}
	.details strong,
	.details li,
	.details p {
		font-size: 0.62rem;
		line-height: 1.4;
		color: var(--ink);
	}
	.details ul,
	.details p {
		margin: 0.25rem 0 0;
	}
	.details ul {
		padding-left: 1rem;
	}
	.details span {
		font-family: ui-monospace, monospace;
		color: var(--danger, #9b3d2d);
	}
	.details span.positive {
		color: var(--success, #28724f);
	}
	.rematch {
		min-height: 2.75rem;
		margin-top: 0.55rem;
		border: 1px solid var(--accent);
		border-radius: 0.42rem;
		background: var(--paper);
		padding: 0.45rem 0.65rem;
		font: inherit;
		font-size: 0.66rem;
		font-weight: 800;
		color: var(--accent);
		cursor: pointer;
	}
	.rematch:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	@media (max-width: 420px) {
		.details {
			grid-template-columns: 1fr;
		}
	}
</style>
