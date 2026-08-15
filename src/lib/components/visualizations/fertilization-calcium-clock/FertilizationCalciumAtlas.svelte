<script lang="ts">
	import { onMount } from 'svelte';
	import {
		calciumProfiles,
		formatElapsed,
		formatEvidenceStatus,
		measurementRows,
		patternLabel,
		profileById,
		sampleCalcium,
		sourceEvidence,
		spatialSnapshot
	} from '$lib/visualizations/fertilization-calcium-atlas/profiles';
	import type {
		CalciumProfile,
		MeasurementRow
	} from '$lib/visualizations/fertilization-calcium-atlas/types';

	type ReplayMode = 'actual' | 'normalized';
	type Tick = { x: number; label: string };

	const chart = { width: 640, height: 238, left: 58, right: 620, top: 20, bottom: 196 };
	const chartSamples = 220;
	const normalizedReplaySeconds = 12;
	const actualReplaySeconds = 18;
	const corticalGranules = Array.from({ length: 18 }, (_, index) => {
		const angle = (Math.PI * 2 * index) / 18;
		return {
			x: 150 + Math.cos(angle) * 71,
			y: 108 + Math.sin(angle) * 71
		};
	});

	let root: HTMLElement;
	let selectedId = $state('human');
	let comparisonId = $state('');
	let replayMode = $state<ReplayMode>('actual');
	let progress = $state(0);
	let playing = $state(false);
	let reducedMotion = $state(false);
	let hydrated = $state(false);
	let visible = $state(true);
	let liveMessage = $state('Human profile selected.');

	let profile = $derived(profileById(selectedId));
	let comparisonProfile = $derived(
		replayMode === 'normalized' && comparisonId ? profileById(comparisonId) : null
	);
	let biologicalTimeSec = $derived(progress * profile.visualModel.windowSec.value);
	let signal = $derived(sampleCalcium(profile, biologicalTimeSec));
	let spatial = $derived(spatialSnapshot(profile, biologicalTimeSec));
	let rows = $derived(measurementRows(profile));
	let sources = $derived(sourceEvidence(profile));
	let primaryPath = $derived(makeChartPath(profile));
	let comparisonPath = $derived(comparisonProfile ? makeChartPath(comparisonProfile) : '');
	let ticks = $derived(makeTicks(profile, replayMode));
	let markerX = $derived(chart.left + progress * (chart.right - chart.left));
	let markerY = $derived(chart.bottom - signal * (chart.bottom - chart.top));
	let elapsedLabel = $derived(
		replayMode === 'actual'
			? `${formatElapsed(biologicalTimeSec)} of ${formatElapsed(profile.visualModel.windowSec.value)} biological time`
			: `${Math.round(progress * 100)}% normalized · ${formatElapsed(biologicalTimeSec)} on the ${profile.commonName.toLowerCase()} window`
	);
	let replayScaleLabel = $derived(
		replayMode === 'actual'
			? `Accelerated replay ×${formatAcceleration(profile.visualModel.windowSec.value / actualReplaySeconds)}; the axis and readout retain biological time.`
			: 'Normalized replay maps each selected viewing window to 0–100%; matching positions do not imply matching mechanisms.'
	);
	let activeEventIndex = $derived(Math.min(4, Math.floor(progress * 5)));

	function clamp01(value: number) {
		return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
	}

	function formatAcceleration(value: number) {
		if (value < 10) return value.toFixed(1);
		return Math.round(value).toLocaleString('en-GB');
	}

	function axisTime(seconds: number) {
		if (seconds < 60) return `${Math.round(seconds)} s`;
		if (seconds < 3_600) {
			const minutes = seconds / 60;
			return Number.isInteger(minutes) ? `${minutes} min` : `${minutes.toFixed(1)} min`;
		}
		const hours = seconds / 3_600;
		return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
	}

	function makeTicks(candidate: CalciumProfile, mode: ReplayMode): Tick[] {
		return Array.from({ length: 5 }, (_, index) => {
			const fraction = index / 4;
			return {
				x: chart.left + fraction * (chart.right - chart.left),
				label:
					mode === 'normalized'
						? `${Math.round(fraction * 100)}%`
						: axisTime(candidate.visualModel.windowSec.value * fraction)
			};
		});
	}

	function makeChartPath(candidate: CalciumProfile) {
		return Array.from({ length: chartSamples + 1 }, (_, index) => {
			const fraction = index / chartSamples;
			const x = chart.left + fraction * (chart.right - chart.left);
			const y =
				chart.bottom -
				sampleCalcium(candidate, fraction * candidate.visualModel.windowSec.value) *
					(chart.bottom - chart.top);
			return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
		}).join(' ');
	}

	function selectSpecies(id: string) {
		selectedId = id;
		if (comparisonId === id) comparisonId = '';
		progress = 0;
		playing = false;
		const selected = profileById(id);
		liveMessage = `${selected.commonName} selected: ${patternLabel(selected)}.`;
	}

	function changeSpecies(event: Event) {
		selectSpecies((event.currentTarget as HTMLSelectElement).value);
	}

	function stepSpecies(direction: -1 | 1) {
		const index = calciumProfiles.findIndex((candidate) => candidate.id === selectedId);
		const next = (index + direction + calciumProfiles.length) % calciumProfiles.length;
		selectSpecies(calciumProfiles[next].id);
	}

	function changeComparison(event: Event) {
		comparisonId = (event.currentTarget as HTMLSelectElement).value;
		if (comparisonId) {
			liveMessage = `${profile.commonName} compared with ${profileById(comparisonId).commonName} on normalized phase.`;
		}
	}

	function setReplayMode(mode: ReplayMode) {
		replayMode = mode;
		playing = false;
		if (mode === 'actual') comparisonId = '';
		liveMessage =
			mode === 'actual' ? 'Actual biological time axis selected.' : 'Normalized replay selected.';
	}

	function togglePlayback() {
		if (reducedMotion) return;
		if (progress >= 1) progress = 0;
		playing = !playing;
		liveMessage = playing ? 'Replay started.' : 'Replay paused.';
	}

	function replay() {
		progress = 0;
		playing = !reducedMotion;
		liveMessage = reducedMotion
			? 'Replay reset. Reduced motion is active; use the scrubber to step through stable states.'
			: 'Replay restarted.';
	}

	function scrub(event: Event) {
		progress = clamp01(Number((event.currentTarget as HTMLInputElement).value) / 1_000);
		playing = false;
		liveMessage = `Scrubbed to ${elapsedLabel}.`;
	}

	function summaryValues(candidate: CalciumProfile) {
		return measurementRows(candidate)
			.filter((item) => item.label !== 'Viewing window')
			.map(
				(item) => `${item.label}: ${item.display} (${formatEvidenceStatus(item.evidence.status)})`
			)
			.join('; ');
	}

	function externalSources(candidate: CalciumProfile) {
		const evidence = sourceEvidence(candidate).filter((item) =>
			item.sourceUrl.startsWith('https://')
		);
		const unique: (typeof evidence)[number][] = [];
		for (const item of evidence) {
			const index = unique.findIndex((candidateItem) => candidateItem.sourceUrl === item.sourceUrl);
			if (index < 0) {
				unique.push(item);
			} else if (unique[index].sourceLabel.startsWith('Derived from')) {
				unique[index] = item;
			}
		}
		return unique;
	}

	function rowKey(row: MeasurementRow) {
		return `${row.label}-${row.display}-${row.evidence.sourceLabel}`;
	}

	onMount(() => {
		hydrated = true;
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => {
			reducedMotion =
				motionQuery.matches ||
				['still', 'reduce'].includes(document.documentElement.dataset.motion ?? '');
			if (reducedMotion) playing = false;
		};
		syncMotion();
		motionQuery.addEventListener('change', syncMotion);

		const motionObserver = new MutationObserver(syncMotion);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});

		const intersectionObserver = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				if (!visible) playing = false;
			},
			{ rootMargin: '120px 0px' }
		);
		intersectionObserver.observe(root);

		const onVisibilityChange = () => {
			if (document.hidden) playing = false;
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		let frame = 0;
		let previous = performance.now();
		const animate = (now: number) => {
			const delta = Math.min(80, Math.max(0, now - previous));
			previous = now;
			if (playing && visible && !reducedMotion) {
				const duration =
					(replayMode === 'actual' ? actualReplaySeconds : normalizedReplaySeconds) * 1_000;
				progress = clamp01(progress + delta / duration);
				if (progress >= 1) {
					playing = false;
					liveMessage = 'Replay complete.';
				}
			}
			frame = requestAnimationFrame(animate);
		};
		frame = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(frame);
			motionQuery.removeEventListener('change', syncMotion);
			motionObserver.disconnect();
			intersectionObserver.disconnect();
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});
</script>

<figure
	bind:this={root}
	class="calcium-atlas article-breakout not-prose"
	data-testid="fertilization-calcium-atlas"
	data-ready={hydrated}
	data-species={selectedId}
	data-mode={replayMode}
	data-reduced-motion={reducedMotion}
	aria-labelledby="calcium-atlas-title"
>
	<header class="atlas-heading">
		<div>
			<p class="eyebrow">Fertilization calcium atlas</p>
			<h2 id="calcium-atlas-title">One message, several temporal dialects</h2>
			<p class="deck">
				Follow a literature-anchored calcium signal through an egg, then compare a single wave, a
				slow train, and rapid pulses without pretending they share one clock.
			</p>
		</div>
		<div class="pattern-stamp">
			<span>{patternLabel(profile)}</span>
			<strong>{profile.commonName}</strong>
			<em>{profile.scientificName}</em>
		</div>
	</header>

	<div class="disclosure" role="note">
		<strong
			>Literature-based schematic generated from published summary measurements; not a raw
			experimental recording.</strong
		>
		<span
			>Indicator brightness represents a measurement method; the egg does not emit visible flashes.</span
		>
	</div>

	<section class="controls" aria-label="Atlas controls">
		<div class="species-control">
			<label for="calcium-species">Species</label>
			<div class="species-row">
				<button type="button" onclick={() => stepSpecies(-1)} aria-label="Previous species"
					>←</button
				>
				<select id="calcium-species" value={selectedId} onchange={changeSpecies}>
					{#each calciumProfiles as candidate (candidate.id)}
						<option value={candidate.id}>{candidate.commonName} — {candidate.scientificName}</option
						>
					{/each}
				</select>
				<button type="button" onclick={() => stepSpecies(1)} aria-label="Next species">→</button>
			</div>
		</div>

		<fieldset class="mode-control">
			<legend>Time scale</legend>
			<button
				type="button"
				class:active={replayMode === 'actual'}
				aria-pressed={replayMode === 'actual'}
				onclick={() => setReplayMode('actual')}>Actual time</button
			>
			<button
				type="button"
				class:active={replayMode === 'normalized'}
				aria-pressed={replayMode === 'normalized'}
				onclick={() => setReplayMode('normalized')}>Normalized replay</button
			>
		</fieldset>

		<div class="compare-control">
			<label for="calcium-compare">Compare with</label>
			<select
				id="calcium-compare"
				value={comparisonId}
				onchange={changeComparison}
				disabled={replayMode !== 'normalized'}
			>
				<option value="">None</option>
				{#each calciumProfiles.filter((candidate) => candidate.id !== selectedId) as candidate (candidate.id)}
					<option value={candidate.id}>{candidate.commonName}</option>
				{/each}
			</select>
			<small>Two-profile comparison is available only on the explicit 0–100% scale.</small>
		</div>
	</section>

	<section class="transport" aria-label="Replay transport">
		<div class="transport-buttons">
			<button
				type="button"
				class="primary"
				onclick={togglePlayback}
				disabled={reducedMotion}
				aria-describedby={reducedMotion ? 'calcium-motion-note' : undefined}
			>
				{playing ? 'Pause' : progress >= 1 ? 'Play again' : 'Play'}
			</button>
			<button type="button" onclick={replay}>Replay</button>
		</div>
		<div class="scrubber">
			<label for="calcium-scrubber">Elapsed: <strong>{elapsedLabel}</strong></label>
			<input
				id="calcium-scrubber"
				type="range"
				min="0"
				max="1000"
				step="1"
				value={Math.round(progress * 1_000)}
				aria-valuetext={elapsedLabel}
				oninput={scrub}
			/>
		</div>
		<p>{replayScaleLabel}</p>
	</section>

	{#if reducedMotion}
		<p id="calcium-motion-note" class="motion-note">
			Reduced motion is active. Autoplay is off; the scrubber, species controls, and replay reset
			show stable frames immediately.
		</p>
	{/if}

	<div class="synchronised-panels">
		<section class="egg-panel" aria-labelledby="egg-panel-title">
			<div class="panel-heading">
				<div>
					<p>Spatial view</p>
					<h3 id="egg-panel-title">Inside the egg</h3>
				</div>
				<output>{spatial.label}</output>
			</div>

			<svg
				class="egg-svg"
				viewBox="0 0 300 230"
				role="img"
				aria-labelledby="egg-svg-title egg-svg-description"
			>
				<title id="egg-svg-title"
					>Schematic calcium state in a {profile.commonName.toLowerCase()} egg</title
				>
				<desc id="egg-svg-description">
					{profile.visualModel.spatialMode === 'propagating-wave'
						? `An original cross-section shows an explanatory wavefront at ${Math.round(spatial.front * 100)} percent of its schematic path when the front is active. ${spatial.note}`
						: `The whole egg brightens with the schematic relative signal. ${spatial.note}`}
				</desc>
				<defs>
					<clipPath id="calcium-egg-clip">
						<circle cx="150" cy="108" r="76" />
					</clipPath>
				</defs>

				<path class="sperm-tail" d="M25 108 C47 80 58 135 79 107" />
				<ellipse class="sperm-head" cx="83" cy="106" rx="7" ry="4.5" />
				<text class="sperm-label" x="20" y="76">trigger side</text>

				<circle class="zona" cx="150" cy="108" r="88" />
				<circle class="cytoplasm" cx="150" cy="108" r="76" />

				{#if profile.visualModel.spatialMode === 'propagating-wave'}
					{#if profile.visualModel.spatialDirection === 'left-to-right'}
						<rect
							class="calcium-field"
							x="74"
							y="32"
							width={152 * spatial.front}
							height="152"
							clip-path="url(#calcium-egg-clip)"
							style={`opacity:${(spatial.intensity * 0.88).toFixed(3)}`}
						/>
						{#if spatial.active}
							<line
								class="wavefront"
								x1={74 + 152 * spatial.front}
								x2={74 + 152 * spatial.front}
								y1="43"
								y2="173"
								clip-path="url(#calcium-egg-clip)"
							/>
							<text class="front-label" x={Math.min(218, 80 + 152 * spatial.front)} y="195"
								>wavefront</text
							>
						{/if}
					{:else}
						<rect
							class="calcium-field"
							x="74"
							y="32"
							width="152"
							height={152 * spatial.front}
							clip-path="url(#calcium-egg-clip)"
							style={`opacity:${(spatial.intensity * 0.88).toFixed(3)}`}
						/>
						{#if spatial.active}
							<line
								class="wavefront"
								x1="84"
								x2="216"
								y1={32 + 152 * spatial.front}
								y2={32 + 152 * spatial.front}
								clip-path="url(#calcium-egg-clip)"
							/>
							<text class="front-label" x="203" y={Math.min(200, 42 + 152 * spatial.front)}
								>wavefront</text
							>
						{/if}
					{/if}
				{:else}
					<circle
						class="calcium-field whole-cell"
						cx="150"
						cy="108"
						r="74"
						style={`opacity:${(spatial.intensity * 0.86).toFixed(3)}`}
					/>
					<circle
						class="whole-cell-ring"
						cx="150"
						cy="108"
						r={28 + spatial.intensity * 38}
						style={`opacity:${(spatial.intensity * 0.7).toFixed(3)}`}
					/>
				{/if}

				<g class="er-network" aria-hidden="true">
					<path d="M109 82 C126 67 137 89 150 76 S179 71 193 85" />
					<path d="M103 109 C121 96 134 119 151 103 S183 97 199 111" />
					<path d="M111 137 C126 122 143 143 157 129 S181 126 191 140" />
				</g>
				<g class="granules" aria-label="Cortical granules shown around the egg cortex">
					{#each corticalGranules as granule, index (index)}
						<circle cx={granule.x} cy={granule.y} r="2.6" />
					{/each}
				</g>
				<text class="egg-label" x="150" y="216" text-anchor="middle">
					indicator response · relative signal {signal.toFixed(2)}
				</text>
			</svg>

			<p class="panel-note">{spatial.note}</p>
		</section>

		<section class="chart-panel" aria-labelledby="trace-panel-title">
			<div class="panel-heading">
				<div>
					<p>Temporal view</p>
					<h3 id="trace-panel-title">Relative cytosolic calcium</h3>
				</div>
				<output>{elapsedLabel}</output>
			</div>

			<div class="chart-legend" aria-label="Chart legend">
				<span
					><i class="primary-line" aria-hidden="true"></i>{profile.commonName} · {patternLabel(
						profile
					)}</span
				>
				{#if comparisonProfile}
					<span
						><i class="comparison-line" aria-hidden="true"></i>{comparisonProfile.commonName} · {patternLabel(
							comparisonProfile
						)}</span
					>
				{/if}
			</div>

			<svg
				class="trace-svg"
				viewBox={`0 0 ${chart.width} ${chart.height}`}
				role="img"
				aria-labelledby="trace-svg-title trace-svg-description"
			>
				<title id="trace-svg-title">
					Schematic relative calcium signal for {profile.commonName}{comparisonProfile
						? ` and ${comparisonProfile.commonName}`
						: ''}
				</title>
				<desc id="trace-svg-description">
					A deterministic curve generated from published summary measurements. The horizontal axis
					is
					{replayMode === 'actual' ? ' biological time' : ' normalized phase'} and the vertical axis is
					relative signal, not a raw fluorescence or concentration recording.
				</desc>

				{#each [0, 0.5, 1] as value (value)}
					<line
						class="grid-line"
						x1={chart.left}
						x2={chart.right}
						y1={chart.bottom - value * (chart.bottom - chart.top)}
						y2={chart.bottom - value * (chart.bottom - chart.top)}
					/>
					<text
						class="axis-tick y-tick"
						x={chart.left - 10}
						y={chart.bottom - value * (chart.bottom - chart.top) + 4}
						text-anchor="end">{value.toFixed(1)}</text
					>
				{/each}

				{#each ticks as tick (tick.x)}
					<line class="tick-mark" x1={tick.x} x2={tick.x} y1={chart.bottom} y2={chart.bottom + 5} />
					<text class="axis-tick" x={tick.x} y={chart.bottom + 20} text-anchor="middle">
						{tick.label}
					</text>
				{/each}

				<line class="axis" x1={chart.left} x2={chart.right} y1={chart.bottom} y2={chart.bottom} />
				<line class="axis" x1={chart.left} x2={chart.left} y1={chart.top} y2={chart.bottom} />
				<path class="trace primary-trace" d={primaryPath} />
				{#if comparisonPath}
					<path class="trace comparison-trace" d={comparisonPath} />
				{/if}
				<line class="elapsed-guide" x1={markerX} x2={markerX} y1={chart.top} y2={chart.bottom} />
				<circle class="elapsed-dot" cx={markerX} cy={markerY} r="5" />
				<text
					class="axis-title"
					x={(chart.left + chart.right) / 2}
					y={chart.height - 4}
					text-anchor="middle"
				>
					{replayMode === 'actual' ? 'Biological elapsed time' : 'Normalized replay phase'}
				</text>
				<text
					class="axis-title y-title"
					x="15"
					y={(chart.top + chart.bottom) / 2}
					text-anchor="middle"
					transform={`rotate(-90 15 ${(chart.top + chart.bottom) / 2})`}>relative signal</text
				>
			</svg>

			<p class="panel-note">
				The line is deterministic visual interpolation. Exact measured concentrations, intervals,
				methods, samples, and limits are kept in the evidence card and table below.
			</p>
		</section>
	</div>

	<section class="focus-card" aria-labelledby="focus-card-title">
		<div class="focus-heading">
			<div>
				<p>Evidence and focus card</p>
				<h3 id="focus-card-title">{profile.commonName}: what the sources actually report</h3>
			</div>
			<div class="current-signal">
				<span>At the scrubber</span>
				<strong>{signal.toFixed(2)} relative</strong>
				<em>schematic</em>
			</div>
		</div>

		<div class="evidence-grid">
			<dl class="measurements">
				{#each rows as item (rowKey(item))}
					<div>
						<dt>{item.label}</dt>
						<dd>
							<strong>{item.display}</strong>
							<span>{formatEvidenceStatus(item.evidence.status)}</span>
							<small>{item.evidence.note}</small>
						</dd>
					</div>
				{/each}
			</dl>

			<div class="method-card">
				<h4>Method and sample</h4>
				<p><strong>Method.</strong> {profile.methodSummary}</p>
				<p><strong>Sample.</strong> {profile.sampleSummary}</p>
				<h4>Limitations</h4>
				<ul>
					{#each profile.caveats as caveat (caveat)}
						<li>{caveat}</li>
					{/each}
				</ul>
			</div>
		</div>

		<details class="source-drawer">
			<summary>Open source drawer for {profile.commonName}</summary>
			<ol>
				{#each sources as item (`${item.sourceUrl}-${item.sourceLabel}`)}
					<li>
						{#if item.sourceUrl.startsWith('https://')}
							<a href={item.sourceUrl} rel="external">{item.sourceLabel}</a>
						{:else}
							<a href="#fertilization-calcium-method">{item.sourceLabel}</a>
						{/if}
						<span>{formatEvidenceStatus(item.status)}</span>
						{#if item.method}<p><strong>Method:</strong> {item.method}</p>{/if}
						{#if item.sample}<p><strong>Sample:</strong> {item.sample}</p>{/if}
						{#if item.note}<p><strong>Note:</strong> {item.note}</p>{/if}
					</li>
				{/each}
			</ol>
		</details>
	</section>

	<section class="event-strip" aria-labelledby="event-strip-title">
		<div>
			<p>Orientation only · not to scale</p>
			<h3 id="event-strip-title">A compact downstream sequence</h3>
		</div>
		<ol>
			{#each ['calcium signal', 'cortical reaction', 'meiotic completion', 'pronuclei', 'first mitosis'] as event, index (event)}
				<li class:active={index === activeEventIndex} class:passed={index < activeEventIndex}>
					<span>{index + 1}</span><strong>{event}</strong>
				</li>
			{/each}
		</ol>
		<p class="event-note">
			The order is a compact mammalian orientation strip. Exact timing, blocks to polyspermy, and
			cell-cycle details vary across species; this strip is not generated from the trace above.
		</p>
	</section>

	<section class="table-alternative" aria-labelledby="calcium-table-title">
		<div class="table-heading">
			<p>Text and table alternative</p>
			<h3 id="calcium-table-title">The evidence without animation</h3>
		</div>
		<div class="table-scroll">
			<table>
				<caption>
					Published summaries remain distinct from derived conversions and schematic viewing
					windows.
				</caption>
				<thead>
					<tr>
						<th scope="col">Species</th>
						<th scope="col">Pattern</th>
						<th scope="col">Reported or derived values</th>
						<th scope="col">Method and boundary</th>
						<th scope="col">Source</th>
					</tr>
				</thead>
				<tbody>
					{#each calciumProfiles as candidate (candidate.id)}
						{@const candidateSources = externalSources(candidate)}
						<tr>
							<th scope="row">
								<strong>{candidate.commonName}</strong><em>{candidate.scientificName}</em>
							</th>
							<td>{patternLabel(candidate)}</td>
							<td>{summaryValues(candidate) || 'No absolute amplitude encoded.'}</td>
							<td>{candidate.methodSummary} {candidate.caveats[0]}</td>
							<td>
								<ul class="table-source-list">
									{#each candidateSources as source (source.sourceUrl)}
										<li>
											<a href={source.sourceUrl} rel="external">{source.sourceLabel}</a>
										</li>
									{/each}
								</ul>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<noscript>
		<style>
			.calcium-atlas .controls,
			.calcium-atlas .transport {
				display: none !important;
			}
		</style>
		<p class="noscript-note">
			JavaScript is disabled. The initial human poster state and the complete evidence table remain
			available; playback and species switching are unavailable.
		</p>
	</noscript>

	<p class="sr-only" aria-live="polite">{liveMessage}</p>

	<figcaption>
		Figure: original SVG egg cross-section and deterministic time-series interpolation. Actual-time
		mode retains species-specific biological units while replay is visibly accelerated; normalized
		mode uses a declared 0–100% comparison scale.
	</figcaption>
</figure>

<style>
	.calcium-atlas {
		--signal: var(--essay-ink, var(--accent));
		--signal-soft: color-mix(in oklab, var(--signal) 16%, transparent);
		--signal-medium: color-mix(in oklab, var(--signal) 48%, transparent);
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		box-sizing: border-box;
		width: min(90rem, calc(100vw - 1.5rem));
		margin-block: 2.5rem;
		transform: translateX(-50%);
		border: 1px solid var(--rule);
		border-radius: 1rem;
		background: var(--paper);
		box-shadow: 0 1.5rem 4rem color-mix(in oklab, var(--ink) 12%, transparent);
		color: var(--ink);
		font-family: var(--font-sans, sans-serif);
	}

	.calcium-atlas *,
	.calcium-atlas *::before,
	.calcium-atlas *::after {
		box-sizing: border-box;
	}

	.atlas-heading,
	.controls,
	.transport,
	.panel-heading,
	.focus-heading,
	.chart-legend,
	.species-row,
	.transport-buttons {
		display: flex;
		align-items: center;
	}

	.atlas-heading {
		justify-content: space-between;
		gap: 2rem;
		padding: 1.35rem 1.5rem;
	}

	.atlas-heading > div:first-child {
		max-width: 58rem;
	}

	.eyebrow,
	.atlas-heading h2,
	.deck,
	.pattern-stamp span,
	.pattern-stamp strong,
	.pattern-stamp em,
	.panel-heading p,
	.panel-heading h3,
	.panel-note,
	.focus-heading p,
	.focus-heading h3,
	.current-signal span,
	.current-signal strong,
	.current-signal em,
	.method-card h4,
	.method-card p,
	.event-strip p,
	.event-strip h3,
	.table-heading p,
	.table-heading h3,
	figcaption,
	.noscript-note {
		margin: 0;
	}

	.eyebrow,
	.panel-heading p,
	.focus-heading p,
	.event-strip > div > p,
	.table-heading p {
		color: var(--signal);
		font: 750 0.68rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.atlas-heading h2 {
		margin-top: 0.35rem;
		font: 760 clamp(1.5rem, 3vw, 2.55rem) / 1.05 var(--font-serif, Georgia, serif);
		letter-spacing: -0.025em;
	}

	.deck {
		max-width: 52rem;
		margin-top: 0.55rem;
		color: var(--ink-muted);
		font: 1rem/1.55 var(--font-serif, Georgia, serif);
	}

	.pattern-stamp {
		display: grid;
		min-width: 11rem;
		gap: 0.2rem;
		border-left: 3px solid var(--signal);
		padding-left: 0.8rem;
	}

	.pattern-stamp span,
	.pattern-stamp em {
		color: var(--ink-muted);
		font-size: 0.72rem;
	}

	.pattern-stamp span {
		font-family: var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.pattern-stamp strong {
		font-size: 1rem;
	}

	.pattern-stamp em {
		font-family: var(--font-serif, Georgia, serif);
	}

	.disclosure {
		display: grid;
		gap: 0.15rem;
		border-block: 1px solid var(--rule);
		background: var(--signal-soft);
		padding: 0.65rem 1.5rem;
		font-size: 0.77rem;
		line-height: 1.45;
	}

	.disclosure span {
		color: var(--ink-muted);
	}

	.controls {
		align-items: end;
		gap: 1rem;
		padding: 1rem 1.5rem;
	}

	.species-control {
		flex: 1 1 24rem;
	}

	.compare-control {
		flex: 0 1 17rem;
	}

	.species-control,
	.compare-control {
		display: grid;
		gap: 0.35rem;
	}

	.species-control > label,
	.compare-control > label,
	.mode-control legend,
	.scrubber label {
		color: var(--ink-muted);
		font: 750 0.68rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.species-row {
		gap: 0.35rem;
	}

	select,
	button {
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.5rem;
		background: var(--paper-raised);
		color: var(--ink);
		font: 720 0.78rem/1.15 var(--font-sans, sans-serif);
	}

	select {
		width: 100%;
		padding: 0.55rem 2rem 0.55rem 0.65rem;
	}

	button {
		padding: 0.55rem 0.75rem;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: var(--ink);
	}

	button:focus-visible,
	select:focus-visible,
	input:focus-visible,
	summary:focus-visible,
	a:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	button:disabled,
	select:disabled {
		cursor: not-allowed;
		opacity: 0.52;
	}

	.mode-control {
		display: flex;
		flex: 0 0 auto;
		gap: 0.25rem;
		margin: 0;
		border: 0;
		padding: 0;
	}

	.mode-control legend {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.mode-control button.active,
	button.primary {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--paper-raised);
	}

	.compare-control small {
		color: var(--ink-faint);
		font-size: 0.66rem;
		line-height: 1.3;
	}

	.transport {
		align-items: end;
		gap: 1rem;
		border-top: 1px solid var(--rule);
		background: var(--paper-soft);
		padding: 0.75rem 1.5rem;
	}

	.transport-buttons {
		gap: 0.35rem;
	}

	.scrubber {
		display: grid;
		flex: 1;
		gap: 0.25rem;
	}

	.scrubber strong {
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		text-transform: none;
	}

	.scrubber input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--signal);
	}

	.transport > p {
		max-width: 25rem;
		margin: 0;
		color: var(--ink-muted);
		font-size: 0.68rem;
		line-height: 1.4;
	}

	.motion-note,
	.noscript-note {
		border-top: 1px solid var(--rule);
		border-left: 4px solid var(--signal);
		background: var(--paper-raised);
		padding: 0.65rem 1rem;
		color: var(--ink-muted);
		font-size: 0.74rem;
		line-height: 1.45;
	}

	.synchronised-panels {
		display: grid;
		grid-template-columns: minmax(19rem, 0.8fr) minmax(31rem, 1.45fr);
		border-top: 1px solid var(--rule);
	}

	.egg-panel,
	.chart-panel {
		min-width: 0;
		padding: 1rem;
	}

	.egg-panel {
		border-right: 1px solid var(--rule);
		background: var(--paper-soft);
	}

	.chart-panel {
		background: var(--paper-raised);
	}

	.panel-heading,
	.focus-heading {
		justify-content: space-between;
		gap: 1rem;
	}

	.panel-heading h3,
	.focus-heading h3,
	.event-strip h3,
	.table-heading h3 {
		margin-top: 0.2rem;
		font: 760 1.08rem/1.2 var(--font-serif, Georgia, serif);
	}

	.panel-heading output {
		max-width: 18rem;
		color: var(--ink-muted);
		font: 700 0.66rem/1.35 var(--font-mono, ui-monospace, monospace);
		text-align: right;
	}

	.egg-svg,
	.trace-svg {
		display: block;
		width: 100%;
		height: auto;
	}

	.egg-svg {
		max-height: 24rem;
		margin-top: 0.45rem;
	}

	.zona,
	.cytoplasm {
		stroke: var(--ink-muted);
		vector-effect: non-scaling-stroke;
	}

	.zona {
		fill: none;
		stroke-width: 10;
		stroke-opacity: 0.28;
	}

	.cytoplasm {
		fill: var(--paper-raised);
		stroke-width: 1.5;
	}

	.calcium-field {
		fill: var(--signal);
	}

	.whole-cell-ring {
		fill: none;
		stroke: var(--signal);
		stroke-width: 1.5;
		stroke-dasharray: 5 5;
		opacity: 0.7;
		vector-effect: non-scaling-stroke;
	}

	.wavefront {
		stroke: var(--ink);
		stroke-width: 2;
		stroke-dasharray: 4 4;
		vector-effect: non-scaling-stroke;
	}

	.er-network path,
	.sperm-tail {
		fill: none;
		stroke: var(--ink-muted);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.er-network path {
		stroke-dasharray: 2 3;
		opacity: 0.72;
	}

	.sperm-head,
	.granules circle {
		fill: var(--ink);
	}

	.granules circle {
		opacity: 0.68;
	}

	.sperm-label,
	.front-label,
	.egg-label {
		fill: var(--ink-muted);
		font: 9px var(--font-mono, ui-monospace, monospace);
	}

	.front-label {
		fill: var(--ink);
		font-weight: 700;
	}

	.chart-legend {
		flex-wrap: wrap;
		gap: 0.55rem 1rem;
		margin-top: 0.55rem;
		color: var(--ink-muted);
		font-size: 0.7rem;
	}

	.chart-legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.chart-legend i {
		display: inline-block;
		width: 1.5rem;
		border-top: 3px solid var(--signal);
	}

	.chart-legend .comparison-line {
		border-top: 2px dashed var(--ink);
	}

	.trace-svg {
		margin-top: 0.35rem;
	}

	.grid-line,
	.tick-mark,
	.axis,
	.elapsed-guide {
		stroke: var(--rule);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.axis {
		stroke: var(--ink-muted);
	}

	.elapsed-guide {
		stroke: var(--ink);
		stroke-dasharray: 3 4;
	}

	.trace {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	.primary-trace {
		stroke: var(--signal);
		stroke-width: 3;
	}

	.comparison-trace {
		stroke: var(--ink);
		stroke-width: 2;
		stroke-dasharray: 7 5;
	}

	.elapsed-dot {
		fill: var(--paper-raised);
		stroke: var(--ink);
		stroke-width: 2.5;
		vector-effect: non-scaling-stroke;
	}

	.axis-tick,
	.axis-title {
		fill: var(--ink-muted);
		font: 10px var(--font-mono, ui-monospace, monospace);
	}

	.axis-title {
		font-weight: 700;
	}

	.panel-note {
		border-left: 3px solid var(--signal);
		padding-left: 0.6rem;
		color: var(--ink-muted);
		font-size: 0.7rem;
		line-height: 1.45;
	}

	.focus-card,
	.event-strip,
	.table-alternative {
		border-top: 1px solid var(--rule);
		padding: 1.1rem 1.25rem;
	}

	.focus-card {
		background: var(--paper);
	}

	.current-signal {
		display: grid;
		justify-items: end;
		gap: 0.08rem;
	}

	.current-signal span,
	.current-signal em {
		color: var(--ink-muted);
		font: 0.64rem/1.2 var(--font-mono, ui-monospace, monospace);
		text-transform: uppercase;
	}

	.current-signal strong {
		font: 760 1.25rem/1.1 var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.evidence-grid {
		display: grid;
		grid-template-columns: minmax(27rem, 1.25fr) minmax(20rem, 0.75fr);
		gap: 1rem;
		margin-top: 0.85rem;
	}

	.measurements {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		margin: 0;
	}

	.measurements > div,
	.method-card {
		border: 1px solid var(--rule);
		border-radius: 0.6rem;
		background: var(--paper-raised);
		padding: 0.7rem;
	}

	.measurements dt {
		color: var(--ink-muted);
		font: 700 0.64rem/1.2 var(--font-mono, ui-monospace, monospace);
		text-transform: uppercase;
	}

	.measurements dd {
		display: grid;
		gap: 0.18rem;
		margin: 0.25rem 0 0;
	}

	.measurements dd strong {
		font: 760 0.92rem/1.2 var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.measurements dd span,
	.source-drawer li > span {
		width: fit-content;
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 0.12rem 0.35rem;
		color: var(--ink-muted);
		font: 700 0.56rem/1.2 var(--font-mono, ui-monospace, monospace);
		text-transform: uppercase;
	}

	.measurements dd small {
		color: var(--ink-muted);
		font-size: 0.66rem;
		line-height: 1.38;
	}

	.method-card h4 {
		font: 760 0.78rem/1.2 var(--font-sans, sans-serif);
	}

	.method-card h4:not(:first-child) {
		margin-top: 0.85rem;
	}

	.method-card p,
	.method-card li {
		color: var(--ink-muted);
		font-size: 0.7rem;
		line-height: 1.5;
	}

	.method-card p {
		margin-top: 0.4rem;
	}

	.method-card ul {
		margin: 0.4rem 0 0;
		padding-left: 1.1rem;
	}

	.source-drawer {
		margin-top: 0.75rem;
		border-top: 1px solid var(--rule);
		padding-top: 0.65rem;
	}

	.source-drawer summary {
		min-height: 2.75rem;
		width: fit-content;
		cursor: pointer;
		color: var(--ink);
		font: 740 0.75rem/2.75rem var(--font-sans, sans-serif);
	}

	.source-drawer ol {
		display: grid;
		gap: 0.65rem;
		margin: 0.4rem 0 0;
		padding-left: 1.4rem;
	}

	.source-drawer li {
		padding-left: 0.2rem;
		font-size: 0.7rem;
		line-height: 1.45;
	}

	.source-drawer li > a {
		margin-right: 0.45rem;
		color: var(--ink);
		font-weight: 750;
		text-underline-offset: 0.18rem;
	}

	.source-drawer li p {
		margin: 0.2rem 0 0;
		color: var(--ink-muted);
	}

	.event-strip {
		background: var(--paper-soft);
	}

	.event-strip ol {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		margin: 0.8rem 0 0;
		padding: 0;
		list-style: none;
	}

	.event-strip li {
		position: relative;
		display: grid;
		min-width: 0;
		gap: 0.25rem;
		border-top: 2px solid var(--rule);
		padding: 0.7rem 0.45rem 0;
		color: var(--ink-muted);
	}

	.event-strip li:not(:last-child)::after {
		position: absolute;
		top: -0.65rem;
		right: -0.25rem;
		content: '→';
		color: var(--ink-faint);
	}

	.event-strip li span {
		display: grid;
		width: 1.45rem;
		height: 1.45rem;
		place-items: center;
		border: 1px solid var(--control-border);
		border-radius: 50%;
		font: 700 0.62rem/1 var(--font-mono, ui-monospace, monospace);
	}

	.event-strip li strong {
		font-size: 0.7rem;
		line-height: 1.3;
	}

	.event-strip li.passed,
	.event-strip li.active {
		border-color: var(--signal);
		color: var(--ink);
	}

	.event-strip li.active span {
		border-color: var(--ink);
		background: var(--ink);
		color: var(--paper-raised);
	}

	.event-strip .event-note {
		margin-top: 0.75rem;
		color: var(--ink-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}

	.table-alternative {
		background: var(--paper-raised);
	}

	.table-scroll {
		overflow-x: auto;
		margin-top: 0.75rem;
	}

	table {
		width: 100%;
		min-width: 64rem;
		border-collapse: collapse;
		font-size: 0.68rem;
		line-height: 1.42;
	}

	caption {
		padding-bottom: 0.5rem;
		color: var(--ink-muted);
		text-align: left;
	}

	th,
	td {
		border-bottom: 1px solid var(--rule);
		padding: 0.65rem;
		vertical-align: top;
		text-align: left;
	}

	thead th {
		background: var(--paper-soft);
		font: 750 0.62rem/1.3 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	tbody th {
		min-width: 10rem;
	}

	tbody th strong,
	tbody th em {
		display: block;
	}

	tbody th em {
		margin-top: 0.15rem;
		color: var(--ink-muted);
		font-family: var(--font-serif, Georgia, serif);
		font-weight: 400;
	}

	table a {
		color: var(--ink);
		font-weight: 700;
		text-underline-offset: 0.16rem;
	}

	.table-source-list {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	figcaption {
		border-top: 1px solid var(--rule);
		padding: 0.75rem 1.25rem;
		color: var(--ink-muted);
		font: 0.68rem/1.45 var(--font-serif, Georgia, serif);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 62rem) {
		.controls {
			flex-wrap: wrap;
		}

		.compare-control {
			flex: 1 1 18rem;
		}

		.transport {
			align-items: stretch;
			flex-wrap: wrap;
		}

		.transport > p {
			max-width: none;
			flex: 1 1 100%;
		}

		.synchronised-panels,
		.evidence-grid {
			grid-template-columns: 1fr;
		}

		.egg-panel {
			border-right: 0;
			border-bottom: 1px solid var(--rule);
		}

		.egg-svg {
			max-height: 19rem;
		}
	}

	@media (max-width: 46rem) {
		.calcium-atlas {
			width: calc(100vw - 1rem);
			border-right: 0;
			border-left: 0;
			border-radius: 0;
		}

		.atlas-heading {
			align-items: stretch;
			flex-direction: column;
			gap: 1rem;
			padding: 1rem;
		}

		.pattern-stamp {
			min-width: 0;
		}

		.disclosure,
		.controls,
		.transport,
		.focus-card,
		.event-strip,
		.table-alternative {
			padding-right: 0.85rem;
			padding-left: 0.85rem;
		}

		.controls {
			align-items: stretch;
			flex-direction: column;
		}

		.species-control,
		.compare-control {
			width: 100%;
			flex: 0 0 auto;
		}

		.mode-control,
		.mode-control button {
			flex: 1;
		}

		.transport-buttons {
			align-items: stretch;
		}

		.transport-buttons button {
			flex: 1;
		}

		.transport,
		.panel-heading,
		.focus-heading {
			align-items: stretch;
			flex-direction: column;
		}

		.panel-heading output,
		.current-signal {
			justify-items: start;
			max-width: none;
			text-align: left;
		}

		.measurements {
			grid-template-columns: 1fr;
		}

		.event-strip ol {
			grid-template-columns: 1fr;
			gap: 0.25rem;
		}

		.event-strip li {
			grid-template-columns: 1.6rem 1fr;
			align-items: center;
			border-top: 0;
			border-left: 2px solid var(--rule);
			padding: 0.3rem 0 0.3rem 0.6rem;
		}

		.event-strip li:not(:last-child)::after {
			display: none;
		}

		.chart-legend {
			align-items: flex-start;
			flex-direction: column;
		}
	}

	@media (max-width: 23rem) {
		.species-row {
			display: grid;
			grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
		}

		.mode-control {
			flex-direction: column;
		}

		.deck {
			font-size: 0.9rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.calcium-atlas *,
		.calcium-atlas *::before,
		.calcium-atlas *::after {
			scroll-behavior: auto !important;
			animation-duration: 0.001ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.001ms !important;
		}
	}

	@media (forced-colors: active) {
		.calcium-atlas,
		.measurements > div,
		.method-card,
		select,
		button,
		.measurements dd span {
			border-color: CanvasText;
		}

		.mode-control button.active,
		button.primary,
		.event-strip li.active span {
			background: Highlight;
			color: HighlightText;
		}

		.primary-trace,
		.comparison-trace,
		.wavefront,
		.er-network path,
		.sperm-tail,
		.grid-line,
		.tick-mark,
		.axis,
		.elapsed-guide {
			stroke: CanvasText;
		}

		.calcium-field,
		.sperm-head,
		.granules circle {
			fill: Highlight;
		}
	}

	@media print {
		.calcium-atlas {
			left: auto;
			width: 100%;
			transform: none;
			box-shadow: none;
		}

		.controls,
		.transport,
		.motion-note,
		.source-drawer {
			display: none;
		}
	}
</style>
