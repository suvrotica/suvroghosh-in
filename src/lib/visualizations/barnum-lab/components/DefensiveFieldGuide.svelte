<script lang="ts">
	let {
		headingId = 'field-guide-heading',
		testId = 'barnum-checklist',
		interactive = true
	}: {
		headingId?: string;
		testId?: string | null;
		interactive?: boolean;
	} = $props();

	const ITEMS = [
		'What would clearly count as a miss?',
		'How many people could this statement describe?',
		'Was this fact supplied by me earlier?',
		'Did the source commit before receiving feedback?',
		'Are misses counted as visibly as hits?',
		'Can the opposite trait be made to fit under another condition?',
		'Could an independent person match this profile to me above chance?',
		'Does the method make a specific, time-bounded, falsifiable prediction?',
		'Is a broad truth being presented as unique insight?',
		'Is an impressive percentage an observed probability or merely interface arithmetic?'
	] as const;

	let status = $state('');

	async function copyChecklist(): Promise<void> {
		const text = [
			'A field guide for the next reading',
			...ITEMS.map((item, index) => `${index + 1}. ${item}`)
		].join('\n');
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const field = document.createElement('textarea');
			field.value = text;
			field.setAttribute('readonly', '');
			field.style.position = 'fixed';
			field.style.opacity = '0';
			document.body.append(field);
			field.select();
			document.execCommand('copy');
			field.remove();
		}
		status = 'Checklist copied. It contains no selections, ratings, or session data.';
	}
</script>

<section class="field-guide" aria-labelledby={headingId} data-testid={testId ?? undefined}>
	<header>
		<div>
			<p>Keep this part</p>
			<h3 id={headingId}>A field guide for the next reading</h3>
		</div>
		{#if interactive}
			<button
				type="button"
				data-testid="barnum-copy-checklist"
				onclick={() => void copyChecklist()}
			>
				Copy checklist
			</button>
		{/if}
	</header>

	<ol>
		{#each ITEMS as item, index (item)}
			<li>
				<span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
				<p>{item}</p>
			</li>
		{/each}
	</ol>

	{#if interactive}<p class="status" role="status">{status}</p>{/if}
</section>

<style>
	.field-guide {
		display: grid;
		gap: 0.8rem;
		border: 2px solid var(--barnum-ink);
		border-radius: 0.55rem;
		background: var(--barnum-raised);
		padding: clamp(0.75rem, 2cqi, 1rem);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	header p,
	header h3,
	ol,
	li p,
	.status {
		margin: 0;
	}

	header p {
		color: var(--barnum-vermilion-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h3 {
		margin-top: 0.12rem;
		font: 810 1.05rem/1.2 var(--barnum-sans);
	}

	button {
		min-height: 2.75rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.38rem;
		background: var(--barnum-paper);
		padding: 0.48rem 0.65rem;
		color: var(--barnum-ink);
		font: 750 0.75rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	button:hover {
		border-color: var(--barnum-blue);
		color: var(--barnum-blue-text);
	}

	button:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	ol {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0;
		padding: 0;
		list-style: none;
		counter-reset: none;
	}

	li {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		gap: 0.55rem;
		align-items: baseline;
		border-top: 1px solid var(--barnum-rule);
		padding: 0.62rem 0.35rem;
	}

	li:nth-child(even) {
		border-left: 1px solid var(--barnum-rule);
		padding-left: 0.75rem;
	}

	li > span {
		color: var(--barnum-vermilion-text);
		font: 750 0.7rem/1.45 var(--barnum-mono);
	}

	li p {
		font: 700 0.75rem/1.45 var(--barnum-sans);
	}

	.status {
		min-height: 1rem;
		color: var(--barnum-muted);
		font: 0.7rem/1.45 var(--barnum-sans);
	}

	@media (max-width: 36rem) {
		header {
			align-items: flex-start;
			flex-direction: column;
		}

		ol {
			grid-template-columns: 1fr;
		}

		li:nth-child(even) {
			border-left: 0;
			padding-left: 0.35rem;
		}
	}

	@media print {
		.field-guide {
			break-inside: avoid;
			border: 1pt solid black;
			background: white;
			color: black;
		}

		button,
		.status {
			display: none;
		}
	}

	@media (forced-colors: active) {
		.field-guide,
		button,
		li,
		li:nth-child(even) {
			border-color: CanvasText;
		}
	}

	@media print {
		button,
		.status {
			display: none;
		}
	}
</style>
