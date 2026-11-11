<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import {
		ALL_PRESET_COMPARISONS,
		AVERAGING_SCENARIOS,
		DEFAULT_AVERAGING_SCENARIO,
		DEFAULT_PM25_PRESET,
		FIXED_HOURLY_AXIS_MAX,
		INDIA_CPCB_PM25_BANDS,
		OVERALL_US_AQI_AXIS_MAX,
		PM25_PRESETS,
		SHARED_CONCENTRATION_STRIP_MAX,
		SOURCES_CHECKED_LABEL,
		US_EPA_PM25_BANDS,
		VERIFIED_SOURCES,
		comparePm25Preset,
		computeOverallAqiSummary,
		getAveragingScenarioSummary,
		type AveragingScenarioId,
		type BreakpointBand,
		type Pm25Preset
	} from '$lib/visualizations/why-two-aqi-apps-show-different-numbers';

	const uid = $props.id();

	let selectedPreset = $state<Pm25Preset>(DEFAULT_PM25_PRESET);
	let selectedScenario = $state<AveragingScenarioId>(DEFAULT_AVERAGING_SCENARIO);

	const comparison = $derived(comparePm25Preset(selectedPreset));
	const averaging = $derived(getAveragingScenarioSummary(selectedScenario));
	const overallAqi = computeOverallAqiSummary();

	// Panel 1 shared concentration strip geometry (0 to 130 µg/m³)
	const stripLeft = 148;
	const stripRight = 656;
	const stripWidth = stripRight - stripLeft;
	const concToX = (conc: number) =>
		stripLeft +
		(Math.min(SHARED_CONCENTRATION_STRIP_MAX, Math.max(0, conc)) / SHARED_CONCENTRATION_STRIP_MAX) *
			stripWidth;

	function visibleBandSegments(bands: readonly BreakpointBand[]) {
		const segments: {
			key: string;
			x: number;
			width: number;
			category: string;
			indexHigh: number;
			concHigh: number;
			accentToken: BreakpointBand['accentToken'];
		}[] = [];

		let prevEnd = 0;
		for (const band of bands) {
			if (prevEnd >= SHARED_CONCENTRATION_STRIP_MAX) break;
			const clippedEnd = Math.min(SHARED_CONCENTRATION_STRIP_MAX, band.concHigh);
			const x = concToX(prevEnd);
			const endX = concToX(clippedEnd);
			segments.push({
				key: `${band.bandIndex}-${band.category}`,
				x,
				width: Math.max(1, endX - x),
				category: band.category,
				indexHigh: band.indexHigh,
				concHigh: band.concHigh,
				accentToken: band.accentToken
			});
			prevEnd = clippedEnd;
		}
		return segments;
	}

	const indiaStripSegments = visibleBandSegments(INDIA_CPCB_PM25_BANDS);
	const usStripSegments = visibleBandSegments(US_EPA_PM25_BANDS);

	// Panel 2 hourly chart geometry (fixed 0–400 µg/m³ axis across both presets)
	const chartLeft = 56;
	const chartRight = 662;
	const chartTop = 24;
	const chartBottom = 204;
	const chartWidth = chartRight - chartLeft;
	const chartHeight = chartBottom - chartTop;
	const barSlotWidth = chartWidth / 24;
	const barWidth = barSlotWidth - 5;

	const concToChartY = (conc: number) => chartBottom - (conc / FIXED_HOURLY_AXIS_MAX) * chartHeight;

	const hourlyAxisTicks = [0, 100, 200, 300, 400] as const;
	const overallTicks = [0, 50, 100, 150, 200] as const;
	const scenarioOrder: readonly AveragingScenarioId[] = ['smoke-arrives', 'steady-day'];
</script>

<section
	class="aqi-explainer not-prose"
	data-aqi-explainer
	data-tts-exclude
	aria-labelledby={`${uid}-title`}
>
	<header class="explainer-header">
		<p class="eyebrow">Air Quality Index · Scale, Time &amp; Pollutant</p>
		<h1 id={`${uid}-title`}>Why two AQI apps show different numbers</h1>
		<p class="byline">
			By <a href={resolve('/resume')} rel="author">Suvro Ghosh</a>
			<span aria-hidden="true">·</span>
			Published <time datetime="2026-11-11">11 November 2026</time>
			<span aria-hidden="true">·</span>
			Updated <time datetime="2026-11-11">11 November 2026</time>
		</p>
		<p class="lead">
			Three controlled views showing how scale bands, averaging windows and pollutant selection
			change the reported AQI—even when the outdoor air has not changed at all.
		</p>
	</header>

	<!-- PANEL 1: Same pollution on two scales -->
	<section class="panel" data-testid="panel-two-scales" aria-labelledby={`${uid}-p1-heading`}>
		<div class="panel-top">
			<p class="panel-step">Panel 1 of 3 · Scale bands</p>
			<h2 id={`${uid}-p1-heading`}>Same pollution on two scales</h2>
			<p class="question-lead">“How can the same air produce two different AQI numbers?”</p>
		</div>

		<div class="shared-input-box" role="group" aria-labelledby={`${uid}-shared-input-label`}>
			<div class="shared-input-copy">
				<p id={`${uid}-shared-input-label`} class="shared-input-title">
					<strong>PM2.5 concentration, averaged over the same 24 hours</strong>
				</p>
				<p class="unit-note">
					<abbr title="micrograms per cubic metre">µg/m³</abbr> means micrograms of fine-particle material
					per cubic metre of air.
				</p>
			</div>

			<div
				class="preset-buttons"
				role="group"
				aria-label="Choose a 24-hour PM2.5 concentration preset"
			>
				{#each PM25_PRESETS as preset (preset)}
					<button
						type="button"
						class="preset-btn"
						class:is-active={selectedPreset === preset}
						aria-pressed={selectedPreset === preset}
						data-testid={`preset-pm25-${preset}`}
						onclick={() => (selectedPreset = preset)}
					>
						<span class="preset-num">{preset}</span>
						<span class="preset-unit">µg/m³</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="scale-cards">
			<!-- India CPCB Card -->
			<article
				class={`scale-card accent-${comparison.india.accentToken}`}
				data-testid="card-india-cpcb"
				aria-label={`India CPCB result at ${comparison.concentrationUgM3} micrograms per cubic metre`}
			>
				<div class="card-header">
					<div>
						<p class="scale-agency">India CPCB</p>
						<p class="card-input-echo">
							Same input: <strong>{comparison.concentrationUgM3} µg/m³</strong> ·
							{comparison.averagingWindowLabel}
						</p>
					</div>
					<span class="category-pill">{comparison.india.category}</span>
				</div>

				<p class="output-label">AQI score for PM2.5</p>
				<p class="score-readout" data-testid="score-india-cpcb">
					<strong class="score-value">{comparison.india.subIndex}</strong>
					<span class="score-category">— {comparison.india.category}</span>
				</p>

				<p class="card-band-detail">
					Falls in CPCB’s {comparison.india.band.concLow}–{comparison.india.band.concHigh} µg/m³ band
					(score {comparison.india.band.indexLow}–{comparison.india.band.indexHigh}). Source:
					<a
						href="https://airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf"
						target="_blank"
						rel="noopener noreferrer">CPCB’s bands</a
					>.
				</p>
			</article>

			<!-- Current US EPA Card -->
			<article
				class={`scale-card accent-${comparison.us.accentToken}`}
				data-testid="card-us-epa"
				aria-label={`Current US EPA result at ${comparison.concentrationUgM3} micrograms per cubic metre`}
			>
				<div class="card-header">
					<div>
						<p class="scale-agency">Current US EPA</p>
						<p class="card-input-echo">
							Same input: <strong>{comparison.concentrationUgM3} µg/m³</strong> ·
							{comparison.averagingWindowLabel}
						</p>
					</div>
					<span class="category-pill">{comparison.us.category}</span>
				</div>

				<p class="output-label">AQI score for PM2.5</p>
				<p class="score-readout" data-testid="score-us-epa">
					<strong class="score-value">{comparison.us.subIndex}</strong>
					<span class="score-category">— {comparison.us.category}</span>
				</p>

				<p class="card-band-detail">
					Falls in EPA’s {comparison.us.band.concLow.toFixed(
						1
					)}–{comparison.us.band.concHigh.toFixed(1)} µg/m³ band (score {comparison.us.band
						.indexLow}–{comparison.us.band.indexHigh}). Source:
					<a
						href="https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html"
						target="_blank"
						rel="noopener noreferrer">current EPA table</a
					>.
				</p>
			</article>
		</div>

		<!-- Shared physical concentration strip (0–130 µg/m³) -->
		<figure class="strip-figure">
			<svg
				viewBox="0 0 680 144"
				class="strip-svg"
				role="img"
				aria-labelledby={`${uid}-strip-title ${uid}-strip-desc`}
			>
				<title id={`${uid}-strip-title`}>
					Shared 24-hour PM2.5 concentration axis from 0 to 130 micrograms per cubic metre with
					marker at {comparison.concentrationUgM3} micrograms per cubic metre
				</title>
				<desc id={`${uid}-strip-desc`}>
					Two horizontal band strips aligned on the same 0 to 130 micrograms per cubic metre axis.
					At
					{comparison.concentrationUgM3} micrograms per cubic metre, India CPCB gives PM2.5 score
					{comparison.india.subIndex} ({comparison.india.category}) and Current US EPA gives
					{comparison.us.subIndex} ({comparison.us.category}).
				</desc>

				<text x="12" y="42" class="svg-row-label">India CPCB</text>
				<text x="12" y="57" class="svg-row-sub">score bands</text>

				{#each indiaStripSegments as seg (seg.key)}
					<rect
						x={seg.x}
						y="24"
						width={seg.width}
						height="28"
						class={`band-rect band-${seg.accentToken}`}
					/>
					{#if seg.concHigh < SHARED_CONCENTRATION_STRIP_MAX}
						<text x={seg.x + seg.width - 8} y="42" text-anchor="end" class="svg-band-index">
							{seg.indexHigh}
						</text>
					{/if}
				{/each}

				<text x="12" y="92" class="svg-row-label">Current US EPA</text>
				<text x="12" y="107" class="svg-row-sub">score bands</text>

				{#each usStripSegments as seg (seg.key)}
					<rect
						x={seg.x}
						y="74"
						width={seg.width}
						height="28"
						class={`band-rect band-${seg.accentToken}`}
					/>
					{#if seg.concHigh < SHARED_CONCENTRATION_STRIP_MAX}
						<text x={seg.x + seg.width - 8} y="92" text-anchor="end" class="svg-band-index">
							{seg.indexHigh}
						</text>
					{/if}
				{/each}

				<!-- Shared concentration axis ticks -->
				<line x1={stripLeft} x2={stripRight} y1="114" y2="114" class="svg-axis-line" />
				{#each [0, 30, 60, 90, 120] as tick (tick)}
					{@const tx = concToX(tick)}
					<line x1={tx} x2={tx} y1="114" y2="120" class="svg-axis-line" />
					<text x={tx} y="135" text-anchor="middle" class="svg-axis-tick">
						{tick}{tick === 120 ? ' µg/m³' : ''}
					</text>
				{/each}

				<!-- Shared selected concentration marker -->
				<line
					x1={concToX(comparison.concentrationUgM3)}
					x2={concToX(comparison.concentrationUgM3)}
					y1="14"
					y2="114"
					class="svg-marker-line"
				/>
				<circle cx={concToX(comparison.concentrationUgM3)} cy="38" r="5.5" class="svg-marker-dot" />
				<circle cx={concToX(comparison.concentrationUgM3)} cy="88" r="5.5" class="svg-marker-dot" />
			</svg>
			<figcaption class="strip-caption">
				Numbers inside each strip mark the score at the top of that concentration band on a shared
				0–130 µg/m³ axis. Between 60 and 120 µg/m³, India’s score climbs by 100 points per 30 µg/m³
				while the US Unhealthy band spans 55.5–125.4 µg/m³ (scores 151–200).
			</figcaption>
		</figure>

		<div class="takeaway-callout" aria-live="polite" data-testid="panel-1-takeaway">
			<p class="dynamic-note" data-testid="panel-1-dynamic-note">
				<strong>{comparison.dynamicNote}</strong>
			</p>
			<p class="persistent-note" data-testid="panel-1-persistent-note">
				{comparison.persistentNote}
			</p>
			<p class="qualification-note">
				Each card shows the <strong>AQI score for PM2.5</strong> alone; another monitored pollutant can
				set the overall AQI. Category words such as “Moderate” and “Moderately polluted” belong to different
				scales and do not mean the same thing.
			</p>
		</div>
	</section>

	<!-- PANEL 2: Which hours are being described -->
	<section class="panel" data-testid="panel-averaging" aria-labelledby={`${uid}-p2-heading`}>
		<div class="panel-top">
			<div class="panel-badges">
				<span class="panel-step">Panel 2 of 3 · Averaging window</span>
				<span class="synthetic-badge">Made-up examples to explain averaging</span>
			</div>
			<h2 id={`${uid}-p2-heading`}>Which hours are being described</h2>
		</div>

		<div class="averaging-controls-row">
			<div class="preset-buttons" role="group" aria-label="Choose a 24-hour concentration sequence">
				{#each scenarioOrder as id (id)}
					{@const item = AVERAGING_SCENARIOS[id]}
					<button
						type="button"
						class="preset-btn scenario-btn"
						class:is-active={selectedScenario === id}
						aria-pressed={selectedScenario === id}
						data-testid={`scenario-${id}`}
						onclick={() => (selectedScenario = id)}
					>
						{item.label}
					</button>
				{/each}
			</div>

			<div class="averaging-metrics" aria-live="polite">
				<div class="metric-chip" data-testid="readout-24h-average">
					<span class="metric-label">24-hour average:</span>
					<strong>{averaging.mean24hUgM3} µg/m³</strong>
				</div>
				<div class="metric-chip metric-chip-latest" data-testid="readout-latest-hour">
					<span class="metric-label">Latest hourly average:</span>
					<strong>{averaging.latestHourUgM3} µg/m³</strong>
				</div>
			</div>
		</div>

		<figure class="chart-figure">
			<svg
				viewBox="0 0 680 248"
				class="hourly-svg"
				data-testid="hourly-chart-svg"
				role="img"
				aria-labelledby={`${uid}-hourly-title ${uid}-hourly-desc`}
			>
				<title id={`${uid}-hourly-title`}>
					{averaging.label}: 24 hourly PM2.5 concentrations in micrograms per cubic metre on a fixed
					0 to {FIXED_HOURLY_AXIS_MAX} axis
				</title>
				<desc id={`${uid}-hourly-desc`}>
					{averaging.summary} The horizontal mean line sits at {averaging.mean24hUgM3} micrograms per
					cubic metre, and highlighted Hour 24 reads {averaging.latestHourUgM3} micrograms per cubic metre.
				</desc>

				<text x="12" y="14" class="svg-axis-title">PM2.5 concentration in µg/m³</text>

				{#each hourlyAxisTicks as tick (tick)}
					{@const ty = concToChartY(tick)}
					<line x1={chartLeft} x2={chartRight} y1={ty} y2={ty} class="svg-grid-line" />
					<text x={chartLeft - 8} y={ty + 4} text-anchor="end" class="svg-axis-tick">{tick}</text>
				{/each}

				{#each averaging.hourlyConcentrationsUgM3 as value, idx (idx)}
					{@const bx = chartLeft + idx * barSlotWidth + 2.5}
					{@const by = concToChartY(value)}
					{@const bh = chartBottom - by}
					{@const isLatest = idx === averaging.hourlyConcentrationsUgM3.length - 1}
					<rect
						x={bx}
						y={by}
						width={barWidth}
						height={bh}
						rx="2"
						class={isLatest ? 'hourly-bar hourly-bar-latest' : 'hourly-bar'}
						data-hour={idx + 1}
						data-concentration={value}
					/>
				{/each}

				<!-- 24-hour mean horizontal line -->
				<line
					x1={chartLeft}
					x2={chartRight}
					y1={concToChartY(averaging.mean24hUgM3)}
					y2={concToChartY(averaging.mean24hUgM3)}
					class="mean-line"
					data-testid="hourly-mean-line"
				/>
				<rect
					x={chartLeft + 8}
					y={concToChartY(averaging.mean24hUgM3) - 22}
					width="196"
					height="19"
					rx="4"
					class="mean-label-bg"
				/>
				<text
					x={chartLeft + 14}
					y={concToChartY(averaging.mean24hUgM3) - 9}
					class="mean-label-text"
				>
					24-hour mean: {averaging.mean24hUgM3} µg/m³
				</text>

				<!-- Highlight annotation on Hour 24 -->
				<text
					x={chartRight - barSlotWidth / 2}
					y={Math.max(36, concToChartY(averaging.latestHourUgM3) - 8)}
					text-anchor="end"
					class="latest-label-text"
				>
					Latest hour (Hr 24): {averaging.latestHourUgM3} µg/m³
				</text>

				<!-- X axis labels -->
				<line
					x1={chartLeft}
					x2={chartRight}
					y1={chartBottom}
					y2={chartBottom}
					class="svg-axis-line"
				/>
				{#each [1, 6, 12, 18, 20, 24] as hr (hr)}
					{@const hx = chartLeft + (hr - 0.5) * barSlotWidth}
					<text
						x={hx}
						y="223"
						text-anchor="middle"
						class={hr === 24 ? 'svg-axis-tick svg-tick-latest' : 'svg-axis-tick'}
					>
						Hr {hr}
					</text>
				{/each}
				<text x={(chartLeft + chartRight) / 2} y="242" text-anchor="middle" class="svg-axis-title">
					Time across 24 consecutive hours (Hour 24 is most recent)
				</text>
			</svg>

			<figcaption class="chart-caption" data-testid="panel-2-caption">
				<strong
					>A recent reading describes the smoky hours more closely. A daily average includes the
					earlier hours too.</strong
				>
				Averaging does not always lower a number: after a smoke spike passes, a long running average stays
				elevated because the smoky hours remain in the lookback window. This panel stays in concentration
				units (µg/m³) because a single hour cannot be plugged directly into a 24-hour daily AQI table.
			</figcaption>
		</figure>

		<div class="methods-grid">
			<p>
				<a
					href="https://airquality.cpcb.gov.in/ccr_docs/How_AQI_Calculated.pdf"
					target="_blank"
					rel="noopener noreferrer">CPCB’s running average</a
				>
				looks back over 24 hours for particles, while
				<a
					href="https://www.airnow.gov/aqi/aqi-basics/using-air-quality-index/"
					target="_blank"
					rel="noopener noreferrer">US daily reporting</a
				> summarises a 24-hour day. Frequent display updates do not mean instantaneous air measurements.
			</p>
			<p>
				For changing conditions,
				<a
					href="https://www.epa.gov/sites/default/files/2018-01/documents/nowcastfactsheet.pdf"
					target="_blank"
					rel="noopener noreferrer">EPA NowCast</a
				>
				weights up to 12 hours, whereas
				<a
					href="https://www.iqair.com/support/knowledge-base/airvisual_vs_nowcast"
					target="_blank"
					rel="noopener noreferrer">IQAir’s previous-hour method</a
				> (US AQI+) uses the prior hour’s averages. Other apps (including AQI.in) may use different sensors
				and averaging windows rather than EPA NowCast.
			</p>
		</div>
	</section>

	<!-- PANEL 3: Which pollutant sets the overall number -->
	<section
		class="panel"
		data-testid="panel-overall-pollutant"
		aria-labelledby={`${uid}-p3-heading`}
	>
		<div class="panel-top">
			<div class="panel-badges">
				<span class="panel-step">Panel 3 of 3 · Dominant score rule</span>
				<span class="synthetic-badge">Illustrative scores · Scale: {overallAqi.scaleName}</span>
			</div>
			<h2 id={`${uid}-p3-heading`}>Which pollutant sets the overall number</h2>
		</div>

		<div class="overall-banner" data-testid="overall-aqi-readout">
			<div>
				<p class="overall-kicker">Overall AQI ({overallAqi.scaleName})</p>
				<p class="overall-headline">
					<strong>Overall AQI: {overallAqi.overallScore}</strong>
					<span>— {overallAqi.overallCategory} (set by {overallAqi.dominantPollutantLabel})</span>
				</p>
			</div>
			<p class="overall-rule">The highest pollutant score sets the overall number.</p>
		</div>

		<figure class="bars-figure">
			<svg
				viewBox="0 0 680 176"
				class="pollutant-bars-svg"
				role="img"
				aria-labelledby={`${uid}-bars-title ${uid}-bars-desc`}
			>
				<title id={`${uid}-bars-title`}>
					Three illustrative pollutant scores on the US AQI scale: PM2.5 score 154 (highlighted),
					PM10 score 62, and Ozone score 37, giving Overall AQI 154
				</title>
				<desc id={`${uid}-bars-desc`}>
					Horizontal bars sharing one US AQI scale from 0 to {OVERALL_US_AQI_AXIS_MAX}. Because 154
					is the highest score, PM2.5 sets Overall AQI to 154 without averaging or adding the lower
					scores.
				</desc>

				{#each overallTicks as tick (tick)}
					{@const gx = 112 + (tick / OVERALL_US_AQI_AXIS_MAX) * 430}
					<line x1={gx} x2={gx} y1="18" y2="142" class="svg-grid-line" />
					<text x={gx} y="160" text-anchor="middle" class="svg-axis-tick">{tick}</text>
				{/each}

				{#each overallAqi.bars as bar, index (bar.id)}
					{@const rowY = 26 + index * 38}
					{@const bw = bar.widthRatio * 430}
					<text
						x="102"
						y={rowY + 18}
						text-anchor="end"
						class={bar.isDominant ? 'svg-row-label svg-row-dominant' : 'svg-row-label'}
					>
						{bar.pollutantLabel}
					</text>
					<rect
						x="112"
						y={rowY}
						width={bw}
						height="26"
						rx="4"
						class={bar.isDominant ? 'pollutant-bar pollutant-bar-dominant' : 'pollutant-bar'}
						data-testid={`pollutant-bar-${bar.id}`}
					/>
					<text
						x={112 + bw + 10}
						y={rowY + 18}
						class={bar.isDominant ? 'bar-score-text bar-score-dominant' : 'bar-score-text'}
					>
						Score {bar.score} · {bar.category}{bar.isDominant ? ' (sets overall)' : ''}
					</text>
				{/each}

				<text x="327" y="174" text-anchor="middle" class="svg-axis-title">
					Shared scale: {overallAqi.scaleName} score (no concentration units)
				</text>
			</svg>

			<figcaption class="chart-caption">
				All three bars share one <strong>{overallAqi.scaleName}</strong> scale, so their lengths can be
				compared directly. The scores are never added, averaged or turned into percentages—and because
				PM10 physically includes PM2.5, particle fractions are not separate slices of a pie. Official
				station reports also require sufficient valid measurements before publishing an overall AQI; this
				simplified view shows only how the highest score wins.
			</figcaption>
		</figure>
	</section>

	<!-- CEILING NOTE BESIDE / BELOW THE PANELS -->
	<aside class="ceiling-note" data-testid="ceiling-note" aria-labelledby={`${uid}-ceiling-heading`}>
		<h2 id={`${uid}-ceiling-heading`}>Why 500 is a scale endpoint, not an instrument limit</h2>
		<p>
			India’s published
			<a
				href="https://airquality.cpcb.gov.in/ccr_docs/About_AQI.pdf"
				target="_blank"
				rel="noopener noreferrer">CPCB category scale</a
			>
			ends at <strong>500</strong>. A published scale endpoint and a monitor’s physical
			concentration-measurement limit are different things: instruments continue measuring particle
			concentration in µg/m³ when pollution rises higher. Current
			<a
				href="https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf"
				target="_blank"
				rel="noopener noreferrer">EPA guidance</a
			>
			explicitly permits calculated values above <strong>500</strong> using the upper-band slope,
			while keeping the category <strong>Hazardous</strong>. Never treat the ratio of two AQI
			numbers as a pollution or health-risk multiplier.
		</p>
	</aside>

	<!-- OPTIONAL CALCULATION DETAILS & SOURCES -->
	<details class="calc-details" data-testid="calculation-details">
		<summary>
			Optional calculation details, preset score table, static comparison image &amp; sources
			(checked
			{SOURCES_CHECKED_LABEL})
		</summary>
		<div class="details-body">
			<p>
				<strong>How each band score is calculated:</strong> Once a valid 24-hour concentration is
				matched to its concentration band, both systems use linear interpolation between that band’s
				concentration endpoints (<em>BP</em><sub>LO</sub> to <em>BP</em><sub>HI</sub>) and index
				endpoints (<em>I</em><sub>LO</sub> to <em>I</em><sub>HI</sub>), then round to the nearest
				whole number:
			</p>
			<p class="formula-line">
				<code>I = ((I_HI − I_LO) / (BP_HI − BP_LO)) × (C − BP_LO) + I_LO</code>
			</p>
			<p>
				For 24-hour PM2.5, EPA first truncates the concentration to one decimal place; CPCB’s
				published table uses whole-number µg/m³ breakpoints and ends its category scale at 500.
				Missing or invalid measurements are rejected rather than treated as zero.
			</p>

			<div class="table-wrap">
				<table>
					<caption>Verified rounded 24-hour PM2.5 sub-indices across all four presets</caption>
					<thead>
						<tr>
							<th scope="col">24-hr PM2.5 (µg/m³)</th>
							<th scope="col">India CPCB score &amp; category</th>
							<th scope="col">Current US EPA score &amp; category</th>
							<th scope="col">Unrounded US value</th>
						</tr>
					</thead>
					<tbody>
						{#each ALL_PRESET_COMPARISONS as row (row.concentrationUgM3)}
							<tr class:is-selected-row={row.concentrationUgM3 === selectedPreset}>
								<td><strong>{row.concentrationUgM3} µg/m³</strong></td>
								<td>{row.india.subIndex} — {row.india.category}</td>
								<td>{row.us.subIndex} — {row.us.category}</td>
								<td>{row.us.unroundedSubIndex.toFixed(2)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<p class="static-asset-link">
				<strong>Static default comparison card:</strong>
				<a
					href={asset(
						'/images/visualizations/why-two-aqi-apps-show-different-numbers/default-comparison.png'
					)}
					target="_blank"
					rel="noopener">Open static 60 µg/m³ comparison image (PNG, 1200 × 750)</a
				>
				— includes explicit µg/m³ units, the shared 24-hour window, and the PM2.5-only qualification.
			</p>

			<h3>Official sources and versions (checked {SOURCES_CHECKED_LABEL})</h3>
			<ul class="source-list">
				{#each VERIFIED_SOURCES as source (source.id)}
					<li>
						<strong>{source.agency}:</strong>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
						— <span>{source.versionNote}.</span>
					</li>
				{/each}
			</ul>
		</div>
	</details>
</section>

<style>
	.aqi-explainer {
		--aqi-bg: #faf7f0;
		--aqi-surface: #ffffff;
		--aqi-surface-muted: #f2ece0;
		--aqi-ink: #1e1b16;
		--aqi-ink-muted: #534b3e;
		--aqi-border: #d5cbb8;
		--aqi-border-strong: #8d806b;
		--aqi-focus: #0b5cab;
		--aqi-accent-primary: #1a4d6e;
		--aqi-accent-primary-ink: #ffffff;
		--aqi-spike: #b33a1b;
		--aqi-mean: #0f5f5c;
		--aqi-bar-base: #7c8c99;

		--band-good-bg: #dcefe2;
		--band-good-border: #2a7047;
		--band-satisfactory-bg: #e4f0d5;
		--band-satisfactory-border: #497523;
		--band-moderate-bg: #faefd2;
		--band-moderate-border: #8c6200;
		--band-usg-bg: #fbe3ce;
		--band-usg-border: #a84b08;
		--band-unhealthy-bg: #fadad6;
		--band-unhealthy-border: #a6261b;
		--band-poor-bg: #f8dfd2;
		--band-poor-border: #9c3811;
		--band-very-poor-bg: #eed9ec;
		--band-very-poor-border: #762970;
		--band-severe-bg: #e7d4d8;
		--band-severe-border: #691b2b;

		background: var(--aqi-bg);
		color: var(--aqi-ink);
		border: 1px solid var(--aqi-border);
		border-top: 3px solid var(--aqi-accent-primary);
		border-radius: 14px;
		padding: 1.5rem 1.35rem 1.65rem;
		margin: 0 auto 2.5rem;
		max-width: 920px;
		font-family:
			'Roboto Variable',
			system-ui,
			-apple-system,
			sans-serif;
		line-height: 1.55;
		box-sizing: border-box;
	}

	:global(html.dark) .aqi-explainer,
	:global(html[data-theme='night']) .aqi-explainer {
		--aqi-bg: #15181c;
		--aqi-surface: #1d2228;
		--aqi-surface-muted: #242b33;
		--aqi-ink: #f1eee8;
		--aqi-ink-muted: #c2bcb0;
		--aqi-border: #38414c;
		--aqi-border-strong: #6f7c8c;
		--aqi-focus: #6cb8ff;
		--aqi-accent-primary: #7ec4e8;
		--aqi-accent-primary-ink: #0f171e;
		--aqi-spike: #ff8f6b;
		--aqi-mean: #5eead4;
		--aqi-bar-base: #687786;

		--band-good-bg: #1b3828;
		--band-good-border: #55bd80;
		--band-satisfactory-bg: #26391b;
		--band-satisfactory-border: #86c94d;
		--band-moderate-bg: #3b2f12;
		--band-moderate-border: #e5b548;
		--band-usg-bg: #402614;
		--band-usg-border: #f2944e;
		--band-unhealthy-bg: #421e1c;
		--band-unhealthy-border: #f0756a;
		--band-poor-bg: #412317;
		--band-poor-border: #ee865b;
		--band-very-poor-bg: #381f38;
		--band-very-poor-border: #d982d2;
		--band-severe-bg: #3b1c24;
		--band-severe-border: #e37b91;
	}

	.aqi-explainer *,
	.aqi-explainer *::before,
	.aqi-explainer *::after {
		box-sizing: border-box;
	}

	.aqi-explainer a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
		font-weight: 600;
	}

	.aqi-explainer button:focus-visible,
	.aqi-explainer a:focus-visible,
	.aqi-explainer summary:focus-visible {
		outline: 3px solid var(--aqi-focus);
		outline-offset: 2px;
	}

	.explainer-header {
		border-bottom: 1px solid var(--aqi-border);
		padding-bottom: 1.15rem;
		margin-bottom: 1.4rem;
	}

	.eyebrow {
		margin: 0 0 0.35rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--aqi-ink-muted);
	}

	.explainer-header h1 {
		margin: 0 0 0.45rem;
		font-size: clamp(1.65rem, 3.6vw, 2.35rem);
		line-height: 1.15;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--aqi-ink);
	}

	.byline {
		margin: 0 0 0.75rem;
		font-size: 0.88rem;
		color: var(--aqi-ink-muted);
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.lead {
		margin: 0;
		font-size: 1.02rem;
		color: var(--aqi-ink);
		max-width: 68ch;
	}

	.panel {
		background: var(--aqi-surface);
		border: 1px solid var(--aqi-border);
		border-radius: 12px;
		padding: 1.25rem;
		margin-bottom: 1.25rem;
	}

	.panel-top {
		margin-bottom: 1rem;
	}

	.panel-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.35rem;
	}

	.panel-step {
		margin: 0 0 0.25rem;
		font-size: 0.76rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--aqi-ink-muted);
	}

	.panel-badges .panel-step {
		margin-bottom: 0;
	}

	.synthetic-badge {
		display: inline-block;
		font-size: 0.76rem;
		font-weight: 700;
		padding: 0.16rem 0.55rem;
		border-radius: 999px;
		background: var(--aqi-surface-muted);
		border: 1px solid var(--aqi-border);
		color: var(--aqi-ink);
	}

	.panel h2 {
		margin: 0;
		font-size: clamp(1.22rem, 2.4vw, 1.48rem);
		line-height: 1.25;
		font-weight: 750;
		color: var(--aqi-ink);
	}

	.question-lead {
		margin: 0.45rem 0 0;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--aqi-ink);
	}

	.shared-input-box {
		background: var(--aqi-surface-muted);
		border: 1px solid var(--aqi-border);
		border-radius: 10px;
		padding: 0.95rem 1rem;
		margin-bottom: 1rem;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.85rem;
	}

	.shared-input-title {
		margin: 0;
		font-size: 0.96rem;
	}

	.unit-note {
		margin: 0.2rem 0 0;
		font-size: 0.86rem;
		color: var(--aqi-ink-muted);
	}

	.unit-note abbr {
		text-decoration: none;
		font-weight: 700;
	}

	.preset-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.preset-btn {
		min-height: 46px;
		min-width: 78px;
		padding: 0.5rem 0.85rem;
		border-radius: 8px;
		border: 1.5px solid var(--aqi-border-strong);
		background: var(--aqi-surface);
		color: var(--aqi-ink);
		font-family: inherit;
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}

	.preset-btn:hover {
		border-color: var(--aqi-ink);
	}

	.preset-btn.is-active {
		background: var(--aqi-accent-primary);
		border-color: var(--aqi-accent-primary);
		color: var(--aqi-accent-primary-ink);
	}

	.preset-unit {
		font-size: 0.78rem;
		font-weight: 600;
		opacity: 0.9;
	}

	.scenario-btn {
		min-width: 132px;
	}

	.scale-cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.95rem;
		margin-bottom: 1rem;
	}

	@media (max-width: 680px) {
		.scale-cards {
			grid-template-columns: 1fr;
		}
	}

	.scale-card {
		border: 1.5px solid var(--aqi-border);
		border-left-width: 6px;
		border-radius: 10px;
		padding: 1rem 1.05rem;
		background: var(--aqi-bg);
	}

	.scale-card.accent-good {
		border-left-color: var(--band-good-border);
	}
	.scale-card.accent-satisfactory {
		border-left-color: var(--band-satisfactory-border);
	}
	.scale-card.accent-moderate {
		border-left-color: var(--band-moderate-border);
	}
	.scale-card.accent-usg {
		border-left-color: var(--band-usg-border);
	}
	.scale-card.accent-unhealthy {
		border-left-color: var(--band-unhealthy-border);
	}
	.scale-card.accent-poor {
		border-left-color: var(--band-poor-border);
	}
	.scale-card.accent-very-poor {
		border-left-color: var(--band-very-poor-border);
	}
	.scale-card.accent-severe {
		border-left-color: var(--band-severe-border);
	}

	.card-header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.65rem;
	}

	.scale-agency {
		margin: 0;
		font-size: 1.02rem;
		font-weight: 800;
	}

	.card-input-echo {
		margin: 0.15rem 0 0;
		font-size: 0.82rem;
		color: var(--aqi-ink-muted);
	}

	.category-pill {
		display: inline-block;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 700;
		background: var(--aqi-surface);
		border: 1px solid var(--aqi-border-strong);
		color: var(--aqi-ink);
	}

	.output-label {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--aqi-ink-muted);
	}

	.score-readout {
		margin: 0.15rem 0 0.55rem;
		display: flex;
		flex-wrap: baseline;
		align-items: baseline;
		gap: 0.45rem;
	}

	.score-value {
		font-size: clamp(2rem, 4.5vw, 2.6rem);
		line-height: 1.05;
		font-weight: 850;
		font-variant-numeric: tabular-nums;
	}

	.score-category {
		font-size: 1.05rem;
		font-weight: 700;
	}

	.card-band-detail {
		margin: 0;
		font-size: 0.85rem;
		color: var(--aqi-ink-muted);
	}

	.strip-figure,
	.chart-figure,
	.bars-figure {
		margin: 0 0 0.95rem;
	}

	.strip-svg,
	.hourly-svg,
	.pollutant-bars-svg {
		display: block;
		width: 100%;
		height: auto;
		background: var(--aqi-bg);
		border: 1px solid var(--aqi-border);
		border-radius: 8px;
		padding: 0.35rem;
	}

	.band-rect {
		stroke: var(--aqi-border-strong);
		stroke-width: 1;
	}
	.band-good {
		fill: var(--band-good-bg);
	}
	.band-satisfactory {
		fill: var(--band-satisfactory-bg);
	}
	.band-moderate {
		fill: var(--band-moderate-bg);
	}
	.band-usg {
		fill: var(--band-usg-bg);
	}
	.band-unhealthy {
		fill: var(--band-unhealthy-bg);
	}
	.band-poor {
		fill: var(--band-poor-bg);
	}
	.band-very-poor {
		fill: var(--band-very-poor-bg);
	}
	.band-severe {
		fill: var(--band-severe-bg);
	}

	.svg-row-label {
		fill: var(--aqi-ink);
		font-size: 12.5px;
		font-weight: 700;
	}

	.svg-row-dominant {
		font-weight: 800;
	}

	.svg-row-sub {
		fill: var(--aqi-ink-muted);
		font-size: 10.5px;
	}

	.svg-band-index {
		fill: var(--aqi-ink);
		font-size: 11px;
		font-weight: 700;
	}

	.svg-axis-line {
		stroke: var(--aqi-border-strong);
		stroke-width: 1.25;
	}

	.svg-grid-line {
		stroke: var(--aqi-border);
		stroke-width: 1;
		stroke-dasharray: 3 3;
	}

	.svg-axis-tick {
		fill: var(--aqi-ink-muted);
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
	}

	.svg-tick-latest {
		fill: var(--aqi-spike);
		font-weight: 700;
	}

	.svg-axis-title {
		fill: var(--aqi-ink-muted);
		font-size: 11.5px;
		font-weight: 600;
	}

	.svg-marker-line {
		stroke: var(--aqi-ink);
		stroke-width: 2.4;
	}

	.svg-marker-dot {
		fill: var(--aqi-ink);
		stroke: var(--aqi-surface);
		stroke-width: 2;
	}

	.strip-caption,
	.chart-caption {
		margin: 0.5rem 0 0;
		font-size: 0.88rem;
		color: var(--aqi-ink-muted);
	}

	.takeaway-callout {
		background: var(--aqi-surface-muted);
		border-left: 4px solid var(--aqi-accent-primary);
		border-radius: 6px;
		padding: 0.85rem 1rem;
	}

	.dynamic-note {
		margin: 0 0 0.3rem;
		font-size: 0.98rem;
		color: var(--aqi-ink);
	}

	.persistent-note {
		margin: 0 0 0.35rem;
		font-size: 0.93rem;
		font-weight: 700;
		color: var(--aqi-ink);
	}

	.qualification-note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--aqi-ink-muted);
	}

	.averaging-controls-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.85rem;
		margin-bottom: 0.95rem;
	}

	.averaging-metrics {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.metric-chip {
		padding: 0.45rem 0.75rem;
		border-radius: 8px;
		background: var(--aqi-surface-muted);
		border: 1.5px solid var(--aqi-mean);
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
	}

	.metric-chip-latest {
		border-color: var(--aqi-spike);
	}

	.metric-label {
		color: var(--aqi-ink-muted);
		margin-right: 0.25rem;
	}

	.hourly-bar {
		fill: var(--aqi-bar-base);
		opacity: 0.78;
	}

	.hourly-bar-latest {
		fill: var(--aqi-spike);
		opacity: 1;
		stroke: var(--aqi-ink);
		stroke-width: 1.4;
	}

	.mean-line {
		stroke: var(--aqi-mean);
		stroke-width: 2.5;
		stroke-dasharray: 6 4;
	}

	.mean-label-bg {
		fill: var(--aqi-surface);
		stroke: var(--aqi-mean);
		stroke-width: 1;
	}

	.mean-label-text {
		fill: var(--aqi-ink);
		font-size: 11.5px;
		font-weight: 700;
	}

	.latest-label-text {
		fill: var(--aqi-spike);
		font-size: 11.5px;
		font-weight: 800;
	}

	.methods-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
		border-top: 1px solid var(--aqi-border);
		padding-top: 0.85rem;
		font-size: 0.86rem;
		color: var(--aqi-ink-muted);
	}

	.methods-grid p {
		margin: 0;
	}

	@media (max-width: 680px) {
		.methods-grid {
			grid-template-columns: 1fr;
		}
	}

	.overall-banner {
		background: var(--aqi-surface-muted);
		border: 1px solid var(--aqi-border);
		border-radius: 10px;
		padding: 0.85rem 1rem;
		margin-bottom: 0.95rem;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.65rem;
	}

	.overall-kicker {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--aqi-ink-muted);
	}

	.overall-headline {
		margin: 0.15rem 0 0;
		font-size: 1.15rem;
	}

	.overall-headline strong {
		font-size: 1.35rem;
		font-weight: 850;
	}

	.overall-rule {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--aqi-ink);
	}

	.pollutant-bar {
		fill: var(--aqi-bar-base);
		opacity: 0.72;
	}

	.pollutant-bar-dominant {
		fill: var(--aqi-spike);
		opacity: 1;
		stroke: var(--aqi-ink);
		stroke-width: 1.4;
	}

	.bar-score-text {
		fill: var(--aqi-ink-muted);
		font-size: 12px;
		font-weight: 600;
	}

	.bar-score-dominant {
		fill: var(--aqi-ink);
		font-weight: 800;
	}

	.ceiling-note {
		background: var(--aqi-surface-muted);
		border: 1px solid var(--aqi-border);
		border-radius: 10px;
		padding: 1rem 1.15rem;
		margin-bottom: 1.1rem;
	}

	.ceiling-note h2 {
		margin: 0 0 0.35rem;
		font-size: 1.05rem;
		font-weight: 750;
	}

	.ceiling-note p {
		margin: 0;
		font-size: 0.91rem;
		color: var(--aqi-ink);
	}

	.calc-details {
		border: 1px solid var(--aqi-border);
		border-radius: 10px;
		background: var(--aqi-surface);
		padding: 0.75rem 1rem;
	}

	.calc-details summary {
		cursor: pointer;
		font-weight: 700;
		font-size: 0.92rem;
		min-height: 44px;
		display: flex;
		align-items: center;
	}

	.details-body {
		border-top: 1px solid var(--aqi-border);
		margin-top: 0.65rem;
		padding-top: 0.85rem;
		font-size: 0.89rem;
		color: var(--aqi-ink);
	}

	.details-body p {
		margin: 0 0 0.7rem;
	}

	.formula-line code {
		display: inline-block;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		background: var(--aqi-surface-muted);
		border: 1px solid var(--aqi-border);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}

	.table-wrap {
		overflow-x: auto;
		margin: 0.85rem 0;
	}

	.details-body table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.86rem;
		font-variant-numeric: tabular-nums;
	}

	.details-body caption {
		text-align: left;
		font-weight: 700;
		margin-bottom: 0.4rem;
	}

	.details-body th,
	.details-body td {
		border: 1px solid var(--aqi-border);
		padding: 0.45rem 0.6rem;
		text-align: left;
	}

	.details-body th {
		background: var(--aqi-surface-muted);
	}

	.is-selected-row {
		background: var(--aqi-surface-muted);
	}

	.details-body h3 {
		margin: 1rem 0 0.45rem;
		font-size: 0.96rem;
	}

	.source-list {
		margin: 0;
		padding-left: 1.2rem;
	}

	.source-list li {
		margin-bottom: 0.4rem;
	}

	@media (max-width: 480px) {
		.aqi-explainer {
			padding: 1.1rem 0.85rem 1.2rem;
		}
		.panel {
			padding: 0.95rem 0.85rem;
		}
		.preset-btn {
			flex: 1 1 calc(50% - 0.5rem);
		}
	}
</style>
