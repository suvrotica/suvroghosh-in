<script lang="ts">
	import GameDialog from './GameDialog.svelte';
	import type { RunResult } from '$lib/games/calcutta-footpath/runtime-types';
	import {
		CALCUTTA_SPATIAL_WORLD,
		CALCUTTA_WORLD_BOUNDS,
		edgePolyline,
		type WorldPoint
	} from '$lib/games/calcutta-footpath/spatial-world';

	type Props = {
		result: RunResult;
		onreplay: () => void;
		onsameseed: () => void;
		oninstructions: () => void;
		onexit: () => void;
	};

	let { result, onreplay, onsameseed, oninstructions, onexit }: Props = $props();

	const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

	function formatNumber(value: number): string {
		return numberFormatter.format(Math.max(0, Math.round(value)));
	}

	function totalSeconds(milliseconds: number): number {
		return Math.max(0, Math.floor(milliseconds / 1_000));
	}

	function formatElapsed(milliseconds: number): string {
		const elapsed = totalSeconds(milliseconds);
		const hours = Math.floor(elapsed / 3_600);
		const minutes = Math.floor((elapsed % 3_600) / 60);
		const seconds = elapsed % 60;

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
				.toString()
				.padStart(2, '0')}`;
		}
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	function formatDuration(milliseconds: number): string {
		return `PT${totalSeconds(milliseconds)}S`;
	}

	function morale(value: number): number {
		return Math.round(Math.max(0, Math.min(100, value)));
	}

	const mapWidth = 320;
	const mapHeight = 250;
	const mapPadding = 14;
	const mapScale = Math.min(
		(mapWidth - mapPadding * 2) / CALCUTTA_WORLD_BOUNDS.widthM,
		(mapHeight - mapPadding * 2) / CALCUTTA_WORLD_BOUNDS.depthM
	);
	const mapOffsetX =
		(mapWidth - CALCUTTA_WORLD_BOUNDS.widthM * mapScale) / 2 -
		CALCUTTA_WORLD_BOUNDS.minX * mapScale;
	const mapOffsetY =
		(mapHeight - CALCUTTA_WORLD_BOUNDS.depthM * mapScale) / 2 +
		CALCUTTA_WORLD_BOUNDS.maxZ * mapScale;

	function mapPoint(point: WorldPoint): { x: number; y: number } {
		return { x: mapOffsetX + point.x * mapScale, y: mapOffsetY - point.z * mapScale };
	}

	function pointsString(points: readonly WorldPoint[]): string {
		return points
			.map((point) => {
				const mapped = mapPoint(point);
				return `${mapped.x.toFixed(1)},${mapped.y.toFixed(1)}`;
			})
			.join(' ');
	}

	const plottedRoute = $derived((result.route ?? []).map(mapPoint));
	const plottedFinish = $derived(plottedRoute.at(-1));
	const routePoints = $derived(pointsString(result.route ?? []));
	const routeNotes = $derived(
		(result.routeSummary?.annotations ?? []).filter((note) =>
			['food', 'turn-around', 'incident', 'obstruction'].includes(note.kind)
		)
	);
</script>

<GameDialog
	title={result.won ? 'Destination reached' : 'Walk interrupted'}
	description={result.won
		? 'You crossed one neighbourhood. The neighbourhood is considering an appeal.'
		: 'The city has concluded this attempt and filed the following route report.'}
	onclose={onexit}
	wide
>
	<div class:won={result.won} class="results">
		<section class="verdict" aria-labelledby="run-verdict">
			<div class="status-row">
				<p class="status">{result.won ? 'You arrived' : 'Returned to approximate safety'}</p>
				<span class="stamp" aria-hidden="true">{result.won ? 'ARRIVED' : 'REASSIGNED'}</span>
			</div>

			<h3 id="run-verdict">{result.message}</h3>

			{#if !result.won && result.reason && result.reason !== result.message}
				<p class="reason"><span>Recorded cause</span>{result.reason}</p>
			{/if}

			<div class="awards">
				<div class="rating">
					<span>Civic rating</span>
					<strong>{result.rating}</strong>
				</div>
			</div>

			{#if (result.route?.length ?? 0) > 1}
				<figure class="route-map" aria-labelledby="route-map-caption">
					<svg
						viewBox={`0 0 ${mapWidth} ${mapHeight}`}
						role="img"
						aria-label="Map of the streets and route you walked"
					>
						{#each CALCUTTA_SPATIAL_WORLD.edges as edge (edge.id)}
							<polyline
								class:wider={edge.archetype === 'wider-road'}
								class="map-street"
								points={pointsString(edgePolyline(edge))}
							></polyline>
						{/each}
						<polyline class="route-line" points={routePoints}></polyline>
						{#each routeNotes as note (note.id)}
							{@const plotted = mapPoint(note)}
							<circle
								class:food={note.kind === 'food'}
								class:incident={note.kind === 'incident'}
								class="route-note"
								cx={plotted.x}
								cy={plotted.y}
								r="3.2"
							>
								<title>{note.label}</title>
							</circle>
						{/each}
						{#if plottedRoute[0]}
							<circle class="start" cx={plottedRoute[0].x} cy={plottedRoute[0].y} r="5"></circle>
							<text x={plottedRoute[0].x + 8} y={plottedRoute[0].y + 3}>START</text>
						{/if}
						{#if plottedFinish}
							<circle class="finish" cx={plottedFinish.x} cy={plottedFinish.y} r="6"></circle>
							<text x={plottedFinish.x - 8} y={plottedFinish.y - 9} text-anchor="end">FINISH</text>
						{/if}
					</svg>
					{#if routeNotes.length > 0}
						<ul class="sr-only" aria-label="Notable events along this route">
							{#each routeNotes as note (note.id)}
								<li>{note.label}</li>
							{/each}
						</ul>
					{/if}
					<figcaption id="route-map-caption">
						Your {formatNumber(result.routeSummary?.distanceM ?? result.distanceMetres)} m route
						{#if (result.routeSummary?.detourDistanceM ?? 0) > 1}
							· {formatNumber(result.routeSummary!.detourDistanceM)} m beyond the shortest route
						{/if}
						{#if result.destination?.label}
							· {result.destination.label}{/if}
					</figcaption>
				</figure>
			{/if}
		</section>

		<section class="ledger" aria-labelledby="run-ledger">
			<h3 id="run-ledger">Run ledger</h3>
			<dl>
				<div>
					<dt>Distance</dt>
					<dd>
						<data value={result.distanceMetres}>{formatNumber(result.distanceMetres)} m</data>
					</dd>
				</div>
				<div>
					<dt>Time</dt>
					<dd>
						<time datetime={formatDuration(result.elapsedMs)}
							>{formatElapsed(result.elapsedMs)}</time
						>
					</dd>
				</div>
				<div>
					<dt>Collisions</dt>
					<dd><data value={result.counters.collisions}>{result.counters.collisions}</data></dd>
				</div>
				<div>
					<dt>Near misses</dt>
					<dd><data value={result.counters.nearMisses}>{result.counters.nearMisses}</data></dd>
				</div>
				{#if result.counters.teaStops !== undefined}
					<div>
						<dt>Stops for tea</dt>
						<dd>{result.counters.teaStops}</dd>
					</div>
				{/if}
				{#if result.counters.turnArounds !== undefined}
					<div>
						<dt>Times turned around</dt>
						<dd>{result.counters.turnArounds}</dd>
					</div>
				{/if}
				<div>
					<dt>Snacks consumed</dt>
					<dd>
						<data value={result.counters.snacksConsumed}>{result.counters.snacksConsumed}</data>
					</dd>
				</div>
				<div>
					<dt>Cows offended</dt>
					<dd><data value={result.counters.cowsOffended}>{result.counters.cowsOffended}</data></dd>
				</div>
				<div>
					<dt>Dogs awakened</dt>
					<dd>
						<data value={result.counters.dogsAwakened}>{result.counters.dogsAwakened}</data>
					</dd>
				</div>
				<div>
					<dt>Potholes entered</dt>
					<dd>
						<data value={result.counters.potholesEntered}>{result.counters.potholesEntered}</data>
					</dd>
				</div>
				{#if result.counters.drainsEntered !== undefined}
					<div>
						<dt>Drains entered</dt>
						<dd>{result.counters.drainsEntered}</dd>
					</div>
				{/if}
				<div>
					<dt>Longest clear stretch</dt>
					<dd>
						<data value={Math.round(result.counters.longestStretch)}>
							{formatNumber(result.counters.longestStretch)} m
						</data>
					</dd>
				</div>
				<div>
					<dt>Legacy score (secondary)</dt>
					<dd><data value={result.score.total}>{formatNumber(result.score.total)}</data></dd>
				</div>
				<div>
					<dt>Morale remaining</dt>
					<dd>
						<data value={morale(result.metrics.morale)}>{morale(result.metrics.morale)}%</data>
					</dd>
				</div>
				<div class="seed">
					<dt>Street seed</dt>
					<dd><code>{result.seed}</code></dd>
				</div>
			</dl>
		</section>
	</div>

	<div class="actions" aria-label="Run actions">
		<button type="button" class="primary" onclick={onreplay}>
			{result.won ? 'Walk again' : 'Try again'}
		</button>
		<button type="button" onclick={onsameseed}>Replay same seed</button>
		<button type="button" onclick={oninstructions}>How to walk</button>
		<button type="button" onclick={onexit}>Back to Games</button>
	</div>
</GameDialog>

<style>
	.results {
		display: grid;
		gap: clamp(1rem, 3vw, 2rem);
		grid-template-columns: minmax(15rem, 0.88fr) minmax(21rem, 1.25fr);
	}

	.verdict {
		align-self: start;
		padding: clamp(1rem, 3vw, 1.4rem);
		border: 2px solid color-mix(in srgb, var(--game-red) 72%, #2b2118);
		border-radius: 0.25rem 0.7rem 0.36rem 0.55rem;
		background:
			linear-gradient(175deg, rgb(255 255 255 / 26%), transparent 34%),
			color-mix(in srgb, var(--game-paper-light) 84%, #dca14a);
		box-shadow:
			0.28rem 0.35rem 0 rgb(72 48 28 / 16%),
			inset 0 0 2rem rgb(121 73 30 / 8%);
	}

	.won .verdict {
		border-color: var(--game-wall);
		background:
			linear-gradient(175deg, rgb(255 255 255 / 28%), transparent 34%),
			color-mix(in srgb, var(--game-paper-light) 88%, #b7c78f);
	}

	.route-map {
		margin: 1rem 0 0;
		border-top: 1px solid rgb(55 39 25 / 20%);
		padding-top: 0.85rem;
	}

	.route-map svg {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid rgb(55 39 25 / 20%);
		border-radius: 0.45rem;
		background: #e9dcc0;
	}

	.map-street {
		fill: none;
		stroke: #9f8e70;
		stroke-width: 1.45;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0.55;
	}

	.map-street.wider {
		stroke-width: 3.6;
	}

	.route-line {
		fill: none;
		stroke: #8f3b2d;
		stroke-width: 4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.route-note {
		fill: #5a584f;
		stroke: #fff8e7;
		stroke-width: 1.2;
	}

	.route-note.food {
		fill: #9f7434;
	}

	.route-note.incident {
		fill: #8f3b2d;
	}

	.route-map text {
		fill: #493b2e;
		font-size: 7px;
		font-weight: 900;
		letter-spacing: 0.07em;
	}

	.route-map .start {
		fill: #456b5e;
		stroke: #fff8e7;
		stroke-width: 2;
	}
	.route-map .finish {
		fill: #a53e2c;
		stroke: #fff8e7;
		stroke-width: 2;
	}

	.route-map figcaption {
		margin-top: 0.4rem;
		color: #5e4b38;
		font-size: 0.7rem;
		font-weight: 750;
	}

	.status-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.7rem;
	}

	.status {
		margin: 0;
		color: var(--game-red);
		font-size: 0.69rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		line-height: 1.35;
		text-transform: uppercase;
	}

	.won .status {
		color: var(--game-wall);
	}

	.stamp {
		flex: 0 0 auto;
		padding: 0.25rem 0.38rem 0.18rem;
		border: 2px solid currentColor;
		color: color-mix(in srgb, var(--game-red) 82%, transparent);
		font-size: 0.58rem;
		font-weight: 950;
		letter-spacing: 0.11em;
		line-height: 1;
		rotate: 3deg;
	}

	.won .stamp {
		color: color-mix(in srgb, var(--game-wall) 88%, transparent);
		rotate: -3deg;
	}

	.verdict h3 {
		margin: clamp(0.8rem, 2vw, 1.15rem) 0 0;
		color: var(--game-ink);
		font-family: var(--font-serif);
		font-size: clamp(1.25rem, 1rem + 1vw, 1.7rem);
		line-height: 1.22;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}

	.reason {
		display: grid;
		gap: 0.15rem;
		margin: 0.9rem 0 0;
		padding-top: 0.75rem;
		border-top: 1px dashed color-mix(in srgb, var(--game-ink-soft) 64%, transparent);
		color: var(--game-ink-soft);
		font-size: 0.83rem;
		line-height: 1.45;
		text-align: start;
	}

	.reason span,
	.awards span {
		color: var(--game-ink-soft);
		font-size: 0.62rem;
		font-weight: 850;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.awards {
		display: grid;
		gap: 0.5rem;
		margin-top: 1.1rem;
		grid-template-columns: minmax(0, 1fr);
	}

	.rating {
		display: grid;
		align-content: end;
		gap: 0.15rem;
		padding: 0.65rem 0.7rem;
		border: 1px solid rgb(73 57 39 / 38%);
		background: rgb(255 250 224 / 34%);
	}

	.rating strong {
		color: var(--game-wall-dark);
		font-family: var(--font-serif);
		font-size: clamp(0.92rem, 0.8rem + 0.45vw, 1.12rem);
		line-height: 1.2;
	}

	.ledger h3 {
		margin: 0 0 0.6rem;
		color: var(--game-ink);
		font-size: 0.73rem;
		font-weight: 900;
		letter-spacing: 0.13em;
		line-height: 1.35;
		text-transform: uppercase;
	}

	dl {
		display: grid;
		margin: 0;
		border-top: 2px solid var(--game-ink);
		border-left: 1px solid rgb(73 57 39 / 38%);
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	dl > div {
		min-width: 0;
		padding: 0.65rem 0.7rem;
		border-right: 1px solid rgb(73 57 39 / 38%);
		border-bottom: 1px solid rgb(73 57 39 / 38%);
		background: rgb(255 249 225 / 23%);
	}

	dt {
		color: var(--game-ink-soft);
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		line-height: 1.3;
		text-transform: uppercase;
	}

	dd {
		margin: 0.25rem 0 0;
		color: var(--game-ink);
		font-family: var(--font-serif);
		font-size: clamp(1rem, 0.9rem + 0.42vw, 1.23rem);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1.15;
	}

	.seed {
		grid-column: span 2;
	}

	.seed dd {
		overflow: hidden;
		font-family: var(--font-mono);
		font-size: 0.73rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.seed code {
		font: inherit;
	}

	.actions {
		display: grid;
		gap: 0.55rem;
		margin-top: clamp(1rem, 3vw, 1.5rem);
		padding-top: clamp(0.85rem, 2vw, 1.1rem);
		border-top: 2px dashed rgb(77 58 38 / 34%);
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	button {
		min-height: 2.75rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--game-ink);
		border-radius: 0.2rem 0.45rem 0.25rem 0.4rem;
		background: color-mix(in srgb, var(--game-paper-light) 86%, white);
		color: var(--game-ink);
		box-shadow: 0.16rem 0.18rem 0 rgb(69 47 28 / 18%);
		font: inherit;
		font-size: 0.77rem;
		font-weight: 850;
		line-height: 1.2;
		cursor: pointer;
	}

	button:hover {
		background: #fff0c5;
		transform: translateY(-1px);
	}

	button.primary {
		border-color: var(--game-wall-dark);
		background: var(--game-wall);
		color: #fff1ce;
	}

	button.primary:hover {
		background: var(--game-wall-dark);
	}

	button:focus-visible {
		outline: 3px solid var(--game-red);
		outline-offset: 3px;
	}

	@media (max-width: 49rem) {
		.results {
			grid-template-columns: 1fr;
		}

		.actions {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 30rem) {
		dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.seed {
			grid-column: span 2;
		}

		.actions {
			grid-template-columns: 1fr;
		}
	}

	@media (max-height: 31rem) and (orientation: landscape) {
		.results {
			grid-template-columns: minmax(14rem, 0.8fr) minmax(26rem, 1.4fr);
		}

		.verdict {
			padding: 0.8rem;
		}

		.verdict h3 {
			margin-top: 0.5rem;
			font-size: 1.12rem;
		}

		.reason {
			margin-top: 0.5rem;
			padding-top: 0.45rem;
		}

		.awards {
			margin-top: 0.65rem;
		}

		dl > div {
			padding-block: 0.45rem;
		}

		.actions {
			margin-top: 0.75rem;
			padding-top: 0.65rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		button:hover {
			transform: none;
		}
	}

	@media (forced-colors: active) {
		.verdict,
		.won .verdict,
		.rating,
		dl > div {
			border-color: CanvasText;
			background: Canvas;
			box-shadow: none;
			color: CanvasText;
		}

		.status,
		.won .status,
		.stamp,
		.won .stamp,
		.verdict h3,
		.reason,
		.reason span,
		.awards span,
		.rating strong,
		.ledger h3,
		dt,
		dd {
			color: CanvasText;
		}

		button,
		button.primary {
			border-color: ButtonText;
			background: ButtonFace;
			color: ButtonText;
			box-shadow: none;
			forced-color-adjust: auto;
		}
	}
</style>
