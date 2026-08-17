<script lang="ts">
	export interface ProbabilityAdapter {
		expectedAccepts: (n: number, p: number) => number;
		atLeastOne: (n: number, p: number) => number;
		atLeastK: (n: number, p: number, k: number) => number;
		naturalFrequency: (probability: number, sessions?: number) => number;
		distinguishingPower: (
			groupA: number,
			groupB: number
		) => { absoluteDifference: number; likelihoodRatio: number | null };
	}

	let { probability }: { probability: ProbabilityAdapter } = $props();

	let p = $state(0.35);
	let n = $state(8);
	let k = $state(3);
	let groupA = $state(0.7);
	let groupB = $state(0.6);
	const FREQUENCY_MARKS = [...Array(100).keys()];

	let expected = $derived(probability.expectedAccepts(n, p));
	let atLeastOne = $derived(probability.atLeastOne(n, p));
	let oneClaimExpected = $derived(probability.expectedAccepts(1, p));
	let currentClaimsExpected = $derived(probability.expectedAccepts(n, p));
	let oneClaimMatch = $derived(probability.atLeastOne(1, p));
	let currentClaimsMatch = $derived(probability.atLeastOne(n, p));
	let atLeastK = $derived(k > n ? 0 : probability.atLeastK(n, p, k));
	let distinguishing = $derived(probability.distinguishingPower(groupA, groupB));
	let groupANaturalCount = $derived(probability.naturalFrequency(groupA, 1_000));
	let groupBNaturalCount = $derived(probability.naturalFrequency(groupB, 1_000));
	let filledMarks = $derived(Math.round(atLeastOne * 100));
	let naturalCount = $derived(probability.naturalFrequency(atLeastOne, 1_000));

	function setProbability(value: number): void {
		p = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
	}

	function setCount(value: number): void {
		n = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
		k = Math.min(k, n + 1);
	}

	function setThreshold(value: number): void {
		k = Math.max(0, Math.min(n + 1, Math.round(Number.isFinite(value) ? value : 0)));
	}

	function setGroup(which: 'a' | 'b', value: number): void {
		const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
		if (which === 'a') groupA = next;
		else groupB = next;
	}
</script>

<section class="probability" aria-labelledby="probability-heading">
	<header>
		<p>Experiment 2 · One guess versus the current number</p>
		<h3 id="probability-heading">The probability of throwing enough darts</h3>
		<p>Set the assumptions yourself. Nothing below is estimated from your session.</p>
	</header>

	<div class="control-grid">
		<div class="control">
			<label for="barnum-p">Hypothetical chance one broad claim is accepted, <i>p</i></label>
			<div>
				<input
					id="barnum-p"
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={p}
					oninput={(event) => setProbability(Number(event.currentTarget.value))}
				/>
				<input
					type="number"
					min="0"
					max="1"
					step="0.01"
					aria-label="Probability p numeric value"
					value={p}
					onchange={(event) => setProbability(Number(event.currentTarget.value))}
				/>
				<output for="barnum-p">{Math.round(p * 100)}%</output>
			</div>
		</div>

		<div class="control">
			<label for="barnum-n">Number of distinct claims, <i>n</i></label>
			<div>
				<input
					id="barnum-n"
					type="range"
					min="0"
					max="100"
					step="1"
					value={n}
					oninput={(event) => setCount(Number(event.currentTarget.value))}
				/>
				<input
					type="number"
					min="0"
					max="100"
					step="1"
					aria-label="Number of claims numeric value"
					value={n}
					onchange={(event) => setCount(Number(event.currentTarget.value))}
				/>
				<output for="barnum-n">{n}</output>
			</div>
		</div>
	</div>

	<section
		class="multiplicity-comparison"
		data-testid="barnum-one-vs-many"
		aria-labelledby="one-vs-twelve-heading"
	>
		<header>
			<h4 id="one-vs-twelve-heading">
				Same hypothetical <i>p</i>: one claim versus {n}
				{n === 1 ? 'claim' : 'claims'}
			</h4>
			<p>
				This holds the visitor-set chance per claim at {Math.round(p * 100)}% and changes only the
				number of distinct guesses.
			</p>
		</header>
		<div>
			<article>
				<span>One claim</span>
				<strong>{(oneClaimMatch * 100).toFixed(1)}%</strong>
				<small>at least one accepted · {oneClaimExpected.toFixed(2)} expected accepts</small>
			</article>
			<span class="comparison-arrow" aria-hidden="true">→</span>
			<article>
				<span>{n} {n === 1 ? 'claim' : 'claims'}</span>
				<strong>{(currentClaimsMatch * 100).toFixed(1)}%</strong>
				<small>at least one accepted · {currentClaimsExpected.toFixed(2)} expected accepts</small>
			</article>
		</div>
		<p class="comparison-caveat">
			Hypothetical illustration only. It assumes {n} independent {n === 1 ? 'claim' : 'claims'} with the
			same acceptance probability; it is not a measured Barnum-effect rate or personal score.
		</p>
	</section>

	<div class="results" data-testid="barnum-probability-results">
		<article>
			<span>Expected accepted claims</span>
			<strong>{expected.toFixed(2)}</strong>
			<code>n × p</code>
		</article>
		<article>
			<span>At least one accepted</span>
			<strong>{(atLeastOne * 100).toFixed(1)}%</strong>
			<code>1 − (1 − p)<sup>n</sup></code>
		</article>
	</div>

	<div
		class="frequency"
		role="img"
		aria-label={`${naturalCount} of 1,000 hypothetical sessions have at least one accepted claim under these assumptions`}
	>
		<div aria-hidden="true">
			{#each FREQUENCY_MARKS as index (index)}
				<span class:filled={index < filledMarks}></span>
			{/each}
		</div>
		<p>
			About <strong>{naturalCount} of 1,000</strong> hypothetical sessions, if the equal-probability and
			independence assumptions held. Each mark represents ten sessions.
		</p>
	</div>

	<details>
		<summary>More probability controls</summary>
		<div class="details-body">
			<section aria-labelledby="threshold-heading">
				<h4 id="threshold-heading">At least <i>k</i> accepted claims</h4>
				<div class="control compact">
					<label for="barnum-k">Threshold, <i>k</i></label>
					<div>
						<input
							id="barnum-k"
							type="range"
							min="0"
							max={n + 1}
							step="1"
							value={k}
							oninput={(event) => setThreshold(Number(event.currentTarget.value))}
						/>
						<input
							type="number"
							min="0"
							max={n + 1}
							step="1"
							aria-label="Threshold k numeric value"
							value={k}
							onchange={(event) => setThreshold(Number(event.currentTarget.value))}
						/>
						<output for="barnum-k">{k}</output>
					</div>
				</div>
				{#if k > n}
					<p class="threshold-result" data-testid="barnum-k-impossible">
						<strong>Impossible because k is greater than n; probability 0.</strong>
					</p>
				{:else}
					<p class="threshold-result">
						P(at least {k}) = <strong>{(atLeastK * 100).toFixed(1)}%</strong>
					</p>
					<code class="long-formula" data-testid="barnum-at-least-k-formula">
						Σ from i={k} to {n} of C({n}, i) p<sup>i</sup>(1−p)<sup>{n}−i</sup>
					</code>
				{/if}
			</section>

			<section aria-labelledby="distinguishing-heading">
				<h4 id="distinguishing-heading">A minimal distinguishing-power check</h4>
				<p>
					Use fictional groups only. Similar acceptance rates carry little distinguishing
					information.
				</p>
				{#each [{ id: 'a', label: 'Fictional Group A', value: groupA }, { id: 'b', label: 'Fictional Group B', value: groupB }] as group (group.id)}
					<div class="control compact">
						<label for={`barnum-group-${group.id}`}>{group.label}</label>
						<div>
							<input
								id={`barnum-group-${group.id}`}
								type="range"
								min="0"
								max="1"
								step="0.01"
								value={group.value}
								oninput={(event) =>
									setGroup(group.id as 'a' | 'b', Number(event.currentTarget.value))}
							/>
							<input
								type="number"
								min="0"
								max="1"
								step="0.01"
								aria-label={`${group.label} acceptance proportion`}
								value={group.value}
								onchange={(event) =>
									setGroup(group.id as 'a' | 'b', Number(event.currentTarget.value))}
							/>
							<output for={`barnum-group-${group.id}`}>{Math.round(group.value * 100)}%</output>
						</div>
					</div>
				{/each}
				<p class="threshold-result">
					Absolute difference: <strong
						>{(distinguishing.absoluteDifference * 100).toFixed(1)} points</strong
					>. Likelihood ratio:
					<strong
						>{distinguishing.likelihoodRatio === null
							? 'undefined'
							: distinguishing.likelihoodRatio.toFixed(2)}</strong
					>.
				</p>
				<p class="paired-frequencies" data-testid="barnum-distinguishing-natural-frequencies">
					The same fictional rates as natural frequencies: <strong
						>{groupANaturalCount} of 1,000 in Group A</strong
					>
					versus <strong>{groupBNaturalCount} of 1,000 in Group B</strong>.
				</p>
				<p>
					The ratio compares how expected the same “fit” is in A versus B. It is not the probability
					that someone belongs to A; that would also require a prior.
				</p>
			</section>
		</div>
	</details>

	<p class="caveat">
		<strong>Illustrative assumptions, not measured Barnum-effect rates.</strong> The binomial probabilities
		assume independent claims with the same acceptance probability; real statements overlap and people’s
		responses are correlated. This session does not establish that you neglected a base rate.
	</p>
</section>

<style>
	.probability {
		display: grid;
		gap: 0.85rem;
		border: 1px solid var(--barnum-rule);
		border-top: 4px solid var(--barnum-ink);
		border-radius: 0.55rem;
		background: var(--barnum-raised);
		padding: clamp(0.75rem, 2cqi, 1rem);
	}

	header p,
	header h3,
	.frequency p,
	.threshold-result,
	.paired-frequencies,
	.details-body section > p,
	.caveat,
	h4 {
		margin: 0;
	}

	header > p:first-child {
		color: var(--barnum-vermilion-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h3 {
		margin-top: 0.12rem;
		font: 810 clamp(1rem, 2.2cqi, 1.2rem) / 1.2 var(--barnum-sans);
	}

	header > p:last-child,
	.frequency p,
	.details-body section > p,
	.caveat,
	.threshold-result {
		margin-top: 0.2rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.control-grid,
	.results {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.multiplicity-comparison {
		display: grid;
		gap: 0.6rem;
		border: 1px solid var(--barnum-blue);
		border-radius: 0.45rem;
		background: color-mix(in oklab, var(--barnum-blue) 7%, var(--barnum-paper));
		padding: 0.7rem;
	}

	.multiplicity-comparison header h4,
	.multiplicity-comparison header p,
	.comparison-caveat {
		margin: 0;
	}

	.multiplicity-comparison header p,
	.comparison-caveat {
		margin-top: 0.2rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.multiplicity-comparison > div {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
	}

	.multiplicity-comparison article {
		display: grid;
		gap: 0.15rem;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.35rem;
		background: var(--barnum-raised);
		padding: 0.6rem;
	}

	.multiplicity-comparison article span,
	.multiplicity-comparison article small {
		font: 0.72rem/1.4 var(--barnum-sans);
	}

	.multiplicity-comparison article strong {
		font: 820 1.1rem/1.1 var(--barnum-mono);
		font-variant-numeric: tabular-nums;
	}

	.multiplicity-comparison article small {
		color: var(--barnum-muted);
	}

	.comparison-arrow {
		font: 800 1rem/1 var(--barnum-mono);
	}

	.control {
		display: grid;
		gap: 0.4rem;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.4rem;
		background: var(--barnum-paper);
		padding: 0.65rem;
	}

	.control > label {
		font: 750 0.75rem/1.4 var(--barnum-sans);
	}

	.control > div {
		display: grid;
		grid-template-columns: minmax(4rem, 1fr) 4.2rem 3rem;
		align-items: center;
		gap: 0.45rem;
	}

	input[type='number'] {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		background: var(--barnum-raised);
		padding: 0.4rem;
		color: var(--barnum-ink);
		font: 700 0.75rem var(--barnum-mono);
	}

	output {
		font: 750 0.72rem/1.2 var(--barnum-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	input:focus-visible,
	details summary:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.results article {
		display: grid;
		gap: 0.16rem;
		border: 1px solid var(--barnum-rule);
		border-left: 3px solid var(--barnum-blue);
		border-radius: 0.4rem;
		background: var(--barnum-soft);
		padding: 0.65rem;
	}

	.results span {
		font: 730 0.72rem/1.35 var(--barnum-sans);
	}

	.results strong {
		font: 820 1.1rem/1.1 var(--barnum-mono);
		font-variant-numeric: tabular-nums;
	}

	.results code,
	.long-formula {
		color: var(--barnum-muted);
		font: 0.7rem/1.45 var(--barnum-mono);
	}

	.frequency {
		display: grid;
		gap: 0.45rem;
	}

	.frequency > div {
		display: grid;
		grid-template-columns: repeat(20, minmax(0, 1fr));
		gap: 0.2rem;
	}

	.frequency span {
		aspect-ratio: 1;
		border: 1px solid var(--barnum-control);
		border-radius: 50%;
		background: var(--barnum-paper);
	}

	.frequency span.filled {
		border-color: var(--barnum-blue);
		background: var(--barnum-blue);
	}

	details {
		border: 1px solid var(--barnum-rule);
		border-radius: 0.4rem;
	}

	details > summary {
		min-height: 3rem;
		padding: 0.75rem;
		font: 760 0.75rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	.details-body {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
		border-top: 1px solid var(--barnum-rule);
		padding: 0.75rem;
	}

	.details-body section {
		min-width: 0;
	}

	h4 {
		font: 770 0.72rem/1.3 var(--barnum-sans);
	}

	.control.compact {
		margin-top: 0.55rem;
		padding: 0;
		border: 0;
	}

	.long-formula {
		display: block;
		margin-top: 0.35rem;
		overflow-wrap: anywhere;
	}

	.caveat {
		border-left: 4px solid var(--barnum-vermilion);
		background: color-mix(in oklab, var(--barnum-vermilion) 7%, var(--barnum-paper));
		padding: 0.65rem;
	}

	.caveat strong {
		color: var(--barnum-ink);
	}

	@media (max-width: 45rem) {
		.control-grid,
		.results,
		.details-body {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 26rem) {
		.control > div {
			grid-template-columns: minmax(0, 1fr) 4rem;
		}

		.control input[type='range'] {
			grid-column: 1 / -1;
		}

		.frequency > div {
			grid-template-columns: repeat(10, minmax(0, 1fr));
		}

		.multiplicity-comparison > div {
			grid-template-columns: 1fr;
		}

		.comparison-arrow {
			transform: rotate(90deg);
			text-align: center;
		}
	}

	@media (forced-colors: active) {
		.probability,
		.control,
		.results article,
		details,
		.details-body,
		input[type='number'],
		.frequency span {
			border-color: CanvasText;
		}

		.frequency span.filled {
			background: Highlight;
		}
	}
</style>
