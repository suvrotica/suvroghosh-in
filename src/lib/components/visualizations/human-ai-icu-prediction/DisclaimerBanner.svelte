<script lang="ts">
	let { disclaimer }: { disclaimer: string } = $props();
	let disclaimerBody = $derived(disclaimer.replace(/^Educational simulation only\.\s*/, ''));
</script>

<aside
	class="disclaimer"
	role="note"
	aria-labelledby="icu-disclaimer-heading"
	data-testid="icu-educational-disclaimer"
>
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M12 3 2.8 20h18.4L12 3Z" />
		<path d="M12 8.2v5.9M12 17.2v.1" />
	</svg>
	<div>
		<strong id="icu-disclaimer-heading">Educational simulation only.</strong>
		<span>{disclaimerBody}</span>
	</div>
</aside>

<style>
	.disclaimer {
		display: grid;
		grid-template-columns: 1.35rem minmax(0, 1fr);
		gap: 0.7rem;
		align-items: start;
		border: 1px solid var(--icu-rule, var(--rule));
		border-left: 4px solid var(--icu-model, #c46b22);
		border-radius: 0.55rem;
		background: color-mix(
			in oklab,
			var(--icu-model, #c46b22) 7%,
			var(--icu-raised, var(--paper-raised))
		);
		padding: 0.75rem 0.85rem;
		color: var(--icu-ink, var(--ink));
	}

	svg {
		display: block;
		width: 1.35rem;
		height: 1.35rem;
		margin-top: 0.05rem;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.7;
	}

	div {
		min-width: 0;
		font: 0.78rem/1.5 var(--icu-sans, var(--font-sans, sans-serif));
	}

	strong,
	span {
		display: inline;
	}

	strong {
		margin-right: 0.28rem;
	}

	span {
		color: var(--icu-muted, var(--ink-muted));
	}

	@media (forced-colors: active) {
		.disclaimer {
			border-color: CanvasText;
		}
	}
</style>
