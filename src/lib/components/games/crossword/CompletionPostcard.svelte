<script lang="ts">
	type CrossingSummary = {
		term: string;
		link: string;
	};

	let {
		title,
		independent,
		withHints,
		revealed,
		elapsedMs,
		forReview,
		strongestTopic,
		revisitTopic,
		crossings,
		achievement,
		onreview,
		onrelated,
		ondifferent,
		onreplay,
		onshare
	}: {
		title: string;
		independent: number;
		withHints: number;
		revealed: number;
		elapsedMs?: number;
		forReview: number;
		strongestTopic: string;
		revisitTopic: string;
		crossings: CrossingSummary[];
		achievement?: string;
		onreview: () => void;
		onrelated: () => void;
		ondifferent: () => void;
		onreplay: () => void;
		onshare: () => void;
	} = $props();
</script>

<section class="postcard" aria-labelledby="round-complete-title">
	<div class="stamp" aria-hidden="true">ROUND<br />FILED</div>
	<p class="kicker">Systems rounds · completion note</p>
	<h2 id="round-complete-title">The grid is complete.</h2>
	<p class="round-title">{title}</p>
	<p class="lede">
		Nothing exploded, which is already more than some interface go-lives can report.
	</p>

	<dl class="summary-grid">
		<div>
			<dt>Independent</dt>
			<dd>{independent}</dd>
		</div>
		<div>
			<dt>With hints</dt>
			<dd>{withHints}</dd>
		</div>
		<div>
			<dt>Revealed</dt>
			<dd>{revealed}</dd>
		</div>
		<div>
			<dt>Review queue</dt>
			<dd>{forReview}</dd>
		</div>
		{#if elapsedMs !== undefined}
			<div>
				<dt>Private time</dt>
				<dd>
					{Math.floor(elapsedMs / 60000)}:{String(Math.floor(elapsedMs / 1000) % 60).padStart(
						2,
						'0'
					)}
				</dd>
			</div>
		{/if}
	</dl>

	<div class="topic-notes">
		<p><span>Strongest crossing</span>{strongestTopic}</p>
		<p><span>Worth another crossing</span>{revisitTopic}</p>
	</div>

	{#if achievement}
		<p class="achievement"><span aria-hidden="true">✦</span> {achievement}</p>
	{/if}

	<section class="crossed" aria-labelledby="what-crossed-title">
		<h3 id="what-crossed-title">What crossed today</h3>
		<ul>
			{#each crossings as item (item.term)}
				<li><strong>{item.term}</strong><span aria-hidden="true">→</span>{item.link}</li>
			{/each}
		</ul>
	</section>

	<div class="actions" aria-label="Choose the next round">
		<button type="button" class="primary" onclick={onreview}>Review queued concepts</button>
		<button type="button" onclick={onrelated}>Start a related round</button>
		<button type="button" onclick={ondifferent}>Choose a different topic</button>
		<button type="button" onclick={onreplay}>Replay without letters</button>
		<button type="button" onclick={onshare}>Share a private result</button>
	</div>
	<p class="privacy-note">The shared note contains counts and the round title, never answers.</p>
</section>

<style>
	.postcard {
		position: relative;
		width: min(100%, 54rem);
		margin: auto;
		padding: clamp(1.25rem, 4vw, 3.2rem);
		border: 1px solid color-mix(in oklab, var(--cw-ink) 32%, transparent);
		background:
			linear-gradient(
				90deg,
				transparent 0 97%,
				color-mix(in oklab, var(--cw-ochre) 15%, transparent) 97%
			),
			var(--cw-paper-raised);
		color: var(--cw-ink);
		box-shadow: 0 1.4rem 3.5rem color-mix(in oklab, var(--cw-ink) 14%, transparent);
	}

	.kicker {
		margin: 0 5rem 0.7rem 0;
		color: var(--cw-moss);
		font: 800 0.7rem/1.3 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h2 {
		max-width: 12ch;
		margin: 0;
		font: 800 clamp(2.2rem, 6vw, 4.8rem) / 0.9 var(--font-sans, sans-serif);
		letter-spacing: -0.055em;
	}

	.round-title {
		margin: 1rem 0 0;
		font-weight: 800;
	}

	.lede {
		max-width: 42rem;
		margin: 0.45rem 0 1.5rem;
		color: var(--cw-muted);
	}

	.stamp {
		position: absolute;
		top: 1.2rem;
		right: 1.2rem;
		rotate: 3deg;
		padding: 0.45rem 0.6rem;
		border: 2px solid var(--cw-ochre);
		color: var(--cw-ochre);
		font: 900 0.65rem/1.15 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-align: center;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		margin: 0;
		border-block: 1px solid color-mix(in oklab, var(--cw-ink) 25%, transparent);
	}

	.summary-grid div {
		padding: 0.9rem 0.55rem;
		text-align: center;
	}

	.summary-grid div + div {
		border-left: 1px solid color-mix(in oklab, var(--cw-ink) 20%, transparent);
	}

	dt {
		color: var(--cw-muted);
		font: 700 0.65rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	dd {
		margin: 0.2rem 0 0;
		font: 900 1.75rem/1 var(--font-sans, sans-serif);
	}

	.topic-notes {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-top: 1.25rem;
	}

	.topic-notes p {
		margin: 0;
		padding: 0.9rem;
		background: color-mix(in oklab, var(--cw-paper) 78%, var(--cw-moss));
		font-weight: 750;
	}

	.topic-notes span {
		display: block;
		margin-bottom: 0.25rem;
		color: var(--cw-muted);
		font: 700 0.64rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.achievement {
		display: inline-flex;
		gap: 0.45rem;
		margin: 1rem 0 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--cw-ochre);
		border-radius: 99rem;
		color: var(--cw-ochre);
		font-size: 0.78rem;
		font-weight: 800;
	}

	.crossed {
		margin-top: 1.4rem;
	}

	.crossed h3 {
		margin: 0 0 0.6rem;
		font-size: 1rem;
	}

	.crossed ul {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.crossed li {
		display: grid;
		grid-template-columns: minmax(8rem, auto) 1rem 1fr;
		gap: 0.45rem;
		align-items: baseline;
		padding-bottom: 0.35rem;
		border-bottom: 1px dotted color-mix(in oklab, var(--cw-ink) 28%, transparent);
		font-size: 0.9rem;
	}

	.actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 1.35rem;
	}

	button {
		min-height: 2.75rem;
		padding: 0.65rem 0.8rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 35%, transparent);
		border-radius: 0.4rem;
		background: var(--cw-paper-raised);
		color: var(--cw-ink);
		font-weight: 800;
		cursor: pointer;
	}

	button.primary {
		background: var(--cw-ink);
		color: var(--cw-paper-raised);
	}

	button:focus-visible {
		outline: 3px solid var(--cw-focus);
		outline-offset: 2px;
	}

	.privacy-note {
		margin: 0.75rem 0 0;
		color: var(--cw-muted);
		font-size: 0.75rem;
	}

	@media (max-width: 560px) {
		.summary-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.summary-grid div:nth-child(3) {
			border-left: 0;
			border-top: 1px solid color-mix(in oklab, var(--cw-ink) 20%, transparent);
		}

		.summary-grid div:nth-child(4) {
			border-top: 1px solid color-mix(in oklab, var(--cw-ink) 20%, transparent);
		}

		.topic-notes,
		.actions {
			grid-template-columns: 1fr;
		}

		.crossed li {
			grid-template-columns: auto 1rem 1fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.stamp {
			rotate: none;
		}
	}

	@media (forced-colors: active) {
		.postcard,
		button,
		.achievement {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
		}

		button.primary {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
