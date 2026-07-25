<script lang="ts">
	export type PresetOption = {
		id: string;
		label: string;
		disabled?: boolean;
	};

	type Props = {
		playing: boolean;
		busy?: boolean;
		timeMs: number;
		durationMs: number;
		dtMs: number;
		speed: number;
		preset: string;
		presets: PresetOption[];
		mode: 'draw' | 'inject';
		onplaypause: () => void;
		onreset: () => void;
		onreplay: () => void;
		onstep: () => void;
		onpreset: (preset: string) => void;
		onspeed: (speed: number) => void;
		onmode: (mode: 'draw' | 'inject') => void;
	};

	let {
		playing,
		busy = false,
		timeMs,
		durationMs,
		dtMs,
		speed,
		preset,
		presets,
		mode,
		onplaypause,
		onreset,
		onreplay,
		onstep,
		onpreset,
		onspeed,
		onmode
	}: Props = $props();

	const speeds = [0.25, 0.5, 1, 2, 4];
	let uid = $props.id();
</script>

<section class="transport" aria-label="Simulation transport controls">
	<div class="primary">
		<button type="button" class="play" onclick={onplaypause} disabled={busy} aria-pressed={playing}>
			<span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
			{playing ? 'Pause' : 'Play'}
		</button>
		<button type="button" onclick={onreset} disabled={busy}>Reset</button>
		<button type="button" onclick={onreplay} disabled={busy}>Replay</button>
		<button type="button" onclick={onstep} disabled={busy || playing}>
			Step <span class="step-value">{dtMs} ms</span>
		</button>
	</div>

	<div class="selectors">
		<label>
			<span>Preset</span>
			<select
				value={preset}
				onchange={(event) => onpreset(event.currentTarget.value)}
				disabled={busy}
			>
				{#each presets as option (option.id)}
					<option value={option.id} disabled={option.disabled}>{option.label}</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Presentation speed</span>
			<select
				value={speed}
				onchange={(event) => onspeed(Number(event.currentTarget.value))}
				disabled={busy}
			>
				{#each speeds as option (option)}
					<option value={option}>{option}×</option>
				{/each}
			</select>
		</label>
	</div>

	<fieldset>
		<legend>Pointer mode</legend>
		<div class="segmented">
			<button
				type="button"
				class:active={mode === 'draw'}
				aria-pressed={mode === 'draw'}
				onclick={() => onmode('draw')}
			>
				Draw timeline
			</button>
			<button
				type="button"
				class:active={mode === 'inject'}
				aria-pressed={mode === 'inject'}
				onclick={() => onmode('inject')}
			>
				Live inject
			</button>
		</div>
	</fieldset>

	<div class="clock" id="{uid}-clock">
		<span class="clock-label">Shared clock</span>
		<strong>{Math.min(timeMs, durationMs).toFixed(timeMs < 10 ? 3 : 1)} ms</strong>
		<span>/ {durationMs.toLocaleString()} ms</span>
		<span class="fixed-step">fixed Δt {dtMs} ms</span>
	</div>
</section>

<style>
	.transport {
		display: grid;
		grid-template-columns: auto minmax(15rem, 1fr) auto minmax(12rem, auto);
		align-items: end;
		gap: 0.8rem 1rem;
		border-bottom: 1px solid #262c36;
		padding-bottom: 1rem;
	}
	.primary,
	.selectors,
	.segmented {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	button,
	select {
		min-height: 2.75rem;
		border: 1px solid #343c49;
		border-radius: 0.45rem;
		background: #121720;
		color: #e7ecf3;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 750;
	}
	button {
		padding: 0.55rem 0.75rem;
		cursor: pointer;
	}
	button.play {
		border-color: #f4d58d;
		background: #f4d58d;
		color: #17130a;
	}
	button:hover:not(:disabled),
	select:hover:not(:disabled) {
		border-color: #a9b4c4;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 3px solid #f4d58d;
		outline-offset: 3px;
	}
	button:disabled,
	select:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}
	.step-value {
		color: #9ba7b8;
		font:
			0.67rem ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
	}
	.selectors {
		align-items: end;
	}
	label {
		display: grid;
		gap: 0.3rem;
		min-width: 9.5rem;
		color: #9faaba;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	select {
		width: 100%;
		padding: 0.45rem 2rem 0.45rem 0.65rem;
		text-transform: none;
	}
	fieldset {
		min-width: 0;
		margin: 0;
		border: 0;
		padding: 0;
	}
	legend {
		margin-bottom: 0.3rem;
		color: #9faaba;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.segmented {
		flex-wrap: nowrap;
	}
	.segmented button {
		flex: 1;
		white-space: nowrap;
	}
	.segmented button.active {
		border-color: #f4d58d;
		background: #282418;
		color: #fff4ce;
	}
	.clock {
		display: grid;
		grid-template-columns: auto auto;
		align-items: baseline;
		justify-content: end;
		gap: 0.1rem 0.35rem;
		color: #9faaba;
		font:
			0.72rem/1.2 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
		text-align: right;
	}
	.clock strong {
		color: #fff;
		font-size: 1.05rem;
		font-variant-numeric: tabular-nums;
	}
	.clock-label,
	.fixed-step {
		grid-column: 1 / -1;
	}
	.clock-label {
		color: #f4d58d;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.fixed-step {
		margin-top: 0.2rem;
		color: #7f8998;
	}
	@media (max-width: 70rem) {
		.transport {
			grid-template-columns: 1fr 1fr;
		}
		.clock {
			justify-content: start;
			text-align: left;
		}
	}
	@media (max-width: 43rem) {
		.transport {
			grid-template-columns: 1fr;
			align-items: stretch;
		}
		.primary {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.primary button {
			padding-inline: 0.25rem;
		}
		.selectors {
			display: grid;
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		}
		.selectors label,
		.selectors select {
			min-width: 0;
		}
		.clock {
			position: sticky;
			bottom: 0;
			z-index: 3;
			grid-template-columns: auto auto auto;
			justify-content: start;
			border: 1px solid #303744;
			border-radius: 0.55rem;
			background: rgb(9 12 18 / 0.94);
			padding: 0.7rem;
			backdrop-filter: blur(8px);
		}
		.clock-label,
		.fixed-step {
			grid-column: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button,
		select {
			transition: none;
		}
	}
</style>
