<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { AnalyticsReport } from '$lib/analytics/types';
	import RankingPanel from './RankingPanel.svelte';

	let {
		report,
		period = '30d',
		pending = false
	}: { report: AnalyticsReport; period?: string; pending?: boolean } = $props();
	const count = (value: number) => new Intl.NumberFormat('en-GB').format(value);
	const date = (value: string) =>
		new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
			new Date(`${value}T12:00:00Z`)
		);
	let exportHref = $derived.by(() => {
		const query = new SvelteURLSearchParams({ period: 'custom', from: report.from, to: report.to });
		return `/notes/studio/analytics/export?${query}`;
	});
	let maxViews = $derived(Math.max(2, ...report.series.map((entry) => entry.views)));
	let points = $derived(
		report.series.map((entry, index) => ({
			...entry,
			x: report.series.length > 1 ? 12 + (index / (report.series.length - 1)) * 876 : 450,
			y: 210 - (entry.views / maxViews) * 185
		}))
	);
	let line = $derived(
		points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ')
	);
	let area = $derived(
		points.length
			? `M${points[0].x},210 ${line.slice(1)} L${points[points.length - 1].x},210 Z`
			: ''
	);
	let peak = $derived(
		report.series.reduce((best, entry) => (entry.views > best.views ? entry : best), {
			date: report.from,
			views: 0
		})
	);
	let average = $derived(report.series.length ? report.totalViews / report.series.length : 0);
	let generated = $derived(
		new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: report.timezone,
			timeZoneName: 'short'
		}).format(new Date(report.generatedAt))
	);
	let available = $derived(report.configured && !report.error);
</script>

<div class="observatory" data-analytics-dashboard>
	<div class="sheet">
		<nav class="masthead" aria-label="Owner workspace">
			<a href={resolve('/notes/studio')}><span aria-hidden="true">←</span> Notes studio</a>
			<span class="private-label"
				><span class="status-dot" aria-hidden="true"></span> Private / owner access</span
			>
			<a href={resolve('/')}>SuvroGhosh.IN <span aria-hidden="true">↗</span></a>
		</nav>

		<header class="report-header">
			<div class="title-block">
				<p class="eyebrow">
					The Fieldbook Observatory <span aria-hidden="true">/</span> Audience ledger
				</p>
				<h1>A little perspective<br />on who stops by<span class="full-stop">.</span></h1>
				<p class="intro">A quiet record of the places, pages and paths that bring readers here.</p>
			</div>
			<div class="observatory-seal" aria-hidden="true">
				<svg viewBox="0 0 128 128" fill="none"
					><circle cx="64" cy="64" r="58" stroke="currentColor" stroke-width=".8" /><circle
						cx="64"
						cy="64"
						r="44"
						stroke="currentColor"
						stroke-width=".6"
						stroke-dasharray="1 5"
					/><path
						d="M64 12v15m0 74v15M12 64h15m74 0h15M28 28l10 10m52 52 10 10M28 100l10-10m52-52 10-10"
						stroke="currentColor"
					/><path
						d="m64 30 8 26 26 8-26 8-8 26-8-26-26-8 26-8Z"
						stroke="currentColor"
						stroke-width="1.3"
					/><path d="m64 30 8 26-8 8Z" fill="currentColor" /><circle
						cx="64"
						cy="64"
						r="5"
						fill="currentColor"
					/></svg
				>
				<span>Observe with care</span>
			</div>
		</header>

		<form class="range-form" method="GET" aria-label="Report date range" aria-busy={pending}>
			<label class="period-label"
				><span>Reading window</span><select name="period" value={period}
					><option value="today">Today</option><option value="7d">Last 7 days</option><option
						value="30d">Last 30 days</option
					><option value="90d">Last 90 days</option><option value="custom">Custom range</option
					></select
				></label
			>
			<fieldset>
				<legend>Custom dates · up to 180 days</legend><label
					><span class="sr-only">From date</span><input
						aria-label="From date"
						name="from"
						type="date"
						value={report.from}
					/></label
				><span aria-hidden="true">—</span><label
					><span class="sr-only">To date</span><input
						aria-label="To date"
						name="to"
						type="date"
						value={report.to}
					/></label
				>
			</fieldset>
			<button type="submit"
				>{pending ? 'Opening the ledger…' : 'Read this window'}
				<span aria-hidden="true">↗</span></button
			>
			{#if available}<a
					class="export-link"
					href={resolve(exportHref as '/notes/studio/analytics/export')}
					download
					data-sveltekit-reload>Export CSV <span aria-hidden="true">↓</span></a
				>{/if}
		</form>
		<p class="sr-only" role="status">{pending ? 'Loading the requested analytics window.' : ''}</p>

		<div class="window-caption">
			<span
				>{date(report.from)} — {date(report.to)}
				<span class="year">{report.to.slice(0, 4)}</span></span
			><span>Reporting in {report.timezone}</span>
		</div>

		{#if !available}
			<section class="report-state" role="status">
				<span class="state-mark" aria-hidden="true">⌁</span>
				<p class="eyebrow">
					{report.configured ? 'The ledger is resting' : 'Ready for its first connection'}
				</p>
				<h2>
					{report.configured
						? 'This report is unavailable for a moment.'
						: 'Connect the analytics ledger.'}
				</h2>
				<p>
					{report.configured
						? 'The reporting service could not complete this request. Your readers can still use the site. Try this window again shortly.'
						: 'The private analytics backend has not been configured. Apply the analytics migration and server configuration in the setup guide before collecting or reading views.'}
				</p>
				<button type="button" onclick={() => window.location.reload()}>Try again</button>
			</section>
		{:else}
			<section class="summary-grid" aria-label="Audience summary">
				<div class="metric principal">
					<span class="metric-label">Recorded page views</span><strong
						>{count(report.totalViews)}</strong
					><span>Consented views of public pages</span>
				</div>
				<div class="metric">
					<span class="metric-label">Distinct pages</span><strong
						>{count(report.distinctPages)}</strong
					><span>With at least one recorded view</span>
				</div>
				<div class="metric">
					<span class="metric-label">Countries</span><strong>{count(report.countryCount)}</strong
					><span>Known locations represented</span>
				</div>
				<div class="metric">
					<span class="metric-label">Cities, approximately</span><strong
						>{count(report.cityCount)}</strong
					><span>Known city / region / country pairs</span>
				</div>
			</section>

			{#if report.totalViews === 0}
				<section class="empty-ledger" role="status">
					<span aria-hidden="true">01 —</span>
					<div>
						<h2>A blank page is a beginning.</h2>
						<p>
							No consented page views were recorded in this window. Counts begin when eligible
							readers enable audience measurement; earlier visits are not reconstructed.
						</p>
					</div>
				</section>
			{/if}

			<section class="trend-panel" aria-labelledby="trend-heading">
				<header class="panel-heading">
					<div>
						<p class="eyebrow">01 / The passing days</p>
						<h2 id="trend-heading">The rhythm of the fieldbook</h2>
					</div>
					<div class="trend-note">
						<span class="legend-mark" aria-hidden="true"></span> Recorded page views
					</div>
				</header>
				<div class="chart-stats">
					<span
						><strong>{average.toLocaleString('en-GB', { maximumFractionDigits: 1 })}</strong> daily average</span
					><span
						><strong>{count(peak.views)}</strong> peak{#if peak.views > 0}
							· {date(peak.date)}{/if}</span
					>
				</div>
				<div class="chart-shell">
					<div class="y-axis" aria-hidden="true">
						<span>{count(maxViews)}</span><span>{count(Math.round(maxViews / 2))}</span><span
							>0</span
						>
					</div>
					<div class="plot">
						<svg
							class="chart"
							viewBox="0 0 900 230"
							preserveAspectRatio="none"
							role="img"
							aria-labelledby="chart-title chart-description"
							><title id="chart-title">Daily recorded page views</title><desc id="chart-description"
								>{count(report.totalViews)} recorded views from {date(report.from)} to {date(
									report.to
								)}. Peak {count(peak.views)}. The complete daily figures are available in the table
								below.</desc
							>
							{#each [25, 117.5, 210] as y (y)}<path class="grid-line" d={`M0 ${y} H900`} />{/each}
							{#if points.length}<path class="chart-area" d={area} /><path
									class="chart-line"
									d={line}
								/>{/if}
							{#each points as point (point.date)}<g class="chart-point"
									><title>{date(point.date)}: {count(point.views)} views</title><circle
										class="point-hit"
										cx={point.x}
										cy={point.y}
										r="12"
									/><circle
										class="point-dot"
										cx={point.x}
										cy={point.y}
										r={points.length <= 31 ? 3 : 1.5}
									/></g
								>{/each}
						</svg>
						<div class="x-axis" aria-hidden="true">
							<span>{date(report.from)}</span>{#if report.series.length > 2}<span
									>{date(report.series[Math.floor(report.series.length / 2)].date)}</span
								>{/if}<span>{date(report.to)}</span>
						</div>
					</div>
				</div>
				<details class="daily-data">
					<summary>Read the daily figures <span aria-hidden="true">+</span></summary>
					<div class="daily-table">
						<table>
							<caption>Daily page views · {report.timezone}</caption><thead
								><tr><th scope="col">Date</th><th scope="col">Recorded views</th></tr></thead
							><tbody
								>{#each report.series as entry (entry.date)}<tr
										><th scope="row">{entry.date}</th><td>{count(entry.views)}</td></tr
									>{/each}</tbody
							>
						</table>
					</div>
				</details>
			</section>

			<div class="ranking-grid">
				<RankingPanel
					title="Pages that drew a reader"
					index="02"
					annotation="Public pathnames only. Query strings and fragments are discarded."
					items={report.pages}
					total={report.totalViews}
					wide
				/>
				<RankingPanel
					title="Around the world"
					index="03"
					annotation="Approximate countries, derived from provider geolocation."
					items={report.countries}
					total={report.totalViews}
				/>
				<RankingPanel
					title="A sense of place"
					index="04"
					annotation="Approximate cities with region and country context. Unresolved locations still contribute to views."
					items={report.cities}
					total={report.totalViews}
				/>
				<RankingPanel
					title="Paths to the fieldbook"
					index="05"
					annotation="Recognised referring services. Other external groups unrecognised sources; direct includes missing referrers."
					items={report.referrers}
					total={report.totalViews}
				/>
				<RankingPanel
					title="Screens & browsers"
					index="06"
					annotation="Broad categories, with no stored raw user-agent strings."
					items={report.devices}
					total={report.totalViews}
				/>
				<RankingPanel
					title="Browser families"
					index="07"
					annotation="Coarse families are counted separately from device categories."
					items={report.browsers}
					total={report.totalViews}
				/>
			</div>
		{/if}

		<footer class="ledger-footer">
			<div class="privacy-note">
				<span aria-hidden="true">↳</span>
				<div>
					<h2>Perspective, with a little restraint.</h2>
					<p>
						These are consented recorded views, not unique people. VPNs and mobile networks can
						place a reader in another city. Blockers and failed requests can reduce counts.
						Unresolved and overflow locations contribute to views, but not location totals.
						Breakdowns show ten rows; CSV includes up to 200 returned entries per dimension.
						High-cardinality dimensions group overflow as Other.
					</p>
				</div>
			</div>
			<div class="ledger-meta">
				<span>Refreshed {generated}</span><span
					>Aggregate retention: {count(report.retentionDays)} days</span
				><span>First-party ledger · separate from Vercel reports</span>
			</div>
		</footer>
	</div>
</div>

<style>
	.observatory {
		--observatory-rust: #9c4f35;
		min-height: 100dvh;
		background: var(--paper);
		color: var(--ink);
		padding: 0 clamp(1rem, 4.5vw, 5rem) 2rem;
	}
	:global([data-theme='night']) .observatory {
		--observatory-rust: #e9a78b;
	}
	:global([data-theme='high-contrast']) .observatory {
		--observatory-rust: var(--ink);
	}
	.sheet {
		max-width: 92rem;
		margin-inline: auto;
	}
	.masthead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--ink);
		min-height: 5rem;
		font: 0.68rem/1.5 var(--font-mono);
	}
	a {
		color: inherit;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.25em;
	}
	.masthead a {
		min-height: 2.75rem;
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
	}
	.private-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ink-muted);
	}
	.status-dot {
		width: 0.4rem;
		height: 0.4rem;
		background: var(--accent);
		border-radius: 50%;
	}
	.report-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 2rem;
		padding: clamp(2.5rem, 6vw, 5rem) 0 clamp(2rem, 4vw, 3.5rem);
	}
	.eyebrow {
		margin: 0 0 1.25rem;
		font: 600 0.64rem/1.6 var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--ink-muted);
	}
	.eyebrow > span {
		padding-inline: 0.6rem;
		color: var(--observatory-rust);
	}
	h1 {
		margin: 0;
		font: 540 clamp(2.8rem, 5.5vw, 5.5rem)/1.02 var(--font-serif);
		letter-spacing: -0.05em;
	}
	.full-stop {
		color: var(--observatory-rust);
	}
	.intro {
		margin: 1.3rem 0 0;
		color: var(--ink-muted);
		font-size: 0.9rem;
		line-height: 1.7;
		max-width: 32rem;
	}
	.observatory-seal {
		flex: 0 0 10.5rem;
		color: var(--observatory-rust);
		text-align: center;
		transform: rotate(-8deg);
	}
	.observatory-seal svg {
		width: 8.5rem;
		margin: 0 auto 0.5rem;
	}
	.observatory-seal span {
		display: block;
		font: 0.56rem/1.5 var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}
	.range-form {
		display: flex;
		align-items: end;
		gap: 1rem;
		border-block: 1px solid var(--rule);
		padding: 1rem 0;
	}
	.range-form label {
		display: grid;
		gap: 0.35rem;
	}
	.period-label > span,
	legend {
		padding: 0;
		color: var(--ink-muted);
		font: 0.62rem/1.5 var(--font-mono);
	}
	.range-form fieldset {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		border: 0;
		padding: 0;
	}
	legend {
		margin-bottom: 0.35rem;
	}
	input,
	select,
	button {
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.2rem;
		padding: 0.55rem 0.7rem;
		font: 0.75rem/1.5 var(--font-sans);
	}
	input,
	select {
		min-width: 0;
		background: var(--paper-raised);
		color: var(--ink);
	}
	input {
		width: 9rem;
	}
	select {
		width: 10rem;
	}
	button {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--paper);
		font-weight: 600;
		cursor: pointer;
	}
	button span {
		margin-left: 0.6rem;
	}
	button:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-foreground);
	}
	.export-link {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.6rem;
		margin-left: auto;
		font-size: 0.73rem;
		white-space: nowrap;
	}
	:where(a, button, input, select, summary):focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 4px;
	}
	.window-caption {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin: 1rem 0 0;
		color: var(--ink-muted);
		font: 0.63rem/1.6 var(--font-mono);
	}
	.year {
		color: var(--ink-faint);
	}
	.summary-grid {
		display: grid;
		grid-template-columns: 1.35fr 1fr 1fr 1.15fr;
		margin-top: 2.5rem;
		padding-bottom: 2.5rem;
		border-bottom: 1px solid var(--rule);
	}
	.metric {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding-inline: 1.6rem;
		border-left: 1px solid var(--rule);
	}
	.metric:first-child {
		padding-left: 0;
		border-left: 0;
	}
	.metric-label {
		color: var(--ink-muted);
		font: 0.63rem/1.6 var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.metric strong {
		margin: 0.55rem 0 0.6rem;
		font: 520 clamp(2.8rem, 4.7vw, 5rem)/1 var(--font-serif);
		letter-spacing: -0.055em;
		font-variant-numeric: lining-nums tabular-nums;
	}
	.principal strong {
		color: var(--accent);
	}
	.metric > span:last-child {
		color: var(--ink-faint);
		font-size: 0.68rem;
		line-height: 1.6;
	}
	.empty-ledger {
		display: flex;
		gap: 2rem;
		padding: 2rem;
		margin-top: 2rem;
		border: 1px solid var(--rule);
		background: var(--paper-raised);
	}
	.empty-ledger > span {
		flex-shrink: 0;
		color: var(--observatory-rust);
		font: 0.75rem/1.8 var(--font-mono);
	}
	.empty-ledger h2 {
		margin: 0 0 0.6rem;
		font: 500 1.8rem/1.2 var(--font-serif);
		letter-spacing: -0.025em;
	}
	.empty-ledger p {
		max-width: 48rem;
		margin: 0;
		color: var(--ink-muted);
		font-size: 0.85rem;
		line-height: 1.7;
	}
	.trend-panel {
		margin: 2.5rem 0 3.5rem;
	}
	.panel-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}
	.panel-heading .eyebrow {
		margin-bottom: 0.5rem;
		color: var(--observatory-rust);
	}
	.panel-heading h2 {
		margin: 0;
		font: 500 clamp(1.75rem, 2.5vw, 2.5rem)/1.15 var(--font-serif);
		letter-spacing: -0.035em;
	}
	.trend-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ink-muted);
		font-size: 0.7rem;
	}
	.legend-mark {
		width: 1.3rem;
		border-top: 2px solid var(--accent);
	}
	.chart-stats {
		display: flex;
		gap: 1.5rem;
		margin: 1.3rem 0 0.5rem;
		color: var(--ink-faint);
		font: 0.66rem/1.5 var(--font-mono);
	}
	.chart-stats strong {
		color: var(--ink);
		font-weight: 600;
	}
	.chart-shell {
		display: flex;
		gap: 1rem;
	}
	.y-axis {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		flex: 0 0 2.1rem;
		padding: 1.3rem 0 2.4rem;
		color: var(--ink-faint);
		text-align: right;
		font: 0.6rem/1 var(--font-mono);
	}
	.plot {
		min-width: 0;
		flex: 1;
	}
	.chart {
		display: block;
		width: 100%;
		height: clamp(13rem, 24vw, 19rem);
		overflow: visible;
	}
	.grid-line {
		stroke: var(--rule);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 2 4;
	}
	.chart-area {
		fill: color-mix(in srgb, var(--accent) 7%, transparent);
	}
	.chart-line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.point-hit {
		fill: transparent;
	}
	.point-dot {
		fill: var(--paper);
		stroke: var(--accent);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.chart-point:hover .point-dot {
		fill: var(--observatory-rust);
		stroke: var(--observatory-rust);
		r: 5px;
	}
	.x-axis {
		display: flex;
		justify-content: space-between;
		color: var(--ink-faint);
		font: 0.6rem/1.5 var(--font-mono);
	}
	.daily-data {
		margin-top: 1.5rem;
		border-block: 1px solid var(--rule);
	}
	.daily-data summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 2.75rem;
		padding: 0.5rem 0;
		color: var(--ink-muted);
		font-size: 0.72rem;
		cursor: pointer;
		list-style: none;
	}
	.daily-data summary::-webkit-details-marker {
		display: none;
	}
	.daily-data[open] summary > span {
		transform: rotate(45deg);
	}
	.daily-table {
		max-height: 20rem;
		overflow: auto;
		padding-bottom: 1rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font: 0.75rem/1.5 var(--font-mono);
		text-align: left;
	}
	caption {
		padding: 0.5rem 0 1rem;
		color: var(--ink-muted);
		text-align: left;
	}
	th,
	td {
		padding: 0.6rem 0.5rem;
		border-bottom: 1px solid var(--rule);
	}
	th {
		font-weight: 600;
	}
	td,
	th:last-child {
		text-align: right;
	}
	.ranking-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2.8rem 2rem;
	}
	.ledger-footer {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: 2rem;
		margin-top: 3rem;
		border-top: 1px solid var(--ink);
		padding-top: 1.5rem;
	}
	.privacy-note {
		display: flex;
		gap: 1rem;
	}
	.privacy-note > span {
		color: var(--observatory-rust);
		font-size: 1.7rem;
		line-height: 1;
	}
	.privacy-note h2 {
		margin: 0 0 0.55rem;
		font: 500 1.1rem/1.3 var(--font-serif);
	}
	.privacy-note p {
		margin: 0;
		color: var(--ink-muted);
		font-size: 0.72rem;
		line-height: 1.7;
		max-width: 43rem;
	}
	.ledger-meta {
		display: flex;
		flex-direction: column;
		align-items: end;
		gap: 0.45rem;
		color: var(--ink-faint);
		text-align: right;
		font: 0.6rem/1.6 var(--font-mono);
	}
	.report-state {
		padding: 4rem 1rem;
		text-align: center;
	}
	.state-mark {
		display: block;
		margin-bottom: 1rem;
		color: var(--observatory-rust);
		font: 4rem/1 var(--font-serif);
	}
	.report-state .eyebrow {
		margin-bottom: 0.8rem;
	}
	.report-state h2 {
		margin: 0 0 1rem;
		font: 500 clamp(1.8rem, 4vw, 3rem)/1.1 var(--font-serif);
		letter-spacing: -0.035em;
	}
	.report-state > p:not(.eyebrow) {
		max-width: 35rem;
		margin: 0 auto 1.4rem;
		color: var(--ink-muted);
		font-size: 0.85rem;
		line-height: 1.7;
	}
	@media (min-width: 100rem) {
		.report-header {
			padding-block: 4.5rem;
		}
	}
	@media (max-width: 64rem) {
		.range-form {
			flex-wrap: wrap;
		}
		.export-link {
			margin-left: 0;
		}
		.ranking-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.summary-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.metric {
			padding-inline: 1rem;
		}
		.observatory-seal {
			flex-basis: 8rem;
		}
		.observatory-seal svg {
			width: 7rem;
		}
	}
	@media (max-width: 42rem) {
		.masthead {
			flex-wrap: wrap;
			min-height: 5.5rem;
			gap: 0 0.5rem;
			font-size: 0.6rem;
		}
		.private-label {
			order: 3;
			width: 100%;
			padding-bottom: 0.75rem;
		}
		.masthead a:last-child {
			margin-left: auto;
		}
		.report-header {
			padding-block: 2.3rem;
			gap: 0.5rem;
		}
		.observatory-seal {
			display: none;
		}
		.eyebrow {
			font-size: 0.56rem;
			letter-spacing: 0.06em;
		}
		h1 {
			font-size: clamp(2.6rem, 10vw, 4rem);
		}
		.intro {
			font-size: 0.8rem;
		}
		.range-form {
			gap: 0.8rem;
		}
		.period-label {
			width: 100%;
		}
		select {
			width: 100%;
		}
		.range-form fieldset {
			width: 100%;
		}
		.range-form fieldset label {
			flex: 1;
		}
		input {
			width: 100%;
			font-size: 0.72rem;
		}
		.range-form button {
			flex: 1;
		}
		.export-link {
			margin-left: auto;
		}
		.window-caption {
			font-size: 0.55rem;
			flex-direction: column;
			gap: 0.2rem;
		}
		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 1.5rem 0;
			margin-top: 1.8rem;
			padding-bottom: 1.8rem;
		}
		.metric {
			padding-inline: 1rem;
		}
		.metric:nth-child(odd) {
			padding-left: 0;
			border-left: 0;
		}
		.metric-label {
			font-size: 0.54rem;
		}
		.metric strong {
			font-size: 3.5rem;
		}
		.metric > span:last-child {
			font-size: 0.63rem;
		}
		.panel-heading {
			align-items: start;
			flex-direction: column;
		}
		.trend-note {
			font-size: 0.65rem;
		}
		.trend-panel {
			margin: 2rem 0 2.5rem;
		}
		.panel-heading h2 {
			font-size: 1.8rem;
		}
		.chart-stats {
			gap: 1rem;
			font-size: 0.6rem;
		}
		.chart-shell {
			gap: 0.5rem;
		}
		.y-axis {
			flex-basis: 1.7rem;
			font-size: 0.55rem;
		}
		.ranking-grid {
			grid-template-columns: minmax(0, 1fr);
			gap: 2rem;
		}
		.ledger-footer {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.3rem;
		}
		.ledger-meta {
			align-items: start;
			text-align: left;
			padding-left: 2rem;
		}
		.empty-ledger {
			padding: 1.3rem;
			gap: 1rem;
		}
		.empty-ledger h2 {
			font-size: 1.5rem;
		}
		.empty-ledger p {
			font-size: 0.76rem;
		}
	}
	@media (forced-colors: active) {
		.chart-area {
			fill: none;
		}
		.chart-line,
		.point-dot {
			stroke: CanvasText;
		}
		.grid-line {
			stroke: GrayText;
		}
	}
</style>
