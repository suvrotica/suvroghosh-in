<script lang="ts">
	import type { UiFailure } from './ui-types';

	type Props = {
		failures: UiFailure[];
		value: string;
		disabled?: boolean;
		onchange?: (failureId: string) => void;
	};

	let { failures, value, disabled = false, onchange }: Props = $props();
	let selected = $derived(failures.find((failure) => failure.id === value));
</script>

<section class="failure-panel" aria-labelledby="failure-panel-heading">
	<div class="panel-heading">
		<div>
			<p>Exception paths</p>
			<h2 id="failure-panel-heading">What broke?</h2>
		</div>
		<span>One deterministic failure at a time</span>
	</div>

	<div class="failure-options" role="group" aria-label="Failure fixture">
		<button
			type="button"
			{disabled}
			aria-pressed={value === 'none'}
			class:active={value === 'none'}
			onclick={() => onchange?.('none')}
		>
			<span aria-hidden="true">✓</span>
			<strong>Baseline</strong>
			<small>Nothing injected</small>
		</button>
		{#each failures as failure, index (failure.id)}
			<button
				type="button"
				{disabled}
				aria-pressed={value === failure.id}
				class:active={value === failure.id}
				onclick={() => onchange?.(failure.id)}
				data-failure-id={failure.id}
			>
				<span aria-hidden="true">{String.fromCharCode(65 + index)}</span>
				<strong>{failure.shortLabel}</strong>
				<small>{failure.triggerLabel}</small>
			</button>
		{/each}
	</div>

	{#if selected}
		<article
			class="failure-inspector"
			data-selected-failure={selected.id}
			data-authorization-status={selected.authorizationStatus}
			data-final-outcome={selected.expectedOutcome}
		>
			<div class="status-pair">
				<span><small>Technical status</small><strong>{selected.technicalStatus}</strong></span>
				<span><small>Business status</small><strong>{selected.businessStatus}</strong></span>
				<span
					><small>Authorization status</small><strong>{selected.authorizationStatus}</strong></span
				>
				<span><small>Final outcome</small><strong>{selected.expectedOutcome}</strong></span>
			</div>
			<div class="answers">
				<section>
					<h3>What broke?</h3>
					<p>{selected.whatBroke}</p>
				</section>
				<section>
					<h3>What did the system do?</h3>
					<p>{selected.systemResponse}</p>
				</section>
				<section>
					<h3>What did Maya experience?</h3>
					<p>{selected.patientConsequence}</p>
				</section>
			</div>
			<p class="next-action"><strong>Realistic next action:</strong> {selected.nextAction}</p>
		</article>
	{:else}
		<p class="baseline-note">
			The baseline keeps all declared synthetic facts intact. Choose an exception to recompile the
			ledger and trace every downstream event it causes.
		</p>
	{/if}
</section>

<style>
	.failure-panel {
		display: grid;
		gap: 0.75rem;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-raised);
		padding: 0.8rem;
		color: var(--ink);
	}

	.panel-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.panel-heading p,
	.panel-heading h2,
	.panel-heading > span,
	.baseline-note,
	.next-action,
	.answers h3,
	.answers p {
		margin: 0;
	}

	.panel-heading p {
		font: 760 0.61rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.panel-heading h2 {
		font: 780 1.15rem/1.1 var(--font-sans, sans-serif);
	}

	.panel-heading > span,
	.baseline-note,
	.next-action,
	.answers p {
		font: 0.7rem/1.45 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.failure-options {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.failure-options button {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		min-height: 4.4rem;
		align-content: center;
		column-gap: 0.45rem;
		border: 1px solid var(--rule);
		border-radius: 0.55rem;
		background: var(--paper);
		padding: 0.55rem;
		text-align: left;
		color: var(--ink);
		cursor: pointer;
	}

	.failure-options button.active {
		border-color: #9f4a43;
		box-shadow: inset 0 -3px 0 #9f4a43;
	}

	.failure-options button:disabled {
		cursor: not-allowed;
		opacity: 0.58;
	}

	.failure-options button > span {
		display: grid;
		grid-row: 1 / 3;
		width: 1.65rem;
		height: 1.65rem;
		place-items: center;
		align-self: center;
		border: 1px solid currentColor;
		border-radius: 0.3rem;
		font: 800 0.68rem/1 var(--font-mono, ui-monospace, monospace);
	}

	.failure-options strong {
		font: 740 0.7rem/1.2 var(--font-sans, sans-serif);
	}

	.failure-options small {
		font: 0.6rem/1.3 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	button:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.failure-inspector {
		display: grid;
		gap: 0.7rem;
		border: 1px dashed #9f4a43;
		border-radius: 0.6rem;
		padding: 0.75rem;
	}

	.status-pair,
	.answers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.status-pair span {
		display: grid;
		gap: 0.12rem;
		border: 1px solid var(--rule);
		border-radius: 0.4rem;
		padding: 0.5rem;
	}

	.status-pair small {
		font: 720 0.57rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.status-pair strong {
		font: 740 0.7rem/1.25 var(--font-sans, sans-serif);
	}

	.answers {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.answers section {
		border-left: 3px solid #9f4a43;
		padding-left: 0.55rem;
	}

	.answers h3 {
		font: 750 0.72rem/1.25 var(--font-sans, sans-serif);
	}

	.answers p {
		margin-top: 0.25rem;
	}

	.next-action {
		border-top: 1px solid var(--rule);
		padding-top: 0.55rem;
		color: var(--ink);
	}

	@media (max-width: 60rem) {
		.failure-options {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.answers {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 34rem) {
		.panel-heading,
		.status-pair {
			grid-template-columns: 1fr;
		}

		.panel-heading {
			display: grid;
		}

		.failure-options {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.failure-panel,
		.failure-options button,
		.failure-inspector,
		.status-pair span {
			border-color: CanvasText;
		}

		.failure-options button.active {
			outline: 3px solid Highlight;
			outline-offset: -3px;
		}
	}
</style>
