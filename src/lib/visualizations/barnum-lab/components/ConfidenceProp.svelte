<script lang="ts">
	let {
		value,
		answeredCount,
		decoration,
		revealed = false
	}: {
		value: number;
		answeredCount: number;
		decoration: number;
		revealed?: boolean;
	} = $props();

	let calculationHidden = $state(false);
	let rawValue = $derived(39 + answeredCount * 6 + decoration);
	let calculationVisible = $derived(revealed && !calculationHidden);
</script>

<section class="confidence" class:disowned={revealed} aria-labelledby="confidence-heading">
	<div class="meter-copy">
		<div>
			<p class="eyebrow">{revealed ? 'How the display was made' : 'Reading display'}</p>
			<h3 id="confidence-heading">{revealed ? 'Manufactured confidence' : 'Reading confidence'}</h3>
			<span>
				{revealed
					? 'This number rose with clicks, not with knowledge about you.'
					: 'Demonstration display—not a scientific score.'}
			</span>
		</div>
		<output aria-label={`Reading confidence display ${value} percent`}
			>{value}<small>%</small></output
		>
	</div>

	<div
		class="track"
		role="img"
		aria-label={`Demonstration meter filled to ${value} percent. This is not a scientific score.`}
	>
		<span style={`--value: ${Math.max(0, Math.min(100, value))}%`}></span>
	</div>

	{#if revealed}
		<button
			type="button"
			aria-expanded={calculationVisible}
			onclick={() => (calculationHidden = !calculationHidden)}
		>
			{calculationVisible ? 'Hide calculation' : 'Show calculation'}
		</button>
	{/if}

	{#if calculationVisible}
		<div class="formula">
			<code>d = floor(PRNG(session seed, “fake-confidence”) × 4)</code>
			<code>shown = min(96, 39 + completed controls × 6 + d)</code>
			<p>
				For this display, the deterministic seed decoration <em>d</em> is {decoration} (always an integer
				from 0 through 3). The uncapped prop is 39 + {answeredCount} × 6 + {decoration} =
				{rawValue}; min(96, {rawValue}) = <strong>{value}%</strong>.
			</p>
			<p class="verdict">
				In plain language: it starts at 39, adds six points per completed control, adds a tiny
				repeatable flourish from the local deck seed, then caps at 96. It is theatrical decoration,
				not statistical evidence or a probability.
			</p>
		</div>
	{/if}
</section>

<style>
	.confidence {
		display: grid;
		gap: 0.65rem;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.5rem;
		background: var(--barnum-soft);
		padding: 0.75rem;
	}

	.confidence.disowned {
		border-style: dashed;
	}

	.meter-copy {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.meter-copy p,
	.meter-copy h3,
	.meter-copy span,
	.formula p {
		margin: 0;
	}

	.eyebrow {
		color: var(--barnum-vermilion-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h3 {
		margin-top: 0.1rem !important;
		font: 790 0.85rem/1.2 var(--barnum-sans);
	}

	.meter-copy div > span {
		display: block;
		margin-top: 0.08rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.35 var(--barnum-sans);
	}

	output {
		font: 820 1.35rem/1 var(--barnum-mono);
		font-variant-numeric: tabular-nums;
	}

	output small {
		font-size: 0.7rem;
	}

	.track {
		height: 0.6rem;
		overflow: hidden;
		border: 1px solid var(--barnum-control);
		border-radius: 999px;
		background: var(--barnum-paper);
	}

	.track span {
		display: block;
		width: var(--value);
		height: 100%;
		background: repeating-linear-gradient(
			-45deg,
			var(--barnum-vermilion),
			var(--barnum-vermilion) 0.3rem,
			color-mix(in oklab, var(--barnum-vermilion) 65%, var(--barnum-paper)) 0.3rem,
			color-mix(in oklab, var(--barnum-vermilion) 65%, var(--barnum-paper)) 0.6rem
		);
	}

	button {
		width: fit-content;
		min-height: 2.75rem;
		border: 0;
		background: transparent;
		padding: 0.45rem 0;
		color: var(--barnum-blue-text);
		font: 750 0.75rem/1.35 var(--barnum-sans);
		text-decoration: underline;
		text-underline-offset: 0.18em;
		cursor: pointer;
	}

	button:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.formula {
		display: grid;
		gap: 0.42rem;
		border-top: 1px solid var(--barnum-rule);
		padding-top: 0.65rem;
	}

	code {
		display: block;
		overflow-wrap: anywhere;
		font: 0.72rem/1.5 var(--barnum-mono);
	}

	.formula p {
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.formula .verdict {
		color: var(--barnum-ink);
		font-weight: 760;
	}

	@media (forced-colors: active) {
		.confidence,
		.track,
		.formula {
			border-color: CanvasText;
		}

		.track span {
			background: Highlight;
		}
	}
</style>
