<script lang="ts">
	import { formatMeasurement } from '$lib/visualizations/circuit-bench/notation';

	interface Props {
		label: string;
		value: number | null;
		unit: 'V' | 'A' | 'W';
		min: number;
		max: number;
	}

	let { label, value, unit, min, max }: Props = $props();

	const safeRange = $derived(Math.max(1e-9, max - min));
	const norm = $derived(
		value === null || !Number.isFinite(value)
			? 0
			: Math.min(1, Math.max(0, (value - min) / safeRange))
	);
	const needleX = $derived(18 + norm * 224);
	const formatted = $derived(formatMeasurement(value, unit));
	const midValue = $derived((min + max) / 2);
</script>

<div class="cb-meter-window" role="region" aria-label={`Analogue and digital meter for ${label}`}>
	<div class="cb-meter-header">
		<span>{label}</span>
		<span class="cb-meter-readout-big">{formatted}</span>
	</div>

	<svg
		viewBox="0 0 260 54"
		width="100%"
		height="54"
		aria-hidden="true"
		style="background:#17100B;border:1px solid #402615;border-radius:4px;"
	>
		<defs>
			<linearGradient id="cb-meter-glow" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#3D200E" />
				<stop offset="50%" stop-color="#291509" />
				<stop offset="100%" stop-color="#140B05" />
			</linearGradient>
		</defs>
		<rect x="0" y="0" width="260" height="54" fill="url(#cb-meter-glow)" />

		<!-- Scale baseline -->
		<line x1="18" y1="34" x2="242" y2="34" stroke="#EF762F" stroke-width="1.2" opacity="0.65" />

		<!-- Scale graduation ticks -->
		{#each Array.from({ length: 21 }, (_, i) => i) as tick (tick)}
			{@const tx = 18 + (tick / 20) * 224}
			{@const isMajor = tick % 5 === 0}
			<line
				x1={tx}
				y1={isMajor ? 18 : 24}
				x2={tx}
				y2="34"
				stroke="#EF762F"
				stroke-width={isMajor ? 1.5 : 1}
				opacity={isMajor ? 0.9 : 0.55}
			/>
		{/each}

		<!-- Scale labels -->
		<text x="18" y="47" fill="#F1EEE7" font-family="IBM Plex Mono, monospace" font-size="9.5">
			{formatMeasurement(min, unit)}
		</text>
		<text
			x="130"
			y="47"
			text-anchor="middle"
			fill="#B8BFC5"
			font-family="IBM Plex Mono, monospace"
			font-size="9.5"
		>
			{formatMeasurement(midValue, unit)}
		</text>
		<text
			x="242"
			y="47"
			text-anchor="end"
			fill="#F1EEE7"
			font-family="IBM Plex Mono, monospace"
			font-size="9.5"
		>
			{formatMeasurement(max, unit)}
		</text>

		<!-- Active pointer needle -->
		{#if value !== null && Number.isFinite(value)}
			<line
				x1={needleX}
				y1="6"
				x2={needleX}
				y2="37"
				stroke="#F1EEE7"
				stroke-width="2.2"
				stroke-linecap="round"
			/>
			<polygon points={`${needleX - 4},6 ${needleX + 4},6 ${needleX},13`} fill="#EF762F" />
		{/if}
	</svg>
</div>
