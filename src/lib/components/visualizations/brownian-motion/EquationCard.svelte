<script lang="ts">
	type Props = {
		label: string;
		equation: string;
		interpretation: string;
		watch: string;
	};

	let { label, equation, interpretation, watch }: Props = $props();
</script>

<aside class="equation-card" aria-label={`${label} equation and interpretation`}>
	<p class="label">CURRENT MODEL</p>
	<h3>{label}</h3>
	<code aria-label={`Plain-text equation: ${equation}`}>{equation}</code>
	<p>{interpretation}</p>
	<div class="watch"><strong>What to watch</strong><span>{watch}</span></div>
</aside>

<style>
	.equation-card {
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--paper, #f7f2e8) 96%, var(--lab-rust, #9b5f48));
		padding: 1rem;
	}
	.label {
		margin: 0;
		color: var(--lab-rust, #9b5f48);
		font:
			700 0.65rem 'Courier Prime',
			monospace;
		letter-spacing: 0.12em;
	}
	h3 {
		margin: 0.35rem 0 0.65rem;
		font-size: 1.05rem;
	}
	code {
		display: block;
		overflow-x: auto;
		border: 1px solid color-mix(in srgb, var(--rule, #c8c1b2) 75%, transparent);
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--paper-soft, #ece6da) 75%, transparent);
		padding: 0.7rem;
		color: var(--ink, #242a32);
		font:
			0.78rem/1.5 'Courier Prime',
			monospace;
		white-space: pre-wrap;
	}
	p,
	.watch span {
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.86rem;
		line-height: 1.5;
	}
	.watch {
		display: grid;
		gap: 0.25rem;
		border-top: 1px solid var(--rule, #c8c1b2);
		padding-top: 0.7rem;
	}
	.watch strong {
		font-size: 0.72rem;
		text-transform: uppercase;
	}
</style>
