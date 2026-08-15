<script lang="ts">
	import { describeCalibrationStatus, logit } from '$lib/visualizations/human-ai-icu-prediction';

	type ForecasterSettings = {
		targetAuc: number;
		calibrationIntercept: number;
		calibrationSlope: number;
	};

	type ControlConfig = {
		developmentEventRate: number;
		deploymentEventRate: number;
		clinician: ForecasterSettings;
		model: ForecasterSettings;
		sharedResidualCorrelation: number;
		clinicianWeight: number;
	};

	let {
		config,
		label,
		onchange,
		oncommit,
		onreset
	}: {
		config: ControlConfig;
		label: string;
		onchange: (next: ControlConfig) => void;
		oncommit?: () => void;
		onreset: () => void;
	} = $props();

	function updateForecaster(
		forecaster: 'clinician' | 'model',
		field: keyof ForecasterSettings,
		value: number
	): void {
		onchange({
			...config,
			[forecaster]: { ...config[forecaster], [field]: value }
		});
	}

	function updateRelationship(
		field: 'sharedResidualCorrelation' | 'clinicianWeight',
		value: number
	): void {
		onchange({ ...config, [field]: value });
	}

	function calibrationStatus(settings: ForecasterSettings): string {
		const prevalenceShift = logit(config.deploymentEventRate) - logit(config.developmentEventRate);
		return describeCalibrationStatus({
			calibrationIntercept: settings.calibrationIntercept + prevalenceShift,
			calibrationSlope: settings.calibrationSlope
		});
	}

	function valueFrom(event: Event): number {
		return Number((event.currentTarget as HTMLInputElement).value);
	}
</script>

<section class="controls" aria-labelledby="icu-controls-heading">
	<header>
		<div>
			<p class="eyebrow">CURRENT CONFIGURATION</p>
			<h3 id="icu-controls-heading">{label}</h3>
		</div>
		<button type="button" class="reset" data-testid="icu-reset" onclick={onreset}>Reset all</button>
	</header>

	<div class="forecaster-card clinician">
		<div class="card-heading">
			<span class="marker circle" aria-hidden="true"></span>
			<div>
				<h4>Simulated clinician</h4>
				<p>{calibrationStatus(config.clinician)}</p>
			</div>
		</div>
		<label for="icu-clinician-auc">
			<span
				>Target discrimination / AUC <output>{config.clinician.targetAuc.toFixed(2)}</output></span
			>
			<input
				id="icu-clinician-auc"
				type="range"
				min="0.5"
				max="0.95"
				step="0.01"
				value={config.clinician.targetAuc}
				aria-describedby="icu-auc-help"
				oninput={(event) => updateForecaster('clinician', 'targetAuc', valueFrom(event))}
				onchange={oncommit}
			/>
		</label>
		<details>
			<summary>More calibration controls</summary>
			<label for="icu-clinician-intercept">
				<span
					>Calibration intercept <output>{config.clinician.calibrationIntercept.toFixed(2)}</output
					></span
				>
				<input
					id="icu-clinician-intercept"
					type="range"
					min="-1.25"
					max="1.25"
					step="0.05"
					value={config.clinician.calibrationIntercept}
					aria-describedby="icu-intercept-help"
					oninput={(event) =>
						updateForecaster('clinician', 'calibrationIntercept', valueFrom(event))}
					onchange={oncommit}
				/>
			</label>
			<label for="icu-clinician-slope">
				<span
					>Calibration slope <output>{config.clinician.calibrationSlope.toFixed(2)}</output></span
				>
				<input
					id="icu-clinician-slope"
					type="range"
					min="0.4"
					max="2"
					step="0.05"
					value={config.clinician.calibrationSlope}
					aria-describedby="icu-slope-help"
					oninput={(event) => updateForecaster('clinician', 'calibrationSlope', valueFrom(event))}
					onchange={oncommit}
				/>
			</label>
		</details>
	</div>

	<div class="forecaster-card model">
		<div class="card-heading">
			<span class="marker square" aria-hidden="true"></span>
			<div>
				<h4>Simulated model</h4>
				<p>{calibrationStatus(config.model)}</p>
			</div>
		</div>
		<label for="icu-model-auc">
			<span>Target discrimination / AUC <output>{config.model.targetAuc.toFixed(2)}</output></span>
			<input
				id="icu-model-auc"
				type="range"
				min="0.5"
				max="0.95"
				step="0.01"
				value={config.model.targetAuc}
				aria-describedby="icu-auc-help"
				oninput={(event) => updateForecaster('model', 'targetAuc', valueFrom(event))}
				onchange={oncommit}
			/>
		</label>
		<details>
			<summary>More calibration controls</summary>
			<label for="icu-model-intercept">
				<span
					>Calibration intercept <output>{config.model.calibrationIntercept.toFixed(2)}</output
					></span
				>
				<input
					id="icu-model-intercept"
					type="range"
					min="-1.25"
					max="1.25"
					step="0.05"
					value={config.model.calibrationIntercept}
					aria-describedby="icu-intercept-help"
					oninput={(event) => updateForecaster('model', 'calibrationIntercept', valueFrom(event))}
					onchange={oncommit}
				/>
			</label>
			<label for="icu-model-slope">
				<span>Calibration slope <output>{config.model.calibrationSlope.toFixed(2)}</output></span>
				<input
					id="icu-model-slope"
					type="range"
					min="0.4"
					max="2"
					step="0.05"
					value={config.model.calibrationSlope}
					aria-describedby="icu-slope-help"
					oninput={(event) => updateForecaster('model', 'calibrationSlope', valueFrom(event))}
					onchange={oncommit}
				/>
			</label>
		</details>
	</div>

	<div class="relationship-card">
		<h4>Relationship and pooling</h4>
		<label for="icu-residual-correlation">
			<span
				>Shared residual dependence, ρ <output>{config.sharedResidualCorrelation.toFixed(2)}</output
				></span
			>
			<input
				id="icu-residual-correlation"
				type="range"
				min="-0.8"
				max="0.95"
				step="0.05"
				value={config.sharedResidualCorrelation}
				aria-valuetext={config.sharedResidualCorrelation.toFixed(2)}
				aria-describedby="icu-rho-help"
				oninput={(event) => updateRelationship('sharedResidualCorrelation', valueFrom(event))}
				onchange={oncommit}
			/>
		</label>
		<label for="icu-clinician-weight">
			<span>Clinician ensemble weight, w <output>{config.clinicianWeight.toFixed(2)}</output></span>
			<input
				id="icu-clinician-weight"
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={config.clinicianWeight}
				aria-describedby="icu-weight-help"
				oninput={(event) => updateRelationship('clinicianWeight', valueFrom(event))}
				onchange={oncommit}
			/>
		</label>
		<div class="mix-readout" aria-label="Current ensemble mixture">
			<span style={`--share:${config.clinicianWeight * 100}%`}></span>
			<p>
				<strong>{Math.round(config.clinicianWeight * 100)}%</strong> clinician ·
				<strong>{Math.round((1 - config.clinicianWeight) * 100)}%</strong> model
			</p>
		</div>
	</div>

	<div class="control-help">
		<p id="icu-auc-help">
			<strong>Discrimination / AUC:</strong> How well the forecaster ranks synthetic cases with and without
			the event. AUC is not “accuracy”, and it does not say that the numerical probabilities are honest.
		</p>
		<p id="icu-intercept-help">
			<strong>Calibration intercept:</strong> Whether risks are systematically too high or too low. In
			the conventional calibration equation, zero is ideal; a positive intercept means the forecasts are
			systematically too low.
		</p>
		<p id="icu-slope-help">
			<strong>Calibration slope:</strong> Whether probabilities are too extreme or too timid. One is ideal;
			below one means too extreme, and above one means too compressed toward the middle.
		</p>
		<p id="icu-rho-help">
			<strong>Shared residual dependence:</strong> How strongly the hidden noise terms of the two synthetic
			forecasters move together after conditioning on the outcome. This is a property of the simulator,
			not a directly observed clinical quantity.
		</p>
		<p id="icu-weight-help">
			<strong>Ensemble weight:</strong> How much of the final forecast comes from each forecaster.
		</p>
	</div>
</section>

<style>
	.controls {
		display: grid;
		min-width: 0;
		gap: 0.65rem;
	}

	header,
	.card-heading,
	label > span,
	.mix-readout p {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
	}

	header p,
	header h3,
	.card-heading h4,
	.card-heading p,
	.relationship-card h4,
	.mix-readout p,
	.control-help p {
		margin: 0;
	}

	.eyebrow {
		color: var(--icu-accent, var(--accent));
		font: 760 0.62rem/1.2 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		letter-spacing: 0.09em;
	}

	header h3 {
		margin-top: 0.16rem;
		font: 780 0.92rem/1.2 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.reset {
		min-height: 2.75rem;
		flex: none;
		border: 1px solid var(--icu-control, var(--control-border));
		border-radius: 0.45rem;
		background: var(--icu-raised, var(--paper-raised));
		padding: 0.45rem 0.65rem;
		color: var(--icu-ink, var(--ink));
		font: 750 0.72rem var(--icu-sans, var(--font-sans, sans-serif));
		cursor: pointer;
	}

	.forecaster-card,
	.relationship-card {
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.55rem;
		background: var(--icu-raised, var(--paper-raised));
		padding: 0.7rem;
	}

	.forecaster-card {
		border-top: 3px solid var(--series);
	}

	.clinician {
		--series: var(--icu-clinician);
	}

	.model {
		--series: var(--icu-model);
	}

	.card-heading {
		justify-content: flex-start;
		margin-bottom: 0.55rem;
	}

	.card-heading h4,
	.relationship-card h4 {
		font: 760 0.8rem/1.25 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.card-heading p {
		margin-top: 0.08rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.64rem/1.35 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.marker {
		width: 0.72rem;
		height: 0.72rem;
		flex: none;
		border: 2px solid var(--series);
		background: transparent;
	}

	.marker.circle {
		border-radius: 50%;
	}

	label {
		display: grid;
		min-width: 0;
		gap: 0.18rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 680 0.68rem/1.35 var(--icu-sans, var(--font-sans, sans-serif));
	}

	label + label,
	details label:first-of-type,
	.relationship-card label:first-of-type {
		margin-top: 0.55rem;
	}

	output {
		color: var(--icu-ink, var(--ink));
		font: 780 0.7rem var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		font-variant-numeric: tabular-nums;
	}

	input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		margin: 0;
		accent-color: var(--series, var(--icu-ensemble));
		cursor: ew-resize;
	}

	details {
		margin-top: 0.35rem;
		border-top: 1px solid var(--icu-rule, var(--rule));
	}

	summary {
		min-height: 2.75rem;
		padding-block: 0.7rem 0.45rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 720 0.67rem/1.25 var(--icu-sans, var(--font-sans, sans-serif));
		cursor: pointer;
	}

	.relationship-card {
		--series: var(--icu-ensemble);
	}

	.mix-readout {
		margin-top: 0.6rem;
	}

	.mix-readout > span {
		display: block;
		height: 0.5rem;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 999px;
		background: linear-gradient(
			to right,
			var(--icu-clinician) 0 var(--share),
			var(--icu-model) var(--share) 100%
		);
	}

	.mix-readout p {
		margin-top: 0.3rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.65rem/1.3 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.control-help {
		display: grid;
		gap: 0.3rem;
		border-left: 2px solid var(--icu-rule, var(--rule));
		padding-left: 0.65rem;
	}

	.control-help p {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.64rem/1.42 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.control-help strong {
		color: var(--icu-ink, var(--ink));
	}

	:where(button, input, summary):focus-visible {
		outline: 3px solid var(--icu-focus, var(--focus-ring, var(--accent)));
		outline-offset: 2px;
	}

	@media (forced-colors: active) {
		.forecaster-card,
		.relationship-card,
		.reset,
		details,
		.mix-readout > span {
			border-color: CanvasText;
		}
	}
</style>
