<script lang="ts">
	import type { UiPlaybackStatus } from './ui-types';

	type Props = {
		status: UiPlaybackStatus;
		stepIndex: number;
		stepLabels: string[];
		speed: 0.5 | 1 | 1.5;
		reducedMotion?: boolean;
		progressionIndices?: number[];
		onplaypause?: () => void;
		onprevious?: () => void;
		onnext?: () => void;
		onstepchange?: (step: number) => void;
		onspeedchange?: (speed: 0.5 | 1 | 1.5) => void;
		onreplaystep?: () => void;
		onreplayjourney?: () => void;
		onreset?: () => void;
	};

	let {
		status,
		stepIndex,
		stepLabels,
		speed,
		reducedMotion = false,
		progressionIndices = [],
		onplaypause,
		onprevious,
		onnext,
		onstepchange,
		onspeedchange,
		onreplaystep,
		onreplayjourney,
		onreset
	}: Props = $props();

	let lastStep = $derived(Math.max(0, stepLabels.length - 1));
	let playing = $derived(status === 'playing');
	let effectiveProgression = $derived(
		progressionIndices.length
			? progressionIndices
			: Array.from({ length: stepLabels.length }, (_, index) => index)
	);
	let hasPrevious = $derived(effectiveProgression.some((index) => index < stepIndex));
	let hasNext = $derived(effectiveProgression.some((index) => index > stepIndex));
</script>

<section class="playback" aria-labelledby="playback-heading">
	<div class="heading-row">
		<div>
			<p class="eyebrow">Presentation controls</p>
			<h2 id="playback-heading">Milestone {stepIndex + 1} of {stepLabels.length}</h2>
		</div>
		<output aria-live="off">{stepLabels[stepIndex] ?? 'Journey ready'}</output>
	</div>

	<div class="transport" aria-label="Journey playback">
		<button type="button" onclick={onprevious} disabled={!hasPrevious}>Previous</button>
		<button
			type="button"
			class="primary"
			onclick={onplaypause}
			disabled={reducedMotion || status === 'error'}
			title={reducedMotion
				? 'Autoplay is unavailable while reduced motion is active. Use Previous and Next.'
				: undefined}
		>
			{playing ? 'Pause' : status === 'complete' ? 'Play again' : 'Play'}
		</button>
		<button type="button" onclick={onnext} disabled={!hasNext}>Next</button>
		<button type="button" onclick={onreplaystep}>Replay current step</button>
		<button type="button" onclick={onreplayjourney}>Replay journey</button>
		<button type="button" onclick={onreset}>Reset</button>
	</div>

	<div class="scrubber-row">
		<label for="pa-milestone-scrubber">Milestone scrubber</label>
		<input
			id="pa-milestone-scrubber"
			type="range"
			min="0"
			max={lastStep}
			step="1"
			value={stepIndex}
			aria-valuetext={`${stepIndex + 1} of ${stepLabels.length}: ${stepLabels[stepIndex] ?? ''}`}
			oninput={(event) => onstepchange?.(Number(event.currentTarget.value))}
		/>
		<fieldset>
			<legend>Playback speed</legend>
			{#each [0.5, 1, 1.5] as candidate}
				<label>
					<input
						type="radio"
						name="pa-playback-speed"
						value={candidate}
						checked={speed === candidate}
						disabled={reducedMotion}
						onchange={() => onspeedchange?.(candidate as 0.5 | 1 | 1.5)}
					/>
					<span>{candidate}×</span>
				</label>
			{/each}
		</fieldset>
	</div>

	{#if reducedMotion}
		<p class="motion-note">
			Reduced motion is active. Autoplay, token travel and counter tweening are off; Previous, Next
			and the scrubber change stable states immediately.
		</p>
	{/if}
</section>

<style>
	.playback {
		display: grid;
		gap: 0.65rem;
		border: 1px solid var(--rule);
		border-radius: 0.7rem;
		background: var(--paper-raised);
		padding: 0.75rem;
		color: var(--ink);
	}

	.heading-row,
	.scrubber-row,
	.transport {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.heading-row {
		justify-content: space-between;
		gap: 1rem;
	}

	.eyebrow,
	h2,
	.motion-note {
		margin: 0;
	}

	.eyebrow,
	.scrubber-row > label,
	legend {
		font: 750 0.6rem/1.25 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.065em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	h2 {
		font: 760 0.9rem/1.2 var(--font-sans, sans-serif);
	}

	output {
		max-width: 28rem;
		font: 680 0.73rem/1.35 var(--font-sans, sans-serif);
		text-align: right;
		color: var(--ink-muted);
	}

	.transport {
		flex-wrap: wrap;
	}

	button {
		min-height: 2.75rem;
		border: 1px solid var(--rule);
		border-radius: 0.48rem;
		background: var(--paper);
		padding: 0.5rem 0.68rem;
		font: 740 0.72rem/1 var(--font-sans, sans-serif);
		color: var(--ink);
		cursor: pointer;
	}

	button.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-foreground);
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.46;
	}

	button:focus-visible,
	input:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.scrubber-row {
		display: grid;
		grid-template-columns: auto minmax(6rem, 1fr) auto;
		gap: 0.7rem;
	}

	.scrubber-row > input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--accent);
	}

	fieldset {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.18rem;
		margin: 0;
		border: 0;
		padding: 0;
	}

	legend {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		border: 0;
		padding: 0;
		clip-path: inset(50%);
	}

	fieldset label {
		position: relative;
		isolation: isolate;
	}

	fieldset input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		border: 0;
		padding: 0;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
	}

	fieldset span {
		position: relative;
		z-index: 1;
		display: grid;
		min-width: 2.75rem;
		min-height: 2.75rem;
		place-items: center;
		border: 1px solid var(--rule);
		border-radius: 999px;
		font: 730 0.68rem/1 var(--font-mono, ui-monospace, monospace);
		cursor: pointer;
	}

	fieldset input:checked + span {
		border-color: var(--accent);
		background: var(--ink);
		color: var(--paper);
	}

	fieldset input:focus-visible + span {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.motion-note {
		border-left: 3px solid var(--accent);
		padding-left: 0.6rem;
		font: 0.68rem/1.4 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	@media (max-width: 48rem) {
		.heading-row,
		.scrubber-row {
			grid-template-columns: 1fr;
			align-items: stretch;
		}

		.heading-row {
			display: grid;
		}

		output {
			text-align: left;
		}

		.scrubber-row > label {
			display: none;
		}

		fieldset {
			justify-content: flex-start;
		}
	}

	@media (forced-colors: active) {
		.playback,
		button,
		fieldset span {
			border-color: CanvasText;
		}

		fieldset input {
			-webkit-appearance: none;
			appearance: none;
			forced-color-adjust: none;
		}

		fieldset span {
			background: Canvas;
			color: CanvasText;
			forced-color-adjust: none;
		}

		button.primary,
		fieldset input:checked + span {
			background: Highlight;
			color: HighlightText;
		}

		fieldset input:checked + span {
			outline: 2px solid CanvasText;
			outline-offset: -4px;
		}

		fieldset input:focus-visible + span {
			outline-color: Highlight;
		}
	}
</style>
