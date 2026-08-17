<script lang="ts">
	import type { FitRating as FitRatingValue } from './ui-types';

	const OPTIONS: readonly {
		id: Exclude<FitRatingValue, 'unrated'>;
		label: string;
		mark: string;
	}[] = [
		{ id: 'does-not-fit', label: 'Does not fit', mark: '−' },
		{ id: 'partly-fits', label: 'Partly fits', mark: '≈' },
		{ id: 'fits', label: 'Fits', mark: '●' },
		{ id: 'too-vague', label: 'Too vague to test', mark: '?' }
	];

	let {
		name,
		value = 'unrated',
		legend = 'How well does this statement fit?',
		disabled = false,
		onchange
	}: {
		name: string;
		value?: FitRatingValue;
		legend?: string;
		disabled?: boolean;
		onchange: (rating: FitRatingValue) => void;
	} = $props();
</script>

<fieldset class="rating" {disabled}>
	<legend>{legend}</legend>
	<div class="rating-grid">
		{#each OPTIONS as option (option.id)}
			<label>
				<input
					type="radio"
					{name}
					value={option.id}
					checked={value === option.id}
					onchange={() => onchange(option.id)}
				/>
				<span class="mark" aria-hidden="true">{option.mark}</span>
				<span>{option.label}</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.rating {
		min-width: 0;
		margin: 0;
		border: 0;
		padding: 0;
	}

	legend {
		margin-bottom: 0.42rem;
		padding: 0;
		color: var(--barnum-muted);
		font: 700 0.75rem/1.4 var(--barnum-sans);
	}

	.rating-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.38rem;
	}

	label {
		position: relative;
		display: flex;
		min-width: 0;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.42rem;
		border: 1px solid var(--barnum-control);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.42rem 0.5rem;
		color: var(--barnum-ink);
		font: 700 0.75rem/1.3 var(--barnum-sans);
		cursor: pointer;
	}

	label:has(input:checked) {
		border-color: var(--barnum-blue);
		box-shadow: inset 0 0 0 1px var(--barnum-blue);
	}

	input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		opacity: 0;
	}

	label:has(input:focus-visible) {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.mark {
		display: grid;
		width: 1.35rem;
		height: 1.35rem;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid currentColor;
		border-radius: 50%;
		font: 750 0.72rem/1 var(--barnum-mono);
	}

	fieldset:disabled label {
		cursor: default;
		opacity: 0.72;
	}

	@media (max-width: 24rem) {
		.rating-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		label:has(input:checked) {
			outline: 3px solid Highlight;
			outline-offset: -4px;
		}
	}
</style>
