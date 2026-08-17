<script lang="ts">
	import type { LabAnswer, LabQuestion } from './ui-types';

	let {
		question,
		answer,
		defaultOptionId,
		onanswer
	}: {
		question: LabQuestion;
		answer?: LabAnswer;
		defaultOptionId?: string;
		onanswer: (questionId: string, optionId: string) => void;
	} = $props();

	let currentValue = $derived(answer?.optionId ?? defaultOptionId ?? '');
	let unconfirmedDefault = $derived(
		Boolean(defaultOptionId && (!answer || answer.origin === 'demo-default'))
	);
</script>

<fieldset class="clue">
	<legend>{question.label}</legend>
	<p class="description">Optional. The page never detects this automatically.</p>
	<label class="select-wrap" for={`barnum-${question.id}`}>
		<span class="sr-only">Choose {question.label}</span>
		<select
			id={`barnum-${question.id}`}
			value={currentValue}
			onchange={(event) => onanswer(question.id, event.currentTarget.value)}
		>
			{#if !defaultOptionId}<option value="">No answer</option>{/if}
			{#each question.options as option (option.id)}
				<option value={option.id}>
					{option.label}{option.id === defaultOptionId && unconfirmedDefault
						? ' — demo default, not confirmed'
						: ''}
				</option>
			{/each}
		</select>
		<span aria-hidden="true">⌄</span>
	</label>
	<div class="meta">
		{#if unconfirmedDefault}
			<strong>Demo value, not detected</strong>
		{:else if answer?.origin === 'user-selected'}
			<strong>Selected by you</strong>
		{:else}
			<strong>Not specified</strong>
		{/if}
	</div>
</fieldset>

<style>
	.clue {
		display: grid;
		gap: 0.38rem;
		min-width: 0;
		margin: 0;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.45rem;
		background: var(--barnum-raised);
		padding: 0.72rem;
	}

	legend {
		padding: 0 0.2rem;
		font: 780 0.74rem/1.25 var(--barnum-sans);
	}

	.description {
		margin: 0;
		color: var(--barnum-muted);
		font: 0.72rem/1.45 var(--barnum-sans);
	}

	.select-wrap {
		position: relative;
		display: block;
	}

	select {
		width: 100%;
		min-height: 2.75rem;
		appearance: none;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.55rem 2rem 0.55rem 0.65rem;
		color: var(--barnum-ink);
		font: 700 0.75rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	.select-wrap > span[aria-hidden='true'] {
		position: absolute;
		top: 50%;
		right: 0.7rem;
		transform: translateY(-55%);
		font: 800 0.75rem/1 var(--barnum-mono);
		pointer-events: none;
	}

	select:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
	}

	.meta strong {
		color: var(--barnum-blue-text);
		font: 750 0.72rem/1.35 var(--barnum-sans);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 30rem) {
		.meta {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.2rem;
		}
	}

	@media (forced-colors: active) {
		.clue,
		select {
			border-color: CanvasText;
		}
	}
</style>
