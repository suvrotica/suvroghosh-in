<script lang="ts">
	import { add, complex, multiply } from '$lib/visualizations/domain-coloring/complex';

	const examples = [
		{ label: 'A quick escape', re: 0.5, im: 0.5 },
		{ label: 'Period two', re: -1, im: 0 },
		{ label: 'Boundary patience', re: -0.75, im: 0.1 }
	] as const;

	let selected = $state(0);
	let step = $state(0);
	let cRe = $state<number>(examples[0].re);
	let cIm = $state<number>(examples[0].im);

	let orbit = $derived.by(() => {
		const points = [complex(0, 0)];
		const c = complex(cRe, cIm);
		for (let index = 0; index < 10; index += 1) {
			points.push(add(multiply(points[index], points[index]), c));
		}
		return points;
	});

	let current = $derived(orbit[step]);

	function choose(index: number) {
		selected = index;
		cRe = examples[index].re;
		cIm = examples[index].im;
		step = 0;
	}

	function format(value: number) {
		if (!Number.isFinite(value)) return 'not finite';
		const precision = Math.abs(value) >= 100 ? 2 : 5;
		return Number(value.toFixed(precision)).toString();
	}
</script>

<figure class="machine not-prose" aria-labelledby="iteration-machine-heading">
	<div class="machine-copy">
		<p class="eyebrow">Feedback apparatus · ten rounds</p>
		<h2 id="iteration-machine-heading">Put the answer back</h2>
		<div class="loop" aria-label="Starting value, square, add c, new value, then repeat">
			<span>starting value</span><b aria-hidden="true">→</b><span>square</span><b aria-hidden="true"
				>→</b
			><span>add c</span><b aria-hidden="true">→</b><span>new value</span>
			<i aria-hidden="true">↖──────────────────────↙</i>
		</div>
		<div class="examples" aria-label="Example parameters">
			{#each examples as example, index (example.label)}
				<button
					type="button"
					class:active={selected === index}
					aria-pressed={selected === index}
					onclick={() => choose(index)}>{example.label}</button
				>
			{/each}
		</div>
		<div class="parameter-grid">
			<label>
				<span>Real part of c</span>
				<input type="number" step="0.001" bind:value={cRe} onchange={() => (selected = -1)} />
			</label>
			<label>
				<span>Imaginary part of c</span>
				<input type="number" step="0.001" bind:value={cIm} onchange={() => (selected = -1)} />
			</label>
		</div>
	</div>

	<div class="stepper">
		<div class="readout" aria-live="polite">
			<span>Round {step}</span>
			<strong
				>z<sub>{step}</sub> = {format(current.re)}
				{current.im < 0 ? '−' : '+'}
				{format(Math.abs(current.im))}i</strong
			>
			<small>|z<sub>{step}</sub>| = {format(Math.hypot(current.re, current.im))}</small>
		</div>
		<input aria-label="Iteration number" type="range" min="0" max="10" step="1" bind:value={step} />
		<div class="transport">
			<button type="button" onclick={() => (step = Math.max(0, step - 1))} disabled={step === 0}
				>Previous</button
			>
			<button type="button" onclick={() => (step = Math.min(10, step + 1))} disabled={step === 10}
				>Feed it back</button
			>
			<button type="button" onclick={() => (step = 0)}>Reset</button>
		</div>
		<div class="table-wrap">
			<table>
				<caption>Calculated orbit through the selected round</caption>
				<thead>
					<tr><th>n</th><th>Re(zₙ)</th><th>Im(zₙ)</th><th>|zₙ|</th></tr>
				</thead>
				<tbody>
					{#each orbit.slice(0, step + 1) as point, index (index)}
						<tr class:current-row={index === step}>
							<td>{index}</td>
							<td>{format(point.re)}</td>
							<td>{format(point.im)}</td>
							<td>{format(Math.hypot(point.re, point.im))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
	<figcaption>
		The machine starts at z₀ = 0. Its answer is exact only to the precision of the browser's
		numbers.
	</figcaption>
</figure>

<style>
	.machine {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.9fr);
		gap: 1.2rem;
		margin: 1.7rem 0;
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: clamp(1rem, 3vw, 1.45rem);
		box-shadow: 0 14px 32px rgb(25 18 38 / 7%);
	}

	.machine-copy {
		min-width: 0;
	}

	.eyebrow {
		margin: 0;
		color: var(--essay-ink);
		font: 700 0.68rem/1.2 var(--font-sans);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0.35rem 0 0.8rem;
		font: 750 1.35rem/1.15 var(--font-sans);
	}

	.loop {
		display: grid;
		grid-template-columns: repeat(7, auto);
		align-items: center;
		gap: 0.3rem;
		overflow-x: auto;
		padding: 0.7rem 0;
		font: 0.72rem/1.2 var(--font-mono);
	}

	.loop span {
		border: 1px solid var(--rule);
		border-radius: 0.3rem;
		background: var(--paper);
		padding: 0.45rem;
		white-space: nowrap;
	}

	.loop i {
		grid-column: 3 / 8;
		color: var(--essay-ink);
		font-style: normal;
		text-align: center;
	}

	.examples,
	.transport {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.35rem;
		background: var(--paper);
		padding: 0.45rem 0.7rem;
		color: var(--ink);
		font: 650 0.72rem/1.2 var(--font-sans);
		cursor: pointer;
	}

	button.active {
		border-color: var(--essay-ink);
		box-shadow: inset 3px 0 0 var(--essay-ink);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.parameter-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
		margin-top: 0.8rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
		font: 650 0.7rem/1.2 var(--font-sans);
	}

	input[type='number'] {
		min-height: 2.75rem;
		min-width: 0;
		border: 1px solid var(--control-border);
		border-radius: 0.3rem;
		background: var(--paper);
		padding: 0.45rem 0.55rem;
		color: var(--ink);
		font: 0.78rem/1.2 var(--font-mono);
	}

	.stepper {
		min-width: 0;
		border-left: 1px solid var(--rule);
		padding-left: 1.2rem;
	}

	.readout {
		display: grid;
		gap: 0.3rem;
		min-height: 6.2rem;
		border-radius: 0.45rem;
		background: #0b0c14;
		padding: 0.85rem;
		color: #f4ead1;
		font-family: var(--font-mono);
	}

	.readout span,
	.readout small {
		color: #b9b3c9;
		font-size: 0.68rem;
	}

	.readout strong {
		overflow-wrap: anywhere;
		font-size: 0.82rem;
	}

	input[type='range'] {
		width: 100%;
		margin: 0.9rem 0;
		accent-color: var(--essay-ink);
	}

	.table-wrap {
		max-height: 11rem;
		margin-top: 0.8rem;
		overflow: auto;
		border: 1px solid var(--rule);
		border-radius: 0.35rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font: 0.68rem/1.3 var(--font-mono);
	}

	caption {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	th,
	td {
		border-bottom: 1px solid var(--rule);
		padding: 0.35rem 0.45rem;
		text-align: right;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	.current-row {
		background: color-mix(in oklab, var(--essay-ink) 12%, var(--paper));
	}

	figcaption {
		grid-column: 1 / -1;
		color: var(--ink-muted);
		font: 0.76rem/1.45 var(--font-sans);
	}

	@media (max-width: 48rem) {
		.machine {
			grid-template-columns: 1fr;
		}

		.stepper {
			border-top: 1px solid var(--rule);
			border-left: 0;
			padding-top: 1rem;
			padding-left: 0;
		}
	}

	@media (max-width: 30rem) {
		.parameter-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
