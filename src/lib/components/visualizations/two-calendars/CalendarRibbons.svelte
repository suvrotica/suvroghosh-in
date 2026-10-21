<script lang="ts">
	import { onMount } from 'svelte';
	import { events, connections } from '$lib/visualizations/two-calendars/data';
	import {
		getDateBounds,
		formatHistoricalDate
	} from '$lib/visualizations/two-calendars/chronology';
	import type { HistoricalEvent } from '$lib/visualizations/two-calendars/types';

	let {
		year = 1947,
		selectedIds = [],
		connectionId = null,
		compact = false,
		prefix = 'atlas',
		onselect
	}: {
		year: number;
		selectedIds?: string[];
		connectionId?: string | null;
		compact?: boolean;
		prefix?: string;
		onselect: (event: HistoricalEvent) => void;
	} = $props();
	let host: HTMLDivElement;
	let width = $state(640);
	const years = Array.from({ length: 20 }, (_, i) => 1940 + i);
	const start = Date.UTC(1940, 0, 1);
	const end = Date.UTC(1960, 0, 1);
	const height = $derived(compact ? 480 : 580);
	const top = 35;
	const bottom = $derived(height - 30);
	const axisY = (value: number) => top + ((value - 1940 + 0.5) / 20) * (bottom - top);
	function eventY(event: HistoricalEvent) {
		const bounds = getDateBounds(event.date);
		return top + (((bounds.start + bounds.end) / 2 - start) / (end - start)) * (bottom - top);
	}
	function eventX(event: HistoricalEvent) {
		const sameSide = events.filter((item) => item.side === event.side);
		const lane = sameSide.findIndex((item) => item.id === event.id) % 3;
		return (
			width * (event.side === 'calcutta' ? 0.23 : 0.77) + (lane - 1) * Math.min(44, width * 0.135)
		);
	}
	function connector(left: HistoricalEvent, right: HistoricalEvent) {
		return `M ${eventX(left)} ${eventY(left)} C ${width * 0.46} ${eventY(left)}, ${width * 0.54} ${eventY(right)}, ${eventX(right)} ${eventY(right)}`;
	}
	onMount(() => {
		const observer = new ResizeObserver(([entry]) => {
			width = Math.max(240, Math.round(entry.contentRect.width));
		});
		observer.observe(host);
		return () => observer.disconnect();
	});
</script>

<div class="tc-ribbons" bind:this={host}>
	<svg viewBox={`0 0 ${width} ${height}`} {width} {height} aria-labelledby={`${prefix}-title`}>
		<title id={`${prefix}-title`}
			>Two calendar ribbons, 1940 to 1959. Select a historical record to read its sources.</title
		>
		<defs>
			<pattern id={`${prefix}-days`} width="14" height="14" patternUnits="userSpaceOnUse"
				><path
					d="M14 0H0V14"
					fill="none"
					stroke="currentColor"
					stroke-width="0.45"
					opacity="0.12"
				/></pattern
			>
			<linearGradient id={`${prefix}-calcutta`} x1="0" x2="1"
				><stop offset="0" stop-color="#ad5740" stop-opacity="0.04" /><stop
					offset="1"
					stop-color="#ad5740"
					stop-opacity="0.14"
				/></linearGradient
			>
			<linearGradient id={`${prefix}-america`} x1="0" x2="1"
				><stop offset="0" stop-color="#33777b" stop-opacity="0.15" /><stop
					offset="1"
					stop-color="#33777b"
					stop-opacity="0.03"
				/></linearGradient
			>
		</defs>
		<g aria-hidden="true">
			{#each ['calcutta', 'america'] as side, i (side)}
				<rect
					x={width * (i === 0 ? 0.055 : 0.625)}
					y="18"
					width={width * 0.32}
					height={height - 36}
					rx="2"
					fill={`url(#${prefix}-${side})`}
				/>
				<rect
					x={width * (i === 0 ? 0.055 : 0.625)}
					y="18"
					width={width * 0.32}
					height={height - 36}
					fill={`url(#${prefix}-days)`}
				/>
			{/each}
			<line x1={width / 2} x2={width / 2} y1="19" y2={height - 18} class="tc-axis" />
			{#each years as tick (tick)}
				<line
					x1={width * 0.055}
					x2={width * 0.375}
					y1={axisY(tick)}
					y2={axisY(tick)}
					class="tc-year-rule"
				/>
				<line
					x1={width * 0.625}
					x2={width * 0.945}
					y1={axisY(tick)}
					y2={axisY(tick)}
					class="tc-year-rule"
				/>
				<rect x={width / 2 - 23} y={axisY(tick) - 9} width="46" height="18" class="tc-axis-paper" />
				<text
					x={width / 2}
					y={axisY(tick) + 4}
					text-anchor="middle"
					class:tc-tick-active={tick === year}
					class="tc-year-tick">{tick}</text
				>
			{/each}
			<rect x="0" y={axisY(year) - 12} {width} height="24" class="tc-current-band" />
			<path
				d={`M 0 ${axisY(year)} H ${width * 0.405} M ${width * 0.595} ${axisY(year)} H ${width}`}
				class="tc-current-line"
			/>
			{#each connections as connection (connection.id)}
				{@const left = events.find((event) => event.id === connection.leftId)}
				{@const right = events.find((event) => event.id === connection.rightId)}
				{#if left && right}
					<path
						d={connector(left, right)}
						class="tc-thread"
						class:tc-thread-selected={connection.id === connectionId}
						class:tc-thread-theme={connection.kind === 'thematic'}
						class:tc-thread-time={connection.kind === 'shared-time'}
					/>
				{/if}
			{/each}
		</g>
		{#each events as event (event.id)}
			{@const selected = selectedIds.includes(event.id)}
			{@const bounds = getDateBounds(event.date)}
			<a
				href={`#record-${event.id}`}
				onclick={(e) => {
					e.preventDefault();
					onselect(event);
				}}
				aria-label={`${formatHistoricalDate(event.date)}: ${event.title}. ${event.scope}`}
				class="tc-event-link"
				class:tc-event-selected={selected}
			>
				<title>{event.title} · {formatHistoricalDate(event.date)} · {event.scope}</title>
				{#if event.date.kind !== 'point'}
					<line
						x1={eventX(event)}
						x2={eventX(event)}
						y1={top + ((bounds.start - start) / (end - start)) * (bottom - top)}
						y2={top + ((bounds.end - start) / (end - start)) * (bottom - top)}
						class="tc-event-interval"
						class:tc-calcutta-interval={event.side === 'calcutta'}
						class:tc-uncertain={event.date.kind === 'uncertain'}
					/>
				{/if}
				<circle cx={eventX(event)} cy={eventY(event)} r="22" fill="transparent" />
				{#if selected}<circle
						cx={eventX(event)}
						cy={eventY(event)}
						r="13"
						class="tc-event-halo"
					/>{/if}
				<circle
					cx={eventX(event)}
					cy={eventY(event)}
					r={selected ? 6.5 : 4}
					class="tc-event-dot"
					class:tc-calcutta-dot={event.side === 'calcutta'}
				/>
				{#if event.date.precision !== 'day' && event.date.kind === 'point'}<line
						x1={eventX(event) - 9}
						x2={eventX(event) + 9}
						y1={eventY(event)}
						y2={eventY(event)}
						class="tc-precision-mark"
					/>{/if}
			</a>
		{/each}
	</svg>
</div>
