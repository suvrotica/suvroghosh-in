<script lang="ts">
	import { normalizeAnswer } from '$lib/games/crossword';
	import type { Direction, PuzzleModel, PuzzleState } from '$lib/games/crossword';

	let {
		model,
		state,
		activeEntryId,
		completedEntryIds = [],
		onselectentry,
		onanswer,
		onhint
	}: {
		model: PuzzleModel;
		state: PuzzleState;
		activeEntryId?: string;
		completedEntryIds?: string[];
		onselectentry: (entryId: string) => void;
		onanswer: (entryId: string, value: string) => void;
		onhint: (entryId: string) => void;
	} = $props();

	let completedSet = $derived(new Set(completedEntryIds));

	function entryValue(entryId: string) {
		return (model.entryCells[entryId] ?? []).map((key) => state.cells[key]?.value ?? '').join('');
	}

	function knownPattern(entryId: string) {
		return (model.entryCells[entryId] ?? [])
			.map((key) => state.cells[key]?.value || 'blank')
			.join(', ');
	}

	function cleanInput(value: string, length: number) {
		return value
			.toUpperCase()
			.replace(/[^A-Z]/g, '')
			.slice(0, length);
	}

	function idsFor(direction: Direction) {
		return direction === 'across' ? model.acrossEntryIds : model.downEntryIds;
	}
</script>

<section class="list-solver" aria-labelledby="list-solver-title">
	<header>
		<p class="kicker">Equivalent text workspace</p>
		<h2 id="list-solver-title">Solve by clue and answer field</h2>
		<p>
			Every letter entered here updates the same crossings as the visual grid. Known crossing
			letters are announced before each answer.
		</p>
	</header>

	{#each ['across', 'down'] as direction (direction)}
		<section class="direction-group" aria-labelledby={`list-${direction}-title`}>
			<h3 id={`list-${direction}-title`}>{direction === 'across' ? 'Across' : 'Down'}</h3>
			<div class="entry-list">
				{#each idsFor(direction as Direction) as entryId (entryId)}
					{@const entry = model.entriesById[entryId]}
					{@const answerLength = normalizeAnswer(entry.answer).length}
					<article
						class:active={activeEntryId === entryId}
						class:complete={completedSet.has(entryId)}
					>
						<div class="clue-line">
							<button type="button" class="clue-select" onclick={() => onselectentry(entryId)}>
								<span>{model.entryNumbers[entryId]} {direction}</span>
								<strong>{entry.clue}</strong>
							</button>
							{#if completedSet.has(entryId)}
								<span class="complete-mark">Complete</span>
							{/if}
						</div>
						<label for={`list-answer-${entryId}`}>
							Answer, {answerLength} letters. Known positions: {knownPattern(entryId)}
						</label>
						<div class="answer-line">
							<input
								id={`list-answer-${entryId}`}
								type="text"
								inputmode="text"
								autocomplete="off"
								spellcheck="false"
								maxlength={answerLength}
								value={entryValue(entryId)}
								aria-describedby={`list-pattern-${entryId}`}
								onfocus={() => onselectentry(entryId)}
								oninput={(event) =>
									onanswer(
										entryId,
										cleanInput((event.currentTarget as HTMLInputElement).value, answerLength)
									)}
							/>
							<button type="button" class="hint-button" onclick={() => onhint(entryId)}>
								Hint {Math.min(6, (state.hintLevels[entryId] ?? 0) + 1)}
							</button>
						</div>
						<p id={`list-pattern-${entryId}`} class="pattern">
							{(model.entryCells[entryId] ?? [])
								.map((key) => state.cells[key]?.value || '–')
								.join(' ')}
						</p>
					</article>
				{/each}
			</div>
		</section>
	{/each}
</section>

<style>
	.list-solver {
		width: min(100%, 64rem);
		margin-inline: auto;
		padding: clamp(1rem, 3vw, 2rem);
		border: 1px solid color-mix(in oklab, var(--cw-ink) 28%, transparent);
		background: var(--cw-paper-raised);
		color: var(--cw-ink);
	}

	header {
		max-width: 46rem;
		padding-bottom: 1rem;
		border-bottom: 3px double color-mix(in oklab, var(--cw-ink) 32%, transparent);
	}

	.kicker {
		margin: 0 0 0.25rem;
		color: var(--cw-ochre);
		font: 800 0.65rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h2,
	header p,
	h3 {
		margin: 0;
	}

	h2 {
		font-size: clamp(1.5rem, 4vw, 2.5rem);
	}

	header p:last-child {
		margin-top: 0.55rem;
		color: var(--cw-muted);
	}

	.direction-group {
		margin-top: 1.25rem;
	}

	h3 {
		font: 900 0.75rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.entry-list {
		display: grid;
		gap: 0.6rem;
		margin-top: 0.55rem;
	}

	article {
		padding: 0.8rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 20%, transparent);
		border-left: 4px solid transparent;
		background: color-mix(in oklab, var(--cw-paper-raised) 94%, var(--cw-paper));
	}

	article.active {
		border-left-color: var(--cw-ochre);
	}

	article.complete {
		background: color-mix(in oklab, var(--cw-paper-raised) 83%, var(--cw-moss));
	}

	.clue-line {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.clue-select {
		display: grid;
		min-height: 2.75rem;
		flex: 1;
		gap: 0.2rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.clue-select span,
	.complete-mark {
		color: var(--cw-muted);
		font: 800 0.62rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.clue-select strong {
		font: 650 0.95rem/1.35 var(--font-serif, Georgia, serif);
	}

	.complete-mark {
		padding: 0.25rem 0.4rem;
		border: 1px solid var(--cw-moss);
		color: var(--cw-moss);
	}

	label {
		display: block;
		margin-top: 0.65rem;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.answer-line {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.3rem;
	}

	input {
		min-width: 0;
		min-height: 2.75rem;
		flex: 1;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--cw-ink);
		border-radius: 0.25rem;
		background: var(--cw-grid-paper);
		color: var(--cw-ink);
		font: 800 1rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.hint-button {
		min-height: 2.75rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 35%, transparent);
		border-radius: 0.25rem;
		background: transparent;
		color: var(--cw-ink);
		font-size: 0.75rem;
		font-weight: 800;
		cursor: pointer;
	}

	input:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--cw-focus);
		outline-offset: 2px;
	}

	.pattern {
		margin: 0.35rem 0 0;
		color: var(--cw-muted);
		font: 700 0.68rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.16em;
	}

	@media (max-width: 520px) {
		.answer-line {
			align-items: stretch;
			flex-direction: column;
		}
	}

	@media (forced-colors: active) {
		.list-solver,
		article,
		input,
		.hint-button {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		article.active {
			border-left: 6px solid Highlight;
		}
	}
</style>
