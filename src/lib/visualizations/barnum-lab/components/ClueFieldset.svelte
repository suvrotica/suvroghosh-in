<script lang="ts">
	import type { LabAnswer, LabQuestion } from './ui-types';

	let {
		question,
		answer,
		defaultOptionId,
		onanswer,
		onconfirm
	}: {
		question: LabQuestion;
		answer?: LabAnswer;
		defaultOptionId?: string;
		onanswer: (questionId: string, optionId: string) => void;
		onconfirm?: (questionId: string, optionId: string) => void;
	} = $props();

	let currentValue = $derived(answer?.optionId ?? defaultOptionId ?? '');
	let unconfirmedDefault = $derived(
		Boolean(defaultOptionId && (!answer || answer.origin === 'demo-default'))
	);
	let useLabel = $derived(
		question.permittedUse === 'direct-echo'
			? 'May be paraphrased directly; no broader inference.'
			: question.permittedUse === 'presentation-only'
				? 'Surface wording only; unused in English v1.'
				: question.permittedUse === 'unused-decoy'
					? 'Theatrical decoy; changes nothing.'
					: 'Display only; never personality inference.'
	);
</script>

<fieldset class="clue" data-permitted-use={question.permittedUse}>
	<legend>{question.label}</legend>
	{#if question.description}<p class="description">{question.description}</p>{/if}
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
		<p>{useLabel}</p>
		{#if unconfirmedDefault && defaultOptionId && onconfirm}
			<button type="button" onclick={() => onconfirm?.(question.id, defaultOptionId)}>
				Confirm this demo value
			</button>
		{:else if answer?.origin === 'user-selected'}
			<strong>Selected by you</strong>
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

	.description,
	.meta p {
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

	select:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
	}

	.meta p {
		max-width: 25rem;
	}

	.meta button,
	.meta strong {
		flex: 0 0 auto;
		color: var(--barnum-blue-text);
		font: 750 0.72rem/1.35 var(--barnum-sans);
	}

	.meta button {
		min-height: 2.75rem;
		border: 0;
		background: transparent;
		padding: 0.4rem 0;
		text-decoration: underline;
		text-underline-offset: 0.16em;
		cursor: pointer;
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
