<script lang="ts">
	import type { LightningFlash } from '$lib/visualizations/lightning-atlas/types';
	type BranchEmphasis = 'primary' | 'full';

	type Props = {
		flash: LightningFlash | null;
		time: number;
		duration: number;
		playing: boolean;
		phaseLabel: string;
		speed: number;
		branchEmphasis: BranchEmphasis;
		replayMode: boolean;
		onseek?: (time: number) => void;
		onstep?: (direction: -1 | 1) => void;
		onplaytoggle?: () => void;
		onspeed?: (speed: number) => void;
		onbranchemphasis?: (emphasis: BranchEmphasis) => void;
	};

	let {
		flash,
		time,
		duration,
		playing,
		phaseLabel,
		speed,
		branchEmphasis,
		replayMode,
		onseek,
		onstep,
		onplaytoggle,
		onspeed,
		onbranchemphasis
	}: Props = $props();

	const formatTime = (value: number) => `${Math.max(0, value).toFixed(1)} s`;

	function handleTimelineKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			onseek?.(Math.max(0, time - 0.1));
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			onseek?.(Math.min(duration, time + 0.1));
		}
	}
</script>

<section class="timeline" aria-label="Storm replay timeline">
	<div class="timeline-heading">
		<div>
			<span class="eyebrow">Visualised time</span>
			<strong>{flash ? phaseLabel : 'Awaiting a strike'}</strong>
		</div>
		<span class="clock">{formatTime(time)} / {formatTime(duration)}</span>
	</div>

	<div class="transport">
		<button
			type="button"
			onclick={() => onstep?.(-1)}
			disabled={!flash}
			aria-label="Previous phase"
		>
			Previous phase
		</button>
		<button type="button" class="play" onclick={onplaytoggle} disabled={!flash}>
			{playing ? 'Pause' : 'Play'}
		</button>
		<button type="button" onclick={() => onstep?.(1)} disabled={!flash} aria-label="Next phase">
			Next phase
		</button>
		<label>
			<span>Speed</span>
			<select value={speed} onchange={(event) => onspeed?.(Number(event.currentTarget.value))}>
				<option value={0.25}>0.25×</option>
				<option value={0.5}>0.5×</option>
				<option value={1}>1×</option>
				<option value={2}>2×</option>
				<option value={4}>4×</option>
			</select>
		</label>
	</div>

	<fieldset class="branch-reader" disabled={!flash || !replayMode}>
		<legend>Branch emphasis</legend>
		<div role="group" aria-describedby="lightning-atlas-branch-reading-note">
			<button
				type="button"
				aria-pressed={branchEmphasis === 'primary'}
				onclick={() => onbranchemphasis?.('primary')}>Main + primary</button
			>
			<button
				type="button"
				aria-pressed={branchEmphasis === 'full'}
				onclick={() => onbranchemphasis?.('full')}>Full network</button
			>
		</div>
		<p id="lightning-atlas-branch-reading-note">
			{!replayMode
				? 'Replay the current flash to compare its major routes with the complete generated network.'
				: branchEmphasis === 'primary'
					? 'The trunk and strongest first-order routes stay prominent at a measured replay pace; the generated network and channel hash do not change.'
					: 'Secondary and tertiary routes return in their original birth order; the generated network and channel hash do not change.'}
		</p>
	</fieldset>

	<div class="range-wrap">
		<input
			type="range"
			min="0"
			max={Math.max(0.01, duration)}
			step="0.01"
			value={time}
			disabled={!flash}
			oninput={(event) => onseek?.(Number(event.currentTarget.value))}
			onkeydown={handleTimelineKeydown}
			aria-label={`Storm replay time: ${formatTime(time)}. ${phaseLabel}`}
		/>
		{#if flash}
			<div class="phase-track" aria-hidden="true">
				{#each flash.phaseEvents as event (event.phase)}
					<span
						style={`left:${(event.startTime / duration) * 100}%;width:${((event.endTime - event.startTime) / duration) * 100}%`}
						title={event.label}
					></span>
				{/each}
			</div>
		{/if}
	</div>

	{#if flash}
		<ol class="phase-list" aria-label="Strike phases">
			{#each flash.phaseEvents as event (event.phase)}
				<li class:current={time >= event.startTime && time < event.endTime}>
					<button
						type="button"
						aria-current={time >= event.startTime && time < event.endTime ? 'step' : undefined}
						onclick={() => onseek?.(event.startTime + 0.001)}
					>
						{event.label}
					</button>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.timeline {
		border-top: 1px solid var(--atlas-line);
		background: var(--atlas-panel-strong);
		padding: 0.8rem 1rem 1rem;
		color: var(--atlas-text);
	}

	.timeline-heading,
	.transport {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.timeline-heading > div {
		display: grid;
		gap: 0.08rem;
	}

	.eyebrow,
	.clock,
	.transport label span {
		color: var(--atlas-muted);
		font-family: 'Courier Prime', monospace;
		font-size: 0.67rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.transport {
		justify-content: flex-start;
		margin-top: 0.65rem;
		flex-wrap: wrap;
	}

	button,
	select {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-control);
		padding: 0.42rem 0.65rem;
		color: inherit;
		font: inherit;
		font-size: 0.72rem;
	}

	button:hover:not(:disabled),
	button:focus-visible,
	select:focus-visible {
		border-color: var(--atlas-accent);
		outline: 2px solid transparent;
	}

	button:disabled {
		opacity: 0.45;
	}

	button.play {
		min-width: 4.8rem;
		border-color: color-mix(in srgb, var(--atlas-accent) 70%, transparent);
	}

	.transport label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-left: auto;
	}

	.branch-reader {
		display: grid;
		grid-template-columns: minmax(14rem, 0.65fr) minmax(14rem, 1fr);
		align-items: center;
		gap: 0.65rem;
		margin: 0.7rem 0 0;
		border: 1px solid var(--atlas-line);
		border-radius: 0.4rem;
		padding: 0.6rem 0.7rem;
	}
	.branch-reader legend {
		padding-inline: 0.25rem;
		color: var(--atlas-muted);
		font:
			0.65rem 'Courier Prime',
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.branch-reader > div {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem;
	}
	.branch-reader button[aria-pressed='true'] {
		border-color: var(--atlas-accent);
		background: color-mix(in srgb, var(--atlas-accent) 14%, var(--atlas-control));
		color: var(--atlas-accent);
	}
	.branch-reader p {
		margin: 0;
		color: var(--atlas-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}
	.branch-reader:disabled {
		opacity: 0.55;
	}

	.range-wrap {
		position: relative;
		margin-top: 0.7rem;
		padding-bottom: 0.36rem;
	}

	input[type='range'] {
		position: relative;
		z-index: 2;
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--atlas-accent);
	}

	.phase-track {
		position: absolute;
		inset: 1.35rem 0 0;
		height: 0.25rem;
		overflow: hidden;
		border-radius: 99px;
		background: var(--atlas-line);
	}

	.phase-track span {
		position: absolute;
		top: 0;
		height: 100%;
		border-right: 1px solid var(--atlas-panel-strong);
		background: color-mix(in srgb, var(--atlas-accent) 52%, var(--atlas-line));
	}

	.phase-list {
		display: flex;
		gap: 0.3rem;
		margin: 0.7rem 0 0;
		padding: 0;
		list-style: none;
		overflow-x: auto;
		scrollbar-width: thin;
	}

	.phase-list button {
		min-height: 2.75rem;
		white-space: nowrap;
		border-color: transparent;
		background: transparent;
		padding: 0.25rem 0.38rem;
		color: var(--atlas-muted);
	}

	.phase-list .current button {
		color: var(--atlas-accent);
		text-decoration: underline;
		text-underline-offset: 0.25rem;
	}

	@media (max-width: 520px) {
		.timeline {
			padding-inline: 0.7rem;
		}

		.transport label {
			width: 100%;
			margin-left: 0;
		}

		.branch-reader {
			grid-template-columns: 1fr;
		}
	}
</style>
