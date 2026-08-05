<script lang="ts">
	import type { Bias } from '$lib/visualizations/bias-archipelago/bias-types';

	let { biases }: { biases: Bias[] } = $props();
	let query = $state('');
	let normalized = $derived(query.trim().toLocaleLowerCase('en'));
	let filtered = $derived(
		biases.filter((bias) => {
			if (!normalized) return true;
			return [bias.name, bias.definition, bias.family, ...bias.aliases, ...bias.mechanisms]
				.join(' ')
				.toLocaleLowerCase('en')
				.includes(normalized);
		})
	);
</script>

<section class="bias-index" aria-labelledby="bias-index-heading">
	<details class="field-guide">
		<summary class="field-guide-summary">
			<span>
				<small>Textual chart companion</small>
				<strong id="bias-index-heading">Open the complete 90-entry field guide</strong>
			</span>
			<em>Definitions, examples, mechanisms, and evidence notes</em>
		</summary>
		<div class="field-guide-body">
			<div class="index-heading">
				<div>
					<p>Complete reference</p>
					<h2>Searchable bias index</h2>
				</div>
				<label>
					<span>Search names, aliases, mechanisms, or definitions</span>
					<input type="search" bind:value={query} placeholder="Try “familiarity” or “loss”…" />
				</label>
			</div>
			<p class="index-intro">
				All {biases.length} entries and their definitions are present in the server-rendered page. Search
				is an enhancement; the native disclosure and every entry still work when JavaScript is unavailable.
			</p>
			<div class="index-grid" aria-live="polite">
				{#each filtered as bias (bias.id)}
					<details id={`index-${bias.id}`}>
						<summary>
							<span>{bias.name}</span>
							<small>{bias.family.replaceAll('-', ' ')}</small>
						</summary>
						<div>
							<p>{bias.definition}</p>
							<p><strong>Example:</strong> {bias.example}</p>
							<p><strong>Recipe:</strong> {bias.mechanisms.join(' · ')}</p>
							<p><strong>Evidence:</strong> {bias.evidenceNote}</p>
							{#if bias.aliases.length}<p>
									<strong>Also called:</strong>
									{bias.aliases.join(', ')}
								</p>{/if}
						</div>
					</details>
				{/each}
			</div>
			{#if filtered.length === 0}<p class="empty">No entries match “{query}”.</p>{/if}
		</div>
	</details>
</section>

<style>
	.bias-index {
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(76rem, calc(100vw - 2rem));
		margin: 4rem 0;
		padding: clamp(1.2rem, 3vw, 2rem);
		transform: translateX(-50%);
		border: 1px solid #b6c8c8;
		border-radius: 0.8rem;
		background: #f5f7f3;
		color: #17343a;
		font-family: var(--font-sans);
	}

	.field-guide {
		border: 0;
		background: transparent;
	}

	.field-guide-summary {
		display: flex;
		min-height: 5rem;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 0.8rem 0;
		cursor: pointer;
		list-style: none;
	}

	.field-guide-summary::-webkit-details-marker {
		display: none;
	}

	.field-guide-summary::after {
		content: '＋';
		flex: 0 0 auto;
		font-size: 1.5rem;
	}

	.field-guide[open] > .field-guide-summary {
		border-bottom: 1px solid #c8d5d3;
	}

	.field-guide[open] > .field-guide-summary::after {
		content: '−';
	}

	.field-guide-summary span {
		display: grid;
		gap: 0.25rem;
	}

	.field-guide-summary small {
		color: #577176;
		font-size: 0.68rem;
		font-style: normal;
		font-weight: 750;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.field-guide-summary strong {
		font-family: var(--font-article-body);
		font-size: clamp(1.35rem, 3vw, 2rem);
		line-height: 1.1;
	}

	.field-guide-summary em {
		max-width: 24rem;
		color: #61777a;
		font-size: 0.74rem;
		font-style: normal;
		line-height: 1.45;
		text-align: right;
	}

	.field-guide-body {
		padding-top: 1.4rem;
	}

	.index-heading {
		display: grid;
		grid-template-columns: 1fr minmax(16rem, 25rem);
		gap: 1.5rem;
		align-items: end;
	}

	.index-heading p {
		margin: 0 0 0.25rem;
		color: #577176;
		font-size: 0.7rem;
		font-weight: 750;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		font-family: var(--font-article-body);
		font-size: clamp(1.6rem, 4vw, 2.5rem);
		line-height: 1.05;
	}

	label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.72rem;
		font-weight: 650;
	}

	input {
		min-height: 2.8rem;
		padding: 0.55rem 0.75rem;
		border: 1px solid #8ba4a5;
		border-radius: 0.4rem;
		background: white;
		color: #17343a;
		font: inherit;
	}

	.index-intro {
		max-width: 58rem;
		margin: 1rem 0 1.4rem;
		color: #536a6e;
		font-size: 0.84rem;
		line-height: 1.55;
	}

	.index-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.index-grid details {
		align-self: start;
		border: 1px solid #c8d5d3;
		border-radius: 0.45rem;
		background: rgb(255 255 255 / 72%);
	}

	.index-grid summary {
		display: flex;
		min-height: 3.25rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0.65rem 0.75rem;
		font-size: 0.86rem;
		font-weight: 750;
		cursor: pointer;
	}

	.index-grid summary small {
		color: #6b8587;
		font-size: 0.6rem;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-align: right;
		text-transform: uppercase;
	}

	.index-grid details > div {
		padding: 0 0.8rem 0.8rem;
		border-top: 1px solid #d6e0de;
	}

	.index-grid details p {
		margin: 0.65rem 0 0;
		font-family: var(--font-sans) !important;
		font-size: 0.76rem !important;
		line-height: 1.5 !important;
	}

	.empty {
		padding: 1rem;
		border: 1px dashed #8ba4a5;
		text-align: center;
	}

	@media (max-width: 46rem) {
		.index-heading,
		.index-grid {
			grid-template-columns: 1fr;
		}

		.bias-index {
			width: calc(100vw - 1rem);
			padding: 1rem;
		}

		.field-guide-summary {
			align-items: flex-start;
		}

		.field-guide-summary em {
			display: none;
		}
	}

	@media (prefers-color-scheme: dark) {
		.bias-index {
			border-color: #35545a;
			background: #101f23;
			color: #e6efeb;
		}

		.index-heading p,
		.index-intro,
		.field-guide-summary small,
		.index-grid summary small {
			color: #9eb6b5;
		}

		input,
		.index-grid details {
			border-color: #42636a;
			background: #172a2e;
			color: #e6efeb;
		}

		.field-guide[open] > .field-guide-summary,
		.index-grid details > div {
			border-color: #2d4b50;
		}

		.field-guide-summary em {
			color: #9eb6b5;
		}
	}
</style>
