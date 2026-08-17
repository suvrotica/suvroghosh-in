<script lang="ts">
	import ReadingCard from './ReadingCard.svelte';
	import type { AuditEventView, ReadingStatement } from './ui-types';

	let {
		statements,
		events = []
	}: {
		statements: readonly ReadingStatement[];
		events?: readonly AuditEventView[];
	} = $props();
</script>

<details class="audit" data-testid="statement-audit">
	<summary>
		<span>Inspect all statements</span>
		<small>{statements.length} statements · {events.length} immutable timeline events</small>
	</summary>
	<div class="audit-body">
		<section aria-labelledby="statement-audit-heading">
			<h3 id="statement-audit-heading">Statement provenance</h3>
			<div class="cards">
				{#each statements as statement, index (statement.id)}
					<ReadingCard {statement} index={index + 1} reveal showRating={false} />
				{/each}
			</div>
		</section>

		{#if events.length}
			<section aria-labelledby="event-audit-heading">
				<h3 id="event-audit-heading">Append-only event trail</h3>
				<ol class="events">
					{#each events as event (event.id)}
						<li>
							<span>{String(event.sequence).padStart(2, '0')}</span>
							<div>
								<strong>{event.label}</strong>
								<p>{event.detail}</p>
								<dl class="event-meta">
									<div>
										<dt>Event</dt>
										<dd><code>{event.id}</code></dd>
									</div>
									<div>
										<dt>Timestamp</dt>
										<dd>{event.timestamp || 'Not recorded'}</dd>
									</div>
									<div>
										<dt>Branch</dt>
										<dd><code>{event.branchId}</code></dd>
									</div>
									{#if event.parentBranchId}
										<div>
											<dt>Parent branch</dt>
											<dd><code>{event.parentBranchId}</code></dd>
										</div>
									{/if}
									<div>
										<dt>Causal events</dt>
										<dd>
											{event.causalEventIds.length ? event.causalEventIds.join(', ') : 'None'}
										</dd>
									</div>
								</dl>
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	</div>
</details>

<style>
	.audit {
		border: 1px solid var(--barnum-rule);
		border-radius: 0.5rem;
		background: var(--barnum-raised);
	}

	.audit > summary {
		display: grid;
		min-height: 3.25rem;
		align-content: center;
		gap: 0.12rem;
		padding: 0.65rem 0.8rem;
		cursor: pointer;
	}

	.audit > summary:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.audit > summary span {
		font: 780 0.76rem/1.25 var(--barnum-sans);
	}

	.audit > summary small {
		color: var(--barnum-muted);
		font: 0.7rem/1.4 var(--barnum-sans);
	}

	.audit-body {
		display: grid;
		gap: 1rem;
		border-top: 1px solid var(--barnum-rule);
		padding: 0.8rem;
	}

	h3 {
		margin: 0 0 0.55rem;
		font: 780 0.8rem/1.25 var(--barnum-sans);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.events {
		display: grid;
		gap: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.events li {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		gap: 0.55rem;
		border-top: 1px dotted var(--barnum-rule);
		padding: 0.52rem 0;
	}

	.events li > span {
		font: 750 0.7rem/1.45 var(--barnum-mono);
		color: var(--barnum-muted);
	}

	.events strong,
	.events p {
		display: block;
		margin: 0;
	}

	.events strong {
		font: 760 0.75rem/1.4 var(--barnum-sans);
	}

	.events p {
		margin-top: 0.12rem;
		color: var(--barnum-muted);
		font: 0.7rem/1.45 var(--barnum-sans);
	}

	.event-meta {
		display: grid;
		gap: 0.15rem;
		margin: 0.4rem 0 0;
		border-left: 2px solid var(--barnum-rule);
		padding-left: 0.5rem;
	}

	.event-meta > div {
		display: grid;
		grid-template-columns: minmax(5.5rem, 0.3fr) minmax(0, 1fr);
		gap: 0.45rem;
	}

	.event-meta dt,
	.event-meta dd {
		margin: 0;
		font: 0.7rem/1.45 var(--barnum-sans);
		overflow-wrap: anywhere;
	}

	.event-meta dt {
		font-weight: 750;
		color: var(--barnum-muted);
	}

	.event-meta code {
		font: inherit;
	}

	@media (max-width: 48rem) {
		.cards {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.audit,
		.audit-body,
		.events li {
			border-color: CanvasText;
		}
	}
</style>
