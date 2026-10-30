<script lang="ts">
	import {
		DEFAULT_SEED,
		MEASURES,
		MEASURE_ORDER,
		generatePatient,
		getObservation,
		patientToCsv,
		patientToJson,
		responseSummary,
		type MeasureId
	} from '$lib/visualizations/patient-x/model';

	const uid = $props.id();
	let patient = $state(generatePatient(DEFAULT_SEED));
	let selectedIndex = $state(3);
	let exportStatus = $state('');
	const selected = $derived(patient.assessments[selectedIndex]);
	const previous = $derived(patient.assessments[selectedIndex - 1]);
	const observation = $derived(getObservation(patient, selectedIndex));
	const shortDate = (date: string) =>
		new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
			new Date(`${date}T12:00:00Z`)
		);
	const fullDate = (date: string) =>
		new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${date}T12:00:00Z`));
	const signed = (value: number) =>
		value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
	const pointX = (index: number) => ((index + 0.5) / patient.assessments.length) * 600;
	const pointY = (id: MeasureId, total: number) => 96 - (total / MEASURES[id].scoreMax) * 80;
	const points = (id: MeasureId) =>
		patient.assessments
			.map((assessment, index) => `${pointX(index)},${pointY(id, assessment.measures[id].total)}`)
			.join(' ');
	const scatterX = (total: number) => 42 + (total / 27) * 252;
	const scatterY = (total: number) => 205 - (total / 20) * 175;
	const questionText: Record<MeasureId, string> = {
		phq9: 'Depressive symptoms',
		asrm: 'Elevated mood and activity',
		who5: 'Sense of well-being'
	};
	const directionText: Record<MeasureId, string> = {
		phq9: 'Higher = more depressive symptoms',
		asrm: 'Higher = more symptoms on this scale',
		who5: 'Higher = better reported well-being'
	};

	function newExample() {
		patient = generatePatient((patient.seed + 104729) >>> 0);
		exportStatus = '';
	}

	function download(format: 'json' | 'csv') {
		const text = format === 'json' ? patientToJson(patient) : patientToCsv(patient);
		const blob = new Blob([text], {
			type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8'
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `patient-x-fictional-${patient.seed}.${format}`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		exportStatus = `Fictional answers and scores downloaded as ${format.toUpperCase()}.`;
	}
</script>

<section
	class="patient-x not-prose"
	data-patient-x
	data-tts-exclude
	aria-labelledby={`${uid}-title`}
>
	<header class="introduction">
		<p class="eyebrow">Depression and bipolar disorder</p>
		<h1 id={`${uid}-title`}>What the scores leave out</h1>
		<p>
			Patient X is a fictional adult. Three questionnaires, 19 answers, six check-ins over 12 weeks.
		</p>
		<p class="limitation">
			Fictional data for understanding questionnaires. These charts cannot diagnose a person.
		</p>
	</header>

	<div class="controls">
		<label class="assessment-control" for={`${uid}-assessment`}>
			<span>Look at a check-in</span>
			<select id={`${uid}-assessment`} bind:value={selectedIndex}>
				{#each patient.assessments as assessment, index (assessment.id)}
					<option value={index}>Week {assessment.week} · {shortDate(assessment.date)}</option>
				{/each}
			</select>
		</label>
		<button class="new-example" onclick={newExample}
			>New fictional example <span aria-hidden="true">↻</span></button
		>
	</div>

	<div class="timeline" aria-label="Three separate score timelines on the same dates">
		{#each MEASURE_ORDER as id (id)}
			{@const measure = MEASURES[id]}
			{@const response = selected.measures[id]}
			<div class={`measure-track ${id}`}>
				<div class="track-heading">
					<div>
						<h3>{questionText[id]} <span>{measure.name}</span></h3>
						<p>{directionText[id]}</p>
					</div>
					<p class="score"><strong>{response.total}</strong><span> / {measure.scoreMax}</span></p>
				</div>
				<div class="chart-row">
					<div class="y-labels" aria-hidden="true">
						<span>{measure.scoreMax}</span><span>0</span>
					</div>
					<div class="plot">
						<svg
							viewBox="0 0 600 112"
							preserveAspectRatio="none"
							role="img"
							aria-labelledby={`${uid}-${id}-chart-title`}
						>
							<title id={`${uid}-${id}-chart-title`}
								>{questionText[id]} over six check-ins. Selected week {selected.week}: {response.total}
								out of {measure.scoreMax}. All values are also in the data table below.</title
							>
							{#each [16, 56, 96] as y (y)}
								<line
									class="grid-line"
									x1="0"
									x2="600"
									y1={y}
									y2={y}
									vector-effect="non-scaling-stroke"
								/>
							{/each}
							<line
								class="selection-line"
								x1={pointX(selectedIndex)}
								x2={pointX(selectedIndex)}
								y1="9"
								y2="103"
								vector-effect="non-scaling-stroke"
							/>
							<polyline
								class="score-line"
								points={points(id)}
								fill="none"
								vector-effect="non-scaling-stroke"
							/>
						</svg>
						<div class="point-controls">
							{#each patient.assessments as assessment, index (assessment.id)}
								<button
									onclick={() => (selectedIndex = index)}
									aria-pressed={selectedIndex === index}
									aria-label={`Week ${assessment.week}, ${shortDate(assessment.date)}: ${measure.name} ${assessment.measures[id].total} out of ${measure.scoreMax}. Select this check-in.`}
									><span
										class="point-dot"
										style={`top: ${(pointY(id, assessment.measures[id].total) / 112) * 100}%`}
										aria-hidden="true"
									></span><span class="sr-only">Week {assessment.week}</span></button
								>
							{/each}
						</div>
					</div>
				</div>
				<p class="recall">
					Answers cover {shortDate(response.windowStart)}–{shortDate(response.windowEnd)} · {measure.recallDays}
					days
				</p>
			</div>
		{/each}
		<div class="time-axis" aria-hidden="true">
			{#each patient.assessments as assessment, index (assessment.id)}
				<span class:active-date={selectedIndex === index}
					>W{assessment.week}<small>{shortDate(assessment.date)}</small></span
				>
			{/each}
		</div>
		<p class="chart-note">
			The lines connect check-ins. They do not show what happened on the days between them. Each
			measure keeps its own scale.
		</p>
	</div>

	<div class="observation" aria-live="polite" aria-atomic="true">
		<p class="eyebrow">Week {selected.week} · {fullDate(selected.date)}</p>
		<h3>{observation.headline}</h3>
		<p>{observation.detail}</p>
		{#if previous}
			<p class="change-summary">
				<span>Since week {previous.week}:</span>
				{#each observation.changes as change, index (change.id)}<span
						>{change.label} <strong>{signed(change.delta)}</strong>{index <
						observation.changes.length - 1
							? ' · '
							: ''}</span
					>{/each}
			</p>
		{:else}
			<p class="change-summary">
				This is the first check-in. There is no earlier score to compare.
			</p>
		{/if}
	</div>

	<details class="answers">
		<summary
			><span>See the 19 answers</span><small>Week {selected.week} · what made these scores</small
			></summary
		>
		<div class="details-body">
			<p class="detail-intro">
				These are generated answers, not a form to fill in. Bars show item scores; the change is
				from {previous ? `week ${previous.week}` : 'no previous check-in'}.
			</p>
			{#each MEASURE_ORDER as id (id)}
				{@const measure = MEASURES[id]}
				{@const response = selected.measures[id]}
				<section class={`answer-group ${id}`} aria-labelledby={`${uid}-${id}-answers`}>
					<h3 id={`${uid}-${id}-answers`}>{measure.name}: {questionText[id].toLowerCase()}</h3>
					<p class="window-label">
						{shortDate(response.windowStart)}–{shortDate(response.windowEnd)} · {measure.recallDays}-day
						recall
					</p>
					<ol>
						{#each measure.items as item, index (item.id)}
							{@const value = response.answers[index]}
							<li>
								<div class="answer-label">
									<span>{item.label}</span><strong>{value}<small>/{measure.itemMax}</small></strong>
								</div>
								<div class="answer-bar" aria-hidden="true">
									<span style={`width: ${(value / measure.itemMax) * 100}%`}></span>
								</div>
								<div class="answer-detail">
									<span>{responseSummary(id, index, value)}</span><span
										>{previous
											? `Change: ${signed(value - previous.measures[id].answers[index])}`
											: 'First check-in'}</span
									>
								</div>
							</li>
						{/each}
					</ol>
					<p class="scoring-note">
						{id === 'who5'
							? `Item sum ${response.rawTotal} × 4 = ${response.total}/100. Higher means better reported well-being.`
							: `Item sum = ${response.total}/${measure.scoreMax}.`}
					</p>
					{#if id === 'asrm'}<p class="scoring-note">
							Brief explanatory labels; consult the linked form below for the original item-specific
							wording.
						</p>{/if}
				</section>
			{/each}
			{#if observation.selfHarmNote}<p class="care-note">{observation.selfHarmNote}</p>{/if}
		</div>
	</details>

	<details class="scatter-details">
		<summary
			><span>Do the two symptom scores move together?</span><small
				>A second view of the same six check-ins</small
			></summary
		>
		<div class="details-body">
			<p class="detail-intro">
				Moving right means more depressive symptoms. Moving up means a higher score for elevated
				mood and activity. A person can report both. This plot has no diagnostic zones.
			</p>
			<div class="scatter-wrap">
				<svg
					class="scatter"
					viewBox="0 0 320 245"
					role="img"
					aria-labelledby={`${uid}-scatter-title`}
				>
					<title id={`${uid}-scatter-title`}
						>Depressive symptoms on the horizontal axis, from zero to 27, and elevated mood and
						activity on the vertical axis, from zero to 20. Six fictional check-ins, with week {selected.week}
						highlighted. Dates and all values are available in the data table.</title
					>
					{#each [0, 10, 20] as value (value)}
						<line class="grid-line" x1="42" x2="294" y1={scatterY(value)} y2={scatterY(value)} />
						<text class="tick-label" x="33" y={scatterY(value) + 4} text-anchor="end">{value}</text>
					{/each}
					{#each [0, 9, 18, 27] as value (value)}
						<line class="grid-line" x1={scatterX(value)} x2={scatterX(value)} y1="30" y2="205" />
						<text class="tick-label" x={scatterX(value)} y="224" text-anchor="middle">{value}</text>
					{/each}
					<text class="axis-title" x="42" y="15">Elevated mood and activity · ASRM</text>
					<text class="axis-title" x="168" y="242" text-anchor="middle"
						>Depressive symptoms · PHQ-9</text
					>
					{#each patient.assessments as assessment (assessment.id)}
						<circle
							cx={scatterX(assessment.measures.phq9.total)}
							cy={scatterY(assessment.measures.asrm.total)}
							r="4.5"
						/>
					{/each}
					<circle
						class="scatter-selected"
						cx={scatterX(selected.measures.phq9.total)}
						cy={scatterY(selected.measures.asrm.total)}
						r="7"
					/>
					<text
						class="point-label"
						x={scatterX(selected.measures.phq9.total) + 9}
						y={scatterY(selected.measures.asrm.total) - 7}>W{selected.week}</text
					>
				</svg>
			</div>
			<div class="week-buttons" aria-label="Select a check-in in the second graph">
				{#each patient.assessments as assessment, index (assessment.id)}<button
						onclick={() => (selectedIndex = index)}
						aria-pressed={selectedIndex === index}>Week {assessment.week}</button
					>{/each}
			</div>
			<p class="chart-note">
				A dot is a whole questionnaire window, not a moment. PHQ-9 covers 14 days; ASRM covers 7.
				This association does not establish cause or confirm simultaneous symptoms. Equal scores
				share a position; choose a week to bring its dot forward.
			</p>
		</div>
	</details>

	<details class="data-details">
		<summary
			><span>Read the data as a table</span><small
				>Every check-in, with its exact dates and scores</small
			></summary
		>
		<div class="details-body">
			<!-- A scrollable data region needs keyboard focus so arrow keys can reveal its columns. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="table-scroll"
				tabindex="0"
				role="region"
				aria-label="Questionnaire scores and recall windows; scroll horizontally on small screens"
			>
				<table>
					<caption
						>Patient X · fictional example {patient.seed}. Scores remain in their original units.</caption
					>
					<thead
						><tr
							><th scope="col">Check-in</th><th scope="col">Measure</th><th scope="col"
								>Answer window</th
							><th scope="col">Score</th></tr
						></thead
					>
					<tbody>
						{#each patient.assessments as assessment, index (assessment.id)}
							{#each MEASURE_ORDER as id (id)}
								{@const response = assessment.measures[id]}
								<tr class:table-selected={selectedIndex === index}>
									<th scope="row"
										>Week {assessment.week}<small>{fullDate(assessment.date)}</small></th
									>
									<td>{MEASURES[id].name}</td><td
										>{shortDate(response.windowStart)}–{shortDate(response.windowEnd)}<small
											>{MEASURES[id].recallDays} days</small
										></td
									>
									<td
										>{response.total} / {MEASURES[id].scoreMax}{#if id === 'who5'}<small
												>Raw: {response.rawTotal} / 25</small
											>{/if}</td
									>
								</tr>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</details>

	<details class="method-details">
		<summary
			><span>How this example was made</span><small>Scoring, sources and downloads</small></summary
		>
		<div class="details-body methods">
			<p>
				The answers are generated together from an invented course of symptoms, with bounded random
				variation. The generator illustrates possible patterns; it is not a clinical simulation, a
				typical patient, or evidence about how often anything happens.
			</p>
			<p>
				The PHQ-9 question about thoughts of death or self-harm is deliberately held at zero in
				these examples. A zero here is a teaching choice, not evidence of safety in a real person.
			</p>
			<p>
				Every graph, the explanation and the downloads use the same answers. No combined “mental
				health score” is calculated. The example number reproduces the data.
			</p>
			<ul>
				{#each MEASURE_ORDER as id (id)}<li>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Allowlisted absolute links to questionnaire sources. -->
						<a href={MEASURES[id].sourceUrl}>{MEASURES[id].name}: source and scoring</a> · {MEASURES[
							id
						].recallDays}-day recall
					</li>{/each}
			</ul>
			<p>
				Nothing here asks for your answers or saves a health record. New examples and downloads are
				made in your browser.
			</p>
			<p class="seed">Example {patient.seed} · model {patient.version}</p>
			<div class="export-buttons">
				<button onclick={() => download('csv')}>Download CSV</button><button
					onclick={() => download('json')}>Download JSON</button
				>
			</div>
			<p class="export-status" role="status">{exportStatus}</p>
		</div>
	</details>
</section>

<style>
	.patient-x {
		--px-paper: var(--background, #fbf9f3);
		--px-ink: var(--foreground, #242728);
		--px-muted: var(--muted-foreground, #62615c);
		--px-rule: var(--border, #d8d5cc);
		--px-soft: var(--muted, #f0eee7);
		--px-phq: #a14b43;
		--px-asrm: #876510;
		--px-who: #25766e;
		color: var(--px-ink);
		background: var(--px-paper);
		border-block: 2px solid var(--px-ink);
		margin: 0 0 2rem;
		padding: 1.6rem 1.25rem 0;
		font-family: 'Roboto Variable', system-ui, sans-serif;
		font-size: 1rem;
		line-height: 1.55;
		text-align: left;
		isolation: isolate;
	}
	:global(.dark) .patient-x,
	:global([data-theme='night']) .patient-x {
		--px-phq: #e49a91;
		--px-asrm: #e4bd62;
		--px-who: #80c3b8;
	}
	.patient-x *,
	.patient-x *::before,
	.patient-x *::after {
		box-sizing: border-box;
	}
	.patient-x p,
	.patient-x h1,
	.patient-x h3 {
		margin: 0;
	}
	.introduction h1 {
		font-size: clamp(1.45rem, 3vw, 1.9rem);
		font-weight: 700;
		line-height: 1.2;
		margin: 0.35rem 0 0.8rem;
		letter-spacing: -0.025em;
	}
	.introduction > p:not(.eyebrow) {
		max-width: 66ch;
	}
	.eyebrow {
		color: var(--px-muted);
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.065em;
		text-transform: uppercase;
	}
	.introduction .limitation {
		margin-top: 0.7rem;
		font-size: 0.9rem;
		color: var(--px-muted);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 1.4rem 0 1.2rem;
	}
	.assessment-control {
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.patient-x button,
	.patient-x select {
		font: inherit;
		font-size: 0.9rem;
		color: var(--px-ink);
		border: 1px solid var(--px-rule);
		background: var(--px-paper);
		border-radius: 0.3rem;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
	}
	.patient-x select {
		min-width: 215px;
		padding-right: 2rem;
	}
	.patient-x button:hover {
		background: var(--px-soft);
		border-color: var(--px-ink);
	}
	.patient-x :is(button, select, summary, a, [tabindex]):focus-visible {
		outline: 3px solid var(--px-ink);
		outline-offset: 3px;
	}
	.new-example {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	.new-example span {
		font-size: 1.3rem;
		line-height: 1;
	}
	.measure-track {
		padding: 0.9rem 0 0.8rem;
		border-top: 1px solid var(--px-rule);
	}
	.phq9 {
		--measure-colour: var(--px-phq);
	}
	.asrm {
		--measure-colour: var(--px-asrm);
	}
	.who5 {
		--measure-colour: var(--px-who);
	}
	.track-heading {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: 0.8rem;
	}
	.track-heading h3 {
		font-size: 1rem;
		font-weight: 650;
		line-height: 1.35;
	}
	.track-heading h3 span {
		font-size: 0.77rem;
		color: var(--px-muted);
		margin-left: 0.4rem;
		font-weight: 500;
		white-space: nowrap;
	}
	.track-heading > div > p {
		font-size: 0.77rem;
		color: var(--px-muted);
		margin-top: 0.15rem;
	}
	.score {
		font-size: 0.8rem;
		white-space: nowrap;
		color: var(--px-muted);
		font-variant-numeric: tabular-nums;
	}
	.score strong {
		font-size: 1.55rem;
		line-height: 1;
		color: var(--measure-colour);
		font-weight: 700;
	}
	.chart-row {
		display: flex;
		height: 85px;
		margin-top: 0.25rem;
	}
	.y-labels {
		width: 28px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding-block: 5px 4px;
		font-size: 0.7rem;
		color: var(--px-muted);
		font-variant-numeric: tabular-nums;
	}
	.plot {
		flex: 1;
		min-width: 0;
		position: relative;
	}
	.plot svg {
		width: 100%;
		height: 100%;
		overflow: visible;
		display: block;
	}
	.grid-line {
		stroke: var(--px-rule);
		stroke-width: 1;
	}
	.selection-line {
		stroke: var(--px-ink);
		stroke-dasharray: 3 4;
		stroke-width: 1;
		opacity: 0.5;
	}
	.score-line {
		stroke: var(--measure-colour);
		stroke-width: 2.5;
		stroke-linejoin: round;
	}
	.point-controls {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
	}
	.point-controls button {
		position: relative;
		background: transparent;
		border: 0;
		border-radius: 0;
		padding: 0;
		min-width: 0;
		min-height: 44px;
	}
	.point-controls button:hover {
		background: color-mix(in srgb, var(--measure-colour) 7%, transparent);
	}
	.point-controls button:focus-visible {
		outline-offset: -3px;
	}
	.point-dot {
		position: absolute;
		left: 50%;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--px-paper);
		border: 2px solid var(--measure-colour);
		transform: translate(-50%, -50%);
	}
	.point-controls button[aria-pressed='true'] .point-dot {
		width: 14px;
		height: 14px;
		background: var(--measure-colour);
		border-color: var(--px-paper);
		box-shadow: 0 0 0 1px var(--measure-colour);
	}
	.recall {
		color: var(--px-muted);
		font-size: 0.73rem;
		margin: 0.1rem 0 0 28px !important;
	}
	.time-axis {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		margin-left: 28px;
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-size: 0.77rem;
		color: var(--px-muted);
	}
	.time-axis small {
		display: block;
		font-size: 0.68rem;
	}
	.time-axis .active-date {
		color: var(--px-ink);
		font-weight: 750;
	}
	.chart-note {
		color: var(--px-muted);
		font-size: 0.82rem;
		margin-top: 0.8rem !important;
	}
	.observation {
		margin: 1.25rem 0;
		padding: 1rem 1.1rem;
		background: var(--px-soft);
		border-left: 3px solid var(--px-ink);
	}
	.observation h3 {
		font-size: 1.12rem;
		line-height: 1.35;
		font-weight: 700;
		margin: 0.35rem 0 0.5rem;
	}
	.observation > p:not(.eyebrow) {
		font-size: 0.93rem;
	}
	.observation .change-summary {
		font-size: 0.8rem !important;
		margin-top: 0.7rem;
		color: var(--px-muted);
	}
	.change-summary > span:first-child {
		margin-right: 0.4rem;
	}
	details {
		border-top: 1px solid var(--px-rule);
	}
	summary {
		display: list-item;
		cursor: pointer;
		padding: 1rem 0.25rem;
		font-size: 0.95rem;
		font-weight: 600;
		list-style-position: inside;
	}
	summary small {
		display: block;
		margin: 0.15rem 0 0 1.15rem;
		font-size: 0.78rem;
		color: var(--px-muted);
		font-weight: 400;
	}
	summary:hover > span {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.details-body {
		padding: 0.25rem 0.25rem 1.4rem;
	}
	.detail-intro {
		font-size: 0.9rem;
		color: var(--px-muted);
		margin-bottom: 1.2rem !important;
	}
	.answer-group + .answer-group {
		margin-top: 1.6rem;
		padding-top: 1.3rem;
		border-top: 1px solid var(--px-rule);
	}
	.answer-group h3 {
		font-size: 1rem;
		font-weight: 700;
	}
	.window-label {
		font-size: 0.8rem;
		color: var(--px-muted);
		margin-top: 0.2rem !important;
	}
	.answer-group ol {
		list-style: none;
		margin: 1rem 0;
		padding: 0;
	}
	.answer-group li {
		margin-bottom: 1rem;
	}
	.answer-label {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		font-size: 0.9rem;
	}
	.answer-label strong {
		font-weight: 650;
		white-space: nowrap;
	}
	.answer-label small {
		font-size: 0.75rem;
		color: var(--px-muted);
		font-weight: 400;
	}
	.answer-bar {
		height: 6px;
		margin: 0.35rem 0;
		background: var(--px-soft);
		border-radius: 3px;
		overflow: hidden;
	}
	.answer-bar span {
		display: block;
		height: 100%;
		background: var(--measure-colour);
	}
	.answer-detail {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		font-size: 0.76rem;
		color: var(--px-muted);
	}
	.answer-detail > span:last-child {
		white-space: nowrap;
	}
	.scoring-note {
		font-size: 0.8rem;
		margin-top: 0.6rem !important;
		color: var(--px-muted);
	}
	.care-note {
		margin-top: 1.2rem !important;
		padding: 0.8rem 1rem;
		background: var(--px-soft);
		border-left: 3px solid var(--px-phq);
		font-size: 0.88rem;
	}
	.scatter-wrap {
		max-width: 560px;
		margin: 0 auto;
	}
	.scatter {
		width: 100%;
		height: auto;
		display: block;
		overflow: visible;
	}
	.scatter circle {
		fill: var(--px-paper);
		stroke: var(--px-ink);
		stroke-width: 1.5;
	}
	.scatter circle.scatter-selected {
		fill: var(--px-phq);
		stroke: var(--px-paper);
		stroke-width: 2;
	}
	.scatter .tick-label {
		fill: var(--px-muted);
		font-size: 10px;
	}
	.scatter .axis-title {
		fill: var(--px-ink);
		font-size: 11px;
	}
	.scatter .point-label {
		fill: var(--px-ink);
		font-size: 10px;
		paint-order: stroke;
		stroke: var(--px-paper);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.week-buttons,
	.export-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.week-buttons button {
		font-size: 0.8rem;
		flex: 1;
		white-space: nowrap;
	}
	.week-buttons button[aria-pressed='true'] {
		background: var(--px-ink);
		color: var(--px-paper);
		border-color: var(--px-ink);
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 480px;
		font-size: 0.83rem;
		font-variant-numeric: tabular-nums;
	}
	caption {
		text-align: left;
		font-size: 0.8rem;
		color: var(--px-muted);
		margin-bottom: 0.7rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.65rem 0.5rem;
		border-bottom: 1px solid var(--px-rule);
		vertical-align: top;
	}
	thead th {
		font-weight: 650;
	}
	tbody th {
		font-weight: 500;
	}
	td small,
	th small {
		display: block;
		color: var(--px-muted);
		font-size: 0.72rem;
		font-weight: 400;
	}
	.table-selected {
		background: var(--px-soft);
	}
	.methods {
		font-size: 0.9rem;
	}
	.methods p + p {
		margin-top: 0.8rem;
	}
	.methods ul {
		margin: 0.9rem 0;
		padding-left: 1.3rem;
	}
	.methods li + li {
		margin-top: 0.45rem;
	}
	.methods a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.seed {
		font-size: 0.77rem;
		color: var(--px-muted);
	}
	.export-status {
		font-size: 0.8rem;
		min-height: 1.2em;
		margin-top: 0.5rem !important;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 520px) {
		.patient-x {
			padding: 1.1rem 0.65rem 0;
			margin: 0 -0.15rem 1.5rem;
		}
		.controls {
			align-items: stretch;
		}
		.assessment-control {
			width: 100%;
		}
		.patient-x select {
			width: 100%;
		}
		.new-example {
			width: 100%;
			justify-content: space-between;
		}
		.track-heading h3 {
			font-size: 0.91rem;
		}
		.track-heading h3 span {
			display: block;
			margin: 0.1rem 0 0;
		}
		.track-heading > div > p {
			font-size: 0.7rem;
		}
		.score strong {
			font-size: 1.4rem;
		}
		.chart-row {
			height: 85px;
		}
		.recall {
			font-size: 0.68rem;
		}
		.observation {
			padding: 0.85rem;
		}
		.answer-detail {
			font-size: 0.72rem;
		}
		summary {
			font-size: 0.9rem;
		}
		.week-buttons button {
			min-width: 28%;
		}
	}
</style>
