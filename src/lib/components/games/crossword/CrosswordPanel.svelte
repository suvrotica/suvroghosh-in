<script lang="ts">
	import {
		normalizeAnswer,
		type Direction,
		type PuzzleModel,
		type PuzzleState
	} from '$lib/games/crossword';

	type PanelTab = 'current' | 'clues' | 'hints' | 'learn' | 'unstuck';

	let {
		model,
		puzzleState,
		activeEntryId,
		completedEntryIds = [],
		feedback = '',
		hideCompleted = false,
		onselectentry,
		onprevious,
		onnext,
		onhint,
		oncheckletter,
		oncheckentry,
		onrevealentry,
		onrevealcrossing,
		onrecommend,
		onconflict,
		ontogglehide
	}: {
		model: PuzzleModel;
		puzzleState: PuzzleState;
		activeEntryId?: string;
		completedEntryIds?: string[];
		feedback?: string;
		hideCompleted?: boolean;
		onselectentry: (entryId: string) => void;
		onprevious: () => void;
		onnext: () => void;
		onhint: (entryId: string) => void;
		oncheckletter: () => void;
		oncheckentry: () => void;
		onrevealentry: (entryId: string) => void;
		onrevealcrossing: () => void;
		onrecommend: () => void;
		onconflict: () => void;
		ontogglehide: () => void;
	} = $props();

	let tab = $state<PanelTab>('current');
	let completedSet = $derived(new Set(completedEntryIds));
	let activeEntry = $derived(activeEntryId ? model.entriesById[activeEntryId] : undefined);
	let activeNumber = $derived(activeEntryId ? model.entryNumbers[activeEntryId] : undefined);
	let hintLevel = $derived(activeEntryId ? (puzzleState.hintLevels[activeEntryId] ?? 0) : 0);
	let canLearn = $derived(
		Boolean(
			activeEntryId &&
			(completedSet.has(activeEntryId) || puzzleState.entrySolves[activeEntryId]?.revealed)
		)
	);
	let acronymExpansion = $derived(
		activeEntry?.tags.find((tag) => tag.startsWith('expansion:'))?.slice('expansion:'.length)
	);

	const tabs: Array<{ id: PanelTab; label: string }> = [
		{ id: 'current', label: 'Current' },
		{ id: 'clues', label: 'Clues' },
		{ id: 'hints', label: 'Hints' },
		{ id: 'learn', label: 'Learn' },
		{ id: 'unstuck', label: 'Unstuck' }
	];

	function idsFor(direction: Direction) {
		const ids = direction === 'across' ? model.acrossEntryIds : model.downEntryIds;
		return hideCompleted ? ids.filter((id) => !completedSet.has(id)) : ids;
	}

	function openHint() {
		if (!activeEntryId) return;
		onhint(activeEntryId);
		tab = 'hints';
	}

	function openLearn() {
		tab = 'learn';
	}
</script>

<aside class="crossword-panel" aria-label="Clue, hint, and learning panel">
	<div class="tab-list" role="tablist" aria-label="Crossword panels">
		{#each tabs as item (item.id)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === item.id}
				aria-controls={`crossword-panel-${item.id}`}
				id={`crossword-tab-${item.id}`}
				class:active={tab === item.id}
				onclick={() => (tab = item.id)}
			>
				{item.label}
				{#if item.id === 'hints' && hintLevel > 0}<span>{hintLevel}</span>{/if}
			</button>
		{/each}
	</div>

	<div class="panel-scroll">
		{#if tab === 'current'}
			<div id="crossword-panel-current" role="tabpanel" aria-labelledby="crossword-tab-current">
				{#if activeEntry}
					<p class="entry-label">
						{activeNumber}
						{activeEntry.direction}
						<span>{normalizeAnswer(activeEntry.answer).length} letters</span>
					</p>
					<h2>{activeEntry.clue}</h2>
					{#if feedback}
						<p class="feedback" role="status">{feedback}</p>
					{:else}
						<p class="quiet-help">
							Type a letter to advance. A second tap on a crossing changes direction.
						</p>
					{/if}
					{#if activeEntry.tags.includes('acronym') || acronymExpansion}
						<details class="acronym-help">
							<summary>Acronym assistance</summary>
							{#if acronymExpansion}
								<p>
									{acronymExpansion.split(/\s+/).length} words · initials
									<strong
										>{acronymExpansion
											.split(/\s+/)
											.map((word) => word[0])
											.join(' · ')}</strong
									>
								</p>
							{:else}
								<p>
									This answer is an acronym. Its teaching card gives the expansion after the solve.
								</p>
							{/if}
						</details>
					{/if}
					<div class="entry-actions">
						<button type="button" class="hint-call" onclick={openHint}>
							{hintLevel === 0 ? 'Want a nudge?' : `Next hint · ${Math.min(6, hintLevel + 1)} of 6`}
						</button>
						<button type="button" onclick={oncheckletter}>Check letter</button>
						<button type="button" onclick={oncheckentry}>Check answer</button>
					</div>
					<div class="entry-navigation">
						<button type="button" onclick={onprevious}
							><span aria-hidden="true">←</span> Previous</button
						>
						<span>{completedEntryIds.length} / {model.puzzle.entries.length}</span>
						<button type="button" onclick={onnext}>Next <span aria-hidden="true">→</span></button>
					</div>
					{#if canLearn}
						<button type="button" class="aha-button" onclick={openLearn}>
							Aha card: why {activeEntry.displayAnswer ?? activeEntry.answer} matters
						</button>
					{/if}
				{:else}
					<h2>Select a clue or an open cell.</h2>
				{/if}
			</div>
		{:else if tab === 'clues'}
			<div id="crossword-panel-clues" role="tabpanel" aria-labelledby="crossword-tab-clues">
				<div class="clue-toolbar">
					<p>{hideCompleted ? 'Showing unfinished clues' : 'Showing every clue'}</p>
					<button type="button" aria-pressed={hideCompleted} onclick={ontogglehide}>
						{hideCompleted ? 'Show completed' : 'Hide completed'}
					</button>
				</div>
				{#each ['across', 'down'] as direction (direction)}
					<div class="clue-group">
						<h2>{direction === 'across' ? 'Across' : 'Down'}</h2>
						<ol>
							{#each idsFor(direction as Direction) as entryId (entryId)}
								{@const entry = model.entriesById[entryId]}
								<li
									class:complete={completedSet.has(entryId)}
									class:active={activeEntryId === entryId}
								>
									<button type="button" onclick={() => onselectentry(entryId)}>
										<span>{model.entryNumbers[entryId]}</span>
										<span>{entry.clue}</span>
										{#if completedSet.has(entryId)}<span class="done">Done</span>{/if}
									</button>
								</li>
							{/each}
						</ol>
					</div>
				{/each}
			</div>
		{:else if tab === 'hints'}
			<div id="crossword-panel-hints" role="tabpanel" aria-labelledby="crossword-tab-hints">
				{#if activeEntry && activeEntryId}
					<p class="entry-label">Hint ladder · {activeNumber} {activeEntry.direction}</p>
					<h2>{activeEntry.clue}</h2>
					<p class="hint-intro">
						Each step gets more explicit. Asking is part of the learning record, not an offence.
					</p>
					<ol class="hint-ladder">
						{#each activeEntry.hints.slice(0, hintLevel) as hint, index (`${activeEntryId}-${index}`)}
							<li>
								<span>{index + 1}</span>
								<div>
									<strong>{hint.kind.replace('-', ' ')}</strong>
									<p>{hint.text}</p>
								</div>
							</li>
						{/each}
					</ol>
					{#if hintLevel < 6}
						<button type="button" class="hint-call wide" onclick={openHint}>
							{hintLevel === 0 ? 'Show the first nudge' : `Show hint ${hintLevel + 1}`}
						</button>
					{:else}
						<button type="button" class="aha-button" onclick={openLearn}
							>Open the teaching card</button
						>
					{/if}
				{:else}
					<h2>Select an answer before requesting a hint.</h2>
				{/if}
			</div>
		{:else if tab === 'learn'}
			<div id="crossword-panel-learn" role="tabpanel" aria-labelledby="crossword-tab-learn">
				{#if activeEntry && canLearn}
					<p class="entry-label">Aha card · {activeNumber} {activeEntry.direction}</p>
					<h2 class="answer-title">{activeEntry.displayAnswer ?? activeEntry.answer}</h2>
					<dl class="learning-card">
						<div>
							<dt>What it is</dt>
							<dd>{activeEntry.learning.definition}</dd>
						</div>
						<div>
							<dt>Why it matters</dt>
							<dd>{activeEntry.learning.whyItMatters}</dd>
						</div>
						{#if activeEntry.learning.example}
							<div>
								<dt>In practice</dt>
								<dd>{activeEntry.learning.example}</dd>
							</div>
						{/if}
						{#if activeEntry.learning.commonConfusion}
							<div>
								<dt>Common confusion</dt>
								<dd>{activeEntry.learning.commonConfusion}</dd>
							</div>
						{/if}
					</dl>
					{#if activeEntry.learning.related?.length}
						<p class="related">
							<strong>Related:</strong>
							{activeEntry.learning.related.join(' · ')}
						</p>
					{/if}
					<details>
						<summary>Sources and freshness</summary>
						<p class="freshness">
							{activeEntry.learning.freshness?.replace('-', ' ') ?? 'stable conceptual knowledge'}
						</p>
						<ul class="sources">
							{#each activeEntry.learning.sources as source (source.url)}
								<li>
									<!-- Source URLs are authored HTTPS links, not SvelteKit routes. -->
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
									<span
										>{source.publisher ?? 'Primary source'} · reviewed {source.accessedOrReviewed}</span
									>
								</li>
							{/each}
						</ul>
					</details>
				{:else if activeEntry}
					<h2>The teaching card opens after the answer is completed or revealed.</h2>
					<p class="hint-intro">The clue should have first refusal.</p>
				{:else}
					<h2>Select an answer to open its teaching card.</h2>
				{/if}
			</div>
		{:else}
			<div id="crossword-panel-unstuck" role="tabpanel" aria-labelledby="crossword-tab-unstuck">
				<p class="entry-label">No ceremony required</p>
				<h2>Choose what kind of help would be useful.</h2>
				<div class="unstuck-actions">
					<button type="button" onclick={onrecommend}>
						<strong>Recommend a clue</strong>
						<span>Choose the answer with the most completed crossings.</span>
					</button>
					<button type="button" onclick={onrevealcrossing}>
						<strong>Reveal a useful crossing</strong>
						<span>Add one strategic letter, with no drum roll.</span>
					</button>
					<button type="button" onclick={onconflict}>
						<strong>Explain this conflict</strong>
						<span>Place both crossing clues beside the inconsistent cell.</span>
					</button>
					<button type="button" aria-pressed={hideCompleted} onclick={ontogglehide}>
						<strong>{hideCompleted ? 'Restore completed clues' : 'Hide completed clues'}</strong>
						<span>Reduce the paperwork without changing the puzzle.</span>
					</button>
				</div>
				{#if activeEntry && activeEntryId}
					<div class="reveal-box">
						<p>
							Show and teach fills <strong>{activeNumber} {activeEntry.direction}</strong> and marks it
							for later review.
						</p>
						<button type="button" onclick={() => onrevealentry(activeEntryId)}
							>Show and teach</button
						>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</aside>

<style>
	.crossword-panel {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		min-width: 0;
		min-height: 0;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 28%, transparent);
		background: var(--cw-paper-raised);
		color: var(--cw-ink);
	}

	.tab-list {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		border-bottom: 1px solid color-mix(in oklab, var(--cw-ink) 28%, transparent);
	}

	.tab-list button {
		position: relative;
		min-width: 0;
		min-height: 2.75rem;
		padding: 0.55rem 0.25rem;
		border: 0;
		border-right: 1px solid color-mix(in oklab, var(--cw-ink) 18%, transparent);
		background: transparent;
		color: var(--cw-muted);
		font-size: 0.68rem;
		font-weight: 800;
		cursor: pointer;
	}

	.tab-list button:last-child {
		border-right: 0;
	}

	.tab-list button.active {
		background: color-mix(in oklab, var(--cw-paper-raised) 78%, var(--cw-moss));
		color: var(--cw-ink);
	}

	.tab-list button.active::after {
		position: absolute;
		right: 0.3rem;
		bottom: -1px;
		left: 0.3rem;
		height: 3px;
		background: var(--cw-ochre);
		content: '';
	}

	.tab-list button span {
		display: inline-grid;
		width: 1rem;
		height: 1rem;
		margin-left: 0.15rem;
		place-items: center;
		border-radius: 50%;
		background: var(--cw-ochre);
		color: var(--cw-paper-raised);
		font-size: 0.55rem;
	}

	.panel-scroll {
		overflow: auto;
		overscroll-behavior: contain;
		padding: clamp(0.85rem, 2vw, 1.4rem);
		scrollbar-gutter: stable;
	}

	.entry-label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin: 0 0 0.55rem;
		color: var(--cw-ink);
		font: 850 0.68rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.entry-label span {
		color: var(--cw-muted);
		font-size: 0.58rem;
	}

	h2 {
		margin: 0;
		font: 700 clamp(1.2rem, 2.2vw, 1.65rem) / 1.25 var(--font-serif, Georgia, serif);
		text-wrap: pretty;
	}

	.feedback,
	.quiet-help,
	.hint-intro {
		margin: 0.8rem 0 0;
		padding: 0.65rem 0.75rem;
		border-left: 3px solid var(--cw-ochre);
		background: color-mix(in oklab, var(--cw-paper-raised) 81%, var(--cw-ochre));
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.quiet-help,
	.hint-intro {
		border-left-color: var(--cw-moss);
		background: color-mix(in oklab, var(--cw-paper-raised) 86%, var(--cw-moss));
		color: var(--cw-muted);
	}

	.entry-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.45rem;
		margin-top: 0.9rem;
	}

	.entry-actions .hint-call {
		grid-column: 1 / -1;
	}

	button {
		min-height: 2.75rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 32%, transparent);
		border-radius: 0.3rem;
		background: transparent;
		color: var(--cw-ink);
		font-size: 0.74rem;
		font-weight: 800;
		cursor: pointer;
		touch-action: manipulation;
	}

	button:hover {
		background: color-mix(in oklab, var(--cw-paper-raised) 80%, var(--cw-moss));
	}

	button:focus-visible,
	summary:focus-visible,
	a:focus-visible {
		outline: 3px solid var(--cw-focus);
		outline-offset: 2px;
	}

	.hint-call {
		background: var(--cw-ink);
		color: var(--cw-paper-raised);
	}

	.hint-call.wide,
	.aha-button {
		width: 100%;
		margin-top: 0.8rem;
	}

	.aha-button {
		border-color: var(--cw-ochre);
		background: color-mix(in oklab, var(--cw-paper-raised) 86%, var(--cw-ochre));
	}

	.entry-navigation {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 0.4rem;
		align-items: center;
		margin-top: 0.65rem;
	}

	.entry-navigation button:last-child {
		text-align: right;
	}

	.entry-navigation span {
		color: var(--cw-muted);
		font: 700 0.62rem/1 var(--font-mono, ui-monospace, monospace);
	}

	.clue-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-bottom: 0.9rem;
	}

	.clue-toolbar p {
		margin: 0;
		color: var(--cw-muted);
		font-size: 0.7rem;
	}

	.clue-group + .clue-group {
		margin-top: 1rem;
	}

	.clue-group h2 {
		padding-bottom: 0.35rem;
		border-bottom: 2px solid var(--cw-ink);
		font: 900 0.7rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.clue-group ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.clue-group li {
		border-bottom: 1px dotted color-mix(in oklab, var(--cw-ink) 24%, transparent);
	}

	.clue-group li button {
		display: grid;
		grid-template-columns: 1.7rem 1fr auto;
		gap: 0.4rem;
		align-items: baseline;
		width: 100%;
		padding: 0.58rem 0;
		border: 0;
		text-align: left;
	}

	.clue-group li.active button {
		color: var(--cw-ochre);
	}

	.clue-group li.complete button > span:nth-child(2) {
		text-decoration: line-through;
		text-decoration-thickness: 1px;
		opacity: 0.64;
	}

	.clue-group li button > span:first-child,
	.done {
		font: 800 0.62rem/1.2 var(--font-mono, ui-monospace, monospace);
	}

	.done {
		color: var(--cw-moss);
		text-transform: uppercase;
	}

	.hint-ladder {
		display: grid;
		gap: 0.55rem;
		margin: 0.85rem 0 0;
		padding: 0;
		list-style: none;
	}

	.hint-ladder li {
		display: grid;
		grid-template-columns: 1.7rem 1fr;
		gap: 0.6rem;
	}

	.hint-ladder li > span {
		display: grid;
		width: 1.55rem;
		height: 1.55rem;
		place-items: center;
		border: 1px solid var(--cw-moss);
		border-radius: 50%;
		color: var(--cw-moss);
		font: 800 0.65rem/1 var(--font-mono, ui-monospace, monospace);
	}

	.hint-ladder strong {
		font: 800 0.62rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.hint-ladder p {
		margin: 0.18rem 0 0;
		font: 500 0.9rem/1.45 var(--font-serif, Georgia, serif);
	}

	.answer-title {
		font-family: var(--font-sans, sans-serif);
		font-size: clamp(2rem, 5vw, 3.6rem);
		font-weight: 900;
		letter-spacing: -0.045em;
		text-transform: uppercase;
	}

	.learning-card {
		display: grid;
		gap: 0.8rem;
		margin: 1rem 0 0;
	}

	.learning-card div {
		padding-bottom: 0.7rem;
		border-bottom: 1px solid color-mix(in oklab, var(--cw-ink) 18%, transparent);
	}

	.learning-card dt {
		color: var(--cw-ochre);
		font: 800 0.62rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.learning-card dd {
		margin: 0.25rem 0 0;
		font: 500 0.91rem/1.5 var(--font-serif, Georgia, serif);
	}

	.related,
	.freshness {
		margin: 0.85rem 0 0;
		font-size: 0.76rem;
		line-height: 1.45;
	}

	details {
		margin-top: 0.9rem;
		padding: 0.7rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 20%, transparent);
	}

	.acronym-help {
		margin-top: 0.7rem;
		border-style: dashed;
	}

	.acronym-help p {
		margin: 0.3rem 0 0;
		color: var(--cw-muted);
		font-size: 0.72rem;
	}

	.acronym-help strong {
		display: block;
		margin-top: 0.2rem;
		color: var(--cw-ink);
		font-family: var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
	}

	summary {
		min-height: 2rem;
		font-size: 0.76rem;
		font-weight: 800;
		cursor: pointer;
	}

	.freshness {
		color: var(--cw-muted);
		text-transform: capitalize;
	}

	.sources {
		display: grid;
		gap: 0.5rem;
		margin: 0.55rem 0 0;
		padding-left: 1.1rem;
	}

	.sources li {
		font-size: 0.75rem;
	}

	.sources a {
		color: var(--cw-moss);
		font-weight: 800;
		text-underline-offset: 3px;
	}

	.sources span {
		display: block;
		margin-top: 0.1rem;
		color: var(--cw-muted);
		font-size: 0.66rem;
	}

	.unstuck-actions {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}

	.unstuck-actions button {
		display: grid;
		gap: 0.2rem;
		padding: 0.7rem;
		text-align: left;
	}

	.unstuck-actions span {
		color: var(--cw-muted);
		font-size: 0.68rem;
		font-weight: 500;
		line-height: 1.35;
	}

	.reveal-box {
		margin-top: 1rem;
		padding: 0.75rem;
		border: 1px dashed var(--cw-ochre);
		background: color-mix(in oklab, var(--cw-paper-raised) 90%, var(--cw-ochre));
	}

	.reveal-box p {
		margin: 0 0 0.55rem;
		font-size: 0.75rem;
		line-height: 1.4;
	}

	@media (max-width: 500px) {
		.tab-list {
			overflow-x: auto;
			grid-template-columns: repeat(5, minmax(4.2rem, 1fr));
		}

		.entry-actions {
			grid-template-columns: 1fr;
		}

		.entry-actions .hint-call {
			grid-column: auto;
		}
	}

	@media (forced-colors: active) {
		.crossword-panel,
		.feedback,
		.quiet-help,
		.hint-intro,
		button,
		details,
		.reveal-box {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.tab-list button.active,
		.hint-call {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
