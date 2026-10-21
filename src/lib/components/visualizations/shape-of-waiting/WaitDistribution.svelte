<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { Snapshot } from '$lib/visualizations/shape-of-waiting/types';
	import {
		ageColour,
		distributionDomain,
		waitBins,
		histogramCeiling,
		ticketLabel
	} from '$lib/visualizations/shape-of-waiting/drawing';

	let {
		snapshot,
		selected = null,
		onselect,
		max = 120,
		yMax,
		compact = false,
		label = 'The distribution'
	}: {
		snapshot: Snapshot;
		selected?: number | null;
		onselect: (id: number) => void;
		max?: number;
		yMax?: number;
		compact?: boolean;
		label?: string;
	} = $props();

	const served = $derived(
		snapshot.people.filter((person) => person.start !== null && person.start <= snapshot.time)
	);
	const domain = $derived(distributionDomain(snapshot, max));
	const bins = $derived(waitBins(snapshot, domain));
	const ceiling = $derived(Math.max(yMax ?? 0, histogramCeiling(snapshot, domain)));
	const selectedPerson = $derived(snapshot.people.find((person) => person.id === selected));
	const marks = $derived.by(() => {
		const limit = compact ? 100 : 180;
		const indices = new SvelteSet<number>();
		for (let i = 0; i < Math.min(limit, snapshot.waiting.length); i++)
			indices.add(
				Math.floor((i * snapshot.waiting.length) / Math.min(limit, snapshot.waiting.length))
			);
		for (const id of [selected, snapshot.oldest?.id]) {
			const index = snapshot.waiting.findIndex((person) => person.id === id);
			if (index >= 0) indices.add(index);
		}
		return [...indices].map((index) => snapshot.waiting[index]);
	});
	const format = (value: number | null) => (value === null ? '—' : value.toFixed(1));
	const x = (value: number) => 42 + (Math.min(domain, Math.max(0, value)) / domain) * 542;
	const ticks = $derived(Array.from({ length: 5 }, (_, index) => (index * domain) / 4));
	const selectedServed = $derived(
		selectedPerson && selectedPerson.start !== null && selectedPerson.start <= snapshot.time
			? selectedPerson
			: null
	);
	function selectBin(ids: number[]) {
		if (!ids.length) return;
		const current = ids.indexOf(selected ?? -1);
		onselect(ids[(current + 1) % ids.length]);
	}
	function activate(event: KeyboardEvent, action: () => void) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			action();
		}
	}
</script>

<section class:compact class="distribution" aria-label={label}>
	<div class="heading">
		<h3>{label}</h3>
		<span>{snapshot.final ? 'FINAL' : 'PROVISIONAL'} · n={served.length}</span>
	</div>
	<div class="quantiles">
		<span class="mean"><i></i>Mean <b>{format(snapshot.metrics.mean)}</b></span>
		<span class="median"><i></i>Median <b>{format(snapshot.metrics.median)}</b></span>
		<span class="p90"><i></i>90th percentile <b>{format(snapshot.metrics.p90)}</b></span>
		<small>minutes</small>
	</div>
	<svg
		viewBox="0 0 620 280"
		role="group"
		aria-label={`Histogram of ${served.length} realized waits among people whose service started, with current ages of ${snapshot.waiting.length} still waiting shown separately.`}
	>
		<title>{label}: realized waits and unresolved waiting ages</title>
		<desc
			>Bars count people who entered service. The separate dot strip shows current waiting ages,
			which are lower bounds on eventual waits. All x positions share the same minute scale.</desc
		>
		<text class="plot-label" x="42" y="24">PEOPLE WHO HAVE STARTED SERVICE</text>
		{#each [0, 0.5, 1] as fraction (fraction)}
			<line class="grid" x1="42" x2="584" y1={177 - fraction * 126} y2={177 - fraction * 126} />
			<text class="count-label" x="32" y={180 - fraction * 126} text-anchor="end"
				>{Math.round(ceiling * fraction)}</text
			>
		{/each}
		{#each bins as bin (bin.start)}
			<rect
				class="bar"
				x={x(bin.start) + 1.5}
				y={177 - (bin.ids.length / ceiling) * 126}
				width={542 / 16 - 3}
				height={(bin.ids.length / ceiling) * 126}
				fill={ageColour((bin.start + bin.end) / 2)}
				opacity={bin.ids.includes(selected ?? -1) ? 1 : 0.76}
				role="button"
				tabindex={bin.ids.length ? 0 : -1}
				aria-label={`${bin.ids.length} people waited ${format(bin.start)} to ${format(bin.end)} minutes. Select a person in this group.`}
				onclick={() => selectBin(bin.ids)}
				onkeydown={(event) => activate(event, () => selectBin(bin.ids))}
			>
				<title
					>{bin.ids.length} people · {format(bin.start)}–{format(bin.end)} min{bin.ids.length > 1
						? ' · select again to cycle tickets'
						: ''}</title
				>
			</rect>
		{/each}
		{#each [{ value: snapshot.metrics.mean, colour: '#287f79', name: 'Mean' }, { value: snapshot.metrics.median, colour: '#23352f', name: 'Median' }, { value: snapshot.metrics.p90, colour: '#b9513e', name: '90th percentile' }] as marker (marker.name)}
			{#if marker.value !== null}
				<line
					x1={x(marker.value)}
					x2={x(marker.value)}
					y1="38"
					y2="178"
					stroke={marker.colour}
					stroke-width="1.5"
					stroke-dasharray={marker.name === 'Median' ? '3 3' : 'none'}
					><title>{marker.name}: {format(marker.value)} min</title></line
				>
				<circle cx={x(marker.value)} cy="38" r="3" fill={marker.colour} />
			{/if}
		{/each}
		{#if !served.length}<text class="empty" x="313" y="116" text-anchor="middle"
				>No one has begun service yet.</text
			>{/if}
		{#if selectedServed}
			<circle
				cx={x(selectedServed.wait)}
				cy="177"
				r="5"
				fill="#f9f6ed"
				stroke="#23352f"
				stroke-width="2"
				><title
					>Selected ticket {ticketLabel(selectedServed.id)}: {format(selectedServed.wait)} min</title
				></circle
			>
		{/if}
		{#each ticks as tick (tick)}
			<line class="tick" x1={x(tick)} x2={x(tick)} y1="178" y2="183" />
			<text class="axis-label" x={x(tick)} y="198" text-anchor="middle"
				>{Number(tick.toFixed(1))}</text
			>
		{/each}
		<text class="axis-label" x="584" y="214" text-anchor="end">WAIT / MINUTES</text>
		<line class="divider" x1="42" x2="584" y1="224" y2="224" />
		<text class="plot-label" x="42" y="243">STILL WAITING · {snapshot.waiting.length}</text>
		{#each marks as person (person.id)}
			<circle
				class="waiting-mark"
				cx={x(person.wait)}
				cy={257 + (person.id % 3) * 5}
				r={person.id === selected || person.id === snapshot.oldest?.id ? 4.3 : 2.6}
				fill={ageColour(person.wait)}
				stroke={person.id === selected
					? '#23352f'
					: person.id === snapshot.oldest?.id
						? '#b9513e'
						: '#f5f0e5'}
				stroke-width={person.id === selected || person.id === snapshot.oldest?.id ? 1.5 : 0.6}
				role="button"
				tabindex={person.id === selected || person.id === snapshot.oldest?.id ? 0 : -1}
				aria-label={`Ticket ${ticketLabel(person.id)}, still waiting ${format(person.wait)} minutes`}
				onclick={() => onselect(person.id)}
				onkeydown={(event) => activate(event, () => onselect(person.id))}
				><title>Ticket {ticketLabel(person.id)} · still waiting {format(person.wait)} min</title
				></circle
			>
		{/each}
		{#if !snapshot.waiting.length}<text class="axis-label" x="584" y="265" text-anchor="end"
				>No unresolved waits</text
			>{/if}
	</svg>
	<p class="note">
		Bars: realized waits among service starters. Dots: current ages of unresolved waits. {#if snapshot.waiting.length > marks.length}Dots
			are sampled; counts are exact.{/if}
	</p>
	<p class="interaction-note">Select a bar or a waiting dot to inspect a ticket.</p>
	<details class="data-table">
		<summary>Read histogram as a table</summary>
		<table>
			<caption>Realized waits among {served.length} service starters</caption><thead
				><tr><th scope="col">Wait (min)</th><th scope="col">People</th></tr></thead
			><tbody
				>{#each bins as bin (bin.start)}<tr
						><th scope="row">{format(bin.start)}–{format(bin.end)}</th><td>{bin.ids.length}</td></tr
					>{/each}</tbody
			>
		</table>
	</details>
</section>

<style>
	.distribution {
		min-width: 0;
		color: #23352f;
		border-top: 1px solid #bdc5b4;
		padding-top: 1rem;
	}
	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
	}
	h3 {
		font:
			400 1.35rem/1.2 Georgia,
			'Times New Roman',
			serif;
		margin: 0;
	}
	.heading > span {
		font:
			500 0.56rem/1.3 ui-monospace,
			SFMono-Regular,
			monospace;
		letter-spacing: 0.06em;
		white-space: nowrap;
		color: #53624d;
	}
	.quantiles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 1rem;
		align-items: baseline;
		margin: 0.9rem 0 0.4rem;
		font:
			400 0.64rem/1.4 ui-monospace,
			SFMono-Regular,
			monospace;
	}
	.quantiles > span {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
	}
	.quantiles b {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.quantiles i {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		display: inline-block;
		align-self: center;
	}
	.mean i {
		background: #287f79;
	}
	.median i {
		background: #23352f;
	}
	.p90 i {
		background: #b9513e;
	}
	.quantiles small {
		font-size: 0.56rem;
		color: #53624d;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	svg text {
		font-family: ui-monospace, SFMono-Regular, monospace;
		fill: #52604d;
	}
	.plot-label {
		font-size: 9px;
		letter-spacing: 0.06em;
		font-weight: 600;
	}
	.axis-label,
	.count-label {
		font-size: 9px;
	}
	.grid {
		stroke: #d7dccf;
		stroke-width: 0.7;
	}
	.tick,
	.divider {
		stroke: #bdc5b4;
		stroke-width: 0.8;
	}
	.bar,
	.waiting-mark {
		cursor: pointer;
		transition: opacity 100ms;
	}
	.bar:hover {
		opacity: 1;
	}
	.bar:focus-visible,
	.waiting-mark:focus-visible {
		outline: 2px solid #23352f;
		outline-offset: 3px;
	}
	.empty {
		font:
			400 13px Georgia,
			'Times New Roman',
			serif;
		fill: #53624d;
	}
	.note,
	.interaction-note {
		font:
			400 0.63rem/1.6 ui-monospace,
			SFMono-Regular,
			monospace;
		color: #53624d;
		margin: 0.6rem 0 0;
	}
	.interaction-note {
		margin-top: 0.25rem;
		color: #536653;
	}
	.data-table {
		margin-top: 0.8rem;
		font:
			400 0.65rem/1.5 ui-monospace,
			SFMono-Regular,
			monospace;
		color: #536653;
	}
	.data-table summary {
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.data-table table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.6rem;
		font-variant-numeric: tabular-nums;
	}
	.data-table th,
	.data-table td {
		text-align: left;
		border-bottom: 1px solid #d7dccf;
		padding: 0.3rem;
	}
	.data-table caption {
		text-align: left;
		padding-bottom: 0.4rem;
	}
	.compact h3 {
		font-size: 1.2rem;
	}
	.compact .quantiles {
		gap: 0.45rem 0.75rem;
		font-size: 0.59rem;
	}
	@media (max-width: 520px) {
		h3 {
			font-size: 1.2rem;
		}
		.quantiles {
			gap: 0.4rem 0.7rem;
			font-size: 0.59rem;
		}
		.heading > span {
			font-size: 0.51rem;
		}
		.note,
		.interaction-note {
			font-size: 0.58rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bar,
		.waiting-mark {
			transition: none;
		}
	}
</style>
