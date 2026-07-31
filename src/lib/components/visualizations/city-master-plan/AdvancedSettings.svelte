<script lang="ts">
	import type {
		AnomalyAppetite,
		BuildingDensity,
		CityConfig,
		CitySizePreset,
		CivicPatience,
		LandmarkFrequency
	} from '$lib/visualizations/city-master-plan';

	type Props = {
		config: CityConfig;
		revealSpeed: number;
		showEntropy: boolean;
		showEdges: boolean;
		ambientMotion: boolean;
		disabled?: boolean;
		onconfig: (patch: Partial<Omit<CityConfig, 'anchor' | 'generatorVersion'>>) => void;
		onrevealspeed: (value: number) => void;
		onentropy: (value: boolean) => void;
		onedges: (value: boolean) => void;
		onambient: (value: boolean) => void;
	};

	let {
		config,
		revealSpeed,
		showEntropy,
		showEdges,
		ambientMotion,
		disabled = false,
		onconfig,
		onrevealspeed,
		onentropy,
		onedges,
		onambient
	}: Props = $props();
</script>

<details class="advanced-settings">
	<summary>
		<span>
			<strong>Advanced settings</strong>
			<small>Topology, reveal, and Lab overlays</small>
		</span>
		<span aria-hidden="true">+</span>
	</summary>

	<div class="settings-grid">
		<label>
			<span>Deterministic seed</span>
			<input
				type="text"
				value={config.seed}
				{disabled}
				maxlength="64"
				spellcheck="false"
				onchange={(event) => onconfig({ seed: event.currentTarget.value.trim() || config.seed })}
			/>
			<small>Text only. The anchor remains a separate condition.</small>
		</label>

		<label>
			<span>Grid size</span>
			<select
				value={config.size}
				{disabled}
				onchange={(event) => onconfig({ size: event.currentTarget.value as CitySizePreset })}
			>
				<option value="small">Small · 18 × 14</option>
				<option value="standard">Standard · 24 × 18</option>
				<option value="large">Large · 32 × 24</option>
			</select>
		</label>

		<label>
			<span>Civic patience</span>
			<select
				value={config.civicPatience}
				{disabled}
				onchange={(event) =>
					onconfig({ civicPatience: event.currentTarget.value as CivicPatience })}
			>
				<option value="patient">Patient · 24 returns</option>
				<option value="familiar">Familiar · 8 returns</option>
				<option value="impulsive">Impulsive · 1 return</option>
				<option value="none">No paperwork · 0 returns</option>
			</select>
		</label>

		<label>
			<span>Building density</span>
			<select
				value={config.density}
				{disabled}
				onchange={(event) => onconfig({ density: event.currentTarget.value as BuildingDensity })}
			>
				<option value="open">Open</option>
				<option value="balanced">Balanced</option>
				<option value="dense">Dense</option>
			</select>
		</label>

		<label>
			<span>Landmark frequency</span>
			<select
				value={config.landmarkFrequency}
				{disabled}
				onchange={(event) =>
					onconfig({
						landmarkFrequency: event.currentTarget.value as LandmarkFrequency
					})}
			>
				<option value="scarce">Scarce</option>
				<option value="balanced">Balanced</option>
				<option value="frequent">Frequent</option>
			</select>
		</label>

		<label>
			<span>Anomaly appetite</span>
			<select
				value={config.anomalyAppetite}
				{disabled}
				onchange={(event) =>
					onconfig({ anomalyAppetite: event.currentTarget.value as AnomalyAppetite })}
			>
				<option value="restrained">Restrained</option>
				<option value="balanced">Balanced</option>
				<option value="enthusiastic">Enthusiastic</option>
			</select>
		</label>

		<label>
			<span>Reveal speed</span>
			<input
				type="range"
				min="0.5"
				max="3"
				step="0.5"
				value={revealSpeed}
				oninput={(event) => onrevealspeed(event.currentTarget.valueAsNumber)}
			/>
			<small>{revealSpeed.toFixed(1)}× · display only</small>
		</label>
	</div>

	<div class="toggles">
		<label>
			<input
				type="checkbox"
				checked={config.minimumGuarantees}
				{disabled}
				onchange={(event) => onconfig({ minimumGuarantees: event.currentTarget.checked })}
			/>
			<span>
				<strong>Minimum civic guarantees</strong>
				<small>Hybrid run: pin multiple exits, one drainage outlet, and open-space potential.</small
				>
			</span>
		</label>
		<label>
			<input
				type="checkbox"
				checked={showEntropy}
				onchange={(event) => onentropy(event.currentTarget.checked)}
			/>
			<span>
				<strong>Show entropy</strong>
				<small>Candidate-count hatching in Lab mode.</small>
			</span>
		</label>
		<label>
			<input
				type="checkbox"
				checked={showEdges}
				onchange={(event) => onedges(event.currentTarget.checked)}
			/>
			<span>
				<strong>Show edge sockets</strong>
				<small>Passage and water signatures over the map.</small>
			</span>
		</label>
		<label>
			<input
				type="checkbox"
				checked={ambientMotion}
				onchange={(event) => onambient(event.currentTarget.checked)}
			/>
			<span>
				<strong>Ambient motion</strong>
				<small>Steam, ripples, and wires after construction.</small>
			</span>
		</label>
	</div>
</details>

<style>
	.advanced-settings {
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
	}
	summary {
		display: flex;
		min-height: 3.5rem;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.75rem;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary span:first-child {
		display: grid;
		gap: 0.08rem;
	}
	summary strong {
		font-size: 0.8rem;
		color: var(--ink);
	}
	summary small {
		font-size: 0.66rem;
		color: var(--ink-muted);
	}
	summary > span:last-child {
		font-size: 1.15rem;
		font-weight: 900;
		color: var(--accent);
		transition: transform 160ms ease;
	}
	details[open] summary > span:last-child {
		transform: rotate(45deg);
	}
	.settings-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
		border-top: 1px solid var(--rule);
		padding: 0.75rem;
	}
	.settings-grid label,
	.toggles label span {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}
	.settings-grid label > span,
	.toggles strong {
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--ink);
	}
	input[type='text'],
	select {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.42rem;
		background: var(--paper);
		padding: 0.45rem 0.55rem;
		font: inherit;
		font-size: 0.75rem;
		color: var(--ink);
	}
	input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--accent);
	}
	.settings-grid small,
	.toggles small {
		font-size: 0.62rem;
		line-height: 1.35;
		color: var(--ink-muted);
	}
	.toggles {
		display: grid;
		gap: 0.55rem;
		border-top: 1px solid var(--rule);
		padding: 0.75rem;
	}
	.toggles label {
		display: grid;
		grid-template-columns: 1.35rem 1fr;
		gap: 0.45rem;
		align-items: start;
	}
	.toggles input {
		width: 1.1rem;
		height: 1.1rem;
		margin-top: 0.12rem;
		accent-color: var(--accent);
	}
	:where(input, select, summary):focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	@media (max-width: 640px) {
		.settings-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		summary > span:last-child {
			transition: none;
		}
	}
	:global(html[data-motion='still']) summary > span:last-child {
		transition: none;
	}
</style>
