<script lang="ts">
	import type { UiPerspectiveId } from './ui-types';

	type Props = {
		value: UiPerspectiveId;
		name?: string;
		disabled?: boolean;
		onchange?: (value: UiPerspectiveId) => void;
	};

	let {
		value,
		name = 'prior-authorization-perspective',
		disabled = false,
		onchange
	}: Props = $props();

	const perspectives: Array<{ id: UiPerspectiveId; label: string }> = [
		{ id: 'patient', label: 'Patient' },
		{ id: 'clinician', label: 'Clinician' },
		{ id: 'architect', label: 'Architect' }
	];
</script>

<fieldset class="perspective-selector">
	<legend>Perspective</legend>
	{#each perspectives as perspective}
		<label>
			<input
				type="radio"
				{name}
				value={perspective.id}
				checked={value === perspective.id}
				{disabled}
				onchange={() => onchange?.(perspective.id)}
			/>
			<span>{perspective.label}</span>
		</label>
	{/each}
</fieldset>

<style>
	.perspective-selector {
		display: inline-grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		min-width: min(100%, 19rem);
		margin: 0;
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: var(--paper);
		padding: 0.18rem;
	}

	legend {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		border: 0;
		padding: 0;
		clip-path: inset(50%);
	}

	label {
		position: relative;
		isolation: isolate;
	}

	input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		border: 0;
		padding: 0;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
	}

	span {
		position: relative;
		z-index: 1;
		display: grid;
		min-height: 2.75rem;
		place-items: center;
		border-radius: 999px;
		background: transparent;
		padding: 0.45rem 0.7rem;
		font: 740 0.78rem/1 var(--font-sans, sans-serif);
		color: var(--ink-muted);
		cursor: pointer;
	}

	input:checked + span {
		background: var(--ink);
		color: var(--paper);
	}

	input:disabled + span {
		cursor: not-allowed;
		opacity: 0.58;
	}

	input:focus-visible + span {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	@media (forced-colors: active) {
		.perspective-selector {
			border-color: CanvasText;
			background: Canvas;
		}

		input {
			-webkit-appearance: none;
			appearance: none;
			forced-color-adjust: none;
		}

		span {
			border: 1px solid transparent;
			background: Canvas;
			color: CanvasText;
			forced-color-adjust: none;
		}

		input:checked + span {
			border-color: CanvasText;
			background: Highlight;
			color: HighlightText;
			outline: 2px solid CanvasText;
			outline-offset: -4px;
		}

		input:focus-visible + span {
			outline-color: Highlight;
		}
	}
</style>
