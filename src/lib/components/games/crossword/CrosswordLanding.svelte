<script lang="ts">
	import type {
		CrosswordPack,
		DifficultyLevel,
		RoundSelection,
		SessionFormat
	} from '$lib/games/crossword';

	let {
		pack,
		selection,
		canResume = false,
		reviewCount = 0,
		onselection,
		onstart,
		onresume,
		ontutorial
	}: {
		pack: CrosswordPack;
		selection: RoundSelection;
		canResume?: boolean;
		reviewCount?: number;
		onselection: (selection: RoundSelection) => void;
		onstart: () => void;
		onresume: () => void;
		ontutorial: () => void;
	} = $props();

	let formats = $derived<
		Array<{
			id: Exclude<SessionFormat, 'tutorial'>;
			title: string;
			length: string;
			description: string;
		}>
	>([
		{
			id: 'quick',
			title: 'Quick Round',
			length: '3–5 min',
			description: 'A compact crossing before the next calendar ambush.'
		},
		{
			id: 'coffee',
			title: 'Coffee Round',
			length: '8–15 min',
			description: 'Enough room for a useful system to emerge.'
		},
		{
			id: 'deep',
			title: 'Deep Round',
			length: 'No pressure',
			description: 'Longer architecture and consequence chains.'
		},
		{
			id: 'review',
			title: 'Review Round',
			length: `${reviewCount} queued`,
			description: 'Return to concepts that asked for help last time.'
		}
	]);

	function chooseTopic(topicId: string) {
		onselection({ ...selection, topicIds: [topicId] });
	}

	function chooseLevel(level: DifficultyLevel) {
		onselection({ ...selection, level });
	}

	function chooseFormat(sessionFormat: Exclude<SessionFormat, 'tutorial'>) {
		onselection({ ...selection, sessionFormat });
	}
</script>

<div class="landing-layout">
	<header class="landing-copy">
		<p class="eyebrow">A crossword with a patient tutor inside</p>
		<h1>{pack.title}</h1>
		<p class="lede">{pack.description}</p>
		<div class="landing-actions">
			<button type="button" class="start-button" onclick={onstart}>
				Start a round <span aria-hidden="true">→</span>
			</button>
			{#if canResume}
				<button type="button" class="resume-button" onclick={onresume}>
					Resume previous round
				</button>
			{/if}
		</div>
		<button type="button" class="tutorial-button" onclick={ontutorial}>
			New to the instrument? Take the guided first crossing.
		</button>
		<p class="local-note">
			No account, patient data, leaderboard, runtime AI, or distant server keeping notes on your
			abbreviations.
		</p>
		<ul class="promise-list">
			<li><span aria-hidden="true">01</span>Forgetting is expected. Recall is the work.</li>
			<li><span aria-hidden="true">02</span>Hints move from a nudge to a full explanation.</li>
			<li><span aria-hidden="true">03</span>Revealed concepts return in later review rounds.</li>
			<li>
				<span aria-hidden="true">04</span>Progress remains on this device unless you export it.
			</li>
		</ul>
	</header>

	<form class="round-desk" onsubmit={(event) => event.preventDefault()}>
		<div class="desk-heading">
			<div>
				<p>Round requisition</p>
				<h2>Choose the material</h2>
			</div>
			<span aria-hidden="true">SR–01</span>
		</div>

		<fieldset class="topic-fieldset">
			<legend><span>1</span> Subject path</legend>
			<div class="topic-grid">
				{#each pack.topics as topic (topic.id)}
					<label class:checked={selection.topicIds.includes(topic.id)}>
						<input
							type="radio"
							name="crossword-topic"
							value={topic.id}
							checked={selection.topicIds.includes(topic.id)}
							onchange={() => chooseTopic(topic.id)}
						/>
						<span class="topic-title">{topic.shortTitle ?? topic.title}</span>
						<span class="topic-description">{topic.description}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset>
			<legend><span>2</span> Difficulty</legend>
			<div class="choice-grid levels">
				{#each pack.levels as level (level.id)}
					<label class:checked={selection.level === level.id}>
						<input
							type="radio"
							name="crossword-level"
							value={level.id}
							checked={selection.level === level.id}
							onchange={() => chooseLevel(level.id)}
						/>
						<strong>{level.title}</strong>
						<small>{level.description}</small>
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset>
			<legend><span>3</span> Session</legend>
			<div class="choice-grid formats">
				{#each formats as format (format.id)}
					<label
						class:checked={selection.sessionFormat === format.id}
						class:empty-review={format.id === 'review' && reviewCount === 0}
					>
						<input
							type="radio"
							name="crossword-format"
							value={format.id}
							checked={selection.sessionFormat === format.id}
							onchange={() => chooseFormat(format.id)}
						/>
						<span class="format-line"><strong>{format.title}</strong><em>{format.length}</em></span>
						<small>{format.description}</small>
					</label>
				{/each}
			</div>
		</fieldset>
	</form>
</div>

<style>
	.landing-layout {
		display: grid;
		grid-template-columns: minmax(18rem, 0.78fr) minmax(32rem, 1.22fr);
		gap: clamp(1.5rem, 4vw, 5rem);
		align-items: start;
		width: min(100%, 92rem);
		margin-inline: auto;
		padding: clamp(1.2rem, 4vw, 4rem) clamp(1rem, 4vw, 4rem);
	}

	.landing-copy {
		position: sticky;
		top: 1rem;
		padding-top: clamp(0.5rem, 3vw, 2rem);
	}

	.eyebrow,
	.desk-heading p {
		margin: 0 0 0.8rem;
		color: var(--cw-ochre);
		font: 800 0.68rem/1.3 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h1 {
		max-width: 11ch;
		margin: 0;
		font: 900 clamp(3.2rem, 6.4vw, 6.8rem) / 0.84 var(--font-sans, sans-serif);
		letter-spacing: -0.068em;
		text-wrap: balance;
	}

	.lede {
		max-width: 38rem;
		margin: 1.4rem 0 0;
		color: var(--cw-muted);
		font: 500 clamp(1.03rem, 1.6vw, 1.28rem) / 1.55 var(--font-serif, Georgia, serif);
	}

	.promise-list {
		display: grid;
		gap: 0;
		max-width: 38rem;
		margin: 1.6rem 0 0;
		padding: 0;
		border-top: 1px solid color-mix(in oklab, var(--cw-ink) 23%, transparent);
		list-style: none;
	}

	.promise-list li {
		display: grid;
		grid-template-columns: 2.25rem 1fr;
		gap: 0.4rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid color-mix(in oklab, var(--cw-ink) 18%, transparent);
		font-size: 0.86rem;
	}

	.promise-list span {
		color: var(--cw-ochre);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
	}

	.landing-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin-top: 1.6rem;
	}

	.tutorial-button {
		min-height: auto;
		margin-top: 0.75rem;
		padding: 0.2rem 0;
		border: 0;
		border-bottom: 1px solid currentColor;
		border-radius: 0;
		background: transparent;
		color: var(--cw-muted);
		font-size: 0.76rem;
		font-weight: 700;
		text-align: left;
	}

	button {
		min-height: 2.9rem;
		padding: 0.75rem 1.05rem;
		border: 1px solid var(--cw-ink);
		border-radius: 0.35rem;
		font-weight: 850;
		cursor: pointer;
		touch-action: manipulation;
	}

	.start-button {
		background: var(--cw-ink);
		color: var(--cw-paper-raised);
	}

	.start-button span {
		display: inline-block;
		margin-left: 1.2rem;
		transition: translate 160ms ease;
	}

	.start-button:hover span {
		translate: 0.25rem 0;
	}

	.resume-button {
		background: transparent;
		color: var(--cw-ink);
	}

	button:focus-visible,
	input:focus-visible + span {
		outline: 3px solid var(--cw-focus);
		outline-offset: 3px;
	}

	.local-note {
		max-width: 34rem;
		margin: 0.75rem 0 0;
		color: var(--cw-muted);
		font-size: 0.72rem;
	}

	.round-desk {
		padding: clamp(1rem, 2.4vw, 2rem);
		border: 1px solid color-mix(in oklab, var(--cw-ink) 30%, transparent);
		background:
			repeating-linear-gradient(
				0deg,
				transparent 0 1.65rem,
				color-mix(in oklab, var(--cw-moss) 8%, transparent) 1.65rem calc(1.65rem + 1px)
			),
			var(--cw-paper-raised);
		box-shadow: 0 1.5rem 4rem color-mix(in oklab, var(--cw-ink) 10%, transparent);
	}

	.desk-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 3px double color-mix(in oklab, var(--cw-ink) 45%, transparent);
	}

	.desk-heading p {
		margin-bottom: 0.2rem;
	}

	.desk-heading h2 {
		margin: 0;
		font-size: clamp(1.55rem, 3vw, 2.4rem);
		line-height: 1;
	}

	.desk-heading > span {
		padding: 0.35rem 0.45rem;
		border: 1px solid var(--cw-ochre);
		color: var(--cw-ochre);
		font: 800 0.65rem/1 var(--font-mono, ui-monospace, monospace);
	}

	fieldset {
		min-width: 0;
		margin: 1.25rem 0 0;
		padding: 0;
		border: 0;
	}

	legend {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: 0.65rem;
		font-size: 0.82rem;
		font-weight: 900;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	legend span {
		display: grid;
		width: 1.45rem;
		height: 1.45rem;
		place-items: center;
		border-radius: 50%;
		background: var(--cw-ink);
		color: var(--cw-paper-raised);
		font: 800 0.68rem/1 var(--font-mono, ui-monospace, monospace);
	}

	.topic-grid,
	.choice-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.topic-grid label,
	.choice-grid label {
		position: relative;
		display: flex;
		min-width: 0;
		min-height: 4.5rem;
		flex-direction: column;
		gap: 0.28rem;
		padding: 0.7rem;
		border: 1px solid color-mix(in oklab, var(--cw-ink) 25%, transparent);
		border-radius: 0.32rem;
		background: color-mix(in oklab, var(--cw-paper-raised) 93%, var(--cw-paper));
		cursor: pointer;
	}

	.topic-grid label:hover,
	.choice-grid label:hover {
		border-color: var(--cw-moss);
	}

	.topic-grid label.checked,
	.choice-grid label.checked {
		border-color: var(--cw-ink);
		background: color-mix(in oklab, var(--cw-paper-raised) 78%, var(--cw-moss));
		box-shadow: inset 0 0 0 1px var(--cw-ink);
	}

	input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.topic-title,
	.choice-grid strong {
		font-size: 0.8rem;
		font-weight: 850;
		line-height: 1.2;
	}

	.topic-description,
	.choice-grid small {
		display: -webkit-box;
		overflow: hidden;
		color: var(--cw-muted);
		font-size: 0.68rem;
		line-height: 1.32;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.levels,
	.formats {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.choice-grid label {
		min-height: 4.2rem;
	}

	.format-line {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.format-line em {
		color: var(--cw-ink);
		font: 700 0.59rem/1 var(--font-mono, ui-monospace, monospace);
		font-style: normal;
		white-space: nowrap;
	}

	.empty-review:not(.checked) {
		opacity: 0.72;
	}

	@media (max-width: 1040px) {
		.landing-layout {
			grid-template-columns: 1fr;
		}

		.landing-copy {
			position: static;
		}

		h1 {
			max-width: 14ch;
		}
	}

	@media (max-width: 620px) {
		.landing-layout {
			padding-inline: 0.7rem;
		}

		.topic-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.topic-grid label:last-child:nth-child(odd) {
			grid-column: 1 / -1;
		}

		.levels,
		.formats {
			grid-template-columns: 1fr;
		}

		.promise-list li {
			font-size: 0.8rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.start-button span {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.round-desk,
		.topic-grid label,
		.choice-grid label,
		button {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
			box-shadow: none;
		}

		.topic-grid label.checked,
		.choice-grid label.checked,
		.start-button {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
