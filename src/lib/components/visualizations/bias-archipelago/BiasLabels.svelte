<script lang="ts">
	import type {
		Bias,
		BiasLayout,
		BiasPoint,
		BiasRelation,
		PeakMarker
	} from '$lib/visualizations/bias-archipelago/bias-types';

	let {
		biases,
		layout,
		relations,
		tide,
		zoom,
		selectedId,
		compareId,
		highlightedIds,
		markers,
		onselect,
		onkeyboard
	}: {
		biases: Bias[];
		layout: BiasLayout;
		relations: BiasRelation[];
		tide: number;
		zoom: number;
		selectedId?: string;
		compareId?: string;
		highlightedIds: string[];
		markers: Record<string, PeakMarker>;
		onselect: (id: string) => void;
		onkeyboard: (id: string, event: KeyboardEvent) => void;
	} = $props();

	const width = 1000;
	const height = 650;
	let biasById = $derived(new Map(biases.map((bias) => [bias.id, bias])));
	let pointById = $derived(new Map(layout.points.map((point) => [point.id, point])));
	let selectedRelations = $derived(
		selectedId
			? relations.filter(
					(relation) => relation.source === selectedId || relation.target === selectedId
				)
			: []
	);
	let labelOpacity = $derived(Math.max(0.12, 1 - Math.max(0, tide - 0.24) * 1.3));
	let familyOpacity = $derived(Math.max(0, 1 - Math.abs(tide - 0.5) / 0.32));
	let mechanismOpacity = $derived(Math.max(0, Math.min(1, (tide - 0.62) / 0.26)));
	let focusedId = $state<string>();

	function labelVisible(point: BiasPoint) {
		let threshold = tide < 0.34 ? 0 : tide < 0.7 ? 1 : 2;
		if (zoom >= 1.45) threshold = Math.max(threshold, 1);
		if (zoom >= 2.2) threshold = 2;
		return (
			point.labelPriority <= threshold ||
			point.id === selectedId ||
			highlightedIds.includes(point.id)
		);
	}

	function tabStop(point: BiasPoint) {
		const preferredId =
			(focusedId && pointById.has(focusedId) ? focusedId : undefined) ??
			selectedId ??
			layout.points.find(labelVisible)?.id;
		return point.id === preferredId;
	}

	function pointX(point: BiasPoint) {
		return point.x * width;
	}

	function pointY(point: BiasPoint) {
		return point.y * height;
	}

	function relationOtherId(relation: BiasRelation) {
		return relation.source === selectedId ? relation.target : relation.source;
	}

	function relationDash(type: BiasRelation['type']) {
		if (type === 'mirror') return '2 6';
		if (type === 'cascade') return '8 5';
		if (type === 'same-effect-different-mechanism') return '10 3 2 3';
		if (type === 'near-overlap') return '4 4';
		return '';
	}

	function pointDimmed(point: BiasPoint) {
		return (
			Boolean(selectedId) &&
			point.id !== selectedId &&
			point.id !== compareId &&
			!highlightedIds.includes(point.id) &&
			!selectedRelations.some((relation) => relationOtherId(relation) === point.id)
		);
	}

	function markerPath(point: BiasPoint, marker: PeakMarker) {
		const x = pointX(point);
		const y = pointY(point);
		const radius = point.id === selectedId ? 8 : highlightedIds.includes(point.id) ? 7 : 5.5;
		if (marker.symbol === 'diamond') {
			return `M${x} ${y - radius}L${x + radius} ${y}L${x} ${y + radius}L${x - radius} ${y}Z`;
		}
		if (marker.symbol === 'triangle') {
			return `M${x} ${y - radius}L${x + radius} ${y + radius}L${x - radius} ${y + radius}Z`;
		}
		if (marker.symbol === 'square') {
			return `M${x - radius} ${y - radius}H${x + radius}V${y + radius}H${x - radius}Z`;
		}
		if (marker.symbol === 'cross') {
			const a = radius * 0.35;
			return `M${x - a} ${y - radius}H${x + a}V${y - a}H${x + radius}V${y + a}H${x + a}V${y + radius}H${x - a}V${y + a}H${x - radius}V${y - a}H${x - a}Z`;
		}
		return `M${x} ${y - radius}A${radius} ${radius} 0 1 1 ${x - 0.01} ${y - radius}Z`;
	}
</script>

<g class="relations" aria-label="Explained relationships for the selected bias">
	{#each selectedRelations as relation (`${relation.source}:${relation.target}:${relation.type}`)}
		{@const source = pointById.get(relation.source)}
		{@const target = pointById.get(relation.target)}
		{#if source && target}
			<g>
				<title>{biasById.get(relationOtherId(relation))?.name}: {relation.explanation}</title>
				<line
					x1={pointX(source)}
					y1={pointY(source)}
					x2={pointX(target)}
					y2={pointY(target)}
					stroke="var(--arch-relation)"
					stroke-width={relation.strength === 'strong'
						? 2.2
						: relation.strength === 'moderate'
							? 1.6
							: 1.1}
					stroke-dasharray={relationDash(relation.type)}
					vector-effect="non-scaling-stroke"
				/>
			</g>
		{/if}
	{/each}
</g>

{#if selectedId && compareId}
	{@const first = pointById.get(selectedId)}
	{@const second = pointById.get(compareId)}
	{#if first && second}
		<line
			x1={pointX(first)}
			y1={pointY(first)}
			x2={pointX(second)}
			y2={pointY(second)}
			stroke="var(--arch-compare)"
			stroke-width="3"
			stroke-dasharray="3 5"
			vector-effect="non-scaling-stroke"
		/>
	{/if}
{/if}

<g class="mechanism-labels" opacity={mechanismOpacity} pointer-events="none" aria-hidden="true">
	{#each layout.formations as formation (formation.id)}
		<g transform={`translate(${formation.x * width} ${formation.y * height})`}>
			<text class="mechanism" text-anchor="middle">{formation.label}</text>
			<text class="depth" y="13" text-anchor="middle">shared formation</text>
		</g>
	{/each}
</g>

<g class="family-labels" opacity={familyOpacity} pointer-events="none" aria-hidden="true">
	{#each layout.families as family (family.id)}
		<text class="family" x={family.x * width} y={family.y * height} text-anchor="middle">
			{family.label}
		</text>
	{/each}
</g>

<g class="peaks" aria-label="Bias peaks">
	{#each layout.points as point (point.id)}
		{@const bias = biasById.get(point.id)}
		{@const marker = markers[point.id] ?? {
			colour: '#d8d3bd',
			symbol: 'circle',
			label: 'Survey peak'
		}}
		{#if bias}
			<g
				class="peak"
				class:selected={point.id === selectedId}
				class:compared={point.id === compareId}
				class:highlighted={highlightedIds.includes(point.id)}
				class:dimmed={pointDimmed(point)}
				data-bias-id={point.id}
				role="button"
				tabindex={tabStop(point) ? 0 : -1}
				onfocus={() => (focusedId = point.id)}
				onclick={() => onselect(point.id)}
				onkeydown={(event) => onkeyboard(point.id, event)}
				aria-label={`${bias.name}. ${marker.label}. ${bias.definition}`}
			>
				<title>{bias.name} · {marker.label}</title>
				<circle class="hit" cx={pointX(point)} cy={pointY(point)} r="16" />
				<path
					d={markerPath(point, marker)}
					fill={marker.colour}
					stroke={point.id === selectedId ? 'var(--arch-focus)' : 'var(--arch-peak-stroke)'}
					stroke-width={point.id === selectedId ? 2.4 : 1.2}
					vector-effect="non-scaling-stroke"
				/>
			</g>
		{/if}
	{/each}
</g>

<g class="peak-labels" pointer-events="none" aria-hidden="true">
	{#each layout.points as point (point.id)}
		{@const bias = biasById.get(point.id)}
		{#if bias && labelVisible(point)}
			<text
				class="bias-label"
				x={pointX(point)}
				y={pointY(point) - 16 / zoom}
				text-anchor="middle"
				style={`font-size:${10 / zoom}px;stroke-width:${4 / zoom}px`}
				opacity={pointDimmed(point)
					? 0.18
					: point.id === selectedId || point.id === compareId || highlightedIds.includes(point.id)
						? 1
						: labelOpacity}
			>
				{bias.name}
			</text>
		{/if}
	{/each}
</g>

<style>
	.relations line {
		filter: drop-shadow(0 0 4px color-mix(in srgb, var(--arch-relation) 55%, transparent));
	}

	.family,
	.mechanism,
	.depth,
	.bias-label {
		paint-order: stroke fill;
		stroke: var(--arch-label-halo);
		stroke-linejoin: round;
		stroke-width: 4px;
		fill: var(--arch-label);
		font-family: var(--arch-serif);
		pointer-events: none;
	}

	.bias-label {
		font-size: 10px;
		font-weight: 730;
		letter-spacing: 0.015em;
	}

	.family {
		font-size: 18px;
		font-style: italic;
		font-weight: 650;
		letter-spacing: 0.03em;
	}

	.mechanism {
		font-size: 20px;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.depth {
		font-family: var(--font-sans);
		font-size: 7px;
		font-weight: 750;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	.peak {
		cursor: pointer;
		transition: opacity 180ms ease;
	}

	.hit {
		fill: transparent;
		pointer-events: all;
	}

	.peak.dimmed {
		opacity: 0.18;
	}

	.peak.highlighted path,
	.peak.selected path,
	.peak.compared path {
		filter: drop-shadow(0 0 8px var(--arch-focus));
	}

	.peak:focus-visible {
		outline: none;
	}

	.peak:focus-visible .hit {
		fill: transparent;
		stroke: var(--arch-focus);
		stroke-width: 2px;
		vector-effect: non-scaling-stroke;
	}

	@media (prefers-reduced-motion: reduce) {
		.peak {
			transition: none;
		}
	}
</style>
