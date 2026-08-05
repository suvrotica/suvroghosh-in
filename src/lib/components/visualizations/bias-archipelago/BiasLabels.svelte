<script lang="ts">
	import type {
		Bias,
		BiasLayout,
		BiasPoint,
		BiasRelation,
		PeakMarker
	} from '$lib/visualizations/bias-archipelago/bias-types';

	type LabelAnchor = 'start' | 'middle' | 'end';

	interface LabelBox {
		left: number;
		right: number;
		top: number;
		bottom: number;
	}

	interface LabelPlacement {
		point: BiasPoint;
		bias: Bias;
		x: number;
		y: number;
		anchor: LabelAnchor;
		leader: boolean;
		leaderX: number;
		leaderY: number;
		forced: boolean;
	}

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
	let selectedNeighbourIds = $derived(
		new Set(
			selectedId
				? (pointById.get(selectedId)?.neighbours.map((neighbour) => neighbour.id) ?? [])
				: []
		)
	);
	let forcedLabelIds = $derived.by(buildForcedLabelIds);
	let labelPlacements = $derived.by(buildLabelPlacements);
	let labelPlacementIds = $derived(new Set(labelPlacements.map((placement) => placement.point.id)));

	function labelCandidate(point: BiasPoint) {
		let threshold = tide < 0.34 ? 0 : tide < 0.7 ? 1 : 2;
		if (zoom >= 1.45) threshold = Math.max(threshold, 1);
		if (zoom >= 2.2) threshold = 2;
		return (
			point.labelPriority <= threshold ||
			forcedLabelIds.has(point.id) ||
			selectedRelations.some((relation) => relationOtherId(relation) === point.id)
		);
	}

	function tabStop(point: BiasPoint) {
		const preferredId =
			(focusedId && pointById.has(focusedId) ? focusedId : undefined) ??
			selectedId ??
			layout.points.find((candidate) => labelPlacementIds.has(candidate.id))?.id ??
			layout.points[0]?.id;
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

	function buildForcedLabelIds() {
		return new Set([
			...highlightedIds,
			...(selectedId ? [selectedId] : []),
			...(compareId ? [compareId] : []),
			...selectedNeighbourIds
		]);
	}

	function candidateRank(point: BiasPoint) {
		if (point.id === selectedId) return 0;
		if (point.id === compareId) return 1;
		if (highlightedIds.includes(point.id)) return 2;
		if (selectedNeighbourIds.has(point.id)) return 3;
		if (selectedRelations.some((relation) => relationOtherId(relation) === point.id)) return 4;
		return 10 + point.labelPriority;
	}

	function reserveFormationLabels() {
		const boxes: LabelBox[] = [];
		if (mechanismOpacity > 0.08) {
			for (const formation of layout.formations) {
				const x = formation.x * width;
				const y = formation.y * height;
				const halfWidth = Math.max(38, formation.label.length * 6.5);
				boxes.push({ left: x - halfWidth, right: x + halfWidth, top: y - 18, bottom: y + 18 });
			}
		}
		if (familyOpacity > 0.12) {
			for (const family of layout.families) {
				const x = family.x * width;
				const y = family.y * height;
				const halfWidth = Math.max(34, family.label.length * 5.4);
				boxes.push({ left: x - halfWidth, right: x + halfWidth, top: y - 14, bottom: y + 8 });
			}
		}
		return boxes;
	}

	function labelOffsets() {
		const markerRadius = 8;
		const gap = 6 / zoom;
		const far = 18 / zoom;
		return [
			{ dx: 0, dy: -(markerRadius + gap), anchor: 'middle' as const, leader: false },
			{ dx: markerRadius + gap, dy: 3 / zoom, anchor: 'start' as const, leader: true },
			{ dx: -(markerRadius + gap), dy: 3 / zoom, anchor: 'end' as const, leader: true },
			{
				dx: markerRadius + gap,
				dy: -(markerRadius + gap),
				anchor: 'start' as const,
				leader: true
			},
			{
				dx: -(markerRadius + gap),
				dy: -(markerRadius + gap),
				anchor: 'end' as const,
				leader: true
			},
			{ dx: 0, dy: markerRadius + 13 / zoom, anchor: 'middle' as const, leader: true },
			{ dx: markerRadius + far, dy: -far, anchor: 'start' as const, leader: true },
			{ dx: -(markerRadius + far), dy: -far, anchor: 'end' as const, leader: true },
			{ dx: markerRadius + far, dy: far, anchor: 'start' as const, leader: true },
			{ dx: -(markerRadius + far), dy: far, anchor: 'end' as const, leader: true }
		];
	}

	function boxForLabel(bias: Bias, x: number, y: number, anchor: LabelAnchor): LabelBox {
		const textWidth = Math.max(24, bias.name.length * 5.8 + 3) / zoom;
		const textHeight = 12 / zoom;
		const left = anchor === 'middle' ? x - textWidth / 2 : anchor === 'end' ? x - textWidth : x;
		return {
			left,
			right: left + textWidth,
			top: y - textHeight * 0.82,
			bottom: y + textHeight * 0.18
		};
	}

	function boxesOverlap(first: LabelBox, second: LabelBox, padding = 0) {
		return !(
			first.right + padding <= second.left ||
			first.left >= second.right + padding ||
			first.bottom + padding <= second.top ||
			first.top >= second.bottom + padding
		);
	}

	function overlapArea(first: LabelBox, second: LabelBox) {
		const overlapWidth = Math.max(
			0,
			Math.min(first.right, second.right) - Math.max(first.left, second.left)
		);
		const overlapHeight = Math.max(
			0,
			Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
		);
		return overlapWidth * overlapHeight;
	}

	function insideMap(box: LabelBox) {
		const inset = 6 / zoom;
		return (
			box.left >= inset &&
			box.right <= width - inset &&
			box.top >= inset &&
			box.bottom <= height - inset
		);
	}

	function maximumLabelCount() {
		return Math.min(58, Math.round(18 + Math.min(zoom, 3.5) * 8 + tide * 8));
	}

	function buildLabelPlacements() {
		const placements: LabelPlacement[] = [];
		const occupied = reserveFormationLabels();
		const markerBoxes = layout.points.map((point) => {
			const x = pointX(point);
			const y = pointY(point);
			return { left: x - 8, right: x + 8, top: y - 8, bottom: y + 8 };
		});
		const candidates = layout.points
			.filter(labelCandidate)
			.sort(
				(first, second) =>
					candidateRank(first) - candidateRank(second) || first.id.localeCompare(second.id)
			);
		const limit = maximumLabelCount();
		const padding = 3 / zoom;

		for (const point of candidates) {
			const bias = biasById.get(point.id);
			if (!bias) continue;
			const forced = forcedLabelIds.has(point.id);
			if (!forced && placements.length >= limit) continue;
			const pointXValue = pointX(point);
			const pointYValue = pointY(point);
			const options = labelOffsets()
				.map((offset) => {
					const x = pointXValue + offset.dx;
					const y = pointYValue + offset.dy;
					const box = boxForLabel(bias, x, y, offset.anchor);
					const collisionScore = [...occupied, ...markerBoxes].reduce(
						(score, existing) => score + overlapArea(box, existing),
						0
					);
					return { ...offset, x, y, box, collisionScore };
				})
				.filter((option) => insideMap(option.box));
			const clear = options.find((option) =>
				[...occupied, ...markerBoxes].every(
					(existing) => !boxesOverlap(option.box, existing, padding)
				)
			);
			const chosen =
				clear ??
				(forced
					? options.sort((first, second) => first.collisionScore - second.collisionScore)[0]
					: undefined);
			if (!chosen) continue;
			const distance = Math.hypot(chosen.x - pointXValue, chosen.y - pointYValue) || 1;
			const leaderLength = Math.max(0, distance - 5 / zoom);
			placements.push({
				point,
				bias,
				x: chosen.x,
				y: chosen.y,
				anchor: chosen.anchor,
				leader: chosen.leader,
				leaderX: pointXValue + ((chosen.x - pointXValue) / distance) * leaderLength,
				leaderY: pointYValue + ((chosen.y - pointYValue) / distance) * leaderLength,
				forced
			});
			occupied.push(chosen.box);
		}

		return placements;
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
			!selectedNeighbourIds.has(point.id) &&
			!selectedRelations.some((relation) => relationOtherId(relation) === point.id)
		);
	}

	function waterSurface() {
		return 0.67 - tide * 0.49;
	}

	function pointExposed(point: BiasPoint) {
		return point.elevation >= waterSurface();
	}

	function exposureLabel(point: BiasPoint) {
		if (pointExposed(point)) return 'Exposed above the current explanatory threshold';
		return 'Submerged below the current explanatory threshold';
	}

	function markerStroke(point: BiasPoint, marker: PeakMarker) {
		if (point.id === selectedId) return 'var(--arch-focus)';
		if (point.id === compareId) return 'var(--arch-compare)';
		return pointExposed(point) ? 'var(--arch-peak-stroke)' : marker.colour;
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

<g class="label-leaders" pointer-events="none" aria-hidden="true">
	{#each labelPlacements as placement (placement.point.id)}
		{#if placement.leader}
			<line
				class="label-leader"
				x1={pointX(placement.point)}
				y1={pointY(placement.point)}
				x2={placement.leaderX}
				y2={placement.leaderY}
				opacity={pointDimmed(placement.point)
					? 0.18
					: placement.forced
						? 0.72
						: labelOpacity * 0.55}
				vector-effect="non-scaling-stroke"
			/>
		{/if}
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
		{@const exposed = pointExposed(point)}
		{#if bias}
			<g
				class="peak"
				class:selected={point.id === selectedId}
				class:compared={point.id === compareId}
				class:highlighted={highlightedIds.includes(point.id)}
				class:dimmed={pointDimmed(point)}
				class:exposed
				class:submerged={!exposed}
				data-bias-id={point.id}
				role="button"
				tabindex={tabStop(point) ? 0 : -1}
				onfocus={() => (focusedId = point.id)}
				onclick={() => onselect(point.id)}
				onkeydown={(event) => onkeyboard(point.id, event)}
				aria-label={`${bias.name}. ${marker.label}. ${exposureLabel(point)}. ${bias.definition}`}
			>
				<title>{bias.name} · {marker.label} · {exposureLabel(point)}</title>
				<circle class="hit" cx={pointX(point)} cy={pointY(point)} r="16" />
				{#if !exposed && point.id === selectedId}
					<circle
						class="sonar-pulse"
						cx={pointX(point)}
						cy={pointY(point)}
						r="13"
						vector-effect="non-scaling-stroke"
					/>
				{/if}
				<path
					class="marker-shape"
					d={markerPath(point, marker)}
					fill={exposed ? marker.colour : 'none'}
					stroke={markerStroke(point, marker)}
					stroke-width={point.id === selectedId ? 2.4 : exposed ? 1.2 : 1.55}
					vector-effect="non-scaling-stroke"
				/>
				{#if !exposed}
					<path
						class="survey-cross"
						d={`M${pointX(point) - 2.5} ${pointY(point)}H${pointX(point) + 2.5}M${pointX(point)} ${pointY(point) - 2.5}V${pointY(point) + 2.5}`}
						fill="none"
						stroke={markerStroke(point, marker)}
						stroke-width="0.9"
						vector-effect="non-scaling-stroke"
					/>
				{/if}
			</g>
		{/if}
	{/each}
</g>

<g class="peak-labels" pointer-events="none" aria-hidden="true">
	{#each labelPlacements as placement (placement.point.id)}
		<text
			class="bias-label"
			data-label-for={placement.point.id}
			x={placement.x}
			y={placement.y}
			text-anchor={placement.anchor}
			style={`font-size:${10 / zoom}px;stroke-width:${4 / zoom}px`}
			opacity={pointDimmed(placement.point) ? 0.18 : placement.forced ? 1 : labelOpacity}
		>
			{placement.bias.name}
		</text>
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

	.label-leader {
		stroke: var(--arch-label);
		stroke-linecap: round;
		stroke-width: 0.8px;
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

	.peak.exposed .marker-shape {
		filter: brightness(1.12) drop-shadow(0 0 2px color-mix(in srgb, white 32%, transparent));
	}

	.peak.submerged .marker-shape,
	.peak.submerged .survey-cross {
		opacity: 0.58;
	}

	.peak.submerged.selected .marker-shape,
	.peak.submerged.selected .survey-cross,
	.peak.submerged.compared .marker-shape,
	.peak.submerged.compared .survey-cross {
		opacity: 1;
	}

	.sonar-pulse {
		fill: none;
		stroke: var(--arch-focus);
		stroke-width: 1.5px;
		transform-box: fill-box;
		transform-origin: center;
		animation: sounding-pulse 2.4s ease-out infinite;
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

	@keyframes sounding-pulse {
		0% {
			opacity: 0.9;
			transform: scale(0.72);
		}
		72%,
		100% {
			opacity: 0.1;
			transform: scale(1.35);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.peak,
		.sonar-pulse {
			transition: none;
			animation: none;
		}
	}
</style>
