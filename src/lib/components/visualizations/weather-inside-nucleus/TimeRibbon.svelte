<script lang="ts">
	import type { ScalarTrace, TraceView } from './ui-types';
	import { sampleIndexAtOrBefore } from '$lib/visualizations/weather-inside-nucleus/sampling';

	type Props = {
		trace: TraceView | null;
		currentTime?: number;
		disabled?: boolean;
		onseek?: (time: number) => void;
	};

	let { trace, currentTime = 0, disabled = false, onseek }: Props = $props();

	const plot = { left: 92, right: 880, top: 16, activityBottom: 82, promoterY: 116 };

	function x(time: number, duration = trace?.duration ?? 1) {
		return plot.left + (time / Math.max(duration, Number.EPSILON)) * (plot.right - plot.left);
	}

	function activityPath(values: ScalarTrace | undefined, duration: number) {
		if (!values || values.length === 0) return '';
		const step = Math.max(1, Math.floor(values.length / 260));
		let path = '';
		for (let index = 0; index < values.length; index += step) {
			const time = (index / Math.max(1, values.length - 1)) * duration;
			const px = x(time, duration);
			const py = plot.activityBottom - Math.max(0, Math.min(1, values[index])) * 58;
			path += `${path ? ' L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`;
		}
		const last = values.length - 1;
		if (last % step !== 0) {
			path += ` L${x(duration, duration).toFixed(2)} ${(plot.activityBottom - Math.max(0, Math.min(1, values[last])) * 58).toFixed(2)}`;
		}
		return path;
	}

	function promoterPath(values: Uint8Array | undefined, duration: number) {
		if (!values || values.length === 0) return '';
		const step = Math.max(1, Math.floor(values.length / 420));
		let path = `M${plot.left} ${plot.promoterY + (values[0] ? -13 : 8)}`;
		let previous = values[0];
		for (let index = step; index < values.length; index += step) {
			const value = values[index];
			const px = x((index / Math.max(1, values.length - 1)) * duration, duration);
			if (value !== previous) {
				path += ` H${px.toFixed(2)} V${(plot.promoterY + (value ? -13 : 8)).toFixed(2)}`;
				previous = value;
			}
		}
		return `${path} H${plot.right}`;
	}

	let activityPathData = $derived(activityPath(trace?.downstreamActivity, trace?.duration ?? 1));
	let promoterPathData = $derived(promoterPath(trace?.promoterState, trace?.duration ?? 1));
	let currentX = $derived(x(currentTime, trace?.duration ?? 1));
	let selectedIndex = $derived(sampleIndexAtOrBefore(trace?.times, currentTime));
	let selectedActivity = $derived(trace?.downstreamActivity[selectedIndex] ?? 0);
	let selectedPromoter = $derived(trace?.promoterState[selectedIndex] ? 'ON' : 'OFF');
	let selectedEvents = $derived(
		trace ? trace.initiationTimes.filter((time) => time <= currentTime).length : 0
	);

	function seek(event: Event) {
		onseek?.(Number((event.currentTarget as HTMLInputElement).value));
	}
</script>

<div class="time-ribbon" data-testid="nucleus-time-ribbon">
	<div class="ribbon-heading">
		<span>One possible history</span>
		<output>{currentTime.toFixed(1)} model min</output>
	</div>
	<svg
		viewBox="0 0 900 150"
		role="img"
		aria-label={`Model-time ribbon at ${currentTime.toFixed(1)} minutes: downstream activity ${selectedActivity.toFixed(2)}, promoter ${selectedPromoter}, ${selectedEvents} initiation events so far.`}
	>
		<defs>
			<pattern id="wn-off-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
				<path d="M0 8 L8 0" stroke="#7b7e91" stroke-opacity="0.24" />
			</pattern>
		</defs>
		<rect
			x={plot.left}
			y="13"
			width={plot.right - plot.left}
			height="75"
			rx="5"
			fill="#080b19"
			stroke="#34384f"
		/>
		<rect
			x={plot.left}
			y="96"
			width={plot.right - plot.left}
			height="38"
			rx="5"
			fill="url(#wn-off-pattern)"
			stroke="#34384f"
		/>
		<text x="8" y="32">activity</text>
		<text x="8" y="121">promoter</text>
		<text x={plot.left + 7} y="131" class="state-label">OFF</text>
		<text x={plot.left + 7} y="107" class="state-label on">ON</text>
		{#if trace}
			<path
				d={activityPathData}
				fill="none"
				stroke="#6ce5ff"
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
			<path
				d={promoterPathData}
				fill="none"
				stroke="#ffd166"
				stroke-width="4"
				stroke-linejoin="round"
			/>
			{#each trace.initiationTimes as eventTime, index (`${eventTime}-${index}`)}
				<path d={`M${x(eventTime).toFixed(2)} 92 V140`} stroke="#f7fbff" stroke-width="2" />
				<circle cx={x(eventTime)} cy="141" r="3.5" fill="#f7fbff" />
			{/each}
		{/if}
		<path
			d={`M${currentX.toFixed(2)} 8 V142`}
			stroke="#ed62d0"
			stroke-width="2"
			stroke-dasharray="3 4"
		/>
	</svg>
	<label>
		<span>Model time</span>
		<input
			type="range"
			min="0"
			max={trace?.duration ?? 60}
			step="0.1"
			value={currentTime}
			{disabled}
			oninput={seek}
		/>
	</label>
</div>

<style>
	.time-ribbon {
		border-top: 1px solid rgb(157 155 198 / 28%);
		background: rgb(5 7 18 / 92%);
		padding: 0.7rem clamp(0.75rem, 2vw, 1.2rem) 0.8rem;
		color: #e7e6f2;
	}

	.ribbon-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		font: 700 0.68rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.ribbon-heading output {
		color: #aeb1c8;
		font-variant-numeric: tabular-nums;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		margin-top: 0.25rem;
		overflow: visible;
	}

	svg text {
		fill: #9ea2bb;
		font:
			700 13px/1 ui-monospace,
			monospace;
		letter-spacing: 0.04em;
	}

	svg .state-label {
		fill: #81859c;
		font-size: 10px;
	}

	svg .state-label.on {
		fill: #ffd166;
	}

	label {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.75rem;
		font: 700 0.68rem/1.2 var(--font-sans, sans-serif);
	}

	input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		accent-color: #ed62d0;
	}

	input:focus-visible {
		outline: 3px solid #f7fbff;
		outline-offset: 2px;
	}

	@media (max-width: 480px) {
		.time-ribbon {
			padding-inline: 0.55rem;
		}

		svg text:first-of-type,
		svg text:nth-of-type(2) {
			display: none;
		}
	}

	@media (forced-colors: active) {
		.time-ribbon {
			border: 1px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
