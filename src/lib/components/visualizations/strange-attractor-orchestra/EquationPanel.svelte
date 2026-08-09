<script lang="ts">
	type Props = {
		name: string;
		equationLatex: string;
		family: string;
		stepSize?: number;
		parameters?: Readonly<Record<string, number>>;
		initialState?: readonly number[];
		burnInSteps?: number;
		sampleStride?: number;
		warnings?: readonly string[];
		sourceTitle?: string;
		sourceUrl?: string;
	};

	let {
		name,
		equationLatex,
		family,
		stepSize,
		parameters = {},
		initialState = [],
		burnInSteps = 0,
		sampleStride = 1,
		warnings = [],
		sourceTitle = '',
		sourceUrl = ''
	}: Props = $props();
	let parameterEntries = $derived(Object.entries(parameters));
</script>

<section class="equation" aria-labelledby="sa-equation-title">
	<p class="eyebrow">Canonical orbit · equation</p>
	<h3 id="sa-equation-title">{name}</h3>
	<pre aria-label={`${name} equation`}>{equationLatex}</pre>
	<dl>
		<div>
			<dt>Family</dt>
			<dd>{family}</dd>
		</div>
		{#if stepSize !== undefined}<div>
				<dt>Stable step</dt>
				<dd>{stepSize}</dd>
			</div>{/if}
		<div>
			<dt>Burn-in</dt>
			<dd>{burnInSteps.toLocaleString('en-GB')} steps</dd>
		</div>
		<div>
			<dt>Observation stride</dt>
			<dd>{sampleStride}</dd>
		</div>
		{#if initialState.length}<div>
				<dt>Initial state</dt>
				<dd>{initialState.join(', ')}</dd>
			</div>{/if}
		{#each parameterEntries as [key, value] (key)}
			<div>
				<dt>{key}</dt>
				<dd>{value}</dd>
			</div>
		{/each}
	</dl>
	{#each warnings as warning (warning)}
		<p class="warning">{warning}</p>
	{/each}
	{#if sourceUrl}
		<a href={sourceUrl} rel="external"
			>{sourceTitle || 'Authoritative source'} <span aria-hidden="true">↗</span></a
		>
	{/if}
</section>

<style>
	.equation {
		border-left: 2px solid #97705a;
		padding: 0.25rem 0 0.25rem 1rem;
	}

	.eyebrow {
		margin: 0 0 0.3rem;
		color: #957f70;
		font: 700 0.62rem/1.3 var(--font-mono, monospace);
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		color: #eee9dc;
		font: 700 1.1rem/1.25 var(--font-serif, serif);
	}

	pre {
		overflow-x: auto;
		margin: 0.65rem 0;
		border: 1px solid rgb(225 219 201 / 14%);
		border-radius: 0.35rem;
		background: #070b0d;
		padding: 0.75rem;
		color: #c8d8d5;
		font: 0.7rem/1.55 var(--font-mono, monospace);
		white-space: pre-wrap;
	}

	dl,
	dl div {
		display: flex;
	}

	dl {
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		margin: 0;
	}

	dl div {
		gap: 0.35rem;
		font: 0.64rem/1.4 var(--font-mono, monospace);
	}

	dt {
		color: #77817f;
	}

	dd {
		margin: 0;
		color: #c8c5b9;
	}

	.warning {
		margin: 0.6rem 0 0;
		color: #d6ae81;
		font: 0.69rem/1.45 var(--font-sans, sans-serif);
	}

	a {
		display: inline-block;
		min-height: 2.75rem;
		margin-top: 0.5rem;
		padding-block: 0.7rem;
		color: #84cdd0;
		font: 650 0.7rem/1.3 var(--font-sans, sans-serif);
	}
</style>
