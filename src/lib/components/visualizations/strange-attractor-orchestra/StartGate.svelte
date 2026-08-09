<script lang="ts">
	type Props = {
		loading?: boolean;
		onstartsound: () => void;
		oncontinuesilent: () => void;
	};

	let { loading = false, onstartsound, oncontinuesilent }: Props = $props();
</script>

<div class="gate" data-testid="sa-start-gate">
	<p class="eyebrow">Orbit · weather · voice</p>
	<h2>A curve enters weather—and sings.</h2>
	<p class="explanation">
		Choose a strange attractor; its deterministic orbit travels through a seeded noise field, and
		the resulting bends, crossings, recurrences and densities become rhythm, pitch, timbre and
		space.
	</p>
	<div class="actions" aria-label="Choose how to enter the instrument">
		<button class="primary" type="button" disabled={loading} onclick={onstartsound}>
			{loading ? 'Warming the orbit…' : 'Start the instrument'}
		</button>
		<button type="button" disabled={loading} onclick={oncontinuesilent}>Continue silently</button>
	</div>
	<p class="safety">
		Sound begins quietly and only after you choose it. You can mute or stop at any time.
	</p>
</div>

<style>
	.gate {
		position: absolute;
		z-index: 12;
		inset: 0;
		display: grid;
		align-content: end;
		justify-items: start;
		padding: clamp(1.25rem, 5vw, 4.5rem);
		background:
			linear-gradient(180deg, transparent 12%, rgb(3 7 10 / 34%) 50%, rgb(3 7 10 / 97%) 100%),
			linear-gradient(90deg, rgb(3 7 10 / 50%), transparent 72%);
		color: #f2eee3;
	}

	.eyebrow,
	.safety {
		font:
			700 0.7rem/1.45 var(--font-mono, 'Courier Prime'),
			ui-monospace,
			monospace;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.eyebrow {
		margin: 0 0 0.65rem;
		color: #78cbd0;
	}

	h2 {
		max-width: 17ch;
		margin: 0;
		font: 760 clamp(2.15rem, 6vw, 6rem) / 0.92 var(--font-serif, serif);
		letter-spacing: -0.055em;
		text-wrap: balance;
	}

	.explanation {
		max-width: 43rem;
		margin: 1rem 0 1.35rem;
		color: #c8c5bc;
		font: 500 clamp(0.95rem, 1.7vw, 1.12rem) / 1.6 var(--font-sans, sans-serif);
		text-wrap: pretty;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
	}

	button {
		min-height: 3rem;
		border: 1px solid rgb(239 232 214 / 46%);
		border-radius: 999px;
		background: rgb(8 13 16 / 82%);
		padding: 0.8rem 1.2rem;
		color: #f3eee2;
		font: 720 0.83rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
		backdrop-filter: blur(12px);
	}

	button.primary {
		border-color: #c99066;
		background: #c99066;
		color: #170e09;
	}

	button:focus-visible {
		outline: 3px solid #8ee8eb;
		outline-offset: 3px;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.6;
	}

	.safety {
		max-width: 44rem;
		margin: 0.8rem 0 0;
		color: #8f928e;
		letter-spacing: 0.04em;
		text-transform: none;
	}

	@media (max-width: 640px) {
		.actions {
			display: grid;
			width: 100%;
		}

		button {
			width: 100%;
		}
	}

	@media (forced-colors: active) {
		.gate,
		button,
		button.primary {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
