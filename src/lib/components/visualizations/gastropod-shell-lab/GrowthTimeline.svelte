<script lang="ts">
	interface TimelineEvent {
		age: number;
		label: string;
		kind: 'rib' | 'varix' | 'spine' | 'hierarchy' | 'twist' | 'burst';
	}

	interface Props {
		age: number;
		engine: 'analytic' | 'accretion';
		playing: boolean;
		loop: boolean;
		speed: number;
		ringCount: number;
		turns: number;
		events?: TimelineEvent[];
		onagechange: (age: number) => void;
		ontoggle: () => void;
		onstep: (direction: -1 | 1) => void;
		onrestart: (play?: boolean) => void;
		onloopchange: (value: boolean) => void;
		onspeedchange: (value: number) => void;
	}

	let {
		age,
		engine,
		playing,
		loop,
		speed,
		ringCount,
		turns,
		events = [],
		onagechange,
		ontoggle,
		onstep,
		onrestart,
		onloopchange,
		onspeedchange
	}: Props = $props();

	let holding = $state(false);
	let holdTimer: ReturnType<typeof setInterval> | undefined;

	let currentRing = $derived(
		Math.min(ringCount, Math.max(1, Math.floor(age * (ringCount - 1)) + 1))
	);
	let currentSpan = $derived(age * turns);
	let depositionLabel = $derived(
		age >= 1 ? 'Adult aperture reached' : `${Math.round(age * 100)}% of history deposited`
	);

	function readRange(event: Event): number {
		return Number((event.currentTarget as HTMLInputElement).value);
	}

	function startHold(): void {
		holding = true;
		if (holdTimer !== undefined) clearInterval(holdTimer);
		holdTimer = setInterval(() => onagechange(Math.min(1, age + 1 / Math.max(80, ringCount))), 28);
	}

	function stopHold(): void {
		holding = false;
		if (holdTimer !== undefined) {
			clearInterval(holdTimer);
			holdTimer = undefined;
		}
	}
</script>

<section class="timeline" aria-label="Growth timeline">
	<div class="timeline-controls">
		<button
			class="icon-button"
			type="button"
			onclick={() => onrestart(false)}
			aria-label="Restart growth">↺</button
		>
		<button
			class="icon-button"
			type="button"
			onclick={() => onstep(-1)}
			aria-label="Step one aperture ring backward">‹</button
		>
		<button
			class="play"
			type="button"
			onclick={ontoggle}
			aria-label={playing ? 'Pause growth' : 'Play growth'}
		>
			<span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
			<span>{playing ? 'Pause' : 'Grow'}</span>
		</button>
		<button
			class="icon-button"
			type="button"
			onclick={() => onstep(1)}
			aria-label="Step one aperture ring forward">›</button
		>
		<button
			class="hold-button"
			type="button"
			class:is-holding={holding}
			onpointerdown={startHold}
			onpointerup={stopHold}
			onpointercancel={stopHold}
			onpointerleave={stopHold}
		>
			Hold to grow
		</button>
	</div>

	<div class="track-area">
		<div class="track-labels">
			<span>{depositionLabel}</span>
			<span class="number"
				>ring {currentRing}/{ringCount} · {engine === 'analytic' ? 'turn' : 'integration span'}
				{currentSpan.toFixed(2)}/{turns.toFixed(2)}</span
			>
		</div>
		<div class="track-wrap">
			<input
				type="range"
				min="0"
				max="1"
				step={1 / Math.max(2, ringCount - 1)}
				value={age}
				aria-label="Deposited shell age"
				aria-valuetext={`${Math.round(age * 100)} percent of aperture history deposited, ring ${currentRing} of ${ringCount}`}
				oninput={(event) => onagechange(readRange(event))}
				style={`--age: ${age * 100}%`}
			/>
			<div class="markers" aria-hidden="true">
				{#each Array.from(Array(Math.floor(turns) + 1).keys()) as index (index)}
					<i class="turn-marker" style={`left:${(index / turns) * 100}%`}></i>
				{/each}
				{#each events as event, index (`${event.kind}-${event.age}-${index}`)}
					<i
						class={`event-marker ${event.kind}`}
						style={`left:${event.age * 100}%`}
						title={event.label}
					></i>
				{/each}
			</div>
		</div>
		<div class="history-endpoints" aria-hidden="true">
			<span>First deposited aperture</span><span>Adult aperture</span>
		</div>
	</div>

	<div class="timeline-options">
		<label class="speed">
			<span>Speed</span>
			<select
				value={speed}
				onchange={(event) =>
					onspeedchange(Number((event.currentTarget as HTMLSelectElement).value))}
			>
				<option value="0.25">0.25×</option>
				<option value="0.5">0.5×</option>
				<option value="1">1×</option>
				<option value="2">2×</option>
				<option value="4">4×</option>
			</select>
		</label>
		<label class="loop">
			<input
				type="checkbox"
				checked={loop}
				onchange={(event) => onloopchange((event.currentTarget as HTMLInputElement).checked)}
			/>
			<span>Loop</span>
		</label>
	</div>
</section>

<style>
	.timeline {
		display: grid;
		grid-template-columns: auto minmax(180px, 1fr) auto;
		align-items: center;
		gap: 1rem;
		min-height: 78px;
		padding: 0.65rem 0.9rem;
		border-top: 1px solid var(--line);
		background: var(--bg-raised);
	}

	.timeline-controls,
	.timeline-options {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.play,
	.hold-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.42rem;
		min-height: 38px;
		padding: 0.45rem 0.68rem;
		border: 1px solid var(--amber-soft);
		border-radius: 8px;
		background: color-mix(in srgb, var(--amber-soft) 20%, var(--panel));
		font-size: 0.72rem;
		font-weight: 680;
		color: var(--amber);
	}

	.hold-button {
		border-color: var(--line);
		background: var(--panel);
		color: var(--muted);
		font-size: 0.62rem;
		touch-action: none;
	}

	.hold-button.is-holding {
		border-color: var(--amber);
		background: var(--amber);
		color: #22180d;
	}

	.track-area {
		min-width: 0;
	}

	.track-labels,
	.history-endpoints {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.58rem;
		color: var(--muted);
	}

	.track-labels > span:first-child {
		font-weight: 680;
		color: var(--amber);
	}

	.track-wrap {
		position: relative;
		height: 24px;
		margin: 0.2rem 0 0.05rem;
	}

	.track-wrap input {
		position: absolute;
		inset: 0;
		z-index: 3;
		width: 100%;
		height: 24px;
		margin: 0;
		appearance: none;
		background: transparent;
	}

	.track-wrap input::-webkit-slider-runnable-track {
		height: 5px;
		border-radius: 999px;
		background: linear-gradient(
			to right,
			var(--amber) 0 var(--age),
			var(--line-bright) var(--age) 100%
		);
	}

	.track-wrap input::-moz-range-track {
		height: 5px;
		border-radius: 999px;
		background: var(--line-bright);
	}

	.track-wrap input::-moz-range-progress {
		height: 5px;
		border-radius: 999px;
		background: var(--amber);
	}

	.track-wrap input::-webkit-slider-thumb {
		width: 17px;
		height: 17px;
		margin-top: -6px;
		border: 3px solid var(--bg-raised);
		border-radius: 50%;
		appearance: none;
		background: var(--shell);
		box-shadow: 0 0 0 1px var(--amber);
	}

	.track-wrap input::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border: 3px solid var(--bg-raised);
		border-radius: 50%;
		background: var(--shell);
		box-shadow: 0 0 0 1px var(--amber);
	}

	.markers {
		position: absolute;
		inset: 0 7px;
		z-index: 1;
		pointer-events: none;
	}

	.markers i {
		position: absolute;
		display: block;
		transform: translateX(-50%);
	}

	.turn-marker {
		top: 5px;
		width: 1px;
		height: 13px;
		background: var(--line-bright);
	}

	.event-marker {
		top: 0;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--cyan);
	}

	.event-marker.varix,
	.event-marker.spine {
		background: var(--amber);
	}

	.event-marker.hierarchy {
		border-radius: 0;
		background: var(--danger);
		transform: translateX(-50%) rotate(45deg);
	}

	.history-endpoints {
		font-size: 0.5rem;
		color: var(--faint);
	}

	.timeline-options {
		gap: 0.65rem;
	}

	.speed,
	.loop {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.58rem;
		color: var(--muted);
	}

	.speed select {
		min-height: 32px;
		padding: 0.25rem 0.36rem;
		border: 1px solid var(--line);
		border-radius: 5px;
		background: var(--panel);
		color: var(--text);
		font-size: 0.62rem;
	}

	.loop input {
		width: 15px;
		height: 15px;
		accent-color: var(--amber);
	}

	@media (max-width: 900px) {
		.timeline {
			grid-template-columns: auto minmax(120px, 1fr);
			gap: 0.65rem;
		}

		.timeline-options {
			display: none;
		}

		.hold-button {
			display: none;
		}
	}

	@media (max-width: 560px) {
		.timeline {
			grid-template-columns: 1fr;
			gap: 0.42rem;
			min-height: 108px;
			padding: 0.5rem 0.65rem;
		}

		.timeline-controls {
			justify-content: center;
			order: 2;
		}

		.track-area {
			order: 1;
		}

		.play,
		.icon-button {
			min-height: 38px;
		}

		.history-endpoints {
			display: none;
		}
	}
</style>
