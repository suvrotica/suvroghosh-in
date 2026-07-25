<script lang="ts">
	import TracePlot from './TracePlot.svelte';

	export type CapabilityBadge = {
		label: string;
		status: 'defined' | 'explicit' | 'emergent' | 'phenomenological' | 'unavailable';
	};

	export type SpecimenView = {
		id: string;
		abbreviation: string;
		name: string;
		year: string;
		modelClass: string;
		stateVariables: string;
		nativeInput: string;
		primaryLabel: string;
		primaryUnit: string;
		yMin: number;
		yMax: number;
		color: string;
		dash: readonly number[];
		keeps: string;
		throwsAway: string;
		equation: string;
		parameters: readonly string[];
		capabilities: readonly CapabilityBadge[];
	};

	type Props = {
		specimen: SpecimenView;
		values: ArrayLike<number>;
		durationMs: number;
		events?: readonly { timeMs: number }[];
		cursorMs: number;
		threshold?: number;
		selected?: boolean;
		onselect?: (id: string) => void;
		oncursor?: (timeMs: number) => void;
	};

	let {
		specimen,
		values,
		durationMs,
		events = [],
		cursorMs,
		threshold,
		selected = false,
		onselect,
		oncursor
	}: Props = $props();

	const uid = $props.id();
</script>

<article
	class="specimen"
	class:selected
	style:--model-color={specimen.color}
	aria-labelledby="{uid}-name"
>
	<header>
		<div class="identity">
			<span class="abbreviation" aria-hidden="true">{specimen.abbreviation}</span>
			<div>
				<p>{specimen.year} · {specimen.modelClass}</p>
				<h3 id="{uid}-name">{specimen.name}</h3>
			</div>
		</div>
		{#if onselect}
			<button
				type="button"
				class="compare"
				aria-pressed={selected}
				onclick={() => onselect(specimen.id)}
			>
				{selected ? 'In comparison' : 'Compare'}
			</button>
		{/if}
	</header>

	<dl class="anatomy">
		<div>
			<dt>State</dt>
			<dd>{specimen.stateVariables}</dd>
		</div>
		<div>
			<dt>Native drive</dt>
			<dd>{specimen.nativeInput}</dd>
		</div>
	</dl>

	<TracePlot
		label={specimen.primaryLabel}
		unit={specimen.primaryUnit}
		{values}
		{durationMs}
		yMin={specimen.yMin}
		yMax={specimen.yMax}
		{events}
		{cursorMs}
		color={specimen.color}
		dash={specimen.dash}
		{threshold}
		{oncursor}
	/>

	<div class="bargain">
		<p><strong>Keeps</strong>{specimen.keeps}</p>
		<p><strong>Throws away</strong>{specimen.throwsAway}</p>
	</div>

	<ul class="capabilities" aria-label="{specimen.name} capability summary">
		{#each specimen.capabilities as capability (capability.label)}
			<li data-status={capability.status}>
				<span class="marker" aria-hidden="true"></span>
				{capability.label}: {capability.status}
			</li>
		{/each}
	</ul>

	<details>
		<summary>Equation and exact defaults</summary>
		<div class="equation" role="math" aria-label={specimen.equation}>
			<code>{specimen.equation}</code>
		</div>
		<ul class="parameters">
			{#each specimen.parameters as parameter (parameter)}
				<li>{parameter}</li>
			{/each}
		</ul>
	</details>
</article>

<style>
	.specimen {
		display: grid;
		width: 100%;
		min-width: 0;
		grid-template-rows: auto auto auto 1fr auto auto;
		gap: 0.85rem;
		border-top: 3px solid var(--model-color);
		border-right: 1px solid #2c333f;
		border-bottom: 1px solid #2c333f;
		border-left: 1px solid #2c333f;
		border-radius: 0.7rem;
		background: #0d1118;
		padding: 1rem;
		scroll-snap-align: start;
	}
	.specimen.selected {
		box-shadow: 0 0 0 2px var(--model-color);
	}
	header,
	.identity,
	.anatomy {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.8rem;
	}
	.identity {
		justify-content: start;
	}
	.abbreviation {
		display: grid;
		width: 2.4rem;
		height: 2.4rem;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid color-mix(in srgb, var(--model-color), #fff 20%);
		border-radius: 50%;
		color: var(--model-color);
		font:
			800 0.72rem/1 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
	}
	header p {
		margin: 0 0 0.2rem;
		color: #909aa9;
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}
	h3 {
		margin: 0;
		color: #fff;
		font-size: 1rem;
		line-height: 1.2;
	}
	button,
	summary {
		min-height: 2.75rem;
		cursor: pointer;
	}
	button {
		border: 1px solid #343c49;
		border-radius: 0.45rem;
		background: #141922;
		padding: 0.45rem 0.65rem;
		color: #dce2ea;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 800;
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--model-color);
		outline-offset: 3px;
	}
	.anatomy {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin: 0;
		border-top: 1px solid #242b35;
		border-bottom: 1px solid #242b35;
		padding: 0.6rem 0;
	}
	dt {
		color: #7f8998;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	dd {
		margin: 0.2rem 0 0;
		color: #d4dae3;
		font-size: 0.72rem;
		line-height: 1.35;
	}
	.bargain {
		display: grid;
		gap: 0.55rem;
	}
	.bargain p {
		margin: 0;
		color: #b8c1ce;
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.bargain strong {
		display: block;
		margin-bottom: 0.1rem;
		color: var(--model-color);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.capabilities {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.capabilities li {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid #303744;
		border-radius: 999px;
		padding: 0.3rem 0.45rem;
		color: #aeb7c5;
		font-size: 0.62rem;
	}
	.marker {
		width: 0.45rem;
		height: 0.45rem;
		border: 1px solid currentColor;
		border-radius: 50%;
	}
	[data-status='defined'] .marker,
	[data-status='explicit'] .marker {
		background: var(--model-color);
	}
	[data-status='emergent'] .marker {
		border-radius: 0;
		transform: rotate(45deg);
	}
	[data-status='phenomenological'] .marker {
		border-style: dashed;
	}
	[data-status='unavailable'] {
		opacity: 0.72;
	}
	details {
		border-top: 1px solid #242b35;
	}
	summary {
		display: flex;
		align-items: center;
		color: #e2e7ee;
		font-size: 0.72rem;
		font-weight: 800;
	}
	.equation {
		overflow-x: auto;
		border: 1px solid #2b323d;
		border-radius: 0.4rem;
		background: #070a0f;
		padding: 0.65rem;
		color: #f2e8ca;
		font-size: 0.68rem;
		white-space: nowrap;
	}
	.parameters {
		margin: 0.65rem 0 0;
		padding-left: 1.1rem;
		color: #aeb7c5;
		font-size: 0.68rem;
		line-height: 1.55;
	}
	@media (max-width: 32rem) {
		.compare {
			display: none;
		}
	}
</style>
