<script lang="ts">
	import type { BreadthEstimate, RatingCounts } from './ui-types';

	const FIT_ROWS: readonly { id: keyof RatingCounts; label: string; mark: string }[] = [
		{ id: 'does-not-fit', label: 'Does not fit', mark: '−' },
		{ id: 'partly-fits', label: 'Partly fits', mark: '≈' },
		{ id: 'fits', label: 'Fits', mark: '●' },
		{ id: 'too-vague', label: 'Too vague to test', mark: '?' },
		{ id: 'unrated', label: 'Unrated', mark: '·' }
	];

	const BREADTH_OPTIONS: readonly { id: BreadthEstimate; label: string }[] = [
		{ id: 'almost-nobody', label: 'Almost nobody' },
		{ id: 'few', label: 'A few people' },
		{ id: 'many', label: 'Many people' },
		{ id: 'almost-everybody', label: 'Almost everybody' }
	];

	let {
		counts,
		wholeReadingFit,
		breadth,
		distinctiveness,
		onbreadthchange,
		ondistinctivenesschange
	}: {
		counts: RatingCounts;
		wholeReadingFit?: number;
		breadth?: BreadthEstimate;
		distinctiveness?: number;
		onbreadthchange: (value: BreadthEstimate) => void;
		ondistinctivenesschange: (value: number) => void;
	} = $props();

	let maximum = $derived(Math.max(1, ...Object.values(counts)));
</script>

<section class="fit-panel" aria-labelledby="fit-panel-heading">
	<header>
		<p class="panel-letter">Panel A</p>
		<h3 id="fit-panel-heading">Your fit judgments</h3>
		<p>Raw categories from this session, not a personality-accuracy score.</p>
	</header>

	<div class="count-bars" aria-hidden="true">
		{#each FIT_ROWS as row (row.id)}
			<div>
				<span class="mark">{row.mark}</span>
				<span class="label">{row.label}</span>
				<i style={`--count-width: ${(counts[row.id] / maximum) * 100}%`}></i>
				<strong>{counts[row.id]}</strong>
			</div>
		{/each}
	</div>

	<table>
		<caption>Exact fit-judgment counts</caption>
		<thead><tr><th scope="col">Judgment</th><th scope="col">Statements</th></tr></thead>
		<tbody>
			{#each FIT_ROWS as row (row.id)}
				<tr><th scope="row">{row.label}</th><td>{counts[row.id]}</td></tr>
			{/each}
		</tbody>
	</table>

	{#if wholeReadingFit !== undefined}
		<p class="whole-fit">
			Your earlier whole-reading fit judgment: <strong>{wholeReadingFit} of 5</strong>. The raw
			scale is preserved.
		</p>
	{/if}

	<fieldset class="breadth">
		<legend>How many other people could this reading fit?</legend>
		<p>Your estimated breadth — not measured population coverage.</p>
		<div>
			{#each BREADTH_OPTIONS as option (option.id)}
				<label>
					<input
						type="radio"
						name="barnum-breadth"
						value={option.id}
						checked={breadth === option.id}
						onchange={() => onbreadthchange(option.id)}
					/>
					<span>{option.label}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<fieldset class="distinctiveness">
		<legend>How much does this reading distinguish you from other people?</legend>
		<div>
			<label for="barnum-distinctiveness">Distinctiveness, 0–5</label>
			<input
				id="barnum-distinctiveness"
				type="range"
				min="0"
				max="5"
				step="1"
				value={distinctiveness ?? 0}
				oninput={(event) => ondistinctivenesschange(Number(event.currentTarget.value))}
			/>
			<input
				type="number"
				min="0"
				max="5"
				step="1"
				aria-label="Distinctiveness numeric value"
				value={distinctiveness ?? 0}
				onchange={(event) =>
					ondistinctivenesschange(Math.max(0, Math.min(5, Number(event.currentTarget.value) || 0)))}
			/>
			<output for="barnum-distinctiveness">{distinctiveness ?? 'Not rated'} / 5</output>
		</div>
	</fieldset>
</section>

<style>
	.fit-panel {
		display: grid;
		gap: 0.8rem;
		min-width: 0;
		border: 1px solid var(--barnum-rule);
		border-top: 4px solid var(--barnum-blue);
		border-radius: 0.55rem;
		background: var(--barnum-raised);
		padding: 0.8rem;
	}

	header p,
	header h3,
	.whole-fit,
	fieldset p {
		margin: 0;
	}

	.panel-letter {
		color: var(--barnum-blue-text);
		font: 780 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h3 {
		margin-top: 0.12rem;
		font: 800 1rem/1.2 var(--barnum-sans);
	}

	header > p:last-child,
	.whole-fit,
	fieldset p {
		margin-top: 0.2rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.count-bars {
		display: grid;
		gap: 0.35rem;
	}

	.count-bars > div {
		display: grid;
		grid-template-columns: 1.25rem minmax(7rem, 0.7fr) minmax(4rem, 1fr) 1.5rem;
		align-items: center;
		gap: 0.42rem;
		font: 0.72rem/1.25 var(--barnum-sans);
	}

	.count-bars .mark {
		font: 760 0.72rem/1 var(--barnum-mono);
		text-align: center;
	}

	.count-bars i {
		display: block;
		height: 0.52rem;
		border: 1px solid var(--barnum-control);
		background: linear-gradient(
			to right,
			var(--barnum-blue) var(--count-width),
			var(--barnum-paper) var(--count-width)
		);
	}

	.count-bars strong {
		font-family: var(--barnum-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	table {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	fieldset {
		min-width: 0;
		margin: 0;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.4rem;
		padding: 0.68rem;
	}

	legend {
		padding-inline: 0.2rem;
		font: 760 0.75rem/1.4 var(--barnum-sans);
	}

	.breadth > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
		margin-top: 0.55rem;
	}

	.breadth label {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		padding: 0.45rem;
		font: 700 0.72rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	.breadth label:has(input:checked) {
		border-color: var(--barnum-blue);
		box-shadow: inset 0 0 0 1px var(--barnum-blue);
	}

	.distinctiveness > div {
		display: grid;
		grid-template-columns: minmax(8rem, auto) minmax(5rem, 1fr) 4rem auto;
		align-items: center;
		gap: 0.55rem;
	}

	.distinctiveness label,
	.distinctiveness output {
		font: 700 0.72rem/1.35 var(--barnum-sans);
	}

	.distinctiveness input[type='number'] {
		width: 4rem;
		min-height: 2.75rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.4rem;
		color: var(--barnum-ink);
		font: 700 0.75rem var(--barnum-mono);
	}

	input:focus-visible,
	label:has(input:focus-visible) {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	@media (max-width: 31rem) {
		.count-bars > div {
			grid-template-columns: 1.25rem minmax(0, 1fr) 1.5rem;
		}

		.count-bars .label {
			grid-column: 2;
		}

		.count-bars i {
			grid-row: 2;
			grid-column: 2 / 4;
		}

		.distinctiveness > div {
			grid-template-columns: minmax(0, 1fr) 4rem;
		}

		.distinctiveness label,
		.distinctiveness input[type='range'] {
			grid-column: 1 / -1;
		}
	}

	@media (forced-colors: active) {
		.fit-panel,
		fieldset,
		.count-bars i,
		.breadth label,
		.distinctiveness input[type='number'] {
			border-color: CanvasText;
		}
	}
</style>
