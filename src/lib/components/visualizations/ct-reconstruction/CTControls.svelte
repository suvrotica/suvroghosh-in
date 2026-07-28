<script lang="ts">
	import type {
		AcquisitionSettings,
		FilterName,
		ReconstructionSettings
	} from '$lib/visualizations/ct-reconstruction';

	type PlaybackState = 'idle' | 'ready' | 'running' | 'paused' | 'complete' | 'error';
	type ControlMode = 'all' | 'transport' | 'settings';

	type Props = {
		mode?: ControlMode;
		headingId?: string;
		acquisition: AcquisitionSettings;
		reconstruction: ReconstructionSettings;
		playbackState: PlaybackState;
		playbackSpeed: number;
		progress: number;
		actualProjectionCount: number;
		acquiredProjectionCount: number;
		stale: boolean;
		workerReady: boolean;
		autoWindow: boolean;
		windowCenter: number;
		windowWidth: number;
		zoom: number;
		errorMessage?: string;
		onacquisitionchange: <Key extends keyof AcquisitionSettings>(
			key: Key,
			value: AcquisitionSettings[Key]
		) => void;
		onreconstructionchange: <Key extends keyof ReconstructionSettings>(
			key: Key,
			value: ReconstructionSettings[Key]
		) => void;
		onspeedchange: (value: number) => void;
		onstart: () => void;
		onpause: () => void;
		onresume: () => void;
		onstep: () => void;
		onrestart: () => void;
		onreset: () => void;
		onnewnoise: () => void;
		onwindowchange: (settings: {
			autoWindow?: boolean;
			windowCenter?: number;
			windowWidth?: number;
			zoom?: number;
		}) => void;
	};

	let {
		mode = 'all',
		headingId = 'ct-controls-heading',
		acquisition,
		reconstruction,
		playbackState,
		playbackSpeed,
		progress,
		actualProjectionCount,
		acquiredProjectionCount,
		stale,
		workerReady,
		autoWindow,
		windowCenter,
		windowWidth,
		zoom,
		errorMessage = '',
		onacquisitionchange,
		onreconstructionchange,
		onspeedchange,
		onstart,
		onpause,
		onresume,
		onstep,
		onrestart,
		onreset,
		onnewnoise,
		onwindowchange
	}: Props = $props();

	const detectorOptions = [64, 96, 128, 192, 256, 384];
	const filterOptions: Array<{ value: FilterName; label: string }> = [
		{ value: 'ramp', label: 'Ramp (Ram–Lak)' },
		{ value: 'shepp-logan', label: 'Shepp–Logan' },
		{ value: 'cosine', label: 'Cosine' },
		{ value: 'hann', label: 'Hann' },
		{ value: 'hamming', label: 'Hamming' }
	];

	let photonCount = $derived(Math.round(3_000 * 10 ** (3 * acquisition.dose)));
	let progressPercent = $derived(Math.round(progress * 100));
	let canStart = $derived(workerReady && playbackState !== 'running');
	let primaryLabel = $derived(
		playbackState === 'complete' || stale
			? 'Start new scan'
			: playbackState === 'paused'
				? 'Resume scan'
				: 'Start scan'
	);

	function numberValue(event: Event) {
		return Number((event.currentTarget as HTMLInputElement).value);
	}
</script>

<aside
	class="controls"
	class:transport-only={mode === 'transport'}
	class:settings-only={mode === 'settings'}
	aria-labelledby={headingId}
>
	{#if mode !== 'settings'}
		<header class="control-header">
			<div>
				<p>Acquisition console</p>
				<h3 id={headingId}>Scan controls</h3>
			</div>
			<span class:stale>{stale ? 'settings changed' : playbackState}</span>
		</header>

		<div class="transport" aria-label="Scan playback controls">
			<button
				type="button"
				class="primary"
				disabled={!canStart}
				title={!workerReady ? 'The numerical Worker is not ready.' : undefined}
				onclick={playbackState === 'paused' && !stale ? onresume : onstart}
			>
				{primaryLabel}
			</button>
			<button
				type="button"
				disabled={playbackState !== 'running'}
				aria-label={playbackState === 'running'
					? 'Pause scan'
					: 'Pause scan, available while acquisition is running'}
				onclick={onpause}>Pause</button
			>
			<button
				type="button"
				disabled={!workerReady || playbackState === 'running'}
				title={playbackState === 'running' ? 'Pause before advancing one batch.' : undefined}
				onclick={onstep}>Step</button
			>
			<button
				type="button"
				disabled={!workerReady}
				aria-label={workerReady
					? 'Restart scan from the first angle'
					: 'Restart scan, unavailable because the numerical Worker is not ready'}
				onclick={onrestart}>Restart</button
			>
			<button type="button" onclick={onreset}>Reset</button>
		</div>

		<div class="progress-block">
			<div>
				<label for="ct-scan-progress">Projection progress</label>
				<output
					>{progressPercent}% · {acquiredProjectionCount}/{actualProjectionCount} acquired</output
				>
			</div>
			<progress id="ct-scan-progress" max="1" value={progress}>{progressPercent}%</progress>
		</div>

		{#if errorMessage}
			<p class="error" role="alert">
				<strong>Scan interrupted.</strong>
				{errorMessage} Reset retries the numerical Worker; reload the page if browser capabilities remain
				unavailable.
			</p>
		{/if}
	{/if}

	{#if mode !== 'transport'}
		{#if mode === 'settings'}
			<header class="control-header">
				<div>
					<p>Laboratory console</p>
					<h3 id={headingId}>Advanced settings</h3>
				</div>
				<span>physics &amp; display</span>
			</header>
		{/if}

		<details open>
			<summary>Acquisition <span>requires a new scan</span></summary>
			<div class="field-grid">
				<label class="range-field" for="ct-projections">
					<span>Projection angles <output>{acquisition.projectionCount}</output></span>
					<input
						id="ct-projections"
						type="range"
						min="12"
						max="360"
						step="6"
						value={acquisition.projectionCount}
						oninput={(event) =>
							onacquisitionchange('projectionCount', Math.round(numberValue(event)))}
					/>
					<small>More directions reduce angular spokes.</small>
				</label>

				<label class="select-field" for="ct-detectors">
					<span>Detector bins</span>
					<select
						id="ct-detectors"
						value={acquisition.detectorCount}
						onchange={(event) =>
							onacquisitionchange('detectorCount', Math.round(numberValue(event)))}
					>
						{#each detectorOptions as count (count)}
							<option value={count}>{count}</option>
						{/each}
					</select>
					<small>Samples position across the full image diagonal.</small>
				</label>

				<label class="range-field" for="ct-dose">
					<span>Relative dose proxy <output>{Math.round(acquisition.dose * 100)}%</output></span>
					<input
						id="ct-dose"
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={acquisition.dose}
						oninput={(event) => onacquisitionchange('dose', numberValue(event))}
					/>
					<small>About {photonCount.toLocaleString()} nominal photons per detector sample.</small>
				</label>

				<label class="range-field" for="ct-noise">
					<span
						>Additional detector noise <output
							>{Math.round(acquisition.additionalNoise * 100)}%</output
						></span
					>
					<input
						id="ct-noise"
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={acquisition.additionalNoise}
						oninput={(event) => onacquisitionchange('additionalNoise', numberValue(event))}
					/>
					<small>A simplified count-domain electronics and calibration term.</small>
				</label>

				<label class="range-field" for="ct-missing-width">
					<span
						>Missing-angle width <output>{Math.round(acquisition.missingAngleWidth)}°</output></span
					>
					<input
						id="ct-missing-width"
						type="range"
						min="0"
						max="120"
						step="1"
						value={acquisition.missingAngleWidth}
						oninput={(event) => onacquisitionchange('missingAngleWidth', numberValue(event))}
					/>
					<small>Omitted rows remain visible in the sinogram.</small>
				</label>

				<label class="range-field" for="ct-missing-centre">
					<span
						>Missing-sector centre <output>{Math.round(acquisition.missingAngleCenter)}°</output
						></span
					>
					<input
						id="ct-missing-centre"
						type="range"
						min="0"
						max="179"
						step="1"
						value={acquisition.missingAngleCenter}
						disabled={acquisition.missingAngleWidth === 0}
						aria-describedby="ct-missing-centre-help"
						oninput={(event) => onacquisitionchange('missingAngleCenter', numberValue(event))}
					/>
					<small id="ct-missing-centre-help"
						>{acquisition.missingAngleWidth === 0
							? 'Enable a missing-angle width before choosing its direction.'
							: 'Rotates the omitted sector through the 180° angular range.'}</small
					>
				</label>

				<label class="checkbox-field" for="ct-metal">
					<input
						id="ct-metal"
						type="checkbox"
						checked={acquisition.metalArtifacts}
						onchange={(event) =>
							onacquisitionchange(
								'metalArtifacts',
								(event.currentTarget as HTMLInputElement).checked
							)}
					/>
					<span>
						<strong>Polychromatic metal artefacts</strong>
						<small
							>Three energy bands plus photon starvation; effective only when metal is present.</small
						>
					</span>
				</label>

				<div class="seed-field">
					<span><strong>Noise seed</strong> {acquisition.seed}</span>
					<button type="button" onclick={onnewnoise}>New noise realisation</button>
				</div>
			</div>
		</details>

		<details open>
			<summary>Reconstruction <span>reuses the sinogram</span></summary>
			<div class="field-grid">
				<label class="select-field" for="ct-filter">
					<span>Frequency filter</span>
					<select
						id="ct-filter"
						value={reconstruction.filter}
						onchange={(event) =>
							onreconstructionchange(
								'filter',
								(event.currentTarget as HTMLSelectElement).value as FilterName
							)}
					>
						{#each filterOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					<small>Ramp is sharpest; windowed filters trade detail for noise suppression.</small>
				</label>
				<label class="range-field" for="ct-cutoff">
					<span
						>Filter cutoff <output>{Math.round(reconstruction.cutoff * 100)}% Nyquist</output></span
					>
					<input
						id="ct-cutoff"
						type="range"
						min="0.25"
						max="1"
						step="0.01"
						value={reconstruction.cutoff}
						oninput={(event) => onreconstructionchange('cutoff', numberValue(event))}
					/>
					<small>Frequencies above the selected pass band are excluded.</small>
				</label>
			</div>
		</details>

		<details>
			<summary>Display &amp; laboratory <span>does not rerun physics</span></summary>
			<div class="field-grid">
				<label class="range-field" for="ct-speed">
					<span>Scan animation speed <output>{playbackSpeed.toFixed(1)}×</output></span>
					<input
						id="ct-speed"
						type="range"
						min="0.25"
						max="4"
						step="0.25"
						value={playbackSpeed}
						oninput={(event) => onspeedchange(numberValue(event))}
					/>
					<small>Changes only how quickly calculated batches are revealed.</small>
				</label>
				<label class="checkbox-field" for="ct-auto-window">
					<input
						id="ct-auto-window"
						type="checkbox"
						checked={autoWindow}
						onchange={(event) =>
							onwindowchange({
								autoWindow: (event.currentTarget as HTMLInputElement).checked
							})}
					/>
					<span>
						<strong>Automatic intensity window</strong>
						<small>Fits the grayscale range to the current image estimate.</small>
					</span>
				</label>
				<label class="range-field" for="ct-window-centre">
					<span>Window centre <output>{windowCenter.toFixed(2)}</output></span>
					<input
						id="ct-window-centre"
						type="range"
						min="-0.5"
						max="2"
						step="0.01"
						value={windowCenter}
						disabled={autoWindow}
						oninput={(event) => onwindowchange({ windowCenter: numberValue(event) })}
					/>
					<small
						>{autoWindow
							? 'Turn off automatic windowing to adjust.'
							: 'Midpoint of the displayed attenuation range.'}</small
					>
				</label>
				<label class="range-field" for="ct-window-width">
					<span>Window width <output>{windowWidth.toFixed(2)}</output></span>
					<input
						id="ct-window-width"
						type="range"
						min="0.05"
						max="3"
						step="0.01"
						value={windowWidth}
						disabled={autoWindow}
						oninput={(event) => onwindowchange({ windowWidth: numberValue(event) })}
					/>
					<small
						>{autoWindow
							? 'Turn off automatic windowing to adjust.'
							: 'Span of values mapped from black to white.'}</small
					>
				</label>
				<label class="range-field" for="ct-zoom">
					<span>Image zoom <output>{zoom.toFixed(1)}×</output></span>
					<input
						id="ct-zoom"
						type="range"
						min="1"
						max="3"
						step="0.25"
						value={zoom}
						oninput={(event) => onwindowchange({ zoom: numberValue(event) })}
					/>
					<small>Set to 1× to fit the complete field of view.</small>
				</label>
				<button
					type="button"
					onclick={() =>
						onwindowchange({ autoWindow: true, windowCenter: 0.5, windowWidth: 1, zoom: 1 })}
				>
					Reset window and fit
				</button>
			</div>
		</details>
	{/if}
</aside>

<style>
	.controls {
		container-type: inline-size;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-raised);
		color: var(--ink);
	}
	.control-header {
		display: flex;
		min-height: 3.7rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.7rem 0.85rem;
	}
	.control-header p,
	.control-header h3 {
		margin: 0;
	}
	.control-header p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.control-header h3 {
		font-size: 1rem;
	}
	.control-header > span {
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 0.24rem 0.45rem;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		text-transform: capitalize;
		color: var(--ink-muted);
	}
	.control-header > span.stale {
		border-color: var(--accent);
		color: var(--accent);
	}
	.transport {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.4rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.7rem;
	}
	button,
	select,
	input {
		font: inherit;
	}
	button,
	select {
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.45rem;
		background: var(--paper-raised);
		color: var(--ink);
	}
	button {
		padding: 0.48rem 0.58rem;
		font-size: 0.8125rem;
		font-weight: 750;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}
	button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-foreground);
	}
	.progress-block {
		display: grid;
		gap: 0.45rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.7rem 0.8rem;
	}
	.progress-block > div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.8125rem;
	}
	.progress-block output {
		font-family: ui-monospace, monospace;
		color: var(--ink-muted);
	}
	progress {
		width: 100%;
		height: 0.55rem;
		accent-color: var(--accent);
	}
	.error {
		margin: 0;
		border-bottom: 1px solid var(--rule);
		background: color-mix(in oklab, var(--destructive) 12%, var(--paper-raised));
		padding: 0.7rem 0.8rem;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--ink);
	}
	details {
		border-bottom: 1px solid var(--rule);
	}
	summary {
		display: flex;
		min-height: 2.85rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		padding: 0.55rem 0.8rem;
		font-size: 0.8125rem;
		font-weight: 800;
		cursor: pointer;
	}
	summary span {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--ink-muted);
	}
	.field-grid {
		display: grid;
		gap: 0.8rem;
		border-top: 1px solid var(--rule);
		padding: 0.8rem;
	}
	.range-field,
	.select-field {
		display: grid;
		gap: 0.35rem;
		font-size: 0.8125rem;
		font-weight: 700;
	}
	.range-field > span {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.range-field output {
		font-family: ui-monospace, monospace;
		font-weight: 500;
		color: var(--ink-muted);
	}
	input[type='range'] {
		width: 100%;
		min-height: 1.4rem;
		accent-color: var(--accent);
	}
	select {
		width: 100%;
		padding: 0.45rem 0.6rem;
	}
	small {
		display: block;
		font-size: 0.75rem;
		font-weight: 450;
		line-height: 1.4;
		color: var(--ink-muted);
	}
	.checkbox-field {
		display: flex;
		min-height: 3.6rem;
		align-items: start;
		gap: 0.65rem;
		border: 1px solid var(--rule);
		border-radius: 0.45rem;
		padding: 0.62rem;
		font-size: 0.8125rem;
	}
	.checkbox-field input {
		width: 1.2rem;
		height: 1.2rem;
		flex: none;
		accent-color: var(--accent);
	}
	.checkbox-field strong,
	.checkbox-field small {
		display: block;
	}
	.seed-field {
		display: grid;
		gap: 0.4rem;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}
	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	summary:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -3px;
	}
	@container (min-width: 42rem) {
		.field-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.field-grid > button:last-child:nth-child(odd) {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 560px) {
		.transport {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.transport .primary {
			grid-column: span 2;
		}
	}
	@media (forced-colors: active) {
		.controls,
		.control-header,
		.transport,
		.progress-block,
		details,
		.field-grid,
		.checkbox-field,
		button,
		select {
			border-color: CanvasText;
		}
	}
</style>
