<script lang="ts">
	export type RecoveryRow = {
		id: string;
		name: string;
		kind: 'absent' | 'explicit' | 'phenomenological' | 'emergent';
		mechanism: string;
		state: string;
		secondPulse: string;
	};

	type Props = {
		isiMs: number;
		rows: readonly RecoveryRow[];
		onisi: (isiMs: number) => void;
		onactivate: () => void;
	};

	let { isiMs, rows, onisi, onactivate }: Props = $props();
	let uid = $props.id();
</script>

<section class="inspector" aria-labelledby="{uid}-heading">
	<div class="heading">
		<div>
			<p class="eyebrow">Paired-pulse experiment</p>
			<h3 id="{uid}-heading">Refractory is not one universal stopwatch</h3>
		</div>
		<button type="button" onclick={onactivate}>Load paired pulse</button>
	</div>

	<label class="isi">
		<span>Inter-pulse interval <strong>{isiMs.toFixed(1)} ms</strong></span>
		<input
			type="range"
			min="1"
			max="100"
			step="1"
			value={isiMs}
			oninput={(event) => onisi(Number(event.currentTarget.value))}
		/>
	</label>

	<div class="rows">
		{#each rows as row (row.id)}
			<article data-kind={row.kind}>
				<header>
					<h4>{row.name}</h4>
					<span>{row.kind}</span>
				</header>
				<p>{row.mechanism}</p>
				<dl>
					<div>
						<dt>Recovery state</dt>
						<dd>{row.state}</dd>
					</div>
					<div>
						<dt>Second pulse</dt>
						<dd>{row.secondPulse}</dd>
					</div>
				</dl>
			</article>
		{/each}
	</div>

	<p class="note">
		The response to the second pulse is the comparison. The laboratory does not manufacture one
		cross-model “refractory milliseconds” score.
	</p>
</section>

<style>
	.inspector {
		display: grid;
		gap: 1rem;
		border: 1px solid #2d3440;
		border-radius: 0.75rem;
		background: #0d1118;
		padding: 1rem;
	}
	.heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}
	.eyebrow,
	.note {
		margin: 0;
		color: #909aa9;
		font-size: 0.7rem;
	}
	.eyebrow {
		margin-bottom: 0.2rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h3,
	h4 {
		margin: 0;
		color: #fff;
	}
	h3 {
		font-size: 1.05rem;
	}
	h4 {
		font-size: 0.82rem;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid #f4d58d;
		border-radius: 0.45rem;
		background: #282418;
		padding: 0.5rem 0.75rem;
		color: #fff4ce;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 800;
		cursor: pointer;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 3px solid #f4d58d;
		outline-offset: 3px;
	}
	.isi {
		display: grid;
		gap: 0.5rem;
		color: #aeb7c5;
		font-size: 0.75rem;
	}
	.isi span {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	.isi strong {
		color: #fff;
		font-variant-numeric: tabular-nums;
	}
	input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: #f4d58d;
	}
	.rows {
		display: grid;
		grid-template-columns: repeat(5, minmax(10.5rem, 1fr));
		gap: 0.6rem;
		overflow-x: auto;
		scroll-snap-type: x proximity;
	}
	article {
		min-width: 0;
		border-top: 2px solid #697386;
		border-right: 1px solid #2a313c;
		border-bottom: 1px solid #2a313c;
		border-left: 1px solid #2a313c;
		border-radius: 0.5rem;
		background: #11161e;
		padding: 0.7rem;
		scroll-snap-align: start;
	}
	article[data-kind='explicit'] {
		border-top-color: #73b7c8;
	}
	article[data-kind='phenomenological'] {
		border-top-color: #a7c080;
	}
	article[data-kind='emergent'] {
		border-top-color: #d98070;
	}
	article header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.5rem;
	}
	article header span {
		color: #8f99a7;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	article p {
		min-height: 3.6em;
		margin: 0.55rem 0;
		color: #aeb7c5;
		font-size: 0.68rem;
		line-height: 1.45;
	}
	dl {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		border-top: 1px solid #272e38;
		padding-top: 0.55rem;
	}
	dt {
		color: #788290;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	dd {
		margin: 0.1rem 0 0;
		color: #e2e7ee;
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.note {
		line-height: 1.5;
	}
	@media (max-width: 52rem) {
		.rows {
			grid-template-columns: repeat(5, minmax(15rem, 78vw));
		}
	}
	@media (max-width: 38rem) {
		.heading {
			align-items: start;
			flex-direction: column;
		}
		.heading button {
			width: 100%;
		}
	}
</style>
