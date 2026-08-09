<script lang="ts">
	import type { UiPathwayId } from './ui-types';

	type Props = {
		value: UiPathwayId;
		name?: string;
		disabled?: boolean;
		onchange?: (value: UiPathwayId) => void;
	};

	let { value, name = 'prior-authorization-pathway', disabled = false, onchange }: Props = $props();

	const pathways: Array<{ id: UiPathwayId; label: string; detail: string }> = [
		{
			id: 'portal-fax',
			label: 'Portal and fax',
			detail: 'Manual discovery, re-keying, inboxes and transport queues'
		},
		{
			id: 'fhir-enabled',
			label: 'FHIR-enabled',
			detail: 'CRD → DTR → PAS patterns, with the same facts and policy'
		}
	];
</script>

<fieldset class="pathway-selector" data-testid="pathway-selector">
	<legend>Choose a pathway</legend>
	<div class="options">
		{#each pathways as pathway}
			<label class:checked={value === pathway.id}>
				<input
					type="radio"
					{name}
					value={pathway.id}
					checked={value === pathway.id}
					{disabled}
					onchange={() => onchange?.(pathway.id)}
				/>
				<span>
					<strong>{pathway.label}</strong>
					<small>{pathway.detail}</small>
				</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.pathway-selector {
		min-width: 0;
		margin: 0;
		border: 0;
		padding: 0;
	}

	legend {
		margin-bottom: 0.45rem;
		font: 760 0.72rem/1.2 var(--font-sans, sans-serif);
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	label {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		min-height: 4.2rem;
		align-items: start;
		gap: 0.55rem;
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: 0.7rem;
		cursor: pointer;
	}

	label.checked {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	input {
		width: 1.1rem;
		height: 1.1rem;
		margin: 0.12rem 0 0;
		accent-color: var(--accent);
	}

	input:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 4px;
	}

	span {
		display: grid;
		gap: 0.2rem;
	}

	strong {
		font: 760 0.85rem/1.2 var(--font-sans, sans-serif);
		color: var(--ink);
	}

	small {
		font: 0.7rem/1.4 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	input:disabled + span,
	label:has(input:disabled) {
		cursor: not-allowed;
		opacity: 0.62;
	}

	@media (max-width: 35rem) {
		.options {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		label,
		label.checked {
			border-color: CanvasText;
		}

		label.checked {
			outline: 3px solid Highlight;
			outline-offset: -4px;
		}
	}
</style>
