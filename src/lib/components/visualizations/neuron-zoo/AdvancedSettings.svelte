<script lang="ts">
	type GainId = 'mcculloch-pitts' | 'lif' | 'izhikevich' | 'fitzhugh-nagumo' | 'hodgkin-huxley';

	type Props = {
		dtMs: number;
		durationMs: number;
		seed: number;
		gains: Record<GainId, number>;
		izhikevichPhenotype: string;
		fhnTimeScaleMs: number;
		deltaGAtpKjMol: number;
		displaySampleMs: number;
		warning?: string;
		onchange: (settings: {
			dtMs?: number;
			durationMs?: number;
			seed?: number;
			gains?: Record<GainId, number>;
			izhikevichPhenotype?: string;
			fhnTimeScaleMs?: number;
			deltaGAtpKjMol?: number;
			displaySampleMs?: number;
		}) => void;
		onresetgains: () => void;
		onexport: () => void;
		onimport: (file: File) => void;
		onbenchmark?: () => void;
	};

	let {
		dtMs,
		durationMs,
		seed,
		gains,
		izhikevichPhenotype,
		fhnTimeScaleMs,
		deltaGAtpKjMol,
		displaySampleMs,
		warning = '',
		onchange,
		onresetgains,
		onexport,
		onimport,
		onbenchmark
	}: Props = $props();

	const gainFields: {
		id: GainId;
		label: string;
		unit: string;
		minimum: number;
		maximum: number;
		step: number;
	}[] = [
		{
			id: 'mcculloch-pitts',
			label: 'McCulloch–Pitts',
			unit: 'unitless',
			minimum: 0.1,
			maximum: 2,
			step: 0.05
		},
		{ id: 'lif', label: 'LIF', unit: 'pA', minimum: 100, maximum: 1000, step: 10 },
		{
			id: 'izhikevich',
			label: 'Izhikevich',
			unit: 'model units',
			minimum: 1,
			maximum: 30,
			step: 0.5
		},
		{
			id: 'fitzhugh-nagumo',
			label: 'FitzHugh–Nagumo',
			unit: 'dimensionless',
			minimum: 0.1,
			maximum: 2,
			step: 0.05
		},
		{
			id: 'hodgkin-huxley',
			label: 'Hodgkin–Huxley',
			unit: 'µA/cm²',
			minimum: 1,
			maximum: 40,
			step: 0.5
		}
	];

	function updateGain(id: GainId, value: number) {
		onchange({ gains: { ...gains, [id]: value } });
	}

	function handleImport(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onimport(file);
		input.value = '';
	}
</script>

<details class="advanced">
	<summary>Advanced settings and reproducibility</summary>

	<div class="advanced-body">
		<p class="explanation">
			Changing the time step, duration, seed, phenotype, or input gain resets and recomputes the
			experiment. Presentation speed never changes the scientific time step.
		</p>

		{#if warning}
			<p class="warning" role="alert">{warning}</p>
		{/if}

		<div class="settings-grid">
			<label>
				<span>Fixed integration step</span>
				<select
					value={dtMs}
					onchange={(event) => onchange({ dtMs: Number(event.currentTarget.value) })}
				>
					<option value={0.01}>0.01 ms</option>
					<option value={0.025}>0.025 ms · default</option>
					<option value={0.05}>0.05 ms</option>
					<option value={0.1}>0.1 ms · accuracy warning</option>
				</select>
			</label>

			<label>
				<span>Experiment duration</span>
				<select
					value={durationMs}
					onchange={(event) => onchange({ durationMs: Number(event.currentTarget.value) })}
				>
					{#each [250, 500, 1000, 2000] as duration (duration)}
						<option value={duration}>{duration.toLocaleString()} ms</option>
					{/each}
				</select>
			</label>

			<label>
				<span>Noise seed</span>
				<input
					type="number"
					min="0"
					max="4294967295"
					step="1"
					value={seed}
					onchange={(event) =>
						onchange({
							seed: Math.max(
								0,
								Math.min(4_294_967_295, Math.floor(Number(event.currentTarget.value)))
							)
						})}
				/>
			</label>

			<label>
				<span>Display sample interval</span>
				<select
					value={displaySampleMs}
					onchange={(event) => onchange({ displaySampleMs: Number(event.currentTarget.value) })}
				>
					<option value={0.05}>0.05 ms</option>
					<option value={0.1}>0.1 ms · default</option>
					<option value={0.2}>0.2 ms</option>
					<option value={0.5}>0.5 ms</option>
				</select>
			</label>

			<label>
				<span>Izhikevich phenotype</span>
				<select
					value={izhikevichPhenotype}
					onchange={(event) => onchange({ izhikevichPhenotype: event.currentTarget.value })}
				>
					<option value="regular-spiking">Regular spiking</option>
					<option value="intrinsically-bursting">Intrinsically bursting</option>
					<option value="chattering">Chattering</option>
					<option value="fast-spiking">Fast spiking</option>
					<option value="low-threshold-spiking">Low-threshold spiking</option>
				</select>
			</label>

			<label>
				<span>FHN time scale, ms</span>
				<input
					type="number"
					min="5"
					max="30"
					step="0.5"
					value={fhnTimeScaleMs}
					onchange={(event) => onchange({ fhnTimeScaleMs: Number(event.currentTarget.value) })}
				/>
			</label>

			<label>
				<span>Assumed ΔG ATP, kJ/mol</span>
				<input
					type="number"
					min="45"
					max="60"
					step="1"
					value={deltaGAtpKjMol}
					onchange={(event) => onchange({ deltaGAtpKjMol: Number(event.currentTarget.value) })}
				/>
			</label>
		</div>

		<section aria-labelledby="native-gains-heading">
			<div class="section-heading">
				<div>
					<h4 id="native-gains-heading">Visible native-input gains</h4>
					<p>One command shape, translated into five incompatible native input spaces.</p>
				</div>
				<button type="button" onclick={onresetgains}>Reset exact defaults</button>
			</div>

			<div class="gain-grid">
				{#each gainFields as field (field.id)}
					<label>
						<span>{field.label}</span>
						<div class="input-unit">
							<input
								type="number"
								min={field.minimum}
								max={field.maximum}
								step={field.step}
								value={gains[field.id]}
								onchange={(event) => updateGain(field.id, Number(event.currentTarget.value))}
							/>
							<small>{field.unit} × s(t)</small>
						</div>
					</label>
				{/each}
			</div>
		</section>

		<div class="file-actions">
			<button type="button" onclick={onexport}>Export experiment JSON</button>
			<label class="file-button">
				<span>Import experiment JSON</span>
				<input type="file" accept="application/json,.json" onchange={handleImport} />
			</label>
			{#if onbenchmark}
				<button type="button" onclick={onbenchmark}>Run computer-cost benchmark</button>
			{/if}
		</div>

		<p class="accuracy-note">
			<strong>0.1 ms warning:</strong> this coarser step is offered for inspection, not as the validated
			default. Fixed-step approximation error can shift spike timing and ionic-charge estimates.
		</p>
	</div>
</details>

<style>
	.advanced {
		border: 1px solid #2d3440;
		border-radius: 0.7rem;
		background: #0d1118;
	}
	summary {
		min-height: 2.75rem;
		cursor: pointer;
		padding: 0.8rem 1rem;
		color: #eef2f7;
		font-weight: 800;
	}
	summary:focus-visible,
	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	.file-button:focus-within {
		outline: 3px solid #f4d58d;
		outline-offset: 3px;
	}
	.advanced-body {
		display: grid;
		gap: 1.4rem;
		border-top: 1px solid #252b35;
		padding: 1rem;
	}
	.explanation,
	.section-heading p,
	.accuracy-note {
		margin: 0;
		color: #a8b1bf;
		font-size: 0.78rem;
		line-height: 1.55;
	}
	.warning {
		margin: 0;
		border-left: 3px solid #f59e0b;
		background: #2d210c;
		padding: 0.75rem;
		color: #fde7b0;
		font-size: 0.8rem;
	}
	.settings-grid,
	.gain-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.8rem;
	}
	label {
		display: grid;
		gap: 0.35rem;
		color: #a8b1bf;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.04em;
	}
	input,
	select,
	button,
	.file-button {
		min-height: 2.75rem;
		border: 1px solid #343c49;
		border-radius: 0.45rem;
		background: #141922;
		padding: 0.5rem 0.65rem;
		color: #edf2f7;
		font: inherit;
		font-size: 0.78rem;
	}
	button,
	.file-button {
		font-weight: 800;
		cursor: pointer;
	}
	button:hover,
	.file-button:hover {
		border-color: #aab4c2;
	}
	.input-unit {
		display: grid;
		gap: 0.25rem;
	}
	small {
		color: #7f8998;
		font-size: 0.66rem;
		font-weight: 500;
	}
	.section-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.8rem;
	}
	h4 {
		margin: 0 0 0.2rem;
		color: #fff;
		font-size: 0.95rem;
	}
	.file-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}
	.file-button {
		display: inline-flex;
		align-items: center;
	}
	.file-button input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
	.accuracy-note {
		border-top: 1px solid #252b35;
		padding-top: 0.8rem;
	}
	@media (max-width: 40rem) {
		.section-heading {
			align-items: start;
			flex-direction: column;
		}
		.section-heading button {
			width: 100%;
		}
		.file-actions {
			display: grid;
		}
	}
</style>
