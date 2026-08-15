<script lang="ts">
	type Forecaster = {
		targetAuc: number;
		calibrationIntercept: number;
		calibrationSlope: number;
	};

	type LabConfig = {
		seed: string;
		cohortSize: number;
		developmentEventRate: number;
		deploymentEventRate: number;
		clinician: Forecaster;
		model: Forecaster;
		sharedResidualCorrelation: number;
		clinicianWeight: number;
	};

	type Metrics = {
		eventCount: number;
		observedEventRate: number;
		brierScores: {
			clinician: number;
			model: number;
			ensemble: number;
			constantPrevalence: number;
		};
		meanPredictions: { clinician: number; model: number; ensemble: number };
		realizedAuc: { clinician: number | null; model: number | null; ensemble: number | null };
		ensembleGain: number;
		crossErrorTerm: number;
		weightedAverageLoss: number;
		diversityTerm: number;
		crossTermIdentityResidual: number;
		weightedAverageIdentityResidual: number;
	};

	type Bin = {
		index: number;
		count: number;
		eventCount: number;
		meanPrediction: number;
		eventRate: number;
		wilson95: { lower: number; upper: number };
	};

	type Calibration = { clinician: readonly Bin[]; model: readonly Bin[]; ensemble: readonly Bin[] };
	type CurvePoint = { clinicianWeight: number; brierScore: number };

	const omissions = [
		'Real clinical prediction',
		'Model training or retraining',
		'Missing-data imputation',
		'EHR or FHIR ingestion',
		'Patient upload or patient-level interpretation',
		'Decision thresholds, decision curves, or net-benefit analysis',
		'Treatment recommendations',
		'Survival analysis, censoring, or competing-risk analysis',
		'External validation',
		'Subgroup, equity, or fairness evaluation',
		'Workflow-impact testing',
		'Prospective monitoring',
		'Clinician-behaviour modelling',
		'General covariate or concept shift',
		'A causal simulation of hospital artifacts',
		'Statistical claims about actual clinicians or AI systems'
	];

	const series = [
		{ key: 'clinician', label: 'Clinician' },
		{ key: 'model', label: 'Model' },
		{ key: 'ensemble', label: 'Ensemble' }
	] as const;

	let {
		endpointTitle,
		config,
		metrics,
		calibration,
		weightCurve,
		onnewcohort
	}: {
		endpointTitle: string;
		config: LabConfig;
		metrics: Metrics;
		calibration: Calibration;
		weightCurve: readonly CurvePoint[];
		onnewcohort: () => void;
	} = $props();

	function metric(value: number | null, digits = 4): string {
		return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
	}

	function percent(value: number): string {
		return `${(value * 100).toFixed(1)}%`;
	}
</script>

<section
	class="disclosures"
	aria-label="Laboratory methods, metric definitions, chart data, and limitations"
>
	<details>
		<summary>
			<span><b>01</b> How this synthetic cohort works</span><i aria-hidden="true">+</i>
		</summary>
		<div class="content methods-content">
			<p>
				The declared endpoint is <strong>{endpointTitle}</strong>. A fixed seed creates
				{config.cohortSize.toLocaleString()} wholly synthetic records. Controls transform the same retained
				base draws, so changing only the ensemble weight cannot change either member’s forecast.
			</p>
			<dl class="settings-ledger">
				<div>
					<dt>Seed</dt>
					<dd><code>{config.seed}</code></dd>
				</div>
				<div>
					<dt>Development event rate</dt>
					<dd>{percent(config.developmentEventRate)}</dd>
				</div>
				<div>
					<dt>Deployment event rate</dt>
					<dd>{percent(config.deploymentEventRate)}</dd>
				</div>
				<div>
					<dt>Shared residual ρ</dt>
					<dd>{config.sharedResidualCorrelation.toFixed(2)}</dd>
				</div>
			</dl>

			<div class="equation-step">
				<h4>1 · Synthetic outcome</h4>
				<p class="equation"><var>Yᵢ</var> ∼ Bernoulli(<var>π</var><sub>deployment</sub>)</p>
				<p>
					In ordinary language: each fictional record receives a realized yes/no outcome using the
					configured deployment event rate. Conditional score sampling is a joint-distribution
					device; it does not mean a forecaster “saw the future”.
				</p>
			</div>

			<div class="equation-step">
				<h4>2 · Correlated hidden residuals</h4>
				<p class="equation">
					<var>ε</var><sub>H,i</sub> = <var>Z</var><sub>H,i</sub>;
					<var>ε</var><sub>A,i</sub> = <var>ρZ</var><sub>H,i</sub> + √(1 − <var>ρ</var>²)
					<var>Z</var><sub>A,i</sub>
				</p>
				<p>
					Two independent standard-normal draws are mixed so the hidden clinician and model score
					residuals have the requested conditional dependence. This is not an observed clinical
					correlation.
				</p>
			</div>

			<div class="equation-step">
				<h4>3 · Discrimination and probability</h4>
				<p class="equation">
					<var>d</var><sub>j</sub> = √2 Φ⁻¹(<var>A</var><sub>j</sub>);
					<var>S</var><sub>ij</sub> = (2<var>Y</var><sub>i</sub> − 1)<var>d</var><sub>j</sub>/2 +
					<var>ε</var><sub>ij</sub>
				</p>
				<p>
					The target AUC becomes separation between outcome classes in a binormal score model. The
					score places synthetic event and non-event records into overlapping normal distributions
					with the requested population ranking ability, subject to finite-cohort variation.
				</p>
			</div>

			<div class="equation-step">
				<h4>4 · Development probability and calibration transform</h4>
				<p class="equation">
					<var>η</var><sup>(0)</sup><sub>ij</sub> = logit(<var>π</var><sub>development</sub>) +
					<var>d</var><sub>j</sub><var>S</var><sub>ij</sub>;
					<var>p</var><sup>(0)</sup><sub>ij</sub> = logistic(<var>η</var><sup>(0)</sup><sub>ij</sub
					>)
				</p>
				<p>
					The latent score becomes a probability anchored to the development population’s event
					rate. When development and deployment rates match, this base probability is calibrated in
					the population.
				</p>
				<p class="equation">
					<var>p</var><sub>ij</sub> = logistic((logit(<var>p</var><sup>(0)</sup><sub>ij</sub>) −
					<var>c</var><sub>j</sub>) / <var>m</var><sub>j</sub>)
				</p>
				<p>
					The configured conventional calibration intercept <var>c</var> and positive slope
					<var>m</var> transform those log odds. Zero intercept and slope one leave the base probability
					unchanged.
				</p>
				<p class="equation">
					logit P(<var>Y</var> = 1 ∣ <var>p</var><sub>ij</sub>) = <var>c</var><sub>j</sub> +
					<var>m</var><sub>j</sub> logit(<var>p</var><sub>ij</sub>)
				</p>
				<p>
					In matched development and deployment populations, this is the conventional calibration
					relation: zero intercept and unit slope are ideal. A deployment prevalence change breaks
					that match without applying the shift twice.
				</p>
			</div>

			<div class="equation-step">
				<h4>5 · Weighted pool</h4>
				<p class="equation">
					<var>p</var><sub>E,i</sub> = <var>w p</var><sub>H,i</sub> + (1 − <var>w</var>)
					<var>p</var><sub>A,i</sub>
				</p>
				<p>
					The ensemble is ordinary convex arithmetic: {config.clinicianWeight.toFixed(2)} of the clinician
					probability plus {(1 - config.clinicianWeight).toFixed(2)} of the model probability.
				</p>
			</div>

			<button type="button" class="new-cohort" onclick={onnewcohort}>
				Generate another synthetic cohort
			</button>
			<p class="button-help">
				This deterministic robustness check increments the named seed. Reset all returns to the full
				originating preset, including its original seed.
			</p>
		</div>
	</details>

	<details>
		<summary>
			<span><b>02</b> What the metrics mean</span><i aria-hidden="true">+</i>
		</summary>
		<div class="content">
			<div class="metric-definition">
				<h4>Brier score</h4>
				<p class="equation">
					BS(<var>p</var>) = (1/<var>N</var>) Σᵢ (<var>pᵢ</var> − <var>Yᵢ</var>)²
				</p>
				<p>
					The mean squared difference between a probability and the realized binary outcome. Lower
					is better probabilistic performance, but this does not measure treatment utility or
					clinical usefulness.
				</p>
			</div>
			<div class="metric-definition">
				<h4>Ensemble gain</h4>
				<p class="equation">min(BS<sub>H</sub>, BS<sub>A</sub>) − BS<sub>E</sub></p>
				<p>
					Positive means the pool beats the better member on this cohort. Current gain:
					<strong>{metrics.ensembleGain.toFixed(4)}</strong>.
				</p>
			</div>
			<div class="metric-definition">
				<h4>Cross-error identity</h4>
				<p class="equation">
					BS<sub>E</sub> = <var>w</var>²BS<sub>H</sub> + (1 − <var>w</var>)²BS<sub>A</sub> + 2<var
						>w</var
					>(1 −
					<var>w</var>)<var>C</var>
				</p>
				<p>
					<var>C</var> is the mean product of the two signed forecast errors. It makes shared error
					explicit. Numerical identity residual: {metrics.crossTermIdentityResidual.toExponential(
						2
					)}.
				</p>
			</div>
			<div class="metric-definition">
				<h4>Why averaging can help—but not magically</h4>
				<p class="equation">
					<var>w</var>BS<sub>H</sub> + (1 − <var>w</var>)BS<sub>A</sub> − BS<sub>E</sub> =
					<var>w</var>(1 − <var>w</var>) mean[(<var>p</var><sub>H</sub> − <var>p</var><sub>A</sub
					>)²] ≥ 0
				</p>
				<p>
					A convex pool is no worse than the weighted average of member losses because disagreement
					can create a diversity benefit. It can still lose to the better individual member. Current
					diversity term: {metrics.diversityTerm.toFixed(4)}; identity residual:
					{metrics.weightedAverageIdentityResidual.toExponential(2)}.
				</p>
			</div>
			<div class="metric-definition">
				<h4>AUC and calibration</h4>
				<p>
					AUC describes ranking, not probability honesty. Calibration compares mean forecast
					probability with observed event frequency; Wilson intervals expose finite-bin uncertainty.
					Neither alone determines a treatment threshold.
				</p>
			</div>
		</div>
	</details>

	<details>
		<summary>
			<span><b>03</b> View chart data</span><i aria-hidden="true">+</i>
		</summary>
		<div class="content chart-data">
			<h4>Cohort summary</h4>
			<div class="table-scroll">
				<table>
					<thead
						><tr
							><th scope="col">Series</th><th scope="col">Mean prediction</th><th scope="col"
								>Brier score</th
							><th scope="col">Realized AUC</th></tr
						></thead
					>
					<tbody>
						{#each series as item (item.key)}
							<tr
								><th scope="row">{item.label}</th><td
									>{percent(metrics.meanPredictions[item.key])}</td
								><td>{metrics.brierScores[item.key].toFixed(4)}</td><td
									>{metric(metrics.realizedAuc[item.key], 3)}</td
								></tr
							>
						{/each}
						<tr
							><th scope="row">Constant prevalence</th><td>{percent(metrics.observedEventRate)}</td
							><td>{metrics.brierScores.constantPrevalence.toFixed(4)}</td><td>—</td></tr
						>
					</tbody>
				</table>
			</div>
			<p>{metrics.eventCount} events among {config.cohortSize.toLocaleString()} synthetic cases.</p>

			<h4>Weight curve</h4>
			<div class="table-scroll compact-table">
				<table>
					<thead
						><tr
							><th scope="col">Clinician weight</th><th scope="col">Model weight</th><th scope="col"
								>Ensemble Brier</th
							></tr
						></thead
					>
					<tbody>
						{#each weightCurve as point (point.clinicianWeight)}
							<tr
								><td>{point.clinicianWeight.toFixed(2)}</td><td
									>{(1 - point.clinicianWeight).toFixed(2)}</td
								><td>{point.brierScore.toFixed(5)}</td></tr
							>
						{/each}
					</tbody>
				</table>
			</div>

			<h4>Reliability aggregates</h4>
			<div class="table-scroll compact-table">
				<table>
					<thead
						><tr
							><th scope="col">Series</th><th scope="col">Bin</th><th scope="col">Cases</th><th
								scope="col">Events</th
							><th scope="col">Mean forecast</th><th scope="col">Event frequency</th><th scope="col"
								>Wilson 95%</th
							></tr
						></thead
					>
					<tbody>
						{#each series as item (item.key)}
							{#each calibration[item.key] as bin (bin.index)}
								<tr
									><th scope="row">{item.label}</th><td>{bin.index + 1}</td><td>{bin.count}</td><td
										>{bin.eventCount}</td
									><td>{percent(bin.meanPrediction)}</td><td>{percent(bin.eventRate)}</td><td
										>{percent(bin.wilson95.lower)}–{percent(bin.wilson95.upper)}</td
									></tr
								>
							{/each}
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</details>

	<details>
		<summary>
			<span><b>04</b> What this laboratory leaves out</span><i aria-hidden="true">+</i>
		</summary>
		<div class="content limitations">
			<p>
				This laboratory is a forecast-evaluation simulator, not an AKI model. The simulated
				“clinician” is a probability-generating process, not a model of human cognition. Version one
				does not perform:
			</p>
			<ul>
				{#each omissions as omission}<li>{omission}</li>{/each}
			</ul>
			<p>
				The shared-artifact preset uses correlated hidden residuals as a proxy, not a causal account
				of how an artifact is learned. The population-shift preset changes prevalence only; real
				shifts are broader. No value is an estimate of a real clinician, model, hospital, or AKI
				incidence.
			</p>
		</div>
	</details>
</section>

<style>
	.disclosures {
		display: grid;
		min-width: 0;
		gap: 0.5rem;
	}

	details {
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.5rem;
		background: var(--icu-raised, var(--paper-raised));
	}

	summary {
		display: flex;
		min-height: 3rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0.7rem 0.8rem;
		color: var(--icu-ink, var(--ink));
		font: 760 0.76rem/1.3 var(--icu-sans, var(--font-sans, sans-serif));
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary b {
		margin-right: 0.5rem;
		color: var(--icu-accent, var(--accent));
		font-family: var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		letter-spacing: 0.06em;
	}

	summary i {
		font: normal 1rem/1 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		transition: transform 140ms ease;
	}

	details[open] summary i {
		transform: rotate(45deg);
	}

	.content {
		display: grid;
		gap: 0.8rem;
		border-top: 1px solid var(--icu-rule, var(--rule));
		padding: 0.8rem;
	}

	details:not([open]) > .content {
		display: none;
	}

	.content p,
	.content h4,
	.content dl,
	.content ul {
		margin: 0;
	}

	.content p,
	.content li,
	.content dd,
	.content dt {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.69rem/1.55 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.content strong,
	.content h4 {
		color: var(--icu-ink, var(--ink));
	}

	.content h4 {
		font: 760 0.76rem/1.3 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.settings-ledger {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.settings-ledger div {
		display: grid;
		gap: 0.15rem;
		border-left: 2px solid var(--icu-rule, var(--rule));
		padding-left: 0.5rem;
	}

	.settings-ledger dd {
		color: var(--icu-ink, var(--ink));
		font-family: var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		font-weight: 720;
	}

	.equation-step,
	.metric-definition {
		display: grid;
		gap: 0.25rem;
		border-top: 1px solid var(--icu-rule, var(--rule));
		padding-top: 0.65rem;
	}

	.equation {
		overflow-wrap: anywhere;
		border-radius: 0.35rem;
		background: var(--icu-paper, var(--paper));
		padding: 0.55rem;
		color: var(--icu-ink, var(--ink)) !important;
		font-family: var(--icu-mono, var(--font-mono, ui-monospace, monospace)) !important;
		font-variant-numeric: tabular-nums;
	}

	.new-cohort {
		width: fit-content;
		min-height: 2.75rem;
		border: 1px solid var(--icu-accent, var(--accent));
		border-radius: 0.45rem;
		background: var(--icu-accent, var(--accent));
		padding: 0.5rem 0.7rem;
		color: var(--accent-foreground, var(--paper));
		font: 760 0.7rem var(--icu-sans, var(--font-sans, sans-serif));
		cursor: pointer;
	}

	.button-help {
		margin-top: -0.45rem !important;
		font-size: 0.63rem !important;
	}

	.chart-data > p {
		margin-top: -0.4rem;
	}

	.table-scroll {
		min-width: 0;
		overflow-x: auto;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.35rem;
	}

	.compact-table {
		max-height: 24rem;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font: 0.64rem/1.35 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		font-variant-numeric: tabular-nums;
	}

	thead {
		position: sticky;
		z-index: 1;
		top: 0;
		background: var(--icu-raised, var(--paper-raised));
	}

	th,
	td {
		border-top: 1px solid var(--icu-rule, var(--rule));
		padding: 0.45rem;
		text-align: right;
		white-space: nowrap;
	}

	thead th {
		border-top: 0;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	.limitations ul {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem 1.2rem;
		padding-left: 1.15rem;
	}

	:where(summary, button):focus-visible {
		outline: 3px solid var(--icu-focus, var(--focus-ring, var(--accent)));
		outline-offset: 2px;
	}

	@container icu-lab (max-width: 44rem) {
		.settings-ledger,
		.limitations ul {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		summary i {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		details,
		.content,
		.equation-step,
		.metric-definition,
		.table-scroll,
		th,
		td,
		.new-cohort {
			border-color: CanvasText;
		}
	}
</style>
