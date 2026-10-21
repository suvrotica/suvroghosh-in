<script lang="ts">
	let {
		analytics = false,
		media = false,
		small = false
	}: {
		analytics?: boolean;
		media?: boolean;
		small?: boolean;
	} = $props();
</script>

<div class="choice-receipt" class:small aria-hidden="true">
	<svg viewBox="0 0 190 172" fill="none">
		<path
			class="receipt-paper"
			d="M19 7h152v151l-8 7-9-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7-10-7-9 7-8-7V7Z"
		/>
		<path class="rule" d="M32 42h126M32 116h126M32 139h55" />
		<text x="32" y="29" class="receipt-heading">FIELD NOTES / 01</text>
		<text x="32" y="65">Essential</text>
		<text x="32" y="86">Measurement</text>
		<text x="32" y="107">External media</text>
		<path class="mark" d="m139 59 4 4 8-9" />
		{#if analytics}<path class="mark" d="m139 80 4 4 8-9" />{:else}<path
				class="off"
				d="M139 80h12"
			/>{/if}
		{#if media}<path class="mark" d="m139 101 4 4 8-9" />{:else}<path
				class="off"
				d="M139 101h12"
			/>{/if}
		<text x="32" y="131" class="receipt-foot">YOURS TO CHOOSE.</text>
		<path class="signature" d="m106 142 6-13-2 14 9-8-2 7 11-4m-5-8-4 16m8-11 4 9 6-11" />
	</svg>
</div>

<style>
	.choice-receipt {
		width: 11rem;
		transform: rotate(5deg);
		color: var(--ink-muted);
		filter: drop-shadow(1px 6px 4px rgb(0 0 0 / 7%));
	}
	.choice-receipt.small {
		width: 5rem;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.receipt-paper {
		fill: var(--paper);
		stroke: var(--control-border);
		stroke-width: 0.7;
	}
	.rule {
		stroke: var(--rule);
		stroke-width: 0.8;
	}
	text {
		font: 9px var(--font-mono, monospace);
		fill: currentColor;
	}
	.receipt-heading {
		font-size: 8px;
		letter-spacing: 0.7px;
	}
	.receipt-foot {
		font-size: 7px;
		letter-spacing: 0.55px;
	}
	.mark,
	.signature {
		stroke: var(--accent);
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.off {
		stroke: var(--ink-faint);
		stroke-width: 1.1;
	}
	:global([data-theme='high-contrast']) .receipt-paper {
		stroke-width: 1.5;
	}
</style>
