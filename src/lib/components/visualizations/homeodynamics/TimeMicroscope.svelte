<script lang="ts">
	import { onMount } from 'svelte';
	import {
		EVIDENCE_KIND_LABELS,
		RHYTHM_EVIDENCE,
		evidenceFor,
		normalizePoints,
		rhythmSeriesFor,
		timeDomainFor,
		type RhythmPoint,
		type RhythmSeries,
		type RhythmWindow
	} from '$lib/visualizations/homeodynamics';

	const wideChart = { width: 780, left: 154, right: 758, rowHeight: 102, top: 24 };
	const compactChart = { width: 268, left: 56, right: 254, rowHeight: 112, top: 42 };
	const windows: readonly { id: RhythmWindow; label: string; short: string }[] = [
		{ id: '20s', label: 'About 20 seconds', short: '20 seconds' },
		{ id: '2h', label: 'About 2 hours', short: '2 hours' },
		{ id: '24h', label: 'One day', short: '24 hours' }
	];

	let selectedWindow = $state<RhythmWindow>('20s');
	let normalizedOverlay = $state(false);
	let showTemperatureConvention = $state(false);
	let compact = $state(false);

	let chart = $derived(compact ? compactChart : wideChart);
	let series = $derived(rhythmSeriesFor(selectedWindow));
	let timeDomain = $derived(timeDomainFor(selectedWindow));
	let chartHeight = $derived(
		normalizedOverlay
			? chart.top + chart.rowHeight + 28
			: chart.top + series.length * chart.rowHeight + 28
	);

	function scale(
		value: number,
		domain: readonly [number, number],
		range: readonly [number, number]
	) {
		const span = domain[1] - domain[0];
		if (!Number.isFinite(value) || !Number.isFinite(span) || span === 0) return range[0];
		return range[0] + ((value - domain[0]) / span) * (range[1] - range[0]);
	}

	function pointsFor(candidate: RhythmSeries): RhythmPoint[] {
		return normalizedOverlay ? normalizePoints(candidate.points) : candidate.points;
	}

	function pathFor(candidate: RhythmSeries, rowIndex: number) {
		const points = pointsFor(candidate);
		const domain: readonly [number, number] = normalizedOverlay
			? [0, 1]
			: (candidate.domain ?? [
					Math.min(...points.map((point) => point.value)),
					Math.max(...points.map((point) => point.value))
				]);
		const row = normalizedOverlay ? 0 : rowIndex;
		const top = chart.top + row * chart.rowHeight + 10;
		const bottom = top + 58;
		return points
			.map((point, index) => {
				const x = scale(point.t, timeDomain, [chart.left, chart.right]);
				const y = scale(point.value, domain, [bottom, top]);
				return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}

	function pointPosition(candidate: RhythmSeries, point: RhythmPoint, rowIndex: number) {
		const points = pointsFor(candidate);
		const renderedPoint = normalizedOverlay ? points[candidate.points.indexOf(point)] : point;
		const domain: readonly [number, number] = normalizedOverlay
			? [0, 1]
			: (candidate.domain ?? [
					Math.min(...candidate.points.map((item) => item.value)),
					Math.max(...candidate.points.map((item) => item.value))
				]);
		const row = normalizedOverlay ? 0 : rowIndex;
		const top = chart.top + row * chart.rowHeight + 10;
		const bottom = top + 58;
		return {
			x: scale(point.t, timeDomain, [chart.left, chart.right]),
			y: scale(renderedPoint.value, domain, [bottom, top])
		};
	}

	function yDomain(candidate: RhythmSeries): readonly [number, number] {
		if (normalizedOverlay) return [0, 1];
		return (
			candidate.domain ?? [
				Math.min(...candidate.points.map((point) => point.value)),
				Math.max(...candidate.points.map((point) => point.value))
			]
		);
	}

	function timeLabel(value: number) {
		if (selectedWindow === '20s') return `${value.toFixed(0)} s`;
		if (selectedWindow === '2h') return `${value.toFixed(0)} min`;
		return `${value.toFixed(0).padStart(2, '0')}:00`;
	}

	function valueLabel(candidate: RhythmSeries, value: number) {
		if (normalizedOverlay) return value.toFixed(2);
		if (candidate.unit === '°C') return value.toFixed(2);
		if (candidate.unit === 'nmol/L') return value.toFixed(1);
		if (candidate.unit.includes('%')) return `${value.toFixed(0)}%`;
		return value.toFixed(2);
	}

	function selectWindow(id: RhythmWindow) {
		selectedWindow = id;
		normalizedOverlay = false;
	}

	function navigateWindows(event: KeyboardEvent, index: number) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		let nextIndex = index;
		if (event.key === 'ArrowRight') nextIndex = (index + 1) % windows.length;
		if (event.key === 'ArrowLeft') nextIndex = (index - 1 + windows.length) % windows.length;
		if (event.key === 'Home') nextIndex = 0;
		if (event.key === 'End') nextIndex = windows.length - 1;
		selectWindow(windows[nextIndex].id);
		const tabList = (event.currentTarget as HTMLElement).parentElement;
		tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
	}

	function supportKindsFor(candidate: RhythmSeries) {
		const evidence = evidenceFor(candidate.sourceId);
		return evidence.supportKinds ?? [evidence.kind];
	}

	function supportSummary(candidate: RhythmSeries) {
		return supportKindsFor(candidate)
			.map((kind) => EVIDENCE_KIND_LABELS[kind])
			.join(' and ');
	}

	onMount(() => {
		const layoutQuery = window.matchMedia('(max-width: 45rem)');
		const syncLayout = () => (compact = layoutQuery.matches);
		syncLayout();
		layoutQuery.addEventListener('change', syncLayout);
		return () => layoutQuery.removeEventListener('change', syncLayout);
	});
</script>

<section
	class="explorer-section time-microscope"
	data-testid="time-microscope"
	aria-labelledby="time-microscope-title"
>
	<div class="section-heading">
		<div class="section-number" aria-hidden="true">01</div>
		<div>
			<p class="section-kicker">Time microscope · representative human rhythms</p>
			<h3 id="time-microscope-title">Open the shutter: seconds, hours, a day</h3>
			<p>
				Every row keeps its own unit and vertical scale. The shared horizontal axis is time—not an
				invitation to compare raw heights.
			</p>
		</div>
	</div>

	<div class="evidence-banner measured-banner" role="note">
		<strong>Representative rhythms, not medical reference values.</strong>
		<span
			>Ranges, measured summaries, conversions and generated teaching curves remain labelled
			separately.</span
		>
	</div>

	<div class="microscope-controls" data-tts-exclude>
		<div class="tab-list" role="tablist" aria-label="Time window">
			{#each windows as window, index (window.id)}
				<button
					type="button"
					role="tab"
					id={`time-tab-${window.id}`}
					aria-controls="time-microscope-panel"
					aria-selected={selectedWindow === window.id}
					tabindex={selectedWindow === window.id ? 0 : -1}
					class:active={selectedWindow === window.id}
					onclick={() => selectWindow(window.id)}
					onkeydown={(event) => navigateWindows(event, index)}
				>
					<span>{window.label}</span>
				</button>
			{/each}
		</div>
		<button
			type="button"
			class="overlay-toggle"
			class:active={normalizedOverlay}
			aria-pressed={normalizedOverlay}
			onclick={() => (normalizedOverlay = !normalizedOverlay)}
		>
			{normalizedOverlay ? 'Return to small multiples' : 'Show normalized orchestra'}
		</button>
	</div>

	{#if normalizedOverlay}
		<div class="normalization-warning" role="status">
			<strong>Normalized orchestra:</strong> every signal is rescaled independently from 0 to 1. A shared
			height does not mean a shared unit, magnitude or mechanism.
		</div>
	{/if}

	<div
		id="time-microscope-panel"
		role="tabpanel"
		tabindex="0"
		aria-labelledby={`time-tab-${selectedWindow}`}
		class="chart-card"
	>
		<svg
			class="rhythm-chart"
			class:compact-chart={compact}
			viewBox={`0 0 ${chart.width} ${chartHeight}`}
			role="img"
			aria-labelledby="rhythm-chart-title rhythm-chart-description"
		>
			<title id="rhythm-chart-title">
				{normalizedOverlay
					? 'Independently normalized rhythm overlay'
					: 'Aligned rhythm small multiples'}
				for {windows.find((window) => window.id === selectedWindow)?.short}
			</title>
			<desc id="rhythm-chart-description">
				{normalizedOverlay
					? 'All selected signals are rescaled separately to a zero-to-one range and overlaid only to compare timing.'
					: 'Each selected signal occupies a separate row with its own unit and vertical range on a shared time axis.'}
			</desc>

			{#each series as candidate, rowIndex (candidate.id)}
				{@const domain = yDomain(candidate)}
				{@const row = normalizedOverlay ? 0 : rowIndex}
				{@const rowTop = chart.top + row * chart.rowHeight + 10}
				{@const rowBottom = rowTop + 58}
				{#if !normalizedOverlay}
					<text class="series-label" x="8" y={compact ? rowTop - 17 : rowTop + 13}
						>{candidate.label}</text
					>
					<text class="series-unit" x="8" y={compact ? rowTop - 3 : rowTop + 31}
						>{candidate.unit}</text
					>
					<text
						class="domain-label"
						x={compact ? chart.right - 4 : chart.left - 10}
						y={compact ? rowTop + 13 : rowTop + 4}
						text-anchor="end"
					>
						{valueLabel(candidate, domain[1])}
					</text>
					<text
						class="domain-label"
						x={compact ? chart.right - 4 : chart.left - 10}
						y={compact ? rowBottom - 4 : rowBottom + 4}
						text-anchor="end"
					>
						{valueLabel(candidate, domain[0])}
					</text>
				{/if}
				<line
					class="facet-midline"
					x1={chart.left}
					x2={chart.right}
					y1={(rowTop + rowBottom) / 2}
					y2={(rowTop + rowBottom) / 2}
				/>
				<line class="facet-axis" x1={chart.left} x2={chart.right} y1={rowBottom} y2={rowBottom} />
				{#if candidate.connect !== false}
					<path
						class="rhythm-path"
						d={pathFor(candidate, rowIndex)}
						stroke={candidate.stroke}
						stroke-dasharray={candidate.dash}
					>
						<title
							>{candidate.label}; {candidate.unit}; drawn mark: {EVIDENCE_KIND_LABELS[
								candidate.kind
							]}; numerical support: {supportSummary(candidate)}; source: {evidenceFor(
								candidate.sourceId
							).sourceLabel}. {candidate.markDescription}
							{candidate.note}</title
						>
					</path>
				{/if}
				{#if candidate.connect === false}
					{#each candidate.points as point (`${candidate.id}-${point.t}`)}
						{@const position = pointPosition(candidate, point, rowIndex)}
						<line
							class="point-stem"
							x1={position.x}
							x2={position.x}
							y1={rowBottom}
							y2={position.y}
						/>
						<circle
							class="measured-point"
							cx={position.x}
							cy={position.y}
							r="5"
							fill={candidate.stroke}
						>
							<title
								>{point.label}: {point.value.toFixed(1)}
								{candidate.unit}; drawn mark: {EVIDENCE_KIND_LABELS[candidate.kind]}; source: {evidenceFor(
									candidate.sourceId
								).sourceLabel}. {candidate.markDescription}</title
							>
						</circle>
					{/each}
				{/if}
				{#if normalizedOverlay}
					<text
						class="overlay-label"
						x={chart.left + 8}
						y={rowTop + 12 + rowIndex * 13}
						fill={candidate.stroke}
					>
						{candidate.label}
					</text>
				{/if}
			{/each}

			{#each compact ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
				{@const tickX = chart.left + fraction * (chart.right - chart.left)}
				<line class="time-tick" x1={tickX} x2={tickX} y1={chartHeight - 27} y2={chartHeight - 22} />
				<text class="time-label" x={tickX} y={chartHeight - 7} text-anchor="middle">
					{timeLabel(timeDomain[0] + fraction * (timeDomain[1] - timeDomain[0]))}
				</text>
			{/each}
		</svg>
	</div>
	{#if normalizedOverlay}
		<div class="chart-legend rhythm-legend" aria-label="Normalized rhythm line patterns">
			{#each series as candidate (candidate.id)}
				<span>
					<svg viewBox="0 0 32 6" aria-hidden="true">
						<line
							x1="1"
							x2="31"
							y1="3"
							y2="3"
							stroke={candidate.stroke}
							stroke-dasharray={candidate.dash}
						/>
					</svg>
					{candidate.label}
				</span>
			{/each}
		</div>
	{/if}

	<div class="rhythm-interpretation-grid">
		{#each series as candidate (candidate.id)}
			<article class="evidence-card">
				<div class={`evidence-chip kind-${candidate.kind}`}>
					Drawn mark · {EVIDENCE_KIND_LABELS[candidate.kind]}
				</div>
				{#each supportKindsFor(candidate) as supportKind (supportKind)}
					{#if supportKind !== candidate.kind}
						<div class={`evidence-chip kind-${supportKind}`}>
							Numerical support · {EVIDENCE_KIND_LABELS[supportKind]}
						</div>
					{/if}
				{/each}
				<h4>{candidate.label}</h4>
				<p>{candidate.markDescription}</p>
				<p>{candidate.note}</p>
				<a href={evidenceFor(candidate.sourceId).sourceUrl} rel="external">
					{evidenceFor(candidate.sourceId).sourceLabel}
				</a>
			</article>
		{/each}
	</div>

	{#if selectedWindow === '24h'}
		<div class="temperature-convention">
			<button
				type="button"
				aria-expanded={showTemperatureConvention}
				aria-controls="temperature-convention-note"
				onclick={() => (showTemperatureConvention = !showTemperatureConvention)}
			>
				Peak-to-trough excursion ≠ half-range <span aria-hidden="true"
					>{showTemperatureConvention ? '−' : '+'}</span
				>
			</button>
			{#if showTemperatureConvention}
				<p id="temperature-convention-note">
					This article’s 1.1 °C figure is the full modeled distance from daily low to daily high.
					Some disciplines call the half-range—0.55 °C here—the amplitude, so the interface avoids
					that ambiguous word.
				</p>
			{/if}
		</div>
	{/if}

	<details class="source-drawer">
		<summary>Human-rhythm source drawer and exact display settings</summary>
		<div class="table-scroll">
			<table>
				<caption>Every displayed setting, evidence class, population and boundary.</caption>
				<thead>
					<tr>
						<th scope="col">Signal</th>
						<th scope="col">Displayed setting</th>
						<th scope="col">Evidence</th>
						<th scope="col">Population / conditions</th>
						<th scope="col">Source and limitation</th>
					</tr>
				</thead>
				<tbody>
					{#each RHYTHM_EVIDENCE as datum (datum.id)}
						<tr>
							<th scope="row">{datum.label}</th>
							<td>{datum.period}<br /><small>{datum.unit}</small></td>
							<td>
								{#each datum.supportKinds ?? [datum.kind] as supportKind (supportKind)}
									<span class={`evidence-chip kind-${supportKind}`}
										>{EVIDENCE_KIND_LABELS[supportKind]}</span
									>
								{/each}
							</td>
							<td>{datum.population ?? 'Varies'}<br /><small>{datum.conditions ?? ''}</small></td>
							<td>
								<a href={datum.sourceUrl} rel="external">{datum.sourceLabel}</a>
								{#if datum.additionalSources?.length}
									<ul>
										{#each datum.additionalSources as source (source.url)}
											<li><a href={source.url} rel="external">{source.label}</a></li>
										{/each}
									</ul>
								{/if}
								<ul>
									{#each datum.limitations as limitation (limitation)}<li>{limitation}</li>{/each}
								</ul>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>

	<aside class="variability-note" aria-labelledby="variability-title">
		<h4 id="variability-title">The trace changes when the person or context changes</h4>
		<p>
			Human rhythms vary with age, sex, menstrual phase, chronotype, sleep and light exposure,
			meals, activity and posture, illness, medication, assay method and measurement site.
		</p>
	</aside>
</section>
