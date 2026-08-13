<script lang="ts">
	import type { CellKey, PuzzleModel, PuzzleState } from '$lib/games/crossword';

	let {
		model,
		state,
		completedEntryIds = [],
		onselect,
		onletter,
		onbackspace,
		ondelete,
		onmove,
		ontoggle
	}: {
		model: PuzzleModel;
		state: PuzzleState;
		completedEntryIds?: string[];
		onselect: (key: CellKey) => void;
		onletter: (letter: string) => void;
		onbackspace: () => void;
		ondelete: () => void;
		onmove: (direction: 'up' | 'down' | 'left' | 'right') => void;
		ontoggle: () => void;
	} = $props();

	let gridElement: HTMLDivElement;
	let completedSet = $derived(new Set(completedEntryIds));
	let activeEntryId = $derived.by(() => {
		if (!state.selectedCellKey) return undefined;
		const cell = model.cells[state.selectedCellKey];
		return state.direction === 'across' ? cell?.acrossEntryId : cell?.downEntryId;
	});
	let activeCellSet = $derived(
		activeEntryId ? new Set(model.entryCells[activeEntryId] ?? []) : new Set<CellKey>()
	);

	function cellLabel(key: CellKey) {
		const cell = model.cells[key];
		const player = state.cells[key];
		const entries = cell.entryIds.map((id) => {
			const entry = model.entriesById[id];
			return `${model.entryNumbers[id]} ${entry.direction === 'across' ? 'Across' : 'Down'}`;
		});
		const selected = state.selectedCellKey === key ? ` Selected ${state.direction}.` : '';
		const value = player?.value ? `Letter ${player.value}` : 'Letter blank';
		const pencil = player?.pencil ? ' Tentative pencil mark.' : '';
		const checked =
			player?.checkStatus === 'incorrect'
				? ' Does not fit.'
				: player?.checkStatus === 'correct'
					? ' Checked correct.'
					: '';
		return `Row ${cell.row + 1}, column ${cell.column + 1}. ${entries.join(' and ')}. ${value}.${selected}${pencil}${checked}`;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (/^[a-z]$/i.test(event.key)) {
			event.preventDefault();
			onletter(event.key.toUpperCase());
			return;
		}
		if (event.key === 'Backspace') {
			event.preventDefault();
			onbackspace();
			return;
		}
		if (event.key === 'Delete') {
			event.preventDefault();
			ondelete();
			return;
		}
		const movement = {
			ArrowUp: 'up',
			ArrowDown: 'down',
			ArrowLeft: 'left',
			ArrowRight: 'right'
		} as const;
		if (event.key in movement) {
			event.preventDefault();
			onmove(movement[event.key as keyof typeof movement]);
			return;
		}
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			ontoggle();
		}
	}

	$effect(() => {
		const key = state.selectedCellKey;
		if (!key || !gridElement) return;
		const frame = requestAnimationFrame(() => {
			gridElement
				.querySelector<HTMLElement>(`[data-cell-key="${CSS.escape(key)}"]`)
				?.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	});
</script>

<div
	class="grid-frame"
	class:dense={model.puzzle.width > 15 || model.puzzle.height > 20}
	style={`--grid-ratio: ${model.puzzle.width} / ${model.puzzle.height}; --grid-columns: ${model.puzzle.width}`}
	aria-label={`${model.puzzle.title} crossword grid`}
>
	<div class="grid-corner top-left" aria-hidden="true"></div>
	<div class="grid-corner top-right" aria-hidden="true"></div>
	<div class="grid-corner bottom-left" aria-hidden="true"></div>
	<div class="grid-corner bottom-right" aria-hidden="true"></div>
	<div
		bind:this={gridElement}
		class="crossword-grid"
		style={`--grid-ratio: ${model.puzzle.width} / ${model.puzzle.height}`}
		role="grid"
		aria-label={`${model.puzzle.width} columns by ${model.puzzle.height} rows. Use arrow keys to move; Space or Enter changes direction at a crossing.`}
		aria-rowcount={model.puzzle.height}
		aria-colcount={model.puzzle.width}
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		{#each Array.from({ length: model.puzzle.height }, (_, index) => index) as row (row)}
			<div
				class="grid-row"
				role="row"
				style={`--columns: ${model.puzzle.width}`}
				aria-rowindex={row + 1}
			>
				{#each Array.from({ length: model.puzzle.width }, (_, index) => index) as column (column)}
					{@const key = `${row},${column}` as CellKey}
					{@const cell = model.cells[key]}
					{#if cell?.kind === 'open'}
						{@const player = state.cells[key]}
						<div
							role="gridcell"
							aria-colindex={column + 1}
							aria-selected={state.selectedCellKey === key}
							class="cell-slot"
						>
							<button
								type="button"
								class:active-word={activeCellSet.has(key)}
								class:selected={state.selectedCellKey === key}
								class:pencil={player?.pencil}
								class:incorrect={player?.checkStatus === 'incorrect'}
								class:checked={player?.checkStatus === 'correct'}
								class:revealed={player?.revealed}
								class:completed={cell.entryIds.some((id) => completedSet.has(id))}
								class="cell-button"
								data-cell-key={key}
								data-selected={state.selectedCellKey === key}
								tabindex={state.selectedCellKey === key ? 0 : -1}
								aria-label={cellLabel(key)}
								onclick={() => onselect(key)}
							>
								{#if cell.number}
									<span class="number" aria-hidden="true">{cell.number}</span>
								{/if}
								<span class="letter" aria-hidden="true">{player?.value ?? ''}</span>
								{#if player?.checkStatus === 'incorrect'}
									<span class="wrong-mark" aria-hidden="true">×</span>
								{/if}
								{#if player?.revealed}
									<span class="revealed-mark" aria-hidden="true"></span>
								{/if}
							</button>
						</div>
					{:else}
						<div class="block" role="gridcell" aria-colindex={column + 1} aria-label="Block"></div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.grid-frame {
		--cw-grid-ink: #171a17;
		position: relative;
		width: min(100%, 44rem);
		margin-inline: auto;
		padding: clamp(0.45rem, 1.2vw, 0.75rem);
		background: var(--cw-grid-ink);
		box-shadow: 0 1.2rem 3rem color-mix(in oklab, var(--cw-ink) 20%, transparent);
		contain: layout paint;
		aspect-ratio: var(--grid-ratio, 1);
	}

	.grid-frame.dense {
		width: auto;
		min-width: calc(var(--grid-columns) * 2.25rem + 1.5rem);
		max-width: none;
	}

	.crossword-grid {
		display: grid;
		gap: 1px;
		aspect-ratio: var(--grid-ratio, 1);
		background: var(--cw-grid-ink);
		outline: none;
	}

	.grid-row {
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		gap: 1px;
		min-height: 0;
		background: var(--cw-grid-ink);
	}

	.cell-slot,
	.block {
		min-width: 0;
		min-height: 0;
	}

	.block {
		background: var(--cw-grid-ink);
	}

	.cell-button {
		position: relative;
		display: grid;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: var(--cw-grid-paper);
		color: var(--cw-grid-ink);
		cursor: pointer;
		touch-action: manipulation;
	}

	.cell-button.active-word {
		background: color-mix(in oklab, var(--cw-grid-paper) 72%, var(--cw-moss));
	}

	.cell-button.selected {
		z-index: 1;
		background: color-mix(in oklab, var(--cw-grid-paper) 52%, var(--cw-ochre));
		box-shadow: inset 0 0 0 clamp(2px, 0.3vw, 4px) var(--cw-grid-ink);
	}

	.cell-button.completed:not(.selected) {
		animation: cell-lock 280ms ease-out both;
	}

	.cell-button.checked:not(.selected) {
		background: color-mix(in oklab, var(--cw-grid-paper) 84%, var(--cw-moss));
	}

	.cell-button.incorrect {
		background:
			repeating-linear-gradient(
				135deg,
				transparent 0 4px,
				color-mix(in oklab, var(--cw-ochre) 22%, transparent) 4px 6px
			),
			var(--cw-grid-paper);
	}

	.cell-button:focus-visible {
		z-index: 3;
		outline: 3px solid var(--cw-focus);
		outline-offset: -3px;
	}

	.number {
		position: absolute;
		top: 0.08em;
		left: 0.16em;
		font: 800 clamp(0.34rem, 1.15vw, 0.68rem) / 1 var(--font-mono, ui-monospace, monospace);
	}

	.letter {
		translate: 0 0.05em;
		font: 850 clamp(0.72rem, 3.6vw, 2rem) / 1 var(--font-sans, sans-serif);
		text-transform: uppercase;
	}

	.pencil .letter {
		color: color-mix(in oklab, var(--cw-grid-ink) 72%, var(--cw-grid-paper));
		font-style: italic;
		font-weight: 550;
	}

	.wrong-mark {
		position: absolute;
		right: 0.12em;
		bottom: -0.05em;
		color: var(--cw-ochre);
		font: 900 clamp(0.45rem, 1.5vw, 0.8rem) / 1 var(--font-mono, ui-monospace, monospace);
	}

	.revealed-mark {
		position: absolute;
		top: 0;
		right: 0;
		width: 0;
		height: 0;
		border-top: clamp(0.32rem, 1.2vw, 0.65rem) solid var(--cw-ochre);
		border-left: clamp(0.32rem, 1.2vw, 0.65rem) solid transparent;
	}

	.grid-corner {
		position: absolute;
		z-index: 2;
		width: 0.55rem;
		height: 0.55rem;
		border-color: var(--cw-ochre);
		pointer-events: none;
	}

	.top-left {
		top: 0.12rem;
		left: 0.12rem;
		border-top: 1px solid;
		border-left: 1px solid;
	}

	.top-right {
		top: 0.12rem;
		right: 0.12rem;
		border-top: 1px solid;
		border-right: 1px solid;
	}

	.bottom-left {
		bottom: 0.12rem;
		left: 0.12rem;
		border-bottom: 1px solid;
		border-left: 1px solid;
	}

	.bottom-right {
		right: 0.12rem;
		bottom: 0.12rem;
		border-right: 1px solid;
		border-bottom: 1px solid;
	}

	@keyframes cell-lock {
		0% {
			box-shadow: inset 0 0 0 0 var(--cw-moss);
		}
		55% {
			box-shadow: inset 0 0 0 3px var(--cw-moss);
		}
		100% {
			box-shadow: inset 0 0 0 0 var(--cw-moss);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cell-button.completed:not(.selected) {
			animation: none;
		}
	}

	@media (forced-colors: active) {
		.grid-frame,
		.crossword-grid,
		.grid-row,
		.block {
			background: CanvasText;
		}

		.cell-button,
		.cell-button.active-word,
		.cell-button.checked,
		.cell-button.incorrect {
			border: 1px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.cell-button.selected {
			background: Highlight;
			color: HighlightText;
			box-shadow: inset 0 0 0 2px CanvasText;
		}

		.wrong-mark,
		.revealed-mark {
			forced-color-adjust: none;
			color: LinkText;
		}
	}
</style>
