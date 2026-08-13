<script lang="ts">
	let {
		onletter,
		onbackspace,
		disabled = false
	}: {
		onletter: (letter: string) => void;
		onbackspace: () => void;
		disabled?: boolean;
	} = $props();

	const rows = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'];
</script>

<div class="crossword-keyboard" aria-label="On-screen crossword keyboard">
	{#each rows as row, rowIndex (row)}
		<div class:short-row={rowIndex === rows.length - 1} class="keyboard-row">
			{#each row as letter (letter)}
				<button
					type="button"
					class="letter-key"
					{disabled}
					aria-label={`Enter ${letter}`}
					onclick={() => onletter(letter)}
				>
					{letter}
				</button>
			{/each}
			{#if rowIndex === rows.length - 1}
				<button
					type="button"
					class="delete-key"
					{disabled}
					aria-label="Erase letter"
					onclick={onbackspace}
				>
					<span aria-hidden="true">⌫</span>
					<span>Erase</span>
				</button>
			{/if}
		</div>
	{/each}
</div>

<style>
	.crossword-keyboard {
		display: grid;
		gap: 0.35rem;
		width: min(100%, 34rem);
		margin-inline: auto;
		padding-bottom: max(0.1rem, env(safe-area-inset-bottom));
	}

	.keyboard-row {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.keyboard-row.short-row {
		grid-template-columns: repeat(5, minmax(0, 1fr)) minmax(5.5rem, 2fr);
	}

	button {
		min-width: 0;
		min-height: 2.75rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 32%, transparent);
		border-radius: 0.45rem;
		background: color-mix(in oklab, var(--cw-paper-raised) 92%, var(--cw-moss));
		color: var(--cw-ink);
		font: 700 0.86rem/1 var(--font-mono, ui-monospace, monospace);
		box-shadow: 0 1px 0 color-mix(in oklab, var(--cw-ink) 20%, transparent);
		cursor: pointer;
		touch-action: manipulation;
	}

	button:hover:not(:disabled) {
		background: color-mix(in oklab, var(--cw-paper-raised) 74%, var(--cw-moss));
	}

	button:active:not(:disabled) {
		translate: 0 1px;
		box-shadow: none;
	}

	button:focus-visible {
		outline: 3px solid var(--cw-focus);
		outline-offset: 2px;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.delete-key {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		background: color-mix(in oklab, var(--cw-paper-raised) 84%, var(--cw-ochre));
	}

	@media (min-width: 901px) and (hover: hover) and (pointer: fine) {
		.crossword-keyboard {
			display: none;
		}
	}

	@media (max-height: 500px) and (orientation: landscape) {
		.crossword-keyboard {
			gap: 0.22rem;
		}

		.keyboard-row {
			gap: 0.22rem;
		}

		button {
			min-height: 2.4rem;
		}
	}

	@media (forced-colors: active) {
		button {
			border: 2px solid ButtonText;
			background: ButtonFace;
			color: ButtonText;
			box-shadow: none;
		}

		button:focus-visible {
			outline-color: Highlight;
		}
	}
</style>
