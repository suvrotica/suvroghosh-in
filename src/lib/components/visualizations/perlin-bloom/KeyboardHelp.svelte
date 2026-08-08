<script lang="ts">
	const shortcuts = [
		['Space', 'Pause or resume the bloom'],
		['R', 'Grow a new bloom'],
		['S', 'Save the current still'],
		['F', 'Enter or leave fullscreen'],
		['H', 'Hide or reveal the studio'],
		['0', 'Restore the curated default'],
		['A', 'Switch artwork / anatomy view'],
		['Arrow keys', 'Move the canvas focus point'],
		['Home', 'Return the focus point to centre'],
		['Enter', 'Send a pulse from the focus point']
	] as const;
</script>

<details class="keyboard-help">
	<summary aria-label="Show keyboard shortcuts">Keys</summary>
	<div class="shortcut-card">
		<strong>Keyboard map</strong>
		<dl>
			{#each shortcuts as shortcut (shortcut[0])}
				<div>
					<dt><kbd>{shortcut[0]}</kbd></dt>
					<dd>{shortcut[1]}</dd>
				</div>
			{/each}
		</dl>
		<p>Shortcuts stay quiet while a form field is active.</p>
	</div>
</details>

<style>
	.keyboard-help {
		position: relative;
	}

	summary {
		display: grid;
		min-height: 2.75rem;
		cursor: pointer;
		list-style: none;
		place-items: center;
		border: 1px solid rgb(154 209 255 / 24%);
		border-radius: 0.65rem;
		background: rgb(8 12 31 / 78%);
		padding: 0.5rem 0.7rem;
		color: #d8eaff;
		font: 720 0.75rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover {
		border-color: rgb(80 228 255 / 58%);
		background: rgb(16 25 54 / 92%);
	}

	summary:focus-visible {
		outline: 2px solid #8ff7ff;
		outline-offset: 3px;
	}

	.shortcut-card {
		position: absolute;
		z-index: 20;
		top: calc(100% + 0.55rem);
		right: 0;
		width: min(20rem, calc(100vw - 2rem));
		border: 1px solid rgb(143 247 255 / 34%);
		border-radius: 0.85rem;
		background: rgb(5 8 25 / 96%);
		box-shadow:
			0 1.2rem 3rem rgb(0 0 0 / 48%),
			inset 0 1px rgb(255 255 255 / 5%);
		padding: 0.9rem;
		color: #e8f2ff;
		backdrop-filter: blur(18px);
	}

	.shortcut-card > strong {
		display: block;
		margin-bottom: 0.65rem;
		font: 760 0.78rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	dl {
		display: grid;
		gap: 0.22rem;
		margin: 0;
	}

	dl div {
		display: grid;
		grid-template-columns: 3.4rem minmax(0, 1fr);
		align-items: center;
		gap: 0.6rem;
		border-top: 1px solid rgb(154 209 255 / 10%);
		padding-top: 0.28rem;
	}

	dt,
	dd {
		margin: 0;
	}

	kbd {
		display: inline-grid;
		min-width: 1.65rem;
		min-height: 1.45rem;
		place-items: center;
		border: 1px solid rgb(155 231 255 / 32%);
		border-bottom-width: 2px;
		border-radius: 0.35rem;
		background: rgb(27 37 69 / 90%);
		padding: 0.2rem 0.35rem;
		color: #a9f8ff;
		font: 700 0.72rem/1 var(--font-mono, ui-monospace, monospace);
	}

	dd,
	.shortcut-card p {
		color: #aabbd3;
		font: 500 0.76rem/1.4 var(--font-sans, sans-serif);
	}

	.shortcut-card p {
		margin: 0.7rem 0 0;
	}

	@media (max-width: 42rem) {
		.keyboard-help {
			position: static;
		}

		.shortcut-card {
			right: 0.72rem;
			left: 0.72rem;
			width: auto;
		}
	}

	@media (forced-colors: active) {
		summary,
		.shortcut-card,
		kbd {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
			backdrop-filter: none;
		}
	}
</style>
