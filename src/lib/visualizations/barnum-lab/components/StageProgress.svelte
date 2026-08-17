<script lang="ts">
	const STEPS = [
		'Start with almost nothing',
		'Add four clues',
		'Watch the reading sharpen',
		'Feed the reader',
		'Lift the floorboards'
	] as const;

	let {
		step,
		timeLabel
	}: {
		step: 1 | 2 | 3 | 4 | 5;
		timeLabel: string;
	} = $props();
</script>

<nav class="progress" aria-label="Demonstration progress">
	<div class="progress-copy">
		<p>Step {step} of 5</p>
		<span>{timeLabel}</span>
	</div>
	<ol>
		{#each STEPS as label, index (label)}
			<li class:complete={index + 1 < step} class:current={index + 1 === step}>
				<span aria-hidden="true">{index + 1}</span>
				<span class="label">{label}</span>
				{#if index + 1 === step}<span class="sr-only">Current step</span>{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	.progress {
		display: grid;
		gap: 0.55rem;
	}

	.progress-copy {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.progress-copy p,
	.progress-copy span {
		margin: 0;
	}

	.progress-copy p {
		font: 800 0.72rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.progress-copy span {
		color: var(--barnum-muted);
		font: 0.72rem/1.35 var(--barnum-sans);
	}

	ol {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		border-top: 2px solid var(--barnum-rule);
		padding-top: 0.38rem;
		color: var(--barnum-muted);
		font: 700 0.72rem/1.3 var(--barnum-sans);
	}

	li > span:first-child {
		display: grid;
		width: 1.25rem;
		height: 1.25rem;
		place-items: center;
		border: 1px solid currentColor;
		border-radius: 50%;
		font: 750 0.7rem/1 var(--barnum-mono);
	}

	li.complete,
	li.current {
		border-color: var(--barnum-ink);
		color: var(--barnum-ink);
	}

	li.current {
		border-color: var(--barnum-blue);
	}

	li.current > span:first-child {
		border-color: var(--barnum-blue);
		background: var(--barnum-blue);
		color: var(--barnum-blue-contrast);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 46rem) {
		li {
			display: block;
		}

		li .label {
			display: none;
		}
	}

	@media (forced-colors: active) {
		li.current > span:first-child {
			border-color: Highlight;
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
