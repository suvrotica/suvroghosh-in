<script lang="ts">
	import GameDialog from './GameDialog.svelte';
	import type { RunResult } from '$lib/games/calcutta-footpath/runtime-types';

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

	function longestStretchMetres(value: number): number {
		return Math.round(Math.max(0, value) * 0.085);
	}

	function morale(value: number): number {
		return Math.round(Math.max(0, Math.min(100, value)));
	}
</script>

<GameDialog
	title={result.won ? 'Destination reached' : 'Walk interrupted'}
	description={result.won
		? 'You crossed one neighbourhood. The neighbourhood is considering an appeal.'
		: 'The city has concluded this attempt and filed the following non-canvas report.'}
	onclose={onexit}
	wide
>
	<div class:won={result.won} class="results">
		<section class="verdict" aria-labelledby="run-verdict">
			<div class="status-row">
				<p class="status">{result.won ? 'Survived' : 'Returned to approximate safety'}</p>
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
				<div class="score">
					<span>Score</span>
					<strong><data value={result.score.total}>{formatNumber(result.score.total)}</data></strong
					>
				</div>
			</div>
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
				<div>
					<dt>Longest clear stretch</dt>
					<dd>
						<data value={longestStretchMetres(result.counters.longestStretch)}>
							{formatNumber(longestStretchMetres(result.counters.longestStretch))} m
						</data>
					</dd>
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
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.rating,
	.score {
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

	.score {
		min-width: 5.5rem;
		text-align: end;
	}

	.score strong {
		color: var(--game-red);
		font-size: clamp(1.2rem, 1rem + 0.8vw, 1.65rem);
		font-variant-numeric: tabular-nums;
		line-height: 1;
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
		.score,
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
		.score strong,
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
