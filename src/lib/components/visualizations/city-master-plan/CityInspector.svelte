<script lang="ts">
	import type {
		CellCoordinate,
		CityResult,
		CityTile,
		GenerationEvent
	} from '$lib/visualizations/city-master-plan';

	type Props = {
		result: CityResult | null;
		selected: CellCoordinate | null;
		revealEventCount: number;
	};

	let { result, selected, revealEventCount }: Props = $props();

	let index = $derived(result && selected ? selected.y * result.width + selected.x : -1);
	let fabric = $derived(result && index >= 0 ? result.fabricTiles[index] : null);
	let occupation = $derived(result && index >= 0 ? result.occupationTiles[index] : null);
	let patch = $derived(
		result && selected
			? (result.municipalPatches.find(
					(item) => item.cell.x === selected?.x && item.cell.y === selected?.y
				) ?? null)
			: null
	);
	let observations = $derived.by(() => {
		if (!result || !selected) return [] as Extract<GenerationEvent, { type: 'observe' }>[];
		return result.events
			.slice(0, revealEventCount)
			.filter(
				(event): event is Extract<GenerationEvent, { type: 'observe' }> =>
					event.type === 'observe' && event.cell.x === selected.x && event.cell.y === selected.y
			);
	});
	let forcedEvents = $derived.by(() => {
		if (!result || !selected) return [] as Extract<GenerationEvent, { type: 'propagate' }>[];
		return result.events
			.slice(0, revealEventCount)
			.filter(
				(event): event is Extract<GenerationEvent, { type: 'propagate' }> =>
					event.type === 'propagate' &&
					event.forcedCells.some((cell) => cell.x === selected.x && cell.y === selected.y)
			);
	});

	function edgeSummary(tile: CityTile | null) {
		if (!tile) return 'No tile';
		const names = ['N', 'E', 'S', 'W'];
		return tile.edges
			.map(
				(edge, direction) =>
					`${names[direction]} ${edge.passage}${edge.water !== 'dry' ? ` · ${edge.water}` : ''}${edge.face !== 'neutral' ? ` · ${edge.face}` : ''}`
			)
			.join('; ');
	}
</script>

<section class="inspector" aria-labelledby="city-inspector-heading">
	<div class="heading">
		<p>Cell inspector</p>
		<h3 id="city-inspector-heading">
			{selected ? `Cell ${selected.x + 1}, ${selected.y + 1}` : 'Select a map cell'}
		</h3>
	</div>

	{#if result && selected && fabric && occupation}
		<dl>
			<div>
				<dt>Urban fabric</dt>
				<dd>{fabric.prototypeId} · {fabric.rotation * 90}°</dd>
			</div>
			<div>
				<dt>Occupation</dt>
				<dd>{occupation.prototypeId} · {occupation.rotation * 90}°</dd>
			</div>
			{#each observations as observation (observation.step)}
				<div>
					<dt>{observation.pass} observation</dt>
					<dd>
						step {observation.step} · {observation.candidateCount} candidates · entropy
						{observation.entropy.toFixed(3)} · selected weight
						{observation.chosenWeight.toFixed(2)}
					</dd>
				</div>
				<div>
					<dt>Remaining families before observation</dt>
					<dd>
						{observation.candidateFamilies.length
							? observation.candidateFamilies.join(', ')
							: 'Only the chosen family remained.'}
					</dd>
				</div>
				{#if observation.exclusionReasons.length}
					<div>
						<dt>Why common alternatives disappeared</dt>
						<dd>{observation.exclusionReasons.join(' ')}</dd>
					</div>
				{/if}
			{/each}
			{#each forcedEvents as forced (`${forced.pass}-${forced.step}`)}
				<div>
					<dt>{forced.pass} forced by propagation</dt>
					<dd>
						At step {forced.step}, neighbouring sockets reduced this cell to one legal family
						without a weighted observation.
					</dd>
				</div>
			{/each}
			<div>
				<dt>Fabric edges</dt>
				<dd>{edgeSummary(fabric)}</dd>
			</div>
			<div>
				<dt>Occupation edges</dt>
				<dd>{edgeSummary(occupation)}</dd>
			</div>
			<div>
				<dt>Why allowed</dt>
				<dd>
					Its four exterior signatures remain compatible with the collapsed neighbours and the
					occupation is admitted by the fabric beneath it.
				</dd>
			</div>
		</dl>

		{#if patch}
			<article class="patch">
				<p>Retrospective permission</p>
				<h4>{patch.anomalyType.replaceAll('-', ' ')}</h4>
				<span>{patch.violatedRules.join(' · ')}</span>
				<small>Severity {patch.severity}/10 · {patch.narrativeKey}</small>
			</article>
		{/if}
	{:else}
		<p class="empty">
			Click or tap the map, or focus it and use the arrow keys. Enter opens this inspector.
		</p>
	{/if}
</section>

<style>
	.inspector {
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: 0.75rem;
	}
	.heading p,
	.heading h3,
	.empty,
	.patch p,
	.patch h4 {
		margin: 0;
	}
	.heading p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.heading h3 {
		font-size: 0.88rem;
		color: var(--ink);
	}
	dl {
		display: grid;
		gap: 0.5rem;
		margin: 0.7rem 0 0;
	}
	dl div {
		border-top: 1px dotted var(--rule);
		padding-top: 0.42rem;
	}
	dt {
		font-family: ui-monospace, monospace;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	dd {
		margin: 0.14rem 0 0;
		overflow-wrap: anywhere;
		font-size: 0.7rem;
		line-height: 1.35;
		color: var(--ink);
	}
	.patch {
		margin-top: 0.75rem;
		border: 1px dashed var(--city-oxide, var(--accent));
		border-radius: 0.45rem;
		background: color-mix(in srgb, var(--city-oxide, var(--accent)) 9%, var(--paper));
		padding: 0.6rem;
		transform: rotate(-0.3deg);
	}
	.patch p {
		font-family: ui-monospace, monospace;
		font-size: 0.6rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--city-oxide, var(--accent));
	}
	.patch h4 {
		margin-top: 0.18rem;
		font-size: 0.8rem;
		text-transform: capitalize;
		color: var(--ink);
	}
	.patch span,
	.patch small {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.65rem;
		line-height: 1.3;
		color: var(--ink-muted);
	}
	.empty {
		margin-top: 0.65rem;
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
</style>
